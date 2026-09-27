import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { GREAT_RESET_PRODUCTION_RESTORE_ACTION } from "./great-reset";
import type { OperationIdentity } from "./great-reset-operation";

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
export async function markShadow(
  database: PrismaClient,
  identity: OperationIdentity,
  operationId: string,
  dumpSha256: string,
  canonicalCommitSha256: string,
): Promise<{ invalidatedIntents: number; auditWritten: boolean }> {
  if (!uuid.test(operationId) || !sha64.test(dumpSha256) || !sha64.test(canonicalCommitSha256))
    fail("INVALID_ARGUMENTS");
  return database.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      await assertIdentity(tx, identity);
      const [state] = await tx.$queryRaw<{ commits: number; exposures: number }[]>`
        SELECT (SELECT count(*)::int FROM great_reset_commits) AS commits,
          (SELECT count(*)::int FROM great_reset_exposure_events) AS exposures`;
      if (state?.commits !== 0 || state.exposures !== 0) fail("RESTORE_SHADOW_NOT_PRE_RESET");
      const invalidated = await tx.$executeRaw`
        UPDATE great_reset_intents SET "invalidatedAt" = CURRENT_TIMESTAMP
        WHERE "consumedAt" IS NULL AND "invalidatedAt" IS NULL`;
      const existing = await tx.auditLog.findMany({
        where: { action: GREAT_RESET_PRODUCTION_RESTORE_ACTION },
        select: { entityId: true, metadata: true },
      });
      if (existing.length > 1) fail("RESTORE_AUDIT_CONFLICT");
      const expected = { operationId, dumpSha256, canonicalCommitSha256 };
      if (existing.length === 1) {
        const metadata = existing[0]!.metadata as Record<string, unknown> | null;
        if (
          existing[0]!.entityId !== operationId ||
          metadata?.dumpSha256 !== dumpSha256 ||
          metadata?.canonicalCommitSha256 !== canonicalCommitSha256
        )
          fail("RESTORE_AUDIT_CONFLICT");
        return { invalidatedIntents: invalidated, auditWritten: false };
      }
      await tx.auditLog.create({
        data: {
          action: GREAT_RESET_PRODUCTION_RESTORE_ACTION,
          entityType: "PRODUCTION_DATABASE",
          entityId: operationId,
          requestId: operationId,
          metadata: { ...expected, scope: "PRODUCTION" },
        },
      });
      return { invalidatedIntents: invalidated, auditWritten: true };
    },
    { timeout: 60_000, maxWait: 5_000 },
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
): Promise<string[]> {
  if (!uuid.test(operationId) || !sha64.test(dumpSha256)) fail("INVALID_ARGUMENTS");
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
      const audits = await tx.auditLog.findMany({
        where: { action: GREAT_RESET_PRODUCTION_RESTORE_ACTION },
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
        metadata?.dumpSha256 !== dumpSha256
      )
        result.push("RESTORE_AUDIT_MISMATCH");
      return result;
    },
    { isolationLevel: "RepeatableRead", timeout: 60_000, maxWait: 5_000 },
  );
}
