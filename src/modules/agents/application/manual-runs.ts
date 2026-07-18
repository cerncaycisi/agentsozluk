import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor, TransactionClient } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { appendAuditLog } from "@/modules/audit";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { requireAgentAdminInTransaction } from "@/modules/agents/application/authorization";
import { istanbulLocalDate } from "@/modules/agents/application/scheduler";
import {
  calculateRuntimeCapacity,
  estimateRuntimeCompletion,
  runtimeFingerprint,
} from "@/modules/agents/domain/capacity";
import { circuitBreakerConfigSchema } from "@/modules/agents/domain/circuit-breaker";
import {
  isWriteCapableAgentRunType,
  planManualDailyCatchUp,
} from "@/modules/agents/domain/manual-runs";
import {
  appendRuntimeEvent,
  findAgentForMutation,
  getGlobalSettingsRecord,
  lockAgentProfile,
} from "@/modules/agents/repository/control-plane";
import {
  cancelAgentRunRecord,
  createRetryRunRecord,
  createManualRunRecord,
  findAgentRunForCommand,
  getManualCatchUpFacts,
  getAgentRunDetailRecord,
  getBulkRunPreviewMetrics,
  listAgentProfileIdsForBulkRunCommand,
  listBulkRunAgents,
  listBulkRunCommandCandidates,
  listAgentRunsRecord,
} from "@/modules/agents/repository/manual-runs";
import {
  getCapacityPlanningMetrics,
  getLatestRuntimeFingerprintRecord,
  getRuntimeOperationalMetrics,
} from "@/modules/agents/repository/capacity";
import { istanbulDayBounds } from "@/modules/agents/repository/scheduler";
import { lockRuntimeRunForLeaseMutation } from "@/modules/agents/repository/runtime";
import type {
  AgentRunCommandInput,
  BulkAgentRunInput,
  BulkAgentRunPreviewInput,
  CancelPendingAgentRunsInput,
  CancelPendingGlobalAgentRunsInput,
  GracefulStopAgentRunsInput,
  GracefulStopGlobalAgentRunsInput,
  ManualAgentRunInput,
} from "@/modules/agents/validation/scheduling-schemas";
import { appendOutboxEvent } from "@/modules/outbox";
import { RUNTIME_PROMPT_PROFILE_HASH } from "@/runtime/prompt-profile";

function isNonPublishingRun(runType: ManualAgentRunInput["runType"]): boolean {
  return ["READ_ONLY", "DRY_RUN", "REFLECTION", "SOURCE_REFRESH"].includes(runType);
}

type ManualRunAgent = {
  id: string;
  currentPersonaVersionId: string;
  manualTimeoutSeconds: number;
};

interface AgentRunCommandDependencies {
  /** Test seam for holding the serialized command after its authoritative re-read. */
  afterRunLocked?: () => Promise<void>;
}

async function appendCanonicalRunQueuedOutbox(
  transaction: TransactionClient,
  actor: ActorContext,
  run: {
    id: string;
    agentProfileId: string;
    runType: string;
    queuePriority: string;
    runStatus: string;
    trigger: string;
    availableAt: Date;
    desiredEntryMin: number;
    desiredEntryMax: number;
    parentRunId: string | null;
  },
): Promise<void> {
  await appendOutboxEvent(transaction, {
    eventType: "agent.run.queued",
    aggregateType: "AgentRun",
    aggregateId: run.id,
    actorId: actor.actorId,
    actorKind: actor.actorKind,
    requestId: actor.requestId,
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

interface BulkAgentRunControlDependencies {
  /** Test seam for proving lease/action callers wait behind all profile locks. */
  afterProfilesLocked?: () => Promise<void>;
}

interface BulkAgentRunCreateDependencies {
  /** Test seam for proving competing profile mutations wait behind bulk creation. */
  afterProfilesLocked?: () => Promise<void>;
}

const BULK_RUN_METADATA_ID_LIMIT = 100;

async function resolveManualCatchUpPlans(
  transaction: Parameters<typeof getManualCatchUpFacts>[0],
  agents: ManualRunAgent[],
  now: Date,
) {
  const localDate = istanbulLocalDate(now);
  const facts = await getManualCatchUpFacts(transaction, {
    agentProfileIds: agents.map(({ id }) => id),
    localDate,
  });
  return {
    localDate,
    plans: agents.map((agent) => {
      const fact = facts.get(agent.id);
      if (!fact)
        throw new AppError(
          "VALIDATION_ERROR",
          409,
          "DAILY_CATCH_UP için agent'ın bugünkü günlük planı bulunmalıdır.",
          undefined,
          undefined,
          { agentProfileId: agent.id, localDate: localDate.toISOString().slice(0, 10) },
        );
      return { agent, plan: planManualDailyCatchUp(fact) };
    }),
  };
}

function catchUpAvailableAt(input: ManualAgentRunInput, now: Date, localDate: Date): Date {
  const availableAt = input.availableAt ?? now;
  if (availableAt >= istanbulDayBounds(localDate).end)
    throw new AppError(
      "VALIDATION_ERROR",
      422,
      "DAILY_CATCH_UP bugünün İstanbul günü içinde çalıştırılmalıdır.",
      { availableAt: ["Bugünün İstanbul günü bittikten sonraya planlanamaz."] },
    );
  return availableAt;
}

async function createManualCatchUpRunRecords(
  transaction: Parameters<typeof createManualRunRecord>[0],
  input: {
    actor: ActorContext;
    runInput: ManualAgentRunInput;
    agent: ManualRunAgent;
    desiredEntryTargets: number[];
    availableAt: Date;
    idempotencyPrefix?: string;
    trigger?: string;
    queuePriority: "MANUAL_SINGLE" | "EMERGENCY_ADMIN" | "SCHEDULED_CONTENT";
  },
) {
  const runs = [];
  for (const [index, desiredEntryMax] of input.desiredEntryTargets.entries())
    runs.push(
      await createManualRunRecord(transaction, {
        agentProfileId: input.agent.id,
        personaVersionId: input.agent.currentPersonaVersionId,
        requestedById: input.actor.actorId,
        requestId: input.actor.requestId,
        idempotencySuffix: `${input.idempotencyPrefix ? `${input.idempotencyPrefix}:` : ""}catch-up:${index}`,
        ...(input.trigger ? { trigger: input.trigger } : {}),
        runType: "DAILY_CATCH_UP",
        queuePriority: input.queuePriority,
        availableAt: input.availableAt,
        timeoutSeconds: input.agent.manualTimeoutSeconds,
        desiredEntryMin: Math.max(1, desiredEntryMax - 1),
        desiredEntryMax,
        allowTopicCreation: input.runInput.allowTopicCreation,
        allowVoting: input.runInput.allowVoting,
        allowFollowing: input.runInput.allowFollowing,
        allowSourceReading: input.runInput.allowSourceReading,
        saturationOverride: input.runInput.saturationOverride,
        dailyMaximumOverride: input.runInput.dailyMaximumOverride,
        provocationOverride: input.runInput.provocationOverride,
        ...(input.runInput.adminInstruction
          ? { adminInstruction: input.runInput.adminInstruction }
          : {}),
      }),
    );
  return runs;
}

export function createManualAgentRun(
  client: DatabaseExecutor,
  actor: ActorContext,
  agentProfileId: string,
  input: ManualAgentRunInput,
  now = new Date(),
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    await lockAgentProfile(transaction, agentProfileId);
    const [agent, settings] = await Promise.all([
      findAgentForMutation(transaction, agentProfileId),
      getGlobalSettingsRecord(transaction),
    ]);
    if (!agent) throw new AppError("AGENT_NOT_FOUND", 404, "Agent bulunamadı.");
    if (agent.lifecycleStatus !== "ACTIVE" || !agent.currentPersonaVersion) {
      throw new AppError("AGENT_LIFECYCLE_INVALID", 409, "Yalnız ACTIVE agent kuyruğa alınabilir.");
    }
    if (input.runType === "DAILY_CATCH_UP") {
      const resolved = await resolveManualCatchUpPlans(
        transaction,
        [
          {
            id: agent.id,
            currentPersonaVersionId: agent.currentPersonaVersion.id,
            manualTimeoutSeconds: agent.manualTimeoutSeconds,
          },
        ],
        now,
      );
      const catchUp = resolved.plans[0]!;
      const runs = await createManualCatchUpRunRecords(transaction, {
        actor,
        runInput: input,
        agent: catchUp.agent,
        desiredEntryTargets: catchUp.plan.desiredEntryTargets,
        availableAt: catchUpAvailableAt(input, now, resolved.localDate),
        queuePriority: input.priority === "EMERGENCY" ? "EMERGENCY_ADMIN" : "MANUAL_SINGLE",
      });
      await transaction.agentRuntimeState.updateMany({
        where: { agentProfileId, todayDate: resolved.localDate },
        data: { todayPublishedEntries: catchUp.plan.activePublishedEntries },
      });
      const metadata = {
        agentProfileId,
        runType: input.runType,
        runCount: runs.length,
        localDate: resolved.localDate.toISOString().slice(0, 10),
        targetEntries: catchUp.plan.targetEntries,
        activePublishedEntries: catchUp.plan.activePublishedEntries,
        pendingReservedEntries: catchUp.plan.pendingReservedEntries,
        newlyReservedEntries: catchUp.plan.remainingEntries,
        desiredEntryTargets: catchUp.plan.desiredEntryTargets,
        dailyMaximumOverride: input.dailyMaximumOverride,
        provocationOverride: input.provocationOverride,
        saturationOverride: input.saturationOverride,
      };
      await appendAuditLog(transaction, {
        actorId: actor.actorId,
        action: "agent.run.catch_up_queued",
        entityType: "AgentProfile",
        entityId: agentProfileId,
        requestId: actor.requestId,
        metadata: {
          actorKind: actor.actorKind,
          before: { runCount: 0 },
          after: { runCount: runs.length, runStatus: "QUEUED" },
          reason: "Manual catch-up work queued by human administrator.",
          ...metadata,
        },
      });
      for (const run of runs)
        await appendOutboxEvent(transaction, {
          eventType: "agent.run.queued",
          aggregateType: "AgentRun",
          aggregateId: run.id,
          actorId: actor.actorId,
          actorKind: actor.actorKind,
          requestId: actor.requestId,
          payload: {
            ...metadata,
            runId: run.id,
            desiredEntryMin: run.desiredEntryMin,
            desiredEntryMax: run.desiredEntryMax,
          },
        });
      await appendRuntimeEvent(transaction, {
        agentProfileId,
        eventType: "run.catch_up_queued",
        safeMessage:
          runs.length === 0
            ? "Bugünkü ACTIVE yayın ve pending rezervler günlük hedefi zaten karşılıyor."
            : `${runs.length} manual catch-up run bugünkü kalan hedef için kuyruğa alındı.`,
        metadata,
      });
      return { runs, count: runs.length, run: runs[0] ?? null, catchUp: metadata };
    }
    const nonPublishing = isNonPublishingRun(input.runType);
    const entryTarget = nonPublishing ? 0 : input.entryTarget;
    const timeoutSeconds =
      input.runType === "REFLECTION"
        ? settings.reflectionTimeoutSeconds
        : input.runType === "SOURCE_REFRESH"
          ? settings.sourceRefreshTimeoutSeconds
          : agent.manualTimeoutSeconds;
    const run = await createManualRunRecord(transaction, {
      agentProfileId,
      personaVersionId: agent.currentPersonaVersion.id,
      requestedById: actor.actorId,
      requestId: actor.requestId,
      runType: input.runType,
      queuePriority: input.priority === "EMERGENCY" ? "EMERGENCY_ADMIN" : "MANUAL_SINGLE",
      availableAt: input.availableAt ?? new Date(),
      timeoutSeconds,
      desiredEntryMin: entryTarget,
      desiredEntryMax: entryTarget,
      allowTopicCreation: !nonPublishing && input.allowTopicCreation,
      allowVoting: !nonPublishing && input.allowVoting,
      allowFollowing: !nonPublishing && input.allowFollowing,
      allowSourceReading: input.allowSourceReading,
      saturationOverride: input.saturationOverride,
      dailyMaximumOverride: input.dailyMaximumOverride,
      provocationOverride: input.provocationOverride,
      ...(input.adminInstruction ? { adminInstruction: input.adminInstruction } : {}),
    });
    const metadata = {
      agentProfileId,
      runType: run.runType,
      queuePriority: run.queuePriority,
      availableAt: run.availableAt.toISOString(),
      dailyMaximumOverride: run.dailyMaximumOverride,
      provocationOverride: run.provocationOverride,
      saturationOverride: run.saturationOverride,
    };
    await appendAuditLog(transaction, {
      actorId: actor.actorId,
      action: "agent.run.queued",
      entityType: "AgentRun",
      entityId: run.id,
      requestId: actor.requestId,
      metadata: {
        actorKind: actor.actorKind,
        before: { runStatus: null },
        after: { runStatus: run.runStatus, runId: run.id },
        reason: `Manual ${run.runType} run queued by human administrator.`,
        ...metadata,
      },
    });
    await appendOutboxEvent(transaction, {
      eventType: "agent.run.queued",
      aggregateType: "AgentRun",
      aggregateId: run.id,
      actorId: actor.actorId,
      actorKind: actor.actorKind,
      requestId: actor.requestId,
      payload: metadata,
    });
    await appendRuntimeEvent(transaction, {
      agentProfileId,
      eventType: "run.queued",
      safeMessage: "Manual agent run kuyruğa alındı.",
      metadata: { runId: run.id, runType: run.runType },
    });
    return { ...run, runs: [run], count: 1, run, catchUp: null };
  });
}

export function listAgentRuns(
  client: DatabaseExecutor,
  actor: ActorContext,
  agentProfileId: string,
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    return listAgentRunsRecord(transaction, agentProfileId);
  });
}

function bulkSelection(input: BulkAgentRunPreviewInput | BulkAgentRunInput): string[] | undefined {
  return input.allActive ? undefined : input.agentIds;
}

export function previewBulkAgentRun(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: BulkAgentRunPreviewInput,
  now = new Date(),
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    const localDate = istanbulLocalDate(now);
    const [agents, metrics, planning, fingerprintRecord] = await Promise.all([
      listBulkRunAgents(transaction, bulkSelection(input)),
      getBulkRunPreviewMetrics(transaction),
      getCapacityPlanningMetrics(transaction, localDate),
      getLatestRuntimeFingerprintRecord(transaction),
    ]);
    if (!input.allActive && agents.length !== input.agentIds?.length)
      throw new AppError(
        "AGENT_NOT_FOUND",
        404,
        "Seçili ACTIVE agent listesi eksik veya geçersiz.",
      );
    let runCount = agents.length;
    let addedPublishedMin = isNonPublishingRun(input.run.runType)
      ? 0
      : agents.length * input.run.entryTarget;
    let addedPublishedMax = addedPublishedMin;
    let catchUpPlans: Awaited<ReturnType<typeof resolveManualCatchUpPlans>>["plans"] = [];
    if (input.run.runType === "DAILY_CATCH_UP") {
      const resolved = await resolveManualCatchUpPlans(
        transaction,
        agents.map((agent) => ({
          ...agent,
          currentPersonaVersionId: agent.currentPersonaVersionId!,
        })),
        now,
      );
      catchUpPlans = resolved.plans;
      runCount = catchUpPlans.reduce((sum, item) => sum + item.plan.desiredEntryTargets.length, 0);
      addedPublishedMax = catchUpPlans.reduce((sum, item) => sum + item.plan.remainingEntries, 0);
      addedPublishedMin = catchUpPlans.reduce(
        (sum, item) =>
          sum +
          item.plan.desiredEntryTargets.reduce(
            (targetSum, target) => targetSum + Math.max(1, target - 1),
            0,
          ),
        0,
      );
    }
    const observedFingerprint = runtimeFingerprint(fingerprintRecord?.usageMetadata);
    const observedCodexVersion =
      observedFingerprint.codexVersion ?? metrics.capability?.codexVersion;
    const fingerprint = {
      ...(observedCodexVersion ? { codexVersion: observedCodexVersion } : {}),
      promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
    };
    const configuredConcurrency = metrics.settings.codexConcurrency === 2 ? 2 : 1;
    const beforeCapacity = calculateRuntimeCapacity({
      capability: metrics.capability,
      ...planning,
      configuredConcurrency,
      degradedMode: metrics.settings.degradedMode,
      now,
      ...fingerprint,
    });
    const concurrency = beforeCapacity.effectiveConcurrency === 2 ? 2 : 1;
    const breakerConfig = circuitBreakerConfigSchema.parse(metrics.settings.circuitBreakerConfig);
    const operational = await getRuntimeOperationalMetrics(transaction, {
      now,
      concurrency,
      config: breakerConfig,
    });
    const benchmarkFresh = beforeCapacity.benchmark?.stale === false;
    const p75DurationMs = benchmarkFresh ? (metrics.capability?.p75DurationMs ?? null) : null;
    const existingWorkCompletion = p75DurationMs
      ? runCount === 0
        ? { durationMs: 0, estimatedAt: now }
        : estimateRuntimeCompletion({
            now,
            p75DurationMs,
            benchmarkFresh,
            concurrency,
            eligibleQueuedRuns: operational.eligibleQueuedRunCount,
            activeRunStartedAts: operational.activeRunStartedAts,
          })
      : null;
    const requestedWorkCompletion = p75DurationMs
      ? runCount === 0
        ? { durationMs: 0, estimatedAt: now }
        : estimateRuntimeCompletion({
            now,
            p75DurationMs,
            benchmarkFresh,
            concurrency,
            eligibleQueuedRuns: operational.eligibleQueuedRunCount + runCount,
            activeRunStartedAts: operational.activeRunStartedAts,
          })
      : null;
    const afterCapacity = calculateRuntimeCapacity({
      capability: metrics.capability,
      ...planning,
      plannedRuns: planning.plannedRuns + runCount,
      estimatedPublishedMin: planning.estimatedPublishedMin + addedPublishedMin,
      estimatedPublishedMax: planning.estimatedPublishedMax + addedPublishedMax,
      configuredConcurrency,
      degradedMode: metrics.settings.degradedMode,
      now,
      ...fingerprint,
    });
    const targetMissRiskChange =
      beforeCapacity.projectedShortfallEntries === null ||
      afterCapacity.projectedShortfallEntries === null
        ? {
            estimateStatus: "UNKNOWN" as const,
            beforeProjectedShortfallEntries: null,
            afterProjectedShortfallEntries: null,
            deltaProjectedShortfallEntries: null,
            direction: "UNKNOWN" as const,
          }
        : {
            estimateStatus: "ESTIMATED" as const,
            beforeProjectedShortfallEntries: beforeCapacity.projectedShortfallEntries,
            afterProjectedShortfallEntries: afterCapacity.projectedShortfallEntries,
            deltaProjectedShortfallEntries:
              afterCapacity.projectedShortfallEntries - beforeCapacity.projectedShortfallEntries,
            direction:
              afterCapacity.projectedShortfallEntries > beforeCapacity.projectedShortfallEntries
                ? ("INCREASED" as const)
                : afterCapacity.projectedShortfallEntries < beforeCapacity.projectedShortfallEntries
                  ? ("DECREASED" as const)
                  : ("UNCHANGED" as const),
          };
    return {
      runCount,
      existingQueueLength: metrics.queueLength,
      eligibleQueueLength: operational.eligibleQueuedRunCount,
      measuredP75DurationMs: p75DurationMs,
      estimateStatus: p75DurationMs ? ("ESTIMATED" as const) : ("UNKNOWN" as const),
      estimateBasis: p75DurationMs ? ("MEASURED_P75" as const) : ("UNKNOWN" as const),
      estimateReason: p75DurationMs
        ? null
        : metrics.capability
          ? "BENCHMARK_STALE"
          : "BENCHMARK_MISSING",
      estimateDisclaimer: "Ölçüme dayalı tahmindir; tamamlanma garantisi değildir.",
      estimatedStartAt: existingWorkCompletion?.estimatedAt ?? null,
      estimatedCompleteAt: requestedWorkCompletion?.estimatedAt ?? null,
      estimatedScheduledDelayMs: p75DurationMs
        ? Math.ceil(runCount / concurrency) * p75DurationMs
        : null,
      targetMissRiskChange,
      workerUtilization: operational.configuredWindowUtilization,
      workerUtilizationWindowMinutes: breakerConfig.utilizationWindowMinutes,
      workerUtilizationMeasuredAt: now,
      concurrency,
      saturationOverride: input.run.saturationOverride,
      dailyMaximumOverride: input.run.dailyMaximumOverride,
      provocationOverride: input.run.provocationOverride,
      oldestQueuedAt: operational.oldestQueuedAt,
      capacityStatusBefore: beforeCapacity.capacityStatus,
      capacityStatusAfter: afterCapacity.capacityStatus,
      catchUp:
        input.run.runType === "DAILY_CATCH_UP"
          ? catchUpPlans.map(({ agent, plan }) => ({ agentProfileId: agent.id, ...plan }))
          : null,
    };
  });
}

export function createBulkAgentRuns(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: BulkAgentRunInput,
  now = new Date(),
  dependencies: BulkAgentRunCreateDependencies = {},
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    const initialAgents = await listBulkRunAgents(transaction, bulkSelection(input));
    if (!input.allActive && initialAgents.length !== input.agentIds?.length)
      throw new AppError(
        "AGENT_NOT_FOUND",
        404,
        "Seçili ACTIVE agent listesi eksik veya geçersiz.",
      );
    const profileIds = initialAgents.map(({ id }) => id).sort();
    for (const profileId of profileIds) await lockAgentProfile(transaction, profileId);
    await dependencies.afterProfilesLocked?.();
    const [agents, settings] = await Promise.all([
      listBulkRunAgents(transaction, profileIds),
      getGlobalSettingsRecord(transaction),
    ]);
    if (agents.length !== initialAgents.length)
      throw new AppError(
        "AGENT_LIFECYCLE_INVALID",
        409,
        "Bulk run sırasında ACTIVE agent veya current persona state değişti; yeniden önizleyin.",
      );
    if (input.run.runType === "DAILY_CATCH_UP") {
      const resolved = await resolveManualCatchUpPlans(
        transaction,
        agents.map((agent) => ({
          ...agent,
          currentPersonaVersionId: agent.currentPersonaVersionId!,
        })),
        now,
      );
      const availableAt = catchUpAvailableAt(input.run, now, resolved.localDate);
      const runs = [];
      for (const { agent, plan } of resolved.plans) {
        runs.push(
          ...(await createManualCatchUpRunRecords(transaction, {
            actor,
            runInput: input.run,
            agent,
            desiredEntryTargets: plan.desiredEntryTargets,
            availableAt,
            idempotencyPrefix: agent.id,
            trigger: "ADMIN_BULK",
            queuePriority:
              input.run.priority === "EMERGENCY" ? "EMERGENCY_ADMIN" : "SCHEDULED_CONTENT",
          })),
        );
        await transaction.agentRuntimeState.updateMany({
          where: { agentProfileId: agent.id, todayDate: resolved.localDate },
          data: { todayPublishedEntries: plan.activePublishedEntries },
        });
      }
      const perAgent = resolved.plans.map(({ agent, plan }) => ({
        agentProfileId: agent.id,
        targetEntries: plan.targetEntries,
        activePublishedEntries: plan.activePublishedEntries,
        pendingReservedEntries: plan.pendingReservedEntries,
        newlyReservedEntries: plan.remainingEntries,
        runCount: plan.desiredEntryTargets.length,
        desiredEntryTargets: plan.desiredEntryTargets,
      }));
      const metadata = {
        runCount: runs.length,
        allActive: input.allActive,
        runType: input.run.runType,
        localDate: resolved.localDate.toISOString().slice(0, 10),
        queuePriority: input.run.priority === "EMERGENCY" ? "EMERGENCY_ADMIN" : "SCHEDULED_CONTENT",
        perAgent,
      };
      await appendAuditLog(transaction, {
        actorId: actor.actorId,
        action: "agent.run.bulk_queued",
        entityType: "AgentRun",
        entityId: null,
        requestId: actor.requestId,
        metadata: {
          actorKind: actor.actorKind,
          before: { runCount: 0 },
          after: { runCount: runs.length, runStatus: "QUEUED" },
          reason: "Bulk catch-up work queued by human administrator.",
          ...metadata,
        },
      });
      for (const run of runs) await appendCanonicalRunQueuedOutbox(transaction, actor, run);
      await appendRuntimeEvent(transaction, {
        eventType: "run.bulk_queued",
        safeMessage:
          runs.length === 0
            ? "Seçili agent'ların bugünkü hedefleri ACTIVE yayın ve pending rezervlerle karşılanıyor."
            : `${runs.length} manual catch-up run bulk kuyruğa alındı.`,
        metadata,
      });
      return { runs, count: runs.length, catchUp: { ...metadata, perAgent } };
    }
    const nonPublishing = isNonPublishingRun(input.run.runType);
    const runs = [];
    for (const agent of agents) {
      const entryTarget = nonPublishing ? 0 : input.run.entryTarget;
      const timeoutSeconds =
        input.run.runType === "REFLECTION"
          ? settings.reflectionTimeoutSeconds
          : input.run.runType === "SOURCE_REFRESH"
            ? settings.sourceRefreshTimeoutSeconds
            : agent.manualTimeoutSeconds;
      runs.push(
        await createManualRunRecord(transaction, {
          agentProfileId: agent.id,
          personaVersionId: agent.currentPersonaVersionId!,
          requestedById: actor.actorId,
          requestId: actor.requestId,
          idempotencySuffix: agent.id,
          trigger: "ADMIN_BULK",
          runType: input.run.runType,
          queuePriority:
            input.run.priority === "EMERGENCY" ? "EMERGENCY_ADMIN" : "SCHEDULED_CONTENT",
          availableAt: input.run.availableAt ?? new Date(),
          timeoutSeconds,
          desiredEntryMin: entryTarget,
          desiredEntryMax: entryTarget,
          allowTopicCreation: !nonPublishing && input.run.allowTopicCreation,
          allowVoting: !nonPublishing && input.run.allowVoting,
          allowFollowing: !nonPublishing && input.run.allowFollowing,
          allowSourceReading: input.run.allowSourceReading,
          saturationOverride: input.run.saturationOverride,
          dailyMaximumOverride: input.run.dailyMaximumOverride,
          provocationOverride: input.run.provocationOverride,
          ...(input.run.adminInstruction ? { adminInstruction: input.run.adminInstruction } : {}),
        }),
      );
    }
    await appendAuditLog(transaction, {
      actorId: actor.actorId,
      action: "agent.run.bulk_queued",
      entityType: "AgentRun",
      entityId: null,
      requestId: actor.requestId,
      metadata: {
        actorKind: actor.actorKind,
        before: { runCount: 0 },
        after: { runCount: runs.length, runStatus: "QUEUED" },
        reason: `Bulk ${input.run.runType} runs queued by human administrator.`,
        runCount: runs.length,
        allActive: input.allActive,
        runType: input.run.runType,
        queuePriority: input.run.priority === "EMERGENCY" ? "EMERGENCY_ADMIN" : "SCHEDULED_CONTENT",
      },
    });
    for (const run of runs) await appendCanonicalRunQueuedOutbox(transaction, actor, run);
    await appendRuntimeEvent(transaction, {
      eventType: "run.bulk_queued",
      safeMessage: `${runs.length} agent run bulk kuyruğa alındı.`,
      metadata: { runCount: runs.length, runType: input.run.runType },
    });
    return { runs, count: runs.length };
  });
}

type BulkAgentRunControlCommand = "CANCEL_PENDING_WRITE" | "GRACEFUL_STOP_ACTIVE";

function bulkAgentRunControlDescriptor(command: BulkAgentRunControlCommand) {
  return command === "CANCEL_PENDING_WRITE"
    ? {
        beforeStatus: "QUEUED" as const,
        afterStatus: "CANCELLED" as const,
        auditAction: "agent.run.bulk_pending_cancelled",
        outboxEventType: "agent.run.bulk_pending_cancelled" as const,
        runtimeEventType: "run.bulk_pending_cancelled",
        safeMessage: "Pending write-capable agent run'lar toplu olarak iptal edildi.",
      }
    : {
        beforeStatus: "RUNNING" as const,
        afterStatus: "CANCEL_REQUESTED" as const,
        auditAction: "agent.run.bulk_stop_requested",
        outboxEventType: "agent.run.bulk_stop_requested" as const,
        runtimeEventType: "run.bulk_stop_requested",
        safeMessage: "Active agent run'lar için toplu graceful stop istendi.",
      };
}

function executeBulkAgentRunControl(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: { reason: string },
  command: BulkAgentRunControlCommand,
  agentProfileId: string | null,
  dependencies: BulkAgentRunControlDependencies = {},
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    const profileIds = agentProfileId
      ? [agentProfileId]
      : (await listAgentProfileIdsForBulkRunCommand(transaction)).map(({ id }) => id);
    for (const profileId of profileIds) await lockAgentProfile(transaction, profileId);
    if (agentProfileId && !(await findAgentForMutation(transaction, agentProfileId)))
      throw new AppError("AGENT_NOT_FOUND", 404, "Agent bulunamadı.");
    await dependencies.afterProfilesLocked?.();

    const candidates = await listBulkRunCommandCandidates(transaction, {
      command,
      ...(agentProfileId ? { agentProfileId } : {}),
    });
    const changedRunIds: string[] = [];
    const now = new Date();
    for (const candidate of candidates) {
      await lockRuntimeRunForLeaseMutation(transaction, candidate.id);
      const run = await findAgentRunForCommand(transaction, candidate.id);
      if (!run) continue;
      const eligible =
        command === "CANCEL_PENDING_WRITE"
          ? run.runStatus === "QUEUED" && isWriteCapableAgentRunType(run.runType)
          : run.runStatus === "RUNNING";
      if (!eligible) continue;
      const updated = await cancelAgentRunRecord(
        transaction,
        run.id,
        command === "GRACEFUL_STOP_ACTIVE",
        now,
      );
      changedRunIds.push(updated.id);
    }

    const descriptor = bulkAgentRunControlDescriptor(command);
    const boundedRunIds = changedRunIds.slice(0, BULK_RUN_METADATA_ID_LIMIT);
    const summary = {
      scope: agentProfileId ? ("AGENT" as const) : ("GLOBAL" as const),
      ...(agentProfileId ? { agentProfileId } : {}),
      before: { status: descriptor.beforeStatus, count: candidates.length },
      after: { status: descriptor.afterStatus, count: changedRunIds.length },
      count: changedRunIds.length,
      runIds: boundedRunIds,
      omittedRunIdCount: changedRunIds.length - boundedRunIds.length,
    };
    await appendAuditLog(transaction, {
      actorId: actor.actorId,
      action: descriptor.auditAction,
      entityType: agentProfileId ? "AgentProfile" : "AgentRunBulkCommand",
      entityId: agentProfileId,
      requestId: actor.requestId,
      metadata: { actorKind: actor.actorKind, ...summary, reason: input.reason },
    });
    await appendOutboxEvent(transaction, {
      eventType: descriptor.outboxEventType,
      aggregateType: "AgentRunBulkCommand",
      aggregateId: actor.requestId,
      actorId: actor.actorId,
      actorKind: actor.actorKind,
      requestId: actor.requestId,
      payload: summary,
    });
    await appendRuntimeEvent(transaction, {
      ...(agentProfileId ? { agentProfileId } : {}),
      eventType: descriptor.runtimeEventType,
      safeMessage: descriptor.safeMessage,
      metadata: summary,
    });
    return summary;
  });
}

export function cancelPendingWriteAgentRuns(
  client: DatabaseExecutor,
  actor: ActorContext,
  agentProfileId: string,
  input: CancelPendingAgentRunsInput,
  dependencies: BulkAgentRunControlDependencies = {},
) {
  return executeBulkAgentRunControl(
    client,
    actor,
    input,
    "CANCEL_PENDING_WRITE",
    agentProfileId,
    dependencies,
  );
}

export function cancelAllPendingWriteAgentRuns(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: CancelPendingGlobalAgentRunsInput,
  dependencies: BulkAgentRunControlDependencies = {},
) {
  return executeBulkAgentRunControl(
    client,
    actor,
    input,
    "CANCEL_PENDING_WRITE",
    null,
    dependencies,
  );
}

export function gracefullyStopActiveAgentRuns(
  client: DatabaseExecutor,
  actor: ActorContext,
  agentProfileId: string,
  input: GracefulStopAgentRunsInput,
  dependencies: BulkAgentRunControlDependencies = {},
) {
  return executeBulkAgentRunControl(
    client,
    actor,
    input,
    "GRACEFUL_STOP_ACTIVE",
    agentProfileId,
    dependencies,
  );
}

export function gracefullyStopAllActiveAgentRuns(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: GracefulStopGlobalAgentRunsInput,
  dependencies: BulkAgentRunControlDependencies = {},
) {
  return executeBulkAgentRunControl(
    client,
    actor,
    input,
    "GRACEFUL_STOP_ACTIVE",
    null,
    dependencies,
  );
}

export function cancelAgentRun(
  client: DatabaseExecutor,
  actor: ActorContext,
  runId: string,
  input: AgentRunCommandInput,
  dependencies: AgentRunCommandDependencies = {},
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    const snapshot = await findAgentRunForCommand(transaction, runId);
    if (!snapshot) throw new AppError("AGENT_RUN_NOT_FOUND", 404, "Agent run bulunamadı.");
    await lockAgentProfile(transaction, snapshot.agentProfileId);
    await lockRuntimeRunForLeaseMutation(transaction, runId);
    const run = await findAgentRunForCommand(transaction, runId);
    if (!run) throw new AppError("AGENT_RUN_NOT_FOUND", 404, "Agent run bulunamadı.");
    if (!["QUEUED", "RUNNING"].includes(run.runStatus))
      throw new AppError("AGENT_RUN_LEASE_INVALID", 409, "Bu run iptal edilebilir durumda değil.");
    await dependencies.afterRunLocked?.();
    const updated = await cancelAgentRunRecord(
      transaction,
      runId,
      run.runStatus === "RUNNING",
      new Date(),
    );
    await appendAuditLog(transaction, {
      actorId: actor.actorId,
      action: "agent.run.cancel_requested",
      entityType: "AgentRun",
      entityId: runId,
      requestId: actor.requestId,
      metadata: {
        actorKind: actor.actorKind,
        before: { runStatus: run.runStatus },
        after: { runStatus: updated.runStatus },
        reason: input.reason,
        previousStatus: run.runStatus,
        nextStatus: updated.runStatus,
      },
    });
    return updated;
  });
}

export function retryAgentRun(
  client: DatabaseExecutor,
  actor: ActorContext,
  runId: string,
  input: AgentRunCommandInput,
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    const snapshot = await findAgentRunForCommand(transaction, runId);
    if (!snapshot) throw new AppError("AGENT_RUN_NOT_FOUND", 404, "Agent run bulunamadı.");
    await lockAgentProfile(transaction, snapshot.agentProfileId);
    await lockRuntimeRunForLeaseMutation(transaction, runId);
    const run = await findAgentRunForCommand(transaction, runId);
    if (!run) throw new AppError("AGENT_RUN_NOT_FOUND", 404, "Agent run bulunamadı.");
    if (!["FAILED", "TIMED_OUT", "CANCELLED", "PARTIAL"].includes(run.runStatus))
      throw new AppError("AGENT_RUN_LEASE_INVALID", 409, "Bu run retry edilebilir durumda değil.");
    const retry = await createRetryRunRecord(transaction, {
      run,
      requestedById: actor.actorId,
      requestId: actor.requestId,
    });
    await appendAuditLog(transaction, {
      actorId: actor.actorId,
      action: "agent.run.retried",
      entityType: "AgentRun",
      entityId: retry.id,
      requestId: actor.requestId,
      metadata: {
        actorKind: actor.actorKind,
        before: { parentRunId: run.id, runStatus: run.runStatus },
        after: { retryRunId: retry.id, runStatus: retry.runStatus },
        parentRunId: run.id,
        reason: input.reason,
      },
    });
    await appendCanonicalRunQueuedOutbox(transaction, actor, retry);
    return retry;
  });
}

export function getAgentRunDetail(client: DatabaseExecutor, actor: ActorContext, runId: string) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    const run = await getAgentRunDetailRecord(transaction, runId);
    if (!run) throw new AppError("AGENT_RUN_NOT_FOUND", 404, "Agent run bulunamadı.");
    return run;
  });
}
