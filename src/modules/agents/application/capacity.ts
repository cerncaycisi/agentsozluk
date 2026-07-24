import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor } from "@/lib/db/types";
import { appendAuditLog } from "@/modules/audit";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { requireAgentAdminInTransaction } from "@/modules/agents/application/authorization";
import { istanbulLocalDate } from "@/modules/agents/domain/istanbul-time";
import {
  calculateRuntimeCapacity,
  estimateRuntimeCompletion,
  MINIMUM_DUAL_CONCURRENCY_MEMORY_MB,
  runtimeFingerprint,
  supportsDualConcurrency,
} from "@/modules/agents/domain/capacity";
import {
  circuitBreakerConfigSchema,
  evaluateCircuitBreakers,
} from "@/modules/agents/domain/circuit-breaker";
import { societyFlowEnabled } from "@/modules/agents/domain/runtime-controls";
import {
  createRuntimeCapabilityRecord,
  getLatestRuntimeCapability,
  getLatestRuntimeFingerprintRecord,
  getRuntimeOperationalMetrics,
} from "@/modules/agents/repository/capacity";
import {
  appendRuntimeEvent,
  getGlobalSettingsRecord,
  lockAgentSettings,
  updateGlobalSettingsRecord,
} from "@/modules/agents/repository/control-plane";
import type { RuntimeCapabilityMeasurementInput } from "@/modules/agents/validation/capacity-schemas";
import { appendOutboxEvent } from "@/modules/outbox";
import { RUNTIME_PROMPT_PROFILE_HASH } from "@/runtime/prompt-profile";

const CAPABILITY_STALE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

export function getRuntimeCapacity(
  client: DatabaseExecutor,
  actor: ActorContext,
  now = new Date(),
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    const localDate = istanbulLocalDate(now);
    const [settings, capability, fingerprintRecord] = await Promise.all([
      getGlobalSettingsRecord(transaction),
      getLatestRuntimeCapability(transaction),
      getLatestRuntimeFingerprintRecord(transaction),
    ]);
    const observedFingerprint = runtimeFingerprint(fingerprintRecord?.usageMetadata);
    const fingerprint = {
      codexVersion: observedFingerprint.codexVersion ?? "UNKNOWN",
      promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
    };
    const configuredConcurrency = settings.codexConcurrency === 2 ? 2 : 1;
    const calculated = calculateRuntimeCapacity({
      capability,
      configuredConcurrency,
      degradedMode: settings.degradedMode,
      now,
      ...fingerprint,
    });
    const operational = await getRuntimeOperationalMetrics(transaction, {
      now,
      concurrency: calculated.effectiveConcurrency === 2 ? 2 : 1,
      config: circuitBreakerConfigSchema.parse(settings.circuitBreakerConfig),
    });
    const circuitBreakers = evaluateCircuitBreakers(
      circuitBreakerConfigSchema.parse(settings.circuitBreakerConfig),
      operational,
    );
    const warnings =
      circuitBreakers.capacityAtRisk && !calculated.warnings.includes("CAPACITY_AT_RISK")
        ? [...calculated.warnings, "CAPACITY_AT_RISK" as const]
        : calculated.warnings;
    const queueLagMs = operational.oldestQueuedAt
      ? Math.max(0, now.getTime() - operational.oldestQueuedAt.getTime())
      : 0;
    const completion = estimateRuntimeCompletion({
      now,
      p75DurationMs: capability?.p75DurationMs ?? null,
      benchmarkFresh: calculated.benchmark?.stale === false,
      concurrency: calculated.effectiveConcurrency === 2 ? 2 : 1,
      eligibleQueuedRuns: operational.eligibleQueuedRunCount,
      activeRunStartedAts: operational.activeRunStartedAts,
    });
    return {
      localDate,
      runtimeEnabled: settings.runtimeEnabled,
      schedulerEnabled: settings.schedulerEnabled,
      publishEnabled: settings.publishEnabled,
      publicWriteEnabled: settings.publicWriteEnabled,
      runtimeOperatingMode: settings.runtimeOperatingMode,
      societyFlowEnabled: societyFlowEnabled(settings),
      dualConcurrencyAvailable: supportsDualConcurrency(capability, { now, ...fingerprint }),
      runtimeFingerprint: fingerprint,
      observedRuntimeFingerprint: observedFingerprint,
      queueLagMs,
      estimatedCompletionDurationMs: completion?.durationMs ?? null,
      estimatedCompletionAt: completion?.estimatedAt ?? null,
      estimationBasis: completion ? ("P75" as const) : ("UNKNOWN" as const),
      ...calculated,
      estimatedUtilization: operational.configuredWindowUtilization,
      capacityReserve:
        operational.configuredWindowUtilization === null
          ? null
          : Math.max(0, 1 - operational.configuredWindowUtilization),
      capacityStatus: circuitBreakers.capacityAtRisk ? "AT_RISK" : calculated.capacityStatus,
      warnings,
      operational,
      circuitBreakers,
    };
  });
}

export function recordRuntimeCapability(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: RuntimeCapabilityMeasurementInput,
  now = new Date(),
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    await lockAgentSettings(transaction);
    const dualConcurrencySupported =
      input.dualRunSuccessCount === 2 &&
      input.dualProcessPeakRssMb !== null &&
      !input.oomDetected &&
      !input.swapThrashingDetected &&
      input.healthStable &&
      input.readinessStable &&
      input.appLatencyImpact.stable &&
      input.databaseLatencyImpact.stable &&
      input.availableMemoryMb >= MINIMUM_DUAL_CONCURRENCY_MEMORY_MB;
    const capability = await createRuntimeCapabilityRecord(transaction, {
      ...input,
      dualConcurrencySupported,
      measuredAt: now,
      staleAt: new Date(now.getTime() + CAPABILITY_STALE_AFTER_MS),
    });
    const settings = await getGlobalSettingsRecord(transaction);
    const concurrencyDowngraded = !dualConcurrencySupported && settings.codexConcurrency !== 1;
    if (concurrencyDowngraded) {
      await updateGlobalSettingsRecord(transaction, actor.actorId, { codexConcurrency: 1 });
    }
    const metadata = {
      actorKind: actor.actorKind,
      before: {
        codexConcurrency: settings.codexConcurrency,
        capabilityId: null,
      },
      after: {
        codexConcurrency: concurrencyDowngraded ? 1 : settings.codexConcurrency,
        capabilityId: capability.id,
        capacityStatus: capability.capacityStatus,
      },
      reason: "Runtime capability measurement recorded by human administrator.",
      capabilityId: capability.id,
      codexVersion: capability.codexVersion,
      promptProfileHash: capability.promptProfileHash,
      benchmarkRunCount: capability.benchmarkRunCount,
      capacityStatus: capability.capacityStatus,
      dualConcurrencySupported,
      concurrencyDowngraded,
    };
    await appendAuditLog(transaction, {
      actorId: actor.actorId,
      action: "agent.capacity.measured",
      entityType: "AgentRuntimeCapability",
      entityId: capability.id,
      requestId: actor.requestId,
      metadata,
    });
    await appendOutboxEvent(transaction, {
      eventType: "agent.capacity.measured",
      aggregateType: "AgentRuntimeCapability",
      aggregateId: capability.id,
      actorId: actor.actorId,
      actorKind: actor.actorKind,
      requestId: actor.requestId,
      payload: metadata,
    });
    await appendRuntimeEvent(transaction, {
      eventType: "agent.capacity.measured",
      safeMessage: dualConcurrencySupported
        ? "Runtime capability ölçümü concurrency 2 desteğini doğruladı."
        : "Runtime capability ölçümü concurrency 2 desteğini doğrulamadı.",
      metadata,
    });
    return { capability, concurrencyDowngraded };
  });
}
