import type { Prisma } from "@prisma/client";
import type { RuntimeCapabilityMeasurementInput } from "@/modules/agents/validation/capacity-schemas";

export function getLatestRuntimeCapability(transaction: Prisma.TransactionClient) {
  return transaction.agentRuntimeCapability.findFirst({
    orderBy: [{ measuredAt: "desc" }, { id: "desc" }],
  });
}

export async function getCapacityPlanningMetrics(
  transaction: Prisma.TransactionClient,
  localDate: Date,
) {
  const where = {
    dailyPlan: { localDate },
    status: { not: "CANCELLED" as const },
  };
  const [planned, completedRuns] = await Promise.all([
    transaction.agentScheduleSlot.aggregate({
      where,
      _count: { _all: true },
      _sum: { desiredEntryMin: true, desiredEntryMax: true },
    }),
    transaction.agentScheduleSlot.count({
      where: { dailyPlan: { localDate }, status: "COMPLETED" },
    }),
  ]);
  return {
    plannedRuns: planned._count._all,
    completedRuns,
    estimatedPublishedMin: planned._sum.desiredEntryMin ?? 0,
    estimatedPublishedMax: planned._sum.desiredEntryMax ?? 0,
  };
}

export function createRuntimeCapabilityRecord(
  transaction: Prisma.TransactionClient,
  input: RuntimeCapabilityMeasurementInput & {
    dualConcurrencySupported: boolean;
    measuredAt: Date;
    staleAt: Date;
  },
) {
  return transaction.agentRuntimeCapability.create({
    data: {
      codexVersion: input.codexVersion,
      promptProfileHash: input.promptProfileHash,
      benchmarkRunCount: input.benchmarkRunCount,
      p50DurationMs: input.p50DurationMs,
      p75DurationMs: input.p75DurationMs,
      p95DurationMs: input.p95DurationMs,
      maxDurationMs: input.maxDurationMs,
      singleProcessPeakRssMb: input.singleProcessPeakRssMb,
      dualProcessPeakRssMb: input.dualProcessPeakRssMb,
      dualConcurrencySupported: input.dualConcurrencySupported,
      appLatencyImpact: {
        ...input.appLatencyImpact,
        healthStable: input.healthStable,
        readinessStable: input.readinessStable,
        systemSafety: {
          systemPeakMemoryMb: input.systemPeakMemoryMb,
          swapInMb: input.swapInMb,
          swapOutMb: input.swapOutMb,
          loadAverage1m: input.loadAverage1m,
          oomDetected: input.oomDetected,
          swapThrashingDetected: input.swapThrashingDetected,
        },
        benchmarkOutcomes: {
          successfulActionCount: input.successfulActionCount,
          publishedEntries: input.publishedEntries,
          failureRate: input.failureRate,
          duplicateRetryRate: input.duplicateRetryRate,
          dualRunSuccessCount: input.dualRunSuccessCount,
        },
      },
      databaseLatencyImpact: input.databaseLatencyImpact,
      availableMemoryMb: input.availableMemoryMb,
      capacityStatus: input.capacityStatus,
      measuredAt: input.measuredAt,
      staleAt: input.staleAt,
    },
  });
}
