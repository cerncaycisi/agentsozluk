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
  getGlobalSettingsRecord,
  getLatestProductionRolloutAttemptEvent,
  pauseGlobalRuntimeForCriticalBreakerRecord,
} from "@/modules/agents/repository/control-plane";
import { appendOutboxEvent } from "@/modules/outbox";

const GLOBAL_SETTINGS_AGGREGATE_ID = "00000000-0000-4000-8000-000000000001";
const STARTED = "runtime.production.rollout_attempt.started";
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
