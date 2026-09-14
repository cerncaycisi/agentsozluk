import { createRuntimeCapabilityRecord } from "@/modules/agents/repository/capacity";
import { runtimeCapabilityMeasurementSchema } from "@/modules/agents/validation/capacity-schemas";
import { RUNTIME_PROMPT_PROFILE_HASH } from "@/runtime/prompt-profile";
import { integrationDatabase } from "../database";

export const MEASURED_CODEX_VERSION = "codex-cli 0.48.0";

/**
 * İki şeridi ölçülmüş hâle getirir.
 *
 * F02'den sonra yalnız `codexConcurrency: 2` yazmak iki şerit vermiyor; lease ve
 * scheduler kanıt arıyor. Kanıt iki parçalı: kapasite ölçümü ve çalışan Codex
 * sürümünü söyleyen fingerprint kaydı. İkisi olmadan etkin sınır 1'dir.
 */
export async function measureDualLanes(input: {
  measuredAt: Date;
  staleAt: Date;
  dualConcurrencySupported?: boolean;
}) {
  await integrationDatabase.$transaction((transaction) =>
    createRuntimeCapabilityRecord(transaction, {
      ...runtimeCapabilityMeasurementSchema.parse({
        codexVersion: MEASURED_CODEX_VERSION,
        promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
        benchmarkRunCount: 10,
        p50DurationMs: 120_000,
        p75DurationMs: 180_000,
        p95DurationMs: 240_000,
        maxDurationMs: 300_000,
        successfulActionCount: 20,
        proposedEntryActionCount: 18,
        publishedEntries: 18,
        failureRate: 0,
        duplicateRetryRate: 0.05,
        singleProcessPeakRssMb: 400,
        dualProcessPeakRssMb: 700,
        systemPeakMemoryMb: 3_000,
        availableMemoryMb: 900,
        swapInMb: 0,
        swapOutMb: 0,
        loadAverage1m: 1.2,
        dualRunSuccessCount: 2,
        oomDetected: false,
        swapThrashingDetected: false,
        healthStable: true,
        readinessStable: true,
        appLatencyImpact: { baselineP95Ms: 50, measuredP95Ms: 55, stable: true },
        databaseLatencyImpact: { baselineP95Ms: 10, measuredP95Ms: 12, stable: true },
        capacityStatus: "HEALTHY",
      }),
      dualConcurrencySupported: input.dualConcurrencySupported ?? true,
      measuredAt: input.measuredAt,
      staleAt: input.staleAt,
    }),
  );
  await integrationDatabase.agentRuntimeEvent.create({
    data: {
      eventType: "agent.capacity.measured",
      safeMessage: "Integration fixture: çalışan Codex sürümü raporlandı.",
      metadata: {
        codexVersion: MEASURED_CODEX_VERSION,
        promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
      },
      occurredAt: input.measuredAt,
    },
  });
}

/** Ölçümü "şu ana göre taze" yapan pratik kısayol. */
export function measureDualLanesAround(now: Date) {
  return measureDualLanes({
    measuredAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    staleAt: new Date(now.getTime() + 13 * 24 * 60 * 60 * 1000),
  });
}
