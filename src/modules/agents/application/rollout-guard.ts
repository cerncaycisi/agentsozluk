import { getEnvironment } from "@/config/env";
import type { TransactionClient } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { appendAuditLog } from "@/modules/audit";
import type { ActorContext } from "@/modules/auth/domain/actor";
import {
  istanbulCalendarDateKey,
  productionRolloutAttemptDateMatches,
} from "@/modules/agents/domain/runtime-controls";
import {
  appendRuntimeEvent,
  getProductionActivationAnchor,
  getGlobalSettingsRecord,
  getLatestProductionRolloutAttemptEvent,
  pauseGlobalRuntimeForCriticalBreakerRecord,
} from "@/modules/agents/repository/control-plane";
import { appendOutboxEvent } from "@/modules/outbox";

const GLOBAL_SETTINGS_AGGREGATE_ID = "00000000-0000-4000-8000-000000000001";
const STARTED = "runtime.production.rollout_attempt.started";
const ABORTED = "runtime.production.rollout_attempt.aborted";
const COMPLETED = "runtime.production.rollout_attempt.completed";
export const ROLLOUT_LOCAL_DATE_EXPIRED = "ROLLOUT_LOCAL_DATE_EXPIRED";

export type ProductionRolloutRuntimeMutationBlocked = {
  rolloutExpired: true;
  errorCode: typeof ROLLOUT_LOCAL_DATE_EXPIRED;
  attemptId: string | null;
};

export function isProductionRolloutRuntimeMutationBlocked(
  value: unknown,
): value is ProductionRolloutRuntimeMutationBlocked {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.rolloutExpired === true &&
    record.errorCode === ROLLOUT_LOCAL_DATE_EXPIRED &&
    (record.attemptId === null || typeof record.attemptId === "string")
  );
}

export type ProductionRolloutAttemptMetadata = {
  attemptId: string;
  localDate: string;
};

export function parseProductionRolloutAttemptMetadata(
  value: unknown,
): ProductionRolloutAttemptMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return typeof record.attemptId === "string" && typeof record.localDate === "string"
    ? { attemptId: record.attemptId, localDate: record.localDate }
    : null;
}

export async function assertProductionRolloutMutationAllowed(
  transaction: TransactionClient,
  now: Date,
  enforce = getEnvironment().NODE_ENV === "production",
): Promise<void> {
  if (!enforce) return;
  const latest = await getLatestProductionRolloutAttemptEvent(transaction);
  if (latest?.eventType === COMPLETED) {
    if (!parseProductionRolloutAttemptMetadata(latest.metadata))
      throw new AppError("INTERNAL_ERROR", 500, "Completed rollout metadata geçersiz.");
    return;
  }
  if (latest?.eventType === ABORTED) {
    if (!parseProductionRolloutAttemptMetadata(latest.metadata))
      throw new AppError("INTERNAL_ERROR", 500, "Aborted rollout metadata geçersiz.");
    if (await getProductionActivationAnchor(transaction)) return;
  }
  const metadata =
    latest?.eventType === STARTED ? parseProductionRolloutAttemptMetadata(latest.metadata) : null;
  if (
    metadata &&
    productionRolloutAttemptDateMatches({ attemptLocalDate: metadata.localDate, now })
  )
    return;
  throw new AppError(
    "AGENT_LIFECYCLE_INVALID",
    409,
    metadata
      ? "Production rollout denemesi İstanbul tarihini geçti; fail-closed cleanup ve abort zorunludur."
      : "Day 0 tamamlanmadan ACTIVE/resume yalnız explicit production rollout denemesinde yapılabilir.",
  );
}

/**
 * Caller must hold the global settings advisory lock. The pause and immutable
 * evidence commit in the caller's transaction; callers must return normally,
 * not throw, when this reports an expired attempt.
 */
export async function pauseExpiredProductionRollout(
  transaction: TransactionClient,
  actor: ActorContext,
  now: Date,
): Promise<{ expired: boolean; attemptId: string | null }> {
  const latest = await getLatestProductionRolloutAttemptEvent(transaction);
  if (latest?.eventType !== STARTED) return { expired: false, attemptId: null };
  const metadata = parseProductionRolloutAttemptMetadata(latest.metadata);
  if (!metadata) throw new AppError("INTERNAL_ERROR", 500, "Rollout attempt metadata geçersiz.");
  if (productionRolloutAttemptDateMatches({ attemptLocalDate: metadata.localDate, now }))
    return { expired: false, attemptId: metadata.attemptId };

  // A Day 0 attempt is a one-time safety gate, not a permanent midnight kill
  // switch. Once production has a durable activation anchor, an accidentally
  // open later observation/rollout attempt may expire without pausing the
  // established society. Terminalize that stale attempt exactly once under the
  // global settings lock and continue steady-state operation.
  const activationAnchor = await getProductionActivationAnchor(transaction);
  if (activationAnchor) {
    const evidence = {
      command: "AUTO_ABORT_EXPIRED_STEADY_STATE_ATTEMPT",
      reasonCode: "STEADY_STATE_ROLLOUT_LOCAL_DATE_EXPIRED",
      attemptId: metadata.attemptId,
      localDate: metadata.localDate,
      attemptLocalDate: metadata.localDate,
      observedLocalDate: istanbulCalendarDateKey(now),
    };
    const event = await appendRuntimeEvent(transaction, {
      eventType: ABORTED,
      safeMessage:
        "Süresi dolan steady-state rollout denemesi toplum akışı durdurulmadan otomatik kapatıldı.",
      metadata: evidence,
      occurredAt: now,
    });
    await appendAuditLog(transaction, {
      actorId: actor.actorId,
      action: "agent.rollout_attempt.aborted",
      entityType: "AgentGlobalSettings",
      entityId: GLOBAL_SETTINGS_AGGREGATE_ID,
      requestId: actor.requestId,
      metadata: {
        ...evidence,
        before: { rolloutAttemptStatus: "STARTED" },
        after: { rolloutAttemptStatus: "ABORTED" },
        runtimeEventId: event.id.toString(),
      },
    });
    await appendOutboxEvent(transaction, {
      eventType: "agent.rollout_attempt.aborted",
      aggregateType: "AgentGlobalSettings",
      aggregateId: GLOBAL_SETTINGS_AGGREGATE_ID,
      actorId: actor.actorId,
      actorKind: actor.actorKind,
      requestId: actor.requestId,
      payload: { ...evidence, runtimeEventId: event.id.toString() },
    });
    return { expired: false, attemptId: metadata.attemptId };
  }

  const settings = await getGlobalSettingsRecord(transaction);
  if (!settings.runtimeEnabled) return { expired: true, attemptId: metadata.attemptId };
  const updated = await pauseGlobalRuntimeForCriticalBreakerRecord(transaction);
  const evidence = {
    command: "AUTO_PAUSE",
    reasonCode: "ROLLOUT_LOCAL_DATE_EXPIRED",
    attemptId: metadata.attemptId,
    attemptLocalDate: metadata.localDate,
    observedLocalDate: istanbulCalendarDateKey(now),
    settingsVersion: updated.settingsVersion,
  };
  await appendAuditLog(transaction, {
    actorId: actor.actorId,
    action: "agent.settings.changed",
    entityType: "AgentGlobalSettings",
    entityId: GLOBAL_SETTINGS_AGGREGATE_ID,
    requestId: actor.requestId,
    metadata: evidence,
  });
  await appendOutboxEvent(transaction, {
    eventType: "agent.settings.changed",
    aggregateType: "AgentGlobalSettings",
    aggregateId: GLOBAL_SETTINGS_AGGREGATE_ID,
    actorId: actor.actorId,
    actorKind: actor.actorKind,
    requestId: actor.requestId,
    payload: evidence,
  });
  await appendRuntimeEvent(transaction, {
    eventType: "runtime.global.paused",
    safeMessage:
      "Production rollout İstanbul tarihi aşıldığı için runtime fail-closed pause edildi.",
    metadata: evidence,
    occurredAt: now,
  });
  return { expired: true, attemptId: metadata.attemptId };
}

/**
 * Caller must first authenticate the worker, validate the exact active lease and
 * hold the global settings advisory lock. Returning a marker instead of throwing
 * lets the fail-closed pause commit in the surrounding transaction.
 */
export async function guardProductionRolloutRuntimeMutation(
  transaction: TransactionClient,
  actor: ActorContext,
  now: Date,
): Promise<ProductionRolloutRuntimeMutationBlocked | null> {
  const result = await pauseExpiredProductionRollout(transaction, actor, now);
  return result.expired
    ? {
        rolloutExpired: true,
        errorCode: ROLLOUT_LOCAL_DATE_EXPIRED,
        attemptId: result.attemptId,
      }
    : null;
}
