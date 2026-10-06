import { MAX_RESET_TOMBSTONES } from "../domain/reset-gone";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { assertResetOperation, resetScope } from "../domain/great-reset-production-guard";
import { greatResetInspection as inspect, type ResetTable } from "./great-reset";
import {
  archivePendingOutboxEvents,
  assertExpectedOutboxArchive,
  pendingOutboxSnapshot,
  outboxArchiveSummary,
  outboxArchivesAreValid,
} from "./outbox-reset-archive";
import { resetContentManifest } from "./great-reset-manifest";
import { z } from "zod";

type Tx = Prisma.TransactionClient;
export type NamespaceResetContext = {
  operationId: string;
  releaseSha: string;
  manifestSha256: string;
  implementationSha256: string;
  databaseOid: string;
  clusterId: string;
};
const idTables = ["entries", "topics"] as const;
/** Cevabı kaybolmuş COMMIT yalnız immutable DB kanıtı ve donmuş state ile uzlaştırılır. */
export async function reconcileNamespaceReset(
  tx: Tx,
  context: NamespaceResetContext,
  planSha256: string,
) {
  assertResetOperation(context.operationId);
  const list = inspect.tables();
  const commit = await tx.greatResetCommit.findUnique({
    where: { operationId: context.operationId },
  });
  const intent = await tx.greatResetIntent.findUnique({
    where: { operationId: context.operationId },
  });
  if (
    !intent ||
    intent.releaseSha !== context.releaseSha ||
    intent.scope !== resetScope ||
    intent.sourceDatabaseOid.toString() !== context.databaseOid ||
    intent.sourceClusterId !== context.clusterId ||
    intent.invalidatedAt !== null ||
    (await tx.greatResetExposureEvent.count()) ||
    (await tx.auditLog.count({ where: { action: "GREAT_RESET_PRODUCTION_RESTORE" } }))
  )
    throw new Error("GREAT_RESET_RECONCILIATION_REJECTED");
  if ((await inspect.blockers(tx, true, false)).length)
    throw new Error("GREAT_RESET_PRECONDITIONS_FAILED");
  if (!commit) {
    if (
      intent.consumedAt !== null ||
      (await tx.greatResetCommit.count()) ||
      (await tx.greatResetTombstone.count()) ||
      (await resetContentManifest(tx, list)).sha256 !== context.manifestSha256
    )
      throw new Error("GREAT_RESET_RECONCILIATION_REJECTED");
    await assertResetNamespace(tx, "LEGACY");
    return { status: "ABORTED" as const, operationId: context.operationId };
  }
  if (
    !intent.consumedAt ||
    (await tx.greatResetCommit.count()) !== 1 ||
    commit.releaseSha !== context.releaseSha ||
    commit.manifestSha256 !== context.manifestSha256 ||
    commit.planSha256 !== planSha256
  )
    throw new Error("GREAT_RESET_RECONCILIATION_REJECTED");
  const audits = await tx.auditLog.findMany({
    where: { action: "GREAT_RESET_PRODUCTION_EXECUTED" },
  });
  const counts = z
    .object(
      Object.fromEntries(
        list.filter((t) => t.cleared).map((t) => [t.table, z.number().int().nonnegative()]),
      ),
    )
    .strict()
    .parse(commit.clearedCounts);
  const proof = z
    .object({
      releaseSha: z.literal(context.releaseSha),
      manifestSha256: z.literal(context.manifestSha256),
      implementationSha256: z.literal(context.implementationSha256),
      planSha256: z.literal(planSha256),
      protectedSha256: z.literal(commit.protectedSha256),
      clearedCounts: z.record(z.string(), z.number().int().nonnegative()),
      topicTombstones: z.literal(counts.topics),
      entryTombstones: z.literal(counts.entries),
      outboxArchiveId: z.string().uuid().nullable(),
      expiredIdempotencyRows: z.number().int().nonnegative(),
    })
    .passthrough();
  if (audits.length !== 1 || audits[0]?.entityId !== context.operationId)
    throw new Error("GREAT_RESET_RECONCILIATION_REJECTED");
  const audit = proof.parse(audits[0].metadata);
  if (
    Object.keys(audit.clearedCounts).length !== Object.keys(counts).length ||
    Object.keys(counts).some((key) => audit.clearedCounts[key] !== counts[key]) ||
    (await tx.greatResetTombstone.count({
      where: { operationId: context.operationId, kind: "TOPIC" },
    })) !== counts.topics ||
    (await tx.greatResetTombstone.count({
      where: { operationId: context.operationId, kind: "ENTRY" },
    })) !== counts.entries ||
    (await tx.greatResetTombstone.count()) !== counts.topics! + counts.entries! ||
    !(await outboxArchivesAreValid(tx)) ||
    (await tx.idempotencyRecord.count({ where: { expiresAt: { not: new Date(0) } } }))
  )
    throw new Error("GREAT_RESET_RECONCILIATION_REJECTED");
  for (const row of list.filter((t) => t.cleared)) {
    const [count] = await tx.$queryRaw<{ rows: number }[]>(
      Prisma.sql`SELECT count(*)::int AS rows FROM ${inspect.tableSql(row.table)}`,
    );
    if (count?.rows !== 0) throw new Error("GREAT_RESET_RECONCILIATION_REJECTED");
  }
  await assertResetNamespace(tx, "RESET");
  const actualProtected: Record<string, { rows: number; sha256: string }> = {};
  const normalizedProtected: typeof actualProtected = {};
  for (const row of list.filter((t) => !t.cleared)) {
    actualProtected[row.table] = await inspect.fingerprint(tx, row.table);
    normalizedProtected[row.table] = await inspect.fingerprint(
      tx,
      row.table,
      audits[0]!.id,
      audit.outboxArchiveId ?? undefined,
      context.operationId,
    );
  }
  if (inspect.digest(normalizedProtected) !== commit.protectedSha256)
    throw new Error("GREAT_RESET_RECONCILIATION_REJECTED");
  return {
    status: "COMMITTED" as const,
    operationId: context.operationId,
    planSha256,
    manifestSha256: context.manifestSha256,
    normalizedProtectedSha256: commit.protectedSha256,
    committedProtectedSha256: createHash("sha256")
      .update(JSON.stringify(actualProtected))
      .digest("hex"),
    clearedCounts: counts,
    topicTombstones: counts.topics,
    entryTombstones: counts.entries,
    outboxArchiveId: audit.outboxArchiveId,
    expiredIdempotencyRows: audit.expiredIdempotencyRows,
    verified: true as const,
  };
}
const legacyCheck = 'CHECK ((("publicId" >= 1) AND ("publicId" <= 2147483647)))';
const resetCheck =
  "CHECK (((\"publicId\" >= '2147483648'::bigint) AND (\"publicId\" <= '9007199254740991'::bigint)))";

/** DB sahibi/root izolasyonu değildir; beklenmeyen normal writer/DDL reddedilir. */
export async function assertResetNamespace(
  tx: Tx,
  phase: "LEGACY" | "RESET",
  allowNewState = false,
): Promise<void> {
  for (const table of idTables) {
    const sequence = `${table}_public_id_seq`;
    const wanted = `${table}_public_id_${phase === "LEGACY" ? "legacy" : "reset"}_range`;
    const forbidden = `${table}_public_id_${phase === "LEGACY" ? "reset" : "legacy"}_range`;
    const [row] = await tx.$queryRaw<
      { safe: boolean; definition: string; validated: boolean; forbidden: number }[]
    >(Prisma.sql`
      SELECT (
        s.data_type = 'bigint'::regtype AND a.atttypid = 'bigint'::regtype
        AND s.increment_by = 1 AND s.cache_size = 1 AND NOT s.cycle AND c.relpersistence='p'
        AND s.min_value = 1 AND s.start_value = 1
        AND s.max_value = ${phase === "LEGACY" ? 2147483647n : 9007199254740991n}
        AND pg_get_serial_sequence(${`public.${table}`}, 'publicId')=${`public.${sequence}`}
        AND pg_get_expr(d.adbin,d.adrelid)=format('nextval(%L::regclass)',(${`public.${sequence}`}::regclass)::text)
        AND (CASE WHEN q.is_called THEN q.last_value::numeric+1 ELSE q.last_value::numeric END)
          > coalesce((SELECT max("publicId") FROM ${Prisma.raw(`public."${table}"`)}),0)
        AND (CASE WHEN q.is_called THEN q.last_value::numeric+1 ELSE q.last_value::numeric END) < s.max_value
        AND (${phase === "LEGACY" || allowNewState} OR (q.last_value=2147483648 AND NOT q.is_called))
        AND (${phase === "LEGACY"} OR q.last_value>=2147483648)
        AND NOT EXISTS (SELECT 1 FROM ${Prisma.raw(`public."${table}"`)}
          WHERE "publicId" < ${phase === "LEGACY" ? 1n : 2147483648n}
          OR "publicId" > ${phase === "LEGACY" ? 2147483647n : 9007199254740991n})
      ) AS safe,
      pg_get_constraintdef(k.oid) AS definition,k.convalidated AS validated,
      (SELECT count(*)::int FROM pg_constraint WHERE conrelid=${`public.${table}`}::regclass AND conname=${forbidden}) AS forbidden
      FROM pg_sequences s JOIN pg_class c ON c.relname=s.sequencename AND c.relnamespace='public'::regnamespace
      CROSS JOIN ${Prisma.raw(`public."${sequence}"`)} q
      JOIN pg_attribute a ON a.attrelid=${`public.${table}`}::regclass AND a.attname='publicId' AND NOT a.attisdropped
      JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      JOIN pg_constraint k ON k.conrelid=a.attrelid AND k.conname=${wanted} AND k.contype='c'
      WHERE s.schemaname='public' AND s.sequencename=${sequence}`);
    if (
      !row?.safe ||
      !row.validated ||
      row.forbidden !== 0 ||
      row.definition !== (phase === "LEGACY" ? legacyCheck : resetCheck)
    )
      throw new Error("GREAT_RESET_PUBLIC_ID_SEQUENCE_UNSAFE");
  }
  // Beklenen topic/entry trigger'larının hiçbiri INSERT yapabilen bir tetik değildir.
  const [unexpected] = await tx.$queryRaw<{ count: number }[]>`
    SELECT (SELECT count(*) FROM pg_rewrite WHERE ev_class IN ('public.topics'::regclass,'public.entries'::regclass))::int
      + (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND
        tgrelid IN ('public.topics'::regclass,'public.entries'::regclass) AND (tgtype & 4)<>0)::int AS count`;
  if (unexpected?.count !== 0) throw new Error("GREAT_RESET_PUBLIC_ID_WRITER_UNSAFE");
}

async function assertContext(tx: Tx, context: NamespaceResetContext): Promise<void> {
  assertResetOperation(context.operationId);
  for (const value of [context.manifestSha256, context.implementationSha256])
    if (!/^[a-f0-9]{64}$/u.test(value)) throw new Error("GREAT_RESET_MANIFEST_REQUIRED");
  if (!/^[a-f0-9]{40}$/u.test(context.releaseSha)) throw new Error("GREAT_RESET_RELEASE_REQUIRED");
  const intent = await tx.greatResetIntent.findUnique({
    where: { operationId: context.operationId },
  });
  const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
  if (
    !intent ||
    !clock ||
    intent.releaseSha !== context.releaseSha ||
    intent.scope !== resetScope ||
    intent.sourceDatabaseOid.toString() !== context.databaseOid ||
    intent.sourceClusterId !== context.clusterId ||
    intent.consumedAt !== null ||
    intent.invalidatedAt !== null ||
    intent.expiresAt <= clock.now ||
    (await tx.greatResetIntent.count({ where: { consumedAt: null, invalidatedAt: null } })) !== 1
  )
    throw new Error("GREAT_RESET_INTENT_INVALID");
  if (
    (await tx.greatResetCommit.count()) ||
    (await tx.greatResetTombstone.count()) ||
    (await tx.greatResetExposureEvent.count()) ||
    (await tx.auditLog.count({
      where: {
        action: { in: ["GREAT_RESET_PRODUCTION_EXECUTED", "GREAT_RESET_PRODUCTION_RESTORE"] },
      },
    }))
  )
    throw new Error("GREAT_RESET_ALREADY_EXECUTED");
}

async function preparation(tx: Tx, context: NamespaceResetContext, list: ResetTable[]) {
  await assertContext(tx, context);
  if ((await inspect.privilegeBlockers(tx, list)).length)
    throw new Error("GREAT_RESET_INSUFFICIENT_PRIVILEGES");
  await assertResetNamespace(tx, "LEGACY");
  const schemaSha256 = await inspect.inspectSchema(tx, list, true);
  const before = await inspect.snapshot(tx, list, undefined, undefined, context.operationId);
  if ((before.tables.topics?.rows ?? 0) + (before.tables.entries?.rows ?? 0) > MAX_RESET_TOMBSTONES)
    throw new Error("GREAT_RESET_TOMBSTONE_LIMIT");
  const pendingOutbox = await pendingOutboxSnapshot(tx);
  const archivesBefore = await outboxArchiveSummary(tx);
  const blockedBy = await inspect.blockers(tx, true, false);
  const planSha256 = inspect.digest({
    formatVersion: 1,
    context,
    schemaSha256,
    before,
    pendingOutbox,
    archivesBefore,
    blockedBy,
    list,
  });
  return { schemaSha256, before, pendingOutbox, archivesBefore, blockedBy, planSha256 };
}

/** Çağıran ayrı hedef/DB kimliği ve freeze kapısını doğrular; önizleme salt okunur RR'dir. */
export async function previewNamespaceReset(tx: Tx, context: NamespaceResetContext) {
  const list = inspect.tables();
  const manifest = await resetContentManifest(tx, list);
  if (manifest.sha256 !== context.manifestSha256) throw new Error("GREAT_RESET_MANIFEST_MISMATCH");
  const result = await preparation(tx, context, list);
  return {
    mode: "DRY_RUN" as const,
    operationId: context.operationId,
    planSha256: result.planSha256,
    manifestSha256: manifest.sha256,
    blockedBy: result.blockedBy,
    cleared: list
      .filter((row) => row.cleared)
      .map((row) => ({ ...row, ...result.before.tables[row.table] })),
    preserved: list
      .filter((row) => !row.cleared)
      .map((row) => ({ ...row, ...result.before.tables[row.table] })),
  };
}

/** Aynı mutation çekirdeği ayrı pinli üretim ve sahipli prova profillerinde kullanılır. */
export async function executeNamespaceReset(
  tx: Tx,
  context: NamespaceResetContext,
  planSha256: string,
) {
  const list = inspect.tables();
  if (!/^[a-f0-9]{64}$/u.test(planSha256)) throw new Error("GREAT_RESET_CONFIRMATION_MISMATCH");
  // ReadCommitted: ilk veri snapshot'ı bütün tablo kilitlerinden SONRA alınır.
  await tx.$executeRaw(
    Prisma.sql`LOCK TABLE ${Prisma.join(
      [...list.map((row) => row.table), "_prisma_migrations"].sort().map(inspect.tableSql),
    )} IN ACCESS EXCLUSIVE MODE NOWAIT`,
  );
  await assertContext(tx, context);
  const lockedManifest = await resetContentManifest(tx, list);
  if (lockedManifest.sha256 !== context.manifestSha256)
    throw new Error("GREAT_RESET_MANIFEST_MISMATCH");
  const before = await preparation(tx, context, list);
  if (before.blockedBy.length) throw new Error("GREAT_RESET_PRECONDITIONS_FAILED");
  if (before.planSha256 !== planSha256) throw new Error("GREAT_RESET_STALE_PLAN");
  await tx.$queryRaw`SELECT set_config('agentsozluk.reset_operation',${context.operationId},true)`;
  const consumed = await tx.$executeRaw`
    UPDATE public.great_reset_intents SET "consumedAt"=clock_timestamp()
    WHERE "operationId"=${context.operationId}::uuid AND "releaseSha"=${context.releaseSha}
      AND "consumedAt" IS NULL AND "invalidatedAt" IS NULL AND "expiresAt">clock_timestamp()`;
  if (consumed !== 1) throw new Error("GREAT_RESET_INTENT_INVALID");
  const archiveId = await archivePendingOutboxEvents(
    tx,
    context.operationId,
    planSha256,
    before.pendingOutbox,
  );
  const topicRows = await tx.$executeRaw`
    INSERT INTO public.great_reset_tombstones (kind,uuid,"publicId","operationId")
    SELECT 'TOPIC',id,"publicId",${context.operationId}::uuid FROM ONLY public.topics`;
  const entryRows = await tx.$executeRaw`
    INSERT INTO public.great_reset_tombstones (kind,uuid,"publicId","operationId")
    SELECT 'ENTRY',id,"publicId",${context.operationId}::uuid FROM ONLY public.entries`;
  if (
    topicRows !== before.before.tables.topics?.rows ||
    entryRows !== before.before.tables.entries?.rows
  )
    throw new Error("GREAT_RESET_TOMBSTONE_MISMATCH");
  await tx.$executeRaw(
    Prisma.sql`TRUNCATE TABLE ${Prisma.join(list.filter((row) => row.cleared).map((row) => inspect.tableSql(row.table)))} CONTINUE IDENTITY RESTRICT`,
  );
  // DDL transaction'a bağlıdır; setval/nextval/RESTART IDENTITY kullanılmaz.
  for (const table of idTables) {
    await tx.$executeRaw(
      Prisma.sql`ALTER TABLE ONLY ${Prisma.raw(`public."${table}"`)} DROP CONSTRAINT ${Prisma.raw(`"${table}_public_id_legacy_range"`)}`,
    );
    await tx.$executeRaw(
      Prisma.sql`ALTER TABLE ONLY ${Prisma.raw(`public."${table}"`)} ADD CONSTRAINT ${Prisma.raw(`"${table}_public_id_reset_range"`)} CHECK ("publicId" BETWEEN 2147483648 AND 9007199254740991)`,
    );
    await tx.$executeRaw(
      Prisma.sql`ALTER SEQUENCE ${Prisma.raw(`public."${table}_public_id_seq"`)} MAXVALUE 9007199254740991 RESTART WITH 2147483648`,
    );
  }
  const expired = await tx.idempotencyRecord.updateMany({ data: { expiresAt: new Date(0) } });
  const counts = Object.fromEntries(
    list
      .filter((row) => row.cleared)
      .map((row) => [row.table, before.before.tables[row.table]!.rows]),
  );
  const protectedSha256 = inspect.digest(
    Object.fromEntries(
      list.filter((row) => !row.cleared).map((row) => [row.table, before.before.tables[row.table]]),
    ),
  );
  await tx.greatResetCommit.create({
    data: {
      operationId: context.operationId,
      releaseSha: context.releaseSha,
      manifestSha256: context.manifestSha256,
      planSha256,
      protectedSha256,
      clearedCounts: counts,
    },
  });
  const audit = await tx.auditLog.create({
    data: {
      action: "GREAT_RESET_PRODUCTION_EXECUTED",
      entityType: "AGENT_SOZLUK_DATABASE",
      entityId: context.operationId,
      requestId: context.operationId,
      metadata: {
        releaseSha: context.releaseSha,
        manifestSha256: context.manifestSha256,
        implementationSha256: context.implementationSha256,
        planSha256,
        protectedSha256,
        clearedCounts: counts,
        topicTombstones: topicRows,
        entryTombstones: entryRows,
        outboxArchiveId: archiveId,
        archivedOutboxRows: archiveId ? before.pendingOutbox.rows : 0,
        expiredIdempotencyRows: expired.count,
        scope: resetScope,
        policy: "ATOMIC_NAMESPACE_RESET_V1",
      },
    },
  });
  const after = await inspect.snapshot(
    tx,
    list,
    audit.id,
    archiveId ?? undefined,
    context.operationId,
  );
  for (const row of list)
    if (
      row.cleared
        ? after.tables[row.table]?.rows !== 0
        : inspect.digest(after.tables[row.table]) !==
          inspect.digest(before.before.tables[row.table])
    )
      throw new Error("GREAT_RESET_POSTCONDITION_FAILED");
  const withoutIds = (values: typeof after.sequences) =>
    values.filter((row) => !idTables.some((table) => row.name === `${table}_public_id_seq`));
  if (
    inspect.digest(withoutIds(after.sequences)) !==
      inspect.digest(withoutIds(before.before.sequences)) ||
    (await inspect.inspectSchema(tx, list, true)) !== before.schemaSha256 ||
    (await tx.idempotencyRecord.count({ where: { expiresAt: { not: new Date(0) } } })) ||
    (await inspect.blockers(tx, false, false)).length ||
    (await tx.greatResetTombstone.count()) !== topicRows + entryRows ||
    (await tx.greatResetCommit.count()) !== 1 ||
    (await tx.greatResetExposureEvent.count()) !== 0
  )
    throw new Error("GREAT_RESET_POSTCONDITION_FAILED");
  await assertResetNamespace(tx, "RESET");
  if (archiveId) await assertExpectedOutboxArchive(tx, archiveId, planSha256, before.pendingOutbox);
  const intent = await tx.greatResetIntent.findUniqueOrThrow({
    where: { operationId: context.operationId },
  });
  if (!intent.consumedAt || intent.invalidatedAt !== null)
    throw new Error("GREAT_RESET_POSTCONDITION_FAILED");
  const actualProtected: Record<string, { rows: number; sha256: string }> = {};
  for (const row of list.filter((row) => !row.cleared))
    actualProtected[row.table] = await inspect.fingerprint(tx, row.table);
  return {
    operationId: context.operationId,
    planSha256,
    manifestSha256: context.manifestSha256,
    normalizedProtectedSha256: protectedSha256,
    committedProtectedSha256: createHash("sha256")
      .update(JSON.stringify(actualProtected))
      .digest("hex"),
    clearedCounts: counts,
    topicTombstones: topicRows,
    entryTombstones: entryRows,
    outboxArchiveId: archiveId,
    expiredIdempotencyRows: expired.count,
    verified: true as const,
  };
}
