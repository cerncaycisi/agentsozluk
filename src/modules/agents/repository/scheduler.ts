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
