import { AppError } from "@/lib/http/errors";

export const DEFAULT_AVAILABLE_CONTENT_MINUTES = 960;
export const MINIMUM_CAPACITY_RESERVE_FACTOR = 0.75;
export const MINIMUM_DUAL_CONCURRENCY_MEMORY_MB = 800;

export interface RuntimeCapabilityMeasurement {
  codexVersion: string;
  promptProfileHash: string;
  benchmarkRunCount: number;
  p50DurationMs: number;
  p75DurationMs: number;
  p95DurationMs: number;
  maxDurationMs: number;
  dualConcurrencySupported: boolean;
  availableMemoryMb: number;
  capacityStatus: "UNKNOWN" | "HEALTHY" | "AT_RISK" | "DEGRADED" | "OVERLOADED";
  measuredAt: Date;
  staleAt: Date;
}

export type CapabilityStaleReason = "AGE" | "CODEX_MAJOR" | "PROMPT_PROFILE";

export interface RuntimeFingerprint {
  codexVersion?: string;
  promptProfileHash?: string;
}

export type CapacityWarning =
  | "BENCHMARK_MISSING"
  | "BENCHMARK_STALE"
  | "CAPACITY_AT_RISK"
  | "OVERLOADED"
  | "PROJECTED_TARGET_MISS";

export function estimateRuntimeCompletion(input: {
  now: Date;
  p75DurationMs: number | null;
  benchmarkFresh: boolean;
  concurrency: 1 | 2;
  eligibleQueuedRuns: number;
  activeRunStartedAts: Date[];
}): { durationMs: number; estimatedAt: Date } | null {
  if (
    !Number.isInteger(input.eligibleQueuedRuns) ||
    input.eligibleQueuedRuns < 0 ||
    ![1, 2].includes(input.concurrency)
  )
    throw new RangeError("Runtime completion estimator girdileri geçersizdir.");
  if (!input.benchmarkFresh || input.p75DurationMs === null || input.p75DurationMs <= 0)
    return null;
  const activeRemainingMs = input.activeRunStartedAts.reduce(
    (sum, startedAt) =>
      sum + Math.max(0, input.p75DurationMs! - (input.now.getTime() - startedAt.getTime())),
    0,
  );
  const queuedWorkMs = input.eligibleQueuedRuns * input.p75DurationMs;
  const durationMs = Math.ceil((activeRemainingMs + queuedWorkMs) / input.concurrency);
  return { durationMs, estimatedAt: new Date(input.now.getTime() + durationMs) };
}

export function runtimeFingerprint(usageMetadata: unknown): RuntimeFingerprint {
  if (!usageMetadata || typeof usageMetadata !== "object" || Array.isArray(usageMetadata))
    return {};
  const metadata = usageMetadata as Record<string, unknown>;
  return {
    ...(typeof metadata.codexVersion === "string"
      ? { codexVersion: metadata.codexVersion }
      : typeof metadata.model === "string"
        ? { codexVersion: metadata.model }
        : {}),
    ...(typeof metadata.promptProfileHash === "string"
      ? { promptProfileHash: metadata.promptProfileHash }
      : {}),
  };
}

function majorVersion(version: string): number | null {
  const match = version.match(/(?:^|\D)(\d+)(?:\.|\D|$)/u);
  return match?.[1] ? Number(match[1]) : null;
}

export function capabilityFreshness(
  capability: RuntimeCapabilityMeasurement,
  input: { now: Date; codexVersion?: string; promptProfileHash?: string },
): { fresh: boolean; staleReasons: CapabilityStaleReason[] } {
  const staleReasons: CapabilityStaleReason[] = [];
  if (capability.staleAt <= input.now) staleReasons.push("AGE");
  if (input.codexVersion !== undefined) {
    const measuredMajor = majorVersion(capability.codexVersion);
    const currentMajor = majorVersion(input.codexVersion);
    if (measuredMajor === null || currentMajor === null || measuredMajor !== currentMajor) {
      staleReasons.push("CODEX_MAJOR");
    }
  }
  if (
    input.promptProfileHash !== undefined &&
    capability.promptProfileHash !== input.promptProfileHash
  ) {
    staleReasons.push("PROMPT_PROFILE");
  }
  return { fresh: staleReasons.length === 0, staleReasons };
}

export function supportsDualConcurrency(
  capability: RuntimeCapabilityMeasurement | null,
  input: { now: Date; codexVersion?: string; promptProfileHash?: string },
): boolean {
  if (!input.codexVersion || !input.promptProfileHash) return false;
  if (!capability || !capabilityFreshness(capability, input).fresh) return false;
  return (
    capability.dualConcurrencySupported &&
    capability.availableMemoryMb >= MINIMUM_DUAL_CONCURRENCY_MEMORY_MB &&
    capability.capacityStatus !== "UNKNOWN" &&
    capability.capacityStatus !== "OVERLOADED"
  );
}

export function assertDualConcurrencySupported(
  capability: RuntimeCapabilityMeasurement | null,
  input: { now: Date } & RuntimeFingerprint,
): void {
  if (!supportsDualConcurrency(capability, input)) {
    throw new AppError(
      "AGENT_CAPABILITY_REQUIRED",
      409,
      "Concurrency 2 için güncel ve başarılı runtime capability ölçümü gereklidir.",
    );
  }
}

export function calculateRuntimeCapacity(input: {
  capability: RuntimeCapabilityMeasurement | null;
  plannedRuns: number;
  completedRuns: number;
  estimatedPublishedMin: number;
  estimatedPublishedMax: number;
  targetPublishedEntries?: number;
  configuredConcurrency: 1 | 2;
  degradedMode: boolean;
  now: Date;
  availableContentMinutes?: number;
  codexVersion?: string;
  promptProfileHash?: string;
}) {
  const availableContentMinutes =
    input.availableContentMinutes ?? DEFAULT_AVAILABLE_CONTENT_MINUTES;
  const freshness = input.capability
    ? capabilityFreshness(input.capability, {
        now: input.now,
        ...(input.codexVersion !== undefined ? { codexVersion: input.codexVersion } : {}),
        ...(input.promptProfileHash !== undefined
          ? { promptProfileHash: input.promptProfileHash }
          : {}),
      })
    : null;
  const effectiveConcurrency =
    input.configuredConcurrency === 2 &&
    supportsDualConcurrency(input.capability, {
      now: input.now,
      ...(input.codexVersion !== undefined ? { codexVersion: input.codexVersion } : {}),
      ...(input.promptProfileHash !== undefined
        ? { promptProfileHash: input.promptProfileHash }
        : {}),
    })
      ? 2
      : 1;
  const grossCapacityMinutes = availableContentMinutes * effectiveConcurrency;
  const reservedCapacityMinutes = grossCapacityMinutes * MINIMUM_CAPACITY_RESERVE_FACTOR;
  const requiredContentMinutes = input.capability
    ? (input.plannedRuns * input.capability.p75DurationMs) / 60_000
    : null;
  let capacityStatus: RuntimeCapabilityMeasurement["capacityStatus"] = "UNKNOWN";
  if (input.capability && freshness?.fresh && requiredContentMinutes !== null) {
    capacityStatus = input.degradedMode
      ? "DEGRADED"
      : requiredContentMinutes > grossCapacityMinutes
        ? "OVERLOADED"
        : requiredContentMinutes > reservedCapacityMinutes
          ? "AT_RISK"
          : "HEALTHY";
  }
  const capacityRunBudget =
    input.capability && freshness?.fresh
      ? Math.floor(reservedCapacityMinutes / (input.capability.p75DurationMs / 60_000))
      : null;
  const projectedPublishedMax =
    capacityRunBudget === null
      ? null
      : input.plannedRuns === 0
        ? 0
        : Math.min(
            input.estimatedPublishedMax,
            Math.floor(
              input.estimatedPublishedMax * Math.min(1, capacityRunBudget / input.plannedRuns),
            ),
          );
  const targetPublishedEntries = input.targetPublishedEntries ?? input.estimatedPublishedMax;
  const projectedShortfallEntries =
    projectedPublishedMax === null
      ? null
      : Math.max(0, targetPublishedEntries - projectedPublishedMax);
  if (capacityStatus === "HEALTHY" && !input.degradedMode && (projectedShortfallEntries ?? 0) > 0)
    capacityStatus = "AT_RISK";
  const warnings: CapacityWarning[] = [];
  if (!input.capability) warnings.push("BENCHMARK_MISSING");
  else if (!freshness?.fresh) warnings.push("BENCHMARK_STALE");
  if (capacityStatus === "AT_RISK") warnings.push("CAPACITY_AT_RISK");
  if (capacityStatus === "OVERLOADED") warnings.push("OVERLOADED");
  if ((projectedShortfallEntries ?? 0) > 0) warnings.push("PROJECTED_TARGET_MISS");
  return {
    capacityStatus,
    plannedRuns: input.plannedRuns,
    completedRuns: input.completedRuns,
    configuredConcurrency: input.configuredConcurrency,
    effectiveConcurrency,
    availableContentMinutes,
    reserveFactor: MINIMUM_CAPACITY_RESERVE_FACTOR,
    grossCapacityMinutes,
    reservedCapacityMinutes,
    requiredContentMinutes,
    estimatedUtilization:
      requiredContentMinutes === null ? null : requiredContentMinutes / grossCapacityMinutes,
    capacityReserve:
      requiredContentMinutes === null ? null : 1 - requiredContentMinutes / grossCapacityMinutes,
    estimatedPublishedMin: input.estimatedPublishedMin,
    estimatedPublishedMax: input.estimatedPublishedMax,
    targetPublishedEntries,
    capacityRunBudget,
    projectedPublishedMax,
    projectedShortfallEntries,
    projectedTargetMiss: projectedShortfallEntries !== null && projectedShortfallEntries > 0,
    warnings,
    benchmark: input.capability
      ? {
          runCount: input.capability.benchmarkRunCount,
          p50DurationMs: input.capability.p50DurationMs,
          p75DurationMs: input.capability.p75DurationMs,
          p95DurationMs: input.capability.p95DurationMs,
          maxDurationMs: input.capability.maxDurationMs,
          measuredAt: input.capability.measuredAt,
          staleAt: input.capability.staleAt,
          stale: !freshness!.fresh,
          staleReasons: freshness!.staleReasons,
        }
      : null,
  };
}
