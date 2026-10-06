import { hostname } from "node:os";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  assertResetOperation,
  productionResetTarget,
  productionShadowResetTarget,
  rehearsalResetTarget,
  resetScope,
  type ProductionResetInvocation,
} from "../domain/great-reset-production-guard";
import { greatResetInspection as inspect } from "./great-reset";
import { resetContentManifest } from "./great-reset-manifest";
import { requireResetGenerationAdmission } from "./reset-generation-admission";
import {
  resetMirrorDatabaseOid,
  type ResetGenerationMirror,
} from "../domain/reset-generation-admission";
import {
  assertResetNamespace,
  executeNamespaceReset,
  previewNamespaceReset,
  type NamespaceResetContext,
} from "./great-reset-production";

type Tx = Prisma.TransactionClient;
type Target =
  | ReturnType<typeof productionResetTarget>
  | ReturnType<typeof rehearsalResetTarget>
  | ReturnType<typeof productionShadowResetTarget>;
export type ResetExecutionRequest = (
  | { mode: "MANIFEST" }
  | { mode: "PREPARE_INTENT"; operationId: string }
  | { mode: "INVALIDATE_INTENT"; operationId: string }
  | { mode: "PREVIEW"; context: NamespaceResetContext }
  | { mode: "EXECUTE"; context: NamespaceResetContext; planSha256: string }
  | { mode: "EXPOSURE"; operationId: string; journalSha256: string }
) & { releaseSha: string };

async function settings(tx: Tx, readOnly: boolean) {
  if (readOnly) await tx.$executeRaw`SET TRANSACTION READ ONLY`;
  await tx.$executeRaw`SET LOCAL statement_timeout='300s'`;
  await tx.$executeRaw`SET LOCAL lock_timeout='1s'`;
  await tx.$executeRaw`SET LOCAL idle_in_transaction_session_timeout='60s'`;
  await tx.$executeRaw`SET LOCAL client_connection_check_interval='5s'`;
  await tx.$executeRaw`SET LOCAL timezone='UTC'`;
  await tx.$executeRaw`SET LOCAL extra_float_digits=3`;
  await tx.$executeRaw`SET LOCAL row_security=off`;
}
async function identity(
  tx: Tx,
  target: Target,
  expectedOid?: string,
  restoredCanonicalOid?: string,
) {
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
      pid: number;
      allow: boolean;
    }[]
  >`
    SELECT current_database() AS database,d.oid::text AS oid,pg_get_userbyid(d.datdba) AS owner,current_user AS user,
      host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('server_version_num')::int AS version,
      (SELECT system_identifier::text FROM pg_control_system()) AS cluster,shobj_description(d.oid,'pg_database') AS marker,
      pg_backend_pid() AS pid,d.datallowconn AS allow FROM pg_database d WHERE datname=current_database()`;
  if (
    !actual ||
    actual.database !== target.databaseName ||
    actual.owner !== target.identity.owner ||
    actual.user !== target.identity.owner ||
    actual.host !== target.host ||
    actual.port !== target.identity.port ||
    actual.cluster !== target.identity.clusterId ||
    actual.version < 160000 ||
    actual.version >= 170000 ||
    (expectedOid && actual.oid !== expectedOid) ||
    ("databaseOid" in target.identity
      ? actual.oid !== (restoredCanonicalOid ?? target.identity.databaseOid)
      : actual.oid === "16385" || actual.marker !== target.identity.marker)
  )
    throw new Error("GREAT_RESET_DATABASE_IDENTITY_MISMATCH");
  return actual;
}
async function assertFrozen(tx: Tx) {
  await assertResetNamespace(tx, "LEGACY");
  await inspect.inspectSchema(tx, inspect.tables());
  if ((await inspect.blockers(tx, true, false)).length)
    throw new Error("GREAT_RESET_PRECONDITIONS_FAILED");
}
function nameSql(target: Target) {
  if (
    target.databaseName !== "agent_sozluk" &&
    !/^agent_sozluk_reset_[a-f0-9]{32}_test$/u.test(target.databaseName)
  )
    throw new Error("GREAT_RESET_INVALID_TARGET");
  return Prisma.raw(`"${target.databaseName}"`);
}

/** Bu kontrol bağlantısı yalnız aynı host/role postgres DB'sinden türetilir. */
async function controlGate(
  control: PrismaClient,
  target: Target,
  oid: string,
  allow: boolean,
  pinnedPid: number | null,
) {
  await control.$transaction(
    async (tx) => {
      await settings(tx, false);
      const [actual] = await tx.$queryRaw<
        {
          oid: string;
          owner: string;
          cluster: string;
          host: string;
          user: string;
          port: number;
          allow: boolean;
        }[]
      >`
      SELECT d.oid::text AS oid,pg_get_userbyid(d.datdba) AS owner,
        (SELECT system_identifier::text FROM pg_control_system()) AS cluster,host(inet_server_addr()) AS host,
        current_user AS user,inet_server_port() AS port,d.datallowconn AS allow
      FROM pg_database d WHERE datname=${target.databaseName}`;
      if (
        !actual ||
        actual.oid !== oid ||
        actual.owner !== target.identity.owner ||
        actual.cluster !== target.identity.clusterId ||
        actual.host !== target.host ||
        actual.user !== target.identity.owner ||
        actual.port !== target.identity.port ||
        actual.allow === allow
      )
        throw new Error("GREAT_RESET_CONTROL_IDENTITY_MISMATCH");
      await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_stat_clear_snapshot()) AS cleared`;
      const [sessions] = await tx.$queryRaw<{ others: number; pinned: number; prepared: number }[]>`
      SELECT (SELECT count(*)::int FROM pg_stat_activity WHERE datname=${target.databaseName} AND
        (${pinnedPid}::int IS NULL OR pid<>${pinnedPid}::int)) AS others,
        (SELECT count(*)::int FROM pg_stat_activity WHERE datname=${target.databaseName} AND pid=${pinnedPid}::int) AS pinned,
        (SELECT count(*)::int FROM pg_prepared_xacts WHERE database=${target.databaseName}) AS prepared`;
      if (
        !sessions ||
        sessions.others !== 0 ||
        sessions.prepared !== 0 ||
        (pinnedPid !== null && sessions.pinned !== 1)
      )
        throw new Error("GREAT_RESET_CONTROL_CONNECTIONS_PRESENT");
      await tx.$executeRaw(
        Prisma.sql`ALTER DATABASE ${nameSql(target)} WITH ALLOW_CONNECTIONS ${allow ? Prisma.sql`true` : Prisma.sql`false`}`,
      );
      const [post] = await tx.$queryRaw<
        { allow: boolean }[]
      >`SELECT datallowconn AS allow FROM pg_database WHERE oid=${BigInt(oid)}::oid AND datname=${target.databaseName}`;
      if (post?.allow !== allow) throw new Error("GREAT_RESET_CONTROL_GATE_FAILED");
    },
    { timeout: 30000, maxWait: 5000 },
  );
}

async function run(target: Target, request: ResetExecutionRequest, expectedOid?: string) {
  if (!/^[a-f0-9]{40}$/u.test(request.releaseSha)) throw new Error("GREAT_RESET_RELEASE_REQUIRED");
  if ("context" in request && request.context.releaseSha !== request.releaseSha)
    throw new Error("GREAT_RESET_CONFIRMATION_MISMATCH");
  if ("operationId" in request) assertResetOperation(request.operationId);
  const database = new PrismaClient({ datasourceUrl: target.databaseUrl, log: [] });
  const control = new PrismaClient({ datasourceUrl: target.controlUrl, log: [] });
  let gateOid: string | null = null;
  try {
    return await database.$transaction(
      async (tx) => {
        const readOnly = request.mode === "MANIFEST" || request.mode === "PREVIEW";
        await settings(tx, readOnly);
        const actual = await identity(tx, target, expectedOid);
        if (!actual.allow) throw new Error("GREAT_RESET_INITIAL_GATE_CLOSED");
        if (
          "context" in request &&
          "databaseOid" in target.identity &&
          (request.context.databaseOid !== actual.oid ||
            request.context.clusterId !== actual.cluster)
        )
          throw new Error("GREAT_RESET_SOURCE_IDENTITY_MISMATCH");
        if (request.mode === "EXECUTE") {
          await controlGate(control, target, actual.oid, false, actual.pid);
          gateOid = actual.oid;
          const pinned = await identity(tx, target, actual.oid);
          if (pinned.allow || pinned.pid !== actual.pid)
            throw new Error("GREAT_RESET_CONTROL_GATE_FAILED");
          return executeNamespaceReset(tx, request.context, request.planSha256);
        }
        if (request.mode === "PREVIEW") return previewNamespaceReset(tx, request.context);
        if (request.mode === "MANIFEST") {
          await assertFrozen(tx);
          return resetContentManifest(tx, inspect.tables());
        }
        await tx.$queryRaw`SELECT set_config('agentsozluk.reset_operation',${request.operationId},true)`;
        if (request.mode === "PREPARE_INTENT") {
          await assertFrozen(tx);
          if (
            (await tx.greatResetCommit.count()) ||
            (await tx.greatResetTombstone.count()) ||
            (await tx.greatResetExposureEvent.count())
          )
            throw new Error("GREAT_RESET_ALREADY_EXECUTED");
          const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
          if (!clock) throw new Error("GREAT_RESET_INTENT_INVALID");
          const intent = await tx.greatResetIntent.create({
            data: {
              operationId: request.operationId,
              releaseSha: request.releaseSha,
              scope: resetScope,
              sourceDatabaseOid: BigInt(actual.oid),
              sourceClusterId: actual.cluster,
              createdAt: clock.now,
              expiresAt: new Date(clock.now.getTime() + 2 * 3600_000),
            },
          });
          await tx.auditLog.create({
            data: {
              action: "GREAT_RESET_PRODUCTION_INTENT_CREATED",
              entityType: "AGENT_SOZLUK_DATABASE",
              entityId: request.operationId,
              requestId: request.operationId,
              metadata: { releaseSha: request.releaseSha, scope: resetScope },
            },
          });
          return {
            operationId: request.operationId,
            releaseSha: request.releaseSha,
            createdAt: intent.createdAt,
            expiresAt: intent.expiresAt,
            sourceDatabaseOid: actual.oid,
            sourceClusterId: actual.cluster,
          };
        }
        if (request.mode === "INVALIDATE_INTENT") {
          if (await tx.greatResetCommit.count()) throw new Error("GREAT_RESET_ALREADY_EXECUTED");
          const count =
            await tx.$executeRaw`UPDATE public.great_reset_intents SET "invalidatedAt"=clock_timestamp()
          WHERE "operationId"=${request.operationId}::uuid AND "releaseSha"=${request.releaseSha}
            AND "consumedAt" IS NULL AND "invalidatedAt" IS NULL`;
          if (count !== 1) throw new Error("GREAT_RESET_INTENT_INVALID");
          await tx.auditLog.create({
            data: {
              action: "GREAT_RESET_PRODUCTION_INTENT_INVALIDATED",
              entityType: "AGENT_SOZLUK_DATABASE",
              entityId: request.operationId,
              requestId: request.operationId,
              metadata: { releaseSha: request.releaseSha },
            },
          });
          return { operationId: request.operationId, invalidated: true };
        }
        if (!/^[a-f0-9]{64}$/u.test(request.journalSha256))
          throw new Error("GREAT_RESET_EXPOSURE_JOURNAL_REQUIRED");
        const commit = await tx.greatResetCommit.findUnique({
          where: { operationId: request.operationId },
        });
        if (
          !commit ||
          commit.releaseSha !== request.releaseSha ||
          (await tx.auditLog.count({ where: { action: "GREAT_RESET_PRODUCTION_RESTORE" } }))
        )
          throw new Error("GREAT_RESET_EXPOSURE_NOT_ALLOWED");
        await assertResetNamespace(tx, "RESET");
        const frozen = await tx.agentGlobalSettings.findMany({
          select: {
            id: true,
            runtimeEnabled: true,
            schedulerEnabled: true,
            publishEnabled: true,
            publicWriteEnabled: true,
          },
        });
        if (
          frozen.length !== 1 ||
          frozen[0]?.id !== "global" ||
          frozen.some(
            (row) =>
              row.runtimeEnabled ||
              row.schedulerEnabled ||
              row.publishEnabled ||
              row.publicWriteEnabled,
          )
        )
          throw new Error("GREAT_RESET_EXPOSURE_NOT_FROZEN");
        for (const table of inspect.tables().filter((row) => row.cleared)) {
          const [count] = await tx.$queryRaw<{ rows: number }[]>(
            Prisma.sql`SELECT count(*)::int AS rows FROM ${inspect.tableSql(table.table)}`,
          );
          if (count?.rows !== 0) throw new Error("GREAT_RESET_EXPOSURE_NEW_STATE_PRESENT");
        }
        const prior = await tx.greatResetExposureEvent.findUnique({
          where: { operationId: request.operationId },
        });
        if (prior && prior.journalSha256 !== request.journalSha256)
          throw new Error("GREAT_RESET_EXPOSURE_JOURNAL_MISMATCH");
        if (!prior)
          await tx.greatResetExposureEvent.create({
            data: { operationId: request.operationId, journalSha256: request.journalSha256 },
          });
        const event = await tx.greatResetExposureEvent.findUniqueOrThrow({
          where: { operationId: request.operationId },
        });
        return {
          operationId: event.operationId,
          journalSha256: event.journalSha256,
          occurredAt: event.occurredAt,
        };
      },
      {
        isolationLevel:
          request.mode === "MANIFEST" || request.mode === "PREVIEW"
            ? "RepeatableRead"
            : "ReadCommitted",
        timeout: 900000,
        maxWait: 5000,
      },
    );
  } finally {
    // Belirsiz COMMIT'te yeniden yürütme/restore yok. Önce kendi backend biter, sonra kapı açılır.
    await database.$disconnect();
    try {
      if (gateOid) await controlGate(control, target, gateOid, true, null);
    } finally {
      await control.$disconnect();
    }
  }
}

function assertActualProductionInvocation(invocation: ProductionResetInvocation): void {
  if (
    hostname() !== "agent-sozluk-prod" ||
    invocation.hostname !== hostname() ||
    invocation.cwd !== process.cwd() ||
    invocation.approvedSha !== process.env.AGENT_SOZLUK_PRODUCTION_APPROVED_SHA
  )
    throw new Error("GREAT_RESET_PRODUCTION_HOST_REQUIRED");
}

export function runProductionReset(
  value: string | undefined,
  invocation: ProductionResetInvocation,
  request: ResetExecutionRequest,
) {
  // Guard repository girişinde tekrar zorunlu; hedef URL'yi çağıran serbestçe seçemez.
  assertActualProductionInvocation(invocation);
  return run(productionResetTarget(value, invocation), request);
}
export async function verifyProductionResetMirror(
  value: string | undefined,
  invocation: ProductionResetInvocation,
  mirror: ResetGenerationMirror,
): Promise<void> {
  assertActualProductionInvocation(invocation);
  const target = productionResetTarget(value, invocation);
  if (
    mirror.databaseOid !== target.identity.databaseOid ||
    mirror.clusterId !== target.identity.clusterId
  )
    throw new Error("GREAT_RESET_DATABASE_IDENTITY_MISMATCH");
  const effectiveOid = resetMirrorDatabaseOid(mirror);
  const database = new PrismaClient({ datasourceUrl: target.databaseUrl, log: [] });
  try {
    await database.$transaction(
      async (tx) => {
        await settings(tx, true);
        const actual = await identity(
          tx,
          target,
          effectiveOid,
          mirror.state === "ROLLED_BACK" ? effectiveOid : undefined,
        );
        if (!actual.allow) throw new Error("GREAT_RESET_INITIAL_GATE_CLOSED");
        await requireResetGenerationAdmission(tx, mirror, true);
      },
      { isolationLevel: "RepeatableRead", timeout: 30000, maxWait: 5000 },
    );
  } finally {
    await database.$disconnect();
  }
}
export async function assertProductionResetFreeze(
  value: string | undefined,
  invocation: ProductionResetInvocation,
): Promise<void> {
  assertActualProductionInvocation(invocation);
  const target = productionResetTarget(value, invocation);
  const database = new PrismaClient({ datasourceUrl: target.databaseUrl, log: [] });
  try {
    await database.$transaction(
      async (tx) => {
        await settings(tx, true);
        const actual = await identity(tx, target);
        if (!actual.allow) throw new Error("GREAT_RESET_INITIAL_GATE_CLOSED");
        await assertFrozen(tx);
      },
      { isolationLevel: "RepeatableRead", timeout: 30000, maxWait: 5000 },
    );
  } finally {
    await database.$disconnect();
  }
}
export function runRehearsalReset(
  value: string | undefined,
  operationId: string,
  expectedOid: string,
  request: ResetExecutionRequest,
) {
  if (!/^[1-9][0-9]*$/u.test(expectedOid) || expectedOid === "16385")
    throw new Error("GREAT_RESET_REHEARSAL_OID_REQUIRED");
  if (
    ("operationId" in request && request.operationId !== operationId) ||
    ("context" in request && request.context.operationId !== operationId)
  )
    throw new Error("GREAT_RESET_CONFIRMATION_MISMATCH");
  return run(rehearsalResetTarget(value, operationId, hostname()), request, expectedOid);
}

export function runProductionShadowReset(
  value: string | undefined,
  invocation: ProductionResetInvocation,
  operationId: string,
  expectedOid: string,
  request: ResetExecutionRequest,
) {
  if (request.mode === "PREPARE_INTENT" || request.mode === "INVALIDATE_INTENT")
    throw new Error("GREAT_RESET_SHADOW_REQUIRES_RESTORED_INTENT");
  if (
    ("operationId" in request && request.operationId !== operationId) ||
    ("context" in request &&
      (request.context.operationId !== operationId ||
        request.context.databaseOid !== "16385" ||
        request.context.clusterId !== "7663503447447879713"))
  )
    throw new Error("GREAT_RESET_CONFIRMATION_MISMATCH");
  assertActualProductionInvocation(invocation);
  const target = productionShadowResetTarget(value, invocation, operationId, expectedOid);
  return run(target, request, expectedOid);
}
