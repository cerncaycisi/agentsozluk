import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { appendAuditLog } from "@/modules/audit";
import { requireAgentAdminInTransaction } from "@/modules/agents/application/authorization";
import {
  appendRuntimeEvent,
  getGlobalSettingsRecord,
  lockAgentSettings,
} from "@/modules/agents/repository/control-plane";
import {
  clearLegacyPendingQuotaSettings,
  retireLegacyDailyPlanningRecords,
} from "@/modules/agents/repository/historical-daily-planning";
import type { RuntimeControlInput } from "@/modules/agents/validation/schemas";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { appendOutboxEvent } from "@/modules/outbox";

const GLOBAL_SETTINGS_AGGREGATE_ID = "00000000-0000-4000-8000-000000000001";

/**
 * One-shot operator recovery for databases that predate stochastic scheduling.
 * It is deliberately outside the active agent module and is never called by a
 * request handler, scheduler tick or worker loop.
 */
export function retireAgentDailyPlanning(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: RuntimeControlInput,
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    await lockAgentSettings(transaction);
    const settings = await getGlobalSettingsRecord(transaction);
    if (settings.runtimeEnabled)
      throw new AppError(
        "AGENT_LIFECYCLE_INVALID",
        409,
        "Eski günlük planlama yalnız global runtime pause durumundayken kapatılabilir.",
      );

    const retired = await retireLegacyDailyPlanningRecords(transaction);
    const updated = await clearLegacyPendingQuotaSettings(transaction, actor.actorId);
    const metadata = {
      reason: input.reason,
      cancelledRuns: retired.cancelledRuns,
      cancelledPlans: retired.cancelledPlans,
      cancelledSlots: retired.cancelledSlots,
      clearedRuntimeStates: retired.clearedRuntimeStates,
      previousSettingsVersion: settings.settingsVersion,
      settingsVersion: updated.settingsVersion,
    };
    await appendAuditLog(transaction, {
      actorId: actor.actorId,
      action: "agent.daily_planning.retired",
      entityType: "AgentGlobalSettings",
      entityId: GLOBAL_SETTINGS_AGGREGATE_ID,
      requestId: actor.requestId,
      metadata,
    });
    await appendOutboxEvent(transaction, {
      eventType: "agent.daily_planning.retired",
      aggregateType: "AgentGlobalSettings",
      aggregateId: GLOBAL_SETTINGS_AGGREGATE_ID,
      actorId: actor.actorId,
      actorKind: actor.actorKind,
      requestId: actor.requestId,
      payload: metadata,
    });
    await appendRuntimeEvent(transaction, {
      eventType: "scheduler.daily_planning.retired",
      safeMessage:
        "Eski günlük hedef, planlı slot ve catch-up akışı kapatıldı; stochastic toplum akışı tek otomatik public akış oldu.",
      metadata,
    });
    return { ...retired, settingsVersion: updated.settingsVersion };
  });
}
