import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { appendAuditLog } from "@/modules/audit";
import { requireAgentAdminInTransaction } from "@/modules/agents";
import { appendRuntimeEvent } from "@/modules/agents/repository/control-plane";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { setEntryVisibility } from "@/modules/moderation/application/actions";
import {
  type AgentContentListInput,
  deleteAgentTopicWriteLock,
  listAgentContentRecords,
  resolveAgentContentRecords,
  upsertAgentTopicWriteLock,
} from "@/modules/moderation/repository/agent-content";
import { appendModerationAction } from "@/modules/moderation/repository/history";
import type {
  AgentContentBulkActionInput,
  AgentTopicWriteLockInput,
  ModerationReasonInput,
} from "@/modules/moderation/validation/schemas";
import { appendOutboxEvent } from "@/modules/outbox";
import { lockTopicState } from "@/modules/topics/repository/topics";

export function getAgentContentRecords(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: AgentContentListInput,
  now = new Date(),
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    return listAgentContentRecords(transaction, input, now);
  });
}

export function setAgentTopicWriteLock(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: AgentTopicWriteLockInput,
  now = new Date(),
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    await lockTopicState(transaction, input.topicId);
    const outcome = await upsertAgentTopicWriteLock(transaction, {
      topicId: input.topicId,
      reason: input.reason,
      createdById: actor.actorId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + input.durationMinutes * 60_000),
    });
    if (!outcome) throw new AppError("TOPIC_NOT_FOUND", 404, "Başlık bulunamadı.");
    const metadata = {
      actorKind: actor.actorKind,
      before: {
        writeLocked: outcome.previousLock !== null,
        expiresAt: outcome.previousLock?.expiresAt?.toISOString() ?? null,
      },
      after: {
        writeLocked: true,
        expiresAt: outcome.lock.expiresAt?.toISOString() ?? null,
      },
      reason: input.reason,
      durationMinutes: input.durationMinutes,
      expiresAt: outcome.lock.expiresAt?.toISOString() ?? null,
    };
    await appendModerationAction(transaction, {
      moderatorId: actor.actorId,
      actionType: "AGENT_TOPIC_WRITE_LOCKED",
      targetType: "Topic",
      targetId: input.topicId,
      reason: input.reason,
      metadata,
    });
    await appendAuditLog(transaction, {
      actorId: actor.actorId,
      action: "agent.topic_write_locked",
      entityType: "Topic",
      entityId: input.topicId,
      requestId: actor.requestId,
      metadata,
    });
    await appendOutboxEvent(transaction, {
      eventType: "agent.topic.write_locked",
      aggregateType: "Topic",
      aggregateId: input.topicId,
      actorId: actor.actorId,
      actorKind: actor.actorKind,
      requestId: actor.requestId,
      payload: metadata,
    });
    await appendRuntimeEvent(transaction, {
      eventType: "topic.agent-write-locked",
      safeMessage: "Topic agent yazımına geçici olarak kapatıldı.",
      metadata: { topicId: input.topicId, ...metadata },
    });
    return outcome.lock;
  });
}

export function removeAgentTopicWriteLock(
  client: DatabaseExecutor,
  actor: ActorContext,
  topicId: string,
  input: ModerationReasonInput,
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    await lockTopicState(transaction, topicId);
    const removed = await deleteAgentTopicWriteLock(transaction, topicId);
    if (!removed) return { removed: false };
    const metadata = {
      actorKind: actor.actorKind,
      before: {
        writeLocked: true,
        expiresAt: removed.expiresAt?.toISOString() ?? null,
      },
      after: { writeLocked: false, expiresAt: null },
      reason: input.reason,
    };
    await appendModerationAction(transaction, {
      moderatorId: actor.actorId,
      actionType: "AGENT_TOPIC_WRITE_UNLOCKED",
      targetType: "Topic",
      targetId: topicId,
      reason: input.reason,
      metadata,
    });
    await appendAuditLog(transaction, {
      actorId: actor.actorId,
      action: "agent.topic_write_unlocked",
      entityType: "Topic",
      entityId: topicId,
      requestId: actor.requestId,
      metadata,
    });
    await appendRuntimeEvent(transaction, {
      eventType: "topic.agent-write-unlocked",
      safeMessage: "Topic agent yazımına yeniden açıldı.",
      metadata: { topicId },
    });
    return { removed: true };
  });
}

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
  const aggregateId = input.runId ?? input.agentProfileId ?? targetIds[0]!;
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
      actorKind: actor.actorKind,
      before: { hidden: !hidden, selectedCount: targetIds.length },
      after: {
        hidden,
        succeededCount: succeeded.length,
        failedCount: failed.length,
      },
      reason: input.reason,
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
    await appendOutboxEvent(transaction, {
      eventType: hidden ? "agent.content.bulk_hidden" : "agent.content.bulk_restored",
      aggregateType: "AgentContentRecord",
      aggregateId,
      actorId: actor.actorId,
      actorKind: actor.actorKind,
      requestId: actor.requestId,
      payload: metadata,
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
