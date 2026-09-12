import { describe, expect, it, vi } from "vitest";
import {
  resolveEffectiveRuntimeConcurrency,
  type EffectiveRuntimeConcurrencyDependencies,
} from "@/modules/agents/application/runtime-concurrency";
import type { RuntimeCapabilityMeasurement } from "@/modules/agents/domain/capacity";
import { RUNTIME_PROMPT_PROFILE_HASH } from "@/runtime/prompt-profile";

const now = new Date("2026-07-17T12:00:00.000Z");

const freshSupportedCapability: RuntimeCapabilityMeasurement = {
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

const matchingFingerprintRecord = {
  usageMetadata: { codexVersion: "codex-cli 2.4.0" },
  finishedAt: now,
};

const tx = {} as never;

function makeDeps(
  capability: RuntimeCapabilityMeasurement | null,
  fingerprint: unknown = matchingFingerprintRecord,
): EffectiveRuntimeConcurrencyDependencies {
  return {
    getLatestRuntimeCapability: vi.fn(async () => capability),
    getLatestRuntimeFingerprintRecord: vi.fn(async () => fingerprint),
  } as unknown as EffectiveRuntimeConcurrencyDependencies;
}

describe("resolveEffectiveRuntimeConcurrency (F02)", () => {
  it("konfigüre sınır 1 ise kanıta bakmadan 1 döner", async () => {
    const deps = makeDeps(freshSupportedCapability);
    const result = await resolveEffectiveRuntimeConcurrency(
      tx,
      { configuredConcurrency: 1, now },
      deps,
    );
    expect(result).toBe(1);
    // Sınır 1 için kapasite kaydı hiç okunmamalı.
    expect(deps.getLatestRuntimeCapability).not.toHaveBeenCalled();
  });

  it("taze, destekli ve eşleşen kanıtta 2 döner", async () => {
    const result = await resolveEffectiveRuntimeConcurrency(
      tx,
      { configuredConcurrency: 2, now },
      makeDeps(freshSupportedCapability),
    );
    expect(result).toBe(2);
  });

  it("kapasite kaydı HİÇ yoksa ayar korunur (set-kapısı invariantı, düşürme yok)", async () => {
    // Set-kapısı kanıtsız concurrency 2 yazılmasını engellediği için üretimde
    // "2 ama kayıt yok" oluşamaz; oluşursa yoktan yere düşürme, ayara güven.
    const deps = makeDeps(null);
    const result = await resolveEffectiveRuntimeConcurrency(
      tx,
      { configuredConcurrency: 2, now },
      deps,
    );
    expect(result).toBe(2);
    // Kayıt yoksa parmak izi sorgusuna hiç gidilmemeli.
    expect(deps.getLatestRuntimeFingerprintRecord).not.toHaveBeenCalled();
  });

  it("kanıt eskimişse (staleAt geçmiş) 1'e düşer", async () => {
    const stale = { ...freshSupportedCapability, staleAt: new Date("2026-07-01T12:00:00.000Z") };
    const result = await resolveEffectiveRuntimeConcurrency(
      tx,
      { configuredConcurrency: 2, now },
      makeDeps(stale),
    );
    expect(result).toBe(1);
  });

  it("prompt profili hash'i eşleşmiyorsa 1'e düşer", async () => {
    const mismatched = { ...freshSupportedCapability, promptProfileHash: "b".repeat(64) };
    const result = await resolveEffectiveRuntimeConcurrency(
      tx,
      { configuredConcurrency: 2, now },
      makeDeps(mismatched),
    );
    expect(result).toBe(1);
  });

  it("çalışan koşu parmak izinden codex sürümü okunamıyorsa 1'e düşer", async () => {
    const result = await resolveEffectiveRuntimeConcurrency(
      tx,
      { configuredConcurrency: 2, now },
      makeDeps(freshSupportedCapability, null),
    );
    expect(result).toBe(1);
  });

  it("kanıt concurrency 2'yi desteklemiyorsa (dualConcurrencySupported=false) 1'e düşer", async () => {
    const unsupported = { ...freshSupportedCapability, dualConcurrencySupported: false };
    const result = await resolveEffectiveRuntimeConcurrency(
      tx,
      { configuredConcurrency: 2, now },
      makeDeps(unsupported),
    );
    expect(result).toBe(1);
  });
});
