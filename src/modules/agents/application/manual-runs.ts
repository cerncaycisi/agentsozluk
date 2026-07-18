import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { appendAuditLog } from "@/modules/audit";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { requireAgentAdminInTransaction } from "@/modules/agents/application/authorization";
import {
  appendRuntimeEvent,
  findAgentForMutation,
  getGlobalSettingsRecord,
  lockAgentProfile,
} from "@/modules/agents/repository/control-plane";
import {
  cancelAgentRunRecord,
  createRetryRunRecord,
  createManualRunRecord,
  findAgentRunForCommand,
  getAgentRunDetailRecord,
  getBulkRunPreviewMetrics,
  listBulkRunAgents,
  listAgentRunsRecord,
  lockAgentRun,
} from "@/modules/agents/repository/manual-runs";
import type {
  AgentRunCommandInput,
  BulkAgentRunInput,
  BulkAgentRunPreviewInput,
  ManualAgentRunInput,
} from "@/modules/agents/validation/scheduling-schemas";
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
    const [agent, settings] = await Promise.all([
      findAgentForMutation(transaction, agentProfileId),
      getGlobalSettingsRecord(transaction),
    ]);
    if (!agent) throw new AppError("AGENT_NOT_FOUND", 404, "Agent bulunamadı.");
    if (agent.lifecycleStatus !== "ACTIVE" || !agent.currentPersonaVersion) {
      throw new AppError("AGENT_LIFECYCLE_INVALID", 409, "Yalnız ACTIVE agent kuyruğa alınabilir.");
    }
    const nonPublishing = isNonPublishingRun(input.runType);
    const entryTarget = nonPublishing ? 0 : input.entryTarget;
    const timeoutSeconds =
      input.runType === "REFLECTION"
        ? settings.reflectionTimeoutSeconds
        : input.runType === "SOURCE_REFRESH"
          ? settings.sourceRefreshTimeoutSeconds
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
      provocationOverride: input.provocationOverride,
      ...(input.adminInstruction ? { adminInstruction: input.adminInstruction } : {}),
    });
    const metadata = {
      agentProfileId,
      runType: run.runType,
      queuePriority: run.queuePriority,
      availableAt: run.availableAt.toISOString(),
      dailyMaximumOverride: run.dailyMaximumOverride,
      provocationOverride: run.provocationOverride,
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

function bulkSelection(input: BulkAgentRunPreviewInput | BulkAgentRunInput): string[] | undefined {
  return input.allActive ? undefined : input.agentIds;
}

export function previewBulkAgentRun(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: BulkAgentRunPreviewInput,
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    const [agents, metrics] = await Promise.all([
      listBulkRunAgents(transaction, bulkSelection(input)),
      getBulkRunPreviewMetrics(transaction),
    ]);
    if (!input.allActive && agents.length !== input.agentIds?.length)
      throw new AppError(
        "AGENT_NOT_FOUND",
        404,
        "Seçili ACTIVE agent listesi eksik veya geçersiz.",
      );
    const p75DurationMs = metrics.capability?.p75DurationMs ?? null;
    const concurrency = metrics.settings.codexConcurrency;
    const estimatedStartAt = p75DurationMs
      ? new Date(Date.now() + Math.ceil(metrics.queueLength / concurrency) * p75DurationMs)
      : null;
    const estimatedCompleteAt = p75DurationMs
      ? new Date(
          Date.now() +
            Math.ceil((metrics.queueLength + agents.length + metrics.running) / concurrency) *
              p75DurationMs,
        )
      : null;
    return {
      runCount: agents.length,
      existingQueueLength: metrics.queueLength,
      measuredP75DurationMs: p75DurationMs,
      estimateStatus: p75DurationMs ? "ESTIMATED" : "UNKNOWN",
      estimatedStartAt,
      estimatedCompleteAt,
      estimatedScheduledDelayMs: p75DurationMs
        ? Math.ceil(agents.length / concurrency) * p75DurationMs
        : null,
      targetMissRiskChange: "UNKNOWN",
      workerUtilization: null,
      concurrency,
      saturationOverride: input.run.saturationOverride,
      dailyMaximumOverride: input.run.dailyMaximumOverride,
      provocationOverride: input.run.provocationOverride,
      oldestQueuedAt: metrics.oldestQueued?.createdAt ?? null,
    };
  });
}

export function createBulkAgentRuns(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: BulkAgentRunInput,
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    const [agents, settings] = await Promise.all([
      listBulkRunAgents(transaction, bulkSelection(input)),
      getGlobalSettingsRecord(transaction),
    ]);
    if (!input.allActive && agents.length !== input.agentIds?.length)
      throw new AppError(
        "AGENT_NOT_FOUND",
        404,
        "Seçili ACTIVE agent listesi eksik veya geçersiz.",
      );
    const nonPublishing = isNonPublishingRun(input.run.runType);
    const runs = [];
    for (const agent of agents) {
      const entryTarget = nonPublishing ? 0 : input.run.entryTarget;
      const timeoutSeconds =
        input.run.runType === "REFLECTION"
          ? settings.reflectionTimeoutSeconds
          : input.run.runType === "SOURCE_REFRESH"
            ? settings.sourceRefreshTimeoutSeconds
            : agent.manualTimeoutSeconds;
      runs.push(
        await createManualRunRecord(transaction, {
          agentProfileId: agent.id,
          personaVersionId: agent.currentPersonaVersionId!,
          requestedById: actor.actorId,
          requestId: actor.requestId,
          idempotencySuffix: agent.id,
          trigger: "ADMIN_BULK",
          runType: input.run.runType,
          queuePriority: input.run.priority === "EMERGENCY" ? "MANUAL_SINGLE" : "SCHEDULED_CONTENT",
          availableAt: input.run.availableAt ?? new Date(),
          timeoutSeconds,
          desiredEntryMin: entryTarget,
          desiredEntryMax: entryTarget,
          allowTopicCreation: !nonPublishing && input.run.allowTopicCreation,
          allowVoting: !nonPublishing && input.run.allowVoting,
          allowFollowing: !nonPublishing && input.run.allowFollowing,
          allowSourceReading: input.run.allowSourceReading,
          saturationOverride: input.run.saturationOverride,
          dailyMaximumOverride: input.run.dailyMaximumOverride,
          provocationOverride: input.run.provocationOverride,
          ...(input.run.adminInstruction ? { adminInstruction: input.run.adminInstruction } : {}),
        }),
      );
    }
    await appendAuditLog(transaction, {
      actorId: actor.actorId,
      action: "agent.run.bulk_queued",
      entityType: "AgentRun",
      entityId: null,
      requestId: actor.requestId,
      metadata: {
        runCount: runs.length,
        allActive: input.allActive,
        runType: input.run.runType,
        queuePriority: input.run.priority === "EMERGENCY" ? "MANUAL_SINGLE" : "SCHEDULED_CONTENT",
      },
    });
    await appendRuntimeEvent(transaction, {
      eventType: "run.bulk_queued",
      safeMessage: `${runs.length} agent run bulk kuyruğa alındı.`,
      metadata: { runCount: runs.length, runType: input.run.runType },
    });
    return { runs, count: runs.length };
  });
}

export function cancelAgentRun(
  client: DatabaseExecutor,
  actor: ActorContext,
  runId: string,
  input: AgentRunCommandInput,
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    await lockAgentRun(transaction, runId);
    const run = await findAgentRunForCommand(transaction, runId);
    if (!run) throw new AppError("AGENT_RUN_NOT_FOUND", 404, "Agent run bulunamadı.");
    if (!["QUEUED", "RUNNING"].includes(run.runStatus))
      throw new AppError("AGENT_RUN_LEASE_INVALID", 409, "Bu run iptal edilebilir durumda değil.");
    const updated = await cancelAgentRunRecord(
      transaction,
      runId,
      run.runStatus === "RUNNING",
      new Date(),
    );
    await appendAuditLog(transaction, {
      actorId: actor.actorId,
      action: "agent.run.cancel_requested",
      entityType: "AgentRun",
      entityId: runId,
      requestId: actor.requestId,
      metadata: {
        reason: input.reason,
        previousStatus: run.runStatus,
        nextStatus: updated.runStatus,
      },
    });
    return updated;
  });
}

export function retryAgentRun(
  client: DatabaseExecutor,
  actor: ActorContext,
  runId: string,
  input: AgentRunCommandInput,
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    await lockAgentRun(transaction, runId);
    const run = await findAgentRunForCommand(transaction, runId);
    if (!run) throw new AppError("AGENT_RUN_NOT_FOUND", 404, "Agent run bulunamadı.");
    if (!["FAILED", "TIMED_OUT", "CANCELLED", "PARTIAL"].includes(run.runStatus))
      throw new AppError("AGENT_RUN_LEASE_INVALID", 409, "Bu run retry edilebilir durumda değil.");
    const retry = await createRetryRunRecord(transaction, {
      run,
      requestedById: actor.actorId,
      requestId: actor.requestId,
    });
    await appendAuditLog(transaction, {
      actorId: actor.actorId,
      action: "agent.run.retried",
      entityType: "AgentRun",
      entityId: retry.id,
      requestId: actor.requestId,
      metadata: { parentRunId: run.id, reason: input.reason },
    });
    return retry;
  });
}

export function getAgentRunDetail(client: DatabaseExecutor, actor: ActorContext, runId: string) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    const run = await getAgentRunDetailRecord(transaction, runId);
    if (!run) throw new AppError("AGENT_RUN_NOT_FOUND", 404, "Agent run bulunamadı.");
    return run;
  });
}
