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
  return new Date(
    Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth(), localDate.getUTCDate(), -3),
  );
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

export async function planRuntimeMaintenanceAndCatchUp(
  transaction: Prisma.TransactionClient,
  input: {
    agentProfileId: string;
    localDate: Date;
    now: Date;
    catchUpFrozen: boolean;
    concurrency: 1 | 2;
    scheduledTimeoutSeconds: number;
    reflectionTimeoutSeconds: number;
    sourceRefreshTimeoutSeconds: number;
  },
) {
  const dateKey = input.localDate.toISOString().slice(0, 10);
  const dayStart = istanbulDayStart(input.localDate);
  const nextDayStart = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const clock = istanbulClock(input.now);
  await transaction.agentRun.updateMany({
    where: {
      agentProfileId: input.agentProfileId,
      trigger: "AUTO_CATCH_UP",
      runStatus: "QUEUED",
      createdAt: { lt: dayStart },
    },
    data: { runStatus: "CANCELLED", finishedAt: input.now, errorCode: "CATCH_UP_DAY_EXPIRED" },
  });
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
      runtimeState: {
        select: { todayDate: true, todayEntryTarget: true, todayPublishedEntries: true },
      },
    },
  });
  if (!profile?.currentPersonaVersionId) return { maintenanceQueued: 0, catchUpQueued: 0 };
  let maintenanceQueued = 0;
  const createMaintenance = async (definition: {
    trigger: string;
    runType: "REFLECTION" | "SOURCE_REFRESH";
    timeoutSeconds: number;
    allowSourceReading: boolean;
  }) => {
    const idempotencyKey = `maintenance:${definition.trigger}:${input.agentProfileId}:${dateKey}`;
    if (await transaction.agentRun.findUnique({ where: { idempotencyKey } })) return;
    await transaction.agentRun.create({
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
    maintenanceQueued += 1;
  };
  if (clock.hour >= 2 && profile.personaEvolutionEnabled)
    await createMaintenance({
      trigger: "NIGHTLY_MEMORY_CONSOLIDATION",
      runType: "REFLECTION",
      timeoutSeconds: input.reflectionTimeoutSeconds,
      allowSourceReading: false,
    });
  if (clock.weekday === "Sun" && clock.hour >= 3 && profile.personaEvolutionEnabled)
    await createMaintenance({
      trigger: "WEEKLY_PERSONA_REFLECTION",
      runType: "REFLECTION",
      timeoutSeconds: input.reflectionTimeoutSeconds,
      allowSourceReading: false,
    });
  if (clock.hour >= 4 && profile.sourceEvolutionEnabled)
    await createMaintenance({
      trigger: "DAILY_SOURCE_REFRESH",
      runType: "SOURCE_REFRESH",
      timeoutSeconds: input.sourceRefreshTimeoutSeconds,
      allowSourceReading: true,
    });
  const localMinute = clock.hour * 60 + clock.minute;
  if (
    input.catchUpFrozen ||
    localMinute < 20 * 60 ||
    localMinute >= 23 * 60 + 30 ||
    !profile.runtimeState?.todayDate ||
    profile.runtimeState.todayDate.getTime() !== input.localDate.getTime()
  )
    return { maintenanceQueued, catchUpQueued: 0 };
  const remaining =
    profile.runtimeState.todayEntryTarget - profile.runtimeState.todayPublishedEntries;
  if (remaining <= 0) return { maintenanceQueued, catchUpQueued: 0 };
  const [pendingScheduledSlots, pendingScheduledRuns, activeCatchUp, lastCatchUp, queueLength] =
    await Promise.all([
      transaction.agentScheduleSlot.count({
        where: {
          agentProfileId: input.agentProfileId,
          dailyPlan: { localDate: input.localDate },
          status: { in: ["PLANNED", "QUEUED", "RUNNING"] },
        },
      }),
      transaction.agentRun.count({
        where: {
          agentProfileId: input.agentProfileId,
          trigger: "SCHEDULER_SLOT",
          runStatus: { in: ["QUEUED", "RUNNING", "CANCEL_REQUESTED"] },
        },
      }),
      transaction.agentRun.count({
        where: {
          agentProfileId: input.agentProfileId,
          trigger: "AUTO_CATCH_UP",
          runStatus: { in: ["QUEUED", "RUNNING", "CANCEL_REQUESTED"] },
        },
      }),
      transaction.agentRun.findFirst({
        where: {
          agentProfileId: input.agentProfileId,
          trigger: "AUTO_CATCH_UP",
          createdAt: { gte: dayStart, lt: nextDayStart },
        },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      transaction.agentRun.count({
        where: {
          runStatus: "QUEUED",
          runType: { notIn: ["READ_ONLY", "DRY_RUN", "REFLECTION", "SOURCE_REFRESH"] },
        },
      }),
    ]);
  if (
    pendingScheduledSlots > 0 ||
    pendingScheduledRuns > 0 ||
    activeCatchUp > 0 ||
    queueLength >= input.concurrency * 3 ||
    (lastCatchUp && input.now.getTime() - lastCatchUp.createdAt.getTime() < 25 * 60 * 1000)
  )
    return { maintenanceQueued, catchUpQueued: 0 };
  const bucket = Math.floor(localMinute / 25);
  await transaction.agentRun.create({
    data: {
      agentProfileId: input.agentProfileId,
      runType: "DAILY_CATCH_UP",
      queuePriority: "DAILY_CATCH_UP",
      trigger: "AUTO_CATCH_UP",
      personaVersionId: profile.currentPersonaVersionId,
      idempotencyKey: `catch-up:${input.agentProfileId}:${dateKey}:${bucket}`,
      availableAt: input.now,
      timeoutSeconds: input.scheduledTimeoutSeconds,
      desiredEntryMin: 1,
      desiredEntryMax: Math.min(4, remaining),
      createdAt: input.now,
    },
  });
  return { maintenanceQueued, catchUpQueued: 1 };
}
