import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor, TransactionClient } from "@/lib/db/types";
import { checkDatabaseReadiness } from "@/lib/db/readiness";
import { AppError } from "@/lib/http/errors";
import { constantTimeEqual, sha256 } from "@/lib/security/crypto";
import { appendAuditLog } from "@/modules/audit";
import {
  appendRuntimeEvent,
  getProductionSafetyWindowAnchor,
  listAgentSourceScoreAudits,
  lockAgentSettings,
  pauseGlobalRuntimeForCriticalBreakerRecord,
} from "@/modules/agents/repository/control-plane";
import {
  canonicalLifeEventJson,
  findRuntimeSourceAttemptLifeEvent,
} from "@/modules/agents/repository/life-ledger";
import { lockPersonaUniverse } from "@/modules/agents/repository/persona-lock";
import type { RuntimePrincipal } from "@/modules/agents/application/runtime-auth";
import { duplicateRepairCandidateIsSafe } from "@/modules/agents/domain/action-policy";
import {
  appendRuntimeActions,
  applyRuntimeReflectionStateDeltas,
  appendRuntimeRunEvents,
  claimNextRuntimeRun,
  countActiveRuntimeLeases,
  createRuntimeReflectionPersonaVersion,
  findRuntimeLeaseForIdempotencyReplay,
  findRuntimeOwnedRun,
  finishRuntimeRunRecord,
  getMeasuredRuntimeRunMetrics,
  getLatestRuntimeCircuitBreakerSnapshot,
  getRuntimePerceptionRecords,
  getRuntimeAgentLifecycle,
  getRuntimeGlobalSettings,
  heartbeatRuntimeRunRecord,
  listExpiredCancellationRunsForFinalization,
  listExpiredNonMaintenanceRunsForMaintenanceFinalization,
  listRuntimeActionsForRepairValidation,
  listRuntimeCurrentPersonas,
  listRuntimeWeeklyReflectionReports,
  lockRuntimeAgent,
  lockRuntimeReflectionStateTargets,
  lockRuntimeRunForLeaseMutation,
  setRuntimeCurrentRun,
  storeRuntimePerceptionSummary,
  validateRuntimeProvenanceEvidence,
  createRuntimeMemoryEpisode,
  findRuntimeSourceForWrite,
  storeRuntimeSourceResult,
  type ExpiredRuntimeRunCandidate,
} from "@/modules/agents/repository/runtime";
import {
  cancelExpiredQueuedCatchUpRunRecord,
  dispatchDueScheduleSlots,
  listExpiredQueuedCatchUpRuns,
  planRuntimeMaintenanceAndCatchUp,
  type QueuedRunEventRecord,
} from "@/modules/agents/repository/scheduler";
import { istanbulLocalDate } from "@/modules/agents/application/scheduler";
import { getRuntimeOperationalMetrics } from "@/modules/agents/repository/capacity";
import {
  circuitBreakerConfigSchema,
  evaluateCircuitBreakerTransition,
  evaluateCircuitBreakers,
  evaluateProductionCriticalBreakerAutoPause,
} from "@/modules/agents/domain/circuit-breaker";
import {
  applyWeeklyPersonaEvolution,
  weeklyPersonaEvolutionDeltaSchema,
  type WeeklyPersonaEvolutionDelta,
} from "@/modules/agents/domain/persona-evolution";
import {
  productionActivationCatchUpFrozen,
  runtimePublicWritesAllowed,
  sourceFetchTargetLimit,
  terminalizeInterruptedRuntimeRun,
} from "@/modules/agents/domain/runtime-controls";
import {
  assertSourceScoreWeeklyBudget,
  istanbulWeekWindow,
} from "@/modules/agents/domain/source-evolution";
import { seedPersonaSchema } from "@/modules/agents/personas/schema";
import { selectPerceptionEntries, truncateUntrustedText } from "@/modules/agents/domain/perception";
import {
  runtimeFastStateSchema,
  type RuntimeActionsInput,
  type RuntimeCompleteInput,
  type RuntimeEventsInput,
  type RuntimeFailInput,
  type RuntimeHeartbeatInput,
  type RuntimeLeaseInput,
  type RuntimeMemoriesInput,
  type RuntimeSourceResultInput,
  type RuntimeSourceAttemptInput,
} from "@/modules/agents/validation/runtime-schemas";
import {
  parseSafeSourceUrl,
  sourceFailureBackoffMs,
} from "@/modules/agents/domain/source-security";
import { appendOutboxEvent } from "@/modules/outbox";
import {
  guardProductionRolloutRuntimeMutation,
  pauseExpiredProductionRollout,
} from "@/modules/agents/application/rollout-guard";

type OwnedRun = NonNullable<Awaited<ReturnType<typeof findRuntimeOwnedRun>>>;
type RuntimeSourceState = Awaited<
  ReturnType<typeof storeRuntimeSourceResult>
>["changes"][number]["before"];

interface RuntimeLeaseDependencies {
  checkReadiness?: (executor: DatabaseExecutor) => Promise<void>;
}

const GLOBAL_SETTINGS_AGGREGATE_ID = "00000000-0000-4000-8000-000000000001";

function runtimeSourceStatePayload(state: RuntimeSourceState) {
  return {
    status: state.status,
    consecutiveFailures: state.consecutiveFailures,
    lastFetchedAt: state.lastFetchedAt?.toISOString() ?? null,
    lastUsefulAt: state.lastUsefulAt?.toISOString() ?? null,
  };
}

async function appendAutomaticRunQueuedOutbox(
  transaction: TransactionClient,
  requestId: string,
  run: QueuedRunEventRecord,
): Promise<void> {
  await appendOutboxEvent(transaction, {
    eventType: "agent.run.queued",
    aggregateType: "AgentRun",
    aggregateId: run.id,
    actorId: null,
    actorKind: null,
    requestId,
    payload: {
      agentProfileId: run.agentProfileId,
      runId: run.id,
      runType: run.runType,
      queuePriority: run.queuePriority,
      runStatus: run.runStatus,
      trigger: run.trigger,
      availableAt: run.availableAt.toISOString(),
      desiredEntryMin: run.desiredEntryMin,
      desiredEntryMax: run.desiredEntryMax,
      ...(run.parentRunId ? { parentRunId: run.parentRunId } : {}),
    },
  });
}

async function terminalizeExpiredQueuedCatchUpRuns(
  transaction: TransactionClient,
  principal: RuntimePrincipal,
  input: { localDate: Date; now: Date },
): Promise<number> {
  const candidates = await listExpiredQueuedCatchUpRuns(transaction, {
    agentProfileId: principal.agentProfileId,
    localDate: input.localDate,
  });
  let terminalized = 0;
  for (const candidate of candidates) {
    await lockRuntimeRunForLeaseMutation(transaction, candidate.id);
    const run = await cancelExpiredQueuedCatchUpRunRecord(transaction, {
      runId: candidate.id,
      agentProfileId: principal.agentProfileId,
      localDate: input.localDate,
      now: input.now,
    });
    if (!run) continue;
    const measured = await getMeasuredRuntimeRunMetrics(transaction, run.id);
    const evidence = {
      agentProfileId: principal.agentProfileId,
      runId: run.id,
      outcome: "CANCELLED" as const,
      requestedOutcome: "CANCELLED" as const,
      errorCode: "CATCH_UP_DAY_EXPIRED",
      reasonCode: "CATCH_UP_DAY_EXPIRED",
      trigger: run.trigger,
      expiredLocalDate: input.localDate.toISOString().slice(0, 10),
      before: { runStatus: "QUEUED" as const },
      after: { runStatus: "CANCELLED" as const },
      measured: {
        publishedEntries: measured.publishedEntries,
        createdTopics: measured.createdTopics,
        votes: measured.votes,
        sourceReads: measured.sourceReads,
        proposedActions: measured.proposedActions,
        succeededActions: measured.succeededActions,
        rejectedActions: measured.rejectedActions,
        committedMemoryEpisodes: measured.committedMemoryEpisodes,
      },
    };
    await appendRuntimeRunEvents(transaction, {
      runId: run.id,
      agentProfileId: principal.agentProfileId,
      events: [
        {
          eventType: "run.failed",
          safeMessage: "Önceki İstanbul gününe ait catch-up run CANCELLED durumuyla kapatıldı.",
          metadata: {
            phase: "CANCELLED",
            code: "CATCH_UP_DAY_EXPIRED",
            reasonCode: "CATCH_UP_DAY_EXPIRED",
          },
        },
      ],
    });
    await appendAuditLog(transaction, {
      actorId: null,
      action: "agent.run.failed",
      entityType: "AgentRun",
      entityId: run.id,
      requestId: principal.actor.requestId,
      metadata: evidence,
    });
    await appendOutboxEvent(transaction, {
      eventType: "agent.run.failed",
      aggregateType: "AgentRun",
      aggregateId: run.id,
      actorId: null,
      actorKind: null,
      requestId: principal.actor.requestId,
      payload: evidence,
    });
    await appendRuntimeEvent(transaction, {
      agentProfileId: principal.agentProfileId,
      runId: run.id,
      eventType: "run.failed",
      safeMessage: "Önceki İstanbul gününe ait catch-up run CANCELLED durumuyla kapatıldı.",
      metadata: evidence,
    });
    terminalized += 1;
  }
  return terminalized;
}

type PerceptionRecords = Awaited<ReturnType<typeof getRuntimePerceptionRecords>>;

function previousRuntimeFastState(runtimeMetadata: unknown) {
  if (!runtimeMetadata || typeof runtimeMetadata !== "object" || Array.isArray(runtimeMetadata))
    return null;
  const parsed = runtimeFastStateSchema.safeParse(
    (runtimeMetadata as Record<string, unknown>).fastState,
  );
  return parsed.success ? parsed.data : null;
}

function perceptionPreviousFastState(perceptionSummary: unknown) {
  if (
    !perceptionSummary ||
    typeof perceptionSummary !== "object" ||
    Array.isArray(perceptionSummary)
  )
    return null;
  const parsed = runtimeFastStateSchema.safeParse(
    (perceptionSummary as Record<string, unknown>).previousFastState,
  );
  return parsed.success ? parsed.data : null;
}

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
  const { runtimeMetadata, ...targetProgress } = records.state;
  const snapshot = {
    observedAt: now.toISOString(),
    limits: { maximumBytes: 65_536, recentEntries: 24, ownEntries: 8, sourceItems: 10 },
    previousFastState: previousRuntimeFastState(runtimeMetadata),
    targetProgress: {
      ...targetProgress,
      nextScheduledAt: targetProgress.nextScheduledAt?.toISOString() ?? null,
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
          !source.domainLastAttemptAt ||
          source.domainLastAttemptAt.getTime() +
            (source.domainConsecutiveFailures === 0
              ? 6 * 60 * 60 * 1000
              : sourceFailureBackoffMs(source.domainConsecutiveFailures)) <=
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
    sources: records.sources.slice(0, 8).map((source) => ({
      id: source.id,
      sourceType: source.sourceType,
      status: source.status,
      trustScore: source.trustScore,
      interestScore: source.interestScore,
      topics: source.topics,
      lastFetchedAt: source.lastFetchedAt?.toISOString() ?? null,
      domainConsecutiveFailures: source.domainConsecutiveFailures,
      domainLastAttemptAt: source.domainLastAttemptAt?.toISOString() ?? null,
    })),
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

function weeklyDeltaFromValidationReport(report: unknown): unknown | null {
  if (!report || typeof report !== "object" || Array.isArray(report)) return null;
  const record = report as Record<string, unknown>;
  return record.weeklyPersonaEvolutionDelta ?? record.reflectionDelta ?? null;
}

function observedBeliefTopicKeys(perception: unknown): Set<string> {
  if (!perception || typeof perception !== "object" || Array.isArray(perception)) return new Set();
  const beliefs = (perception as Record<string, unknown>).beliefs;
  if (!Array.isArray(beliefs)) return new Set();
  return new Set(
    beliefs.flatMap((belief) => {
      if (!belief || typeof belief !== "object" || Array.isArray(belief)) return [];
      const topicKey = (belief as Record<string, unknown>).topicKey;
      return typeof topicKey === "string" ? [topicKey] : [];
    }),
  );
}

function boundedReflectedValue(current: number, delta: number, field: string): number {
  const candidate = Number((current + delta).toFixed(12));
  if (candidate < 0 || candidate > 1)
    throw new AppError(
      "VALIDATION_ERROR",
      422,
      "Reflection delta sonucunda state değeri 0 ile 1 aralığında kalmalıdır.",
      { [field]: ["Sonuç 0 ile 1 aralığında olmalıdır."] },
      undefined,
      { reasonCode: "REFLECTION_STATE_OUT_OF_RANGE" },
    );
  return candidate;
}

async function applyRuntimeReflectionDelta(
  transaction: TransactionClient,
  input: {
    principal: RuntimePrincipal;
    run: OwnedRun;
    outcome: "SUCCEEDED" | "PARTIAL";
    delta: WeeklyPersonaEvolutionDelta | null;
    globalEvolutionEnabled: boolean;
    globalSourceEvolutionEnabled: boolean;
    now: Date;
  },
) {
  if (!input.delta) return { status: "NO_DELTA" as const };
  if (input.run.runType !== "REFLECTION")
    throw new AppError(
      "VALIDATION_ERROR",
      422,
      "Reflection delta yalnız REFLECTION run tamamlanırken gönderilebilir.",
    );
  if (["NIGHTLY_MEMORY_CONSOLIDATION", "ADMIN_MEMORY_RECONSOLIDATE"].includes(input.run.trigger))
    throw new AppError(
      "VALIDATION_ERROR",
      422,
      "Memory consolidation run'ı persona reflection delta uygulayamaz.",
    );
  if (input.outcome !== "SUCCEEDED") return { status: "PARTIAL_RUN" as const };
  if (!input.globalEvolutionEnabled || !input.run.agentProfile.personaEvolutionEnabled)
    return { status: "FROZEN" as const };
  if (
    input.delta.sourceTrustDeltas.length > 0 &&
    (!input.globalSourceEvolutionEnabled || !input.run.agentProfile.sourceEvolutionEnabled)
  )
    throw new AppError(
      "VALIDATION_ERROR",
      422,
      "Source evolution kapalıyken source trust reflection delta uygulanamaz.",
      undefined,
      undefined,
      { reasonCode: "SOURCE_EVOLUTION_FROZEN" },
    );
  if (input.run.agentProfile.currentPersonaVersionId !== input.run.personaVersion.id)
    return { status: "STALE_PERSONA" as const };
  if (
    !input.run.perceptionSummary ||
    typeof input.run.perceptionSummary !== "object" ||
    Array.isArray(input.run.perceptionSummary)
  )
    throw new AppError(
      "VALIDATION_ERROR",
      422,
      "Persona reflection delta için donmuş perception snapshot zorunludur.",
      undefined,
      undefined,
      { reasonCode: "REFLECTION_PERCEPTION_REQUIRED" },
    );

  await lockPersonaUniverse(transaction);
  const week = istanbulWeekWindow(input.now);
  const [reports, currentPersonas] = await Promise.all([
    listRuntimeWeeklyReflectionReports(transaction, {
      agentProfileId: input.run.agentProfileId,
      weekStart: week.start,
      weekEnd: week.end,
    }),
    listRuntimeCurrentPersonas(transaction, input.run.agentProfileId),
  ]);
  const previousWeeklyDeltas = reports.flatMap(({ validationReport }) => {
    const candidate = weeklyDeltaFromValidationReport(validationReport);
    return candidate === null ? [] : [weeklyPersonaEvolutionDeltaSchema.parse(candidate)];
  });
  const applied = applyWeeklyPersonaEvolution({
    currentPersona: input.run.personaVersion.persona,
    delta: input.delta,
    previousWeeklyDeltas,
    existingPersonas: currentPersonas.flatMap(({ currentPersonaVersion }) =>
      currentPersonaVersion ? [currentPersonaVersion.persona] : [],
    ),
  });

  const observedIds = collectSnapshotIds(input.run.perceptionSummary);
  const observedBeliefs = observedBeliefTopicKeys(input.run.perceptionSummary);
  const unseenSource = applied.delta.sourceTrustDeltas.find(
    ({ sourceId }) => !observedIds.has(sourceId),
  );
  const unseenRelationship = applied.delta.relationshipTrustDeltas.find(
    ({ targetUserId }) => !observedIds.has(targetUserId),
  );
  const unseenBelief = applied.delta.beliefConfidenceDeltas.find(
    ({ topicKey }) => !observedBeliefs.has(topicKey),
  );
  if (unseenSource || unseenRelationship || unseenBelief)
    throw new AppError(
      "VALIDATION_ERROR",
      422,
      "Reflection state hedefleri run'ın donmuş perception snapshot'ında görünür olmalıdır.",
      undefined,
      undefined,
      {
        reasonCode: "REFLECTION_TARGET_NOT_OBSERVED",
        ...(unseenSource ? { sourceId: unseenSource.sourceId } : {}),
        ...(unseenRelationship ? { targetUserId: unseenRelationship.targetUserId } : {}),
        ...(unseenBelief ? { topicKey: unseenBelief.topicKey } : {}),
      },
    );

  const targets = await lockRuntimeReflectionStateTargets(transaction, {
    agentProfileId: input.run.agentProfileId,
    delta: applied.delta,
  });
  const sourceById = new Map(targets.sources.map((source) => [source.id, source]));
  const relationshipByUserId = new Map(
    targets.relationships.map((relationship) => [relationship.targetUserId, relationship]),
  );
  const beliefByTopicKey = new Map(targets.beliefs.map((belief) => [belief.topicKey, belief]));
  const missingSource = applied.delta.sourceTrustDeltas.find(
    ({ sourceId }) => !sourceById.has(sourceId),
  );
  const missingRelationship = applied.delta.relationshipTrustDeltas.find(
    ({ targetUserId }) => !relationshipByUserId.has(targetUserId),
  );
  const missingBelief = applied.delta.beliefConfidenceDeltas.find(
    ({ topicKey }) => !beliefByTopicKey.has(topicKey),
  );
  if (missingSource || missingRelationship || missingBelief)
    throw new AppError(
      "VALIDATION_ERROR",
      422,
      "Reflection delta yalnız agente ait aktif source, relationship ve belief hedeflerine uygulanabilir.",
      undefined,
      undefined,
      {
        reasonCode: "REFLECTION_STATE_TARGET_NOT_FOUND",
        ...(missingSource ? { sourceId: missingSource.sourceId } : {}),
        ...(missingRelationship ? { targetUserId: missingRelationship.targetUserId } : {}),
        ...(missingBelief ? { topicKey: missingBelief.topicKey } : {}),
      },
    );

  const sources = [] as Array<{
    id: string;
    previousTrustScore: number;
    trustScore: number;
    weeklyScoreBudget: ReturnType<typeof assertSourceScoreWeeklyBudget>;
  }>;
  for (const { sourceId, delta } of applied.delta.sourceTrustDeltas) {
    const source = sourceById.get(sourceId)!;
    const trustScore = boundedReflectedValue(source.trustScore, delta, `sourceTrust.${sourceId}`);
    const audits = await listAgentSourceScoreAudits(transaction, source.id, week);
    const weeklyScoreBudget = assertSourceScoreWeeklyBudget({
      audits,
      changes: { trustScore: { from: source.trustScore, to: trustScore } },
    });
    sources.push({
      id: source.id,
      previousTrustScore: source.trustScore,
      trustScore,
      weeklyScoreBudget,
    });
  }
  const relationships = applied.delta.relationshipTrustDeltas.map(({ targetUserId, delta }) => {
    const relationship = relationshipByUserId.get(targetUserId)!;
    return {
      id: relationship.id,
      targetUserId,
      previousTrust: relationship.trust,
      trust: boundedReflectedValue(relationship.trust, delta, `relationshipTrust.${targetUserId}`),
    };
  });
  const beliefs = applied.delta.beliefConfidenceDeltas.map(({ topicKey, delta }) => {
    const belief = beliefByTopicKey.get(topicKey)!;
    return {
      ...belief,
      previousConfidence: belief.confidence,
      confidence: boundedReflectedValue(belief.confidence, delta, `beliefConfidence.${topicKey}`),
    };
  });
  await applyRuntimeReflectionStateDeltas(transaction, {
    agentProfileId: input.run.agentProfileId,
    now: input.now,
    sources,
    relationships,
    beliefs,
  });
  for (const source of sources)
    await appendRuntimeEvent(transaction, {
      agentProfileId: input.run.agentProfileId,
      runId: input.run.id,
      eventType: "SOURCE_STATE_CHANGED",
      subject: { type: "SOURCE", id: source.id },
      safeMessage: "Weekly reflection source trust state'ini kontrollü sınırlar içinde değiştirdi.",
      before: { trustScore: source.previousTrustScore },
      after: { trustScore: source.trustScore },
      metadata: { origin: "REFLECTION", reason: applied.delta.safeSummary },
      occurredAt: input.now,
    });
  for (const relationship of relationships)
    await appendRuntimeEvent(transaction, {
      agentProfileId: input.run.agentProfileId,
      runId: input.run.id,
      eventType: "RELATIONSHIP_CHANGED",
      subject: {
        type: "USER",
        id: relationship.targetUserId,
        relationshipId: relationship.id,
      },
      safeMessage:
        "Weekly reflection relationship trust state'ini kontrollü sınırlar içinde değiştirdi.",
      confidence: relationship.trust,
      before: { trust: relationship.previousTrust },
      after: { trust: relationship.trust },
      metadata: { origin: "REFLECTION", reason: applied.delta.safeSummary },
      occurredAt: input.now,
    });
  for (const belief of beliefs)
    await appendRuntimeEvent(transaction, {
      agentProfileId: input.run.agentProfileId,
      runId: input.run.id,
      eventType: "BELIEF_CHANGED",
      subject: { type: "BELIEF", topicKey: belief.topicKey },
      safeMessage:
        "Weekly reflection belief confidence state'ini kontrollü sınırlar içinde değiştirdi.",
      confidence: belief.confidence,
      before: { confidence: belief.previousConfidence, version: belief.version },
      after: { confidence: belief.confidence, version: belief.version + 1 },
      metadata: { origin: "REFLECTION", reason: applied.delta.safeSummary },
      occurredAt: input.now,
    });
  for (const source of sources) {
    await appendAuditLog(transaction, {
      actorId: input.principal.actor.actorId,
      action: "agent.source.updated",
      entityType: "AgentSource",
      entityId: source.id,
      requestId: input.principal.actor.requestId,
      metadata: {
        reason: applied.delta.safeSummary,
        changeOrigin: "REFLECTION",
        runId: input.run.id,
        scoreChanges: {
          trustScore: { from: source.previousTrustScore, to: source.trustScore },
        },
        before: { trustScore: source.previousTrustScore },
        after: { trustScore: source.trustScore },
        weeklyScoreBudget: {
          timeZone: "Europe/Istanbul",
          start: week.start.toISOString(),
          end: week.end.toISOString(),
          fields: source.weeklyScoreBudget,
        },
      },
    });
    await appendOutboxEvent(transaction, {
      eventType: "agent.source.changed",
      aggregateType: "AgentSource",
      aggregateId: source.id,
      actorId: input.principal.actor.actorId,
      actorKind: input.principal.actor.actorKind,
      requestId: input.principal.actor.requestId,
      payload: {
        agentProfileId: input.run.agentProfileId,
        runId: input.run.id,
        sourceId: source.id,
        reasonCode: "REFLECTION_TRUST_CHANGED",
        changeOrigin: "REFLECTION",
        before: { trustScore: source.previousTrustScore },
        after: { trustScore: source.trustScore },
        weeklyScoreBudget: {
          timeZone: "Europe/Istanbul",
          start: week.start.toISOString(),
          end: week.end.toISOString(),
          fields: source.weeklyScoreBudget,
        },
      },
    });
  }
  const version = await createRuntimeReflectionPersonaVersion(transaction, {
    agentProfileId: input.run.agentProfileId,
    currentVersionId: input.run.personaVersion.id,
    version: input.run.personaVersion.version + 1,
    persona: applied.persona,
    renderedPrompt: applied.renderedPrompt,
    changeSummary: applied.delta.safeSummary,
    validationReport: {
      ...applied.validationReport,
      runId: input.run.id,
      weeklyPersonaEvolutionDelta: applied.delta,
      week: {
        timeZone: "Europe/Istanbul",
        start: week.start.toISOString(),
        end: week.end.toISOString(),
      },
      stateChanges: {
        sourceIds: sources.map(({ id }) => id),
        relationshipIds: relationships.map(({ id }) => id),
        beliefTopicKeys: beliefs.map(({ topicKey }) => topicKey),
      },
    },
  });
  await appendRuntimeEvent(transaction, {
    agentProfileId: input.run.agentProfileId,
    runId: input.run.id,
    eventType: "PERSONA_CHANGED",
    subject: { type: "PERSONA", id: version.id },
    safeMessage: applied.delta.safeSummary,
    before: {
      personaVersionId: input.run.personaVersion.id,
      version: input.run.personaVersion.version,
    },
    after: { personaVersionId: version.id, version: version.version },
    metadata: { origin: "REFLECTION" },
    occurredAt: input.now,
  });
  await appendOutboxEvent(transaction, {
    eventType: "agent.persona.versioned",
    aggregateType: "AgentProfile",
    aggregateId: input.run.agentProfileId,
    actorId: input.principal.actor.actorId,
    actorKind: input.principal.actor.actorKind,
    requestId: input.principal.actor.requestId,
    payload: {
      agentProfileId: input.run.agentProfileId,
      runId: input.run.id,
      personaVersionId: version.id,
      previousPersonaVersionId: input.run.personaVersion.id,
      version: version.version,
      changeOrigin: "REFLECTION",
      changedSourceIds: sources.map(({ id }) => id),
      changedRelationshipCount: relationships.length,
      changedBeliefCount: beliefs.length,
    },
  });
  return {
    status: "APPLIED" as const,
    version: version.version,
    sourceIds: sources.map(({ id }) => id),
    relationshipIds: relationships.map(({ id }) => id),
    beliefTopicKeys: beliefs.map(({ topicKey }) => topicKey),
  };
}

function assertLeaseOwner(
  run: OwnedRun | null,
  workerId: string,
  leaseToken: string,
  now: Date,
  allowCancelRequested = true,
): asserts run is OwnedRun {
  if (!run) throw runNotFound();
  const allowedStatuses = allowCancelRequested ? ["RUNNING", "CANCEL_REQUESTED"] : ["RUNNING"];
  if (
    !allowedStatuses.includes(run.runStatus) ||
    run.leaseOwner !== workerId ||
    run.leaseToken !== leaseToken ||
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

function assertTerminalReporter(
  run: OwnedRun | null,
  workerId: string,
  leaseToken: string,
): asserts run is OwnedRun {
  if (
    !run ||
    !["RUNNING", "CANCEL_REQUESTED"].includes(run.runStatus) ||
    run.leaseOwner !== workerId ||
    run.leaseToken !== leaseToken ||
    !run.leaseExpiresAt
  ) {
    throw new AppError(
      "AGENT_RUN_LEASE_INVALID",
      409,
      "Run terminal raporu yalnız son lease sahibi tarafından kapatılabilir.",
    );
  }
}

function assertRunDeadline(run: OwnedRun, now: Date): void {
  if (!run.startedAt || now.getTime() >= run.startedAt.getTime() + run.timeoutSeconds * 1000)
    throw new AppError(
      "AGENT_RUN_DEADLINE_EXCEEDED",
      409,
      "Run deadline doldu; yeni runtime sonucu kaydedilemez.",
    );
}

function assertRunExecutionBudget(run: OwnedRun, now: Date): void {
  if (run.runStatus === "CANCEL_REQUESTED")
    throw new AppError(
      "AGENT_RUN_CANCEL_REQUESTED",
      409,
      "Run için iptal istendi; yeni runtime sonucu kaydedilemez.",
    );
  assertRunDeadline(run, now);
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

type RuntimeTerminalOutcome = "SUCCEEDED" | "PARTIAL" | "FAILED" | "CANCELLED" | "TIMED_OUT";

async function appendCanonicalRunTerminalOutbox(
  transaction: TransactionClient,
  principal: RuntimePrincipal,
  input: {
    runId: string;
    outcome: RuntimeTerminalOutcome;
    requestedOutcome?: RuntimeTerminalOutcome;
    errorCode?: string;
    reasonCode?: string;
    measured: Awaited<ReturnType<typeof getMeasuredRuntimeRunMetrics>>;
  },
): Promise<void> {
  await appendOutboxEvent(transaction, {
    eventType:
      input.outcome === "SUCCEEDED" || input.outcome === "PARTIAL"
        ? "agent.run.completed"
        : "agent.run.failed",
    aggregateType: "AgentRun",
    aggregateId: input.runId,
    actorId: principal.actor.actorId,
    actorKind: principal.actor.actorKind,
    requestId: principal.actor.requestId,
    payload: {
      agentProfileId: principal.agentProfileId,
      runId: input.runId,
      outcome: input.outcome,
      ...(input.requestedOutcome ? { requestedOutcome: input.requestedOutcome } : {}),
      ...(input.errorCode ? { errorCode: input.errorCode } : {}),
      ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
      measured: {
        publishedEntries: input.measured.publishedEntries,
        createdTopics: input.measured.createdTopics,
        votes: input.measured.votes,
        sourceReads: input.measured.sourceReads,
        proposedActions: input.measured.proposedActions,
        succeededActions: input.measured.succeededActions,
        rejectedActions: input.measured.rejectedActions,
        committedMemoryEpisodes: input.measured.committedMemoryEpisodes,
      },
    },
  });
}

async function finalizeExpiredRuntimeRuns(
  transaction: TransactionClient,
  principal: RuntimePrincipal,
  runs: ExpiredRuntimeRunCandidate[],
  reasonCode: "CANCEL_REQUESTED_LEASE_EXPIRED" | "MAINTENANCE_MODE_LEASE_EXPIRED",
  now: Date,
): Promise<void> {
  for (const run of runs) {
    const measuredMetrics = await getMeasuredRuntimeRunMetrics(transaction, run.id);
    const terminal = terminalizeInterruptedRuntimeRun("CANCELLED", measuredMetrics);
    const errorCode =
      reasonCode === "MAINTENANCE_MODE_LEASE_EXPIRED"
        ? terminal.outcome === "PARTIAL"
          ? "MAINTENANCE_MODE_EXPIRED_RUN_PARTIAL"
          : "MAINTENANCE_MODE_EXPIRED_RUN_CANCELLED"
        : terminal.outcome === "PARTIAL"
          ? "CANCEL_LEASE_EXPIRED_PARTIAL"
          : "CANCEL_LEASE_EXPIRED";
    const errorSummary =
      terminal.outcome === "PARTIAL"
        ? "Lease expiry öncesinde commit edilen etkiler korunarak run kısmi tamamlandı."
        : reasonCode === "MAINTENANCE_MODE_LEASE_EXPIRED"
          ? "Bakım modunda lease süresi dolan non-maintenance run güvenli biçimde kapatıldı."
          : "İptal istenen run lease süresi dolunca güvenli biçimde kapatıldı.";
    await finishRuntimeRunRecord(transaction, {
      runId: run.id,
      agentProfileId: principal.agentProfileId,
      outcome: terminal.outcome,
      now,
      ...(terminal.safeRunSummary ? { safeRunSummary: terminal.safeRunSummary } : {}),
      performanceMetrics: { measured: measuredMetrics },
      errorCode,
      errorSummary,
      publishedEntries: measuredMetrics.publishedEntries,
      createdTopics: measuredMetrics.createdTopics,
      votes: measuredMetrics.votes,
      sourceReads: measuredMetrics.sourceReads,
    });
    await appendCanonicalRunTerminalOutbox(transaction, principal, {
      runId: run.id,
      outcome: terminal.outcome,
      requestedOutcome: "CANCELLED",
      errorCode,
      reasonCode,
      measured: measuredMetrics,
    });
    const metadata = {
      reason:
        reasonCode === "MAINTENANCE_MODE_LEASE_EXPIRED"
          ? "Bakım modunda süresi dolan non-maintenance run yeniden lease edilemez."
          : "İptal istenen run lease süresi dolduktan sonra yeniden çalıştırılamaz.",
      reasonCode,
      errorCode,
      runType: run.runType,
      leaseExpiredAt: run.leaseExpiresAt?.toISOString() ?? null,
      finalizedAt: now.toISOString(),
      scheduleSlotTerminalStatus:
        run.scheduleSlotId === null
          ? null
          : terminal.outcome === "PARTIAL"
            ? "COMPLETED"
            : "CANCELLED",
      actorKind: principal.actor.actorKind,
      before: { runStatus: run.previousStatus },
      after: {
        runStatus: terminal.outcome,
        errorCode,
      },
      measured: measuredMetrics,
      ...(reasonCode === "MAINTENANCE_MODE_LEASE_EXPIRED"
        ? { runtimeOperatingMode: "MAINTENANCE" }
        : {}),
    };
    await appendRuntimeRunEvents(transaction, {
      runId: run.id,
      agentProfileId: principal.agentProfileId,
      events: [
        {
          eventType: "run.expired_finalized",
          safeMessage: `Lease süresi dolan run ${terminal.outcome} durumuyla kapatıldı.`,
          metadata: { phase: terminal.outcome, code: errorCode, reasonCode },
        },
      ],
    });
    await auditRuntimeRun(transaction, principal, run.id, "agent.run.expired_finalized", metadata);
    await appendOutboxEvent(transaction, {
      eventType: "agent.run.expired_finalized",
      aggregateType: "AgentRun",
      aggregateId: run.id,
      actorId: principal.actor.actorId,
      actorKind: principal.actor.actorKind,
      requestId: principal.actor.requestId,
      payload: metadata,
    });
    await appendRuntimeEvent(transaction, {
      agentProfileId: principal.agentProfileId,
      runId: run.id,
      eventType: "run.expired_finalized",
      safeMessage: `Lease süresi dolan run ${terminal.outcome} durumuyla kapatıldı.`,
      metadata,
    });
  }
}

async function recordRuntimeCircuitBreakerTransition(
  transaction: TransactionClient,
  principal: RuntimePrincipal,
  input: {
    now: Date;
    breakers: ReturnType<typeof evaluateCircuitBreakers>;
  },
): Promise<void> {
  const previousActiveCodes = await getLatestRuntimeCircuitBreakerSnapshot(transaction);
  const transition = evaluateCircuitBreakerTransition(previousActiveCodes, input.breakers.breakers);
  if (!transition.changed) return;
  const metadata = {
    activeCodes: transition.activeCodes,
    triggeredCodes: transition.triggeredCodes,
    clearedCodes: transition.clearedCodes,
    observedAt: input.now.toISOString(),
  };
  await appendRuntimeEvent(transaction, {
    eventType: "runtime.circuit_breaker.snapshot",
    safeMessage:
      transition.triggeredCodes.length > 0
        ? "Runtime circuit-breaker active kodları değişti."
        : "Runtime circuit-breaker kodları temizlendi.",
    metadata,
  });
  if (transition.triggeredCodes.length === 0) return;
  const triggered = input.breakers.breakers
    .filter(({ code }) => transition.triggeredCodes.includes(code))
    .map(({ code, severity, measured, threshold, ...optional }) => ({
      code,
      severity,
      measured,
      threshold,
      ...(typeof optional.windowMinutes === "number"
        ? { windowMinutes: optional.windowMinutes }
        : {}),
    }));
  const payload = {
    reasonCode: "THRESHOLD_TRANSITION",
    ...metadata,
    triggered,
    effects: {
      writeRunsPaused: input.breakers.writeRunsPaused,
      runtimePaused: input.breakers.runtimePaused,
      catchUpFrozen: input.breakers.catchUpFrozen,
      contentSlowdown: input.breakers.contentSlowdown,
      capacityAtRisk: input.breakers.capacityAtRisk,
    },
  };
  await appendAuditLog(transaction, {
    actorId: null,
    action: "agent.circuit_breaker.triggered",
    entityType: "AgentGlobalSettings",
    entityId: GLOBAL_SETTINGS_AGGREGATE_ID,
    requestId: principal.actor.requestId,
    metadata: payload,
  });
  await appendOutboxEvent(transaction, {
    eventType: "agent.circuit_breaker.triggered",
    aggregateType: "AgentGlobalSettings",
    aggregateId: GLOBAL_SETTINGS_AGGREGATE_ID,
    actorId: null,
    actorKind: null,
    requestId: principal.actor.requestId,
    payload,
  });
}

async function autoPauseRuntimeForProductionCriticalBreaker(
  transaction: TransactionClient,
  principal: RuntimePrincipal,
  input: {
    now: Date;
    breakers: ReturnType<typeof evaluateCircuitBreakers>;
  },
): Promise<boolean> {
  const activation = await getProductionSafetyWindowAnchor(transaction);
  const decision = evaluateProductionCriticalBreakerAutoPause({
    activationStartedAt: activation?.createdAt ?? null,
    now: input.now,
    activeCriticalCodes: input.breakers.activeCriticalCodes,
  });
  if (!decision.shouldAutoPause) return false;
  const updated = await pauseGlobalRuntimeForCriticalBreakerRecord(transaction);
  const metadata = {
    command: "AUTO_PAUSE",
    reason: "DAY_ZERO_CRITICAL_BREAKER",
    activeCriticalCodes: decision.activeCriticalCodes,
    activationStartedAt: decision.activationStartedAt!.toISOString(),
    protectionEndsAt: decision.protectionEndsAt!.toISOString(),
    settingsVersion: updated.settingsVersion,
  };
  await appendAuditLog(transaction, {
    actorId: null,
    action: "agent.settings.changed",
    entityType: "AgentGlobalSettings",
    entityId: GLOBAL_SETTINGS_AGGREGATE_ID,
    requestId: principal.actor.requestId,
    metadata,
  });
  await appendOutboxEvent(transaction, {
    eventType: "agent.settings.changed",
    aggregateType: "AgentGlobalSettings",
    aggregateId: GLOBAL_SETTINGS_AGGREGATE_ID,
    actorId: null,
    actorKind: null,
    requestId: principal.actor.requestId,
    payload: metadata,
  });
  await appendOutboxEvent(transaction, {
    eventType: "agent.circuit_breaker.triggered",
    aggregateType: "AgentGlobalSettings",
    aggregateId: GLOBAL_SETTINGS_AGGREGATE_ID,
    actorId: null,
    actorKind: null,
    requestId: principal.actor.requestId,
    payload: {
      reasonCode: "DAY_ZERO_CRITICAL_BREAKER",
      activeCriticalCodes: decision.activeCriticalCodes,
      activationStartedAt: decision.activationStartedAt!.toISOString(),
      protectionEndsAt: decision.protectionEndsAt!.toISOString(),
      before: { runtimeEnabled: true },
      after: { runtimeEnabled: false, settingsVersion: updated.settingsVersion },
    },
  });
  await appendAuditLog(transaction, {
    actorId: null,
    action: "agent.circuit_breaker.triggered",
    entityType: "AgentGlobalSettings",
    entityId: GLOBAL_SETTINGS_AGGREGATE_ID,
    requestId: principal.actor.requestId,
    metadata: {
      reasonCode: "DAY_ZERO_CRITICAL_BREAKER",
      activeCodes: decision.activeCriticalCodes,
      observedAt: input.now.toISOString(),
    },
  });
  await appendRuntimeEvent(transaction, {
    eventType: "runtime.circuit_breaker.snapshot",
    safeMessage: "Day 0 critical circuit-breaker kodları kaydedildi.",
    metadata: {
      activeCodes: input.breakers.breakers
        .filter(({ active }) => active)
        .map(({ code }) => code)
        .sort(),
      triggeredCodes: decision.activeCriticalCodes,
      clearedCodes: [],
      observedAt: input.now.toISOString(),
    },
  });
  await appendRuntimeEvent(transaction, {
    eventType: "runtime.global.paused",
    safeMessage: "İlk dört production saatinde critical breaker global runtime'ı pause etti.",
    metadata,
  });
  return true;
}

export async function assertRuntimeLeaseDatabaseReadiness(
  executor: DatabaseExecutor,
  checkReadiness: (executor: DatabaseExecutor) => Promise<void> = checkDatabaseReadiness,
): Promise<void> {
  try {
    await checkReadiness(executor);
  } catch {
    throw new AppError("SERVICE_NOT_READY", 503, "Database hazır değil; runtime lease verilmedi.");
  }
}

export async function recoverRuntimeLeaseTokenForIdempotencyReplay(
  client: DatabaseExecutor,
  principal: RuntimePrincipal,
  input: { runId: string; workerId: string; leaseTokenFingerprint: string },
  now = new Date(),
): Promise<string> {
  const lease = await findRuntimeLeaseForIdempotencyReplay(client, {
    runId: input.runId,
    agentProfileId: principal.agentProfileId,
    workerId: input.workerId,
    now,
  });
  if (
    !lease?.leaseToken ||
    !constantTimeEqual(sha256(lease.leaseToken), input.leaseTokenFingerprint)
  )
    throw new AppError(
      "AGENT_RUN_LEASE_INVALID",
      409,
      "Idempotent lease replay yalnız aynı aktif lease generation için kullanılabilir.",
    );
  return lease.leaseToken;
}

export async function leaseRuntimeRun(
  client: DatabaseExecutor,
  principal: RuntimePrincipal,
  input: RuntimeLeaseInput,
  dependencies: RuntimeLeaseDependencies = {},
) {
  await assertRuntimeLeaseDatabaseReadiness(
    client,
    dependencies.checkReadiness ?? checkDatabaseReadiness,
  );
  return inTransaction(client, async (transaction) => {
    await lockRuntimeAgent(transaction, principal.agentProfileId);
    const agent = await getRuntimeAgentLifecycle(transaction, principal.agentProfileId);
    if (!agent || agent.lifecycleStatus !== "ACTIVE") {
      return {
        run: null,
        reason: "NOT_ACTIVE",
      };
    }

    // Lock order is agent profile -> global settings everywhere that needs both.
    // Reusing the settings aggregate's PostgreSQL advisory lock serializes the
    // authoritative concurrency value with every global lease claim and with
    // admin concurrency updates, without introducing an inverse lock order.
    await lockAgentSettings(transaction);
    const rolloutDate = await pauseExpiredProductionRollout(
      transaction,
      principal.actor,
      new Date(),
    );
    if (rolloutDate.expired) return { run: null, reason: "ERROR_PAUSED" };
    const settings = await getRuntimeGlobalSettings(transaction);
    if (!settings.runtimeEnabled) return { run: null, reason: "PAUSED" };
    const maintenanceMode = settings.runtimeOperatingMode === "MAINTENANCE";
    const now = new Date();
    const expiredCancellations = await listExpiredCancellationRunsForFinalization(
      transaction,
      principal.agentProfileId,
      now,
    );
    await finalizeExpiredRuntimeRuns(
      transaction,
      principal,
      expiredCancellations,
      "CANCEL_REQUESTED_LEASE_EXPIRED",
      now,
    );
    if (maintenanceMode) {
      const expiredRuns = await listExpiredNonMaintenanceRunsForMaintenanceFinalization(
        transaction,
        principal.agentProfileId,
        now,
      );
      await finalizeExpiredRuntimeRuns(
        transaction,
        principal,
        expiredRuns,
        "MAINTENANCE_MODE_LEASE_EXPIRED",
        now,
      );
    }
    const concurrency = settings.codexConcurrency === 2 ? 2 : 1;
    const breakerConfig = circuitBreakerConfigSchema.parse(settings.circuitBreakerConfig);
    const operational = await getRuntimeOperationalMetrics(transaction, {
      now,
      concurrency,
      config: breakerConfig,
    });
    const breakers = evaluateCircuitBreakers(breakerConfig, operational);
    if (
      await autoPauseRuntimeForProductionCriticalBreaker(transaction, principal, {
        now,
        breakers,
      })
    )
      return { run: null, reason: "ERROR_PAUSED" };
    await recordRuntimeCircuitBreakerTransition(transaction, principal, { now, breakers });
    if (breakers.runtimePaused) return { run: null, reason: "ERROR_PAUSED" };
    const activeLeaseCount = await countActiveRuntimeLeases(transaction, now);
    if (activeLeaseCount >= concurrency) return { run: null, reason: "CAPACITY_FULL" };
    const activation = await getProductionSafetyWindowAnchor(transaction);
    const catchUpFrozen =
      maintenanceMode ||
      breakers.catchUpFrozen ||
      productionActivationCatchUpFrozen({
        activationStartedAt: activation?.createdAt ?? null,
        now,
      });
    if (settings.schedulerEnabled) {
      const queuedRuns: QueuedRunEventRecord[] = [];
      const localDate = istanbulLocalDate(now);
      await terminalizeExpiredQueuedCatchUpRuns(transaction, principal, { localDate, now });
      if (!maintenanceMode) {
        const dispatched = await dispatchDueScheduleSlots(transaction, {
          now,
          localDate,
          timeoutSeconds: settings.scheduledTimeoutSeconds,
        });
        queuedRuns.push(...dispatched.runs);
      }
      const planned = await planRuntimeMaintenanceAndCatchUp(transaction, {
        agentProfileId: principal.agentProfileId,
        localDate,
        now,
        catchUpFrozen,
        concurrency,
        scheduledTimeoutSeconds: settings.scheduledTimeoutSeconds,
        reflectionTimeoutSeconds: settings.reflectionTimeoutSeconds,
        sourceRefreshTimeoutSeconds: settings.sourceRefreshTimeoutSeconds,
        personaEvolutionEnabled: settings.personaEvolutionEnabled,
        sourceEvolutionEnabled: settings.sourceEvolutionEnabled,
      });
      queuedRuns.push(...planned.runs);
      for (const run of new Map(queuedRuns.map((item) => [item.id, item])).values())
        await appendAutomaticRunQueuedOutbox(transaction, principal.actor.requestId, run);
    }
    const run = await claimNextRuntimeRun(transaction, {
      agentProfileId: principal.agentProfileId,
      workerId: input.workerId,
      leaseSeconds: input.leaseSeconds,
      maxRetryCount: settings.maxRetryCount,
      writeRunsPaused: breakers.writeRunsPaused,
      catchUpFrozen,
      contentSlowdownMinutes: breakers.contentSlowdown ? breakerConfig.duplicateCooldownMinutes : 0,
      runtimeOperatingMode: settings.runtimeOperatingMode,
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
      before: { runStatus: run.attempts > 1 ? "RUNNING" : "QUEUED" },
      after: { runStatus: "RUNNING", runtimeStatus: "STARTING", attempt: run.attempts },
      metadata: { phase: "STARTING", attempt: run.attempts },
      occurredAt: now,
    });
    await auditRuntimeRun(transaction, principal, run.id, "agent.run.leased", {
      workerId: input.workerId,
      leaseExpiresAt: run.leaseExpiresAt?.toISOString(),
      attempt: run.attempts,
    });
    await appendOutboxEvent(transaction, {
      eventType: "agent.run.started",
      aggregateType: "AgentRun",
      aggregateId: run.id,
      actorId: principal.actor.actorId,
      actorKind: principal.actor.actorKind,
      requestId: principal.actor.requestId,
      payload: {
        agentProfileId: principal.agentProfileId,
        runId: run.id,
        runType: run.runType,
        queuePriority: run.queuePriority,
        runStatus: run.runStatus,
        attempt: run.attempts,
        startedAt: (run.startedAt ?? now).toISOString(),
      },
    });
    return { run: { ...run, startedAt: run.startedAt ?? now }, reason: null };
  });
}

export function heartbeatRuntimeRun(
  client: DatabaseExecutor,
  principal: RuntimePrincipal,
  runId: string,
  input: RuntimeHeartbeatInput,
) {
  return inTransaction(client, async (transaction) => {
    await lockRuntimeAgent(transaction, principal.agentProfileId);
    await lockRuntimeRunForLeaseMutation(transaction, runId);
    await lockAgentSettings(transaction);
    const now = new Date();
    const run = await findRuntimeOwnedRun(transaction, principal.agentProfileId, runId);
    assertLeaseOwner(run, input.workerId, input.leaseToken, now);
    assertRunDeadline(run, now);
    const rolloutDate = await pauseExpiredProductionRollout(transaction, principal.actor, now);
    if (rolloutDate.expired)
      return {
        runId,
        leaseExpiresAt: run.leaseExpiresAt ?? now,
        cancelRequested: true,
        rolloutExpired: true as const,
      };
    const cancelRequested = run.runStatus === "CANCEL_REQUESTED";
    const runtimeStatus = cancelRequested ? "CANCELLING" : input.runtimeStatus;
    const leaseExpiresAt = new Date(now.getTime() + input.leaseSeconds * 1000);
    const heartbeatChange = await heartbeatRuntimeRunRecord(transaction, {
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
      before: heartbeatChange.before,
      after: heartbeatChange.after,
      metadata: { runtimeStatus, cancelRequested },
      occurredAt: now,
    });
    return { runId, leaseExpiresAt, cancelRequested };
  });
}

export function getRuntimeRunContext(
  client: DatabaseExecutor,
  principal: RuntimePrincipal,
  runId: string,
  workerId: string,
  leaseToken: string,
) {
  return inTransaction(client, async (transaction) => {
    await lockRuntimeAgent(transaction, principal.agentProfileId);
    await lockRuntimeRunForLeaseMutation(transaction, runId);
    await lockAgentSettings(transaction);
    const now = new Date();
    const run = await findRuntimeOwnedRun(transaction, principal.agentProfileId, runId);
    assertLeaseOwner(run, workerId, leaseToken, now);
    assertRunDeadline(run, now);
    const rolloutDate = await pauseExpiredProductionRollout(transaction, principal.actor, now);
    const settings = await getRuntimeGlobalSettings(transaction);
    const publicWriteEnabled = runtimePublicWritesAllowed({
      publicWriteEnabled: settings.publicWriteEnabled,
      runtimeOperatingMode: settings.runtimeOperatingMode,
    });
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
        sourceFetchLimit: sourceFetchTargetLimit(run.runType, settings.sourceFetchLimit),
        includeSources:
          run.runType === "REFLECTION" || (run.allowSourceReading && settings.sourceReadingEnabled),
      });
      const builtPerception = boundedPerceptionSnapshot(run, perceptionRecords, now);
      await storeRuntimePerceptionSummary(transaction, runId, builtPerception);
      perception = builtPerception;
    }
    const presentedIds = [...collectSnapshotIds(perception)].slice(0, 200);
    const contextHash = sha256(canonicalLifeEventJson(perception));
    await appendRuntimeEvent(transaction, {
      agentProfileId: principal.agentProfileId,
      runId,
      eventType: "CONTEXT_PRESENTED",
      subject: { type: "RUN", id: runId },
      safeMessage: "Dondurulmuş runtime context agent karar döngüsüne sunuldu.",
      evidenceIds: presentedIds,
      after: {
        personaVersionId: run.personaVersion.id,
        presentedEvidenceCount: presentedIds.length,
        perceptionFrozen: true,
        contextHash,
      },
      metadata: { origin: "RUNTIME_CONTEXT", presentedAt: now.toISOString(), contextHash },
      occurredAt: now,
    });
    return {
      run: {
        id: run.id,
        runType: run.runType,
        trigger: run.trigger,
        timeoutSeconds: run.timeoutSeconds,
        desiredEntryMin: run.desiredEntryMin,
        desiredEntryMax: run.desiredEntryMax,
        allowTopicCreation:
          publicWriteEnabled && run.allowTopicCreation && settings.topicCreationEnabled,
        allowVoting: publicWriteEnabled && run.allowVoting && settings.votingEnabled,
        allowFollowing: publicWriteEnabled && run.allowFollowing && settings.userFollowingEnabled,
        allowSourceReading: run.allowSourceReading && settings.sourceReadingEnabled,
        publishEnabled: publicWriteEnabled && settings.publishEnabled,
        publicWriteEnabled,
        runtimeOperatingMode: settings.runtimeOperatingMode,
        sourceFetchLimit: settings.sourceFetchLimit,
        debugRetentionHours: settings.debugRetentionHours,
        saturationOverride: run.saturationOverride,
        dailyMaximumOverride: run.dailyMaximumOverride,
        adminInstruction: run.adminInstruction,
        cancelRequested: run.runStatus === "CANCEL_REQUESTED" || rolloutDate.expired,
      },
      agent: {
        username: run.agentProfile.user.username,
        displayName: run.agentProfile.user.displayName,
        publicBio: run.agentProfile.user.bio,
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
    await lockRuntimeAgent(transaction, principal.agentProfileId);
    await lockRuntimeRunForLeaseMutation(transaction, runId);
    const now = new Date();
    const run = await findRuntimeOwnedRun(transaction, principal.agentProfileId, runId);
    assertLeaseOwner(run, input.workerId, input.leaseToken, now);
    assertRunExecutionBudget(run, now);
    await lockAgentSettings(transaction);
    const rolloutBlock = await guardProductionRolloutRuntimeMutation(
      transaction,
      principal.actor,
      now,
    );
    if (rolloutBlock) return rolloutBlock as never;
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
  now = new Date(),
) {
  return inTransaction(client, async (transaction) => {
    await lockRuntimeAgent(transaction, principal.agentProfileId);
    await lockRuntimeRunForLeaseMutation(transaction, runId);
    const run = await findRuntimeOwnedRun(transaction, principal.agentProfileId, runId);
    assertLeaseOwner(run, input.workerId, input.leaseToken, now);
    assertRunExecutionBudget(run, now);
    await lockAgentSettings(transaction);
    const rolloutBlock = await guardProductionRolloutRuntimeMutation(
      transaction,
      principal.actor,
      now,
    );
    if (rolloutBlock) return rolloutBlock as never;
    const existingActions = await listRuntimeActionsForRepairValidation(transaction, {
      runId,
      agentProfileId: principal.agentProfileId,
    });
    const duplicateRejections = existingActions.filter(
      ({ actionStatus, rejectionCode }) =>
        actionStatus === "REJECTED" &&
        ["DUPLICATE_SIMILARITY", "DUPLICATE_FRAMING"].includes(rejectionCode ?? ""),
    );
    const repairCandidates = input.actions.filter(
      ({ repairOfSequence }) => repairOfSequence !== undefined,
    );
    if (duplicateRejections.length > 0 && repairCandidates.length === 0)
      throw new AppError(
        "AGENT_DUPLICATE_REPAIR_REQUIRED",
        409,
        "Duplicate reddinden sonra yalnız işaretli tek repair adayı kaydedilebilir.",
      );
    if (repairCandidates.length > 0) {
      if (input.actions.length !== 1 || repairCandidates.length !== 1)
        throw new AppError(
          "AGENT_DUPLICATE_REPAIR_INVALID",
          422,
          "Duplicate repair batch yalnız tek action içerebilir.",
        );
      const candidate = repairCandidates[0]!;
      const origin = existingActions.find(
        ({ sequence }) => sequence === candidate.repairOfSequence,
      );
      const marker = (value: unknown): number | null => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return null;
        const sequence = (value as Record<string, unknown>).repairOfSequence;
        return typeof sequence === "number" && Number.isInteger(sequence) ? sequence : null;
      };
      const record = (value: unknown): Record<string, unknown> =>
        value && typeof value === "object" && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : {};
      const withoutStoredSafeReason = (value: unknown): Record<string, unknown> => {
        const stored = { ...record(value) };
        delete stored.safeReason;
        return stored;
      };
      if (
        !origin ||
        origin.actionStatus !== "REJECTED" ||
        !["DUPLICATE_SIMILARITY", "DUPLICATE_FRAMING"].includes(origin.rejectionCode ?? "") ||
        marker(origin.validationResult) !== null ||
        existingActions.some(({ validationResult }) => marker(validationResult) !== null) ||
        candidate.sequence <= Math.max(0, ...existingActions.map(({ sequence }) => sequence)) ||
        !duplicateRepairCandidateIsSafe(
          {
            sequence: origin.sequence,
            actionType: origin.actionType,
            ...(origin.targetType ? { targetType: origin.targetType } : {}),
            ...(origin.targetId ? { targetId: origin.targetId } : {}),
            input: withoutStoredSafeReason(origin.input),
            ...(origin.provenance ? { provenance: origin.provenance } : {}),
          },
          {
            sequence: candidate.sequence,
            actionType: candidate.actionType,
            ...(candidate.targetType ? { targetType: candidate.targetType } : {}),
            ...(candidate.targetId ? { targetId: candidate.targetId } : {}),
            input: candidate.input,
            ...(candidate.provenance ? { provenance: candidate.provenance } : {}),
            repairOfSequence: candidate.repairOfSequence!,
          },
        )
      )
        throw new AppError(
          "AGENT_DUPLICATE_REPAIR_INVALID",
          422,
          "Repair yalnız ilk duplicate action'ın body alanını güvenli biçimde değiştirebilir.",
        );
    }
    const result = await appendRuntimeActions(transaction, {
      runId,
      agentProfileId: principal.agentProfileId,
      actions: input.actions.map((action) => ({
        sequence: action.sequence,
        actionType: action.actionType,
        safeReason: action.safeReason,
        input: action.input,
        ...(action.targetType !== undefined ? { targetType: action.targetType } : {}),
        ...(action.targetId !== undefined ? { targetId: action.targetId } : {}),
        ...(action.provenance !== undefined ? { provenance: action.provenance } : {}),
        ...(action.repairOfSequence !== undefined
          ? { repairOfSequence: action.repairOfSequence }
          : {}),
      })),
    });
    await auditRuntimeRun(transaction, principal, runId, "agent.run.actions_proposed", {
      count: result.count,
      actionTypes: input.actions.map(({ actionType }) => actionType),
      safeReasons: input.actions.map(({ safeReason }) => safeReason),
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
    await lockRuntimeAgent(transaction, principal.agentProfileId);
    await lockRuntimeRunForLeaseMutation(transaction, runId);
    const now = new Date();
    const run = await findRuntimeOwnedRun(transaction, principal.agentProfileId, runId);
    assertLeaseOwner(run, input.workerId, input.leaseToken, now);
    assertRunExecutionBudget(run, now);
    await lockAgentSettings(transaction);
    const rolloutBlock = await guardProductionRolloutRuntimeMutation(
      transaction,
      principal.actor,
      now,
    );
    if (rolloutBlock) return rolloutBlock as never;
    if (
      run.runType !== "REFLECTION" ||
      !["NIGHTLY_MEMORY_CONSOLIDATION", "ADMIN_MEMORY_RECONSOLIDATE"].includes(run.trigger)
    )
      throw new AppError(
        "VALIDATION_ERROR",
        422,
        "Runtime memory yazımı yalnız izinli consolidation run'larında yapılabilir.",
      );
    const observedIds = collectSnapshotIds(run.perceptionSummary);
    let count = 0;
    for (const memory of input.memories) {
      if (memory.sourceMemoryIds.some((id) => !observedIds.has(id)))
        throw new AppError(
          "VALIDATION_ERROR",
          422,
          "Consolidation yalnız bu run perception snapshot'ında gerçekten görülen memory kayıtlarından oluşabilir.",
        );
      const evidence = await validateRuntimeProvenanceEvidence(transaction, {
        agentProfileId: principal.agentProfileId,
        runId,
        evidenceType: "AGENT_MEMORY",
        evidenceIds: memory.sourceMemoryIds,
      });
      if (!evidence.valid)
        throw new AppError(
          "VALIDATION_ERROR",
          422,
          "Consolidation kaynak memory kayıtları aktif ve bu agente ait olmalıdır.",
        );
      const created = await createRuntimeMemoryEpisode(transaction, {
        agentProfileId: principal.agentProfileId,
        runId,
        eventType: "MEMORY_CONSOLIDATION",
        summary: memory.summary,
        salience: memory.salience,
        provenance: "AGENT_MEMORY",
        evidence: { sourceMemoryIds: memory.sourceMemoryIds },
        occurredAt: now,
      });
      await appendRuntimeEvent(transaction, {
        agentProfileId: principal.agentProfileId,
        runId,
        eventType: "MEMORY_CANDIDATE_COMMITTED",
        subject: { type: "MEMORY", id: created.id },
        safeMessage: "Seçili memory kayıtları yeni consolidation memory kaydına dönüştürüldü.",
        confidence: memory.salience,
        evidenceIds: memory.sourceMemoryIds,
        after: {
          memoryId: created.id,
          status: "COMMITTED",
          sourceMemoryIds: memory.sourceMemoryIds,
        },
        metadata: { origin: "MEMORY_CONSOLIDATION" },
        occurredAt: now,
      });
      count += 1;
    }
    await auditRuntimeRun(transaction, principal, runId, "agent.run.memories_consolidated", {
      count,
      sourceMemoryCount: new Set(input.memories.flatMap(({ sourceMemoryIds }) => sourceMemoryIds))
        .size,
    });
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
    await lockRuntimeAgent(transaction, principal.agentProfileId);
    await lockRuntimeRunForLeaseMutation(transaction, runId);
    const now = new Date();
    const run = await findRuntimeOwnedRun(transaction, principal.agentProfileId, runId);
    assertLeaseOwner(run, input.workerId, input.leaseToken, now);
    assertRunExecutionBudget(run, now);
    await lockAgentSettings(transaction);
    const rolloutBlock = await guardProductionRolloutRuntimeMutation(
      transaction,
      principal.actor,
      now,
    );
    if (rolloutBlock) return rolloutBlock as never;
    const settings = await getRuntimeGlobalSettings(transaction);
    if (!run.allowSourceReading || !settings.sourceReadingEnabled)
      throw new AppError("FORBIDDEN", 403, "Bu run için source reading kapalıdır.");
    const source = await findRuntimeSourceForWrite(transaction, {
      agentProfileId: principal.agentProfileId,
      sourceId: input.sourceId,
    });
    if (!source) throw new AppError("VALIDATION_ERROR", 422, "Source fetch hedefi geçersizdir.");
    const attempt = await findRuntimeSourceAttemptLifeEvent(transaction, {
      agentProfileId: principal.agentProfileId,
      runId,
      sourceId: source.id,
      attemptId: input.attemptId,
    });
    if (!attempt)
      throw new AppError(
        "VALIDATION_ERROR",
        422,
        "Source sonucu ağ isteğinden önce kaydedilmiş fetch attempt gerektirir.",
      );
    for (const item of input.items) parseSafeSourceUrl(item.canonicalUrl);
    const stored = await storeRuntimeSourceResult(transaction, {
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
    for (const change of stored.changes) {
      await appendOutboxEvent(transaction, {
        eventType: "agent.source.changed",
        aggregateType: "AgentSource",
        aggregateId: change.sourceId,
        actorId: principal.actor.actorId,
        actorKind: principal.actor.actorKind,
        requestId: principal.actor.requestId,
        payload: {
          agentProfileId: principal.agentProfileId,
          runId,
          sourceId: change.sourceId,
          normalizedDomain: change.normalizedDomain,
          reasonCode: input.errorCode
            ? "FETCH_FAILED"
            : change.before.status !== change.after.status
              ? "STATUS_PROMOTED"
              : "FETCH_RECORDED",
          ...(input.errorCode ? { errorCode: input.errorCode } : {}),
          before: runtimeSourceStatePayload(change.before),
          after: runtimeSourceStatePayload(change.after),
        },
      });
      await appendRuntimeEvent(transaction, {
        agentProfileId: principal.agentProfileId,
        runId,
        eventType: "SOURCE_STATE_CHANGED",
        subject: { type: "SOURCE", id: change.sourceId },
        safeMessage: "Source fetch sonucu source yaşam durumu server-side değişti.",
        before: runtimeSourceStatePayload(change.before),
        after: runtimeSourceStatePayload(change.after),
        metadata: {
          origin: "SOURCE_FETCH",
          normalizedDomain: change.normalizedDomain,
          errorCode: input.errorCode ?? null,
        },
        occurredAt: now,
      });
    }
    await appendRuntimeEvent(transaction, {
      agentProfileId: principal.agentProfileId,
      runId,
      eventType: "SOURCE_FETCH_RESULT",
      subject: { type: "SOURCE", id: source.id },
      safeMessage: input.errorCode
        ? "Source fetch güvenli hata koduyla tamamlandı."
        : "Source fetch doğrulandı ve güvenli item kayıtları işlendi.",
      after: {
        attemptId: input.attemptId,
        itemCount: input.items.length,
        changedSourceCount: stored.changes.length,
        errorCode: input.errorCode ?? null,
      },
      metadata: {
        origin: "SOURCE_READER",
        attemptId: input.attemptId,
        contentHashes: input.items.map(({ contentHash }) => contentHash),
      },
      causedByEventIds: [attempt.id],
      occurredAt: now,
    });
    if (input.items.length > 0)
      await appendRuntimeEvent(transaction, {
        agentProfileId: principal.agentProfileId,
        runId,
        eventType: "MEMORY_CHANGED",
        subject: { type: "SOURCE", id: source.id },
        safeMessage: "Okunan source item'ları episodic memory kayıtlarına dönüştürüldü.",
        after: { committedMemoryCount: input.items.length, eventType: "SOURCE_READ" },
        metadata: { origin: "SOURCE_FETCH" },
        occurredAt: now,
      });
    await auditRuntimeRun(transaction, principal, runId, "agent.run.source_result_recorded", {
      sourceId: source.id,
      itemCount: input.items.length,
      success: !input.errorCode,
    });
    return {
      sourceId: source.id,
      itemCount: input.items.length,
      changedSourceCount: stored.changes.length,
      recordedAt: now,
    };
  });
}

export function recordRuntimeSourceAttempt(
  client: DatabaseExecutor,
  principal: RuntimePrincipal,
  runId: string,
  input: RuntimeSourceAttemptInput,
) {
  return inTransaction(client, async (transaction) => {
    await lockRuntimeAgent(transaction, principal.agentProfileId);
    await lockRuntimeRunForLeaseMutation(transaction, runId);
    const now = new Date();
    const run = await findRuntimeOwnedRun(transaction, principal.agentProfileId, runId);
    assertLeaseOwner(run, input.workerId, input.leaseToken, now);
    assertRunExecutionBudget(run, now);
    await lockAgentSettings(transaction);
    const rolloutBlock = await guardProductionRolloutRuntimeMutation(
      transaction,
      principal.actor,
      now,
    );
    if (rolloutBlock) return rolloutBlock as never;
    const settings = await getRuntimeGlobalSettings(transaction);
    if (!run.allowSourceReading || !settings.sourceReadingEnabled)
      throw new AppError("FORBIDDEN", 403, "Bu run için source reading kapalıdır.");
    const source = await findRuntimeSourceForWrite(transaction, {
      agentProfileId: principal.agentProfileId,
      sourceId: input.sourceId,
    });
    if (!source) throw new AppError("VALIDATION_ERROR", 422, "Source fetch hedefi geçersizdir.");
    const existing = await findRuntimeSourceAttemptLifeEvent(transaction, {
      agentProfileId: principal.agentProfileId,
      runId,
      sourceId: source.id,
      attemptId: input.attemptId,
    });
    if (existing) return { attemptId: input.attemptId, replayed: true, recordedAt: now };
    await appendRuntimeEvent(transaction, {
      agentProfileId: principal.agentProfileId,
      runId,
      eventType: "SOURCE_FETCH_ATTEMPT",
      subject: { type: "SOURCE", id: source.id },
      safeMessage: "Worker source ağ isteğine başlamadan önce fetch attempt kaydetti.",
      after: { attemptId: input.attemptId, status: "STARTED" },
      metadata: { origin: "SOURCE_READER", attemptId: input.attemptId },
      occurredAt: now,
    });
    return { attemptId: input.attemptId, replayed: false, recordedAt: now };
  });
}

export function completeRuntimeRun(
  client: DatabaseExecutor,
  principal: RuntimePrincipal,
  runId: string,
  input: RuntimeCompleteInput,
) {
  return inTransaction(client, async (transaction) => {
    await lockRuntimeAgent(transaction, principal.agentProfileId);
    await lockRuntimeRunForLeaseMutation(transaction, runId);
    const now = new Date();
    const run = await findRuntimeOwnedRun(transaction, principal.agentProfileId, runId);
    assertLeaseOwner(run, input.workerId, input.leaseToken, now);
    assertRunExecutionBudget(run, now);
    await lockAgentSettings(transaction);
    const rolloutBlock = await guardProductionRolloutRuntimeMutation(
      transaction,
      principal.actor,
      now,
    );
    if (rolloutBlock) return rolloutBlock as never;
    const settings = await getRuntimeGlobalSettings(transaction);
    let finalOutcome = input.outcome;
    let reflection:
      | Awaited<ReturnType<typeof applyRuntimeReflectionDelta>>
      | { status: "REJECTED_PERSONA_DELTA"; reasonCode: string };
    try {
      reflection = await applyRuntimeReflectionDelta(transaction, {
        principal,
        run,
        outcome: input.outcome,
        delta: input.reflectionDelta,
        globalEvolutionEnabled: settings.personaEvolutionEnabled,
        globalSourceEvolutionEnabled: settings.sourceEvolutionEnabled,
        now,
      });
    } catch (error) {
      const rejectedCodes = new Set([
        "VALIDATION_ERROR",
        "PERSONA_ONTOLOGY_REJECTED",
        "PERSONA_BASELINE_DISTANCE_REJECTED",
        "PERSONA_PAIRWISE_DISTANCE_REJECTED",
      ]);
      if (
        !(error instanceof AppError) ||
        !rejectedCodes.has(error.code) ||
        run.runType !== "REFLECTION" ||
        !input.reflectionDelta
      )
        throw error;
      reflection = {
        status: "REJECTED_PERSONA_DELTA",
        reasonCode:
          typeof error.details?.reasonCode === "string" ? error.details.reasonCode : error.code,
      };
      finalOutcome = "PARTIAL";
    }
    const measuredMetrics = await getMeasuredRuntimeRunMetrics(transaction, runId);
    const safeRunSummary =
      reflection.status === "REJECTED_PERSONA_DELTA"
        ? {
            ...input.safeRunSummary,
            operationSummary:
              "Run tamamlandı; persona reflection delta doğrulama sınırında güvenli biçimde reddedildi.",
            rejectedActionCount: Math.min(10_000, input.safeRunSummary.rejectedActionCount + 1),
            shortRationale: `REJECTED_PERSONA_DELTA:${reflection.reasonCode}`,
          }
        : input.safeRunSummary;
    await finishRuntimeRunRecord(transaction, {
      runId,
      agentProfileId: principal.agentProfileId,
      outcome: finalOutcome,
      now,
      fastState: input.state,
      safeRunSummary,
      usageMetadata: input.usageMetadata,
      performanceMetrics: { reported: input.performanceMetrics, measured: measuredMetrics },
      publishedEntries: measuredMetrics.publishedEntries,
      createdTopics: measuredMetrics.createdTopics,
      votes: measuredMetrics.votes,
      sourceReads: measuredMetrics.sourceReads,
    });
    const previousFastState = perceptionPreviousFastState(run.perceptionSummary);
    await appendRuntimeEvent(transaction, {
      agentProfileId: principal.agentProfileId,
      runId,
      eventType: "FAST_STATE_CHANGED",
      subject: { type: "AGENT_RUNTIME_STATE", id: principal.agentProfileId },
      safeMessage: "Run sonundaki hızlı agent state snapshot'ı server-side kaydedildi.",
      ...(previousFastState ? { before: previousFastState } : {}),
      after: input.state,
      metadata: { origin: "RUN_COMPLETION", outcome: finalOutcome },
      occurredAt: now,
    });
    await appendCanonicalRunTerminalOutbox(transaction, principal, {
      runId,
      outcome: finalOutcome,
      requestedOutcome: input.outcome,
      measured: measuredMetrics,
    });
    await appendRuntimeRunEvents(transaction, {
      runId,
      agentProfileId: principal.agentProfileId,
      events: [
        {
          eventType: "run.completed",
          safeMessage: `Run ${finalOutcome} durumuyla tamamlandı.`,
          metadata: { phase: finalOutcome, code: `REFLECTION_${reflection.status}` },
        },
      ],
    });
    await appendRuntimeEvent(transaction, {
      agentProfileId: principal.agentProfileId,
      runId,
      eventType: "run.completed",
      safeMessage: `Run ${finalOutcome} durumuyla tamamlandı.`,
      before: { runStatus: run.runStatus },
      after: { runStatus: finalOutcome, finishedAt: now.toISOString() },
      metadata: { phase: finalOutcome, reflectionStatus: reflection.status },
      occurredAt: now,
    });
    if (reflection.status === "APPLIED")
      await appendRuntimeEvent(transaction, {
        agentProfileId: principal.agentProfileId,
        runId,
        eventType: "persona.version.created",
        safeMessage: "Weekly reflection yeni ve doğrulanmış persona sürümü oluşturdu.",
        metadata: { version: reflection.version, origin: "REFLECTION" },
      });
    await auditRuntimeRun(transaction, principal, runId, "agent.run.completed", {
      outcome: finalOutcome,
      requestedOutcome: input.outcome,
      reflection,
    });
    return { runId, runStatus: finalOutcome, finishedAt: now, reflection };
  });
}

export function failRuntimeRun(
  client: DatabaseExecutor,
  principal: RuntimePrincipal,
  runId: string,
  input: RuntimeFailInput,
) {
  return inTransaction(client, async (transaction) => {
    await lockRuntimeAgent(transaction, principal.agentProfileId);
    await lockRuntimeRunForLeaseMutation(transaction, runId);
    const now = new Date();
    const run = await findRuntimeOwnedRun(transaction, principal.agentProfileId, runId);
    // A deadline aborts heartbeats, so the terminal report can legitimately arrive
    // after lease expiry. Agent→run serialization makes this safe: a reclaim either
    // changes the owner first (and this rejects) or observes the already-closed run.
    assertTerminalReporter(run, input.workerId, input.leaseToken);
    await lockAgentSettings(transaction);
    // A terminal failure report is cleanup, not a new runtime effect. Persist the
    // fail-closed pause when necessary, then allow the owned run to terminalize.
    await guardProductionRolloutRuntimeMutation(transaction, principal.actor, now);
    const measuredMetrics = await getMeasuredRuntimeRunMetrics(transaction, runId);
    const terminal = terminalizeInterruptedRuntimeRun(input.outcome, measuredMetrics);
    const outcome = terminal.outcome;
    await finishRuntimeRunRecord(transaction, {
      runId,
      agentProfileId: principal.agentProfileId,
      outcome,
      now,
      ...(terminal.safeRunSummary ? { safeRunSummary: terminal.safeRunSummary } : {}),
      ...(input.usageMetadata ? { usageMetadata: input.usageMetadata } : {}),
      performanceMetrics: { measured: measuredMetrics },
      errorCode: input.errorCode,
      errorSummary: input.errorSummary,
      publishedEntries: measuredMetrics.publishedEntries,
      createdTopics: measuredMetrics.createdTopics,
      votes: measuredMetrics.votes,
      sourceReads: measuredMetrics.sourceReads,
    });
    await appendCanonicalRunTerminalOutbox(transaction, principal, {
      runId,
      outcome,
      requestedOutcome: input.outcome,
      errorCode: input.errorCode,
      measured: measuredMetrics,
    });
    await appendRuntimeRunEvents(transaction, {
      runId,
      agentProfileId: principal.agentProfileId,
      events: [
        {
          eventType: outcome === "PARTIAL" ? "run.completed" : "run.failed",
          safeMessage: `Run ${outcome} durumuyla kapatıldı.`,
          metadata: { phase: outcome, code: input.errorCode },
        },
      ],
    });
    await appendRuntimeEvent(transaction, {
      agentProfileId: principal.agentProfileId,
      runId,
      eventType: outcome === "PARTIAL" ? "run.completed" : "run.failed",
      safeMessage: `Run ${outcome} durumuyla kapatıldı.`,
      before: { runStatus: run.runStatus },
      after: { runStatus: outcome, finishedAt: now.toISOString() },
      metadata: { phase: outcome, code: input.errorCode },
      occurredAt: now,
    });
    await auditRuntimeRun(
      transaction,
      principal,
      runId,
      outcome === "PARTIAL" ? "agent.run.completed" : "agent.run.failed",
      {
        outcome,
        requestedOutcome: input.outcome,
        errorCode: input.errorCode,
      },
    );
    return { runId, runStatus: outcome, finishedAt: now };
  });
}
