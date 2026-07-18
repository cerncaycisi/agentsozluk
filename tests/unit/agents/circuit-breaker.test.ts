import { describe, expect, it } from "vitest";
import {
  circuitBreakerConfigSchema,
  countConsecutiveCodexFailures,
  evaluateCircuitBreakers,
  type OperationalMetrics,
} from "@/modules/agents";

const config = circuitBreakerConfigSchema.parse({
  errorRateWindowMinutes: 15,
  errorRateThreshold: 0.5,
  consecutiveCodexFailures: 5,
  duplicateWindowSize: 50,
  duplicateThreshold: 0.4,
  duplicateCooldownMinutes: 60,
  utilizationWindowMinutes: 120,
  utilizationThreshold: 0.9,
});

const healthy: OperationalMetrics = {
  terminalRunsInErrorWindow: 10,
  failedRunsInErrorWindow: 1,
  consecutiveCodexFailures: 0,
  duplicateCandidateCount: 50,
  duplicateRejectionCount: 5,
  utilization15m: 0.2,
  utilization1h: 0.3,
  utilization2h: 0.4,
  oldestQueuedAt: null,
  longestActiveStartedAt: null,
};

describe("agent runtime circuit breakers", () => {
  it("counts only explicit consecutive Codex failures", () => {
    expect(
      countConsecutiveCodexFailures([
        { runStatus: "TIMED_OUT", errorCode: "CODEX_TIMEOUT" },
        { runStatus: "FAILED", errorCode: "CODEX_AUTH_REQUIRED" },
        { runStatus: "FAILED", errorCode: "WORKER_EXECUTION_FAILED" },
        { runStatus: "FAILED", errorCode: "CODEX_UPSTREAM_UNAVAILABLE" },
      ]),
    ).toBe(2);
    expect(
      countConsecutiveCodexFailures([
        { runStatus: "FAILED", errorCode: "WORKER_EXECUTION_FAILED" },
        { runStatus: "FAILED", errorCode: "CODEX_TIMEOUT" },
      ]),
    ).toBe(0);
  });

  it("keeps write and catch-up lanes open below strict thresholds", () => {
    expect(evaluateCircuitBreakers(config, healthy)).toMatchObject({
      runtimeErrorRate: 0.1,
      duplicateRejectionRate: 0.1,
      writeRunsPaused: false,
      runtimePaused: false,
      catchUpFrozen: false,
      contentSlowdown: false,
      capacityAtRisk: false,
    });
  });

  it("pauses new write runs above 50 percent errors and all runs at five Codex failures", () => {
    expect(
      evaluateCircuitBreakers(config, {
        ...healthy,
        failedRunsInErrorWindow: 6,
        consecutiveCodexFailures: 5,
      }),
    ).toMatchObject({
      runtimeErrorRate: 0.6,
      writeRunsPaused: true,
      runtimePaused: true,
    });
  });

  it("requires the full duplicate window and freezes catch-up only above utilization threshold", () => {
    expect(
      evaluateCircuitBreakers(config, {
        ...healthy,
        duplicateCandidateCount: 49,
        duplicateRejectionCount: 49,
        utilization2h: 0.9,
      }),
    ).toMatchObject({ duplicateRejectionRate: null, contentSlowdown: false, catchUpFrozen: false });
    expect(
      evaluateCircuitBreakers(config, {
        ...healthy,
        duplicateCandidateCount: 50,
        duplicateRejectionCount: 21,
        utilization2h: 0.91,
      }),
    ).toMatchObject({
      duplicateRejectionRate: 0.42,
      contentSlowdown: true,
      catchUpFrozen: true,
      capacityAtRisk: true,
    });
  });
});
