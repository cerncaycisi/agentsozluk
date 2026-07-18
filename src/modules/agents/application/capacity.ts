import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor } from "@/lib/db/types";
import { appendAuditLog } from "@/modules/audit";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { requireAgentAdminInTransaction } from "@/modules/agents/application/authorization";
import {
  calculateRuntimeCapacity,
  MINIMUM_DUAL_CONCURRENCY_MEMORY_MB,
  supportsDualConcurrency,
} from "@/modules/agents/domain/capacity";
import {
  circuitBreakerConfigSchema,
  evaluateCircuitBreakers,
} from "@/modules/agents/domain/circuit-breaker";
import {
  createRuntimeCapabilityRecord,
  getCapacityPlanningMetrics,
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

const CAPABILITY_STALE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

function istanbulLocalDate(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
}

function runtimeFingerprint(usageMetadata: unknown): {
  codexVersion?: string;
  promptProfileHash?: string;
} {
  if (!usageMetadata || typeof usageMetadata !== "object" || Array.isArray(usageMetadata))
    return {};
  const metadata = usageMetadata as Record<string, unknown>;
  return {
    ...(typeof metadata.model === "string" ? { codexVersion: metadata.model } : {}),
    ...(typeof metadata.promptProfileHash === "string"
      ? { promptProfileHash: metadata.promptProfileHash }
      : {}),
  };
}

export function getRuntimeCapacity(
  client: DatabaseExecutor,
  actor: ActorContext,
  now = new Date(),
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    const localDate = istanbulLocalDate(now);
    const [settings, capability, planning, fingerprintRecord] = await Promise.all([
      getGlobalSettingsRecord(transaction),
      getLatestRuntimeCapability(transaction),
      getCapacityPlanningMetrics(transaction, localDate),
      getLatestRuntimeFingerprintRecord(transaction),
    ]);
    const fingerprint = runtimeFingerprint(fingerprintRecord?.usageMetadata);
    const configuredConcurrency = settings.codexConcurrency === 2 ? 2 : 1;
    const calculated = calculateRuntimeCapacity({
      capability,
      ...planning,
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
    return {
      localDate,
      runtimeEnabled: settings.runtimeEnabled,
      dualConcurrencyAvailable: supportsDualConcurrency(capability, { now, ...fingerprint }),
      runtimeFingerprint: fingerprint,
      ...calculated,
      capacityStatus: circuitBreakers.capacityAtRisk ? "AT_RISK" : calculated.capacityStatus,
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
      capabilityId: capability.id,
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
