import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { appendAuditLog } from "@/modules/audit";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { requireAgentAdminInTransaction } from "@/modules/agents/application/authorization";
import {
  appendRuntimeEvent,
  findAgentForMutation,
  lockAgentProfile,
} from "@/modules/agents/repository/control-plane";
import {
  createManualRunRecord,
  listAgentRunsRecord,
} from "@/modules/agents/repository/manual-runs";
import type { ManualAgentRunInput } from "@/modules/agents/validation/scheduling-schemas";
import { appendOutboxEvent } from "@/modules/outbox";

function isNonPublishingRun(runType: ManualAgentRunInput["runType"]): boolean {
  return ["READ_ONLY", "DRY_RUN", "REFLECTION", "SOURCE_REFRESH"].includes(runType);
}

export function createManualAgentRun(
  client: DatabaseExecutor,
  actor: ActorContext,
  agentProfileId: string,
  input: ManualAgentRunInput,
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    await lockAgentProfile(transaction, agentProfileId);
    const agent = await findAgentForMutation(transaction, agentProfileId);
    if (!agent) throw new AppError("AGENT_NOT_FOUND", 404, "Agent bulunamadı.");
    if (agent.lifecycleStatus !== "ACTIVE" || !agent.currentPersonaVersion) {
      throw new AppError("AGENT_LIFECYCLE_INVALID", 409, "Yalnız ACTIVE agent kuyruğa alınabilir.");
    }
    const nonPublishing = isNonPublishingRun(input.runType);
    const entryTarget = nonPublishing ? 0 : input.entryTarget;
    const timeoutSeconds =
      input.runType === "REFLECTION"
        ? 600
        : input.runType === "SOURCE_REFRESH"
          ? 300
          : agent.manualTimeoutSeconds;
    const run = await createManualRunRecord(transaction, {
      agentProfileId,
      personaVersionId: agent.currentPersonaVersion.id,
      requestedById: actor.actorId,
      requestId: actor.requestId,
      runType: input.runType,
      queuePriority: input.priority === "EMERGENCY" ? "EMERGENCY_ADMIN" : "MANUAL_SINGLE",
      availableAt: input.availableAt ?? new Date(),
      timeoutSeconds,
      desiredEntryMin: entryTarget,
      desiredEntryMax: entryTarget,
      allowTopicCreation: !nonPublishing && input.allowTopicCreation,
      allowVoting: !nonPublishing && input.allowVoting,
      allowFollowing: !nonPublishing && input.allowFollowing,
      allowSourceReading: input.allowSourceReading,
      saturationOverride: input.saturationOverride,
      dailyMaximumOverride: input.dailyMaximumOverride,
      ...(input.adminInstruction ? { adminInstruction: input.adminInstruction } : {}),
    });
    const metadata = {
      agentProfileId,
      runType: run.runType,
      queuePriority: run.queuePriority,
      availableAt: run.availableAt.toISOString(),
      dailyMaximumOverride: run.dailyMaximumOverride,
      saturationOverride: run.saturationOverride,
    };
    await appendAuditLog(transaction, {
      actorId: actor.actorId,
      action: "agent.run.queued",
      entityType: "AgentRun",
      entityId: run.id,
      requestId: actor.requestId,
      metadata,
    });
    await appendOutboxEvent(transaction, {
      eventType: "agent.run.queued",
      aggregateType: "AgentRun",
      aggregateId: run.id,
      actorId: actor.actorId,
      actorKind: actor.actorKind,
      requestId: actor.requestId,
      payload: metadata,
    });
    await appendRuntimeEvent(transaction, {
      agentProfileId,
      eventType: "run.queued",
      safeMessage: "Manual agent run kuyruğa alındı.",
      metadata: { runId: run.id, runType: run.runType },
    });
    return run;
  });
}

export function listAgentRuns(
  client: DatabaseExecutor,
  actor: ActorContext,
  agentProfileId: string,
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    return listAgentRunsRecord(transaction, agentProfileId);
  });
}
