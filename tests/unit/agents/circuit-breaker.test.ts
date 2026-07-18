import { describe, expect, it } from "vitest";
import {
  circuitBreakerConfigSchema,
  countConsecutiveCodexFailures,
  DEFAULT_UTILIZATION_WINDOW_MINUTES,
  evaluateCircuitBreakerTransition,
  evaluateCircuitBreakers,
  evaluateProductionCriticalBreakerAutoPause,
  PRODUCTION_CRITICAL_BREAKER_WINDOW_MS,
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
  configuredWindowUtilization: 0.4,
  oldestQueuedAt: null,
  longestActiveStartedAt: null,
};

describe("agent runtime circuit breakers", () => {
  it("defaults the utilization window to 120 minutes and enforces its 1..1440 bounds", () => {
    const withoutUtilizationWindow = { ...config, utilizationWindowMinutes: undefined };
    expect(
      circuitBreakerConfigSchema.parse(withoutUtilizationWindow).utilizationWindowMinutes,
    ).toBe(DEFAULT_UTILIZATION_WINDOW_MINUTES);
    expect(
      circuitBreakerConfigSchema.safeParse({ ...config, utilizationWindowMinutes: 1 }).success,
    ).toBe(true);
    expect(
      circuitBreakerConfigSchema.safeParse({ ...config, utilizationWindowMinutes: 1440 }).success,
    ).toBe(true);
    expect(
      circuitBreakerConfigSchema.safeParse({ ...config, utilizationWindowMinutes: 0 }).success,
    ).toBe(false);
    expect(
      circuitBreakerConfigSchema.safeParse({ ...config, utilizationWindowMinutes: 1441 }).success,
    ).toBe(false);
  });

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
      activeCriticalCodes: ["RUNTIME_ERROR_RATE", "CONSECUTIVE_CODEX_FAILURES"],
      breakers: expect.arrayContaining([
        expect.objectContaining({ code: "RUNTIME_ERROR_RATE", severity: "CRITICAL" }),
        expect.objectContaining({ code: "CONSECUTIVE_CODEX_FAILURES", severity: "CRITICAL" }),
      ]),
    });
  });

  it("requires the full duplicate window and freezes catch-up only above utilization threshold", () => {
    expect(
      evaluateCircuitBreakers(config, {
        ...healthy,
        duplicateCandidateCount: 49,
        duplicateRejectionCount: 49,
        utilization2h: 0.9,
        configuredWindowUtilization: 0.9,
      }),
    ).toMatchObject({ duplicateRejectionRate: null, contentSlowdown: false, catchUpFrozen: false });
    expect(
      evaluateCircuitBreakers(config, {
        ...healthy,
        duplicateCandidateCount: 50,
        duplicateRejectionCount: 21,
        utilization2h: 0.91,
        configuredWindowUtilization: 0.91,
      }),
    ).toMatchObject({
      duplicateRejectionRate: 0.42,
      contentSlowdown: true,
      catchUpFrozen: true,
      capacityAtRisk: true,
      activeCriticalCodes: [],
      breakers: expect.arrayContaining([
        expect.objectContaining({ code: "DUPLICATE_REJECTION_RATE", severity: "NON_CRITICAL" }),
        expect.objectContaining({ code: "WORKER_UTILIZATION_WINDOW", severity: "NON_CRITICAL" }),
      ]),
    });
  });

  it("keeps the mandatory two-hour breaker while also evaluating the configured window", () => {
    const fixedGuardConfig = {
      ...config,
      utilizationWindowMinutes: 30,
      utilizationThreshold: 1,
    };
    expect(
      evaluateCircuitBreakers(fixedGuardConfig, {
        ...healthy,
        utilization15m: 0.1,
        utilization1h: 0.1,
        utilization2h: 0.91,
        configuredWindowUtilization: 0.1,
      }),
    ).toMatchObject({
      catchUpFrozen: true,
      capacityAtRisk: true,
      breakers: expect.arrayContaining([
        expect.objectContaining({
          code: "WORKER_UTILIZATION_2H",
          active: true,
          measured: 0.91,
          threshold: 0.9,
          windowMinutes: 120,
        }),
        expect.objectContaining({
          code: "WORKER_UTILIZATION_WINDOW",
          active: false,
          measured: 0.1,
          threshold: 1,
          windowMinutes: 30,
        }),
      ]),
    });
    const configuredGuardConfig = { ...config, utilizationWindowMinutes: 30 };
    expect(
      evaluateCircuitBreakers(configuredGuardConfig, {
        ...healthy,
        utilization15m: 0.1,
        utilization1h: 0.1,
        utilization2h: 0.1,
        configuredWindowUtilization: 0.91,
      }),
    ).toMatchObject({
      catchUpFrozen: true,
      capacityAtRisk: true,
      breakers: expect.arrayContaining([
        expect.objectContaining({ code: "WORKER_UTILIZATION_2H", active: false }),
        expect.objectContaining({
          code: "WORKER_UTILIZATION_WINDOW",
          active: true,
          measured: 0.91,
          windowMinutes: 30,
        }),
      ]),
    });
  });

  it("reports breaker transitions without repeating an already active code", () => {
    const current = [
      { code: "RUNTIME_ERROR_RATE", active: true },
      { code: "CONSECUTIVE_CODEX_FAILURES", active: false },
      { code: "WORKER_UTILIZATION_2H", active: true },
    ];
    expect(
      evaluateCircuitBreakerTransition(["RUNTIME_ERROR_RATE", "STALE_BREAKER"], current),
    ).toEqual({
      activeCodes: ["RUNTIME_ERROR_RATE", "WORKER_UTILIZATION_2H"],
      triggeredCodes: ["WORKER_UTILIZATION_2H"],
      clearedCodes: ["STALE_BREAKER"],
      changed: true,
    });
    expect(
      evaluateCircuitBreakerTransition(
        ["WORKER_UTILIZATION_2H", "RUNTIME_ERROR_RATE", "RUNTIME_ERROR_RATE"],
        current,
      ),
    ).toEqual({
      activeCodes: ["RUNTIME_ERROR_RATE", "WORKER_UTILIZATION_2H"],
      triggeredCodes: [],
      clearedCodes: [],
      changed: false,
    });
  });

  it("auto-pauses only for active critical breakers inside the first four hours", () => {
    const activationStartedAt = new Date("2026-07-18T08:00:00.000Z");
    expect(
      evaluateProductionCriticalBreakerAutoPause({
        activationStartedAt,
        now: new Date(activationStartedAt.getTime() + PRODUCTION_CRITICAL_BREAKER_WINDOW_MS - 1),
        activeCriticalCodes: ["RUNTIME_ERROR_RATE", "RUNTIME_ERROR_RATE"],
      }),
    ).toMatchObject({
      inProtectionWindow: true,
      activeCriticalCodes: ["RUNTIME_ERROR_RATE"],
      shouldAutoPause: true,
    });
    expect(
      evaluateProductionCriticalBreakerAutoPause({
        activationStartedAt,
        now: new Date(activationStartedAt.getTime() + PRODUCTION_CRITICAL_BREAKER_WINDOW_MS),
        activeCriticalCodes: ["RUNTIME_ERROR_RATE"],
      }),
    ).toMatchObject({ inProtectionWindow: false, shouldAutoPause: false });
    expect(
      evaluateProductionCriticalBreakerAutoPause({
        activationStartedAt,
        now: activationStartedAt,
        activeCriticalCodes: [],
      }),
    ).toMatchObject({ inProtectionWindow: true, shouldAutoPause: false });
    expect(
      evaluateProductionCriticalBreakerAutoPause({
        activationStartedAt: null,
        now: activationStartedAt,
        activeCriticalCodes: ["CONSECUTIVE_CODEX_FAILURES"],
      }),
    ).toMatchObject({ inProtectionWindow: false, shouldAutoPause: false });
  });
});
