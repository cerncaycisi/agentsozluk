import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { GREAT_RESET_PRODUCTION_RESTORE_ACTION } from "./great-reset";
import type { OperationIdentity } from "./great-reset-operation";
import {
  shadowMarkedTables,
  tableDigest,
  type GreatResetReceipt,
  type ShadowMarkedDigests,
} from "./great-reset-receipt";

/*
  Great reset geri dönüş dalı (runbook "Hata ve geri dönüş dalları", COMMIT sonrası kabul hatası;
  tasarım v20 madde 7). Yalnız dış kayıt COMMITTED_MAINTENANCE iken, TRAFFIC_OPEN'dan önce ve ayrı
  Gökhan onayıyla. Reset-anı yedeği yeni bir GÖLGE DB'ye restore edilir; bu modül gölgede
  geçerli niyetleri geçersizleştirir, canonical commit satırının özetini taşıyan restore audit'ini
  yazar ve gölgeyi/yeni canonical'ı doğrular. DB oluşturma, kapılar ve yeniden adlandırma yönetici
  konsolundadır (bash). Çıktıda satır içeriği yoktur.
*/

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const sha64 = /^[0-9a-f]{64}$/u;

function fail(code: string): never {
  throw new Error(`GREAT_RESET_${code}`);
}

async function assertIdentity(tx: Tx, expected: OperationIdentity): Promise<void> {
  const [actual] = await tx.$queryRaw<
    { database: string; owner: string; user: string; cluster: string; marker: string | null }[]
  >`
    SELECT current_database() AS database, pg_get_userbyid(d.datdba) AS owner,
      current_user AS user,
      (SELECT system_identifier::text FROM pg_control_system()) AS cluster,
      shobj_description(d.oid, 'pg_database') AS marker
    FROM pg_database d WHERE d.datname = current_database()`;
  if (
    !actual ||
    actual.database !== expected.databaseName ||
    actual.owner !== expected.owner ||
    actual.user !== expected.owner ||
    actual.cluster !== expected.clusterId ||
    (expected.marker !== undefined && actual.marker !== expected.marker)
  )
    fail("DATABASE_IDENTITY_MISMATCH");
}

/** Canonical DB'deki bu operasyonun commit satırının özeti (restore audit'ine bağlanır). */
export async function commitDigest(
  database: PrismaClient,
  identity: OperationIdentity,
  operationId: string,
): Promise<string> {
  if (!uuid.test(operationId)) fail("INVALID_ARGUMENTS");
  return database.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      await assertIdentity(tx, identity);
      const rows = await tx.$queryRaw<{ row: string }[]>`
        SELECT to_jsonb(c)::text AS row FROM great_reset_commits c`;
      if (rows.length !== 1) fail("RESTORE_COMMIT_MISMATCH");
      const row = JSON.parse(rows[0]!.row) as { operationId?: string };
      if (row.operationId !== operationId) fail("RESTORE_COMMIT_MISMATCH");
      return createHash("sha256").update(rows[0]!.row).digest("hex");
    },
    { isolationLevel: "RepeatableRead", timeout: 60_000, maxWait: 5_000 },
  );
}

/**
 * Gölgeyi işaretler: geçerli (tüketilmemiş, geçersizleştirilmemiş) bütün niyetlere yalnız
 * `invalidatedAt` yazılır; restore audit'i operasyon, dump SHA'sı ve canonical commit özetini taşır.
 * Gölgede commit satırı olmamalıdır (yedek reset öncesidir). Yeniden girişte aynı audit varsa
 * yeniden yazılmaz.
 */
/*
  İzinli dönüşümün kendisi kanıtlanır (Astra, PR #242 P1): aynı transaction'da önce/sonra
  niyetlerin `invalidatedAt` dışındaki bütün alanları ve audit tablosunun yeni restore satırı
  hariç tamamı birebir aynı olmalı; yalnız önceden açık olan niyetler değişmeli.
*/
async function intentsDigest(tx: Tx): Promise<string> {
  const [row] = await tx.$queryRaw<{ digest: string }[]>`
    SELECT encode(sha256(convert_to(coalesce(string_agg(
      (to_jsonb(i) - 'invalidatedAt')::text, '|' ORDER BY i."operationId"), ''), 'UTF8')), 'hex')
      AS digest FROM great_reset_intents i`;
  return row!.digest;
}

async function auditDigest(tx: Tx, excludedId: string | null): Promise<string> {
  const [row] = await tx.$queryRaw<{ digest: string }[]>`
    SELECT encode(sha256(convert_to(coalesce(string_agg(to_jsonb(a)::text, '|' ORDER BY a.id), ''),
      'UTF8')), 'hex') AS digest
    FROM audit_logs a WHERE ${excludedId}::uuid IS NULL OR a.id <> ${excludedId}::uuid`;
  return row!.digest;
}

// İşaretli iki tablonun, işaret transaction'ının sonundaki makbuz biçimli özeti.
async function markedDigests(tx: Tx): Promise<ShadowMarkedDigests> {
  const entries = [];
  for (const table of shadowMarkedTables) entries.push([table, await tableDigest(tx, table)]);
  return Object.fromEntries(entries) as ShadowMarkedDigests;
}

export async function markShadow(
  database: PrismaClient,
  identity: OperationIdentity,
  operationId: string,
  dumpSha256: string,
  canonicalCommitSha256: string,
  preResetDigests: ShadowMarkedDigests,
): Promise<{
  invalidatedIntents: number;
  auditWritten: true;
  deltaVerified: true;
  marked: ShadowMarkedDigests;
}> {
  if (!uuid.test(operationId) || !sha64.test(dumpSha256) || !sha64.test(canonicalCommitSha256))
    fail("INVALID_ARGUMENTS");
  for (const table of shadowMarkedTables) {
    const digest = preResetDigests?.[table];
    if (!digest || !Number.isInteger(digest.rows) || !sha64.test(digest.sha256))
      fail("INVALID_ARGUMENTS");
  }
  return database.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      // İki işaretli tablo, ölçümden dönüşüme kadar eşzamanlı yazılara kapalı; RepeatableRead
      // anlık görüntüsü kilitten SONRA alınır (Astra, PR #242 2. tur P1).
      await tx.$executeRaw`LOCK TABLE audit_logs, great_reset_intents IN SHARE ROW EXCLUSIVE MODE`;
      await assertIdentity(tx, identity);
      const [state] = await tx.$queryRaw<{ commits: number; exposures: number }[]>`
        SELECT (SELECT count(*)::int FROM great_reset_commits) AS commits,
          (SELECT count(*)::int FROM great_reset_exposure_events) AS exposures`;
      if (state?.commits !== 0 || state.exposures !== 0) fail("RESTORE_SHADOW_NOT_PRE_RESET");
      // Başlangıç, reset öncesi makbuzun bu iki tablosuna birebir eşit olmalı: işaretten önce
      // gölgeye yazılmış hiçbir satır güvenilen özete giremez.
      const baseline = await markedDigests(tx);
      const baselineMatches = shadowMarkedTables.every(
        (table) =>
          baseline[table].rows === preResetDigests[table].rows &&
          baseline[table].sha256 === preResetDigests[table].sha256,
      );
      if (!baselineMatches) {
        const marked = await tx.auditLog.count({
          where: { action: GREAT_RESET_PRODUCTION_RESTORE_ACTION, entityId: operationId },
        });
        fail(marked > 0 ? "RESTORE_SHADOW_ALREADY_MARKED" : "RESTORE_SHADOW_BASELINE_MISMATCH");
      }
      const intentsBefore = await intentsDigest(tx);
      const openBefore = await tx.$queryRaw<{ id: string }[]>`
        SELECT "operationId"::text AS id FROM great_reset_intents
        WHERE "consumedAt" IS NULL AND "invalidatedAt" IS NULL ORDER BY 1`;
      const openIds = openBefore.map((row) => row.id);
      const othersDigest = async () => {
        const [row] = await tx.$queryRaw<{ digest: string }[]>`
          SELECT encode(sha256(convert_to(coalesce(string_agg(to_jsonb(i)::text, '|'
            ORDER BY i."operationId"), ''), 'UTF8')), 'hex') AS digest
          FROM great_reset_intents i WHERE NOT (i."operationId"::text = ANY (${openIds}))`;
        return row!.digest;
      };
      const othersBefore = await othersDigest();
      const invalidated = await tx.$executeRaw`
        UPDATE great_reset_intents SET "invalidatedAt" = CURRENT_TIMESTAMP
        WHERE "consumedAt" IS NULL AND "invalidatedAt" IS NULL`;
      const [stillOpen] = await tx.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int AS count FROM great_reset_intents
        WHERE "operationId"::text = ANY (${openIds}) AND "invalidatedAt" IS NULL`;
      // Yalnız önceden açık niyetler geçersizleşir; diğer satırlar (invalidatedAt dahil) ve bütün
      // satırların diğer alanları birebir kalır.
      if (
        (await intentsDigest(tx)) !== intentsBefore ||
        (await othersDigest()) !== othersBefore ||
        invalidated !== openIds.length ||
        stillOpen?.count !== 0
      )
        fail("RESTORE_SHADOW_DELTA_INVALID");
      const expected = { operationId, dumpSha256, canonicalCommitSha256 };
      const auditBefore = await auditDigest(tx, null);
      const created = await tx.auditLog.create({
        data: {
          action: GREAT_RESET_PRODUCTION_RESTORE_ACTION,
          entityType: "PRODUCTION_DATABASE",
          entityId: operationId,
          requestId: operationId,
          metadata: { ...expected, scope: "PRODUCTION" },
        },
        select: { id: true },
      });
      if ((await auditDigest(tx, created.id)) !== auditBefore) fail("RESTORE_SHADOW_DELTA_INVALID");
      return {
        invalidatedIntents: invalidated,
        auditWritten: true as const,
        deltaVerified: true as const,
        marked: await markedDigests(tx),
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 60_000, maxWait: 5_000 },
  );
}

/**
 * Gölge (ya da yeniden adlandırmadan sonraki yeni canonical) doğrulaması: commit/trafik olayı yok,
 * geçerli niyet yok, tam bir restore audit'i bu operasyon ve dump SHA'sıyla var, yeni namespace
 * boş ve iki public ID sequence'i eski aralıkta (reset öncesi durum). Boş liste uygundur.
 */
export async function verifyRestored(
  database: PrismaClient,
  identity: OperationIdentity,
  operationId: string,
  dumpSha256: string,
  canonicalCommitSha256: string,
): Promise<string[]> {
  if (!uuid.test(operationId) || !sha64.test(dumpSha256) || !sha64.test(canonicalCommitSha256))
    fail("INVALID_ARGUMENTS");
  return database.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      await assertIdentity(tx, identity);
      const [row] = await tx.$queryRaw<
        {
          commits: number;
          exposures: number;
          openIntents: number;
          newContent: number;
          entryMax: string | null;
          topicMax: string | null;
        }[]
      >`
        SELECT (SELECT count(*)::int FROM great_reset_commits) AS commits,
          (SELECT count(*)::int FROM great_reset_exposure_events) AS exposures,
          (SELECT count(*)::int FROM great_reset_intents
            WHERE "consumedAt" IS NULL AND "invalidatedAt" IS NULL) AS "openIntents",
          (SELECT count(*)::int FROM entries WHERE "publicId" >= 2147483648)
            + (SELECT count(*)::int FROM topics WHERE "publicId" >= 2147483648) AS "newContent",
          (SELECT max_value::text FROM pg_sequences
            WHERE schemaname = 'public' AND sequencename = 'entries_public_id_seq') AS "entryMax",
          (SELECT max_value::text FROM pg_sequences
            WHERE schemaname = 'public' AND sequencename = 'topics_public_id_seq') AS "topicMax"`;
      // Önceki bir operasyonun geri dönüş audit'i tarihsel kayıttır; yalnız bu operasyonunki sayılır.
      const audits = await tx.auditLog.findMany({
        where: { action: GREAT_RESET_PRODUCTION_RESTORE_ACTION, entityId: operationId },
        select: { entityId: true, metadata: true },
      });
      const result: string[] = [];
      if (!row) return ["STATE_UNAVAILABLE"];
      if (row.commits !== 0) result.push("COMMIT_PRESENT");
      if (row.exposures !== 0) result.push("EXPOSURE_PRESENT");
      if (row.openIntents !== 0) result.push("OPEN_INTENT_PRESENT");
      if (row.newContent !== 0) result.push("NEW_NAMESPACE_CONTENT");
      // Reset öncesi üst sınır kilidi yerinde olmalı.
      if (row.entryMax !== "2147483647" || row.topicMax !== "2147483647")
        result.push("SEQUENCE_NOT_PRE_RESET");
      const metadata = audits[0]?.metadata as Record<string, unknown> | undefined;
      if (
        audits.length !== 1 ||
        audits[0]!.entityId !== operationId ||
        metadata?.dumpSha256 !== dumpSha256 ||
        metadata?.canonicalCommitSha256 !== canonicalCommitSha256
      )
        result.push("RESTORE_AUDIT_MISMATCH");
      return result;
    },
    { isolationLevel: "RepeatableRead", timeout: 60_000, maxWait: 5_000 },
  );
}

/*
  Kapı sonrası doğrulama (Astra, PR #242 P1; runbook "COMMIT sonrası kabul hatası"): canonical ve
  gölgeye kapılar KAPANMADAN birer sabit bağlantı açılır ve süreç kimlikleri bildirilir. Yönetici
  kapıları kapatıp iki DB'de yalnız bu iki backend'in kaldığını doğruladıktan sonra sinyal verir;
  doğrulama AYNI bağlantılarda, yeni transaction'larda yapılır: canonical'da uygunluk (reset sonrası
  makbuzla tam eşitlik dahil) ve commit özeti, gölgede işaret doğrulaması ve işaretli makbuzla tam
  eşitlik. Sonunda süreç kimliklerinin değişmediği denetlenir (yeniden bağlanma yok).
*/
export async function pinnedRollbackVerify(options: {
  canonical: PrismaClient;
  shadow: PrismaClient;
  canonicalIdentity: OperationIdentity;
  shadowIdentity: OperationIdentity;
  operationId: string;
  dumpSha256: string;
  commitSha256: string;
  postResetReceipt: GreatResetReceipt;
  shadowReceipt: GreatResetReceipt;
  pinned: (pids: { canonical: number; shadow: number }) => void;
  waitForGates: () => Promise<void>;
}): Promise<string[]> {
  const { computeReceipt, compareReceipts } = await import("./great-reset-receipt");
  const { restoreEligibility } = await import("./great-reset-operation");
  const pid = async (client: PrismaClient) => {
    const [row] = await client.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
    return row!.pid;
  };
  const before = { canonical: await pid(options.canonical), shadow: await pid(options.shadow) };
  options.pinned(before);
  await options.waitForGates();
  const blockers: string[] = [];
  for (const item of await restoreEligibility(
    options.canonical,
    options.canonicalIdentity,
    options.operationId,
    options.postResetReceipt,
  ))
    blockers.push(`canonical:${item}`);
  if (
    (await commitDigest(options.canonical, options.canonicalIdentity, options.operationId)) !==
    options.commitSha256
  )
    blockers.push("canonical:COMMIT_DIGEST_CHANGED");
  for (const item of await verifyRestored(
    options.shadow,
    options.shadowIdentity,
    options.operationId,
    options.dumpSha256,
    options.commitSha256,
  ))
    blockers.push(`shadow:${item}`);
  if (
    !compareReceipts(
      options.shadowReceipt,
      await computeReceipt(options.shadow, options.shadowIdentity),
    ).equal
  )
    blockers.push("shadow:RECEIPT_CHANGED");
  if (
    (await pid(options.canonical)) !== before.canonical ||
    (await pid(options.shadow)) !== before.shadow
  )
    blockers.push("PIN_LOST");
  return blockers;
}
