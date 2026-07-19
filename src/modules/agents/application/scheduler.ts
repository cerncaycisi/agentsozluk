import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor, TransactionClient } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { appendAuditLog } from "@/modules/audit";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { requireAgentAdminInTransaction } from "@/modules/agents/application/authorization";
import type { RuntimePrincipal } from "@/modules/agents/application/runtime-auth";
import {
  DEFAULT_AVAILABLE_CONTENT_MINUTES,
  MINIMUM_CAPACITY_RESERVE_FACTOR,
  calculateRuntimeCapacity,
  capabilityFreshness,
  runtimeFingerprint,
  supportsDualConcurrency,
} from "@/modules/agents/domain/capacity";
import {
  allocateDegradedPlanCapacity,
  calculateAdaptiveContentRunCount,
  generateDailyPlan,
  type DailyPlanProfile,
  type GeneratedDailyPlan,
} from "@/modules/agents/domain/scheduler";
import {
  getClosedDaySloMetrics,
  getLatestRuntimeCapability,
  getLatestRuntimeFingerprintRecord,
} from "@/modules/agents/repository/capacity";
import {
  appendRuntimeEvent,
  getGlobalSettingsRecord,
  lockAgentSettings,
  promotePendingQuotaSettingsRecord,
} from "@/modules/agents/repository/control-plane";
import {
  createCapacitySnapshotRecord,
  createDailyPlanRecords,
  getDailyRegenerationFacts,
  getAgentPlanningPerformance,
  listActivePlanningProfiles,
  listDailyPlansForDate,
  lockDailyPlanning,
  regenerateDailyPlanRecords,
} from "@/modules/agents/repository/scheduler";
import { activeTimeProfileSchema } from "@/modules/agents/validation/schemas";
import type { DailyPlanGenerationInput } from "@/modules/agents/validation/scheduling-schemas";
import { appendOutboxEvent } from "@/modules/outbox";
import { RUNTIME_PROMPT_PROFILE_HASH } from "@/runtime/prompt-profile";

interface PlanningCandidate {
  profile: { id: string };
  planningProfile: DailyPlanProfile;
  plan: GeneratedDailyPlan;
  adaptivePlanning?: {
    contentRunCount: number;
    measuredP75DurationMs: number;
    availableCapacityMinutes: number;
    historicalSuccessRate: number;
    historicalEntriesPerSuccessfulRun: number;
    historicalTerminalRuns: number;
  };
}

interface PlanMetricSource {
  entryTarget: number;
  slots: Array<{ desiredEntryMin: number; desiredEntryMax: number }>;
}

function aggregatePlanMetrics(plans: PlanMetricSource[]) {
  return plans.reduce(
    (total, plan) => ({
      plannedRuns: total.plannedRuns + plan.slots.length,
      completedRuns: 0,
      estimatedPublishedMin:
        total.estimatedPublishedMin +
        plan.slots.reduce((sum, slot) => sum + slot.desiredEntryMin, 0),
      estimatedPublishedMax:
        total.estimatedPublishedMax +
        plan.slots.reduce((sum, slot) => sum + slot.desiredEntryMax, 0),
      targetPublishedEntries: total.targetPublishedEntries + plan.entryTarget,
    }),
    {
      plannedRuns: 0,
      completedRuns: 0,
      estimatedPublishedMin: 0,
      estimatedPublishedMax: 0,
      targetPublishedEntries: 0,
    },
  );
}

function reshapeCandidate(
  candidate: PlanningCandidate,
  input: {
    localDate: Date;
    settingsVersion: number;
    contentRunCount: number;
    entryTarget: number;
    maxDesiredEntry?: 3 | 4;
  },
): PlanningCandidate {
  return {
    ...candidate,
    plan: generateDailyPlan(candidate.planningProfile, {
      localDate: input.localDate,
      settingsVersion: input.settingsVersion,
      capacityStrategy: {
        entryTarget: input.entryTarget,
        topicTarget: candidate.plan.topicTarget,
        voteTarget: candidate.plan.voteTarget,
        contentRunCount: input.contentRunCount,
        maxDesiredEntry: input.maxDesiredEntry ?? 4,
      },
    }),
  };
}

export function istanbulLocalDate(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
}

type ExistingDailyPlan = Awaited<ReturnType<typeof listDailyPlansForDate>>[number];
type PlanningProfile = Awaited<ReturnType<typeof listActivePlanningProfiles>>[number];

interface RegenerationCandidate {
  profile: PlanningProfile;
  planningProfile: DailyPlanProfile;
  existingPlan: ExistingDailyPlan | null;
  targetPlan: GeneratedDailyPlan;
  activePublishedEntries: number;
  pendingReservedEntries: number;
  pastPlannedReservedEntries: number;
  remainingToSchedule: number;
  adaptiveRunCount: number;
  strategyRunCount: number;
  maxDesiredEntry: 3 | 4;
  expectedScheduledEntries: number;
  needsChange: boolean;
  replacementPlan: GeneratedDailyPlan | null;
  historicalPerformance: {
    terminalRuns: number;
    successRate: number;
    entriesPerSuccessfulRun: number;
  };
}

function desiredSlots(entryTarget: number, runCount: number, maxDesiredEntry: 3 | 4) {
  const boundedRunCount = entryTarget === 0 ? 0 : Math.min(runCount, entryTarget);
  const attainable = Math.min(entryTarget, boundedRunCount * maxDesiredEntry);
  return boundedRunCount === 0
    ? []
    : Array.from({ length: boundedRunCount }, (_, index) => {
        const desiredEntryMax =
          Math.floor(attainable / boundedRunCount) + (index < attainable % boundedRunCount ? 1 : 0);
        return { desiredEntryMin: Math.max(1, desiredEntryMax - 1), desiredEntryMax };
      });
}

function setRegenerationStrategy(
  candidates: RegenerationCandidate[],
  input: { compact: boolean },
): void {
  for (const candidate of candidates) {
    candidate.strategyRunCount = input.compact
      ? Math.min(6, candidate.remainingToSchedule)
      : candidate.adaptiveRunCount;
    candidate.maxDesiredEntry = input.compact ? 4 : 3;
    candidate.expectedScheduledEntries = desiredSlots(
      candidate.remainingToSchedule,
      candidate.strategyRunCount,
      candidate.maxDesiredEntry,
    ).reduce((sum, slot) => sum + slot.desiredEntryMax, 0);
  }
}

function regenerationCapacityMetrics(
  candidates: RegenerationCandidate[],
  input: { now: Date; settingsVersion: number },
) {
  return candidates.reduce(
    (total, candidate) => {
      const existingSlots = candidate.existingPlan?.slots ?? [];
      const currentFuturePlanned = existingSlots.filter(
        (slot) => slot.status === "PLANNED" && slot.scheduledAt > total.now,
      );
      const targetMatches =
        candidate.existingPlan?.generatedFromSettingsVersion === total.settingsVersion &&
        candidate.existingPlan.entryTarget === candidate.targetPlan.entryTarget &&
        candidate.existingPlan.topicTarget === candidate.targetPlan.topicTarget &&
        candidate.existingPlan.voteTarget === candidate.targetPlan.voteTarget;
      const expectedSlots = desiredSlots(
        candidate.remainingToSchedule,
        candidate.strategyRunCount,
        candidate.maxDesiredEntry,
      );
      const currentFutureMaximum = currentFuturePlanned.reduce(
        (sum, slot) => sum + slot.desiredEntryMax,
        0,
      );
      candidate.needsChange =
        !targetMatches ||
        currentFuturePlanned.length !== expectedSlots.length ||
        currentFutureMaximum !== candidate.expectedScheduledEntries;
      const retained = existingSlots.filter(
        (slot) =>
          slot.status !== "CANCELLED" &&
          !(candidate.needsChange && slot.status === "PLANNED" && slot.scheduledAt > total.now),
      );
      const replacement = candidate.needsChange ? expectedSlots : [];
      const outstandingPlanned = retained.filter((slot) => slot.status === "PLANNED");
      const future = candidate.needsChange ? replacement : currentFuturePlanned;
      const pastPlanned = outstandingPlanned.filter((slot) => slot.scheduledAt <= total.now);
      return {
        ...total,
        plannedRuns: total.plannedRuns + retained.length + replacement.length,
        completedRuns:
          total.completedRuns + retained.filter((slot) => slot.status === "COMPLETED").length,
        estimatedPublishedMin:
          total.estimatedPublishedMin +
          candidate.activePublishedEntries +
          pastPlanned.reduce((sum, slot) => sum + slot.desiredEntryMin, 0) +
          future.reduce((sum, slot) => sum + slot.desiredEntryMin, 0),
        estimatedPublishedMax:
          total.estimatedPublishedMax +
          candidate.activePublishedEntries +
          candidate.pendingReservedEntries +
          pastPlanned.reduce((sum, slot) => sum + slot.desiredEntryMax, 0) +
          future.reduce((sum, slot) => sum + slot.desiredEntryMax, 0),
        targetPublishedEntries: total.targetPublishedEntries + candidate.targetPlan.entryTarget,
      };
    },
    {
      now: input.now,
      settingsVersion: input.settingsVersion,
      plannedRuns: 0,
      completedRuns: 0,
      estimatedPublishedMin: 0,
      estimatedPublishedMax: 0,
      targetPublishedEntries: 0,
    },
  );
}

function remainingIstanbulDayFraction(localDate: Date, now: Date): number {
  const nextMidnight = new Date(
    Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth(), localDate.getUTCDate(), 21),
  );
  return Math.max(0, Math.min(1, (nextMidnight.getTime() - now.getTime()) / (24 * 60 * 60_000)));
}

function prorateFirstDayTarget(target: number, fraction: number): number {
  return target === 0 ? 0 : Math.max(1, Math.ceil(target * fraction));
}

export async function regenerateRemainingAgentDailyPlansInTransaction(
  transaction: TransactionClient,
  actor: ActorContext,
  input: DailyPlanGenerationInput,
  now = new Date(),
) {
  const today = istanbulLocalDate(now);
  const localDate = input.localDate ?? today;
  if (localDate.getTime() !== today.getTime())
    throw new AppError(
      "VALIDATION_ERROR",
      422,
      "Kalan plan yalnız bugünün İstanbul tarihi için yeniden oluşturulabilir.",
    );
  await lockDailyPlanning(transaction, localDate);
  const [settings, capability, profiles, existing, fingerprintRecord] = await Promise.all([
    getGlobalSettingsRecord(transaction, localDate),
    getLatestRuntimeCapability(transaction),
    listActivePlanningProfiles(transaction),
    listDailyPlansForDate(transaction, localDate),
    getLatestRuntimeFingerprintRecord(transaction),
  ]);
  if (profiles.length === 0)
    return {
      localDate,
      regeneratedPlans: 0,
      existingPlans: existing.length,
      activePublishedEntries: 0,
      remainingEntries: 0,
      capacity: null,
      idempotent: true,
    };
  const observedFingerprint = runtimeFingerprint(fingerprintRecord?.usageMetadata);
  const liveFingerprint = {
    codexVersion: observedFingerprint.codexVersion ?? "UNKNOWN",
    promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
  };
  const freshness = capability
    ? capabilityFreshness(capability, { now, ...liveFingerprint })
    : null;
  if (!capability || !freshness?.fresh)
    throw new AppError(
      "AGENT_CAPABILITY_REQUIRED",
      409,
      "Bugünün kalan planını yeniden oluşturmak için güncel runtime capability ölçümü gereklidir.",
      undefined,
      undefined,
      {
        reasonCode: capability ? "CAPABILITY_STALE" : "CAPABILITY_MISSING",
        staleReasons: freshness?.staleReasons ?? [],
      },
    );
  const existingByAgent = new Map(existing.map((plan) => [plan.agentProfileId, plan]));
  const [facts, performance] = await Promise.all([
    getDailyRegenerationFacts(transaction, {
      agentProfileIds: profiles.map(({ id }) => id),
      localDate,
    }),
    getAgentPlanningPerformance(transaction, {
      agentProfileIds: profiles.map(({ id }) => id),
      since: new Date(now.getTime() - 14 * 24 * 60 * 60_000),
    }),
  ]);
  const retainedRunCount = existing.reduce(
    (sum, plan) => sum + plan.slots.filter(({ status }) => status !== "CANCELLED").length,
    0,
  );
  const availableCapacityMinutesPerAgent =
    Math.max(
      0,
      DEFAULT_AVAILABLE_CONTENT_MINUTES * MINIMUM_CAPACITY_RESERVE_FACTOR -
        (retainedRunCount * capability.p75DurationMs) / 60_000,
    ) / profiles.length;
  const candidates: RegenerationCandidate[] = profiles.map((profile) => {
    const existingPlan = existingByAgent.get(profile.id) ?? null;
    const planningProfile: DailyPlanProfile = {
      agentProfileId: profile.id,
      entryMin: profile.useGlobalEntryQuota
        ? settings.defaultDailyEntryMin
        : profile.dailyEntryMin!,
      entryMax: profile.useGlobalEntryQuota
        ? settings.defaultDailyEntryMax
        : profile.dailyEntryMax!,
      topicMin: profile.dailyTopicMin,
      topicMax: profile.dailyTopicMax,
      voteMin: profile.dailyVoteMin,
      voteMax: profile.dailyVoteMax,
      activeTimeWeights: activeTimeProfileSchema.parse(profile.activeTimeProfile),
    };
    const fullDayTargetPlan = generateDailyPlan(planningProfile, {
      localDate,
      settingsVersion: settings.settingsVersion,
    });
    const firstDayFraction = existingPlan ? 1 : remainingIstanbulDayFraction(localDate, now);
    const targetPlan =
      firstDayFraction === 1
        ? fullDayTargetPlan
        : {
            ...fullDayTargetPlan,
            entryTarget: prorateFirstDayTarget(fullDayTargetPlan.entryTarget, firstDayFraction),
            topicTarget: prorateFirstDayTarget(fullDayTargetPlan.topicTarget, firstDayFraction),
            voteTarget: prorateFirstDayTarget(fullDayTargetPlan.voteTarget, firstDayFraction),
          };
    const activePublishedEntries = facts.activePublishedByAgent.get(profile.id) ?? 0;
    const pendingReservedEntries = facts.pendingReservedByAgent.get(profile.id) ?? 0;
    const pastPlannedReservedEntries =
      existingPlan?.slots
        .filter((slot) => slot.status === "PLANNED" && slot.scheduledAt <= now)
        .reduce((sum, slot) => sum + slot.desiredEntryMax, 0) ?? 0;
    const remainingToSchedule = Math.max(
      0,
      targetPlan.entryTarget -
        activePublishedEntries -
        pendingReservedEntries -
        pastPlannedReservedEntries,
    );
    const observed = performance.get(profile.id) ?? {
      terminalRuns: 0,
      successfulRuns: 0,
      successRate: 1,
      entriesPerSuccessfulRun: 3,
    };
    const adaptiveRunCount = calculateAdaptiveContentRunCount({
      entryTarget: remainingToSchedule,
      measuredP75DurationMs: capability.p75DurationMs,
      availableCapacityMinutes: availableCapacityMinutesPerAgent,
      historicalSuccessRate: observed.successRate,
      historicalEntriesPerSuccessfulRun: observed.entriesPerSuccessfulRun,
    });
    return {
      profile,
      planningProfile,
      existingPlan,
      targetPlan,
      activePublishedEntries,
      pendingReservedEntries,
      pastPlannedReservedEntries,
      remainingToSchedule,
      adaptiveRunCount,
      strategyRunCount: adaptiveRunCount,
      maxDesiredEntry: 3,
      expectedScheduledEntries: 0,
      needsChange: false,
      replacementPlan: null,
      historicalPerformance: {
        terminalRuns: observed.terminalRuns,
        successRate: observed.successRate,
        entriesPerSuccessfulRun: observed.entriesPerSuccessfulRun,
      },
    };
  });
  const capacityFor = (configuredConcurrency: 1 | 2) => {
    const measured = regenerationCapacityMetrics(candidates, {
      now,
      settingsVersion: settings.settingsVersion,
    });
    return calculateRuntimeCapacity({
      capability,
      plannedRuns: measured.plannedRuns,
      completedRuns: measured.completedRuns,
      estimatedPublishedMin: measured.estimatedPublishedMin,
      estimatedPublishedMax: measured.estimatedPublishedMax,
      targetPublishedEntries: measured.targetPublishedEntries,
      configuredConcurrency,
      degradedMode: settings.degradedMode,
      now,
      ...liveFingerprint,
    });
  };
  setRegenerationStrategy(candidates, { compact: false });
  const adaptationStages: string[] = ["ADAPTIVE_REMAINING_CAPACITY"];
  let planningConcurrency: 1 | 2 = 1;
  let capacity = capacityFor(planningConcurrency);
  if (capacity.projectedTargetMiss) {
    setRegenerationStrategy(candidates, { compact: true });
    adaptationStages.push("SIX_RUNS_PER_AGENT", "MAX_FOUR_ENTRIES_PER_RUN");
    capacity = capacityFor(planningConcurrency);
  }
  if (
    capacity.projectedTargetMiss &&
    settings.codexConcurrency === 2 &&
    supportsDualConcurrency(capability, { now, ...liveFingerprint })
  ) {
    planningConcurrency = 2;
    adaptationStages.push("MEASURED_DUAL_CONCURRENCY");
    capacity = capacityFor(planningConcurrency);
  }
  const changed = candidates.filter(({ needsChange }) => needsChange);
  if (changed.length === 0)
    return {
      localDate,
      regeneratedPlans: 0,
      existingPlans: existing.length,
      activePublishedEntries: candidates.reduce(
        (sum, candidate) => sum + candidate.activePublishedEntries,
        0,
      ),
      remainingEntries: candidates.reduce(
        (sum, candidate) => sum + candidate.remainingToSchedule,
        0,
      ),
      capacity,
      idempotent: true,
    };
  for (const candidate of changed) {
    try {
      candidate.replacementPlan = generateDailyPlan(candidate.planningProfile, {
        localDate,
        settingsVersion: settings.settingsVersion,
        seedNamespace: "regen-v1",
        capacityStrategy: {
          entryTarget: candidate.remainingToSchedule,
          topicTarget: candidate.targetPlan.topicTarget,
          voteTarget: candidate.targetPlan.voteTarget,
          contentRunCount: candidate.strategyRunCount,
          maxDesiredEntry: candidate.maxDesiredEntry,
        },
        scheduleConstraints: {
          notBefore: now,
          fixedSlots:
            candidate.existingPlan?.slots.filter(
              (slot) =>
                ["PLANNED", "QUEUED", "RUNNING"].includes(slot.status) &&
                !(slot.status === "PLANNED" && slot.scheduledAt > now),
            ) ?? [],
          excludedScheduledAt:
            candidate.existingPlan?.slots.map(({ scheduledAt }) => scheduledAt) ?? [],
        },
      });
    } catch (error) {
      if (error instanceof RangeError)
        throw new AppError(
          "VALIDATION_ERROR",
          409,
          "Kalan günlük hedef geçmişe slot yazmadan rate-limit pencerelerine sığdırılamadı.",
          undefined,
          undefined,
          {
            reasonCode: "AGENT_PLAN_REGENERATION_WINDOW_EXHAUSTED",
            agentProfileId: candidate.profile.id,
            remaining: candidate.remainingToSchedule,
          },
        );
      throw error;
    }
  }
  const snapshot = await createCapacitySnapshotRecord(transaction, {
    localDate,
    concurrency: capacity.effectiveConcurrency,
    availableMinutes: capacity.availableContentMinutes,
    reserveFactor: capacity.reserveFactor,
    plannedRuns: capacity.plannedRuns,
    p75DurationMs: capability.p75DurationMs,
    estimatedUtilization: capacity.estimatedUtilization ?? 0,
    estimatedPublishedMin: capacity.estimatedPublishedMin,
    estimatedPublishedMax: capacity.estimatedPublishedMax,
    capacityStatus: capacity.capacityStatus,
  });
  let cancelledSlots = 0;
  let createdSlots = 0;
  for (const candidate of changed) {
    const replacementPlan = candidate.replacementPlan!;
    const persisted = await regenerateDailyPlanRecords(transaction, {
      ...(candidate.existingPlan ? { existingPlanId: candidate.existingPlan.id } : {}),
      agentProfileId: candidate.profile.id,
      localDate,
      settingsVersion: settings.settingsVersion,
      capacitySnapshotId: snapshot.id,
      targetPlan: {
        entryTarget: candidate.targetPlan.entryTarget,
        topicTarget: candidate.targetPlan.topicTarget,
        voteTarget: candidate.targetPlan.voteTarget,
        randomSeed: replacementPlan.randomSeed,
      },
      replacementSlots: replacementPlan.slots,
      activePublishedEntries: candidate.activePublishedEntries,
      now,
    });
    cancelledSlots += persisted.cancelledSlots;
    createdSlots += persisted.createdSlots;
  }
  const perAgent = changed.map((candidate) => ({
    agentProfileId: candidate.profile.id,
    activePublishedEntries: candidate.activePublishedEntries,
    pendingReservedEntries: candidate.pendingReservedEntries,
    pastPlannedReservedEntries: candidate.pastPlannedReservedEntries,
    targetEntries: candidate.targetPlan.entryTarget,
    remainingToSchedule: candidate.remainingToSchedule,
    scheduledEntries: candidate.expectedScheduledEntries,
    overTargetBy: Math.max(0, candidate.activePublishedEntries - candidate.targetPlan.entryTarget),
    contentRunCount: candidate.strategyRunCount,
    ...candidate.historicalPerformance,
  }));
  const metadata = {
    actorKind: actor.actorKind,
    before: {
      existingPlans: existing.length,
      plannedSlots: existing.reduce(
        (sum, plan) => sum + plan.slots.filter(({ status }) => status !== "CANCELLED").length,
        0,
      ),
    },
    after: {
      regeneratedPlans: changed.length,
      cancelledSlots,
      createdSlots,
    },
    reason: input.reason ?? "Remaining daily schedule regenerated by human administrator.",
    operation: "REGENERATE_REMAINING_TODAY",
    localDate: localDate.toISOString().slice(0, 10),
    settingsVersion: settings.settingsVersion,
    regeneratedPlans: changed.length,
    unchangedPlans: candidates.length - changed.length,
    cancelledSlots,
    createdSlots,
    activePublishedEntries: perAgent.reduce(
      (sum, candidate) => sum + candidate.activePublishedEntries,
      0,
    ),
    pendingReservedEntries: perAgent.reduce(
      (sum, candidate) => sum + candidate.pendingReservedEntries,
      0,
    ),
    remainingEntries: perAgent.reduce((sum, candidate) => sum + candidate.remainingToSchedule, 0),
    capacitySnapshotId: snapshot.id,
    capacityStatus: capacity.capacityStatus,
    adaptationStages,
    warnings: capacity.warnings,
    perAgent,
  };
  await appendAuditLog(transaction, {
    actorId: actor.actorId,
    action: "agent.schedule.regenerated",
    entityType: "AgentCapacitySnapshot",
    entityId: snapshot.id,
    requestId: actor.requestId,
    metadata,
  });
  await appendOutboxEvent(transaction, {
    eventType: "agent.schedule.generated",
    aggregateType: "AgentCapacitySnapshot",
    aggregateId: snapshot.id,
    actorId: actor.actorId,
    actorKind: actor.actorKind,
    requestId: actor.requestId,
    payload: metadata,
  });
  await appendRuntimeEvent(transaction, {
    eventType: "schedule.regenerated",
    safeMessage:
      "Bugünün kalan agent planı yayımlanmış ACTIVE entry'ler ve pending run rezervleri korunarak yeniden oluşturuldu.",
    metadata,
  });
  return {
    localDate,
    regeneratedPlans: changed.length,
    existingPlans: existing.length,
    activePublishedEntries: metadata.activePublishedEntries,
    remainingEntries: metadata.remainingEntries,
    cancelledSlots,
    createdSlots,
    capacity,
    idempotent: false,
  };
}

export function regenerateRemainingAgentDailyPlans(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: DailyPlanGenerationInput,
  now = new Date(),
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    await lockAgentSettings(transaction);
    await promotePendingQuotaSettingsRecord(transaction, istanbulLocalDate(now));
    return regenerateRemainingAgentDailyPlansInTransaction(transaction, actor, input, now);
  });
}

async function generateAgentDailyPlansInTransaction(
  transaction: TransactionClient,
  actor: ActorContext,
  input: DailyPlanGenerationInput,
  now = new Date(),
) {
  const localDate = input.localDate ?? istanbulLocalDate(now);
  await lockAgentSettings(transaction);
  await promotePendingQuotaSettingsRecord(transaction, istanbulLocalDate(now));
  await lockDailyPlanning(transaction, localDate);
  const [settings, capability, profiles, existing, fingerprintRecord] = await Promise.all([
    getGlobalSettingsRecord(transaction, localDate),
    getLatestRuntimeCapability(transaction),
    listActivePlanningProfiles(transaction),
    listDailyPlansForDate(transaction, localDate),
    getLatestRuntimeFingerprintRecord(transaction),
  ]);
  const existingAgentIds = new Set(existing.map(({ agentProfileId }) => agentProfileId));
  if (localDate <= istanbulLocalDate(now)) {
    const closedDay = await getClosedDaySloMetrics(transaction, localDate);
    if (
      closedDay.planCount > 0 &&
      closedDay.shortfallEntries > 0 &&
      !closedDay.degradedMode &&
      !closedDay.alreadyRecorded
    ) {
      await appendRuntimeEvent(transaction, {
        eventType: "capacity.slo_miss.actual",
        safeMessage: "Kapanan günde gerçekleşen yayın hedefi açığı kaydedildi.",
        metadata: {
          localDate: closedDay.dateKey,
          targetPublishedEntries: closedDay.targetPublishedEntries,
          publishedEntries: closedDay.publishedEntries,
          shortfallEntries: closedDay.shortfallEntries,
        },
      });
    }
  }
  let generated: PlanningCandidate[] = profiles
    .filter(({ id }) => !existingAgentIds.has(id))
    .map((profile) => {
      const planningProfile: DailyPlanProfile = {
        agentProfileId: profile.id,
        entryMin: profile.useGlobalEntryQuota
          ? settings.defaultDailyEntryMin
          : profile.dailyEntryMin!,
        entryMax: profile.useGlobalEntryQuota
          ? settings.defaultDailyEntryMax
          : profile.dailyEntryMax!,
        topicMin: profile.dailyTopicMin,
        topicMax: profile.dailyTopicMax,
        voteMin: profile.dailyVoteMin,
        voteMax: profile.dailyVoteMax,
        activeTimeWeights: activeTimeProfileSchema.parse(profile.activeTimeProfile),
      };
      return {
        profile,
        planningProfile,
        plan: generateDailyPlan(planningProfile, {
          localDate,
          settingsVersion: settings.settingsVersion,
        }),
      };
    });
  if (generated.length === 0) {
    return { localDate, createdPlans: 0, existingPlans: existing.length, capacity: null };
  }
  const observedFingerprint = runtimeFingerprint(fingerprintRecord?.usageMetadata);
  const liveFingerprint = {
    codexVersion: observedFingerprint.codexVersion ?? "UNKNOWN",
    promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
  };
  const freshness = capability
    ? capabilityFreshness(capability, {
        now,
        codexVersion: liveFingerprint.codexVersion,
        promptProfileHash: liveFingerprint.promptProfileHash,
      })
    : null;
  const prospectiveMetrics = aggregatePlanMetrics([
    ...existing,
    ...generated.map(({ plan }) => plan),
  ]);
  if (!capability || !freshness?.fresh) {
    const capacity = calculateRuntimeCapacity({
      capability,
      ...prospectiveMetrics,
      configuredConcurrency: 1,
      degradedMode: false,
      now,
      codexVersion: liveFingerprint.codexVersion,
      promptProfileHash: liveFingerprint.promptProfileHash,
    });
    const blockedReason = capability ? "CAPABILITY_STALE" : "CAPABILITY_MISSING";
    await appendRuntimeEvent(transaction, {
      eventType: "capacity.planning_blocked",
      safeMessage: "Günlük plan güncel runtime benchmark kanıtı olmadığı için oluşturulmadı.",
      metadata: {
        localDate: localDate.toISOString().slice(0, 10),
        blockedReason,
        staleReasons: freshness?.staleReasons ?? [],
        currentCodexVersion: liveFingerprint.codexVersion ?? "UNKNOWN",
        currentPromptProfileHash: liveFingerprint.promptProfileHash,
      },
    });
    return {
      localDate,
      createdPlans: 0,
      existingPlans: existing.length,
      blocked: true,
      blockedReason,
      capacity,
    };
  }
  const performance = await getAgentPlanningPerformance(transaction, {
    agentProfileIds: generated.map(({ profile }) => profile.id),
    since: new Date(now.getTime() - 14 * 24 * 60 * 60_000),
  });
  const existingRunCount = existing.reduce((sum, plan) => sum + plan.slots.length, 0);
  const existingCapacityMinutes = (existingRunCount * capability.p75DurationMs) / 60_000;
  const availableCapacityMinutesPerAgent =
    Math.max(
      0,
      DEFAULT_AVAILABLE_CONTENT_MINUTES * MINIMUM_CAPACITY_RESERVE_FACTOR - existingCapacityMinutes,
    ) / generated.length;
  generated = generated.map((candidate) => {
    const observed = performance.get(candidate.profile.id) ?? {
      terminalRuns: 0,
      successfulRuns: 0,
      successRate: 1,
      entriesPerSuccessfulRun: 3,
    };
    const contentRunCount = calculateAdaptiveContentRunCount({
      entryTarget: candidate.plan.entryTarget,
      measuredP75DurationMs: capability.p75DurationMs,
      availableCapacityMinutes: availableCapacityMinutesPerAgent,
      historicalSuccessRate: observed.successRate,
      historicalEntriesPerSuccessfulRun: observed.entriesPerSuccessfulRun,
    });
    return {
      ...reshapeCandidate(candidate, {
        localDate,
        settingsVersion: settings.settingsVersion,
        contentRunCount,
        entryTarget: candidate.plan.entryTarget,
        maxDesiredEntry: 3,
      }),
      adaptivePlanning: {
        contentRunCount,
        measuredP75DurationMs: capability.p75DurationMs,
        availableCapacityMinutes: availableCapacityMinutesPerAgent,
        historicalSuccessRate: observed.successRate,
        historicalEntriesPerSuccessfulRun: observed.entriesPerSuccessfulRun,
        historicalTerminalRuns: observed.terminalRuns,
      },
    };
  });
  const adaptationStages: string[] = [];
  const calculateFor = (
    candidates: PlanningCandidate[],
    configuredConcurrency: 1 | 2,
    degradedMode = false,
  ) =>
    calculateRuntimeCapacity({
      capability,
      ...aggregatePlanMetrics([...existing, ...candidates.map(({ plan }) => plan)]),
      configuredConcurrency,
      degradedMode,
      now,
      codexVersion: liveFingerprint.codexVersion,
      promptProfileHash: liveFingerprint.promptProfileHash,
    });
  let capacity = calculateFor(generated, 1);
  const beforeAdaptation = {
    plannedRuns: capacity.plannedRuns,
    targetPublishedEntries: capacity.targetPublishedEntries,
    estimatedPublishedMax: capacity.estimatedPublishedMax,
    concurrency: 1,
  };
  if (capacity.projectedTargetMiss) {
    generated = generated.map((candidate) =>
      reshapeCandidate(candidate, {
        localDate,
        settingsVersion: settings.settingsVersion,
        contentRunCount: Math.min(6, candidate.plan.entryTarget),
        entryTarget: candidate.plan.entryTarget,
      }),
    );
    adaptationStages.push("SIX_RUNS_PER_AGENT", "MAX_FOUR_ENTRIES_PER_RUN");
    capacity = calculateFor(generated, 1);
  }
  const dualConcurrencyAllowed =
    settings.codexConcurrency === 2 &&
    supportsDualConcurrency(capability, {
      now,
      codexVersion: liveFingerprint.codexVersion,
      promptProfileHash: liveFingerprint.promptProfileHash,
    });
  let planningConcurrency: 1 | 2 = 1;
  if (capacity.projectedTargetMiss && dualConcurrencyAllowed) {
    planningConcurrency = 2;
    adaptationStages.push("MEASURED_DUAL_CONCURRENCY");
    capacity = calculateFor(generated, planningConcurrency);
  }
  let degradedEvidence:
    | {
        before: typeof beforeAdaptation;
        after: {
          plannedRuns: number;
          targetPublishedEntries: number;
          estimatedPublishedMax: number;
          concurrency: 1 | 2;
        };
      }
    | undefined;
  if (capacity.projectedTargetMiss && settings.degradedMode) {
    const existingRunCount = existing.reduce((sum, plan) => sum + plan.slots.length, 0);
    const availableGeneratedRuns = Math.max(
      0,
      (capacity.capacityRunBudget ?? 0) - existingRunCount,
    );
    const degradedAllocations = allocateDegradedPlanCapacity(
      generated.map(({ plan }) => plan.entryTarget),
      availableGeneratedRuns,
    );
    generated = generated.map((candidate, index) => {
      const allocation = degradedAllocations[index] ?? { contentRunCount: 0, entryTarget: 0 };
      return reshapeCandidate(candidate, {
        localDate,
        settingsVersion: settings.settingsVersion,
        contentRunCount: allocation.contentRunCount,
        entryTarget: allocation.entryTarget,
      });
    });
    capacity = calculateFor(generated, planningConcurrency, true);
    adaptationStages.push("DEGRADED_TARGET_REDUCTION");
    degradedEvidence = {
      before: beforeAdaptation,
      after: {
        plannedRuns: capacity.plannedRuns,
        targetPublishedEntries: capacity.targetPublishedEntries,
        estimatedPublishedMax: capacity.estimatedPublishedMax,
        concurrency: planningConcurrency,
      },
    };
  } else if (settings.degradedMode) {
    capacity = calculateFor(generated, planningConcurrency, true);
  }
  const snapshot = await createCapacitySnapshotRecord(transaction, {
    localDate,
    concurrency: capacity.effectiveConcurrency,
    availableMinutes: capacity.availableContentMinutes,
    reserveFactor: capacity.reserveFactor,
    plannedRuns: capacity.plannedRuns,
    p75DurationMs: capability?.p75DurationMs ?? 0,
    estimatedUtilization: capacity.estimatedUtilization ?? 0,
    estimatedPublishedMin: capacity.estimatedPublishedMin,
    estimatedPublishedMax: capacity.estimatedPublishedMax,
    capacityStatus: capacity.capacityStatus,
  });
  for (const item of generated) {
    await createDailyPlanRecords(transaction, {
      agentProfileId: item.profile.id,
      localDate,
      settingsVersion: settings.settingsVersion,
      capacitySnapshotId: snapshot.id,
      plan: item.plan,
    });
  }
  const metadata = {
    actorKind: actor.actorKind,
    before: {
      existingPlans: existing.length,
      plannedRuns: existing.reduce((sum, plan) => sum + plan.slots.length, 0),
    },
    after: {
      createdPlans: generated.length,
      plannedRuns: capacity.plannedRuns,
    },
    reason:
      input.reason ??
      (actor.actorKind === "AGENT"
        ? "Automatic runtime daily schedule generation."
        : "Daily schedule generation requested by human administrator."),
    localDate: localDate.toISOString().slice(0, 10),
    createdPlans: generated.length,
    existingPlans: existing.length,
    plannedRuns: capacity.plannedRuns,
    capacityStatus: capacity.capacityStatus,
    capacitySnapshotId: snapshot.id,
    targetPublishedEntries: capacity.targetPublishedEntries,
    projectedPublishedMax: capacity.projectedPublishedMax,
    projectedShortfallEntries: capacity.projectedShortfallEntries,
    adaptationStages,
    warnings: capacity.warnings,
    adaptivePlanning: generated.map(({ profile, adaptivePlanning }) => ({
      agentProfileId: profile.id,
      ...adaptivePlanning,
    })),
  };
  await appendAuditLog(transaction, {
    actorId: actor.actorId,
    action: "agent.schedule.generated",
    entityType: "AgentCapacitySnapshot",
    entityId: snapshot.id,
    requestId: actor.requestId,
    metadata,
  });
  await appendOutboxEvent(transaction, {
    eventType: "agent.schedule.generated",
    aggregateType: "AgentCapacitySnapshot",
    aggregateId: snapshot.id,
    actorId: actor.actorId,
    actorKind: actor.actorKind,
    requestId: actor.requestId,
    payload: metadata,
  });
  await appendRuntimeEvent(transaction, {
    eventType: "schedule.generated",
    safeMessage: "Günlük agent planları deterministic olarak oluşturuldu.",
    metadata,
  });
  if (degradedEvidence) {
    await appendRuntimeEvent(transaction, {
      eventType: "capacity.degraded_plan",
      safeMessage: "Degraded mode günlük planı ölçülen kapasiteye göre açıkça küçülttü.",
      metadata: {
        localDate: metadata.localDate,
        capacitySnapshotId: snapshot.id,
        adaptationStages,
        ...degradedEvidence,
      },
    });
  } else if (capacity.projectedTargetMiss) {
    await appendRuntimeEvent(transaction, {
      eventType: "capacity.slo_miss.projected",
      safeMessage: "Günlük yayın hedefinde ölçülen kapasiteye dayalı açık öngörülüyor.",
      metadata: {
        localDate: metadata.localDate,
        capacitySnapshotId: snapshot.id,
        capacityStatus: capacity.capacityStatus,
        targetPublishedEntries: capacity.targetPublishedEntries,
        projectedPublishedMax: capacity.projectedPublishedMax,
        projectedShortfallEntries: capacity.projectedShortfallEntries,
        adaptationStages,
        warnings: capacity.warnings,
      },
    });
  }
  return { localDate, createdPlans: generated.length, existingPlans: existing.length, capacity };
}

export function generateAgentDailyPlans(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: DailyPlanGenerationInput,
  now = new Date(),
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    return generateAgentDailyPlansInTransaction(transaction, actor, input, now);
  });
}

export function generateRuntimeDailyPlans(
  client: DatabaseExecutor,
  principal: RuntimePrincipal,
  input: { workerId: string },
  now = new Date(),
) {
  return inTransaction(client, async (transaction) => {
    if (
      principal.actor.actorKind !== "AGENT" ||
      principal.actor.actorRole !== "USER" ||
      principal.actor.origin !== "AGENT"
    )
      throw new AppError("FORBIDDEN", 403, "Günlük runtime planı yalnız runtime actor üretebilir.");
    const result = await generateAgentDailyPlansInTransaction(
      transaction,
      principal.actor,
      { localDate: istanbulLocalDate(now) },
      now,
    );
    return {
      localDate: result.localDate.toISOString().slice(0, 10),
      createdPlans: result.createdPlans,
      existingPlans: result.existingPlans,
      blocked: "blocked" in result && result.blocked === true,
      blockedReason: "blockedReason" in result ? result.blockedReason : null,
      workerId: input.workerId,
    };
  });
}
