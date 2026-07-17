import type { Prisma } from "@prisma/client";
import type { GeneratedDailyPlan } from "@/modules/agents/domain/scheduler";

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
