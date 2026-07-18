import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor, TransactionClient } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { appendAuditLog } from "@/modules/audit";
import { requireAgentAdminInTransaction } from "@/modules/agents/application/authorization";
import { memoryDescendantClosure, memorySourceIds } from "@/modules/agents/domain/memory-lifecycle";
import { appendRuntimeEvent, lockAgentProfile } from "@/modules/agents/repository/control-plane";
import {
  createMemoryReconsolidationRun,
  findOwnedAgentMemoryRecord,
  findPendingMemoryReconsolidation,
  getMemoryLifecycleAgentRecord,
  getMemoryReflectionTimeout,
  invalidateOwnedAgentMemories,
  listAgentMemoryRecords,
  listOwnedAgentMemoryLineage,
  lockAgentMemoryRecords,
} from "@/modules/agents/repository/memory-lifecycle";
import type {
  ForgetAgentMemoryInput,
  InvalidateAgentMemoryInput,
  ReconsolidateAgentMemoryInput,
} from "@/modules/agents/validation/memory-schemas";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { appendOutboxEvent, type OutboxEventType } from "@/modules/outbox";

async function ensureAgentExists(transaction: TransactionClient, agentProfileId: string) {
  const agent = await getMemoryLifecycleAgentRecord(transaction, agentProfileId);
  if (!agent) throw new AppError("AGENT_NOT_FOUND", 404, "Agent bulunamadı.");
  return agent;
}

async function recordMemoryChange(
  transaction: TransactionClient,
  actor: ActorContext,
  input: {
    eventType: Extract<
      OutboxEventType,
      "agent.memory.invalidated" | "agent.memory.forgotten" | "agent.run.queued"
    >;
    entityType: "AgentMemoryEpisode" | "AgentRun";
    entityId: string;
    metadata: Record<string, unknown>;
  },
) {
  const metadata = { actorKind: actor.actorKind, ...input.metadata };
  await appendAuditLog(transaction, {
    actorId: actor.actorId,
    action: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    requestId: actor.requestId,
    metadata,
  });
  await appendOutboxEvent(transaction, {
    eventType: input.eventType,
    aggregateType: input.entityType,
    aggregateId: input.entityId,
    actorId: actor.actorId,
    actorKind: actor.actorKind,
    requestId: actor.requestId,
    payload: metadata,
  });
}

export function listAgentMemories(
  client: DatabaseExecutor,
  actor: ActorContext,
  agentProfileId: string,
  input: { skip: number; take: number },
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    await ensureAgentExists(transaction, agentProfileId);
    const [records, totalItems] = await listAgentMemoryRecords(transaction, {
      agentProfileId,
      skip: input.skip,
      take: input.take,
    });
    return [
      records.map(({ evidence, ...record }) => ({
        ...record,
        sourceMemoryIds: memorySourceIds(evidence),
      })),
      totalItems,
    ] as const;
  });
}

export function invalidateAgentMemory(
  client: DatabaseExecutor,
  actor: ActorContext,
  agentProfileId: string,
  memoryId: string,
  input: InvalidateAgentMemoryInput,
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    await lockAgentProfile(transaction, agentProfileId);
    await ensureAgentExists(transaction, agentProfileId);
    await lockAgentMemoryRecords(transaction, agentProfileId);
    const memory = await findOwnedAgentMemoryRecord(transaction, agentProfileId, memoryId);
    if (!memory)
      throw new AppError("AGENT_MEMORY_NOT_FOUND", 404, "Agent hafıza kaydı bulunamadı.");
    if (memory.invalidatedAt)
      throw new AppError(
        "AGENT_MEMORY_INVALIDATED",
        409,
        "Agent hafıza kaydı zaten geçersizleştirilmiş.",
      );

    const invalidatedAt = new Date();
    const result = await invalidateOwnedAgentMemories(transaction, {
      agentProfileId,
      memoryIds: [memory.id],
      invalidatedAt,
    });
    if (result.count !== 1)
      throw new AppError("AGENT_MEMORY_INVALIDATED", 409, "Hafıza kaydı artık aktif değil.");

    const metadata = {
      agentProfileId,
      memoryId: memory.id,
      reason: input.reason,
      before: { invalidatedAt: null },
      after: { invalidatedAt: invalidatedAt.toISOString() },
    };
    await recordMemoryChange(transaction, actor, {
      eventType: "agent.memory.invalidated",
      entityType: "AgentMemoryEpisode",
      entityId: memory.id,
      metadata,
    });
    return { memoryId: memory.id, invalidatedAt, affectedCount: 1 };
  });
}

export function forgetAgentMemory(
  client: DatabaseExecutor,
  actor: ActorContext,
  agentProfileId: string,
  memoryId: string,
  input: ForgetAgentMemoryInput,
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    await lockAgentProfile(transaction, agentProfileId);
    await ensureAgentExists(transaction, agentProfileId);
    await lockAgentMemoryRecords(transaction, agentProfileId);
    const root = await findOwnedAgentMemoryRecord(transaction, agentProfileId, memoryId);
    if (!root) throw new AppError("AGENT_MEMORY_NOT_FOUND", 404, "Agent hafıza kaydı bulunamadı.");

    // The full graph includes already-invalidated intermediate nodes so active
    // grandchildren cannot survive a forget operation by being hidden behind one.
    const lineage = await listOwnedAgentMemoryLineage(transaction, agentProfileId);
    const closureIds = memoryDescendantClosure(lineage, root.id);
    const invalidatedAt = new Date();
    const result = await invalidateOwnedAgentMemories(transaction, {
      agentProfileId,
      memoryIds: closureIds,
      invalidatedAt,
    });
    if (result.count === 0)
      throw new AppError(
        "AGENT_MEMORY_INVALIDATED",
        409,
        "Seçili hafıza ve türetilmiş consolidation kayıtları zaten geçersiz.",
      );

    const metadata = {
      agentProfileId,
      rootMemoryId: root.id,
      affectedCount: result.count,
      lineageCount: closureIds.length,
      reason: input.reason,
      before: { invalidatedCount: 0, lineageCount: closureIds.length },
      after: { invalidatedCount: result.count, lineageCount: closureIds.length },
      invalidatedAt: invalidatedAt.toISOString(),
    };
    await recordMemoryChange(transaction, actor, {
      eventType: "agent.memory.forgotten",
      entityType: "AgentMemoryEpisode",
      entityId: root.id,
      metadata,
    });
    return {
      rootMemoryId: root.id,
      invalidatedAt,
      affectedCount: result.count,
      lineageCount: closureIds.length,
    };
  });
}

export function reconsolidateAgentMemory(
  client: DatabaseExecutor,
  actor: ActorContext,
  agentProfileId: string,
  input: ReconsolidateAgentMemoryInput,
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    await lockAgentProfile(transaction, agentProfileId);
    const agent = await ensureAgentExists(transaction, agentProfileId);
    if (agent.lifecycleStatus !== "ACTIVE" || !agent.currentPersonaVersionId)
      throw new AppError(
        "AGENT_LIFECYCLE_INVALID",
        409,
        "Hafıza reconsolidation yalnız ACTIVE ve persona sürümü bulunan agent için çalışır.",
      );
    const pending = await findPendingMemoryReconsolidation(transaction, agentProfileId);
    if (pending)
      throw new AppError(
        "AGENT_MEMORY_RECONSOLIDATION_PENDING",
        409,
        "Bu agent için bir hafıza reconsolidation çalışması zaten bekliyor.",
      );
    const settings = await getMemoryReflectionTimeout(transaction);
    const availableAt = new Date();
    const run = await createMemoryReconsolidationRun(transaction, {
      agentProfileId,
      personaVersionId: agent.currentPersonaVersionId,
      requestedById: actor.actorId,
      requestId: actor.requestId,
      timeoutSeconds: settings.reflectionTimeoutSeconds,
      availableAt,
    });
    const metadata = {
      agentProfileId,
      runType: run.runType,
      queuePriority: run.queuePriority,
      trigger: run.trigger,
      reason: input.reason,
      before: { runStatus: null },
      after: { runStatus: run.runStatus, runId: run.id },
      availableAt: availableAt.toISOString(),
    };
    await recordMemoryChange(transaction, actor, {
      eventType: "agent.run.queued",
      entityType: "AgentRun",
      entityId: run.id,
      metadata,
    });
    await appendRuntimeEvent(transaction, {
      agentProfileId,
      runId: run.id,
      eventType: "run.queued",
      safeMessage: "Admin hafıza reconsolidation çalışması kuyruğa alındı.",
      metadata: { runId: run.id, runType: run.runType, trigger: run.trigger },
    });
    return run;
  });
}
