import { runtimeReadTopicLimit } from "@/modules/agents/validation/runtime-schemas";
import { Prisma, type AgentRunType } from "@prisma/client";
import type { DatabaseExecutor } from "@/lib/db/types";
import { createOpaqueToken } from "@/lib/security/crypto";
import type { WeeklyPersonaEvolutionDelta } from "@/modules/agents/domain/persona-evolution";
import {
  runtimeRunAllowedInOperatingMode,
  type RuntimeOperatingMode,
} from "@/modules/agents/domain/runtime-controls";
import {
  runtimeDiscoverySourceStatuses,
  runtimePresentableSourceStatuses,
  runtimeResultRecordableSourceStatuses,
  runtimeSourceStatusesForEvidenceType,
  runtimeSourceEvidenceTypeForStatus,
  isRuntimeProbationEntrySourceStatus,
} from "@/modules/agents/domain/source-status";
import { collectEntryReferenceCandidates } from "@/modules/entries/domain/renderer";
import { topicFeedWindowStart } from "@/modules/feeds/domain/feed";
import {
  listChronologicalTopics,
  listScoredTopics,
  listTopEntryPerTopic,
} from "@/modules/feeds/repository/feeds";
import { normalizeTopicTitle } from "@/modules/topics/domain/normalization";
import {
  publiclyVisibleEntrySql,
  publiclyVisibleEntryWhere,
} from "@/modules/entries/repository/public-visibility";

export function findRuntimeCredentialByHash(client: DatabaseExecutor, tokenHash: string) {
  return client.agentCredential.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      agentProfileId: true,
      scopes: true,
      expiresAt: true,
      revokedAt: true,
      agentProfile: {
        select: {
          lifecycleStatus: true,
          user: {
            select: {
              id: true,
              kind: true,
              role: true,
              status: true,
              loginDisabled: true,
            },
          },
        },
      },
    },
  });
}

export function touchRuntimeCredential(client: DatabaseExecutor, credentialId: string) {
  return client.agentCredential.update({
    where: { id: credentialId },
    data: { lastUsedAt: new Date() },
    select: { id: true },
  });
}

export function findRuntimeLeaseForIdempotencyReplay(
  client: DatabaseExecutor,
  input: { runId: string; agentProfileId: string; workerId: string; now: Date },
) {
  return client.agentRun.findFirst({
    where: {
      id: input.runId,
      agentProfileId: input.agentProfileId,
      leaseOwner: input.workerId,
      runStatus: { in: ["RUNNING", "CANCEL_REQUESTED"] },
      leaseExpiresAt: { gte: input.now },
    },
    select: { leaseToken: true },
  });
}

export async function getRuntimeGlobalSettings(transaction: Prisma.TransactionClient) {
  return transaction.agentGlobalSettings.findUniqueOrThrow({
    where: { id: "global" },
    select: {
      runtimeEnabled: true,
      publishEnabled: true,
      publicWriteEnabled: true,
      runtimeOperatingMode: true,
      sourceReadingEnabled: true,
      votingEnabled: true,
      topicCreationEnabled: true,
      userFollowingEnabled: true,
      personaEvolutionEnabled: true,
      sourceEvolutionEnabled: true,
      duplicateSimilarityThreshold: true,
      maxRetryCount: true,
      schedulerEnabled: true,
      scheduledTimeoutSeconds: true,
      reflectionTimeoutSeconds: true,
      sourceRefreshTimeoutSeconds: true,
      sourceFetchLimit: true,
      debugRetentionHours: true,
      codexConcurrency: true,
      circuitBreakerConfig: true,
    },
  });
}

export async function getLatestRuntimeCircuitBreakerSnapshot(
  transaction: Prisma.TransactionClient,
): Promise<string[]> {
  const record = await transaction.agentRuntimeEvent.findFirst({
    where: { agentProfileId: null, eventType: "runtime.circuit_breaker.snapshot" },
    orderBy: { id: "desc" },
    select: { metadata: true },
  });
  if (!record?.metadata || typeof record.metadata !== "object" || Array.isArray(record.metadata))
    return [];
  const activeCodes = (record.metadata as Record<string, unknown>).activeCodes;
  if (!Array.isArray(activeCodes)) return [];
  return [
    ...new Set(activeCodes.filter((code): code is string => typeof code === "string")),
  ].sort();
}

export async function lockRuntimeRun(
  transaction: Prisma.TransactionClient,
  runId: string,
): Promise<void> {
  const key = `agent-run:${runId}`;
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

/**
 * Serializes runtime mutations with both operator commands (advisory lock) and
 * lease claim/reclaim (the AgentRun row lock used by `FOR UPDATE SKIP LOCKED`).
 * Callers must acquire the agent-profile advisory lock first so the lock order
 * stays identical to the lease path: agent profile -> run advisory -> run row.
 */
export async function lockRuntimeRunForLeaseMutation(
  transaction: Prisma.TransactionClient,
  runId: string,
): Promise<void> {
  await lockRuntimeRun(transaction, runId);
  await transaction.$queryRaw`
    SELECT "id" FROM "agent_runs" WHERE "id" = ${runId}::uuid FOR UPDATE
  `;
}

export async function lockRuntimeAgent(
  transaction: Prisma.TransactionClient,
  agentProfileId: string,
): Promise<void> {
  // Share the control-plane lock namespace so lifecycle changes and lease claims
  // cannot pass each other with a stale ACTIVE snapshot.
  const key = `agent-profile:${agentProfileId}`;
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

export function getRuntimeAgentLifecycle(
  transaction: Prisma.TransactionClient,
  agentProfileId: string,
) {
  return transaction.agentProfile.findUnique({
    where: { id: agentProfileId },
    select: { lifecycleStatus: true },
  });
}

export function countActiveRuntimeLeases(transaction: Prisma.TransactionClient, now: Date) {
  return transaction.agentRun.count({
    where: {
      runStatus: { in: ["RUNNING", "CANCEL_REQUESTED"] },
      // Lease validity elsewhere treats an expiry exactly at `now` as valid.
      // Keep the capacity predicate identical so a lease cannot disappear from
      // the global count one instant before it becomes reclaimable.
      leaseExpiresAt: { gte: now },
    },
  });
}

export interface ExpiredRuntimeRunCandidate {
  id: string;
  runType: AgentRunType;
  scheduleSlotId: string | null;
  leaseExpiresAt: Date | null;
  previousStatus: "RUNNING" | "CANCEL_REQUESTED";
}

export async function listExpiredCancellationRunsForFinalization(
  transaction: Prisma.TransactionClient,
  agentProfileId: string,
  now: Date,
): Promise<ExpiredRuntimeRunCandidate[]> {
  const expired = await transaction.agentRun.findMany({
    where: {
      agentProfileId,
      runStatus: "CANCEL_REQUESTED",
      leaseExpiresAt: { lt: now },
    },
    select: { id: true, runType: true, scheduleSlotId: true, leaseExpiresAt: true },
  });
  return expired.map((run) => ({ ...run, previousStatus: "CANCEL_REQUESTED" as const }));
}

/**
 * A non-maintenance run is never reclaimed while the runtime is in maintenance
 * mode. Once its lease is expired, application orchestration terminalizes it
 * before selecting maintenance work so committed effects can remain PARTIAL.
 * Callers hold the agent-profile advisory lock for this transaction.
 */
export async function listExpiredNonMaintenanceRunsForMaintenanceFinalization(
  transaction: Prisma.TransactionClient,
  agentProfileId: string,
  now: Date,
): Promise<ExpiredRuntimeRunCandidate[]> {
  const expired = await transaction.agentRun.findMany({
    where: {
      agentProfileId,
      runStatus: "RUNNING",
      runType: { notIn: ["REFLECTION", "SOURCE_REFRESH"] },
      leaseExpiresAt: { lt: now },
    },
    select: { id: true, runType: true, scheduleSlotId: true, leaseExpiresAt: true },
  });
  return expired.map((run) => ({ ...run, previousStatus: "RUNNING" as const }));
}

interface LeaseCandidate {
  id: string;
  startedAt: Date | null;
}

export async function claimNextRuntimeRun(
  transaction: Prisma.TransactionClient,
  input: {
    agentProfileId: string;
    workerId: string;
    leaseSeconds: number;
    maxRetryCount: number;
    writeRunsPaused: boolean;
    contentSlowdownMinutes: number;
    runtimeOperatingMode?: RuntimeOperatingMode;
    now: Date;
  },
) {
  const runtimeOperatingMode = input.runtimeOperatingMode ?? "NORMAL";
  const candidates = await transaction.$queryRaw<LeaseCandidate[]>`
    SELECT candidate."id", candidate."startedAt"
    FROM "agent_runs" AS candidate
    WHERE candidate."agentProfileId" = ${input.agentProfileId}::uuid
      AND candidate."availableAt" <= ${input.now}
      AND candidate."attempts" <= ${input.maxRetryCount}
      AND (
        ${runtimeOperatingMode} = 'NORMAL'
        OR candidate."runType" IN ('REFLECTION', 'SOURCE_REFRESH')
      )
      AND (
        NOT ${input.writeRunsPaused}
        OR candidate."runType" IN (
          'READ_ONLY', 'DRY_RUN', 'REFLECTION', 'SOURCE_REFRESH',
          'CAPACITY_BENCHMARK', 'CONCURRENCY_TEST'
        )
      )
      AND candidate."runType" NOT IN ('SCHEDULED_WAKE', 'DAILY_CATCH_UP')
      AND candidate."trigger" NOT IN ('SCHEDULER_SLOT', 'AUTO_CATCH_UP')
      AND (
        ${input.contentSlowdownMinutes} = 0
        OR candidate."runType" IN (
          'READ_ONLY', 'DRY_RUN', 'REFLECTION', 'SOURCE_REFRESH',
          'CAPACITY_BENCHMARK', 'CONCURRENCY_TEST'
        )
        OR candidate."createdAt" <= ${new Date(
          input.now.getTime() - input.contentSlowdownMinutes * 60_000,
        )}
      )
      AND (
        (
          candidate."runStatus" = 'RUNNING'
          AND candidate."leaseExpiresAt" < ${input.now}
        )
        OR (
          candidate."runStatus" = 'QUEUED'
          AND NOT EXISTS (
            SELECT 1
            FROM "agent_runs" AS active
            WHERE active."agentProfileId" = candidate."agentProfileId"
              AND active."runStatus" IN ('RUNNING', 'CANCEL_REQUESTED')
          )
        )
      )
    ORDER BY
      CASE WHEN candidate."runStatus" = 'RUNNING' THEN -1 ELSE 0 END,
      GREATEST(
        0,
        CASE candidate."queuePriority"
          WHEN 'EMERGENCY_ADMIN' THEN 0
          WHEN 'MANUAL_SINGLE' THEN 1
          WHEN 'SCHEDULED_CONTENT' THEN 2
          WHEN 'DAILY_CATCH_UP' THEN 3
          WHEN 'REFLECTION' THEN 4
          WHEN 'SOURCE_REFRESH' THEN 5
        END - LEAST(
          5,
          GREATEST(
            0,
            FLOOR(EXTRACT(EPOCH FROM (${input.now} - candidate."createdAt")) / 3600)::int
          )
        )
      ),
      candidate."createdAt" ASC
    FOR UPDATE OF candidate SKIP LOCKED
    LIMIT 1
  `;
  const candidate = candidates[0];
  if (!candidate) return null;
  const conflictingActiveRun = await transaction.agentRun.findFirst({
    where: {
      id: { not: candidate.id },
      agentProfileId: input.agentProfileId,
      runStatus: { in: ["RUNNING", "CANCEL_REQUESTED"] },
      leaseExpiresAt: { gte: input.now },
    },
    select: { id: true },
  });
  if (conflictingActiveRun) return null;
  const leaseExpiresAt = new Date(input.now.getTime() + input.leaseSeconds * 1000);
  const leaseToken = createOpaqueToken();
  const run = await transaction.agentRun.update({
    where: { id: candidate.id },
    data: {
      runStatus: "RUNNING",
      leaseOwner: input.workerId,
      leaseToken,
      leaseExpiresAt,
      heartbeatAt: input.now,
      startedAt: candidate.startedAt ?? input.now,
      attempts: { increment: 1 },
    },
    select: {
      id: true,
      agentProfileId: true,
      runType: true,
      trigger: true,
      runStatus: true,
      queuePriority: true,
      timeoutSeconds: true,
      startedAt: true,
      desiredEntryMin: true,
      desiredEntryMax: true,
      leaseToken: true,
      leaseExpiresAt: true,
      attempts: true,
      scheduleSlotId: true,
      personaVersionId: true,
      allowTopicCreation: true,
      allowVoting: true,
      allowFollowing: true,
      allowSourceReading: true,
      provocationOverride: true,
    },
  });
  if (!runtimeRunAllowedInOperatingMode(run.runType, runtimeOperatingMode))
    throw new Error("RUNTIME_OPERATING_MODE_LEASE_VIOLATION");
  if (run.scheduleSlotId) {
    await transaction.agentScheduleSlot.updateMany({
      where: { id: run.scheduleSlotId, status: "QUEUED" },
      data: { status: "RUNNING" },
    });
  }
  return { ...run, leaseToken };
}

export function setRuntimeCurrentRun(
  transaction: Prisma.TransactionClient,
  agentProfileId: string,
  runId: string,
  now: Date,
) {
  return transaction.agentRuntimeState.update({
    where: { agentProfileId },
    data: {
      currentRunId: runId,
      runtimeStatus: "STARTING",
      lastHeartbeatAt: now,
      lastRunAt: now,
    },
  });
}

export function findRuntimeOwnedRun(
  transaction: Prisma.TransactionClient,
  agentProfileId: string,
  runId: string,
) {
  return transaction.agentRun.findFirst({
    where: { id: runId, agentProfileId },
    include: {
      personaVersion: {
        select: { id: true, version: true, persona: true, renderedPrompt: true },
      },
      agentProfile: {
        select: {
          currentPersonaVersionId: true,
          lifecycleStatus: true,
          activeTimeProfile: true,
          personaEvolutionEnabled: true,
          sourceEvolutionEnabled: true,
          user: { select: { id: true, username: true, displayName: true, bio: true } },
        },
      },
    },
  });
}

export function storeRuntimePerceptionSummary(
  transaction: Prisma.TransactionClient,
  runId: string,
  /*
    Çağıran katman ya `boundedPerceptionSnapshot` çıktısını ya da dondurulmuş
    JSON sütunundan okunmuş düz bir nesneyi verir; ikisi de JSON güvenli ama
    Prisma'nın `InputJsonValue` tipi kendiliğinden daralmıyor. Daraltmayı
    burada yapıyoruz, çünkü Prisma tipleri repository katmanına ait.
  */
  perceptionSummary: Prisma.InputJsonValue | Record<string, unknown>,
) {
  return transaction.agentRun.update({
    where: { id: runId },
    data: { perceptionSummary: perceptionSummary as Prisma.InputJsonObject },
  });
}

export async function heartbeatRuntimeRunRecord(
  transaction: Prisma.TransactionClient,
  input: {
    runId: string;
    agentProfileId: string;
    workerId: string;
    leaseExpiresAt: Date;
    now: Date;
    runtimeStatus:
      | "STARTING"
      | "READING"
      | "THINKING"
      | "VALIDATING"
      | "EXECUTING"
      | "REFLECTING"
      | "CANCELLING";
  },
) {
  const previous = await transaction.agentRuntimeState.findUniqueOrThrow({
    where: { agentProfileId: input.agentProfileId },
    select: { runtimeStatus: true, lastHeartbeatAt: true },
  });
  await Promise.all([
    transaction.agentRun.update({
      where: { id: input.runId },
      data: {
        heartbeatAt: input.now,
        leaseExpiresAt: input.leaseExpiresAt,
      },
    }),
    transaction.agentRuntimeState.update({
      where: { agentProfileId: input.agentProfileId },
      data: {
        lastHeartbeatAt: input.now,
        runtimeStatus: input.runtimeStatus,
        currentRunId: input.runId,
      },
    }),
  ]);
  return {
    before: {
      runtimeStatus: previous.runtimeStatus,
      lastHeartbeatAt: previous.lastHeartbeatAt?.toISOString() ?? null,
    },
    after: { runtimeStatus: input.runtimeStatus, lastHeartbeatAt: input.now.toISOString() },
  };
}

export async function appendRuntimeRunEvents(
  transaction: Prisma.TransactionClient,
  input: {
    runId: string;
    agentProfileId: string;
    events: Array<{ eventType: string; safeMessage: string; metadata: Prisma.InputJsonValue }>;
  },
) {
  const aggregate = await transaction.agentRunEvent.aggregate({
    where: { runId: input.runId },
    _max: { sequence: true },
  });
  const firstSequence = (aggregate._max.sequence ?? 0) + 1;
  await transaction.agentRunEvent.createMany({
    data: input.events.map((event, index) => ({
      runId: input.runId,
      agentProfileId: input.agentProfileId,
      sequence: firstSequence + index,
      eventType: event.eventType,
      safeMessage: event.safeMessage,
      metadata: event.metadata,
    })),
  });
  return { firstSequence, count: input.events.length };
}

export async function appendRuntimeActions(
  transaction: Prisma.TransactionClient,
  input: {
    runId: string;
    agentProfileId: string;
    actions: Array<{
      sequence: number;
      actionType:
        | "NO_ACTION"
        | "CREATE_ENTRY"
        | "CREATE_TOPIC_WITH_ENTRY"
        | "EDIT_OWN_ENTRY"
        | "VOTE_UP"
        | "VOTE_DOWN"
        | "REMOVE_VOTE"
        | "FOLLOW_TOPIC"
        | "UNFOLLOW_TOPIC"
        | "FOLLOW_USER"
        | "UNFOLLOW_USER"
        | "BOOKMARK_ENTRY"
        | "REMOVE_BOOKMARK"
        | "PROPOSE_SOURCE"
        | "UPDATE_BELIEF"
        | "UPDATE_RELATIONSHIP_NOTE";
      safeReason: string;
      targetType?: string;
      targetId?: string;
      input: Prisma.InputJsonValue;
      provenance?: Prisma.InputJsonValue;
      repairOfSequence?: number;
    }>;
  },
) {
  await transaction.agentAction.createMany({
    data: input.actions.map((action) => ({
      runId: input.runId,
      agentProfileId: input.agentProfileId,
      sequence: action.sequence,
      actionType: action.actionType,
      actionStatus: "PROPOSED",
      targetType: action.targetType ?? null,
      targetId: action.targetId ?? null,
      input: {
        ...(action.input as Prisma.JsonObject),
        safeReason: action.safeReason,
      },
      ...(action.provenance !== undefined ? { provenance: action.provenance } : {}),
      ...(action.repairOfSequence !== undefined
        ? {
            validationResult: {
              valid: true,
              phase: "repair_candidate",
              repairOfSequence: action.repairOfSequence,
            },
          }
        : {}),
    })),
  });
  return { count: input.actions.length };
}

export function listRuntimeActionsForRepairValidation(
  transaction: Prisma.TransactionClient,
  input: { runId: string; agentProfileId: string },
) {
  return transaction.agentAction.findMany({
    where: input,
    orderBy: { sequence: "asc" },
    select: {
      sequence: true,
      actionType: true,
      actionStatus: true,
      targetType: true,
      targetId: true,
      input: true,
      provenance: true,
      validationResult: true,
      rejectionCode: true,
    },
  });
}

export async function lockRuntimeAction(
  transaction: Prisma.TransactionClient,
  actionId: string,
): Promise<void> {
  await transaction.$queryRaw`
    SELECT "id" FROM "agent_actions" WHERE "id" = ${actionId}::uuid FOR UPDATE
  `;
}

export function findRuntimeActionForExecution(
  transaction: Prisma.TransactionClient,
  input: { runId: string; agentProfileId: string; sequence: number },
) {
  return transaction.agentAction.findFirst({
    where: input,
    include: {
      run: {
        select: {
          id: true,
          runType: true,
          runStatus: true,
          leaseOwner: true,
          leaseToken: true,
          leaseExpiresAt: true,
          startedAt: true,
          timeoutSeconds: true,
          perceptionSummary: true,
          allowTopicCreation: true,
          allowVoting: true,
          allowFollowing: true,
          provocationOverride: true,
        },
      },
      agentProfile: {
        select: {
          lifecycleStatus: true,
          sourceEvolutionEnabled: true,
          user: { select: { id: true } },
        },
      },
    },
  });
}

export function findRuntimeReplyTarget(transaction: Prisma.TransactionClient, entryId: string) {
  return transaction.entry.findFirst({
    where: { id: entryId, status: "ACTIVE", ...publiclyVisibleEntryWhere },
    select: { id: true, authorId: true, topicId: true },
  });
}

const provocationContentActions = [
  "CREATE_ENTRY",
  "CREATE_TOPIC_WITH_ENTRY",
  "EDIT_OWN_ENTRY",
] as const;

export async function getRuntimeProvocationMetrics(
  transaction: Prisma.TransactionClient,
  input: {
    agentProfileId: string;
    targetUserId: string;
    topicId: string;
    now: Date;
  },
) {
  const sixHoursAgo = new Date(input.now.getTime() - 6 * 60 * 60 * 1000);
  const dayAgo = new Date(input.now.getTime() - 24 * 60 * 60 * 1000);
  const thirtyMinutesAgo = new Date(input.now.getTime() - 30 * 60 * 1000);
  const cooldownAgo = new Date(input.now.getTime() - 90 * 60 * 1000);
  const base = {
    actionStatus: "SUCCEEDED" as const,
    actionType: { in: [...provocationContentActions] },
    targetType: "USER",
    targetId: input.targetUserId,
  };
  const [agentTargetSixHours, agentDiscussionDay, distinctRecentAgents, agentCooldownResponses] =
    await Promise.all([
      transaction.agentAction.count({
        where: { ...base, agentProfileId: input.agentProfileId, createdAt: { gte: sixHoursAgo } },
      }),
      transaction.agentAction.count({
        where: {
          ...base,
          agentProfileId: input.agentProfileId,
          createdAt: { gte: dayAgo },
          contentRecord: { entry: { topicId: input.topicId } },
        },
      }),
      transaction.agentAction.findMany({
        where: { ...base, createdAt: { gte: thirtyMinutesAgo } },
        distinct: ["agentProfileId"],
        select: { agentProfileId: true },
      }),
      transaction.agentAction.count({
        where: {
          ...base,
          agentProfileId: input.agentProfileId,
          createdAt: { gte: cooldownAgo },
          contentRecord: { entry: { topicId: input.topicId } },
        },
      }),
    ]);
  return {
    agentTargetSixHours,
    agentDiscussionDay,
    distinctRecentAgents: distinctRecentAgents.length,
    agentCooldownResponses,
  };
}

export function updateRuntimeActionStatus(
  transaction: Prisma.TransactionClient,
  actionId: string,
  data: {
    actionStatus:
      | "VALIDATING"
      | "ACCEPTED"
      | "REJECTED"
      | "EXECUTING"
      | "SUCCEEDED"
      | "FAILED"
      | "SKIPPED";
    validationResult?: Prisma.InputJsonValue;
    result?: Prisma.InputJsonValue;
    rejectionCode?: string | null;
    rejectionReason?: string | null;
  },
) {
  return transaction.agentAction.update({
    where: { id: actionId },
    data,
    select: {
      id: true,
      sequence: true,
      actionType: true,
      actionStatus: true,
      result: true,
      rejectionCode: true,
      rejectionReason: true,
    },
  });
}

export function createRuntimeContentRecord(
  transaction: Prisma.TransactionClient,
  input: {
    entryId: string;
    agentProfileId: string;
    runId: string;
    actionId: string;
    createdAt: Date;
  },
) {
  return transaction.agentContentRecord.create({ data: input });
}

export function findActiveRuntimeTopicWriteLock(
  transaction: Prisma.TransactionClient,
  topicId: string,
  now: Date,
) {
  return transaction.agentTopicWriteLock.findFirst({
    where: { topicId, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    select: { id: true, reason: true, expiresAt: true },
  });
}

export async function getRuntimeDuplicateSimilarity(
  transaction: Prisma.TransactionClient,
  input: {
    agentProfileId: string;
    topicId?: string;
    excludeEntryId?: string;
    normalizedCandidate: string;
  },
): Promise<number> {
  const rows = await transaction.$queryRaw<Array<{ maximum: number }>>`
    WITH agent_recent AS (
      SELECT entry."id", entry."normalizedBody"
      FROM "agent_content_records" AS content
      JOIN "entries" AS entry ON entry."id" = content."entryId"
      WHERE content."agentProfileId" = ${input.agentProfileId}::uuid
        AND ${publiclyVisibleEntrySql(Prisma.sql`entry`)}
        AND (${input.excludeEntryId ?? null}::uuid IS NULL OR entry."id" <> ${input.excludeEntryId ?? null}::uuid)
      ORDER BY content."createdAt" DESC
      LIMIT 100
    ), topic_recent AS (
      SELECT entry."id", entry."normalizedBody"
      FROM "entries" AS entry
      WHERE ${input.topicId ?? null}::uuid IS NOT NULL
        AND entry."topicId" = ${input.topicId ?? null}::uuid
        AND entry."status" = 'ACTIVE'
        AND ${publiclyVisibleEntrySql(Prisma.sql`entry`)}
        AND (${input.excludeEntryId ?? null}::uuid IS NULL OR entry."id" <> ${input.excludeEntryId ?? null}::uuid)
      ORDER BY entry."createdAt" DESC
      LIMIT 100
    ), candidates AS (
      SELECT * FROM agent_recent
      UNION
      SELECT * FROM topic_recent
    )
    SELECT COALESCE(
      MAX(similarity(immutable_unaccent("normalizedBody"), immutable_unaccent(${input.normalizedCandidate}))),
      0
    )::float AS maximum
    FROM candidates
  `;
  return rows[0]?.maximum ?? 0;
}

export async function getRuntimeRecentAgentEntryBodies(
  transaction: Prisma.TransactionClient,
  input: { agentProfileId: string; excludeEntryId?: string },
): Promise<string[]> {
  const records = await transaction.agentContentRecord.findMany({
    where: {
      agentProfileId: input.agentProfileId,
      entry: {
        status: "ACTIVE",
        ...publiclyVisibleEntryWhere,
        ...(input.excludeEntryId ? { id: { not: input.excludeEntryId } } : {}),
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { entry: { select: { body: true } } },
  });
  return records.map(({ entry }) => entry.body);
}

export async function getRuntimeTopicNoveltyContext(
  transaction: Prisma.TransactionClient,
  input: { topicId: string; authorId: string; excludeEntryId?: string },
): Promise<{
  title: string;
  otherAuthorBodies: string[];
  ownPreviousBodies: string[];
} | null> {
  /*
    Aynı başlıktaki entry'ler iki kovaya ayrılıyor: başkalarınınki ve yazarın kendi
    önceki katkıları. İkisi ayrı, çünkü reddetme gerekçeleri de ayrı — birine
    "başkasının hükmünü yeniden paketliyorsun", diğerine "kendini tekrar ediyorsun"
    denmeli.

    Kendi kovası yeni. Eskiden yalnız `authorId: { not }` vardı, yani yazarın aynı
    başlığa kendi yazdıklarını hiçbir kavram kontrolü görmüyordu. Canlıda çıktı:
    `/baslik/ha-leylim--3402`'de tek yazar beş günde üç entry yazdı, üçü de "bu
    şarkı hakkında soruşturma var" diyordu. Kelimeler her seferinde farklıydı
    (Jaccard 0,167–0,222), o yüzden DUPLICATE_SIMILARITY eşiğine hiç yaklaşmadı;
    kenar kalıpları da farklıydı, o yüzden DUPLICATE_FRAMING de görmedi. Kavram
    örtüşmesine bakan tek kontrol buydu ve yazarın kendisine hiç bakmıyordu.
  */
  const topic = await transaction.topic.findFirst({
    where: { id: input.topicId, status: "ACTIVE" },
    select: {
      title: true,
      entries: {
        where: {
          status: "ACTIVE",
          ...publiclyVisibleEntryWhere,
          ...(input.excludeEntryId ? { id: { not: input.excludeEntryId } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { body: true, authorId: true },
      },
    },
  });
  if (!topic) return null;
  return {
    title: topic.title,
    otherAuthorBodies: topic.entries
      .filter(({ authorId }) => authorId !== input.authorId)
      .map(({ body }) => body),
    /*
      Kendi geçmişinde daha dar bir pencere: son sekiz katkı. Başka yazarlarda yüz
      entry'ye bakmak mantıklı (başlığın ortak hükmü orada birikiyor), ama yazarın
      aylar önceki kendi entry'sine kavram örtüşmesi aramak yeni katkıyı haksız
      yere bloke eder. Tekrar tikini yakalamak için yakın geçmiş yeterli.
    */
    ownPreviousBodies: topic.entries
      .filter(({ authorId }) => authorId === input.authorId)
      .slice(0, 8)
      .map(({ body }) => body),
  };
}

export async function validateRuntimeProvenanceEvidence(
  transaction: Prisma.TransactionClient,
  input: {
    agentProfileId: string;
    runId: string;
    evidenceType:
      | "PLATFORM_EVENT"
      | "USER_ENTRY"
      | "MODEL_KNOWLEDGE"
      | "TRUSTED_SOURCE"
      | "PROBATION_SOURCE"
      | "MULTIPLE_SOURCES"
      | "AGENT_MEMORY";
    evidenceIds: string[];
  },
) {
  const uniqueIds = [...new Set(input.evidenceIds)];
  if (input.evidenceType === "MODEL_KNOWLEDGE") {
    if (uniqueIds.length !== 1 || uniqueIds[0] !== input.runId)
      return {
        valid: false,
        independentSources: 0,
        sourceEvidenceTexts: [] as string[],
      };
    const run = await transaction.agentRun.count({
      where: { id: input.runId, agentProfileId: input.agentProfileId },
    });
    return {
      valid: run === 1,
      independentSources: 0,
      sourceEvidenceTexts: [] as string[],
    };
  }
  if (input.evidenceType === "PLATFORM_EVENT") {
    const [runs, events, topics, entries] = await Promise.all([
      transaction.agentRun.count({
        where: { id: { in: uniqueIds }, agentProfileId: input.agentProfileId },
      }),
      transaction.agentRunEvent.count({
        where: { id: { in: uniqueIds }, agentProfileId: input.agentProfileId },
      }),
      transaction.topic.count({ where: { id: { in: uniqueIds }, status: "ACTIVE" } }),
      transaction.entry.count({
        where: {
          id: { in: uniqueIds },
          status: "ACTIVE",
          topic: { status: "ACTIVE" },
          ...publiclyVisibleEntryWhere,
        },
      }),
    ]);
    return {
      valid: runs + events + topics + entries === uniqueIds.length,
      independentSources: 0,
      sourceEvidenceTexts: [] as string[],
    };
  }
  if (input.evidenceType === "USER_ENTRY") {
    const entries = await transaction.entry.count({
      where: {
        id: { in: uniqueIds },
        status: "ACTIVE",
        topic: { status: "ACTIVE" },
        ...publiclyVisibleEntryWhere,
      },
    });
    return { valid: entries === uniqueIds.length, independentSources: 0, sourceEvidenceTexts: [] };
  }
  if (input.evidenceType === "AGENT_MEMORY") {
    const memories = await transaction.agentMemoryEpisode.count({
      where: {
        id: { in: uniqueIds },
        agentProfileId: input.agentProfileId,
        invalidatedAt: null,
      },
    });
    return { valid: memories === uniqueIds.length, independentSources: 0, sourceEvidenceTexts: [] };
  }
  const expectedStatuses = runtimeSourceStatusesForEvidenceType(input.evidenceType);
  const items = await transaction.agentSourceItem.findMany({
    where: {
      id: { in: uniqueIds },
      source: {
        agentProfileId: input.agentProfileId,
        status: { in: [...expectedStatuses] },
        adminBlocked: false,
      },
    },
    select: {
      title: true,
      safeText: true,
      summary: true,
      source: { select: { normalizedDomain: true } },
    },
  });
  const independentSources = new Set(items.map(({ source }) => source.normalizedDomain)).size;
  return {
    valid:
      items.length === uniqueIds.length &&
      (input.evidenceType !== "MULTIPLE_SOURCES" || independentSources >= 2),
    independentSources,
    sourceEvidenceTexts: items.flatMap(({ title, safeText, summary }) => [
      title,
      safeText,
      ...(summary ? [summary] : []),
    ]),
  };
}

export async function proposeRuntimeSource(
  transaction: Prisma.TransactionClient,
  input: {
    agentProfileId: string;
    url: string;
    normalizedDomain: string;
    sourceType: "RSS" | "ATOM" | "HTML";
    topics: string[];
    discoveredFrom: string;
  },
) {
  const lockKey = `agent-source-url:${input.agentProfileId}:${input.url}`;
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
  const previousState = await transaction.agentSource.findUnique({
    where: { agentProfileId_url: { agentProfileId: input.agentProfileId, url: input.url } },
    select: { id: true, status: true, sourceType: true, topics: true },
  });
  const source = await transaction.agentSource.upsert({
    where: { agentProfileId_url: { agentProfileId: input.agentProfileId, url: input.url } },
    create: {
      agentProfileId: input.agentProfileId,
      url: input.url,
      normalizedDomain: input.normalizedDomain,
      sourceType: input.sourceType,
      status: "PROBATION",
      topics: input.topics,
      trustScore: 0.25,
      interestScore: 0.5,
      noveltyScore: 0.5,
      usefulnessScore: 0.5,
      discoveredFrom: input.discoveredFrom,
      addedByOrigin: "AGENT",
    },
    update: {
      topics: input.topics,
      sourceType: input.sourceType,
      discoveredFrom: input.discoveredFrom,
    },
    select: {
      id: true,
      url: true,
      status: true,
      normalizedDomain: true,
      sourceType: true,
      topics: true,
    },
  });
  return { ...source, previousState };
}

export async function createRuntimeBeliefVersion(
  transaction: Prisma.TransactionClient,
  input: {
    agentProfileId: string;
    topicKey: string;
    statement: string;
    confidence: number;
    evidenceSummary: string;
    evidenceProvenance: Prisma.InputJsonValue;
    now: Date;
  },
) {
  const lockKey = `agent-belief:${input.agentProfileId}:${input.topicKey}`;
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
  const previous = await transaction.agentBelief.findFirst({
    where: { agentProfileId: input.agentProfileId, topicKey: input.topicKey },
    orderBy: { version: "desc" },
  });
  const boundedConfidence = previous
    ? Math.max(previous.confidence - 0.15, Math.min(previous.confidence + 0.15, input.confidence))
    : input.confidence;
  const created = await transaction.agentBelief.create({
    data: {
      agentProfileId: input.agentProfileId,
      topicKey: input.topicKey,
      statement: input.statement,
      confidence: boundedConfidence,
      evidenceSummary: input.evidenceSummary,
      evidenceProvenance: input.evidenceProvenance,
      firstFormedAt: previous?.firstFormedAt ?? input.now,
      lastUpdatedAt: input.now,
      version: (previous?.version ?? 0) + 1,
      status: "ACTIVE",
    },
    select: {
      id: true,
      topicKey: true,
      statement: true,
      confidence: true,
      version: true,
      status: true,
    },
  });
  return {
    ...created,
    previousState: previous
      ? {
          id: previous.id,
          statement: previous.statement,
          confidence: previous.confidence,
          version: previous.version,
          status: previous.status,
        }
      : null,
  };
}

export async function updateRuntimeRelationship(
  transaction: Prisma.TransactionClient,
  input: {
    agentProfileId: string;
    targetUserId: string;
    familiarity: number;
    trust: number;
    interest: number;
    disagreement: number;
    summary: string;
    now: Date;
  },
) {
  const lockKey = `agent-relationship:${input.agentProfileId}:${input.targetUserId}`;
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
  const previous = await transaction.agentRelationship.findUnique({
    where: {
      agentProfileId_targetUserId: {
        agentProfileId: input.agentProfileId,
        targetUserId: input.targetUserId,
      },
    },
  });
  const boundedTrust = previous
    ? Math.max(previous.trust - 0.1, Math.min(previous.trust + 0.1, input.trust))
    : input.trust;
  const updated = await transaction.agentRelationship.upsert({
    where: {
      agentProfileId_targetUserId: {
        agentProfileId: input.agentProfileId,
        targetUserId: input.targetUserId,
      },
    },
    create: {
      agentProfileId: input.agentProfileId,
      targetUserId: input.targetUserId,
      familiarity: input.familiarity,
      trust: boundedTrust,
      interest: input.interest,
      disagreement: input.disagreement,
      summary: input.summary,
      lastInteractionAt: input.now,
    },
    update: {
      familiarity: input.familiarity,
      trust: boundedTrust,
      interest: input.interest,
      disagreement: input.disagreement,
      summary: input.summary,
      lastInteractionAt: input.now,
    },
    select: {
      id: true,
      targetUserId: true,
      familiarity: true,
      trust: true,
      interest: true,
      disagreement: true,
      summary: true,
    },
  });
  return {
    ...updated,
    previousState: previous
      ? {
          familiarity: previous.familiarity,
          trust: previous.trust,
          interest: previous.interest,
          disagreement: previous.disagreement,
          summary: previous.summary,
        }
      : null,
  };
}

export function findRuntimeRelationshipTarget(
  transaction: Prisma.TransactionClient,
  targetUserId: string,
) {
  return transaction.user.findFirst({
    where: { id: targetUserId, status: "ACTIVE" },
    select: { id: true },
  });
}

export function createRuntimeMemoryEpisode(
  transaction: Prisma.TransactionClient,
  input: {
    agentProfileId: string;
    runId: string;
    eventType: string;
    subjectType?: string;
    subjectId?: string;
    summary: string;
    salience: number;
    provenance:
      | "PLATFORM_EVENT"
      | "USER_ENTRY"
      | "MODEL_KNOWLEDGE"
      | "TRUSTED_SOURCE"
      | "PROBATION_SOURCE"
      | "MULTIPLE_SOURCES"
      | "AGENT_MEMORY";
    evidence: Prisma.InputJsonValue;
    occurredAt: Date;
  },
) {
  return transaction.agentMemoryEpisode.create({
    data: {
      agentProfileId: input.agentProfileId,
      runId: input.runId,
      eventType: input.eventType,
      subjectType: input.subjectType ?? null,
      subjectId: input.subjectId ?? null,
      summary: input.summary,
      salience: input.salience,
      provenance: input.provenance,
      evidence: input.evidence,
      occurredAt: input.occurredAt,
    },
    select: { id: true },
  });
}

export function listRuntimeCurrentPersonas(
  transaction: Prisma.TransactionClient,
  excludeProfileId: string,
) {
  return transaction.agentProfile.findMany({
    where: {
      id: { not: excludeProfileId },
      lifecycleStatus: { not: "RETIRED" },
      currentPersonaVersionId: { not: null },
    },
    select: { currentPersonaVersion: { select: { persona: true } } },
  });
}

export function listRuntimeWeeklyReflectionReports(
  transaction: Prisma.TransactionClient,
  input: { agentProfileId: string; weekStart: Date; weekEnd: Date },
) {
  return transaction.agentPersonaVersion.findMany({
    where: {
      agentProfileId: input.agentProfileId,
      changeOrigin: "REFLECTION",
      createdAt: { gte: input.weekStart, lt: input.weekEnd },
    },
    select: { validationReport: true },
    orderBy: { version: "asc" },
  });
}

export async function lockRuntimeReflectionStateTargets(
  transaction: Prisma.TransactionClient,
  input: { agentProfileId: string; delta: WeeklyPersonaEvolutionDelta },
) {
  const sourceIds = input.delta.sourceTrustDeltas.map(({ sourceId }) => sourceId).sort();
  const targetUserIds = input.delta.relationshipTrustDeltas
    .map(({ targetUserId }) => targetUserId)
    .sort();
  const topicKeys = input.delta.beliefConfidenceDeltas.map(({ topicKey }) => topicKey).sort();
  for (const sourceId of sourceIds) {
    const key = `agent-source:${sourceId}`;
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }
  for (const targetUserId of targetUserIds) {
    const key = `agent-relationship:${input.agentProfileId}:${targetUserId}`;
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }
  for (const topicKey of topicKeys) {
    const key = `agent-belief:${input.agentProfileId}:${topicKey}`;
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }
  const [sources, relationships, beliefs] = await Promise.all([
    transaction.agentSource.findMany({
      where: {
        id: { in: sourceIds },
        agentProfileId: input.agentProfileId,
        adminBlocked: false,
        status: { notIn: ["REJECTED", "BLOCKED"] },
      },
      select: { id: true, trustScore: true },
    }),
    transaction.agentRelationship.findMany({
      where: {
        agentProfileId: input.agentProfileId,
        targetUserId: { in: targetUserIds },
      },
      select: { id: true, targetUserId: true, trust: true },
    }),
    transaction.agentBelief.findMany({
      where: {
        agentProfileId: input.agentProfileId,
        topicKey: { in: topicKeys },
        status: "ACTIVE",
      },
      select: {
        topicKey: true,
        statement: true,
        confidence: true,
        evidenceSummary: true,
        evidenceProvenance: true,
        firstFormedAt: true,
        version: true,
        status: true,
      },
      orderBy: [{ topicKey: "asc" }, { version: "desc" }],
      distinct: ["topicKey"],
    }),
  ]);
  return { sources, relationships, beliefs };
}

export async function applyRuntimeReflectionStateDeltas(
  transaction: Prisma.TransactionClient,
  input: {
    agentProfileId: string;
    now: Date;
    sources: Array<{ id: string; trustScore: number }>;
    relationships: Array<{ id: string; trust: number }>;
    beliefs: Array<{
      topicKey: string;
      statement: string;
      confidence: number;
      evidenceSummary: string;
      evidenceProvenance: Prisma.JsonValue;
      firstFormedAt: Date;
      version: number;
      status: string;
    }>;
  },
): Promise<void> {
  for (const source of input.sources)
    await transaction.agentSource.update({
      where: { id: source.id },
      data: { trustScore: source.trustScore },
    });
  for (const relationship of input.relationships)
    await transaction.agentRelationship.update({
      where: { id: relationship.id },
      data: { trust: relationship.trust },
    });
  for (const belief of input.beliefs)
    await transaction.agentBelief.create({
      data: {
        agentProfileId: input.agentProfileId,
        topicKey: belief.topicKey,
        statement: belief.statement,
        confidence: belief.confidence,
        evidenceSummary: belief.evidenceSummary,
        evidenceProvenance: belief.evidenceProvenance as Prisma.InputJsonValue,
        firstFormedAt: belief.firstFormedAt,
        lastUpdatedAt: input.now,
        version: belief.version + 1,
        status: belief.status,
      },
    });
}

export async function createRuntimeReflectionPersonaVersion(
  transaction: Prisma.TransactionClient,
  input: {
    agentProfileId: string;
    currentVersionId: string;
    version: number;
    persona: Prisma.InputJsonValue;
    renderedPrompt: string;
    changeSummary: string;
    validationReport: Prisma.InputJsonValue;
  },
) {
  const created = await transaction.agentPersonaVersion.create({
    data: {
      agentProfileId: input.agentProfileId,
      version: input.version,
      persona: input.persona,
      renderedPrompt: input.renderedPrompt,
      changeOrigin: "REFLECTION",
      changeSummary: input.changeSummary,
      previousVersionId: input.currentVersionId,
      createdById: null,
      validationReport: input.validationReport,
    },
    select: { id: true, version: true, changeSummary: true, validationReport: true },
  });
  await transaction.agentProfile.update({
    where: { id: input.agentProfileId },
    data: { currentPersonaVersionId: created.id },
  });
  return created;
}

export function findRuntimeSourceForWrite(
  transaction: Prisma.TransactionClient,
  input: { agentProfileId: string; sourceId: string },
) {
  return transaction.agentSource.findFirst({
    where: {
      id: input.sourceId,
      agentProfileId: input.agentProfileId,
      adminBlocked: false,
      status: { in: [...runtimeResultRecordableSourceStatuses] },
    },
    select: { id: true, status: true, topics: true },
  });
}

const runtimeSourceStateSelect = {
  id: true,
  normalizedDomain: true,
  status: true,
  consecutiveFailures: true,
  lastFetchedAt: true,
  lastUsefulAt: true,
  probationStartedAt: true,
} as const satisfies Prisma.AgentSourceSelect;

type RuntimeSourceStateSnapshot = Prisma.AgentSourceGetPayload<{
  select: typeof runtimeSourceStateSelect;
}>;

export interface RuntimeSourceStateChange {
  sourceId: string;
  normalizedDomain: string;
  before: Omit<RuntimeSourceStateSnapshot, "id" | "normalizedDomain">;
  after: Omit<RuntimeSourceStateSnapshot, "id" | "normalizedDomain">;
}

function sourceStateSnapshot(
  source: RuntimeSourceStateSnapshot,
): RuntimeSourceStateChange["before"] {
  return {
    status: source.status,
    consecutiveFailures: source.consecutiveFailures,
    lastFetchedAt: source.lastFetchedAt,
    lastUsefulAt: source.lastUsefulAt,
    probationStartedAt: source.probationStartedAt,
  };
}

function sourceStateChanged(
  before: RuntimeSourceStateChange["before"],
  after: RuntimeSourceStateChange["after"],
): boolean {
  return (
    before.status !== after.status ||
    before.consecutiveFailures !== after.consecutiveFailures ||
    before.lastFetchedAt?.getTime() !== after.lastFetchedAt?.getTime() ||
    before.lastUsefulAt?.getTime() !== after.lastUsefulAt?.getTime() ||
    before.probationStartedAt?.getTime() !== after.probationStartedAt?.getTime()
  );
}

function sourceMemorySummary(item: { title: string; safeText: string }): string {
  const boundedText = item.safeText.replaceAll(/\s+/gu, " ").trim().slice(0, 1500);
  return `Source item gerçekten okundu: ${item.title}. İçerikten kalan güvenli not: ${boundedText}`.slice(
    0,
    2000,
  );
}

export async function storeRuntimeSourceResult(
  transaction: Prisma.TransactionClient,
  input: {
    sourceId: string;
    runId: string;
    agentProfileId: string;
    items: Array<{
      canonicalUrl: string;
      title: string;
      publishedAt?: Date;
      contentHash: string;
      safeText: string;
    }>;
    topics: Prisma.InputJsonValue;
    now: Date;
    errorCode?: string;
  },
) {
  const sourceIdentity = await transaction.agentSource.findFirstOrThrow({
    where: { id: input.sourceId, agentProfileId: input.agentProfileId },
    select: { normalizedDomain: true },
  });
  const domainLockKey = `agent-source-domain:${input.agentProfileId}:${sourceIdentity.normalizedDomain}`;
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${domainLockKey}, 0))`;
  const domainWhere = {
    agentProfileId: input.agentProfileId,
    normalizedDomain: sourceIdentity.normalizedDomain,
  } as const;
  const beforeSources = await transaction.agentSource.findMany({
    where: domainWhere,
    select: runtimeSourceStateSelect,
    orderBy: { id: "asc" },
  });
  if (input.errorCode) {
    const currentDomainFailure = await transaction.agentSource.findFirst({
      where: domainWhere,
      orderBy: { consecutiveFailures: "desc" },
      select: { consecutiveFailures: true },
    });
    await transaction.agentSource.updateMany({
      where: domainWhere,
      data: { consecutiveFailures: (currentDomainFailure?.consecutiveFailures ?? 0) + 1 },
    });
    await transaction.agentSource.update({
      where: { id: input.sourceId },
      data: { lastFetchedAt: input.now },
    });
  } else {
    await transaction.agentSource.updateMany({
      where: domainWhere,
      data: { consecutiveFailures: 0 },
    });
    const storedItems = [];
    for (const item of input.items) {
      const storedItem = await transaction.agentSourceItem.upsert({
        where: {
          sourceId_contentHash: { sourceId: input.sourceId, contentHash: item.contentHash },
        },
        create: {
          sourceId: input.sourceId,
          canonicalUrl: item.canonicalUrl,
          title: item.title,
          publishedAt: item.publishedAt ?? null,
          fetchedAt: input.now,
          contentHash: item.contentHash,
          safeText: item.safeText,
          topics: input.topics,
          expiresAt: new Date(input.now.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
        update: {
          canonicalUrl: item.canonicalUrl,
          title: item.title,
          publishedAt: item.publishedAt ?? null,
          fetchedAt: input.now,
          safeText: item.safeText,
          expiresAt: new Date(input.now.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
        select: { id: true },
      });
      storedItems.push({ ...item, sourceItemId: storedItem.id });
    }
    const currentSource = await transaction.agentSource.findUniqueOrThrow({
      where: { id: input.sourceId },
      select: { status: true, adminBlocked: true, probationStartedAt: true },
    });
    const probationStartedAt = isRuntimeProbationEntrySourceStatus(currentSource.status)
      ? input.now
      : currentSource.status === "PROBATION"
        ? (currentSource.probationStartedAt ?? input.now)
        : null;
    const usefulItemsAfterProbation = probationStartedAt
      ? await transaction.agentSourceItem.count({
          where: {
            sourceId: input.sourceId,
            fetchedAt: { gte: probationStartedAt },
          },
        })
      : 0;
    const evolvedStatus = currentSource.adminBlocked
      ? currentSource.status
      : isRuntimeProbationEntrySourceStatus(currentSource.status)
        ? "PROBATION"
        : currentSource.status === "PROBATION" && usefulItemsAfterProbation >= 3
          ? "TRUSTED"
          : currentSource.status;
    const shouldStampProbationStart =
      (isRuntimeProbationEntrySourceStatus(currentSource.status) ||
        currentSource.status === "PROBATION") &&
      !currentSource.probationStartedAt;
    const updatedSource = await transaction.agentSource.update({
      where: { id: input.sourceId },
      data: {
        consecutiveFailures: 0,
        lastFetchedAt: input.now,
        ...(input.items.length > 0 ? { lastUsefulAt: input.now } : {}),
        ...(evolvedStatus !== currentSource.status ? { status: evolvedStatus } : {}),
        ...(shouldStampProbationStart
          ? { probationStartedAt: probationStartedAt ?? input.now }
          : {}),
      },
      select: { status: true },
    });
    for (const item of storedItems) {
      const existingMemory = await transaction.agentMemoryEpisode.findFirst({
        where: {
          agentProfileId: input.agentProfileId,
          eventType: "SOURCE_READ",
          subjectId: input.sourceId,
          evidence: { path: ["contentHash"], equals: item.contentHash },
        },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      });
      const provenance = runtimeSourceEvidenceTypeForStatus(updatedSource.status);
      if (!provenance) continue;
      const learned = {
        summary: sourceMemorySummary(item),
        salience: 0.5,
        provenance,
        evidence: {
          sourceId: input.sourceId,
          sourceItemId: item.sourceItemId,
          contentHash: item.contentHash,
        },
      };
      if (existingMemory)
        await transaction.agentMemoryEpisode.update({
          where: { id: existingMemory.id },
          data: learned,
        });
      else
        await transaction.agentMemoryEpisode.create({
          data: {
            ...learned,
            agentProfileId: input.agentProfileId,
            runId: input.runId,
            eventType: "SOURCE_READ",
            subjectType: "SOURCE",
            subjectId: input.sourceId,
            occurredAt: input.now,
          },
        });
    }
  }
  await transaction.agentRun.update({
    where: { id: input.runId },
    data: { perceptionSummary: Prisma.DbNull },
  });
  const beforeById = new Map(
    beforeSources.map((source) => [source.id, sourceStateSnapshot(source)]),
  );
  const afterSources = await transaction.agentSource.findMany({
    where: domainWhere,
    select: runtimeSourceStateSelect,
    orderBy: { id: "asc" },
  });
  return {
    changes: afterSources.flatMap((source) => {
      const before = beforeById.get(source.id);
      const after = sourceStateSnapshot(source);
      return before && sourceStateChanged(before, after)
        ? [
            {
              sourceId: source.id,
              normalizedDomain: source.normalizedDomain,
              before,
              after,
            } satisfies RuntimeSourceStateChange,
          ]
        : [];
    }),
  };
}

const perceptionSourceSelect = (now: Date) =>
  ({
    id: true,
    url: true,
    sourceType: true,
    normalizedDomain: true,
    status: true,
    trustScore: true,
    interestScore: true,
    consecutiveFailures: true,
    lastFetchedAt: true,
    topics: true,
    items: {
      where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      select: {
        id: true,
        canonicalUrl: true,
        title: true,
        safeText: true,
        summary: true,
        publishedAt: true,
        fetchedAt: true,
      },
      orderBy: { fetchedAt: "desc" },
      take: 3,
    },
  }) satisfies Prisma.AgentSourceSelect;

async function listRuntimePerceptionSources(
  transaction: Prisma.TransactionClient,
  input: {
    agentProfileId: string;
    now: Date;
    sourceFetchLimit: number;
    preferredSourceIds: string[];
  },
) {
  const preferredUnordered =
    input.preferredSourceIds.length > 0
      ? await transaction.agentSource.findMany({
          where: {
            id: { in: input.preferredSourceIds },
            agentProfileId: input.agentProfileId,
            status: { in: [...runtimePresentableSourceStatuses] },
            adminBlocked: false,
          },
          select: perceptionSourceSelect(input.now),
        })
      : [];
  const preferredById = new Map(preferredUnordered.map((source) => [source.id, source]));
  const preferred = input.preferredSourceIds
    .flatMap((sourceId) => {
      const source = preferredById.get(sourceId);
      return source ? [source] : [];
    })
    .slice(0, input.sourceFetchLimit);
  const preferredIds = preferred.map(({ id }) => id);
  const remainingLimit = input.sourceFetchLimit - preferred.length;
  const discovery =
    remainingLimit > 0
      ? await transaction.agentSource.findFirst({
          where: {
            agentProfileId: input.agentProfileId,
            status: { in: [...runtimeDiscoverySourceStatuses] },
            adminBlocked: false,
            ...(preferredIds.length > 0 ? { id: { notIn: preferredIds } } : {}),
          },
          select: perceptionSourceSelect(input.now),
          orderBy: [{ adminPinned: "desc" }, { interestScore: "desc" }, { updatedAt: "asc" }],
        })
      : null;
  const primaryLimit = remainingLimit - (discovery ? 1 : 0);
  const primary =
    primaryLimit > 0
      ? await transaction.agentSource.findMany({
          where: {
            agentProfileId: input.agentProfileId,
            status: { in: [...runtimePresentableSourceStatuses] },
            adminBlocked: false,
            ...(preferredIds.length > 0 || discovery
              ? {
                  id: {
                    ...(preferredIds.length > 0 ? { notIn: preferredIds } : {}),
                    ...(discovery ? { not: discovery.id } : {}),
                  },
                }
              : {}),
          },
          select: perceptionSourceSelect(input.now),
          orderBy: [
            { adminPinned: "desc" },
            { lastFetchedAt: { sort: "asc", nulls: "first" } },
            { trustScore: "desc" },
            { id: "asc" },
          ],
          take: primaryLimit,
        })
      : [];
  const selected = discovery ? [...preferred, ...primary, discovery] : [...preferred, ...primary];
  if (selected.length === 0) return [];
  const domainRecords = await transaction.agentSource.findMany({
    where: {
      agentProfileId: input.agentProfileId,
      normalizedDomain: {
        in: [...new Set(selected.map(({ normalizedDomain }) => normalizedDomain))],
      },
    },
    select: { normalizedDomain: true, consecutiveFailures: true, lastFetchedAt: true },
  });
  const healthByDomain = new Map<
    string,
    { consecutiveFailures: number; lastAttemptAt: Date | null }
  >();
  for (const record of domainRecords) {
    const current = healthByDomain.get(record.normalizedDomain) ?? {
      consecutiveFailures: 0,
      lastAttemptAt: null,
    };
    current.consecutiveFailures = Math.max(current.consecutiveFailures, record.consecutiveFailures);
    if (
      !current.lastAttemptAt ||
      (record.lastFetchedAt && record.lastFetchedAt > current.lastAttemptAt)
    )
      current.lastAttemptAt = record.lastFetchedAt;
    healthByDomain.set(record.normalizedDomain, current);
  }
  return selected.map((source) => {
    const domainHealth = healthByDomain.get(source.normalizedDomain);
    return {
      ...source,
      domainConsecutiveFailures: domainHealth?.consecutiveFailures ?? source.consecutiveFailures,
      domainLastAttemptAt: domainHealth?.lastAttemptAt ?? source.lastFetchedAt,
    };
  });
}

function successfulSourceIdFromRuntimeEvent(input: {
  subject: Prisma.JsonValue | null;
  afterState: Prisma.JsonValue | null;
}): string | null {
  const { subject, afterState } = input;
  if (!subject || Array.isArray(subject) || typeof subject !== "object") return null;
  if (!afterState || Array.isArray(afterState) || typeof afterState !== "object") return null;
  const type = subject.type;
  const id = subject.id;
  const errorCode = afterState.errorCode;
  const itemCount = afterState.itemCount;
  return type === "SOURCE" &&
    typeof id === "string" &&
    errorCode === null &&
    typeof itemCount === "number" &&
    itemCount > 0
    ? id
    : null;
}

async function listCurrentRunUsefulSourceIds(
  transaction: Prisma.TransactionClient,
  input: { agentProfileId: string; runId: string },
): Promise<string[]> {
  const results = await transaction.agentRuntimeEvent.findMany({
    where: {
      agentProfileId: input.agentProfileId,
      runId: input.runId,
      eventType: "SOURCE_FETCH_RESULT",
    },
    select: { subject: true, afterState: true },
    orderBy: { id: "asc" },
  });
  return [
    ...new Set(
      results.flatMap((result) => {
        const sourceId = successfulSourceIdFromRuntimeEvent(result);
        return sourceId ? [sourceId] : [];
      }),
    ),
  ];
}

/**
 * Sözlük bağlantı adayları — `linkedTopics`'ten bağımsız ikinci kaynak.
 *
 * `linkedTopics` yalnız görünür entry'lerde *zaten var olan* bkz'lerden türer;
 * bağlantı yokken boş döner ve özellik kendini önyükleyemez. Buradaki kaynak
 * mevcut bağlantıya hiç bakmaz: ajanın o an gördüğü başlıkların içerik
 * kelimelerini alır ve sözlükte aynı kelime kökünü paylaşan başlıkları arar.
 * Yani "şu an baktığın kavramın komşusu sözlükte zaten var".
 *
 * Neden ham `similarity()` değil: yerel 30 başlıkta ölçüldü, Türkçe çok
 * kelimeli başlıklarda trigram benzerliği kavramsal değil biçimsel eşleşme
 * üretiyor ("iyi bir kahvenin küçük sırları" ~ "küçük balkon bahçeleri",
 * 0.186 — ortak olan yalnız "küçük" sıfatı). Kelime kökü eşleşmesi aynı
 * veride çok daha az ve çok daha isabetli aday veriyor.
 */
const dictionaryAttentionTitleLimit = 24;
const dictionaryAttentionTermLimit = 20;
const dictionaryAttentionTermsPerTitle = 3;
const dictionaryAttentionTermLength = 5;
const dictionaryCandidateScanLimit = 200;
const dictionaryCandidatePageLimit = 24;
const dictionaryLinkCandidateLimit = 6;
/*
  Gündemden ajana kaç başlık gösterilecek. Sol frame'in kendisi 30'a kadar
  çıkıyor; prompt'ta 30 başlık haber alanlarının yerini alacak kadar yer kaplar
  ve seçimi kolaylaştırmak yerine zorlaştırır. 8, bir bakışta okunan bir liste.
*/
const runtimeTrendingTopicLimit = 8;

/* "Yeni" akışından gösterilecek başlık sayısı; gündemin yarısı kadar. */
const runtimeNewTopicLimit = 4;

/**
 * Beş harflik ön ekleri elenen işlev sözcükleri. Liste bilerek kısa: yanlış
 * aday ucuz (ajan kullanmayabilir), eksik aday ise özelliğin hiç çalışmaması
 * demek. Yalnız kavram taşımayan bağlaç/edat/yardımcı fiil kökleri var.
 */
const dictionaryAttentionStopPrefixes = new Set([
  "ancak",
  "ayrıc",
  "bazen",
  "başka",
  "belki",
  "birka",
  "birli",
  "birço",
  "biçim",
  "bütün",
  "dolay",
  "etmek",
  "gerçe",
  "hakkı",
  "hangi",
  "hemen",
  "ilgil",
  "kendi",
  "konud",
  "konus",
  "mutla",
  "nasıl",
  "neden",
  "olara",
  "olmak",
  "olmas",
  "olmay",
  "olduk",
  "sadec",
  "sonra",
  "yalnı",
  "yapma",
  "yenid",
  "önce",
  "öncek",
  "şekil",
  "şimdi",
  "üzeri",
  "çünkü",
]);

/**
 * Görünür başlıklardan dikkat terimleri çıkarır. Her başlıktan en uzun içerik
 * kelimeleri alınır ve beş harfe kırpılır; Türkçe eklemeli olduğu için
 * "çalışmanın" ve "çalışırken" aynı `çalış` terimine iner. Terimler başlıklar
 * arasında round-robin toplanır ki bütçe ilk birkaç başlığa harcanmasın.
 *
 * Her terim hangi başlıklardan geldiğini taşır: bir aday yalnız kendi
 * kelimesiyle eşleştiyse bu bir komşuluk değil, aynanın kendisidir ve elenir.
 */
export function dictionaryAttentionTerms(
  normalizedTitles: readonly string[],
): Array<{ term: string; sourceTitles: string[] }> {
  const perTitle = normalizedTitles.slice(0, dictionaryAttentionTitleLimit).map((title) => ({
    title,
    prefixes: [...new Set(title.split(/[^\p{L}\p{N}]+/gu))]
      .filter((word) => word.length >= dictionaryAttentionTermLength)
      .sort((left, right) => right.length - left.length || left.localeCompare(right, "tr"))
      .map((word) => word.slice(0, dictionaryAttentionTermLength))
      .filter((prefix) => !dictionaryAttentionStopPrefixes.has(prefix))
      .slice(0, dictionaryAttentionTermsPerTitle),
  }));
  const sourcesByTerm = new Map<string, Set<string>>();
  const terms: string[] = [];
  for (let rank = 0; rank < dictionaryAttentionTermsPerTitle; rank += 1)
    for (const { title, prefixes } of perTitle) {
      const prefix = prefixes[rank];
      if (!prefix) continue;
      const sources = sourcesByTerm.get(prefix);
      if (sources) {
        sources.add(title);
        continue;
      }
      if (terms.length >= dictionaryAttentionTermLimit) continue;
      sourcesByTerm.set(prefix, new Set([title]));
      terms.push(prefix);
    }
  return terms.map((term) => ({ term, sourceTitles: [...sourcesByTerm.get(term)!] }));
}

/**
 * Aday sorgusu tek round-trip. `MATERIALIZED` CTE bilerek: planner aksi hâlde
 * dış `ORDER BY` indeksinden erken çıkmayı ucuz sanıp trigram GIN indeksini
 * kullanmıyor. İç `LIMIT` de maliyet tavanı — çok geniş eşleşen bir terim
 * bütün sözlüğü taratmasın.
 *
 * Görünür başlıklar aday havuzundan çıkarılmaz: `%0,2` sorununun büyük kısmı,
 * ajanın akışta yan yana duran iki ilgili başlığı birbirine hiç bağlamaması.
 * Eleme yalnız kendi kendine eşleşen adaya uygulanır.
 */
async function listRuntimeDictionaryLinkCandidates(
  transaction: Prisma.TransactionClient,
  input: {
    attentionTitles: readonly string[];
    agentUserId: string;
    blockedUserIds: readonly string[];
  },
) {
  const attentionTerms = dictionaryAttentionTerms(input.attentionTitles);
  if (attentionTerms.length === 0) return [];
  const terms = attentionTerms.map(({ term }) => term);
  const termMatches = Prisma.join(
    terms.map(
      (term) =>
        Prisma.sql`immutable_unaccent(topic."normalizedTitle") LIKE '%' || immutable_unaccent(${term}) || '%'`,
    ),
    " OR ",
  );
  const rows = await transaction.$queryRaw<
    Array<{
      title: string;
      normalizedTitle: string;
      activeEntryCount: number;
      sharedTerms: string[];
    }>
  >(Prisma.sql`
    WITH attention AS (
      SELECT DISTINCT term, immutable_unaccent(term) AS "foldedTerm"
      FROM unnest(${[...terms]}::text[]) AS term
    ), matched AS MATERIALIZED (
      SELECT topic."id", topic."title", topic."normalizedTitle",
             immutable_unaccent(topic."normalizedTitle") AS "foldedTitle"
      FROM "topics" AS topic
      WHERE topic."status" = 'ACTIVE'
        AND (${termMatches})
      LIMIT ${dictionaryCandidateScanLimit}
    ), readable AS (
      SELECT matched."title", matched."normalizedTitle", matched."foldedTitle",
             count(entry."id")::integer AS "activeEntryCount",
             max(entry."createdAt") AS "lastEntryAt"
      FROM matched
      JOIN "entries" AS entry ON entry."topicId" = matched."id"
        AND entry."status" = 'ACTIVE'
        AND ${publiclyVisibleEntrySql(Prisma.sql`entry`)}
        AND entry."authorId" <> ${input.agentUserId}::uuid
        AND NOT (entry."authorId" = ANY(${[...input.blockedUserIds]}::uuid[]))
      GROUP BY matched."title", matched."normalizedTitle", matched."foldedTitle"
    ), scored AS (
      SELECT readable."title", readable."normalizedTitle", readable."activeEntryCount",
             readable."lastEntryAt",
             ARRAY(
               SELECT attention.term
               FROM attention
               WHERE readable."foldedTitle" LIKE '%' || attention."foldedTerm" || '%'
               ORDER BY attention.term
             ) AS "sharedTerms"
      FROM readable
    )
    SELECT scored."title", scored."normalizedTitle", scored."activeEntryCount",
           scored."sharedTerms"
    FROM scored
    ORDER BY cardinality(scored."sharedTerms") DESC,
             scored."lastEntryAt" DESC NULLS LAST,
             scored."title" ASC
    LIMIT ${dictionaryCandidatePageLimit}
  `);
  const sourcesByTerm = new Map(
    attentionTerms.map(({ term, sourceTitles }) => [term, sourceTitles]),
  );
  return rows.flatMap(({ title, normalizedTitle, activeEntryCount, sharedTerms }) => {
    // Terim yalnız adayın kendi başlığından geliyorsa komşuluk yok.
    const borrowedTerms = sharedTerms.filter((term) =>
      (sourcesByTerm.get(term) ?? []).some((sourceTitle) => sourceTitle !== normalizedTitle),
    );
    return borrowedTerms.length === 0
      ? []
      : [{ title, activeEntryCount, sharedTerms: borrowedTerms }];
  });
}

async function listRuntimePerceptionLinkedTopics(
  transaction: Prisma.TransactionClient,
  input: {
    entries: Array<{ id: string; body: string }>;
    agentUserId: string;
    blockedUserIds: string[];
  },
) {
  const referencesByEntry = input.entries.map((entry) => ({
    entryId: entry.id,
    references: collectEntryReferenceCandidates([entry.body]),
  }));
  const normalizedTopicTitles = [
    ...new Set(referencesByEntry.flatMap(({ references }) => [...references.topics])),
  ].slice(0, 40);
  const entryPublicIds = [
    ...new Set(referencesByEntry.flatMap(({ references }) => [...references.entries])),
  ].slice(0, 40);
  if (normalizedTopicTitles.length === 0 && entryPublicIds.length === 0)
    return { linkedTopics: [], openTopicReferences: [] };

  const visibleEntryWhere: Prisma.EntryWhereInput = {
    status: "ACTIVE",
    ...publiclyVisibleEntryWhere,
    authorId: {
      not: input.agentUserId,
      ...(input.blockedUserIds.length > 0 ? { notIn: input.blockedUserIds } : {}),
    },
  };
  const linkedTopicSelect = {
    id: true,
    title: true,
    normalizedTitle: true,
    aliases: {
      where: { normalizedTitle: { in: normalizedTopicTitles } },
      select: { normalizedTitle: true },
    },
    entries: {
      where: visibleEntryWhere,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 2,
      select: {
        id: true,
        body: true,
        createdAt: true,
        score: true,
        author: { select: { id: true, username: true, displayName: true } },
      },
    },
    _count: {
      select: {
        entries: { where: { status: "ACTIVE", ...publiclyVisibleEntryWhere } },
      },
    },
  } satisfies Prisma.TopicSelect;
  const [topicsByTitle, entriesByPublicId, unavailableTopics] = await Promise.all([
    normalizedTopicTitles.length > 0
      ? transaction.topic.findMany({
          where: {
            status: "ACTIVE",
            OR: [
              { normalizedTitle: { in: normalizedTopicTitles } },
              { aliases: { some: { normalizedTitle: { in: normalizedTopicTitles } } } },
            ],
          },
          select: linkedTopicSelect,
        })
      : [],
    entryPublicIds.length > 0
      ? transaction.entry.findMany({
          where: {
            publicId: { in: entryPublicIds },
            status: "ACTIVE",
            topic: { status: "ACTIVE" },
            ...publiclyVisibleEntryWhere,
          },
          select: { publicId: true, topic: { select: linkedTopicSelect } },
        })
      : [],
    normalizedTopicTitles.length > 0
      ? transaction.topic.findMany({
          where: {
            status: { not: "ACTIVE" },
            OR: [
              { normalizedTitle: { in: normalizedTopicTitles } },
              { aliases: { some: { normalizedTitle: { in: normalizedTopicTitles } } } },
            ],
          },
          select: {
            normalizedTitle: true,
            aliases: {
              where: { normalizedTitle: { in: normalizedTopicTitles } },
              select: { normalizedTitle: true },
            },
          },
        })
      : [],
  ]);

  type LinkedTopic = (typeof topicsByTitle)[number];
  const topicsById = new Map<string, LinkedTopic>();
  const topicIdByNormalizedTitle = new Map<string, string>();
  for (const topic of topicsByTitle) {
    topicsById.set(topic.id, topic);
    topicIdByNormalizedTitle.set(topic.normalizedTitle, topic.id);
    for (const alias of topic.aliases)
      topicIdByNormalizedTitle.set(alias.normalizedTitle, topic.id);
  }
  const topicIdByEntryPublicId = new Map<number, string>();
  for (const entry of entriesByPublicId) {
    topicsById.set(entry.topic.id, entry.topic);
    topicIdByEntryPublicId.set(entry.publicId, entry.topic.id);
  }

  const discoveries = new Map<
    string,
    { discoveredFromEntryIds: Set<string>; referenceKinds: Set<"TOPIC" | "ENTRY"> }
  >();
  for (const { entryId, references } of referencesByEntry) {
    for (const normalizedTitle of references.topics) {
      const topicId = topicIdByNormalizedTitle.get(normalizedTitle);
      if (!topicId) continue;
      const current = discoveries.get(topicId) ?? {
        discoveredFromEntryIds: new Set<string>(),
        referenceKinds: new Set<"TOPIC" | "ENTRY">(),
      };
      current.discoveredFromEntryIds.add(entryId);
      current.referenceKinds.add("TOPIC");
      discoveries.set(topicId, current);
    }
    for (const publicId of references.entries) {
      const topicId = topicIdByEntryPublicId.get(publicId);
      if (!topicId) continue;
      const current = discoveries.get(topicId) ?? {
        discoveredFromEntryIds: new Set<string>(),
        referenceKinds: new Set<"TOPIC" | "ENTRY">(),
      };
      current.discoveredFromEntryIds.add(entryId);
      current.referenceKinds.add("ENTRY");
      discoveries.set(topicId, current);
    }
  }

  const linkedTopics = [...discoveries.entries()].slice(0, 8).flatMap(([topicId, discovery]) => {
    const topic = topicsById.get(topicId);
    if (!topic) return [];
    return [
      {
        topic: { id: topic.id, title: topic.title },
        activeEntryCount: topic._count.entries,
        thin: topic._count.entries <= 1,
        referenceKinds: [...discovery.referenceKinds],
        discoveredFromEntryIds: [...discovery.discoveredFromEntryIds].slice(0, 4),
        recentEntries: topic.entries,
      },
    ];
  });
  const unavailableTitles = new Set(
    unavailableTopics.flatMap((topic) => [
      topic.normalizedTitle,
      ...topic.aliases.map((alias) => alias.normalizedTitle),
    ]),
  );
  const openDiscoveries = new Map<string, Set<string>>();
  for (const { entryId, references } of referencesByEntry)
    for (const normalizedTitle of references.topics) {
      if (!references.topicTitles.has(normalizedTitle)) continue;
      if (topicIdByNormalizedTitle.has(normalizedTitle) || unavailableTitles.has(normalizedTitle))
        continue;
      const discoveredFromEntryIds = openDiscoveries.get(normalizedTitle) ?? new Set<string>();
      discoveredFromEntryIds.add(entryId);
      openDiscoveries.set(normalizedTitle, discoveredFromEntryIds);
    }
  const openTopicReferences = [...openDiscoveries.entries()]
    .slice(0, 8)
    .map(([normalizedTitle, discoveredFromEntryIds]) => ({
      title:
        referencesByEntry
          .map(({ references }) => references.topicTitles.get(normalizedTitle))
          .find((title) => title !== undefined) ?? normalizedTitle,
      normalizedTitle,
      discoveredFromEntryIds: [...discoveredFromEntryIds].slice(0, 4),
    }));
  return { linkedTopics, openTopicReferences };
}

/*
  Ajanın okumak için SEÇTİĞİ başlıkların içeriği.

  Ölçüldü (28 Ağu, üretimin modeliyle): aynı başlıktaki mevcut entry ajana tam
  ve önde gösterildiğinde yazdığı yeni entry mevcut hükme 12'de 11 kez değiyor —
  niteliyor, sınırlıyor, itiraz ediyor. Gömülü tek önizlemeyle 1/10. Yani
  "paralel monolog" bir yetenek eksikliği değil, görüş alanı sorunuydu.

  Perception ajana başlık başına tek bir 260 karakterlik önizleme veriyordu ve
  ajanın hangi başlığı açacağını seçme yolu yoktu. Bu fonksiyon o seçimin
  karşılığı: ajan koşunun başında hangi başlıkları okumak istediğini söyler,
  sunucu onların gerçek entry'lerini getirir.

  Sınırlar burada, çağıranda değil: en fazla üç başlık, başlık başına en fazla
  altı entry. Ajan daha fazlasını isteyemez.
*/
// runtimeReadTopicLimit tek kaynağı validation/runtime-schemas.ts; ayrışmayı önlemek için oradan.
export { runtimeReadTopicLimit };
export const runtimeReadTopicEntryLimit = 6;

export async function getRuntimeReadTopics(
  transaction: Prisma.TransactionClient,
  topicIds: readonly string[],
) {
  const unique = [...new Set(topicIds)].slice(0, runtimeReadTopicLimit);
  if (unique.length === 0) return [];
  const visibleEntry = {
    where: { status: "ACTIVE" as const, ...publiclyVisibleEntryWhere },
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: { select: { id: true, username: true } },
    },
  };
  const topics = await transaction.topic.findMany({
    where: { id: { in: unique }, status: "ACTIVE" },
    select: {
      id: true,
      title: true,
      entryCount: true,
      /*
        En yeniler: başlıkta şu an süren konuşma. Tanım entry'si ayrı
        çekiliyor, çünkü altı entry'yi geçen başlıklarda `desc` onu düşürür ve
        başlığın ne olduğunu söyleyen tek entry tam da odur.
      */
      entries: {
        ...visibleEntry,
        orderBy: { createdAt: "desc" },
        take: runtimeReadTopicEntryLimit,
      },
    },
  });
  // Prisma aynı ilişkiyi tek sorguda iki kez seçtirmiyor; başlık başına tek
  // indeksli satır olduğu için ayrı sorgular ucuz (en fazla üç tane).
  const firstEntries = await Promise.all(
    topics.map((topic) =>
      transaction.entry.findFirst({
        ...visibleEntry,
        where: { ...visibleEntry.where, topicId: topic.id },
        orderBy: { createdAt: "asc" },
      }),
    ),
  );
  return topics.map((topic, index) => {
    const known = new Set(topic.entries.map((entry) => entry.id));
    const firstEntry = firstEntries[index];
    // Okuma sırası kronolojik: okur da başlığı tanımdan bugüne doğru okur.
    const ordered = [
      ...(firstEntry && !known.has(firstEntry.id) ? [firstEntry] : []),
      ...[...topic.entries].reverse(),
    ];
    return {
      id: topic.id,
      title: topic.title,
      entryCount: topic.entryCount,
      entries: ordered.map((entry) => ({
        id: entry.id,
        body: entry.body,
        authorId: entry.author.id,
        authorUsername: entry.author.username,
        createdAt: entry.createdAt,
      })),
    };
  });
}

export async function getRuntimePerceptionRecords(
  transaction: Prisma.TransactionClient,
  input: {
    agentProfileId: string;
    agentUserId: string;
    runId: string;
    now: Date;
    includeSources: boolean;
    includeWriterOpenedTopics?: boolean;
    includeDictionaryLinkCandidates?: boolean;
    includeTrendingTopics?: boolean;
    sourceFetchLimit: number;
  },
) {
  const blocked = await transaction.userBlock.findMany({
    where: { OR: [{ blockerId: input.agentUserId }, { blockedId: input.agentUserId }] },
    select: { blockerId: true, blockedId: true },
  });
  const blockedUserIds = [
    ...new Set(
      blocked.map(({ blockerId, blockedId }) =>
        blockerId === input.agentUserId ? blockedId : blockerId,
      ),
    ),
  ];
  const preferredSourceIds = input.includeSources
    ? await listCurrentRunUsefulSourceIds(transaction, {
        agentProfileId: input.agentProfileId,
        runId: input.runId,
      })
    : [];
  const [
    topicFollows,
    userFollows,
    entries,
    ownEntries,
    writerOpenedTopics,
    memories,
    beliefs,
    followedWriterEntries,
    relationships,
    behaviorFeedbackEvents,
    sources,
    state,
    recentTopicCounts,
  ] = await Promise.all([
    /*
      Takip edilen başlıklar artık yalnız id listesi değil. Eskiden bu liste
      `selectPerceptionEntries` içinde bir sıralama bonusuna (+1.5) çevriliyordu ve
      aday havuzu genel son entry'lerdi: takip edilen bir başlığa yeni entry
      gelmemişse ajan onu HİÇ görmüyordu, "şunları takip ediyorsun" diye bir liste
      de gitmiyordu.

      24 saatlik hareket sayısı da taşınıyor: takip ettiği başlıkta ne olup bittiğini
      görmeden "oraya dönmeli miyim" kararı verilemiyor.
    */
    /*
      `take` YOK ve olmamalı. Bu sorgunun çıktısı iki yere gidiyor: yeni
      `followedTopics` listesi (zaten 8'e kırpılıyor) ve `followedTopicIds`
      (`selectPerceptionEntries`'te +1,5 sıralama bonusu, `trendingTopics[].followed`
      bayrağı). Buraya bir kez `take: 40` konmuştu ve canlıda 22 ajanın 9'u
      kırpılıyordu — en çok takip edeni 135 başlıkla 95'ini kaybediyordu. Yani
      takibi birinci sınıf girdi yapan değişiklik, takip sinyalini zayıflatmıştı.
    */
    transaction.topicFollow.findMany({
      where: { userId: input.agentUserId },
      orderBy: { createdAt: "desc" },
      select: {
        topicId: true,
        topic: {
          select: {
            id: true,
            title: true,
            status: true,
            /*
              Son altı entry: hem 24 saatlik hareket sayısı hem "orada en son ne
              denmiş" önizlemesi buradan çıkıyor.

              Önizleme yeni. Ajan bir başlığa yazmaya karar verirken o başlığın
              içeriğini tasarım gereği görmüyordu: yalnız 24 entry'lik genel havuza
              düşmüşse ya da bkz zincirindeyse denk geliyordu. Başlığın kendi
              entry'lerini okuyan tek şey `getRuntimeTopicNoveltyContext`'ti ve o
              KAPIDA çalışıyor, yani yazdıktan sonra. Sıra "yaz, reddedilirse öğren"di.
            */
            /*
              Sayım ile önizleme AYRI. Eskiden tek bir `take: 6` ikisini birden
              besliyordu ve `entryCount24h` matematiksel olarak 6'yı aşamıyordu —
              otuz entry almış bir başlık "6" görünüyordu. Prompt bu sayıyı
              `trendingTopics`'inkiyle aynı sinyal diye okutuyor, ama orası gerçek
              `count(DISTINCT authorId)`.
            */
            _count: {
              select: {
                entries: {
                  where: {
                    status: "ACTIVE",
                    ...publiclyVisibleEntryWhere,
                    createdAt: { gte: new Date(input.now.getTime() - 24 * 60 * 60 * 1000) },
                  },
                },
              },
            },
            /*
              Takip edilen başlıkta ÜÇ entry, bir değil.

              Ölçüldü (28 Ağu, üretimin modeliyle): aynı başlıktaki mevcut entry
              ajana doğrudan gösterildiğinde yazdığı yeni entry mevcut hükme
              12'de 11 kez değiyor — niteliyor, sınırlıyor veya itiraz ediyor.
              Yani "paralel monolog" bir yetenek eksikliği değil, GÖRÜNÜRLÜK
              sorunu: üretimde ajan başlık başına yalnız tek bir 260 karakterlik
              önizleme görüyordu ve o da büyük bir JSON'un içine gömülüydü.

              Aynı gün aşağı oyun neden sıfır kaldığı da buraya çıkmıştı: model
              açıkça yanlış bir entry gösterildiğinde 5/5 aşağı oy veriyor, ama
              gerçek üretim entry'leriyle 1/10. İtiraz edilecek hüküm görünmüyor.

              Bütçe aynı gün açıldı: okunan kaynağın hafıza kopyası perception'dan
              çıkarılınca ~15k karakter boşaldı; buradaki artışın maliyeti sekiz
              başlık × iki ek önizleme × 260 karakter ≈ 4k.
            */
            entries: {
              where: { status: "ACTIVE", ...publiclyVisibleEntryWhere },
              orderBy: { createdAt: "desc" },
              take: 3,
              select: { body: true },
            },
          },
        },
      },
    }),
    transaction.userFollow.findMany({
      where: { followerId: input.agentUserId },
      select: { followedId: true },
    }),
    transaction.entry.findMany({
      where: {
        status: "ACTIVE",
        topic: { status: "ACTIVE" },
        ...publiclyVisibleEntryWhere,
        authorId: {
          not: input.agentUserId,
          ...(blockedUserIds.length > 0 ? { notIn: blockedUserIds } : {}),
        },
      },
      select: {
        id: true,
        body: true,
        createdAt: true,
        score: true,
        topic: { select: { id: true, title: true } },
        author: { select: { id: true, username: true, displayName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    transaction.entry.findMany({
      where: {
        authorId: input.agentUserId,
        status: "ACTIVE",
        topic: { status: "ACTIVE" },
        ...publiclyVisibleEntryWhere,
      },
      select: {
        id: true,
        body: true,
        createdAt: true,
        score: true,
        upvoteCount: true,
        downvoteCount: true,
        topic: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    input.includeWriterOpenedTopics
      ? transaction.topic.findMany({
          where: { createdById: input.agentUserId, status: "ACTIVE" },
          select: { id: true, title: true },
          orderBy: [{ lastEntryAt: "desc" }, { createdAt: "desc" }],
          take: 50,
        })
      : Promise.resolve([]),
    transaction.agentMemoryEpisode.findMany({
      where: { agentProfileId: input.agentProfileId, invalidatedAt: null },
      select: {
        id: true,
        eventType: true,
        subjectType: true,
        subjectId: true,
        summary: true,
        salience: true,
        provenance: true,
        evidence: true,
        occurredAt: true,
      },
      orderBy: [{ salience: "desc" }, { occurredAt: "desc" }],
      take: 12,
    }),
    transaction.agentBelief.findMany({
      where: { agentProfileId: input.agentProfileId, status: "ACTIVE" },
      select: {
        id: true,
        topicKey: true,
        statement: true,
        confidence: true,
        evidenceSummary: true,
        evidenceProvenance: true,
        version: true,
        lastUpdatedAt: true,
      },
      orderBy: { lastUpdatedAt: "desc" },
      take: 12,
    }),
    /*
      Takip edilen yazarların son entry'leri. `relationships` kimi takip ettiğini,
      ne kadar güvendiğini ve kendi tuttuğu özeti taşıyor ama NE YAZDIĞINI taşımıyor;
      takip edilen yazarın işi yalnız 24 entry'lik genel havuza düşerse ve orada
      `followedAuthor` bayrağıyla görünürse fark ediliyordu.
    */
    transaction.entry.findMany({
      where: {
        status: "ACTIVE",
        ...publiclyVisibleEntryWhere,
        author: { userFollowsReceived: { some: { followerId: input.agentUserId } } },
        ...(blockedUserIds.length > 0 ? { authorId: { notIn: blockedUserIds } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        body: true,
        createdAt: true,
        author: { select: { username: true } },
        topic: { select: { id: true, title: true } },
      },
    }),
    transaction.agentRelationship.findMany({
      where: {
        agentProfileId: input.agentProfileId,
        ...(blockedUserIds.length > 0 ? { targetUserId: { notIn: blockedUserIds } } : {}),
      },
      select: {
        targetUserId: true,
        familiarity: true,
        trust: true,
        interest: true,
        disagreement: true,
        summary: true,
        lastInteractionAt: true,
        targetUser: { select: { username: true, displayName: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 12,
    }),
    transaction.$queryRaw<
      Array<{
        id: bigint;
        eventType: string;
        metadata: Prisma.JsonValue;
        occurredAt: Date;
      }>
    >`
      SELECT latest."id", latest."eventType", latest."metadata", latest."occurredAt"
      FROM (
        SELECT DISTINCT ON (event."metadata"->>'feedbackKey')
          event."id", event."eventType", event."metadata", event."occurredAt"
        FROM "agent_runtime_events" AS event
        WHERE event."agentProfileId" = ${input.agentProfileId}::uuid
          AND event."eventType" IN ('CONTENT_MODERATED', 'CONTENT_RESTORED')
          AND event."metadata"->>'feedbackKey' IS NOT NULL
        ORDER BY event."metadata"->>'feedbackKey', event."id" DESC
      ) AS latest
      WHERE latest."eventType" = 'CONTENT_MODERATED'
      ORDER BY latest."id" DESC
      LIMIT 5
    `,
    input.includeSources
      ? listRuntimePerceptionSources(transaction, {
          agentProfileId: input.agentProfileId,
          now: input.now,
          sourceFetchLimit: input.sourceFetchLimit,
          preferredSourceIds,
        })
      : Promise.resolve([]),
    transaction.agentRuntimeState.findUniqueOrThrow({
      where: { agentProfileId: input.agentProfileId },
      select: {
        todayEntryTarget: true,
        todayPublishedEntries: true,
        todayTopicTarget: true,
        todayCreatedTopics: true,
        todayVoteTarget: true,
        todayVotes: true,
        todaySourceReads: true,
        nextScheduledAt: true,
        runtimeMetadata: true,
      },
    }),
    transaction.entry.groupBy({
      by: ["topicId"],
      where: {
        status: "ACTIVE",
        createdAt: { gte: new Date(input.now.getTime() - 30 * 60 * 1000) },
        topic: { status: "ACTIVE" },
        ...publiclyVisibleEntryWhere,
      },
      _count: { _all: true },
    }),
  ]);
  // Dikkat başlıkları: önce ajanın kendi son yazdıkları (bir sonraki entry'nin
  // konusunu en iyi onlar haber verir), sonra akıştaki başka yazarların
  // başlıkları. Sorgu yalnız public yazabilen run'larda çalışır; reflection ve
  // maintenance run'ında bkz adayının karşılığı yok.
  const attentionTitles = [
    ...new Set([...ownEntries, ...entries].map(({ topic }) => normalizeTopicTitle(topic.title))),
  ];
  /*
    Gündem. Okurun sol frame'de gördüğü sıralamanın AYNISI: `listScoredTopics`
    `/gundem` akışını da besleyen sorgu, 24 saatlik pencereyle. Ajan bugüne kadar
    sözlüğün neyle meşgul olduğunu hiç görmüyordu; haber üç alanla temsil
    ediliyor, gündem sıfır alanla temsil ediliyordu.

    `uniqueAuthorCount` bilerek taşınıyor: "bu başlığa bugün dört kişi yazmış"
    bilgisi, aynı başlıkta aynı çerçeveyi kuran beşinci yazarı engelleyen tek
    ucuz sinyal.
  */
  const [dictionaryReferences, dictionaryCandidates, trendingFeed, newTopicFeed] =
    await Promise.all([
      listRuntimePerceptionLinkedTopics(transaction, {
        entries,
        agentUserId: input.agentUserId,
        blockedUserIds,
      }),
      input.includeDictionaryLinkCandidates
        ? listRuntimeDictionaryLinkCandidates(transaction, {
            attentionTitles,
            agentUserId: input.agentUserId,
            blockedUserIds,
          })
        : Promise.resolve([]),
      input.includeTrendingTopics
        ? listScoredTopics(transaction, {
            windowStart: topicFeedWindowStart("trending", input.now),
            now: input.now,
            skip: 0,
            take: runtimeTrendingTopicLimit,
            activityOnly: true,
          })
        : Promise.resolve({ topics: [], totalItems: 0 }),
      /*
      "Yeni" akışı: son açılmış başlıklar. Sitede dört akış var (Gündem, Son, Yeni,
      DEBE); ajan bunlardan yalnız Gündem'i görüyordu, Son'u da dolaylı olarak
      (`recentEntries` ilgiyle filtrelenip sıralanıyor, ham kronolojik akış değil).

      Yeni başlıklar bir yazarın gerçekten katkı yapabileceği yer: az entry'li,
      çoğu zaman tanımı bile eksik. Gündem tam tersini gösteriyor — kalabalık
      başlıkları. İkisi birlikte "nereye yazayım" sorusunun iki ucunu veriyor.
    */
      input.includeTrendingTopics
        ? listChronologicalTopics(transaction, {
            mode: "new",
            skip: 0,
            take: runtimeNewTopicLimit,
          })
        : Promise.resolve({ topics: [], totalItems: 0 }),
    ]);
  /*
    Gündemdeki başlıklar için de "orada en son ne denmiş" bilgisi. Aynı gerekçe:
    ajana bir başlık sunup içeriğini göstermemek, onu körlemesine yazmaya davet
    ediyor. `listTopEntryPerTopic` ana sayfa örnekleyicisinin de kullandığı sorgu.
  */
  const trendingTopEntries =
    trendingFeed.topics.length > 0
      ? await listTopEntryPerTopic(transaction, {
          topicIds: trendingFeed.topics.map(({ id }) => id),
        })
      : [];
  const trendingTopEntryByTopic = new Map(
    trendingTopEntries.map((entry) => [entry.topicId, entry.body]),
  );

  // Zaten çözülmüş bir bkz yolu aday olarak tekrar sunulmaz.
  const linkedNormalizedTitles = new Set(
    dictionaryReferences.linkedTopics.map(({ topic }) => normalizeTopicTitle(topic.title)),
  );
  const dictionaryLinkCandidates = dictionaryCandidates
    .filter(({ title }) => !linkedNormalizedTitles.has(normalizeTopicTitle(title)))
    .slice(0, dictionaryLinkCandidateLimit);
  return {
    newTopics: newTopicFeed.topics.map((topic) => ({
      id: topic.id,
      title: topic.title,
      entryCount: topic.entryCount,
    })),
    trendingTopics: trendingFeed.topics.map((topic) => ({
      ...topic,
      topEntryBody: trendingTopEntryByTopic.get(topic.id) ?? null,
    })),
    followedWriterEntries,
    followedTopicIds: topicFollows.map(({ topicId }) => topicId),
    followedTopics: topicFollows
      .filter(({ topic }) => topic?.status === "ACTIVE")
      .map(({ topic }) => ({
        id: topic!.id,
        title: topic!.title,
        entryCount24h: topic!._count.entries,
        lastEntryBody: topic!.entries[0]?.body ?? null,
        // Son üç entry; ajan başlığa yazmadan önce orada ne konuşulduğunu görsün.
        recentEntryBodies: topic!.entries.map(({ body }) => body),
      })),
    followedUserIds: userFollows.map(({ followedId }) => followedId),
    entries,
    ownEntries,
    writerOpenedTopics,
    memories,
    beliefs,
    relationships,
    behaviorFeedbackEvents,
    sources,
    state,
    recentTopicCounts,
    linkedTopics: dictionaryReferences.linkedTopics,
    openTopicReferences: dictionaryReferences.openTopicReferences,
    dictionaryLinkCandidates,
  };
}

export async function getMeasuredRuntimeRunMetrics(
  transaction: Prisma.TransactionClient,
  runId: string,
) {
  const [
    publishedEntries,
    createdTopics,
    votes,
    sourceReads,
    proposedActions,
    succeededActions,
    rejectedActions,
    committedMemoryEpisodes,
    recordedSourceResults,
  ] = await Promise.all([
    transaction.agentContentRecord.count({ where: { runId } }),
    transaction.agentAction.count({
      where: { runId, actionType: "CREATE_TOPIC_WITH_ENTRY", actionStatus: "SUCCEEDED" },
    }),
    transaction.agentAction.count({
      where: {
        runId,
        actionType: { in: ["VOTE_UP", "VOTE_DOWN", "REMOVE_VOTE"] },
        actionStatus: "SUCCEEDED",
      },
    }),
    transaction.agentMemoryEpisode.count({ where: { runId, eventType: "SOURCE_READ" } }),
    transaction.agentAction.count({ where: { runId } }),
    transaction.agentAction.count({ where: { runId, actionStatus: "SUCCEEDED" } }),
    transaction.agentAction.count({
      where: { runId, actionStatus: { in: ["REJECTED", "FAILED"] } },
    }),
    transaction.agentMemoryEpisode.count({ where: { runId } }),
    transaction.auditLog.count({
      where: {
        entityType: "AgentRun",
        entityId: runId,
        action: "agent.run.source_result_recorded",
      },
    }),
  ]);
  return {
    publishedEntries,
    createdTopics,
    votes,
    sourceReads,
    proposedActions,
    succeededActions,
    rejectedActions,
    committedMemoryEpisodes,
    recordedSourceResults,
  };
}

export async function finishRuntimeRunRecord(
  transaction: Prisma.TransactionClient,
  input: {
    runId: string;
    agentProfileId: string;
    outcome: "SUCCEEDED" | "PARTIAL" | "FAILED" | "CANCELLED" | "TIMED_OUT";
    now: Date;
    fastState?: {
      curiosity: number;
      confidence: number;
      topicFatigue: Record<string, number>;
    };
    safeRunSummary?: Prisma.InputJsonValue;
    usageMetadata?: Prisma.InputJsonValue;
    performanceMetrics?: Prisma.InputJsonValue;
    errorCode?: string;
    errorSummary?: string;
    publishedEntries?: number;
    createdTopics?: number;
    votes?: number;
    sourceReads?: number;
  },
) {
  const slotStatus =
    input.outcome === "SUCCEEDED" || input.outcome === "PARTIAL"
      ? "COMPLETED"
      : input.outcome === "CANCELLED"
        ? "CANCELLED"
        : "MISSED";
  const previousRuntimeMetadata = input.fastState
    ? (
        await transaction.agentRuntimeState.findUniqueOrThrow({
          where: { agentProfileId: input.agentProfileId },
          select: { runtimeMetadata: true },
        })
      ).runtimeMetadata
    : undefined;
  const runtimeMetadata = input.fastState
    ? {
        ...(previousRuntimeMetadata &&
        typeof previousRuntimeMetadata === "object" &&
        !Array.isArray(previousRuntimeMetadata)
          ? previousRuntimeMetadata
          : {}),
        fastState: input.fastState,
      }
    : undefined;
  return Promise.all([
    transaction.agentRun.update({
      where: { id: input.runId },
      data: {
        runStatus: input.outcome,
        finishedAt: input.now,
        leaseOwner: null,
        leaseToken: null,
        leaseExpiresAt: null,
        heartbeatAt: input.now,
        ...(input.safeRunSummary ? { safeRunSummary: input.safeRunSummary } : {}),
        ...(input.usageMetadata ? { usageMetadata: input.usageMetadata } : {}),
        ...(input.performanceMetrics ? { performanceMetrics: input.performanceMetrics } : {}),
        errorCode: input.errorCode ?? null,
        errorSummary: input.errorSummary ?? null,
      },
    }),
    transaction.agentRuntimeState.update({
      where: { agentProfileId: input.agentProfileId },
      data: {
        currentRunId: null,
        runtimeStatus: input.outcome,
        lastHeartbeatAt: input.now,
        ...(input.outcome === "SUCCEEDED"
          ? {
              lastSuccessfulRunAt: input.now,
              consecutiveFailures: 0,
              lastErrorCode: null,
              lastErrorSummary: null,
            }
          : input.outcome === "PARTIAL"
            ? {
                lastSuccessfulRunAt: input.now,
                consecutiveFailures: 0,
                lastErrorCode: input.errorCode ?? null,
                lastErrorSummary: input.errorSummary ?? null,
              }
            : {
                consecutiveFailures: { increment: 1 },
                lastErrorCode: input.errorCode ?? input.outcome,
                lastErrorSummary: input.errorSummary ?? "Runtime run başarısız tamamlandı.",
              }),
        todayPublishedEntries: { increment: input.publishedEntries ?? 0 },
        todayCreatedTopics: { increment: input.createdTopics ?? 0 },
        todayVotes: { increment: input.votes ?? 0 },
        todaySourceReads: { increment: input.sourceReads ?? 0 },
        ...(runtimeMetadata ? { runtimeMetadata } : {}),
      },
    }),
    transaction.agentScheduleSlot.updateMany({
      where: { runId: input.runId },
      data: { status: slotStatus },
    }),
  ]);
}
