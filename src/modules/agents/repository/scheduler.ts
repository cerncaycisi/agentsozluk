import type { Prisma } from "@prisma/client";
import type { GeneratedDailyPlan } from "@/modules/agents/domain/scheduler";

interface DueScheduleSlot {
  id: string;
  agentProfileId: string;
  scheduledAt: Date;
  runType: "SCHEDULED_WAKE";
  queuePriority: "SCHEDULED_CONTENT";
  desiredEntryMin: number;
  desiredEntryMax: number;
  personaVersionId: string;
}

const contentRunTypes = ["SCHEDULED_WAKE", "NORMAL_WAKE", "ENTRY_BURST", "DAILY_CATCH_UP"] as const;

const queuedRunEventSelect = {
  id: true,
  agentProfileId: true,
  runType: true,
  queuePriority: true,
  runStatus: true,
  trigger: true,
  availableAt: true,
  desiredEntryMin: true,
  desiredEntryMax: true,
  parentRunId: true,
} as const satisfies Prisma.AgentRunSelect;

export type QueuedRunEventRecord = Prisma.AgentRunGetPayload<{
  select: typeof queuedRunEventSelect;
}>;

const expiredQueuedCatchUpSelect = {
  id: true,
  agentProfileId: true,
  runType: true,
  runStatus: true,
  trigger: true,
  createdAt: true,
  finishedAt: true,
  errorCode: true,
} as const satisfies Prisma.AgentRunSelect;

export type ExpiredQueuedCatchUpRunRecord = Prisma.AgentRunGetPayload<{
  select: typeof expiredQueuedCatchUpSelect;
}>;

export function istanbulDayBounds(localDate: Date): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth(), localDate.getUTCDate(), -3),
  );
  return { start, end: new Date(start.getTime() + 24 * 60 * 60_000) };
}

export async function lockDailyPlanning(
  transaction: Prisma.TransactionClient,
  localDate: Date,
): Promise<void> {
  const key = `agent-daily-plan:${localDate.toISOString().slice(0, 10)}`;
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

export function listActivePlanningProfiles(transaction: Prisma.TransactionClient) {
  return transaction.agentProfile.findMany({
    where: { lifecycleStatus: "ACTIVE" },
    orderBy: { id: "asc" },
    select: {
      id: true,
      useGlobalEntryQuota: true,
      dailyEntryMin: true,
      dailyEntryMax: true,
      dailyTopicMin: true,
      dailyTopicMax: true,
      dailyVoteMin: true,
      dailyVoteMax: true,
      activeTimeProfile: true,
    },
  });
}

export function listDailyPlansForDate(transaction: Prisma.TransactionClient, localDate: Date) {
  return transaction.agentDailyPlan.findMany({
    where: { localDate },
    include: { slots: { orderBy: { scheduledAt: "asc" } } },
  });
}

export async function getDailyRegenerationFacts(
  transaction: Prisma.TransactionClient,
  input: { agentProfileIds: string[]; localDate: Date },
) {
  if (input.agentProfileIds.length === 0)
    return {
      activePublishedByAgent: new Map<string, number>(),
      pendingReservedByAgent: new Map<string, number>(),
    };
  const bounds = istanbulDayBounds(input.localDate);
  const [published, pendingRuns] = await Promise.all([
    transaction.agentContentRecord.groupBy({
      by: ["agentProfileId"],
      where: {
        agentProfileId: { in: input.agentProfileIds },
        createdAt: { gte: bounds.start, lt: bounds.end },
        entry: { status: "ACTIVE" },
      },
      _count: { _all: true },
    }),
    transaction.agentRun.findMany({
      where: {
        agentProfileId: { in: input.agentProfileIds },
        runType: { in: [...contentRunTypes] },
        runStatus: { in: ["QUEUED", "RUNNING", "CANCEL_REQUESTED"] },
        availableAt: { lt: bounds.end },
      },
      select: {
        agentProfileId: true,
        desiredEntryMax: true,
        _count: {
          select: {
            contentRecords: {
              where: {
                createdAt: { gte: bounds.start, lt: bounds.end },
                entry: { status: "ACTIVE" },
              },
            },
          },
        },
      },
    }),
  ]);
  const activePublishedByAgent = new Map(
    published.map((record) => [record.agentProfileId, record._count._all]),
  );
  const pendingReservedByAgent = new Map<string, number>();
  for (const run of pendingRuns) {
    const remainingMaximum = Math.max(0, run.desiredEntryMax - run._count.contentRecords);
    pendingReservedByAgent.set(
      run.agentProfileId,
      (pendingReservedByAgent.get(run.agentProfileId) ?? 0) + remainingMaximum,
    );
  }
  return { activePublishedByAgent, pendingReservedByAgent };
}

export async function getAgentPlanningPerformance(
  transaction: Prisma.TransactionClient,
  input: { agentProfileIds: string[]; since: Date },
) {
  if (input.agentProfileIds.length === 0) return new Map();
  const contentRunTypes = [
    "SCHEDULED_WAKE",
    "NORMAL_WAKE",
    "ENTRY_BURST",
    "DAILY_CATCH_UP",
  ] as const;
  const terminalStatuses = ["SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED", "TIMED_OUT"] as const;
  const [runs, entries] = await Promise.all([
    transaction.agentRun.groupBy({
      by: ["agentProfileId", "runStatus"],
      where: {
        agentProfileId: { in: input.agentProfileIds },
        runType: { in: [...contentRunTypes] },
        runStatus: { in: [...terminalStatuses] },
        finishedAt: { gte: input.since },
      },
      _count: { _all: true },
    }),
    transaction.agentContentRecord.groupBy({
      by: ["agentProfileId"],
      where: {
        agentProfileId: { in: input.agentProfileIds },
        createdAt: { gte: input.since },
      },
      _count: { _all: true },
    }),
  ]);
  const entryCountByAgent = new Map(
    entries.map((record) => [record.agentProfileId, record._count._all]),
  );
  const result = new Map<
    string,
    {
      terminalRuns: number;
      successfulRuns: number;
      successRate: number;
      entriesPerSuccessfulRun: number;
    }
  >();
  for (const agentProfileId of input.agentProfileIds) {
    const matching = runs.filter((record) => record.agentProfileId === agentProfileId);
    const terminalRuns = matching.reduce((sum, record) => sum + record._count._all, 0);
    const successfulRuns = matching
      .filter((record) => ["SUCCEEDED", "PARTIAL"].includes(record.runStatus))
      .reduce((sum, record) => sum + record._count._all, 0);
    result.set(agentProfileId, {
      terminalRuns,
      successfulRuns,
      successRate: terminalRuns === 0 ? 1 : successfulRuns / terminalRuns,
      entriesPerSuccessfulRun:
        successfulRuns === 0
          ? 3
          : Math.max(0.25, (entryCountByAgent.get(agentProfileId) ?? 0) / successfulRuns),
    });
  }
  return result;
}

export function createCapacitySnapshotRecord(
  transaction: Prisma.TransactionClient,
  input: {
    localDate: Date;
    concurrency: number;
    availableMinutes: number;
    reserveFactor: number;
    plannedRuns: number;
    p75DurationMs: number;
    estimatedUtilization: number;
    estimatedPublishedMin: number;
    estimatedPublishedMax: number;
    capacityStatus: "UNKNOWN" | "HEALTHY" | "AT_RISK" | "DEGRADED" | "OVERLOADED";
  },
) {
  return transaction.agentCapacitySnapshot.create({ data: input });
}

export async function createDailyPlanRecords(
  transaction: Prisma.TransactionClient,
  input: {
    agentProfileId: string;
    localDate: Date;
    settingsVersion: number;
    capacitySnapshotId: string;
    plan: GeneratedDailyPlan;
  },
) {
  const dailyPlan = await transaction.agentDailyPlan.create({
    data: {
      agentProfileId: input.agentProfileId,
      localDate: input.localDate,
      entryTarget: input.plan.entryTarget,
      topicTarget: input.plan.topicTarget,
      voteTarget: input.plan.voteTarget,
      generatedFromSettingsVersion: input.settingsVersion,
      randomSeed: input.plan.randomSeed,
      capacitySnapshotId: input.capacitySnapshotId,
    },
  });
  await transaction.agentScheduleSlot.createMany({
    data: input.plan.slots.map((slot) => ({
      dailyPlanId: dailyPlan.id,
      agentProfileId: input.agentProfileId,
      scheduledAt: slot.scheduledAt,
      runType: "SCHEDULED_WAKE",
      queuePriority: "SCHEDULED_CONTENT",
      desiredEntryMin: slot.desiredEntryMin,
      desiredEntryMax: slot.desiredEntryMax,
    })),
  });
  await transaction.agentRuntimeState.update({
    where: { agentProfileId: input.agentProfileId },
    data: {
      todayDate: input.localDate,
      todayEntryTarget: input.plan.entryTarget,
      todayPublishedEntries: 0,
      todayTopicTarget: input.plan.topicTarget,
      todayCreatedTopics: 0,
      todayVoteTarget: input.plan.voteTarget,
      todayVotes: 0,
      todaySourceReads: 0,
      nextScheduledAt: input.plan.slots[0]?.scheduledAt ?? null,
    },
  });
  return dailyPlan;
}

export async function regenerateDailyPlanRecords(
  transaction: Prisma.TransactionClient,
  input: {
    existingPlanId?: string;
    agentProfileId: string;
    localDate: Date;
    settingsVersion: number;
    capacitySnapshotId: string;
    targetPlan: Pick<
      GeneratedDailyPlan,
      "entryTarget" | "topicTarget" | "voteTarget" | "randomSeed"
    >;
    replacementSlots: GeneratedDailyPlan["slots"];
    activePublishedEntries: number;
    now: Date;
  },
) {
  let cancelledSlots = 0;
  if (input.existingPlanId) {
    const cancelled = await transaction.agentScheduleSlot.updateMany({
      where: {
        dailyPlanId: input.existingPlanId,
        status: "PLANNED",
        scheduledAt: { gt: input.now },
      },
      data: { status: "CANCELLED" },
    });
    cancelledSlots = cancelled.count;
  }
  const dailyPlan = input.existingPlanId
    ? await transaction.agentDailyPlan.update({
        where: { id: input.existingPlanId },
        data: {
          entryTarget: input.targetPlan.entryTarget,
          topicTarget: input.targetPlan.topicTarget,
          voteTarget: input.targetPlan.voteTarget,
          generatedFromSettingsVersion: input.settingsVersion,
          randomSeed: input.targetPlan.randomSeed,
          capacitySnapshotId: input.capacitySnapshotId,
        },
      })
    : await transaction.agentDailyPlan.create({
        data: {
          agentProfileId: input.agentProfileId,
          localDate: input.localDate,
          entryTarget: input.targetPlan.entryTarget,
          topicTarget: input.targetPlan.topicTarget,
          voteTarget: input.targetPlan.voteTarget,
          generatedFromSettingsVersion: input.settingsVersion,
          randomSeed: input.targetPlan.randomSeed,
          capacitySnapshotId: input.capacitySnapshotId,
        },
      });
  if (input.replacementSlots.length > 0)
    await transaction.agentScheduleSlot.createMany({
      data: input.replacementSlots.map((slot) => ({
        dailyPlanId: dailyPlan.id,
        agentProfileId: input.agentProfileId,
        scheduledAt: slot.scheduledAt,
        runType: "SCHEDULED_WAKE",
        queuePriority: "SCHEDULED_CONTENT",
        desiredEntryMin: slot.desiredEntryMin,
        desiredEntryMax: slot.desiredEntryMax,
      })),
    });
  const next = await transaction.agentScheduleSlot.findFirst({
    where: { agentProfileId: input.agentProfileId, status: "PLANNED" },
    orderBy: { scheduledAt: "asc" },
    select: { scheduledAt: true },
  });
  await transaction.agentRuntimeState.update({
    where: { agentProfileId: input.agentProfileId },
    data: {
      todayDate: input.localDate,
      todayEntryTarget: input.targetPlan.entryTarget,
      todayPublishedEntries: input.activePublishedEntries,
      todayTopicTarget: input.targetPlan.topicTarget,
      todayVoteTarget: input.targetPlan.voteTarget,
      nextScheduledAt: next?.scheduledAt ?? null,
    },
  });
  return { dailyPlan, cancelledSlots, createdSlots: input.replacementSlots.length };
}

async function refreshNextScheduledAt(
  transaction: Prisma.TransactionClient,
  agentProfileIds: string[],
): Promise<void> {
  for (const agentProfileId of new Set(agentProfileIds)) {
    const next = await transaction.agentScheduleSlot.findFirst({
      where: { agentProfileId, status: "PLANNED" },
      orderBy: { scheduledAt: "asc" },
      select: { scheduledAt: true },
    });
    await transaction.agentRuntimeState.updateMany({
      where: { agentProfileId },
      data: { nextScheduledAt: next?.scheduledAt ?? null },
    });
  }
}

export async function dispatchDueScheduleSlots(
  transaction: Prisma.TransactionClient,
  input: { now: Date; localDate: Date; timeoutSeconds: number; limit?: number },
) {
  const stale = await transaction.agentScheduleSlot.findMany({
    where: { status: "PLANNED", dailyPlan: { localDate: { lt: input.localDate } } },
    distinct: ["agentProfileId"],
    select: { agentProfileId: true },
  });
  const missed = await transaction.agentScheduleSlot.updateMany({
    where: { status: "PLANNED", dailyPlan: { localDate: { lt: input.localDate } } },
    data: { status: "MISSED" },
  });
  const slots = await transaction.$queryRaw<DueScheduleSlot[]>`
    SELECT
      slot."id",
      slot."agentProfileId",
      slot."scheduledAt",
      slot."runType",
      slot."queuePriority",
      slot."desiredEntryMin",
      slot."desiredEntryMax",
      profile."currentPersonaVersionId" AS "personaVersionId"
    FROM "agent_schedule_slots" AS slot
    INNER JOIN "agent_daily_plans" AS plan ON plan."id" = slot."dailyPlanId"
    INNER JOIN "agent_profiles" AS profile ON profile."id" = slot."agentProfileId"
    WHERE slot."status" = 'PLANNED'
      AND slot."scheduledAt" <= ${input.now}
      AND plan."localDate" = ${input.localDate}::date
      AND profile."lifecycleStatus" = 'ACTIVE'
      AND profile."currentPersonaVersionId" IS NOT NULL
    ORDER BY slot."scheduledAt" ASC, slot."id" ASC
    FOR UPDATE OF slot SKIP LOCKED
    LIMIT ${input.limit ?? 100}
  `;
  const runs = [];
  for (const slot of slots) {
    const run = await transaction.agentRun.create({
      data: {
        agentProfileId: slot.agentProfileId,
        runType: slot.runType,
        queuePriority: slot.queuePriority,
        trigger: "SCHEDULER_SLOT",
        scheduleSlotId: slot.id,
        personaVersionId: slot.personaVersionId,
        idempotencyKey: `schedule-slot:${slot.id}`,
        availableAt: slot.scheduledAt,
        timeoutSeconds: input.timeoutSeconds,
        desiredEntryMin: slot.desiredEntryMin,
        desiredEntryMax: slot.desiredEntryMax,
      },
    });
    await transaction.agentScheduleSlot.update({
      where: { id: slot.id },
      data: { status: "QUEUED", runId: run.id, attempts: { increment: 1 } },
    });
    runs.push(run);
  }
  await refreshNextScheduledAt(transaction, [
    ...stale.map(({ agentProfileId }) => agentProfileId),
    ...slots.map(({ agentProfileId }) => agentProfileId),
  ]);
  return { queued: runs.length, missed: missed.count, runs };
}

function istanbulDayStart(localDate: Date): Date {
  return istanbulDayBounds(localDate).start;
}

export function listExpiredQueuedCatchUpRuns(
  transaction: Prisma.TransactionClient,
  input: { agentProfileId: string; localDate: Date },
) {
  return transaction.agentRun.findMany({
    where: {
      agentProfileId: input.agentProfileId,
      trigger: "AUTO_CATCH_UP",
      runStatus: "QUEUED",
      createdAt: { lt: istanbulDayStart(input.localDate) },
    },
    select: expiredQueuedCatchUpSelect,
    orderBy: { id: "asc" },
  });
}

/**
 * Rechecks the expiry predicate after the application layer has acquired the
 * per-run advisory and row locks. Returning null makes a concurrent terminal
 * transition an idempotent no-op instead of overwriting it.
 */
export async function cancelExpiredQueuedCatchUpRunRecord(
  transaction: Prisma.TransactionClient,
  input: { runId: string; agentProfileId: string; localDate: Date; now: Date },
): Promise<ExpiredQueuedCatchUpRunRecord | null> {
  const run = await transaction.agentRun.findFirst({
    where: {
      id: input.runId,
      agentProfileId: input.agentProfileId,
      trigger: "AUTO_CATCH_UP",
      runStatus: "QUEUED",
      createdAt: { lt: istanbulDayStart(input.localDate) },
    },
    select: { id: true },
  });
  if (!run) return null;
  return transaction.agentRun.update({
    where: { id: run.id },
    data: {
      runStatus: "CANCELLED",
      finishedAt: input.now,
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
      errorCode: "CATCH_UP_DAY_EXPIRED",
      errorSummary: "Önceki İstanbul gününe ait bekleyen catch-up run güvenli biçimde kapatıldı.",
    },
    select: expiredQueuedCatchUpSelect,
  });
}

function istanbulClock(now: Date): { hour: number; minute: number; weekday: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    weekday: value("weekday"),
  };
}

export async function planRuntimeMaintenance(
  transaction: Prisma.TransactionClient,
  input: {
    agentProfileId: string;
    localDate: Date;
    now: Date;
    reflectionTimeoutSeconds: number;
    sourceRefreshTimeoutSeconds: number;
    personaEvolutionEnabled: boolean;
    sourceEvolutionEnabled: boolean;
  },
) {
  const dateKey = input.localDate.toISOString().slice(0, 10);
  const clock = istanbulClock(input.now);
  const profile = await transaction.agentProfile.findFirst({
    where: {
      id: input.agentProfileId,
      lifecycleStatus: "ACTIVE",
      currentPersonaVersionId: { not: null },
    },
    select: {
      currentPersonaVersionId: true,
      personaEvolutionEnabled: true,
      sourceEvolutionEnabled: true,
    },
  });
  if (!profile?.currentPersonaVersionId)
    return { maintenanceQueued: 0, runs: [] as QueuedRunEventRecord[] };
  let maintenanceQueued = 0;
  const queuedRuns: QueuedRunEventRecord[] = [];
  const createMaintenance = async (definition: {
    trigger: string;
    runType: "REFLECTION" | "SOURCE_REFRESH";
    timeoutSeconds: number;
    allowSourceReading: boolean;
  }) => {
    const idempotencyKey = `maintenance:${definition.trigger}:${input.agentProfileId}:${dateKey}`;
    if (await transaction.agentRun.findUnique({ where: { idempotencyKey } })) return;
    const run = await transaction.agentRun.create({
      select: queuedRunEventSelect,
      data: {
        agentProfileId: input.agentProfileId,
        runType: definition.runType,
        queuePriority: definition.runType === "SOURCE_REFRESH" ? "SOURCE_REFRESH" : "REFLECTION",
        trigger: definition.trigger,
        personaVersionId: profile.currentPersonaVersionId!,
        idempotencyKey,
        availableAt: input.now,
        timeoutSeconds: definition.timeoutSeconds,
        desiredEntryMin: 0,
        desiredEntryMax: 0,
        allowTopicCreation: false,
        allowVoting: false,
        allowFollowing: false,
        allowSourceReading: definition.allowSourceReading,
        createdAt: input.now,
      },
    });
    queuedRuns.push(run);
    maintenanceQueued += 1;
  };
  if (clock.hour >= 2)
    await createMaintenance({
      trigger: "NIGHTLY_MEMORY_CONSOLIDATION",
      runType: "REFLECTION",
      timeoutSeconds: input.reflectionTimeoutSeconds,
      allowSourceReading: false,
    });
  if (
    clock.weekday === "Sun" &&
    clock.hour >= 3 &&
    input.personaEvolutionEnabled &&
    profile.personaEvolutionEnabled
  )
    await createMaintenance({
      trigger: "WEEKLY_PERSONA_REFLECTION",
      runType: "REFLECTION",
      timeoutSeconds: input.reflectionTimeoutSeconds,
      allowSourceReading: false,
    });
  if (clock.hour >= 4 && input.sourceEvolutionEnabled && profile.sourceEvolutionEnabled)
    await createMaintenance({
      trigger: "DAILY_SOURCE_REFRESH",
      runType: "SOURCE_REFRESH",
      timeoutSeconds: input.sourceRefreshTimeoutSeconds,
      allowSourceReading: true,
    });
  return { maintenanceQueued, runs: queuedRuns };
}

export async function retireLegacyDailyPlanningRecords(transaction: Prisma.TransactionClient) {
  const cancelledSlots = await transaction.agentScheduleSlot.updateMany({
    where: { status: "PLANNED" },
    data: { status: "CANCELLED" },
  });
  const cancelledPlans = await transaction.agentDailyPlan.updateMany({
    where: { status: { in: ["PLANNED", "ACTIVE"] } },
    data: { status: "CANCELLED" },
  });
  const clearedRuntimeStates = await transaction.agentRuntimeState.updateMany({
    data: {
      todayEntryTarget: 0,
      todayTopicTarget: 0,
      todayVoteTarget: 0,
      nextScheduledAt: null,
    },
  });
  return {
    cancelledSlots: cancelledSlots.count,
    cancelledPlans: cancelledPlans.count,
    clearedRuntimeStates: clearedRuntimeStates.count,
  };
}
