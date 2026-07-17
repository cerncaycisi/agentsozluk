import { describe, expect, it } from "vitest";
import {
  assertDualConcurrencySupported,
  calculateRuntimeCapacity,
  capabilityFreshness,
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
    expect(() => assertDualConcurrencySupported(capability, now)).not.toThrow();
    expect(() =>
      assertDualConcurrencySupported({ ...capability, availableMemoryMb: 799 }, now),
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
});
