import { describe, expect, it, vi } from "vitest";
import {
  resolveEffectiveRuntimeConcurrency,
  type EffectiveRuntimeConcurrencyDependencies,
} from "@/modules/agents/application/runtime-concurrency";
import type { RuntimeCapabilityMeasurement } from "@/modules/agents/domain/capacity";
import { calculateRuntimeCapacity, runtimeFingerprint } from "@/modules/agents/domain/capacity";
import { RUNTIME_PROMPT_PROFILE_HASH } from "@/runtime/prompt-profile";

const now = new Date("2026-07-17T12:00:00.000Z");

// Repository tam satırı döndürüyor; `id` kararın hangi ölçüme dayandığını gösterir.
const fresh: RuntimeCapabilityMeasurement & { id: string } = {
  id: "cap-fresh",
  codexVersion: "codex-cli 2.4.0",
  promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
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
const matchingFingerprint = { usageMetadata: { codexVersion: "codex-cli 2.4.0" }, finishedAt: now };
const tx = {} as never;

function deps(
  capability: (RuntimeCapabilityMeasurement & { id?: string }) | null,
  fingerprint: unknown = matchingFingerprint,
) {
  return {
    getLatestRuntimeCapability: vi.fn(async () => capability),
    getLatestRuntimeFingerprintRecord: vi.fn(async () => fingerprint),
  } as unknown as EffectiveRuntimeConcurrencyDependencies;
}

const resolve = (
  capability: (RuntimeCapabilityMeasurement & { id?: string }) | null,
  fingerprint: unknown = matchingFingerprint,
  configuredConcurrency = 2,
) =>
  resolveEffectiveRuntimeConcurrency(
    tx,
    { configuredConcurrency, now },
    deps(capability, fingerprint),
  );

describe("effective runtime concurrency", () => {
  it("keeps a single lane without asking for evidence when the setting is already one", async () => {
    const dependencies = deps(fresh);
    const result = await resolveEffectiveRuntimeConcurrency(
      tx,
      { configuredConcurrency: 1, now },
      dependencies,
    );
    expect(result.concurrency).toBe(1);
    expect(result.reason).toBe("CONFIGURED_SINGLE");
    expect(dependencies.getLatestRuntimeCapability).not.toHaveBeenCalled();
  });

  it("runs two lanes while the measurement still matches the running profile", async () => {
    const result = await resolve(fresh);
    expect(result.concurrency).toBe(2);
    expect(result.reason).toBe("EVIDENCE_FRESH");
    expect(result.staleReasons).toEqual([]);
  });

  /*
    Astra hakem turu (14 Eylül), P1: önceki aday burada "kayıt yoksa ayarı koru" diye
    2 döndürüyordu. O dönüş, değişikliğin birleştirmeyi amaçladığı predicate'i baypas
    edip kanıtsız çift eşzamanlılığa izin veriyordu.
  */
  it("falls back to one lane when no benchmark was ever recorded", async () => {
    const result = await resolve(null);
    expect(result.concurrency).toBe(1);
    expect(result.reason).toBe("BENCHMARK_MISSING");
    expect(result.measurementId).toBeNull();
  });

  it("matches the capacity view the operator reads, including the missing-benchmark case", async () => {
    const { codexVersion: version } = runtimeFingerprint(matchingFingerprint.usageMetadata);
    for (const capability of [fresh, null]) {
      const applied = await resolve(capability);
      const shown = calculateRuntimeCapacity({
        capability,
        configuredConcurrency: 2,
        degradedMode: false,
        now,
        ...(version !== undefined ? { codexVersion: version } : {}),
        promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
      });
      expect(applied.concurrency).toBe(shown.effectiveConcurrency);
    }
  });

  it("reports which evidence went stale so the drop is not silent", async () => {
    const expired = { ...fresh, id: "cap-expired", staleAt: new Date("2026-07-01T12:00:00.000Z") };
    const result = await resolve(expired);
    expect(result.concurrency).toBe(1);
    expect(result.reason).toBe("EVIDENCE_STALE");
    expect(result.staleReasons).toContain("AGE");
    expect(result.configuredConcurrency).toBe(2);
    expect(result.measurementId).toBe("cap-expired");
    expect(result.staleAt).toEqual(expired.staleAt);
  });

  it("treats a measurement taken under a different prompt profile as stale", async () => {
    const result = await resolve({ ...fresh, promptProfileHash: "a".repeat(64) });
    expect(result.concurrency).toBe(1);
    expect(result.staleReasons).toContain("PROMPT_PROFILE");
  });

  it("treats a different codex major version as stale", async () => {
    const result = await resolve({ ...fresh, codexVersion: "codex-cli 1.9.0" });
    expect(result.concurrency).toBe(1);
    expect(result.staleReasons).toContain("CODEX_MAJOR");
  });

  it("expires exactly at staleAt rather than a moment later", async () => {
    const result = await resolve({ ...fresh, staleAt: now });
    expect(result.concurrency).toBe(1);
    expect(result.staleReasons).toContain("AGE");
  });

  it("refuses two lanes when no running version can be read at all", async () => {
    for (const fingerprint of [null, { usageMetadata: {}, finishedAt: now }]) {
      const result = await resolve(fresh, fingerprint);
      expect(result.concurrency).toBe(1);
      expect(result.reason).toBe("CODEX_VERSION_UNKNOWN");
    }
  });

  /*
    Taze ama çift eşzamanlılığı güvensiz bulan ölçüm ESKİ DEĞİLDİR. İkisini aynı adla
    raporlamak operatöre gereksiz bir benchmark turu yaptırır (Astra, 14 Eylül).
  */
  it("separates an unsafe benchmark from a stale one", async () => {
    const unsafe = await resolve({ ...fresh, dualConcurrencySupported: false });
    expect(unsafe.concurrency).toBe(1);
    expect(unsafe.reason).toBe("DUAL_CONCURRENCY_UNSUPPORTED");
    expect(unsafe.staleReasons).toEqual([]);

    const stale = await resolve({ ...fresh, staleAt: new Date("2026-07-01T12:00:00.000Z") });
    expect(stale.reason).toBe("EVIDENCE_STALE");
    expect(stale.staleReasons).toContain("AGE");
  });

  it("agrees with the capacity view when the running version cannot be read", async () => {
    const applied = await resolve(fresh, { usageMetadata: {}, finishedAt: now });
    const shown = calculateRuntimeCapacity({
      capability: fresh,
      configuredConcurrency: 2,
      degradedMode: false,
      now,
      promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
    });
    expect(applied.concurrency).toBe(shown.effectiveConcurrency);
    expect(applied.reason).toBe("CODEX_VERSION_UNKNOWN");
  });

  /*
    Devralınan zayıflık, bilerek kayıt altında: `codexVersion` yokken `model` alanı
    sürüm yerine geçiyor. F02 bunu DÜZELTMİYOR; kapsamı dışında bırakıyor.
  */
  it("still accepts the model field as a version, which F02 does not claim to fix", async () => {
    const result = await resolve(fresh, {
      usageMetadata: { model: "codex-cli 2.9.9" },
      finishedAt: now,
    });
    expect(result.concurrency).toBe(2);
  });
});
