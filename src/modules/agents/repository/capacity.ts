import { Prisma } from "@prisma/client";
import type { RuntimeCapabilityMeasurementInput } from "@/modules/agents/validation/capacity-schemas";
import {
  countConsecutiveCodexFailures,
  type CircuitBreakerConfig,
} from "@/modules/agents/domain/circuit-breaker";
import { runtimeFingerprint } from "@/modules/agents/domain/capacity";

export function getLatestRuntimeCapability(transaction: Prisma.TransactionClient) {
  return transaction.agentRuntimeCapability.findFirst({
    orderBy: [{ measuredAt: "desc" }, { id: "desc" }],
  });
}

export async function getLatestRuntimeFingerprintRecord(transaction: Prisma.TransactionClient) {
  const [run, measurement] = await Promise.all([
    transaction.agentRun.findFirst({
      where: { usageMetadata: { not: Prisma.JsonNull }, finishedAt: { not: null } },
      orderBy: [{ finishedAt: "desc" }, { id: "desc" }],
      select: { usageMetadata: true, finishedAt: true },
    }),
    transaction.agentRuntimeEvent.findFirst({
      where: { eventType: "agent.capacity.measured" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { metadata: true, createdAt: true },
    }),
  ]);
  const fingerprintedRun = runtimeFingerprint(run?.usageMetadata).codexVersion ? run : null;
  if (
    !measurement ||
    (fingerprintedRun?.finishedAt && fingerprintedRun.finishedAt >= measurement.createdAt)
  )
    return fingerprintedRun;
  return { usageMetadata: measurement.metadata, finishedAt: measurement.createdAt };
}

export async function getCapacityPlanningMetrics(
  transaction: Prisma.TransactionClient,
  localDate: Date,
) {
  const where = {
    dailyPlan: { localDate },
    status: { not: "CANCELLED" as const },
  };
  const [planned, completedRuns, target] = await Promise.all([
    transaction.agentScheduleSlot.aggregate({
      where,
      _count: { _all: true },
      _sum: { desiredEntryMin: true, desiredEntryMax: true },
      _max: { scheduledAt: true },
    }),
    transaction.agentScheduleSlot.count({
      where: { dailyPlan: { localDate }, status: "COMPLETED" },
    }),
    transaction.agentDailyPlan.aggregate({
      where: { localDate, status: { not: "CANCELLED" } },
      _sum: { entryTarget: true },
    }),
  ]);
  return {
    plannedRuns: planned._count._all,
    completedRuns,
    estimatedPublishedMin: planned._sum.desiredEntryMin ?? 0,
    estimatedPublishedMax: planned._sum.desiredEntryMax ?? 0,
    targetPublishedEntries: target._sum.entryTarget ?? 0,
    latestScheduledAt: planned._max.scheduledAt,
  };
}

export function getLatestCapacityPlanningEvidence(
  transaction: Prisma.TransactionClient,
  localDate: Date,
) {
  const dayStart = new Date(
    Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth(), localDate.getUTCDate(), -3),
  );
  const nextDayStart = new Date(dayStart.getTime() + 24 * 60 * 60_000);
  return transaction.agentRuntimeEvent.findFirst({
    where: {
      eventType: { in: ["capacity.degraded_plan", "capacity.slo_miss.projected"] },
      createdAt: { gte: dayStart, lt: nextDayStart },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { eventType: true, safeMessage: true, metadata: true, createdAt: true },
  });
}

export function getLatestActualCapacitySloMiss(transaction: Prisma.TransactionClient) {
  return transaction.agentRuntimeEvent.findFirst({
    where: { eventType: "capacity.slo_miss.actual" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { eventType: true, safeMessage: true, metadata: true, createdAt: true },
  });
}

export async function getClosedDaySloMetrics(
  transaction: Prisma.TransactionClient,
  currentLocalDate: Date,
) {
  const localDate = new Date(currentLocalDate.getTime() - 24 * 60 * 60_000);
  const dateKey = localDate.toISOString().slice(0, 10);
  const dayStart = new Date(
    Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth(), localDate.getUTCDate(), -3),
  );
  const nextDayStart = new Date(dayStart.getTime() + 24 * 60 * 60_000);
  const [target, publishedEntries, degradedPlans, existingMiss] = await Promise.all([
    transaction.agentDailyPlan.aggregate({
      where: { localDate, status: { not: "CANCELLED" } },
      _sum: { entryTarget: true },
      _count: { _all: true },
    }),
    transaction.agentContentRecord.count({
      where: {
        createdAt: { gte: dayStart, lt: nextDayStart },
        entry: { status: "ACTIVE" },
      },
    }),
    transaction.agentDailyPlan.count({
      where: {
        localDate,
        capacitySnapshot: { capacityStatus: "DEGRADED" },
      },
    }),
    transaction.agentRuntimeEvent.findFirst({
      where: {
        eventType: "capacity.slo_miss.actual",
        metadata: { path: ["localDate"], equals: dateKey },
      },
      select: { id: true },
    }),
  ]);
  const targetPublishedEntries = target._sum.entryTarget ?? 0;
  return {
    localDate,
    dateKey,
    planCount: target._count._all,
    targetPublishedEntries,
    publishedEntries,
    shortfallEntries: Math.max(0, targetPublishedEntries - publishedEntries),
    degradedMode: degradedPlans > 0,
    alreadyRecorded: Boolean(existingMiss),
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
          proposedEntryActionCount: input.proposedEntryActionCount,
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
  // Merge overlap/adjacency within each run, then sum across runs. Parallel
  // runs consume separate concurrency lanes and must therefore remain additive
  // before division by (window * configured concurrency).
  const rows = await transaction.$queryRaw<Array<{ busyMs: number }>>`
    WITH measured_intervals AS (
      SELECT
        run."id" AS "intervalKey",
        (item ->> 'startedAt')::timestamptz AS "startedAt",
        (item ->> 'finishedAt')::timestamptz AS "finishedAt"
      FROM "agent_runs" AS run
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(run."usageMetadata" -> 'codexIntervals') = 'array'
            THEN run."usageMetadata" -> 'codexIntervals'
          ELSE '[]'::jsonb
        END
      ) AS item
      WHERE item ->> 'startedAt' ~ '^\\d{4}-\\d{2}-\\d{2}T'
        AND item ->> 'finishedAt' ~ '^\\d{4}-\\d{2}-\\d{2}T'
    ),
    legacy_intervals AS (
      SELECT
        run."id" AS "intervalKey",
        run."finishedAt" -
          ((run."usageMetadata" ->> 'durationMs')::double precision * interval '1 millisecond')
          AS "startedAt",
        run."finishedAt" AS "finishedAt"
      FROM "agent_runs" AS run
      WHERE run."finishedAt" IS NOT NULL
        AND jsonb_typeof(run."usageMetadata") = 'object'
        AND jsonb_typeof(run."usageMetadata" -> 'codexIntervals') IS NULL
        AND run."usageMetadata" ->> 'durationMs' ~ '^\\d+(?:\\.\\d+)?$'
    ),
    active_intervals AS (
      SELECT
        state."currentRunId" AS "intervalKey",
        COALESCE(
          (
            SELECT MIN(event."createdAt")
            FROM "agent_runtime_events" AS event
            WHERE event."runId" = state."currentRunId"
              AND event."eventType" = 'agent.heartbeat'
              AND event."metadata" ->> 'runtimeStatus' IN ('THINKING', 'VALIDATING')
              AND event."createdAt" > COALESCE(
                (
                  SELECT MAX(previous."createdAt")
                  FROM "agent_runtime_events" AS previous
                  WHERE previous."runId" = state."currentRunId"
                    AND previous."eventType" = 'agent.heartbeat'
                    AND previous."metadata" ->> 'runtimeStatus' NOT IN ('THINKING', 'VALIDATING')
                ),
                '-infinity'::timestamptz
              )
          ),
          state."lastHeartbeatAt",
          ${now}
        ) AS "startedAt",
        ${now} AS "finishedAt"
      FROM "agent_runtime_states" AS state
      WHERE state."currentRunId" IS NOT NULL
        AND state."runtimeStatus" IN ('THINKING', 'VALIDATING')
    ),
    codex_intervals AS (
      SELECT * FROM measured_intervals
      UNION ALL
      SELECT * FROM legacy_intervals
      UNION ALL
      SELECT * FROM active_intervals
    ),
    clipped_intervals AS (
      SELECT
        "intervalKey",
        GREATEST("startedAt", ${cutoff}) AS "startedAt",
        LEAST("finishedAt", ${now}) AS "finishedAt"
      FROM codex_intervals
      WHERE "startedAt" < ${now}
        AND "finishedAt" > ${cutoff}
        AND "finishedAt" > "startedAt"
    ),
    interval_frontiers AS (
      SELECT
        "intervalKey",
        "startedAt",
        "finishedAt",
        MAX("finishedAt") OVER (
          PARTITION BY "intervalKey"
          ORDER BY "startedAt", "finishedAt"
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ) AS "previousFinishedAt"
      FROM clipped_intervals
    ),
    interval_groups AS (
      SELECT
        "intervalKey",
        "startedAt",
        "finishedAt",
        SUM(
          CASE
            WHEN "previousFinishedAt" IS NULL OR "startedAt" > "previousFinishedAt" THEN 1
            ELSE 0
          END
        ) OVER (
          PARTITION BY "intervalKey"
          ORDER BY "startedAt", "finishedAt"
        ) AS "intervalGroup"
      FROM interval_frontiers
    ),
    merged_intervals AS (
      SELECT
        "intervalKey",
        MIN("startedAt") AS "startedAt",
        MAX("finishedAt") AS "finishedAt"
      FROM interval_groups
      GROUP BY "intervalKey", "intervalGroup"
    )
    SELECT COALESCE(
      SUM(
        EXTRACT(EPOCH FROM ("finishedAt" - "startedAt")) * 1000
      ),
      0
    )::double precision AS "busyMs"
    FROM merged_intervals
  `;
  return rows[0]?.busyMs ?? 0;
}

async function eligibleQueueMetrics(transaction: Prisma.TransactionClient, now: Date) {
  const rows = await transaction.$queryRaw<Array<{ count: number; oldestAt: Date | null }>>`
    SELECT
      COUNT(*)::int AS "count",
      MIN(GREATEST("createdAt", "availableAt")) AS "oldestAt"
    FROM "agent_runs"
    WHERE "runStatus" = 'QUEUED'
      AND "availableAt" <= ${now}
  `;
  return rows[0] ?? { count: 0, oldestAt: null };
}

export async function getRuntimeOperationalMetrics(
  transaction: Prisma.TransactionClient,
  input: { now: Date; concurrency: 1 | 2; config: CircuitBreakerConfig },
) {
  const cutoff15m = new Date(input.now.getTime() - 15 * 60_000);
  const cutoff1h = new Date(input.now.getTime() - 60 * 60_000);
  const cutoff2h = new Date(input.now.getTime() - 2 * 60 * 60_000);
  const utilizationWindows = [
    { minutes: 15, cutoff: cutoff15m },
    { minutes: 60, cutoff: cutoff1h },
    { minutes: 120, cutoff: cutoff2h },
    ...(input.config.utilizationWindowMinutes === 15 ||
    input.config.utilizationWindowMinutes === 60 ||
    input.config.utilizationWindowMinutes === 120
      ? []
      : [
          {
            minutes: input.config.utilizationWindowMinutes,
            cutoff: new Date(input.now.getTime() - input.config.utilizationWindowMinutes * 60_000),
          },
        ]),
  ];
  const errorCutoff = new Date(input.now.getTime() - input.config.errorRateWindowMinutes * 60_000);
  const breakerReset = await transaction.agentRuntimeEvent.findFirst({
    where: { eventType: "breaker.reset", createdAt: { lte: input.now } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { createdAt: true },
  });
  const breakerCutoff =
    breakerReset && breakerReset.createdAt > errorCutoff ? breakerReset.createdAt : errorCutoff;
  const [terminalRuns, latestTerminalRuns, recentCandidates, queue, activeRuns, busyWindowEntries] =
    await Promise.all([
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
      eligibleQueueMetrics(transaction, input.now),
      transaction.agentRun.findMany({
        where: { runStatus: { in: ["RUNNING", "CANCEL_REQUESTED"] } },
        orderBy: [{ startedAt: "asc" }, { id: "asc" }],
        select: { startedAt: true },
      }),
      Promise.all(
        utilizationWindows.map(
          async ({ minutes, cutoff }) =>
            [minutes, await busyDurationMs(transaction, input.now, cutoff)] as const,
        ),
      ),
    ]);
  const busyByWindowMinutes = new Map(busyWindowEntries);
  const denominator = (minutes: number) => minutes * 60_000 * input.concurrency;
  const utilization = (minutes: number) =>
    (busyByWindowMinutes.get(minutes) ?? 0) / denominator(minutes);
  return {
    terminalRunsInErrorWindow: terminalRuns.length,
    failedRunsInErrorWindow: terminalRuns.filter(({ runStatus }) =>
      ["FAILED", "TIMED_OUT"].includes(runStatus),
    ).length,
    consecutiveCodexFailures: countConsecutiveCodexFailures(latestTerminalRuns),
    duplicateCandidateCount: recentCandidates.length,
    duplicateRejectionCount: recentCandidates.filter(
      ({ rejectionCode }) => rejectionCode === "DUPLICATE_SIMILARITY",
    ).length,
    utilization15m: utilization(15),
    utilization1h: utilization(60),
    utilization2h: utilization(120),
    configuredWindowUtilization: utilization(input.config.utilizationWindowMinutes),
    eligibleQueuedRunCount: queue.count,
    activeRunStartedAts: activeRuns.flatMap(({ startedAt }) => (startedAt ? [startedAt] : [])),
    oldestQueuedAt: queue.oldestAt,
    longestActiveStartedAt: activeRuns[0]?.startedAt ?? null,
  };
}
