import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor, TransactionClient } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { appendAuditLog } from "@/modules/audit";
import { appendRuntimeEvent } from "@/modules/agents/repository/control-plane";
import type { RuntimePrincipal } from "@/modules/agents/application/runtime-auth";
import {
  appendRuntimeActions,
  appendRuntimeRunEvents,
  claimNextRuntimeRun,
  finalizeExpiredCancellation,
  findRuntimeOwnedRun,
  finishRuntimeRunRecord,
  getMeasuredRuntimeRunMetrics,
  getRuntimePerceptionRecords,
  getRuntimeAgentLifecycle,
  getRuntimeGlobalSettings,
  heartbeatRuntimeRunRecord,
  lockRuntimeAgent,
  lockRuntimeRun,
  setRuntimeCurrentRun,
  storeRuntimePerceptionSummary,
  validateRuntimeProvenanceEvidence,
  createRuntimeMemoryEpisode,
  findRuntimeSourceForWrite,
  storeRuntimeSourceResult,
} from "@/modules/agents/repository/runtime";
import {
  dispatchDueScheduleSlots,
  planRuntimeMaintenanceAndCatchUp,
} from "@/modules/agents/repository/scheduler";
import { istanbulLocalDate } from "@/modules/agents/application/scheduler";
import { getRuntimeOperationalMetrics } from "@/modules/agents/repository/capacity";
import {
  circuitBreakerConfigSchema,
  evaluateCircuitBreakers,
} from "@/modules/agents/domain/circuit-breaker";
import { seedPersonaSchema } from "@/modules/agents/personas/schema";
import { selectPerceptionEntries, truncateUntrustedText } from "@/modules/agents/domain/perception";
import type {
  RuntimeActionsInput,
  RuntimeCompleteInput,
  RuntimeEventsInput,
  RuntimeFailInput,
  RuntimeHeartbeatInput,
  RuntimeLeaseInput,
  RuntimeMemoriesInput,
  RuntimeSourceResultInput,
} from "@/modules/agents/validation/runtime-schemas";
import {
  parseSafeSourceUrl,
  sourceFailureBackoffMs,
} from "@/modules/agents/domain/source-security";

type OwnedRun = NonNullable<Awaited<ReturnType<typeof findRuntimeOwnedRun>>>;

type PerceptionRecords = Awaited<ReturnType<typeof getRuntimePerceptionRecords>>;

function boundedPerceptionSnapshot(run: OwnedRun, records: PerceptionRecords, now: Date) {
  const persona = seedPersonaSchema.parse(run.personaVersion.persona);
  const followedTopics = new Set(records.followedTopicIds);
  const followedUsers = new Set(records.followedUserIds);
  const recentTopicCounts = new Map(
    records.recentTopicCounts.map(({ topicId, _count }) => [topicId, _count._all]),
  );
  const selectedEntries = selectPerceptionEntries(
    records.entries.map((entry) => ({
      ...entry,
      followedTopic: followedTopics.has(entry.topic.id),
      followedAuthor: followedUsers.has(entry.author.id),
    })),
    { seed: run.id, interests: persona.interests, limit: 24, now },
  ).map((entry) => ({
    ...entry,
    body: truncateUntrustedText(entry.body, 800),
    createdAt: entry.createdAt.toISOString(),
    topicEntryCountLast30Minutes: recentTopicCounts.get(entry.topic.id) ?? 0,
    saturated: (recentTopicCounts.get(entry.topic.id) ?? 0) >= 15,
  }));
  const sourceItems = records.sources
    .flatMap((source) =>
      source.items.map((item) => ({
        sourceId: source.id,
        sourceDomain: source.normalizedDomain,
        sourceStatus: source.status,
        sourceTrustScore: source.trustScore,
        itemId: item.id,
        canonicalUrl: item.canonicalUrl,
        title: truncateUntrustedText(item.title, 300),
        safeText: truncateUntrustedText(item.safeText, 800),
        summary: item.summary ? truncateUntrustedText(item.summary, 500) : null,
        publishedAt: item.publishedAt?.toISOString() ?? null,
        fetchedAt: item.fetchedAt.toISOString(),
      })),
    )
    .slice(0, 10);
  const snapshot = {
    observedAt: now.toISOString(),
    limits: { maximumBytes: 65_536, recentEntries: 24, ownEntries: 8, sourceItems: 10 },
    targetProgress: {
      ...records.state,
      nextScheduledAt: records.state.nextScheduledAt?.toISOString() ?? null,
    },
    recentEntries: selectedEntries,
    ownRecentEntries: records.ownEntries.slice(0, 8).map((entry) => ({
      ...entry,
      body: truncateUntrustedText(entry.body, 600),
      createdAt: entry.createdAt.toISOString(),
    })),
    memories: records.memories.slice(0, 10).map((memory) => ({
      ...memory,
      summary: truncateUntrustedText(memory.summary, 700),
      occurredAt: memory.occurredAt.toISOString(),
    })),
    beliefs: records.beliefs.slice(0, 10).map((belief) => ({
      ...belief,
      statement: truncateUntrustedText(belief.statement, 700),
      evidenceSummary: truncateUntrustedText(belief.evidenceSummary, 500),
      lastUpdatedAt: belief.lastUpdatedAt.toISOString(),
    })),
    relationships: records.relationships.slice(0, 8).map((relationship) => ({
      ...relationship,
      summary: truncateUntrustedText(relationship.summary, 500),
      lastInteractionAt: relationship.lastInteractionAt?.toISOString() ?? null,
    })),
    sourceFetchTargets: records.sources
      .filter(
        (source) =>
          !source.lastFetchedAt ||
          source.lastFetchedAt.getTime() +
            (source.consecutiveFailures === 0
              ? 6 * 60 * 60 * 1000
              : sourceFailureBackoffMs(source.consecutiveFailures)) <=
            now.getTime(),
      )
      .map((source) => ({
        sourceId: source.id,
        url: source.url,
        sourceType: source.sourceType,
        status: source.status,
        topics: source.topics,
      })),
    sourceItems,
  };
  while (Buffer.byteLength(JSON.stringify(snapshot), "utf8") > 65_536) {
    if (snapshot.sourceItems.length > 0) snapshot.sourceItems.pop();
    else if (snapshot.recentEntries.length > 8) snapshot.recentEntries.pop();
    else if (snapshot.memories.length > 4) snapshot.memories.pop();
    else
      throw new AppError("INTERNAL_ERROR", 500, "Perception snapshot güvenli boyuta indirilemedi.");
  }
  return snapshot;
}

function runNotFound(): AppError {
  return new AppError("AGENT_RUN_NOT_FOUND", 404, "Runtime run bulunamadı.");
}

function collectSnapshotIds(value: unknown, target = new Set<string>()): Set<string> {
  if (typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/iu.test(value)) target.add(value);
  else if (Array.isArray(value)) for (const item of value) collectSnapshotIds(item, target);
  else if (value && typeof value === "object")
    for (const item of Object.values(value)) collectSnapshotIds(item, target);
  return target;
}

function assertLeaseOwner(
  run: OwnedRun | null,
  workerId: string,
  now: Date,
  allowCancelRequested = true,
): asserts run is OwnedRun {
  if (!run) throw runNotFound();
  const allowedStatuses = allowCancelRequested ? ["RUNNING", "CANCEL_REQUESTED"] : ["RUNNING"];
  if (
    !allowedStatuses.includes(run.runStatus) ||
    run.leaseOwner !== workerId ||
    !run.leaseExpiresAt ||
    run.leaseExpiresAt < now
  ) {
    throw new AppError(
      "AGENT_RUN_LEASE_INVALID",
      409,
      "Run lease sahibi veya süresi geçerli değil.",
    );
  }
}

async function auditRuntimeRun(
  transaction: TransactionClient,
  principal: RuntimePrincipal,
  runId: string,
  action: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await appendAuditLog(transaction, {
    actorId: principal.actor.actorId,
    action,
    entityType: "AgentRun",
    entityId: runId,
    requestId: principal.actor.requestId,
    metadata,
  });
}

export function leaseRuntimeRun(
  client: DatabaseExecutor,
  principal: RuntimePrincipal,
  input: RuntimeLeaseInput,
) {
  return inTransaction(client, async (transaction) => {
    await lockRuntimeAgent(transaction, principal.agentProfileId);
    const [agent, settings] = await Promise.all([
      getRuntimeAgentLifecycle(transaction, principal.agentProfileId),
      getRuntimeGlobalSettings(transaction),
    ]);
    if (!agent || agent.lifecycleStatus !== "ACTIVE" || !settings.runtimeEnabled) {
      return {
        run: null,
        reason: !agent || agent.lifecycleStatus !== "ACTIVE" ? "NOT_ACTIVE" : "PAUSED",
      };
    }
    const now = new Date();
    await finalizeExpiredCancellation(transaction, principal.agentProfileId, now);
    const breakerConfig = circuitBreakerConfigSchema.parse(settings.circuitBreakerConfig);
    const operational = await getRuntimeOperationalMetrics(transaction, {
      now,
      concurrency: settings.codexConcurrency === 2 ? 2 : 1,
      config: breakerConfig,
    });
    const breakers = evaluateCircuitBreakers(breakerConfig, operational);
    if (breakers.runtimePaused) return { run: null, reason: "ERROR_PAUSED" };
    if (settings.schedulerEnabled) {
      await dispatchDueScheduleSlots(transaction, {
        now,
        localDate: istanbulLocalDate(now),
        timeoutSeconds: settings.scheduledTimeoutSeconds,
      });
      await planRuntimeMaintenanceAndCatchUp(transaction, {
        agentProfileId: principal.agentProfileId,
        localDate: istanbulLocalDate(now),
        now,
        catchUpFrozen: breakers.catchUpFrozen,
        concurrency: settings.codexConcurrency === 2 ? 2 : 1,
        scheduledTimeoutSeconds: settings.scheduledTimeoutSeconds,
        reflectionTimeoutSeconds: settings.reflectionTimeoutSeconds,
        sourceRefreshTimeoutSeconds: settings.sourceRefreshTimeoutSeconds,
      });
    }
    const run = await claimNextRuntimeRun(transaction, {
      agentProfileId: principal.agentProfileId,
      workerId: input.workerId,
      leaseSeconds: input.leaseSeconds,
      maxRetryCount: settings.maxRetryCount,
      writeRunsPaused: breakers.writeRunsPaused,
      catchUpFrozen: breakers.catchUpFrozen,
      contentSlowdownMinutes: breakers.contentSlowdown ? breakerConfig.duplicateCooldownMinutes : 0,
      now,
    });
    if (!run) return { run: null, reason: "QUEUE_EMPTY" };
    await setRuntimeCurrentRun(transaction, principal.agentProfileId, run.id, now);
    await appendRuntimeRunEvents(transaction, {
      runId: run.id,
      agentProfileId: principal.agentProfileId,
      events: [
        {
          eventType: "run.leased",
          safeMessage: "Run worker tarafından lease edildi.",
          metadata: { phase: "STARTING" },
        },
      ],
    });
    await appendRuntimeEvent(transaction, {
      agentProfileId: principal.agentProfileId,
      runId: run.id,
      eventType: "run.started",
      safeMessage: "Run worker tarafından lease edildi ve başlatıldı.",
      metadata: { phase: "STARTING", attempt: run.attempts },
    });
    await auditRuntimeRun(transaction, principal, run.id, "agent.run.leased", {
      workerId: input.workerId,
      leaseExpiresAt: run.leaseExpiresAt?.toISOString(),
      attempt: run.attempts,
    });
    return { run, reason: null };
  });
}

export function heartbeatRuntimeRun(
  client: DatabaseExecutor,
  principal: RuntimePrincipal,
  runId: string,
  input: RuntimeHeartbeatInput,
) {
  return inTransaction(client, async (transaction) => {
    const now = new Date();
    await lockRuntimeRun(transaction, runId);
    const run = await findRuntimeOwnedRun(transaction, principal.agentProfileId, runId);
    assertLeaseOwner(run, input.workerId, now);
    const cancelRequested = run.runStatus === "CANCEL_REQUESTED";
    const runtimeStatus = cancelRequested ? "CANCELLING" : input.runtimeStatus;
    const leaseExpiresAt = new Date(now.getTime() + input.leaseSeconds * 1000);
    await heartbeatRuntimeRunRecord(transaction, {
      runId,
      agentProfileId: principal.agentProfileId,
      workerId: input.workerId,
      leaseExpiresAt,
      now,
      runtimeStatus,
    });
    await appendRuntimeEvent(transaction, {
      agentProfileId: principal.agentProfileId,
      runId,
      eventType: "agent.heartbeat",
      safeMessage: "Agent runtime heartbeat kaydetti.",
      metadata: { runtimeStatus, cancelRequested },
    });
    return { runId, leaseExpiresAt, cancelRequested };
  });
}

export function getRuntimeRunContext(
  client: DatabaseExecutor,
  principal: RuntimePrincipal,
  runId: string,
  workerId: string,
) {
  return inTransaction(client, async (transaction) => {
    await lockRuntimeRun(transaction, runId);
    const run = await findRuntimeOwnedRun(transaction, principal.agentProfileId, runId);
    assertLeaseOwner(run, workerId, new Date());
    const settings = await getRuntimeGlobalSettings(transaction);
    const now = new Date();
    let perception: Record<string, unknown>;
    if (
      run.perceptionSummary &&
      typeof run.perceptionSummary === "object" &&
      !Array.isArray(run.perceptionSummary)
    ) {
      perception = run.perceptionSummary as Record<string, unknown>;
    } else {
      const perceptionRecords = await getRuntimePerceptionRecords(transaction, {
        agentProfileId: principal.agentProfileId,
        agentUserId: run.agentProfile.user.id,
        now,
        includeSources: run.allowSourceReading && settings.sourceReadingEnabled,
      });
      const builtPerception = boundedPerceptionSnapshot(run, perceptionRecords, now);
      await storeRuntimePerceptionSummary(transaction, runId, builtPerception);
      perception = builtPerception;
    }
    return {
      run: {
        id: run.id,
        runType: run.runType,
        trigger: run.trigger,
        timeoutSeconds: run.timeoutSeconds,
        desiredEntryMin: run.desiredEntryMin,
        desiredEntryMax: run.desiredEntryMax,
        allowTopicCreation: run.allowTopicCreation && settings.topicCreationEnabled,
        allowVoting: run.allowVoting && settings.votingEnabled,
        allowFollowing: run.allowFollowing && settings.userFollowingEnabled,
        allowSourceReading: run.allowSourceReading && settings.sourceReadingEnabled,
        publishEnabled: settings.publishEnabled,
        saturationOverride: run.saturationOverride,
        dailyMaximumOverride: run.dailyMaximumOverride,
        adminInstruction: run.adminInstruction,
        cancelRequested: run.runStatus === "CANCEL_REQUESTED",
      },
      agent: {
        profileId: run.agentProfileId,
        username: run.agentProfile.user.username,
        displayName: run.agentProfile.user.displayName,
        publicBio: run.agentProfile.user.bio,
        lifecycleStatus: run.agentProfile.lifecycleStatus,
      },
      persona: {
        version: run.personaVersion.version,
        document: run.personaVersion.persona,
        renderedPrompt: run.personaVersion.renderedPrompt,
      },
      perception,
    };
  });
}

export function recordRuntimeEvents(
  client: DatabaseExecutor,
  principal: RuntimePrincipal,
  runId: string,
  input: RuntimeEventsInput,
) {
  return inTransaction(client, async (transaction) => {
    await lockRuntimeRun(transaction, runId);
    const run = await findRuntimeOwnedRun(transaction, principal.agentProfileId, runId);
    assertLeaseOwner(run, input.workerId, new Date());
    const result = await appendRuntimeRunEvents(transaction, {
      runId,
      agentProfileId: principal.agentProfileId,
      events: input.events,
    });
    for (const event of input.events) {
      await appendRuntimeEvent(transaction, {
        agentProfileId: principal.agentProfileId,
        runId,
        eventType: event.eventType,
        safeMessage: event.safeMessage,
        metadata: event.metadata,
      });
    }
    return result;
  });
}

export function recordRuntimeActions(
  client: DatabaseExecutor,
  principal: RuntimePrincipal,
  runId: string,
  input: RuntimeActionsInput,
) {
  return inTransaction(client, async (transaction) => {
    await lockRuntimeRun(transaction, runId);
    const run = await findRuntimeOwnedRun(transaction, principal.agentProfileId, runId);
    assertLeaseOwner(run, input.workerId, new Date(), false);
    const result = await appendRuntimeActions(transaction, {
      runId,
      agentProfileId: principal.agentProfileId,
      actions: input.actions.map((action) => ({
        sequence: action.sequence,
        actionType: action.actionType,
        input: action.input,
        ...(action.targetType !== undefined ? { targetType: action.targetType } : {}),
        ...(action.targetId !== undefined ? { targetId: action.targetId } : {}),
        ...(action.provenance !== undefined ? { provenance: action.provenance } : {}),
      })),
    });
    await auditRuntimeRun(transaction, principal, runId, "agent.run.actions_proposed", {
      count: result.count,
      actionTypes: input.actions.map(({ actionType }) => actionType),
    });
    return result;
  });
}

export function recordRuntimeMemories(
  client: DatabaseExecutor,
  principal: RuntimePrincipal,
  runId: string,
  input: RuntimeMemoriesInput,
) {
  return inTransaction(client, async (transaction) => {
    await lockRuntimeRun(transaction, runId);
    const run = await findRuntimeOwnedRun(transaction, principal.agentProfileId, runId);
    assertLeaseOwner(run, input.workerId, new Date(), false);
    const observedIds = collectSnapshotIds(run.perceptionSummary);
    let count = 0;
    for (const memory of input.memories) {
      if (
        !observedIds.has(memory.subjectId) ||
        memory.provenance.evidenceIds.some((id) => !observedIds.has(id))
      )
        throw new AppError(
          "VALIDATION_ERROR",
          422,
          "Memory yalnız bu run perception snapshot'ında gerçekten gözlenen kanıttan oluşabilir.",
        );
      const evidence = await validateRuntimeProvenanceEvidence(transaction, {
        agentProfileId: principal.agentProfileId,
        runId,
        evidenceType: memory.provenance.evidenceType,
        evidenceIds: memory.provenance.evidenceIds,
      });
      if (!evidence.valid)
        throw new AppError("VALIDATION_ERROR", 422, "Memory provenance doğrulanamadı.");
      await createRuntimeMemoryEpisode(transaction, {
        agentProfileId: principal.agentProfileId,
        runId,
        eventType: "OBSERVATION_READ",
        subjectType: memory.subjectType,
        subjectId: memory.subjectId,
        summary: memory.summary,
        salience: memory.salience,
        provenance: memory.provenance.evidenceType,
        evidence: memory.provenance,
        occurredAt: new Date(),
      });
      count += 1;
    }
    await auditRuntimeRun(transaction, principal, runId, "agent.run.memories_recorded", { count });
    return { count };
  });
}

export function recordRuntimeSourceResult(
  client: DatabaseExecutor,
  principal: RuntimePrincipal,
  runId: string,
  input: RuntimeSourceResultInput,
) {
  return inTransaction(client, async (transaction) => {
    await lockRuntimeRun(transaction, runId);
    const run = await findRuntimeOwnedRun(transaction, principal.agentProfileId, runId);
    assertLeaseOwner(run, input.workerId, new Date(), false);
    const settings = await getRuntimeGlobalSettings(transaction);
    if (!run.allowSourceReading || !settings.sourceReadingEnabled)
      throw new AppError("FORBIDDEN", 403, "Bu run için source reading kapalıdır.");
    const source = await findRuntimeSourceForWrite(transaction, {
      agentProfileId: principal.agentProfileId,
      sourceId: input.sourceId,
    });
    if (!source) throw new AppError("VALIDATION_ERROR", 422, "Source fetch hedefi geçersizdir.");
    for (const item of input.items) parseSafeSourceUrl(item.canonicalUrl);
    const now = new Date();
    await storeRuntimeSourceResult(transaction, {
      sourceId: source.id,
      runId,
      agentProfileId: principal.agentProfileId,
      items: input.items.map((item) => ({
        canonicalUrl: item.canonicalUrl,
        title: item.title,
        contentHash: item.contentHash,
        safeText: item.safeText,
        ...(item.publishedAt ? { publishedAt: new Date(item.publishedAt) } : {}),
      })),
      topics: source.topics ?? [],
      now,
      ...(input.errorCode ? { errorCode: input.errorCode } : {}),
    });
    await auditRuntimeRun(transaction, principal, runId, "agent.run.source_result_recorded", {
      sourceId: source.id,
      itemCount: input.items.length,
      success: !input.errorCode,
    });
    return { sourceId: source.id, itemCount: input.items.length, recordedAt: now };
  });
}

export function completeRuntimeRun(
  client: DatabaseExecutor,
  principal: RuntimePrincipal,
  runId: string,
  input: RuntimeCompleteInput,
) {
  return inTransaction(client, async (transaction) => {
    const now = new Date();
    await lockRuntimeRun(transaction, runId);
    const run = await findRuntimeOwnedRun(transaction, principal.agentProfileId, runId);
    assertLeaseOwner(run, input.workerId, now);
    const measuredMetrics = await getMeasuredRuntimeRunMetrics(transaction, runId);
    await finishRuntimeRunRecord(transaction, {
      runId,
      agentProfileId: principal.agentProfileId,
      outcome: input.outcome,
      now,
      safeRunSummary: input.safeRunSummary,
      usageMetadata: input.usageMetadata,
      performanceMetrics: { reported: input.performanceMetrics, measured: measuredMetrics },
      publishedEntries: measuredMetrics.publishedEntries,
      createdTopics: measuredMetrics.createdTopics,
      votes: measuredMetrics.votes,
      sourceReads: measuredMetrics.sourceReads,
    });
    await appendRuntimeRunEvents(transaction, {
      runId,
      agentProfileId: principal.agentProfileId,
      events: [
        {
          eventType: "run.completed",
          safeMessage: `Run ${input.outcome} durumuyla tamamlandı.`,
          metadata: { phase: input.outcome },
        },
      ],
    });
    await appendRuntimeEvent(transaction, {
      agentProfileId: principal.agentProfileId,
      runId,
      eventType: "run.completed",
      safeMessage: `Run ${input.outcome} durumuyla tamamlandı.`,
      metadata: { phase: input.outcome },
    });
    await auditRuntimeRun(transaction, principal, runId, "agent.run.completed", {
      outcome: input.outcome,
    });
    return { runId, runStatus: input.outcome, finishedAt: now };
  });
}

export function failRuntimeRun(
  client: DatabaseExecutor,
  principal: RuntimePrincipal,
  runId: string,
  input: RuntimeFailInput,
) {
  return inTransaction(client, async (transaction) => {
    const now = new Date();
    await lockRuntimeRun(transaction, runId);
    const run = await findRuntimeOwnedRun(transaction, principal.agentProfileId, runId);
    assertLeaseOwner(run, input.workerId, now);
    await finishRuntimeRunRecord(transaction, {
      runId,
      agentProfileId: principal.agentProfileId,
      outcome: input.outcome,
      now,
      ...(input.usageMetadata ? { usageMetadata: input.usageMetadata } : {}),
      errorCode: input.errorCode,
      errorSummary: input.errorSummary,
    });
    await appendRuntimeRunEvents(transaction, {
      runId,
      agentProfileId: principal.agentProfileId,
      events: [
        {
          eventType: "run.failed",
          safeMessage: `Run ${input.outcome} durumuyla kapatıldı.`,
          metadata: { phase: input.outcome, code: input.errorCode },
        },
      ],
    });
    await appendRuntimeEvent(transaction, {
      agentProfileId: principal.agentProfileId,
      runId,
      eventType: "run.failed",
      safeMessage: `Run ${input.outcome} durumuyla kapatıldı.`,
      metadata: { phase: input.outcome, code: input.errorCode },
    });
    await auditRuntimeRun(transaction, principal, runId, "agent.run.failed", {
      outcome: input.outcome,
      errorCode: input.errorCode,
    });
    return { runId, runStatus: input.outcome, finishedAt: now };
  });
}
