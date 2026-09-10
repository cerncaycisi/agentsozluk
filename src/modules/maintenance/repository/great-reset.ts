import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { hostname } from "node:os";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  assertCompleteResetClassification,
  greatResetClearedModels,
  greatResetPreservedModels,
} from "../domain/great-reset";
import { localResetIdentity, localResetTarget } from "../domain/great-reset-local-guard";
import {
  archivePendingOutboxEvents,
  assertExpectedOutboxArchive,
  outboxArchivesAreValid,
  pendingOutboxSnapshot,
  outboxArchiveSummary,
} from "./outbox-reset-archive";

type Request = (
  | { mode: "DRY_RUN" }
  | {
      mode: "EXECUTE";
      databaseName: string;
      planSha256: string;
    }
) & { archiveOutbox?: true };
type Fingerprint = { rows: number; sha256: string };
type Table = { model: string; table: string; cleared: boolean };
type Tx = Prisma.TransactionClient;

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function implementationDigest(): string {
  return digest([
    readFileSync(new URL(import.meta.url), "utf8"),
    readFileSync(new URL("./outbox-reset-archive.ts", import.meta.url), "utf8"),
    readFileSync(new URL("../../outbox/repository/pending.ts", import.meta.url), "utf8"),
    readFileSync(new URL("../domain/great-reset.ts", import.meta.url), "utf8"),
    readFileSync(new URL("../domain/great-reset-local-guard.ts", import.meta.url), "utf8"),
    readFileSync(new URL("../../../../scripts/great-reset-local.ts", import.meta.url), "utf8"),
    readFileSync(
      new URL("../../../../scripts/great-reset-local-guard.ts", import.meta.url),
      "utf8",
    ),
  ]);
}

function tables(): Table[] {
  const models = Prisma.dmmf.datamodel.models;
  const modelName = (name: string) => name[0]!.toLowerCase() + name.slice(1);
  assertCompleteResetClassification(models.map((model) => modelName(model.name)));
  const cleared = new Set<string>(greatResetClearedModels);
  return models
    .map((model) => ({
      model: modelName(model.name),
      table: model.dbName ?? model.name,
      cleared: cleared.has(modelName(model.name)),
    }))
    .sort((a, b) => a.table.localeCompare(b.table));
}

/** İsim yalnız doğrulanmış datamodel/katalog izin listesinden; SQL değeri değildir. */
function tableSql(table: string): Prisma.Sql {
  if (!/^[a-z_]+$/u.test(table)) throw new Error("GREAT_RESET_INVALID_TABLE");
  return Prisma.raw(`ONLY "public"."${table}"`);
}

async function fingerprint(
  tx: Tx,
  table: string,
  auditId?: string,
  archiveId?: string,
): Promise<Fingerprint> {
  // Satırlar/credential içerikleri istemciye veya log'a taşınmaz; özet DB'de hesaplanır.
  const projection =
    table === "idempotency_records"
      ? Prisma.sql`to_jsonb(t) - 'expiresAt'`
      : Prisma.sql`to_jsonb(t)`;
  const filter =
    table === "audit_logs" && auditId
      ? Prisma.sql`WHERE t.id <> ${auditId}::uuid`
      : table === "outbox_reset_archives" && archiveId
        ? Prisma.sql`WHERE t.id <> ${archiveId}::uuid`
        : table === "outbox_reset_archive_events" && archiveId
          ? Prisma.sql`WHERE t."archiveId" <> ${archiveId}::uuid`
          : Prisma.empty;
  const [result] = await tx.$queryRaw<Fingerprint[]>(Prisma.sql`
    WITH row_hashes AS MATERIALIZED (
      SELECT encode(sha256(convert_to((${projection})::text, 'UTF8')), 'hex') AS row_hash
      FROM ${tableSql(table)} t ${filter}
    )
    SELECT count(*)::int AS rows,
      encode(sha256(convert_to(coalesce(string_agg(row_hash,
        E'\n' ORDER BY row_hash COLLATE "C"), ''), 'UTF8')), 'hex') AS sha256
    FROM row_hashes
  `);
  if (!result) throw new Error("GREAT_RESET_FINGERPRINT_FAILED");
  return result;
}

async function snapshot(tx: Tx, list: Table[], auditId?: string, archiveId?: string) {
  const result: Record<string, Fingerprint> = {};
  for (const { table } of list) result[table] = await fingerprint(tx, table, auditId, archiveId);
  // expiresAt ayrıca plan hash'ine girer; koruma karşılaştırmasında tek istisnadır.
  const expiry = await tx.$queryRaw<{ sha256: string }[]>`
    SELECT encode(sha256(convert_to(coalesce(string_agg(id::text || ':' ||
      "expiresAt"::text, ',' ORDER BY id), ''), 'UTF8')), 'hex') AS sha256
    FROM public.idempotency_records`;
  const sequences = await tx.$queryRaw<{ name: string; value: string | null }[]>`
    SELECT sequencename AS name, last_value::text AS value FROM pg_sequences
    WHERE schemaname = 'public' ORDER BY sequencename`;
  return { tables: result, expiry, sequences };
}

async function identity(tx: Tx, databaseName: string) {
  const [actual] = await tx.$queryRaw<
    {
      database: string;
      oid: string;
      owner: string;
      user: string;
      host: string;
      port: number;
      version: number;
      cluster: string;
      marker: string | null;
    }[]
  >`
    SELECT current_database() AS database, d.oid::text AS oid,
      pg_get_userbyid(d.datdba) AS owner, current_user AS user,
      host(inet_server_addr()) AS host, inet_server_port() AS port,
      current_setting('server_version_num')::int AS version,
      (SELECT system_identifier::text FROM pg_control_system()) AS cluster,
      shobj_description(d.oid, 'pg_database') AS marker
    FROM pg_database d WHERE datname = current_database()`;
  if (
    !actual ||
    actual.database !== databaseName ||
    actual.host !== "127.0.0.1" ||
    actual.port !== 5432 ||
    actual.version < 160000 ||
    actual.version >= 170000 ||
    actual.owner !== localResetIdentity.owner ||
    actual.user !== localResetIdentity.owner ||
    actual.cluster !== localResetIdentity.clusterId ||
    actual.marker !== localResetIdentity.marker
  ) {
    throw new Error("GREAT_RESET_DATABASE_IDENTITY_MISMATCH");
  }
  return actual;
}

async function inspectSchema(tx: Tx, list: Table[]) {
  const actual = await tx.$queryRaw<{ name: string; kind: string }[]>`
    SELECT c.relname AS name, c.relkind::text AS kind FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p','f','m','v') ORDER BY c.relname COLLATE "C"`;
  const expected = [...list.map(({ table }) => table), "_prisma_migrations"].sort();
  if (
    JSON.stringify(actual.map((row) => row.name)) !== JSON.stringify(expected) ||
    actual.some((row) => row.kind !== "r")
  )
    throw new Error("GREAT_RESET_DATABASE_SCHEMA_MISMATCH");
  const inheritance = await tx.$queryRaw<{ count: number }[]>`
    SELECT count(*)::int AS count FROM pg_inherits
    WHERE inhparent IN (SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace)
       OR inhrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace)`;
  if (inheritance[0]?.count !== 0) throw new Error("GREAT_RESET_INHERITANCE_FORBIDDEN");
  // Veritabanında eklenmiş FK/trigger/kolon değişimi de önizlemeyi eskitsin.
  const structure = await tx.$queryRaw<{ description: string }[]>`
    SELECT jsonb_build_object(
      'columns', (SELECT jsonb_agg(to_jsonb(c) ORDER BY table_name, ordinal_position)
        FROM information_schema.columns c WHERE table_schema = 'public'),
      'constraints', (SELECT jsonb_agg(pg_get_constraintdef(oid) ORDER BY conrelid, conname)
        FROM pg_constraint WHERE connamespace = 'public'::regnamespace),
      'triggers', (SELECT jsonb_agg(jsonb_build_array(pg_get_triggerdef(t.oid),
        t.tgenabled, pg_get_functiondef(t.tgfoid)) ORDER BY t.tgrelid, t.tgname)
        FROM pg_trigger t WHERE NOT t.tgisinternal AND
          t.tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace))
    )::text AS description`;
  const migration = await fingerprint(tx, "_prisma_migrations");
  return digest({ structure, migration });
}

async function blockers(tx: Tx, archiveOutbox = false): Promise<string[]> {
  const result: string[] = [];
  const settings = await tx.agentGlobalSettings.findMany({
    select: {
      id: true,
      runtimeEnabled: true,
      schedulerEnabled: true,
      publicWriteEnabled: true,
      publishEnabled: true,
    },
  });
  if (
    settings.length !== 1 ||
    settings[0]?.id !== "global" ||
    settings.some(
      (row) =>
        row.runtimeEnabled || row.schedulerEnabled || row.publicWriteEnabled || row.publishEnabled,
    )
  ) {
    result.push("RUNTIME_NOT_PAUSED");
  }
  if (
    await tx.agentRun.count({
      where: {
        OR: [
          { runStatus: { in: ["QUEUED", "RUNNING", "CANCEL_REQUESTED"] } },
          { leaseOwner: { not: null } },
          { leaseToken: { not: null } },
          { leaseExpiresAt: { not: null } },
        ],
      },
    })
  )
    result.push("RUNS_OR_LEASES_PRESENT");
  if (
    await tx.agentRuntimeState.count({
      where: {
        OR: [
          { currentRunId: { not: null } },
          {
            runtimeStatus: {
              notIn: ["IDLE", "SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED", "TIMED_OUT"],
            },
          },
        ],
      },
    })
  )
    result.push("RUNTIME_STATE_ACTIVE");
  if (
    !archiveOutbox &&
    (await tx.outboxEvent.count({ where: { processedAt: null, resetArchive: null } }))
  )
    result.push("OUTBOX_PENDING");
  if (!(await outboxArchivesAreValid(tx))) result.push("OUTBOX_ARCHIVE_INVALID");
  const [connections] = await tx.$queryRaw<{ count: number }[]>`
    SELECT count(*)::int AS count FROM pg_stat_activity
    WHERE datname = current_database() AND pid <> pg_backend_pid() AND backend_type = 'client backend'`;
  if (connections?.count !== 0) result.push("OTHER_DATABASE_CONNECTIONS");
  return result;
}

/** Üretim aracı değildir. Hedef kapısı bu repository girişinde de zorunludur. */
export async function runLocalGreatReset(value: string | undefined, request: Request) {
  const target = localResetTarget(value, hostname());
  if (
    request.mode === "EXECUTE" &&
    (request.databaseName !== target.databaseName || !/^[a-f0-9]{64}$/u.test(request.planSha256))
  )
    throw new Error("GREAT_RESET_CONFIRMATION_MISMATCH");
  const list = tables();
  const archiveOutbox = request.archiveOutbox === true;
  const outboxPolicy = archiveOutbox
    ? "ARCHIVE_PENDING_KEEP_ROWS"
    : "REQUIRE_NO_UNARCHIVED_PENDING_KEEP_ROWS";
  const implementationSha256 = implementationDigest();
  const database = new PrismaClient({ datasourceUrl: target.databaseUrl, log: [] });
  try {
    return await database.$transaction(
      async (tx) => {
        if (request.mode === "DRY_RUN") await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        await tx.$executeRaw`SET LOCAL statement_timeout = '20s'`;
        await tx.$executeRaw`SET LOCAL lock_timeout = '1s'`;
        await tx.$executeRaw`SET LOCAL timezone = 'UTC'`;
        await tx.$executeRaw`SET LOCAL extra_float_digits = 3`;
        const actual = await identity(tx, target.databaseName);
        if (request.mode === "EXECUTE") {
          // Önce tüm tablo yazıcılarını dışla. Bekleyen işlem varsa bekleme/öldürme yok.
          await tx.$executeRaw(
            Prisma.sql`LOCK TABLE ${Prisma.join(
              [...list.map(({ table }) => table), "_prisma_migrations"].sort().map(tableSql),
            )} IN ACCESS EXCLUSIVE MODE NOWAIT`,
          );
        }
        const schemaSha256 = await inspectSchema(tx, list);
        const before = await snapshot(tx, list);
        const pendingOutbox = await pendingOutboxSnapshot(tx);
        const archivesBefore = await outboxArchiveSummary(tx);
        const blockedBy = await blockers(tx, archiveOutbox);
        const planSha256 = digest({
          version: 2,
          outboxPolicy,
          pendingOutbox,
          ...archivesBefore,
          implementationSha256,
          actual,
          schemaSha256,
          before,
          blockedBy,
          cleared: greatResetClearedModels,
          preserved: greatResetPreservedModels,
        });
        const report = {
          mode: request.mode,
          database: actual.database,
          planSha256,
          implementationSha256,
          blockedBy,
          cleared: list
            .filter((row) => row.cleared)
            .map((row) => ({
              model: row.model,
              table: row.table,
              rows: before.tables[row.table]!.rows,
            })),
          preserved: list
            .filter((row) => !row.cleared)
            .map((row) => ({
              model: row.model,
              table: row.table,
              rows: before.tables[row.table]!.rows,
            })),
          idempotencyPolicy: "EXPIRE_ALL_KEEP_ROWS",
          outboxPolicy,
          pendingOutbox,
          ...archivesBefore,
        };
        if (request.mode === "DRY_RUN") return report;
        if (blockedBy.length) throw new Error("GREAT_RESET_PRECONDITIONS_FAILED");
        if (planSha256 !== request.planSha256) throw new Error("GREAT_RESET_STALE_PLAN");

        const resetId = randomUUID();
        const outboxArchiveId = archiveOutbox
          ? await archivePendingOutboxEvents(tx, resetId, planSha256, pendingOutbox)
          : null;

        // Ayrıcalıklı yerel operasyon: DELETE trigger'ları çalışmaz. Tanımları değişmez.
        // Tek komutta FK kapanışı zorunlu; bilinmeyen bağımlılık varsa RESTRICT reddeder.
        await tx.$executeRaw(
          Prisma.sql`TRUNCATE TABLE ${Prisma.join(
            list.filter((row) => row.cleared).map(({ table }) => tableSql(table)),
          )} CONTINUE IDENTITY RESTRICT`,
        );
        const expired = await tx.idempotencyRecord.updateMany({ data: { expiresAt: new Date(0) } });
        const audit = await tx.auditLog.create({
          data: {
            action: "GREAT_RESET_LOCAL_EXECUTED",
            entityType: "LOCAL_SYNTHETIC_DATABASE",
            entityId: resetId,
            requestId: resetId,
            metadata: {
              planSha256,
              cleared: report.cleared,
              expiredIdempotencyRows: expired.count,
              outboxPolicy,
              outboxArchiveId,
              archivedOutboxRows: outboxArchiveId ? pendingOutbox.rows : 0,
              archivesBefore,
              policy: "TRUNCATE_ONLY_CONTINUE_IDENTITY_RESTRICT",
              scope: "LOCAL_SYNTHETIC_ONLY",
            },
          },
        });
        const after = await snapshot(tx, list, audit.id, outboxArchiveId ?? undefined);
        if (outboxArchiveId)
          await assertExpectedOutboxArchive(tx, outboxArchiveId, planSha256, pendingOutbox);
        for (const { table, cleared } of list) {
          if (
            cleared
              ? after.tables[table]?.rows !== 0
              : digest(before.tables[table]) !== digest(after.tables[table])
          ) {
            throw new Error("GREAT_RESET_POSTCONDITION_FAILED");
          }
        }
        if (
          digest(before.sequences) !== digest(after.sequences) ||
          (await inspectSchema(tx, list)) !== schemaSha256 ||
          (await tx.idempotencyRecord.count({ where: { expiresAt: { not: new Date(0) } } })) ||
          (await blockers(tx)).length
        )
          throw new Error("GREAT_RESET_POSTCONDITION_FAILED");
        return {
          ...report,
          resetId,
          outboxArchiveId,
          archivedOutboxRows: outboxArchiveId ? pendingOutbox.rows : 0,
          ...(await outboxArchiveSummary(tx)),
          expiredIdempotencyRows: expired.count,
          verified: true,
        };
      },
      {
        // Execute tüm tablo kilitlerinden SONRA güncel veriyi okumalı.
        // Daha erken alınmış MVCC snapshot'ı TRUNCATE ile güvenli değildir.
        isolationLevel: request.mode === "DRY_RUN" ? "RepeatableRead" : "ReadCommitted",
        timeout: 60_000,
        maxWait: 5_000,
      },
    );
  } catch (error) {
    // Yalnız sabit güvenli neden kodları; SQL, hata mesajı veya satır içeriği çıkmaz.
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2010" && error.meta?.code === "55P03")
        throw new Error("GREAT_RESET_LOCK_NOT_AVAILABLE");
      if (error.code === "P2010" && error.meta?.code === "57014")
        throw new Error("GREAT_RESET_QUERY_CANCELLED");
      if (error.code === "P2028") throw new Error("GREAT_RESET_TRANSACTION_FAILED");
    }
    throw error;
  } finally {
    await database.$disconnect();
  }
}
