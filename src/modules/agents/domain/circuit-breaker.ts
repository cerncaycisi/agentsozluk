import { z } from "zod";

export const DEFAULT_UTILIZATION_WINDOW_MINUTES = 120;
export const MANDATORY_UTILIZATION_2H_THRESHOLD = 0.9;

export const circuitBreakerConfigSchema = z
  .object({
    errorRateWindowMinutes: z.number().int().min(1).max(240),
    errorRateThreshold: z.number().min(0).max(1),
    consecutiveCodexFailures: z.number().int().min(1).max(100),
    duplicateWindowSize: z.number().int().min(1).max(500),
    duplicateThreshold: z.number().min(0).max(1),
    duplicateCooldownMinutes: z.number().int().min(1).max(1440),
    utilizationWindowMinutes: z
      .number()
      .int()
      .min(1)
      .max(1440)
      .default(DEFAULT_UTILIZATION_WINDOW_MINUTES),
    utilizationThreshold: z.number().min(0).max(1),
  })
  .strict();

export type CircuitBreakerConfig = z.infer<typeof circuitBreakerConfigSchema>;

export const PRODUCTION_CRITICAL_BREAKER_WINDOW_MS = 4 * 60 * 60 * 1000;

export type CircuitBreakerSeverity = "CRITICAL" | "NON_CRITICAL";

export interface ProductionCriticalBreakerDecision {
  activationStartedAt: Date | null;
  protectionEndsAt: Date | null;
  inProtectionWindow: boolean;
  activeCriticalCodes: string[];
  shouldAutoPause: boolean;
}

export interface CircuitBreakerTransition {
  activeCodes: string[];
  triggeredCodes: string[];
  clearedCodes: string[];
  changed: boolean;
}

export interface OperationalMetrics {
  terminalRunsInErrorWindow: number;
  failedRunsInErrorWindow: number;
  consecutiveCodexFailures: number;
  duplicateCandidateCount: number;
  duplicateRejectionCount: number;
  utilization15m: number;
  utilization1h: number;
  utilization2h: number;
  configuredWindowUtilization: number;
  oldestQueuedAt: Date | null;
  longestActiveStartedAt: Date | null;
}

interface TerminalRunFailure {
  runStatus: string;
  errorCode: string | null;
}

function isCodexFailure(run: TerminalRunFailure): boolean {
  return (
    ["FAILED", "TIMED_OUT"].includes(run.runStatus) && run.errorCode?.startsWith("CODEX_") === true
  );
}

export function countConsecutiveCodexFailures(runsNewestFirst: TerminalRunFailure[]): number {
  const firstNonCodexFailure = runsNewestFirst.findIndex((run) => !isCodexFailure(run));
  return firstNonCodexFailure === -1 ? runsNewestFirst.length : firstNonCodexFailure;
}

export function evaluateCircuitBreakers(config: CircuitBreakerConfig, metrics: OperationalMetrics) {
  const runtimeErrorRate =
    metrics.terminalRunsInErrorWindow === 0
      ? null
      : metrics.failedRunsInErrorWindow / metrics.terminalRunsInErrorWindow;
  const duplicateRejectionRate =
    metrics.duplicateCandidateCount < config.duplicateWindowSize
      ? null
      : metrics.duplicateRejectionCount / metrics.duplicateCandidateCount;
  const errorRateActive = runtimeErrorRate !== null && runtimeErrorRate > config.errorRateThreshold;
  const codexFailureActive = metrics.consecutiveCodexFailures >= config.consecutiveCodexFailures;
  const duplicateActive =
    duplicateRejectionRate !== null && duplicateRejectionRate > config.duplicateThreshold;
  const mandatoryUtilization2hActive = metrics.utilization2h > MANDATORY_UTILIZATION_2H_THRESHOLD;
  const configuredUtilizationActive =
    metrics.configuredWindowUtilization > config.utilizationThreshold;
  const utilizationActive = mandatoryUtilization2hActive || configuredUtilizationActive;
  const breakers = [
    {
      code: "RUNTIME_ERROR_RATE",
      severity: "CRITICAL" as const,
      active: errorRateActive,
      measured: runtimeErrorRate,
      threshold: config.errorRateThreshold,
    },
    {
      code: "CONSECUTIVE_CODEX_FAILURES",
      severity: "CRITICAL" as const,
      active: codexFailureActive,
      measured: metrics.consecutiveCodexFailures,
      threshold: config.consecutiveCodexFailures,
    },
    {
      code: "DUPLICATE_REJECTION_RATE",
      severity: "NON_CRITICAL" as const,
      active: duplicateActive,
      measured: duplicateRejectionRate,
      threshold: config.duplicateThreshold,
    },
    {
      code: "WORKER_UTILIZATION_2H",
      severity: "NON_CRITICAL" as const,
      active: mandatoryUtilization2hActive,
      measured: metrics.utilization2h,
      threshold: MANDATORY_UTILIZATION_2H_THRESHOLD,
      windowMinutes: 120,
    },
    {
      code: "WORKER_UTILIZATION_WINDOW",
      severity: "NON_CRITICAL" as const,
      active: configuredUtilizationActive,
      measured: metrics.configuredWindowUtilization,
      threshold: config.utilizationThreshold,
      windowMinutes: config.utilizationWindowMinutes,
    },
  ];
  return {
    runtimeErrorRate,
    duplicateRejectionRate,
    writeRunsPaused: errorRateActive || codexFailureActive,
    runtimePaused: codexFailureActive,
    catchUpFrozen: utilizationActive,
    contentSlowdown: duplicateActive,
    capacityAtRisk: utilizationActive,
    activeCriticalCodes: breakers
      .filter(({ active, severity }) => active && severity === "CRITICAL")
      .map(({ code }) => code),
    breakers,
  };
}

export function evaluateCircuitBreakerTransition(
  previousActiveCodes: readonly string[],
  breakers: ReadonlyArray<{ code: string; active: boolean }>,
): CircuitBreakerTransition {
  const normalize = (codes: readonly string[]) =>
    [...new Set(codes.filter((code) => code.length > 0))].sort();
  const previous = normalize(previousActiveCodes);
  const activeCodes = normalize(breakers.flatMap(({ code, active }) => (active ? [code] : [])));
  const previousSet = new Set(previous);
  const activeSet = new Set(activeCodes);
  const triggeredCodes = activeCodes.filter((code) => !previousSet.has(code));
  const clearedCodes = previous.filter((code) => !activeSet.has(code));
  return {
    activeCodes,
    triggeredCodes,
    clearedCodes,
    changed: triggeredCodes.length > 0 || clearedCodes.length > 0,
  };
}

export function evaluateProductionCriticalBreakerAutoPause(input: {
  activationStartedAt: Date | null;
  now: Date;
  activeCriticalCodes: string[];
}): ProductionCriticalBreakerDecision {
  const activeCriticalCodes = [...new Set(input.activeCriticalCodes)].sort();
  if (!input.activationStartedAt)
    return {
      activationStartedAt: null,
      protectionEndsAt: null,
      inProtectionWindow: false,
      activeCriticalCodes,
      shouldAutoPause: false,
    };
  const protectionEndsAt = new Date(
    input.activationStartedAt.getTime() + PRODUCTION_CRITICAL_BREAKER_WINDOW_MS,
  );
  const inProtectionWindow = input.now >= input.activationStartedAt && input.now < protectionEndsAt;
  return {
    activationStartedAt: input.activationStartedAt,
    protectionEndsAt,
    inProtectionWindow,
    activeCriticalCodes,
    shouldAutoPause: inProtectionWindow && activeCriticalCodes.length > 0,
  };
}
