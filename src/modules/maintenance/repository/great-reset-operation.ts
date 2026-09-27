import type { PrismaClient } from "@prisma/client";
import {
  drainBlockers,
  GREAT_RESET_PRODUCTION_RESTORE_ACTION,
  runtimePausedBlockers,
} from "./great-reset";
import { GREAT_RESET_INTENT_SCOPE } from "./great-reset-namespace";
import {
  compareReceipts,
  computeReceipt,
  type GreatResetReceipt,
  type ReceiptIdentity,
} from "./great-reset-receipt";

/*
  Great reset operasyon adımlarının DB tarafı (tasarım v20 madde 2–4). A5 reset modu bunları
  onaylı release içindeki CLI ile, her adımda aynı doğrulanmış hedefe çağırır:

  - Niyet: reset-anı yedeğinden ÖNCE yazılır, en çok iki saat geçerlidir. İkinci reset yasağı
    (commit, trafik olayı veya restore audit'i) ya da açık başka niyet varsa yazılmaz.
  - Niyet geçersizleştirme: yalnız `invalidatedAt`, yalnız tüketilmemiş ve açık niyette.
  - Trafik açılış olayı: aynı operasyonun commit satırı varken, idempotent tek satır.
  - Restore uygunluğu: dış kayıttan bağımsız, canonical DB'de makineyle çalışan ret denetimi.

  Çıktıda satır içeriği, credential veya URL yoktur; hatalar güvenli koddur.
*/

export type OperationIdentity = ReceiptIdentity & { databaseName: string };

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const newNamespaceStart = 2147483648n;

function fail(code: string): never {
  throw new Error(`GREAT_RESET_${code}`);
}

async function assertIdentity(tx: Tx, expected: OperationIdentity): Promise<void> {
  const [actual] = await tx.$queryRaw<
    {
      database: string;
      owner: string;
      user: string;
      cluster: string;
      version: number;
      marker: string | null;
    }[]
  >`
    SELECT current_database() AS database, pg_get_userbyid(d.datdba) AS owner,
      current_user AS user, current_setting('server_version_num')::int AS version,
      (SELECT system_identifier::text FROM pg_control_system()) AS cluster,
      shobj_description(d.oid, 'pg_database') AS marker
    FROM pg_database d WHERE d.datname = current_database()`;
  if (
    !actual ||
    actual.database !== expected.databaseName ||
    actual.owner !== expected.owner ||
    actual.user !== expected.owner ||
    actual.cluster !== expected.clusterId ||
    actual.version < 160000 ||
    actual.version >= 170000 ||
    // Yerel prova hedefinde sentetik işaret yazmalardan önce de şarttır (Astra, PR #238 P2).
    (expected.marker !== undefined && actual.marker !== expected.marker)
  )
    fail("DATABASE_IDENTITY_MISMATCH");
}

async function secondResetBlockers(tx: Tx): Promise<string[]> {
  const [row] = await tx.$queryRaw<{ commits: number; exposures: number; restores: number }[]>`
    SELECT (SELECT count(*)::int FROM great_reset_commits) AS commits,
      (SELECT count(*)::int FROM great_reset_exposure_events) AS exposures,
      (SELECT count(*)::int FROM audit_logs WHERE action = ${GREAT_RESET_PRODUCTION_RESTORE_ACTION})
        AS restores`;
  const result: string[] = [];
  if (row?.commits !== 0) result.push("COMMIT_PRESENT");
  if (row?.exposures !== 0) result.push("EXPOSURE_PRESENT");
  if (row?.restores !== 0) result.push("RESTORE_AUDIT_PRESENT");
  return result;
}

export async function createIntent(
  database: PrismaClient,
  identity: OperationIdentity,
  operationId: string,
  releaseSha: string,
): Promise<{ operationId: string; expiresAt: string }> {
  if (!uuid.test(operationId) || !/^[a-f0-9]{40}$/u.test(releaseSha)) fail("INVALID_ARGUMENTS");
  return database.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      await tx.$executeRaw`SET LOCAL statement_timeout = '30s'`;
      await assertIdentity(tx, identity);
      // Aynı anda iki niyet yazıcısı yarışmasın: tabloyu yazmaya karşı kilitle.
      await tx.$executeRaw`LOCK TABLE great_reset_intents IN SHARE ROW EXCLUSIVE MODE`;
      if ((await secondResetBlockers(tx)).length) fail("INTENT_BLOCKED");
      const [open] = await tx.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int AS count FROM great_reset_intents
        WHERE "consumedAt" IS NULL AND "invalidatedAt" IS NULL AND "expiresAt" > CURRENT_TIMESTAMP`;
      if (open?.count !== 0) fail("INTENT_BLOCKED");
      const [created] = await tx.$queryRaw<{ expiresAt: Date }[]>`
        INSERT INTO great_reset_intents ("operationId", scope, "releaseSha", "createdAt", "expiresAt")
        VALUES (${operationId}::uuid, ${GREAT_RESET_INTENT_SCOPE}, ${releaseSha},
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '2 hours')
        RETURNING "expiresAt"`;
      if (!created) fail("INTENT_NOT_WRITTEN");
      return { operationId, expiresAt: created.expiresAt.toISOString() };
    },
    { timeout: 60_000, maxWait: 5_000 },
  );
}

export async function invalidateIntent(
  database: PrismaClient,
  identity: OperationIdentity,
  operationId: string,
): Promise<{ operationId: string; invalidated: true }> {
  if (!uuid.test(operationId)) fail("INVALID_ARGUMENTS");
  return database.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      await assertIdentity(tx, identity);
      const rows = await tx.$executeRaw`
        UPDATE great_reset_intents SET "invalidatedAt" = CURRENT_TIMESTAMP
        WHERE "operationId" = ${operationId}::uuid
          AND "consumedAt" IS NULL AND "invalidatedAt" IS NULL`;
      if (rows !== 1) fail("INTENT_NOT_INVALIDATED");
      return { operationId, invalidated: true as const };
    },
    { timeout: 60_000, maxWait: 5_000 },
  );
}

/**
 * Trafik açılış olayı. Dış kayıt `TRAFFIC_OPEN`'a geçtikten SONRA yazılır; aynı operasyonun commit
 * satırı yoksa yazılmaz. Satır zaten varsa aynısını okur (idempotent yeniden deneme); başka
 * operasyonun olayı varsa durur.
 */
export async function recordTrafficOpen(
  database: PrismaClient,
  identity: OperationIdentity,
  operationId: string,
): Promise<{ operationId: string; trafficOpen: true }> {
  if (!uuid.test(operationId)) fail("INVALID_ARGUMENTS");
  return database.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      await assertIdentity(tx, identity);
      const [state] = await tx.$queryRaw<{ commits: number; mine: number; others: number }[]>`
        SELECT (SELECT count(*)::int FROM great_reset_commits
                WHERE "operationId" = ${operationId}::uuid) AS commits,
          (SELECT count(*)::int FROM great_reset_exposure_events
           WHERE "operationId" = ${operationId}::uuid) AS mine,
          (SELECT count(*)::int FROM great_reset_exposure_events
           WHERE "operationId" <> ${operationId}::uuid) AS others`;
      if (state?.commits !== 1) fail("TRAFFIC_OPEN_WITHOUT_COMMIT");
      if (state.others !== 0) fail("TRAFFIC_OPEN_OTHER_OPERATION");
      if (state.mine === 0)
        await tx.$executeRaw`
          INSERT INTO great_reset_exposure_events ("operationId", "eventType")
          VALUES (${operationId}::uuid, 'TRAFFIC_OPEN')
          ON CONFLICT ("operationId") DO NOTHING`;
      const [after] = await tx.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int AS count FROM great_reset_exposure_events
        WHERE "operationId" = ${operationId}::uuid AND "eventType" = 'TRAFFIC_OPEN'`;
      if (after?.count !== 1) fail("TRAFFIC_OPEN_NOT_WRITTEN");
      return { operationId, trafficOpen: true as const };
    },
    { timeout: 60_000, maxWait: 5_000 },
  );
}

/**
 * Restore uygunluğunun DB tarafı (tasarım v20 madde 4). Boş liste uygun demektir; dış kayıt
 * denetimi ayrıca geçmelidir. Makbuz, reset sonrası (COMMITTED_MAINTENANCE anında) alınan
 * makbuzla hiçbir izinli fark olmadan eşit olmalıdır: iç kabulde ya da sonrasında herhangi bir
 * yazı restore'u reddeder.
 */
export async function restoreEligibility(
  database: PrismaClient,
  identity: OperationIdentity,
  operationId: string,
  postResetReceipt: GreatResetReceipt,
): Promise<string[]> {
  if (!uuid.test(operationId)) fail("INVALID_ARGUMENTS");
  const blockers = await database.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      await assertIdentity(tx, identity);
      const [row] = await tx.$queryRaw<
        {
          mine: number;
          commits: number;
          exposures: number;
          restores: number;
          newEntries: number;
          newTopics: number;
          entrySequence: string | null;
          entryCalled: boolean | null;
          topicSequence: string | null;
          topicCalled: boolean | null;
        }[]
      >`
        SELECT
          (SELECT count(*)::int FROM great_reset_commits
           WHERE "operationId" = ${operationId}::uuid) AS mine,
          (SELECT count(*)::int FROM great_reset_commits) AS commits,
          (SELECT count(*)::int FROM great_reset_exposure_events) AS exposures,
          (SELECT count(*)::int FROM audit_logs
           WHERE action = ${GREAT_RESET_PRODUCTION_RESTORE_ACTION}) AS restores,
          (SELECT count(*)::int FROM entries WHERE "publicId" >= ${newNamespaceStart}) AS "newEntries",
          (SELECT count(*)::int FROM topics WHERE "publicId" >= ${newNamespaceStart}) AS "newTopics",
          (SELECT last_value::text FROM entries_public_id_seq) AS "entrySequence",
          (SELECT is_called FROM entries_public_id_seq) AS "entryCalled",
          (SELECT last_value::text FROM topics_public_id_seq) AS "topicSequence",
          (SELECT is_called FROM topics_public_id_seq) AS "topicCalled"`;
      const result: string[] = [];
      if (!row) return ["STATE_UNAVAILABLE"];
      if (row.mine !== 1 || row.commits !== 1) result.push("COMMIT_MISMATCH");
      if (row.exposures !== 0) result.push("EXPOSURE_PRESENT");
      if (row.restores !== 0) result.push("RESTORE_AUDIT_PRESENT");
      if (row.newEntries !== 0 || row.newTopics !== 0) result.push("NEW_NAMESPACE_CONTENT");
      // NULL veya eksik değer fail-closed: yalnız açıkça `2147483648, false` uygundur.
      if (
        row.entrySequence !== "2147483648" ||
        row.entryCalled !== false ||
        row.topicSequence !== "2147483648" ||
        row.topicCalled !== false
      )
        result.push("SEQUENCE_CONSUMED");
      return result;
    },
    { isolationLevel: "RepeatableRead", timeout: 60_000, maxWait: 5_000 },
  );
  const current = await computeReceipt(database, identity);
  if (!compareReceipts(postResetReceipt, current).equal) blockers.push("RECEIPT_CHANGED");
  return blockers;
}

/**
 * Boşaltma denetimi (Astra, reset boşaltma kararı): dört bayrak kapalı ve reset önkoşuluyla AYNI
 * koşu/kira/runtime state sorguları boş. Salt okunur, kimlik doğrulanmış tek transaction. Uzak
 * betik bunu kesinti başlamadan önce ve dondurmadan hemen sonra çağırır.
 */
export async function drainStatus(
  database: PrismaClient,
  identity: OperationIdentity,
): Promise<{ ready: boolean; blockers: string[] }> {
  const blockers = await database.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      await assertIdentity(tx, identity);
      return [...(await runtimePausedBlockers(tx)), ...(await drainBlockers(tx))];
    },
    { isolationLevel: "RepeatableRead", timeout: 30_000, maxWait: 5_000 },
  );
  return { ready: blockers.length === 0, blockers };
}

/** Hedef kimliği, ilk mutasyondan ÖNCE ve aynı istemciyle (operatör bayrak/boşaltma CLI'leri). */
export async function assertOperationTarget(
  database: PrismaClient,
  identity: OperationIdentity,
): Promise<void> {
  await database.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      await assertIdentity(tx, identity);
    },
    { timeout: 30_000, maxWait: 5_000 },
  );
}
