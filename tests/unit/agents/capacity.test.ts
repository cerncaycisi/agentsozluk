import { describe, expect, it } from "vitest";
import {
  assertDualConcurrencySupported,
  calculateRuntimeCapacity,
  capabilityFreshness,
  estimateRuntimeCompletion,
  runtimeFingerprint,
  type RuntimeCapabilityMeasurement,
} from "@/modules/agents/domain/capacity";

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

describe("agent runtime capacity", () => {
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

  it("uses measured p75 and a fixed 25 percent reserve", () => {
    const result = calculateRuntimeCapacity({
      capability,
      plannedRuns: 240,
      completedRuns: 20,
      estimatedPublishedMin: 480,
      estimatedPublishedMax: 720,
      configuredConcurrency: 1,
      degradedMode: false,
      now,
    });
    expect(result.requiredContentMinutes).toBe(720);
    expect(result.reservedCapacityMinutes).toBe(720);
    expect(result.capacityStatus).toBe("HEALTHY");
    expect(result.benchmark?.p75DurationMs).toBe(180_000);
  });

  it("reports risk and overload without silently reducing planned output", () => {
    const atRisk = calculateRuntimeCapacity({
      capability,
      plannedRuns: 250,
      completedRuns: 0,
      estimatedPublishedMin: 500,
      estimatedPublishedMax: 750,
      configuredConcurrency: 1,
      degradedMode: false,
      now,
    });
    expect(atRisk.capacityStatus).toBe("AT_RISK");
    expect(atRisk.plannedRuns).toBe(250);
    expect(atRisk.estimatedPublishedMin).toBe(500);
    expect(atRisk).toMatchObject({
      capacityRunBudget: 240,
      projectedPublishedMax: 720,
      projectedShortfallEntries: 30,
      projectedTargetMiss: true,
      warnings: ["CAPACITY_AT_RISK", "PROJECTED_TARGET_MISS"],
    });
    expect(
      calculateRuntimeCapacity({
        ...atRisk,
        capability,
        plannedRuns: 400,
        completedRuns: 0,
        configuredConcurrency: 1,
        degradedMode: false,
        now,
      }).capacityStatus,
    ).toBe("OVERLOADED");
    const degraded = calculateRuntimeCapacity({
      capability,
      plannedRuns: 250,
      completedRuns: 0,
      estimatedPublishedMin: 500,
      estimatedPublishedMax: 750,
      configuredConcurrency: 1,
      degradedMode: true,
      now,
    });
    expect(degraded).toMatchObject({
      capacityStatus: "DEGRADED",
      plannedRuns: 250,
      estimatedPublishedMin: 500,
      estimatedPublishedMax: 750,
    });
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
      plannedRuns: 100,
      completedRuns: 0,
      estimatedPublishedMin: 200,
      estimatedPublishedMax: 300,
      configuredConcurrency: 2,
      degradedMode: false,
      now,
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
    expect(runtimeFingerprint(["invalid"])).toEqual({});
  });

  it("shows an unattainable high target as shortfall without mutating that target", () => {
    const result = calculateRuntimeCapacity({
      capability,
      plannedRuns: 8,
      completedRuns: 0,
      estimatedPublishedMin: 16,
      estimatedPublishedMax: 24,
      targetPublishedEntries: 100,
      configuredConcurrency: 1,
      degradedMode: false,
      now,
      codexVersion: capability.codexVersion,
      promptProfileHash: capability.promptProfileHash,
    });
    expect(result).toMatchObject({
      capacityStatus: "AT_RISK",
      targetPublishedEntries: 100,
      projectedPublishedMax: 24,
      projectedShortfallEntries: 76,
      projectedTargetMiss: true,
      warnings: ["CAPACITY_AT_RISK", "PROJECTED_TARGET_MISS"],
    });
  });
});
