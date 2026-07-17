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
  now = new Date(),
): void {
  if (!supportsDualConcurrency(capability, { now })) {
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
