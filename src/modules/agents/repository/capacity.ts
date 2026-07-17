import type { Prisma } from "@prisma/client";
import type { RuntimeCapabilityMeasurementInput } from "@/modules/agents/validation/capacity-schemas";
import type { CircuitBreakerConfig } from "@/modules/agents/domain/circuit-breaker";

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

async function busyDurationMs(
  transaction: Prisma.TransactionClient,
  now: Date,
  cutoff: Date,
): Promise<number> {
  const rows = await transaction.$queryRaw<Array<{ busyMs: number }>>`
    SELECT COALESCE(
      SUM(
        GREATEST(
          0,
          EXTRACT(EPOCH FROM (
            LEAST(COALESCE("finishedAt", ${now}), ${now}) - GREATEST("startedAt", ${cutoff})
          )) * 1000
        )
      ),
      0
    )::double precision AS "busyMs"
    FROM "agent_runs"
    WHERE "startedAt" IS NOT NULL
      AND "startedAt" < ${now}
      AND COALESCE("finishedAt", ${now}) > ${cutoff}
  `;
  return rows[0]?.busyMs ?? 0;
}

export async function getRuntimeOperationalMetrics(
  transaction: Prisma.TransactionClient,
  input: { now: Date; concurrency: 1 | 2; config: CircuitBreakerConfig },
) {
  const cutoff15m = new Date(input.now.getTime() - 15 * 60_000);
  const cutoff1h = new Date(input.now.getTime() - 60 * 60_000);
  const cutoff2h = new Date(input.now.getTime() - 2 * 60 * 60_000);
  const errorCutoff = new Date(input.now.getTime() - input.config.errorRateWindowMinutes * 60_000);
  const breakerReset = await transaction.agentRuntimeEvent.findFirst({
    where: { eventType: "breaker.reset", createdAt: { lte: input.now } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { createdAt: true },
  });
  const breakerCutoff =
    breakerReset && breakerReset.createdAt > errorCutoff ? breakerReset.createdAt : errorCutoff;
  const [
    terminalRuns,
    latestTerminalRuns,
    recentCandidates,
    oldestQueued,
    longestActive,
    busy15m,
    busy1h,
    busy2h,
  ] = await Promise.all([
    transaction.agentRun.findMany({
      where: {
        finishedAt: { gte: breakerCutoff, lte: input.now },
        runStatus: { in: ["SUCCEEDED", "PARTIAL", "FAILED", "TIMED_OUT"] },
      },
      select: { runStatus: true },
    }),
    transaction.agentRun.findMany({
      where: {
        finishedAt: {
          not: null,
          lte: input.now,
          ...(breakerReset ? { gt: breakerReset.createdAt } : {}),
        },
        runStatus: { in: ["SUCCEEDED", "PARTIAL", "FAILED", "TIMED_OUT"] },
      },
      orderBy: [{ finishedAt: "desc" }, { id: "desc" }],
      take: input.config.consecutiveCodexFailures,
      select: { runStatus: true, errorCode: true },
    }),
    transaction.agentAction.findMany({
      where: {
        actionType: { in: ["CREATE_ENTRY", "CREATE_TOPIC_WITH_ENTRY", "EDIT_OWN_ENTRY"] },
        ...(breakerReset ? { createdAt: { gt: breakerReset.createdAt } } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.config.duplicateWindowSize,
      select: { rejectionCode: true },
    }),
    transaction.agentRun.findFirst({
      where: { runStatus: "QUEUED" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { createdAt: true },
    }),
    transaction.agentRun.findFirst({
      where: { runStatus: { in: ["RUNNING", "CANCEL_REQUESTED"] } },
      orderBy: [{ startedAt: "asc" }, { id: "asc" }],
      select: { startedAt: true },
    }),
    busyDurationMs(transaction, input.now, cutoff15m),
    busyDurationMs(transaction, input.now, cutoff1h),
    busyDurationMs(transaction, input.now, cutoff2h),
  ]);
  const denominator = (minutes: number) => minutes * 60_000 * input.concurrency;
  return {
    terminalRunsInErrorWindow: terminalRuns.length,
    failedRunsInErrorWindow: terminalRuns.filter(({ runStatus }) =>
      ["FAILED", "TIMED_OUT"].includes(runStatus),
    ).length,
    consecutiveCodexFailures:
      latestTerminalRuns.findIndex(
        ({ runStatus, errorCode }) =>
          !["FAILED", "TIMED_OUT"].includes(runStatus) ||
          !(errorCode?.startsWith("CODEX_") || errorCode === "WORKER_EXECUTION_FAILED"),
      ) === -1
        ? latestTerminalRuns.length
        : latestTerminalRuns.findIndex(
            ({ runStatus, errorCode }) =>
              !["FAILED", "TIMED_OUT"].includes(runStatus) ||
              !(errorCode?.startsWith("CODEX_") || errorCode === "WORKER_EXECUTION_FAILED"),
          ),
    duplicateCandidateCount: recentCandidates.length,
    duplicateRejectionCount: recentCandidates.filter(
      ({ rejectionCode }) => rejectionCode === "DUPLICATE_SIMILARITY",
    ).length,
    utilization15m: busy15m / denominator(15),
    utilization1h: busy1h / denominator(60),
    utilization2h: busy2h / denominator(120),
    oldestQueuedAt: oldestQueued?.createdAt ?? null,
    longestActiveStartedAt: longestActive?.startedAt ?? null,
  };
}
