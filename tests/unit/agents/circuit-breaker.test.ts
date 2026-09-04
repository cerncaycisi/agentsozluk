import { describe, expect, it } from "vitest";
import {
  CIRCUIT_BREAKER_HALF_OPEN_COOLDOWN_MS,
  circuitBreakerConfigSchema,
  countConsecutiveCodexFailures,
  DEFAULT_UTILIZATION_WINDOW_MINUTES,
  evaluateCircuitBreakerHalfOpenProbe,
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
        { runStatus: "FAILED", errorCode: "CODEX_ACTION_WORTHINESS_OUTPUT_INVALID" },
        { runStatus: "FAILED", errorCode: "CODEX_DECISION_PROVENANCE_INVALID" },
        { runStatus: "FAILED", errorCode: "WORKER_EXECUTION_FAILED" },
        { runStatus: "FAILED", errorCode: "CODEX_UPSTREAM_UNAVAILABLE" },
      ]),
    ).toBe(3);
    expect(
      countConsecutiveCodexFailures([
        { runStatus: "FAILED", errorCode: "WORKER_EXECUTION_FAILED" },
        { runStatus: "FAILED", errorCode: "CODEX_TIMEOUT" },
      ]),
    ).toBe(0);
  });

  it("keeps the write lane open below strict thresholds", () => {
    expect(evaluateCircuitBreakers(config, healthy)).toMatchObject({
      runtimeErrorRate: 0.1,
      duplicateRejectionRate: 0.1,
      writeRunsPaused: false,
      runtimePaused: false,
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

  it("requires the full duplicate window and marks capacity risk above utilization threshold", () => {
    expect(
      evaluateCircuitBreakers(config, {
        ...healthy,
        duplicateCandidateCount: 49,
        duplicateRejectionCount: 49,
        utilization2h: 0.9,
        configuredWindowUtilization: 0.9,
      }),
    ).toMatchObject({
      duplicateRejectionRate: null,
      contentSlowdown: false,
      capacityAtRisk: false,
    });
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

describe("yarı-açık (half-open) deneme", () => {
  /*
    Kesici, ölçüsünü son sonlanmış koşulardan alıyor. Hiç koşuya izin vermezse
    ölçü donuyor ve kesici ASLA kapanamıyor: 3 Eylül 2026'da toplum tam bu
    yüzden 15 saat 48 dakika durdu, oysa arıza dakikalar içinde geçmişti.

    Bu testler iki şeyi birden tutuyor: çıkış yolu gerçekten açılıyor VE
    kapı gevşemiyor.
  */
  const activatedAt = new Date("2026-09-03T14:47:53.000Z");
  const probe = (overrides: Partial<Parameters<typeof evaluateCircuitBreakerHalfOpenProbe>[0]>) =>
    evaluateCircuitBreakerHalfOpenProbe({
      runtimePaused: true,
      activatedAt,
      now: new Date(activatedAt.getTime() + CIRCUIT_BREAKER_HALF_OPEN_COOLDOWN_MS),
      activeLeaseCount: 0,
      ...overrides,
    });

  it("soğuma dolunca tek denemeye izin verir", () => {
    expect(probe({})).toMatchObject({ allowProbe: true, reason: "PROBE_ALLOWED" });
  });

  it("soğuma dolmadan izin vermez", () => {
    expect(
      probe({ now: new Date(activatedAt.getTime() + CIRCUIT_BREAKER_HALF_OPEN_COOLDOWN_MS - 1) }),
    ).toMatchObject({ allowProbe: false, reason: "COOLING_DOWN" });
  });

  it("çalışan koşu varken ikinci denemeyi açmaz", () => {
    /*
      "Tek deneme" güvencesi bu: zaten koşan bir run varsa o denemedir.
      İkincisini açmak arızayı besler.
    */
    expect(probe({ activeLeaseCount: 1 })).toMatchObject({
      allowProbe: false,
      reason: "PROBE_IN_FLIGHT",
    });
  });

  it("aktivasyon zamanı bilinmiyorsa deneme yapmaz", () => {
    // Emin olunmayan yerde dar tarafa düşmek: bugünkü davranış korunur.
    expect(probe({ activatedAt: null })).toMatchObject({
      allowProbe: false,
      reason: "ACTIVATION_UNKNOWN",
    });
  });

  it("kesici kapalıyken deneme kavramı yoktur", () => {
    expect(probe({ runtimePaused: false })).toMatchObject({
      allowProbe: false,
      reason: "BREAKER_CLOSED",
    });
  });

  it("her denemeden sonra soğumayı yeniden kurar", () => {
    /*
      Bu olmadan soğuma ilk aktivasyona sabitleniyordu: kalıcı bir sağlayıcı
      arızasında her lease çağrısı yeni deneme açıp arızayı besler ve olay
      fırtınası üretirdi (Sol hakem turu, 4 Eylül).
    */
    const lastProbeAt = new Date(activatedAt.getTime() + 30 * 60 * 1000);
    // Aktivasyondan çok sonra ama son denemeden hemen sonra: yeni deneme YOK.
    expect(probe({ lastProbeAt, now: new Date(lastProbeAt.getTime() + 60 * 1000) })).toMatchObject({
      allowProbe: false,
      reason: "COOLING_DOWN",
    });
    // Son denemeden bir soğuma sonra: yeniden izin var.
    expect(
      probe({
        lastProbeAt,
        now: new Date(lastProbeAt.getTime() + CIRCUIT_BREAKER_HALF_OPEN_COOLDOWN_MS),
      }),
    ).toMatchObject({ allowProbe: true, reason: "PROBE_ALLOWED" });
  });

  it("eski bir deneme kaydı soğumayı geri almaz", () => {
    // Kesici yeniden açıldıysa referans aktivasyondur, ondan önceki deneme değil.
    expect(probe({ lastProbeAt: new Date(activatedAt.getTime() - 60 * 60 * 1000) })).toMatchObject({
      allowProbe: true,
      reason: "PROBE_ALLOWED",
    });
  });

  it("soğuma, kesicinin ölçüm penceresinden bağımsız ve makul", () => {
    /*
      Çok kısa olursa her lease denemesi yeni bir koşu açıp arızayı besler;
      çok uzun olursa kesinti gereksiz uzar. 10 dakika ikisinin arasında.
    */
    expect(CIRCUIT_BREAKER_HALF_OPEN_COOLDOWN_MS).toBe(10 * 60 * 1000);
  });
});
