import type { Prisma } from "@prisma/client";
import { Prisma as PrismaValues } from "@prisma/client";

/**
 * One-shot recovery helper for installations that still contain pre-stochastic
 * daily plans. It is intentionally not exported through the active agent
 * module and must never be called by the scheduler or a request handler.
 */
export async function retireLegacyDailyPlanningRecords(transaction: Prisma.TransactionClient) {
  const cancelledRuns = await transaction.agentRun.updateMany({
    where: {
      runStatus: "QUEUED",
      OR: [
        { runType: { in: ["SCHEDULED_WAKE", "DAILY_CATCH_UP"] } },
        { trigger: { in: ["SCHEDULER_SLOT", "AUTO_CATCH_UP"] } },
      ],
    },
    data: {
      runStatus: "CANCELLED",
      finishedAt: new Date(),
      errorCode: "DAILY_PLANNING_RETIRED",
      errorSummary: "Legacy daily-planning run was retired before stochastic runtime recovery.",
    },
  });
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
    cancelledRuns: cancelledRuns.count,
    cancelledSlots: cancelledSlots.count,
    cancelledPlans: cancelledPlans.count,
    clearedRuntimeStates: clearedRuntimeStates.count,
  };
}

export function clearLegacyPendingQuotaSettings(
  transaction: Prisma.TransactionClient,
  actorId: string,
) {
  return transaction.agentGlobalSettings.update({
    where: { id: "global" },
    data: {
      pendingQuotaSettings: PrismaValues.DbNull,
      pendingQuotaEffectiveDate: null,
      settingsVersion: { increment: 1 },
      updatedById: actorId,
    },
    select: { settingsVersion: true },
  });
}
