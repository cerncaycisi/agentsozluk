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

/**
 * Kritik kesici açıkken tek bir DENEME koşusuna izin verilene kadar beklenecek süre.
 *
 * 10 dakika: sağlayıcı arızalarının çoğu bundan kısa sürüyor, ama her lease
 * denemesinde yeni bir koşu açıp arızayı beslemeyecek kadar da uzun.
 */
export const CIRCUIT_BREAKER_HALF_OPEN_COOLDOWN_MS = 10 * 60 * 1000;

export interface CircuitBreakerHalfOpenDecision {
  allowProbe: boolean;
  reason:
    | "BREAKER_CLOSED"
    | "ACTIVATION_UNKNOWN"
    | "COOLING_DOWN"
    | "PROBE_IN_FLIGHT"
    | "PROBE_ALLOWED";
  probeEligibleAt: Date | null;
}

/**
 * Yarı-açık (half-open) deneme kararı.
 *
 * Bu olmadan kesici KENDİ ÇIKIŞ KOŞULUNU İMKÂNSIZ KILIYOR ve 3 Eylül 2026'da
 * toplumu 15 saat 48 dakika durdurdu (`docs/OLAY_SESSIZ_DURMA_2026-09-03.md`).
 * Zincir şuydu: kritik kesici lease'i kapatıyor → alınmayan queued koşular
 * zamanlayıcıyı da kilitliyor (`QUEUE_NOT_EMPTY`) → kesicinin ölçüsü
 * (`countConsecutiveCodexFailures`) son sonlanmış koşulardan hesaplandığı için
 * yeni koşu olmayınca DONUYOR. Yani kesicinin kapanması için başarılı koşu
 * gerekiyordu ama kesici bütün koşuları engelliyordu; tek çıkış operatörün
 * runtime'ı kapatıp açmasıydı.
 *
 * Karar bilerek dar: soğuma dolmadan deneme yok, aynı anda birden fazla deneme
 * yok, aktivasyon zamanı bilinmiyorsa deneme yok. Yani kesici KAPALI kalmaya
 * devam ediyor — yalnız çıkabilir hâle geliyor.
 */
export function evaluateCircuitBreakerHalfOpenProbe(input: {
  runtimePaused: boolean;
  activatedAt: Date | null;
  now: Date;
  activeLeaseCount: number;
  cooldownMs?: number;
}): CircuitBreakerHalfOpenDecision {
  if (!input.runtimePaused)
    return { allowProbe: false, reason: "BREAKER_CLOSED", probeEligibleAt: null };
  /*
    Aktivasyon zamanı okunamıyorsa deneme YOK: bu durumda bugünkü davranış
    (tümden kapalı) korunuyor. Emin olunmayan yerde geniş değil dar tarafa
    düşmek, bir güvenlik mekanizmasında doğru varsayılan.
  */
  if (!input.activatedAt)
    return { allowProbe: false, reason: "ACTIVATION_UNKNOWN", probeEligibleAt: null };
  const cooldownMs = input.cooldownMs ?? CIRCUIT_BREAKER_HALF_OPEN_COOLDOWN_MS;
  const probeEligibleAt = new Date(input.activatedAt.getTime() + cooldownMs);
  if (input.now < probeEligibleAt)
    return { allowProbe: false, reason: "COOLING_DOWN", probeEligibleAt };
  /*
    Zaten çalışan bir koşu varsa o koşu denemedir; ikinciyi açmak arızayı
    besler ve "tek deneme" güvencesini bozar.
  */
  if (input.activeLeaseCount > 0)
    return { allowProbe: false, reason: "PROBE_IN_FLIGHT", probeEligibleAt };
  return { allowProbe: true, reason: "PROBE_ALLOWED", probeEligibleAt };
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
