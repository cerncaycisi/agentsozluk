import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetScope } from "@/modules/maintenance/domain/great-reset-production-guard";
import { greatResetInspection as inspect } from "@/modules/maintenance/repository/great-reset";
import { resetContentManifest } from "@/modules/maintenance/repository/great-reset-manifest";
import {
  assertResetNamespace,
  executeNamespaceReset,
  previewNamespaceReset,
  reconcileNamespaceReset,
} from "@/modules/maintenance/repository/great-reset-production";
import { loadResetGoneIndex } from "@/modules/maintenance/repository/reset-gone";
import { getResetGoneDecision } from "@/modules/maintenance/application/reset-gone";
import type { DatabaseClient } from "@/lib/db/types";
import { closeIntegrationDatabase, resetIntegrationDatabase } from "./database";
import { requireTestDatabaseUrl } from "../../scripts/test-database-safety";

// Mutation kapısı diğer idle backend'leri de reddeder. Fixture havuzu ayrı kapanır;
// çekirdek, üretim yürütücüsündeki gibi tek bağlantıyla sınanır.
const databaseUrl = new URL(
  requireTestDatabaseUrl(process.env.TEST_DATABASE_URL, "Reset namespace test"),
);
databaseUrl.searchParams.set("connection_limit", "1");
const db = new PrismaClient({ datasourceUrl: databaseUrl.href });
beforeEach(async () => {
  await db.$disconnect();
  await resetIntegrationDatabase();
  await closeIntegrationDatabase();
});
afterAll(async () => {
  await db.$disconnect();
  await closeIntegrationDatabase();
});
type Tx = Prisma.TransactionClient;
const releaseSha = "a".repeat(40);
const rollback = new Error("NAMESPACE_FIXTURE_ROLLBACK");
async function fixture() {
  const username = `reset_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
  const user = await db.user.create({
    data: {
      username,
      usernameNormalized: username,
      displayName: "Reset fixture",
      email: `${username}@reset.test`,
      emailNormalized: `${username}@reset.test`,
      passwordHash: "not-used",
      termsVersion: "1.0",
      termsAcceptedAt: new Date(),
    },
  });
  const topic = await db.topic.create({
    data: {
      title: "Sıfırlanacak başlık",
      normalizedTitle: "sıfırlanacak başlık",
      slug: "reset-fixture",
      createdById: user.id,
      entries: {
        create: {
          body: "Sıfırlanacak içerik",
          normalizedBody: "sıfırlanacak içerik",
          origin: "WEB",
          authorId: user.id,
        },
      },
    },
    include: { entries: true },
  });
  await db.agentGlobalSettings.update({
    where: { id: "global" },
    data: {
      runtimeEnabled: false,
      schedulerEnabled: false,
      publishEnabled: false,
      publicWriteEnabled: false,
    },
  });
  await db.outboxEvent.create({
    data: {
      eventType: "reset.fixture",
      aggregateType: "Topic",
      aggregateId: topic.id,
      requestId: randomUUID(),
      payload: { topicId: topic.id },
    },
  });
  await db.idempotencyRecord.create({
    data: {
      route: "reset.fixture",
      key: "one",
      requestHash: "b".repeat(64),
      responseStatus: 201,
      responseBody: { id: topic.id },
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
  return { userId: user.id, topic, entry: topic.entries[0]! };
}
async function context(tx: Tx) {
  await tx.$executeRaw`SET LOCAL statement_timeout='30s'`;
  await tx.$executeRaw`SET LOCAL lock_timeout='1s'`;
  const [identity] = await tx.$queryRaw<
    { oid: string; cluster: string }[]
  >`SELECT d.oid::text AS oid,(SELECT system_identifier::text FROM pg_control_system()) AS cluster FROM pg_database d WHERE datname=current_database()`;
  if (!identity) throw new Error("TEST_IDENTITY_REQUIRED");
  const operationId = randomUUID();
  await tx.$queryRaw`SELECT set_config('agentsozluk.reset_operation',${operationId},true)`;
  const now = new Date();
  await tx.greatResetIntent.create({
    data: {
      operationId,
      releaseSha,
      scope: resetScope,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 3600_000),
      sourceDatabaseOid: BigInt(identity.oid),
      sourceClusterId: identity.cluster,
    },
  });
  const manifest = await resetContentManifest(tx, inspect.tables());
  return {
    operationId,
    releaseSha,
    manifestSha256: manifest.sha256,
    implementationSha256: "c".repeat(64),
    databaseOid: identity.oid,
    clusterId: identity.cluster,
  };
}
async function rejectSql(tx: Tx, work: () => Promise<unknown>, message: RegExp) {
  await tx.$executeRaw`SAVEPOINT namespace_negative`;
  await expect(work()).rejects.toThrow(message);
  await tx.$executeRaw`ROLLBACK TO SAVEPOINT namespace_negative`;
  await tx.$executeRaw`RELEASE SAVEPOINT namespace_negative`;
}
async function sequences() {
  return db.$queryRaw<{ name: string; last: bigint; called: boolean; max: bigint }[]>`
    SELECT 'entries' AS name,v.last_value AS last,v.is_called AS called,s.max_value AS max FROM public.entries_public_id_seq v JOIN pg_sequences s ON s.schemaname='public' AND s.sequencename='entries_public_id_seq'
    UNION ALL SELECT 'topics',v.last_value,v.is_called,s.max_value FROM public.topics_public_id_seq v JOIN pg_sequences s ON s.schemaname='public' AND s.sequencename='topics_public_id_seq' ORDER BY name`;
}

describe("actual atomic namespace reset on owned test PostgreSQL", () => {
  it("clears all content, archives outbox, tombstones known links and rolls back all reset DDL/journals", async () => {
    const old = await fixture();
    const before = await sequences();
    await expect(
      db.$transaction(
        async (tx) => {
          const request = await context(tx);
          const plan = await previewNamespaceReset(tx, request);
          expect(plan.blockedBy).toEqual([]);
          const result = await executeNamespaceReset(tx, request, plan.planSha256);
          expect(result.verified).toBe(true);
          expect(result.topicTombstones).toBe(1);
          expect(result.entryTombstones).toBe(1);
          const reconciled = await reconcileNamespaceReset(tx, request, plan.planSha256);
          expect(reconciled.status).toBe("COMMITTED");
          expect(reconciled).toMatchObject({
            operationId: request.operationId,
            clearedCounts: result.clearedCounts,
            committedProtectedSha256: result.committedProtectedSha256,
          });
          const userBefore = await tx.user.findUniqueOrThrow({ where: { id: old.userId } });
          await tx.user.update({
            where: { id: old.userId },
            data: { displayName: "Beklenmedik değişim" },
          });
          await expect(reconcileNamespaceReset(tx, request, plan.planSha256)).rejects.toThrow(
            "GREAT_RESET_RECONCILIATION_REJECTED",
          );
          await tx.user.update({
            where: { id: old.userId },
            data: { displayName: userBefore.displayName, updatedAt: userBefore.updatedAt },
          });
          expect(await tx.user.count({ where: { id: old.userId } })).toBe(1);
          expect(await tx.topic.count()).toBe(0);
          expect(await tx.entry.count()).toBe(0);
          expect(await tx.outboxEvent.count()).toBe(1);
          expect(await tx.outboxResetArchiveEvent.count()).toBe(1);
          expect(await tx.idempotencyRecord.count({ where: { expiresAt: new Date(0) } })).toBe(1);
          expect(
            await getResetGoneDecision(tx as unknown as DatabaseClient, {
              kind: "ENTRY",
              reference: "UUID",
              uuid: old.entry.id,
            }),
          ).toBe("GONE");
          expect(
            await getResetGoneDecision(tx as unknown as DatabaseClient, {
              kind: "TOPIC",
              reference: "PUBLIC_ID",
              publicId: Number(old.topic.publicId),
            }),
          ).toBe("GONE");
          await assertResetNamespace(tx, "RESET");
          await rejectSql(
            tx,
            () =>
              tx.topic.create({
                data: {
                  publicId: old.topic.publicId,
                  title: "Eski kimlik",
                  normalizedTitle: "eski kimlik",
                  slug: "eski-kimlik",
                  createdById: old.userId,
                },
              }),
            /topics_public_id_reset_range/u,
          );
          await rejectSql(
            tx,
            () =>
              tx.topic.create({
                data: {
                  publicId: 9007199254740992n,
                  title: "Güvensiz kimlik",
                  normalizedTitle: "güvensiz kimlik",
                  slug: "guvensiz-kimlik",
                  createdById: old.userId,
                },
              }),
            /topics_public_id_reset_range/u,
          );
          const fresh = await tx.topic.create({
            data: {
              title: "Yeni başlık",
              normalizedTitle: "yeni başlık",
              slug: "yeni-baslik",
              createdById: old.userId,
            },
          });
          expect(fresh.publicId).toBe(2147483648n);
          const entry = await tx.entry.create({
            data: {
              topicId: fresh.id,
              authorId: old.userId,
              body: "Yeni içerik",
              normalizedBody: "yeni içerik",
              origin: "WEB",
            },
          });
          expect(entry.publicId).toBe(2147483648n);
          await expect(executeNamespaceReset(tx, request, plan.planSha256)).rejects.toThrow(
            "GREAT_RESET_INTENT_INVALID",
          );
          throw rollback;
        },
        { isolationLevel: "ReadCommitted", timeout: 90000 },
      ),
    ).rejects.toBe(rollback);
    expect(await sequences()).toEqual(before);
    expect(await db.topic.count({ where: { id: old.topic.id } })).toBe(1);
    expect(await db.entry.count({ where: { id: old.entry.id } })).toBe(1);
    expect(await db.greatResetIntent.count()).toBe(0);
    expect(await db.greatResetCommit.count()).toBe(0);
    expect(await db.greatResetTombstone.count()).toBe(0);
    expect(await db.outboxResetArchive.count()).toBe(0);
  }, 90000);
  it("rejects a stale plan before consuming the intent or deleting content", async () => {
    const old = await fixture();
    await expect(
      db.$transaction(
        async (tx) => {
          const request = await context(tx);
          const preview = await previewNamespaceReset(tx, request);
          expect(preview.blockedBy).toEqual([]);
          await expect(executeNamespaceReset(tx, request, "0".repeat(64))).rejects.toThrow(
            "GREAT_RESET_STALE_PLAN",
          );
          expect(
            (
              await tx.greatResetIntent.findUniqueOrThrow({
                where: { operationId: request.operationId },
              })
            ).consumedAt,
          ).toBeNull();
          expect(await tx.topic.count({ where: { id: old.topic.id } })).toBe(1);
          throw rollback;
        },
        { isolationLevel: "ReadCommitted", timeout: 90000 },
      ),
    ).rejects.toBe(rollback);
  }, 90000);
  it("rejects an additional idle backend without consuming intent or deleting content", async () => {
    const old = await fixture();
    const observer = new PrismaClient({ datasourceUrl: databaseUrl.href });
    try {
      await observer.$queryRaw`SELECT 1 AS ok`;
      await expect(
        db.$transaction(
          async (tx) => {
            const request = await context(tx);
            const preview = await previewNamespaceReset(tx, request);
            expect(preview.blockedBy).toContain("OTHER_DATABASE_CONNECTIONS");
            await expect(executeNamespaceReset(tx, request, preview.planSha256)).rejects.toThrow(
              "GREAT_RESET_PRECONDITIONS_FAILED",
            );
            expect(
              (
                await tx.greatResetIntent.findUniqueOrThrow({
                  where: { operationId: request.operationId },
                })
              ).consumedAt,
            ).toBeNull();
            expect(await tx.topic.count({ where: { id: old.topic.id } })).toBe(1);
            throw rollback;
          },
          { isolationLevel: "ReadCommitted", timeout: 90000 },
        ),
      ).rejects.toBe(rollback);
    } finally {
      await observer.$disconnect();
    }
  }, 90000);
  it("binds restored content to the full source manifest, allowing only its restore audit and intent invalidation", async () => {
    const old = await fixture();
    await expect(
      db.$transaction(
        async (tx) => {
          const request = await context(tx);
          await tx.greatResetIntent.update({
            where: { operationId: request.operationId },
            data: { invalidatedAt: new Date() },
          });
          await tx.auditLog.create({
            data: {
              action: "GREAT_RESET_PRODUCTION_RESTORE",
              entityType: "AGENT_SOZLUK_DATABASE",
              entityId: request.operationId,
              requestId: request.operationId,
              metadata: { dumpSha256: "d".repeat(64) },
            },
          });
          expect((await resetContentManifest(tx, inspect.tables())).sha256).not.toBe(
            request.manifestSha256,
          );
          expect(
            (await resetContentManifest(tx, inspect.tables(), request.operationId)).sha256,
          ).toBe(request.manifestSha256);
          await tx.user.update({
            where: { id: old.userId },
            data: { displayName: "Wrong restored content" },
          });
          expect(
            (await resetContentManifest(tx, inspect.tables(), request.operationId)).sha256,
          ).not.toBe(request.manifestSha256);
          throw rollback;
        },
        { isolationLevel: "ReadCommitted", timeout: 90000 },
      ),
    ).rejects.toBe(rollback);
  }, 90000);
  it("rejects catalog drift under the mutation locks before consuming the intent", async () => {
    const old = await fixture();
    await expect(
      db.$transaction(
        async (tx) => {
          const request = await context(tx);
          const preview = await previewNamespaceReset(tx, request);
          await tx.$executeRaw`COMMENT ON TABLE public.users IS 'reset proof catalog drift'`;
          await expect(executeNamespaceReset(tx, request, preview.planSha256)).rejects.toThrow(
            "GREAT_RESET_MANIFEST_MISMATCH",
          );
          expect(
            (
              await tx.greatResetIntent.findUniqueOrThrow({
                where: { operationId: request.operationId },
              })
            ).consumedAt,
          ).toBeNull();
          expect(await tx.topic.count({ where: { id: old.topic.id } })).toBe(1);
          throw rollback;
        },
        { timeout: 90000 },
      ),
    ).rejects.toBe(rollback);
  }, 90000);
  it("loads 2002 real PostgreSQL tombstones across kind and keyset page boundaries", async () => {
    await fixture();
    await expect(
      db.$transaction(
        async (tx) => {
          const request = await context(tx);
          await tx.$executeRaw`UPDATE public.great_reset_intents SET "consumedAt"=clock_timestamp() WHERE "operationId"=${request.operationId}::uuid`;
          await tx.$executeRaw`INSERT INTO public.great_reset_tombstones(kind,uuid,"publicId","operationId")
        SELECT CASE WHEN i<=1001 THEN 'ENTRY' ELSE 'TOPIC' END,
          ('00000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,i::bigint,${request.operationId}::uuid
        FROM generate_series(1,2002) AS series(i)`;
          await tx.greatResetCommit.create({
            data: {
              operationId: request.operationId,
              releaseSha: request.releaseSha,
              manifestSha256: request.manifestSha256,
              planSha256: "d".repeat(64),
              protectedSha256: "e".repeat(64),
              clearedCounts: { topics: 1001, entries: 1001 },
            },
          });
          const index = await loadResetGoneIndex(tx);
          expect(index?.entries.publicIds.size).toBe(1001);
          expect(index?.entries.uuids.size).toBe(1001);
          expect(index?.topics.publicIds.size).toBe(1001);
          expect(index?.topics.uuids.size).toBe(1001);
          for (const publicId of [999, 1000, 1001, 1002, 2001, 2002])
            expect(
              await getResetGoneDecision(tx as unknown as DatabaseClient, {
                kind: publicId <= 1001 ? "ENTRY" : "TOPIC",
                reference: "PUBLIC_ID",
                publicId,
              }),
            ).toBe("GONE");
          throw rollback;
        },
        { timeout: 90000 },
      ),
    ).rejects.toBe(rollback);
  }, 90000);
  it("rejects unsafe sequence definitions, changed range checks and an unexpected INSERT trigger", async () => {
    await fixture();
    await expect(
      db.$transaction(
        async (tx) => {
          await assertResetNamespace(tx, "LEGACY");
          await tx.$executeRaw`SAVEPOINT namespace_guard`;
          await tx.$executeRaw`ALTER SEQUENCE public.topics_public_id_seq CACHE 2`;
          await expect(assertResetNamespace(tx, "LEGACY")).rejects.toThrow(
            "GREAT_RESET_PUBLIC_ID_SEQUENCE_UNSAFE",
          );
          await tx.$executeRaw`ROLLBACK TO SAVEPOINT namespace_guard`;
          await tx.$executeRaw`ALTER TABLE ONLY public.topics DROP CONSTRAINT topics_public_id_legacy_range`;
          await tx.$executeRaw`ALTER TABLE ONLY public.topics ADD CONSTRAINT topics_public_id_legacy_range CHECK ("publicId" > 0)`;
          await expect(assertResetNamespace(tx, "LEGACY")).rejects.toThrow(
            "GREAT_RESET_PUBLIC_ID_SEQUENCE_UNSAFE",
          );
          await tx.$executeRaw`ROLLBACK TO SAVEPOINT namespace_guard`;
          await tx.$executeRaw`CREATE TRIGGER reset_unexpected_insert BEFORE INSERT ON public.topics FOR EACH ROW EXECUTE FUNCTION public.prevent_public_id_update()`;
          await expect(assertResetNamespace(tx, "LEGACY")).rejects.toThrow(
            "GREAT_RESET_PUBLIC_ID_WRITER_UNSAFE",
          );
          await tx.$executeRaw`ROLLBACK TO SAVEPOINT namespace_guard`;
          await assertResetNamespace(tx, "LEGACY");
          throw rollback;
        },
        { timeout: 90000 },
      ),
    ).rejects.toBe(rollback);
  }, 90000);
});
