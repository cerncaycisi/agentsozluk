import { z } from "zod";

export const circuitBreakerConfigSchema = z
  .object({
    errorRateWindowMinutes: z.number().int().min(1).max(240),
    errorRateThreshold: z.number().min(0).max(1),
    consecutiveCodexFailures: z.number().int().min(1).max(100),
    duplicateWindowSize: z.number().int().min(1).max(500),
    duplicateThreshold: z.number().min(0).max(1),
    duplicateCooldownMinutes: z.number().int().min(1).max(1440),
    utilizationWindowMinutes: z.number().int().min(1).max(1440),
    utilizationThreshold: z.number().min(0).max(1),
  })
  .strict();

export type CircuitBreakerConfig = z.infer<typeof circuitBreakerConfigSchema>;

export interface OperationalMetrics {
  terminalRunsInErrorWindow: number;
  failedRunsInErrorWindow: number;
  consecutiveCodexFailures: number;
  duplicateCandidateCount: number;
  duplicateRejectionCount: number;
  utilization15m: number;
  utilization1h: number;
  utilization2h: number;
  oldestQueuedAt: Date | null;
  longestActiveStartedAt: Date | null;
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
  const utilizationActive = metrics.utilization2h > config.utilizationThreshold;
  return {
    runtimeErrorRate,
    duplicateRejectionRate,
    writeRunsPaused: errorRateActive || codexFailureActive,
    runtimePaused: codexFailureActive,
    catchUpFrozen: utilizationActive,
    contentSlowdown: duplicateActive,
    capacityAtRisk: utilizationActive,
    breakers: [
      {
        code: "RUNTIME_ERROR_RATE",
        active: errorRateActive,
        measured: runtimeErrorRate,
        threshold: config.errorRateThreshold,
      },
      {
        code: "CONSECUTIVE_CODEX_FAILURES",
        active: codexFailureActive,
        measured: metrics.consecutiveCodexFailures,
        threshold: config.consecutiveCodexFailures,
      },
      {
        code: "DUPLICATE_REJECTION_RATE",
        active: duplicateActive,
        measured: duplicateRejectionRate,
        threshold: config.duplicateThreshold,
      },
      {
        code: "WORKER_UTILIZATION_2H",
        active: utilizationActive,
        measured: metrics.utilization2h,
        threshold: config.utilizationThreshold,
      },
    ],
  };
}
