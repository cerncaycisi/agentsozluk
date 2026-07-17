import type { Prisma } from "@prisma/client";
import type { DatabaseExecutor } from "@/lib/db/types";

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

export function getRuntimeGlobalSettings(transaction: Prisma.TransactionClient) {
  return transaction.agentGlobalSettings.findUniqueOrThrow({
    where: { id: "global" },
    select: {
      runtimeEnabled: true,
      publishEnabled: true,
      sourceReadingEnabled: true,
      votingEnabled: true,
      topicCreationEnabled: true,
      userFollowingEnabled: true,
      sourceEvolutionEnabled: true,
      quotaMode: true,
      defaultDailyEntryMax: true,
      globalDailyEntryMax: true,
      maxEntriesPerHour: true,
      maxEntriesPerThreeHours: true,
      duplicateSimilarityThreshold: true,
      maxRetryCount: true,
    },
  });
}

export async function lockRuntimeRun(
  transaction: Prisma.TransactionClient,
  runId: string,
): Promise<void> {
  const key = `agent-run:${runId}`;
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
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

export async function finalizeExpiredCancellation(
  transaction: Prisma.TransactionClient,
  agentProfileId: string,
  now: Date,
): Promise<void> {
  const cancelled = await transaction.agentRun.findMany({
    where: {
      agentProfileId,
      runStatus: "CANCEL_REQUESTED",
      leaseExpiresAt: { lt: now },
    },
    select: { id: true },
  });
  if (cancelled.length === 0) return;
  const ids = cancelled.map(({ id }) => id);
  await transaction.agentRun.updateMany({
    where: { id: { in: ids } },
    data: {
      runStatus: "CANCELLED",
      finishedAt: now,
      leaseOwner: null,
      leaseExpiresAt: null,
      errorCode: "CANCEL_LEASE_EXPIRED",
      errorSummary: "İptal istenen run lease süresi dolunca güvenli biçimde kapatıldı.",
    },
  });
  await transaction.agentRuntimeState.updateMany({
    where: { agentProfileId, currentRunId: { in: ids } },
    data: {
      currentRunId: null,
      runtimeStatus: "CANCELLED",
      lastErrorCode: "CANCEL_LEASE_EXPIRED",
      lastErrorSummary: "İptal istenen run lease süresi dolunca kapatıldı.",
    },
  });
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
    now: Date;
  },
) {
  const candidates = await transaction.$queryRaw<LeaseCandidate[]>`
    SELECT candidate."id", candidate."startedAt"
    FROM "agent_runs" AS candidate
    WHERE candidate."agentProfileId" = ${input.agentProfileId}::uuid
      AND candidate."availableAt" <= ${input.now}
      AND candidate."attempts" <= ${input.maxRetryCount}
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
        END - LEAST(2, FLOOR(EXTRACT(EPOCH FROM (${input.now} - candidate."createdAt")) / 3600)::int)
      ),
      candidate."createdAt" ASC
    FOR UPDATE OF candidate SKIP LOCKED
    LIMIT 1
  `;
  const candidate = candidates[0];
  if (!candidate) return null;
  const leaseExpiresAt = new Date(input.now.getTime() + input.leaseSeconds * 1000);
  return transaction.agentRun.update({
    where: { id: candidate.id },
    data: {
      runStatus: "RUNNING",
      leaseOwner: input.workerId,
      leaseExpiresAt,
      heartbeatAt: input.now,
      startedAt: candidate.startedAt ?? input.now,
      attempts: { increment: 1 },
    },
    select: {
      id: true,
      agentProfileId: true,
      runType: true,
      runStatus: true,
      queuePriority: true,
      timeoutSeconds: true,
      desiredEntryMin: true,
      desiredEntryMax: true,
      leaseExpiresAt: true,
      attempts: true,
      personaVersionId: true,
      allowTopicCreation: true,
      allowVoting: true,
      allowFollowing: true,
      allowSourceReading: true,
      saturationOverride: true,
      dailyMaximumOverride: true,
    },
  });
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
        select: { version: true, persona: true, renderedPrompt: true },
      },
      agentProfile: {
        select: {
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

export function heartbeatRuntimeRunRecord(
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
  return Promise.all([
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
      targetType?: string;
      targetId?: string;
      input: Prisma.InputJsonValue;
      provenance?: Prisma.InputJsonValue;
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
      input: action.input,
      ...(action.provenance !== undefined ? { provenance: action.provenance } : {}),
    })),
  });
  return { count: input.actions.length };
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
          leaseExpiresAt: true,
          allowTopicCreation: true,
          allowVoting: true,
          allowFollowing: true,
          saturationOverride: true,
          dailyMaximumOverride: true,
        },
      },
      agentProfile: {
        select: {
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
    return { valid: runs + events + topics + entries === uniqueIds.length, independentSources: 0 };
  }
  if (input.evidenceType === "USER_ENTRY") {
    const entries = await transaction.entry.count({
      where: { id: { in: uniqueIds }, status: "ACTIVE", topic: { status: "ACTIVE" } },
    });
    return { valid: entries === uniqueIds.length, independentSources: 0 };
  }
  if (input.evidenceType === "AGENT_MEMORY") {
    const memories = await transaction.agentMemoryEpisode.count({
      where: {
        id: { in: uniqueIds },
        agentProfileId: input.agentProfileId,
        invalidatedAt: null,
      },
    });
    return { valid: memories === uniqueIds.length, independentSources: 0 };
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
    select: { source: { select: { normalizedDomain: true } } },
  });
  const independentSources = new Set(items.map(({ source }) => source.normalizedDomain)).size;
  return {
    valid:
      items.length === uniqueIds.length &&
      (input.evidenceType !== "MULTIPLE_SOURCES" || independentSources >= 2),
    independentSources,
  };
}

export function proposeRuntimeSource(
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
  return transaction.agentSource.upsert({
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
    select: { id: true, url: true, status: true, normalizedDomain: true },
  });
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
  return transaction.agentBelief.create({
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
    select: { id: true, topicKey: true, confidence: true, version: true },
  });
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
  return transaction.agentRelationship.upsert({
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
    select: { id: true, targetUserId: true, trust: true, familiarity: true },
  });
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

export async function getRuntimePerceptionRecords(
  transaction: Prisma.TransactionClient,
  input: { agentProfileId: string; agentUserId: string; now: Date; includeSources: boolean },
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
      ? transaction.agentSource.findMany({
          where: {
            agentProfileId: input.agentProfileId,
            status: { in: ["SEED", "PROBATION", "TRUSTED"] },
            adminBlocked: false,
          },
          select: {
            id: true,
            normalizedDomain: true,
            status: true,
            trustScore: true,
            topics: true,
            items: {
              where: { OR: [{ expiresAt: null }, { expiresAt: { gt: input.now } }] },
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
          },
          orderBy: [{ adminPinned: "desc" }, { trustScore: "desc" }],
          take: 8,
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
  const [publishedEntries, createdTopics, votes] = await Promise.all([
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
  ]);
  return { publishedEntries, createdTopics, votes, sourceReads: 0 };
}

export function finishRuntimeRunRecord(
  transaction: Prisma.TransactionClient,
  input: {
    runId: string;
    agentProfileId: string;
    outcome: "SUCCEEDED" | "PARTIAL" | "FAILED" | "CANCELLED" | "TIMED_OUT";
    now: Date;
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
  return Promise.all([
    transaction.agentRun.update({
      where: { id: input.runId },
      data: {
        runStatus: input.outcome,
        finishedAt: input.now,
        leaseOwner: null,
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
      },
    }),
  ]);
}
