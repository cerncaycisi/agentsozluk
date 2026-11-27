import { describe, expect, it, vi } from "vitest";
import {
  recordObservedRuntimeFingerprint,
  resolveEffectiveRuntimeConcurrency,
  type EffectiveRuntimeConcurrencyDependencies,
} from "@/modules/agents/application/runtime-concurrency";
import { RUNTIME_FINGERPRINT_OBSERVED_EVENT_TYPE } from "@/modules/agents/repository/capacity";
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

  // Gökhan kararı (8 Ekim): ölçüm bir kez yapılır; talimat değişince bayatlamaz.
  it("keeps a measurement taken under an earlier prompt profile fresh", async () => {
    const previousProfile = "7fca9a111e846f3af085b576a6e0ba8de5a232bc7f4dae95d9f592b3f2a939d9";
    const result = await resolve({ ...fresh, promptProfileHash: previousProfile });
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
    const otherMajor = { ...fresh, id: "cap-old-cli", codexVersion: "codex-cli 1.9.0" };
    const result = await resolve(otherMajor);
    expect(result.concurrency).toBe(1);
    expect(result.reason).toBe("EVIDENCE_STALE");
    expect(result.staleReasons).toEqual(["CODEX_MAJOR"]);
    expect(result.configuredConcurrency).toBe(2);
    expect(result.measurementId).toBe("cap-old-cli");
  });

  it("does not expire a measurement by age", async () => {
    const old = { ...fresh, staleAt: new Date("2026-07-01T12:00:00.000Z") };
    const result = await resolve(old);
    expect(result.concurrency).toBe(2);
    expect(result.staleReasons).toEqual([]);
  });

  it("treats a different codex major version as stale", async () => {
    const result = await resolve({ ...fresh, codexVersion: "codex-cli 1.9.0" });
    expect(result.concurrency).toBe(1);
    expect(result.staleReasons).toContain("CODEX_MAJOR");
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

    const stale = await resolve({ ...fresh, codexVersion: "codex-cli 1.9.0" });
    expect(stale.reason).toBe("EVIDENCE_STALE");
    expect(stale.staleReasons).toContain("CODEX_MAJOR");
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

  it("keeps resolver and capacity view aligned without roster sync when worker switches CLI or rolls back", async () => {
    for (const measuredVersion of ["codex-cli 0.160.0", "codex-cli 1.9.0"]) {
      const capability = { ...fresh, codexVersion: measuredVersion };
      let latestFingerprint: { usageMetadata: Record<string, unknown>; finishedAt: Date } = {
        usageMetadata: {
          codexVersion: measuredVersion,
          promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
        },
        finishedAt: now,
      };
      const events: Array<{ eventType: string; metadata: unknown; occurredAt: Date }> = [];
      const appendRuntimeEvent = vi.fn(async (_tx, entry) => {
        events.push(entry);
        latestFingerprint = {
          usageMetadata: entry.metadata as Record<string, unknown>,
          finishedAt: entry.occurredAt,
        };
      });
      const getLatestRuntimeFingerprintRecord = vi.fn(async () => latestFingerprint);
      const sharedDeps = {
        getLatestRuntimeCapability: vi.fn(async () => capability),
        getLatestRuntimeFingerprintRecord,
      } as unknown as EffectiveRuntimeConcurrencyDependencies;

      const recordedSwitch = await recordObservedRuntimeFingerprint(
        tx,
        { workerId: "w1", codexVersion: "agy 1.5.18", now },
        { getLatestRuntimeFingerprintRecord, appendRuntimeEvent } as never,
      );
      expect(recordedSwitch).toEqual({ recorded: true, codexVersion: "agy 1.5.18" });
      expect(events.at(-1)?.eventType).toBe(RUNTIME_FINGERPRINT_OBSERVED_EVENT_TYPE);
      expect(events.at(-1)?.occurredAt.getTime()).toBeGreaterThan(now.getTime());

      const deduplicated = await recordObservedRuntimeFingerprint(
        tx,
        { workerId: "w1", codexVersion: "agy 1.5.18", now },
        { getLatestRuntimeFingerprintRecord, appendRuntimeEvent } as never,
      );
      expect(deduplicated).toEqual({ recorded: false, codexVersion: "agy 1.5.18" });
      expect(events).toHaveLength(1);

      const applied = await resolveEffectiveRuntimeConcurrency(
        tx,
        { configuredConcurrency: 2, now },
        sharedDeps,
      );
      const observedAfterSwitch = runtimeFingerprint(
        (await getLatestRuntimeFingerprintRecord())?.usageMetadata,
      );
      const shown = calculateRuntimeCapacity({
        capability,
        configuredConcurrency: 2,
        degradedMode: false,
        now,
        ...(observedAfterSwitch.codexVersion
          ? { codexVersion: observedAfterSwitch.codexVersion }
          : {}),
        promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
      });
      expect(applied).toMatchObject({
        concurrency: 1,
        configuredConcurrency: 2,
        reason: "EVIDENCE_STALE",
        staleReasons: ["CODEX_MAJOR"],
        measurementId: capability.id,
      });
      expect(shown.effectiveConcurrency).toBe(1);
      expect(shown.benchmark?.stale).toBe(true);
      expect(shown.benchmark?.staleReasons).toEqual(["CODEX_MAJOR"]);

      // Rollback back to Codex at the same timestamp advances occurredAt and restores dual lane in both views.
      const rollback = await recordObservedRuntimeFingerprint(
        tx,
        { workerId: "w1", codexVersion: measuredVersion, now },
        { getLatestRuntimeFingerprintRecord, appendRuntimeEvent } as never,
      );
      expect(rollback).toEqual({ recorded: true, codexVersion: measuredVersion });
      expect(events).toHaveLength(2);
      expect(events[1]!.occurredAt.getTime()).toBeGreaterThan(events[0]!.occurredAt.getTime());

      const appliedRollback = await resolveEffectiveRuntimeConcurrency(
        tx,
        { configuredConcurrency: 2, now },
        sharedDeps,
      );
      const observedAfterRollback = runtimeFingerprint(
        (await getLatestRuntimeFingerprintRecord())?.usageMetadata,
      );
      const shownRollback = calculateRuntimeCapacity({
        capability,
        configuredConcurrency: 2,
        degradedMode: false,
        now,
        ...(observedAfterRollback.codexVersion
          ? { codexVersion: observedAfterRollback.codexVersion }
          : {}),
        promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
      });
      expect(appliedRollback).toMatchObject({ concurrency: 2, reason: "EVIDENCE_FRESH" });
      expect(shownRollback.effectiveConcurrency).toBe(2);
      expect(shownRollback.benchmark?.stale).toBe(false);
    }
  });
});
