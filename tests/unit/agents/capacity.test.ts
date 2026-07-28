import { describe, expect, it } from "vitest";
import {
  assertDualConcurrencySupported,
  calculateRuntimeCapacity,
  capabilityFreshness,
  estimateRuntimeCompletion,
  runtimeFingerprint,
  type RuntimeCapabilityMeasurement,
} from "@/modules/agents/domain/capacity";
import { runtimeCapabilityPackageSchema } from "@/modules/agents/validation/capacity-schemas";

const now = new Date("2026-07-17T12:00:00.000Z");
const capability: RuntimeCapabilityMeasurement = {
  codexVersion: "codex-cli 2.4.0",
  promptProfileHash: "prompt-v1",
  benchmarkRunCount: 10,
  p50DurationMs: 120_000,
  p75DurationMs: 180_000,
  p95DurationMs: 240_000,
  maxDurationMs: 300_000,
  dualConcurrencySupported: true,
  availableMemoryMb: 900,
  capacityStatus: "HEALTHY",
  measuredAt: new Date("2026-07-16T12:00:00.000Z"),
  staleAt: new Date("2026-07-30T12:00:00.000Z"),
};

const capabilityInput = {
  codexVersion: "codex-cli 2.4.0",
  promptProfileHash: "a".repeat(64),
  benchmarkRunCount: 10,
  p50DurationMs: 120_000,
  p75DurationMs: 180_000,
  p95DurationMs: 240_000,
  maxDurationMs: 300_000,
  successfulActionCount: 10,
  proposedEntryActionCount: 8,
  publishedEntries: 0,
  failureRate: 0,
  duplicateRetryRate: 0,
  singleProcessPeakRssMb: 400,
  dualProcessPeakRssMb: null,
  systemPeakMemoryMb: 3000,
  availableMemoryMb: 900,
  swapInMb: 0,
  swapOutMb: 0,
  loadAverage1m: 1,
  dualRunSuccessCount: 0,
  oomDetected: false,
  swapThrashingDetected: false,
  healthStable: true,
  readinessStable: true,
  appLatencyImpact: { baselineP95Ms: 50, measuredP95Ms: 55, stable: true },
  databaseLatencyImpact: { baselineP95Ms: 10, measuredP95Ms: 12, stable: true },
  capacityStatus: "HEALTHY" as const,
};

describe("agent runtime capacity", () => {
  it("reports live capability without daily publication projections", () => {
    const result = calculateRuntimeCapacity({
      capability,
      configuredConcurrency: 1,
      degradedMode: false,
      now,
      codexVersion: capability.codexVersion,
      promptProfileHash: capability.promptProfileHash,
    });
    expect(result).toMatchObject({
      capacityStatus: "HEALTHY",
      configuredConcurrency: 1,
      effectiveConcurrency: 1,
      warnings: [],
    });
    expect(result).not.toHaveProperty("plannedRuns");
    expect(result).not.toHaveProperty("targetPublishedEntries");
    expect(result).not.toHaveProperty("projectedShortfallEntries");
  });

  it("estimates P75 completion from eligible queued and active Codex work", () => {
    expect(
      estimateRuntimeCompletion({
        now,
        p75DurationMs: 180_000,
        benchmarkFresh: true,
        concurrency: 2,
        eligibleQueuedRuns: 2,
        activeRunStartedAts: [new Date(now.getTime() - 60_000)],
      }),
    ).toEqual({
      durationMs: 240_000,
      estimatedAt: new Date(now.getTime() + 240_000),
    });
    expect(
      estimateRuntimeCompletion({
        now,
        p75DurationMs: 180_000,
        benchmarkFresh: false,
        concurrency: 1,
        eligibleQueuedRuns: 1,
        activeRunStartedAts: [],
      }),
    ).toBeNull();
  });

  it("marks age, Codex major and prompt profile changes as stale", () => {
    expect(
      capabilityFreshness(capability, {
        now: new Date("2026-08-01T00:00:00.000Z"),
        codexVersion: "codex-cli 3.0.0",
        promptProfileHash: "prompt-v2",
      }),
    ).toEqual({ fresh: false, staleReasons: ["AGE", "CODEX_MAJOR", "PROMPT_PROFILE"] });
  });

  it("requires a fresh successful measurement and 800 MB reserve for concurrency 2", () => {
    const liveFingerprint = {
      now,
      codexVersion: capability.codexVersion,
      promptProfileHash: capability.promptProfileHash,
    };
    expect(() => assertDualConcurrencySupported(capability, liveFingerprint)).not.toThrow();
    expect(() =>
      assertDualConcurrencySupported({ ...capability, availableMemoryMb: 799 }, liveFingerprint),
    ).toThrow(/capability/iu);
    expect(() =>
      assertDualConcurrencySupported(capability, {
        now,
        promptProfileHash: capability.promptProfileHash,
      }),
    ).toThrow(/capability/iu);
    expect(() =>
      assertDualConcurrencySupported(capability, {
        now,
        codexVersion: "codex-cli 3.0.0",
        promptProfileHash: capability.promptProfileHash,
      }),
    ).toThrow(/capability/iu);
    expect(() =>
      assertDualConcurrencySupported(capability, {
        now,
        codexVersion: capability.codexVersion,
        promptProfileHash: "prompt-v2",
      }),
    ).toThrow(/capability/iu);
    const result = calculateRuntimeCapacity({
      capability: { ...capability, dualConcurrencySupported: false },
      configuredConcurrency: 2,
      degradedMode: false,
      now,
      codexVersion: capability.codexVersion,
      promptProfileHash: capability.promptProfileHash,
    });
    expect(result.effectiveConcurrency).toBe(1);
  });

  it("extracts only safe runtime fingerprint fields from measured usage metadata", () => {
    expect(
      runtimeFingerprint({
        model: "codex-cli 2.4.1",
        promptProfileHash: "prompt-v1",
        rawPrompt: "must-not-propagate",
      }),
    ).toEqual({ codexVersion: "codex-cli 2.4.1", promptProfileHash: "prompt-v1" });
    expect(
      runtimeFingerprint({
        codexVersion: "codex-cli 0.144.6",
        model: "gpt-5.6-sol",
        reasoningEffort: "high",
      }),
    ).toEqual({ codexVersion: "codex-cli 0.144.6" });
    expect(runtimeFingerprint(["invalid"])).toEqual({});
  });

  it("accepts one cold/warm/dual package only when all fingerprints match", () => {
    const valid = {
      cold: capabilityInput,
      warm: { ...capabilityInput, p50DurationMs: 110_000 },
      dual: {
        ...capabilityInput,
        dualProcessPeakRssMb: 700,
        dualRunSuccessCount: 2,
      },
    };
    expect(runtimeCapabilityPackageSchema.parse(valid)).toEqual(valid);
    expect(() =>
      runtimeCapabilityPackageSchema.parse({
        ...valid,
        warm: { ...valid.warm, promptProfileHash: "b".repeat(64) },
      }),
    ).toThrow(/fingerprint/iu);
    expect(() =>
      runtimeCapabilityPackageSchema.parse({
        ...valid,
        dual: { ...valid.dual, dualRunSuccessCount: 1 },
      }),
    ).toThrow(/dual/iu);
  });
});
