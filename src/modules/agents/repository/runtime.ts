import { Prisma, type AgentRunType } from "@prisma/client";
import type { DatabaseExecutor } from "@/lib/db/types";
import { createOpaqueToken } from "@/lib/security/crypto";
import type { WeeklyPersonaEvolutionDelta } from "@/modules/agents/domain/persona-evolution";
import { istanbulQuotaLocalDate, resolveQuotaSettings } from "@/modules/agents/domain/quota";
import {
  runtimeRunAllowedInOperatingMode,
  type RuntimeOperatingMode,
} from "@/modules/agents/domain/runtime-controls";

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

export async function getRuntimeGlobalSettings(
  transaction: Prisma.TransactionClient,
  now = new Date(),
) {
  const stored = await transaction.agentGlobalSettings.findUniqueOrThrow({
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
      quotaMode: true,
      defaultDailyEntryMin: true,
      defaultDailyEntryMax: true,
      globalDailyEntryMin: true,
      globalDailyEntryMax: true,
      pendingQuotaSettings: true,
      pendingQuotaEffectiveDate: true,
      maxEntriesPerHour: true,
      maxEntriesPerThreeHours: true,
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
  return resolveQuotaSettings(stored, istanbulQuotaLocalDate(now));
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
    catchUpFrozen: boolean;
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
      AND (NOT ${input.catchUpFrozen} OR candidate."runType" <> 'DAILY_CATCH_UP')
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
      saturationOverride: true,
      dailyMaximumOverride: true,
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
  perceptionSummary: Prisma.InputJsonValue,
) {
  return transaction.agentRun.update({
    where: { id: runId },
    data: { perceptionSummary },
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
          allowTopicCreation: true,
          allowVoting: true,
          allowFollowing: true,
          saturationOverride: true,
          dailyMaximumOverride: true,
          provocationOverride: true,
        },
      },
      agentProfile: {
        select: {
          lifecycleStatus: true,
          useGlobalEntryQuota: true,
          dailyEntryMax: true,
          dailyTopicMax: true,
          dailyVoteMax: true,
          sourceEvolutionEnabled: true,
          user: { select: { id: true } },
        },
      },
    },
  });
}

export function findRuntimeReplyTarget(transaction: Prisma.TransactionClient, entryId: string) {
  return transaction.entry.findFirst({
    where: { id: entryId, status: "ACTIVE" },
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

export async function getRuntimeActionPolicyMetrics(
  transaction: Prisma.TransactionClient,
  input: {
    agentProfileId: string;
    topicId?: string;
    now: Date;
    dayStart: Date;
    dayEnd: Date;
  },
) {
  const hourStart = new Date(input.now.getTime() - 60 * 60 * 1000);
  const threeHoursStart = new Date(input.now.getTime() - 3 * 60 * 60 * 1000);
  const twoHoursStart = new Date(input.now.getTime() - 2 * 60 * 60 * 1000);
  const thirtyMinutesStart = new Date(input.now.getTime() - 30 * 60 * 1000);
  const base = { agentProfileId: input.agentProfileId };
  const [
    agentDay,
    globalDay,
    agentHour,
    agentThreeHours,
    agentTopicTwoHours,
    agentTopicDay,
    topicRecent,
    agentTopicsDay,
    agentVotesDay,
  ] = await Promise.all([
    transaction.agentContentRecord.count({
      where: { ...base, createdAt: { gte: input.dayStart, lt: input.dayEnd } },
    }),
    transaction.agentContentRecord.count({
      where: { createdAt: { gte: input.dayStart, lt: input.dayEnd } },
    }),
    transaction.agentContentRecord.count({ where: { ...base, createdAt: { gte: hourStart } } }),
    transaction.agentContentRecord.count({
      where: { ...base, createdAt: { gte: threeHoursStart } },
    }),
    input.topicId
      ? transaction.agentContentRecord.count({
          where: {
            ...base,
            createdAt: { gte: twoHoursStart },
            entry: { topicId: input.topicId },
          },
        })
      : Promise.resolve(0),
    input.topicId
      ? transaction.agentContentRecord.count({
          where: {
            ...base,
            createdAt: { gte: input.dayStart, lt: input.dayEnd },
            entry: { topicId: input.topicId },
          },
        })
      : Promise.resolve(0),
    input.topicId
      ? transaction.entry.count({
          where: {
            topicId: input.topicId,
            status: "ACTIVE",
            createdAt: { gte: thirtyMinutesStart },
          },
        })
      : Promise.resolve(0),
    transaction.agentAction.count({
      where: {
        agentProfileId: input.agentProfileId,
        actionType: "CREATE_TOPIC_WITH_ENTRY",
        actionStatus: "SUCCEEDED",
        createdAt: { gte: input.dayStart, lt: input.dayEnd },
      },
    }),
    transaction.agentAction.count({
      where: {
        agentProfileId: input.agentProfileId,
        actionType: { in: ["VOTE_UP", "VOTE_DOWN"] },
        actionStatus: "SUCCEEDED",
        createdAt: { gte: input.dayStart, lt: input.dayEnd },
      },
    }),
  ]);
  return {
    agentDay,
    globalDay,
    agentHour,
    agentThreeHours,
    agentTopicTwoHours,
    agentTopicDay,
    topicRecent,
    agentTopicsDay,
    agentVotesDay,
  };
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

export async function lockRuntimeTopicSaturation(
  transaction: Prisma.TransactionClient,
  topicId: string,
): Promise<void> {
  const key = `agent-topic-saturation:${topicId}`;
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

export async function findActiveRuntimeTopicSaturation(
  transaction: Prisma.TransactionClient,
  topicId: string,
  now: Date,
): Promise<{ id: bigint; expiresAt: Date } | null> {
  const events = await transaction.agentRuntimeEvent.findMany({
    where: {
      eventType: "topic.saturation.started",
      metadata: { path: ["topicId"], equals: topicId },
    },
    orderBy: { id: "desc" },
    take: 10,
    select: { id: true, metadata: true },
  });
  for (const event of events) {
    const metadata =
      event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
        ? (event.metadata as Prisma.JsonObject)
        : {};
    const expiresAt = typeof metadata.expiresAt === "string" ? new Date(metadata.expiresAt) : null;
    if (expiresAt && Number.isFinite(expiresAt.getTime()) && expiresAt > now)
      return { id: event.id, expiresAt };
  }
  return null;
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
        AND (${input.excludeEntryId ?? null}::uuid IS NULL OR entry."id" <> ${input.excludeEntryId ?? null}::uuid)
      ORDER BY content."createdAt" DESC
      LIMIT 100
    ), topic_recent AS (
      SELECT entry."id", entry."normalizedBody"
      FROM "entries" AS entry
      WHERE ${input.topicId ?? null}::uuid IS NOT NULL
        AND entry."topicId" = ${input.topicId ?? null}::uuid
        AND entry."status" = 'ACTIVE'
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
        ...(input.excludeEntryId ? { id: { not: input.excludeEntryId } } : {}),
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { entry: { select: { body: true } } },
  });
  return records.map(({ entry }) => entry.body);
}

export async function validateRuntimeProvenanceEvidence(
  transaction: Prisma.TransactionClient,
  input: {
    agentProfileId: string;
    runId: string;
    evidenceType:
      | "PLATFORM_EVENT"
      | "USER_ENTRY"
      | "TRUSTED_SOURCE"
      | "PROBATION_SOURCE"
      | "MULTIPLE_SOURCES"
      | "AGENT_MEMORY";
    evidenceIds: string[];
  },
) {
  const uniqueIds = [...new Set(input.evidenceIds)];
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
        where: { id: { in: uniqueIds }, status: "ACTIVE", topic: { status: "ACTIVE" } },
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
      where: { id: { in: uniqueIds }, status: "ACTIVE", topic: { status: "ACTIVE" } },
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
  const expectedStatuses =
    input.evidenceType === "TRUSTED_SOURCE"
      ? ["TRUSTED" as const]
      : input.evidenceType === "PROBATION_SOURCE"
        ? ["PROBATION" as const]
        : (["TRUSTED", "PROBATION"] as const);
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
      status: { in: ["SEED", "DISCOVERED", "PROBATION", "TRUSTED", "DORMANT"] },
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
    before.lastUsefulAt?.getTime() !== after.lastUsefulAt?.getTime()
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
    for (const item of input.items) {
      await transaction.agentSourceItem.upsert({
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
      });
    }
    const usefulItems = await transaction.agentSourceItem.count({
      where: { sourceId: input.sourceId },
    });
    const currentSource = await transaction.agentSource.findUniqueOrThrow({
      where: { id: input.sourceId },
      select: { status: true, adminBlocked: true },
    });
    const evolvedStatus = currentSource.adminBlocked
      ? currentSource.status
      : currentSource.status === "DISCOVERED"
        ? "PROBATION"
        : currentSource.status === "PROBATION" && usefulItems >= 3
          ? "TRUSTED"
          : currentSource.status;
    const updatedSource = await transaction.agentSource.update({
      where: { id: input.sourceId },
      data: {
        consecutiveFailures: 0,
        lastFetchedAt: input.now,
        ...(input.items.length > 0 ? { lastUsefulAt: input.now } : {}),
        ...(evolvedStatus !== currentSource.status ? { status: evolvedStatus } : {}),
      },
      select: { status: true },
    });
    for (const item of input.items)
      await transaction.agentMemoryEpisode.create({
        data: {
          agentProfileId: input.agentProfileId,
          runId: input.runId,
          eventType: "SOURCE_READ",
          subjectType: "SOURCE",
          subjectId: input.sourceId,
          summary: `Source item gerçekten okundu: ${item.title}`.slice(0, 2000),
          salience: 0.5,
          provenance: updatedSource.status === "TRUSTED" ? "TRUSTED_SOURCE" : "PROBATION_SOURCE",
          evidence: { sourceId: input.sourceId, contentHash: item.contentHash },
          occurredAt: input.now,
        },
      });
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
  input: { agentProfileId: string; now: Date; sourceFetchLimit: number },
) {
  const discovery = await transaction.agentSource.findFirst({
    where: {
      agentProfileId: input.agentProfileId,
      status: { in: ["DISCOVERED", "PROBATION"] },
      adminBlocked: false,
    },
    select: perceptionSourceSelect(input.now),
    orderBy: [{ adminPinned: "desc" }, { interestScore: "desc" }, { updatedAt: "asc" }],
  });
  const primaryLimit = input.sourceFetchLimit - (discovery ? 1 : 0);
  const primary =
    primaryLimit > 0
      ? await transaction.agentSource.findMany({
          where: {
            agentProfileId: input.agentProfileId,
            status: { in: ["SEED", "PROBATION", "TRUSTED", "DISCOVERED"] },
            adminBlocked: false,
            ...(discovery ? { id: { not: discovery.id } } : {}),
          },
          select: perceptionSourceSelect(input.now),
          orderBy: [{ adminPinned: "desc" }, { trustScore: "desc" }],
          take: primaryLimit,
        })
      : [];
  const selected = discovery ? [...primary, discovery] : primary;
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

export async function getRuntimePerceptionRecords(
  transaction: Prisma.TransactionClient,
  input: {
    agentProfileId: string;
    agentUserId: string;
    now: Date;
    includeSources: boolean;
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
  const [
    topicFollows,
    userFollows,
    entries,
    ownEntries,
    memories,
    beliefs,
    relationships,
    sources,
    state,
    recentTopicCounts,
  ] = await Promise.all([
    transaction.topicFollow.findMany({
      where: { userId: input.agentUserId },
      select: { topicId: true },
    }),
    transaction.userFollow.findMany({
      where: { followerId: input.agentUserId },
      select: { followedId: true },
    }),
    transaction.entry.findMany({
      where: {
        status: "ACTIVE",
        topic: { status: "ACTIVE" },
        ...(blockedUserIds.length > 0 ? { authorId: { notIn: blockedUserIds } } : {}),
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
      where: { authorId: input.agentUserId, status: "ACTIVE", topic: { status: "ACTIVE" } },
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
    input.includeSources
      ? listRuntimePerceptionSources(transaction, {
          agentProfileId: input.agentProfileId,
          now: input.now,
          sourceFetchLimit: input.sourceFetchLimit,
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
      },
      _count: { _all: true },
    }),
  ]);
  return {
    followedTopicIds: topicFollows.map(({ topicId }) => topicId),
    followedUserIds: userFollows.map(({ followedId }) => followedId),
    entries,
    ownEntries,
    memories,
    beliefs,
    relationships,
    sources,
    state,
    recentTopicCounts,
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
        ...(input.outcome === "SUCCEEDED" || input.outcome === "PARTIAL"
          ? { lastSuccessfulRunAt: input.now, consecutiveFailures: 0 }
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
