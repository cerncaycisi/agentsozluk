import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { appendAuditLog } from "@/modules/audit";
import { requireAgentAdminInTransaction } from "@/modules/agents";
import { appendRuntimeEvent } from "@/modules/agents/repository/control-plane";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { setEntryVisibility } from "@/modules/moderation/application/actions";
import { appendModerationAction } from "@/modules/moderation/repository/history";
import { resolveAgentContentRecords } from "@/modules/moderation/repository/agent-content";
import type { AgentContentBulkActionInput } from "@/modules/moderation/validation/schemas";

function failure(error: unknown) {
  return error instanceof AppError
    ? { code: error.code, message: error.message }
    : { code: "INTERNAL_ERROR", message: "Entry işlemi tamamlanamadı." };
}

export async function bulkSetAgentContentVisibility(
  client: DatabaseExecutor,
  actor: ActorContext,
  hidden: boolean,
  input: AgentContentBulkActionInput,
) {
  const expected = hidden ? "HIDE_AGENT_CONTENT" : "RESTORE_AGENT_CONTENT";
  if (input.confirmation !== expected)
    throw new AppError("VALIDATION_ERROR", 422, "Bulk işlem için açık confirmation gereklidir.");
  const records = await inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    return resolveAgentContentRecords(transaction, input, new Date());
  });
  const byEntryId = new Map(records.map((record) => [record.entryId, record]));
  const targetIds = input.entryIds ?? records.map(({ entryId }) => entryId);
  const succeeded: Array<{ entryId: string; runId: string; agentProfileId: string }> = [];
  const failed: Array<{ entryId: string; code: string; message: string }> = [];
  for (const entryId of targetIds) {
    const record = byEntryId.get(entryId);
    if (!record) {
      failed.push({
        entryId,
        code: "NOT_AGENT_CONTENT",
        message: "Entry doğrulanmış agent content kaydı taşımıyor.",
      });
      continue;
    }
    try {
      await setEntryVisibility(client, actor, entryId, hidden, { reason: input.reason });
      succeeded.push({
        entryId,
        runId: record.runId,
        agentProfileId: record.agentProfileId,
      });
    } catch (error) {
      failed.push({ entryId, ...failure(error) });
    }
  }
  const status = failed.length === 0 ? "SUCCEEDED" : succeeded.length === 0 ? "FAILED" : "PARTIAL";
  await inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    const metadata = {
      status,
      hidden,
      selectedCount: targetIds.length,
      succeededCount: succeeded.length,
      failedCount: failed.length,
      selector: input.entryIds ? "ENTRY_IDS" : input.runId ? "RUN" : "AGENT_WINDOW",
    };
    await appendModerationAction(transaction, {
      moderatorId: actor.actorId,
      actionType: hidden ? "AGENT_CONTENT_BULK_HIDDEN" : "AGENT_CONTENT_BULK_RESTORED",
      targetType: input.runId ? "AGENT_RUN" : input.agentProfileId ? "AGENT_PROFILE" : "ENTRY_SET",
      targetId: input.runId ?? input.agentProfileId ?? succeeded[0]?.entryId ?? targetIds[0]!,
      reason: input.reason,
      metadata,
    });
    await appendAuditLog(transaction, {
      actorId: actor.actorId,
      action: hidden ? "agent.content.bulk_hidden" : "agent.content.bulk_restored",
      entityType: "AgentContentRecord",
      entityId: input.runId ?? input.agentProfileId ?? null,
      requestId: actor.requestId,
      metadata,
    });
    await appendRuntimeEvent(transaction, {
      eventType: hidden ? "content.bulk-hidden" : "content.bulk-restored",
      safeMessage: hidden
        ? "Agent içerikleri bulk işlemle gizlendi."
        : "Agent içerikleri bulk işlemle geri açıldı.",
      metadata,
    });
  });
  return { status, selectedCount: targetIds.length, succeeded, failed };
}
