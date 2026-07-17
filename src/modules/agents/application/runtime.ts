import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor, TransactionClient } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { appendAuditLog } from "@/modules/audit";
import type { RuntimePrincipal } from "@/modules/agents/application/runtime-auth";
import {
  appendRuntimeActions,
  appendRuntimeRunEvents,
  claimNextRuntimeRun,
  finalizeExpiredCancellation,
  findRuntimeOwnedRun,
  finishRuntimeRunRecord,
  getMeasuredRuntimeRunMetrics,
  getRuntimeAgentLifecycle,
  getRuntimeGlobalSettings,
  heartbeatRuntimeRunRecord,
  lockRuntimeAgent,
  lockRuntimeRun,
  setRuntimeCurrentRun,
} from "@/modules/agents/repository/runtime";
import type {
  RuntimeActionsInput,
  RuntimeCompleteInput,
  RuntimeEventsInput,
  RuntimeFailInput,
  RuntimeHeartbeatInput,
  RuntimeLeaseInput,
} from "@/modules/agents/validation/runtime-schemas";

type OwnedRun = NonNullable<Awaited<ReturnType<typeof findRuntimeOwnedRun>>>;

function runNotFound(): AppError {
  return new AppError("AGENT_RUN_NOT_FOUND", 404, "Runtime run bulunamadı.");
}

function assertLeaseOwner(
  run: OwnedRun | null,
  workerId: string,
  now: Date,
  allowCancelRequested = true,
): asserts run is OwnedRun {
  if (!run) throw runNotFound();
  const allowedStatuses = allowCancelRequested ? ["RUNNING", "CANCEL_REQUESTED"] : ["RUNNING"];
  if (
    !allowedStatuses.includes(run.runStatus) ||
    run.leaseOwner !== workerId ||
    !run.leaseExpiresAt ||
    run.leaseExpiresAt < now
  ) {
    throw new AppError(
      "AGENT_RUN_LEASE_INVALID",
      409,
      "Run lease sahibi veya süresi geçerli değil.",
    );
  }
}

async function auditRuntimeRun(
  transaction: TransactionClient,
  principal: RuntimePrincipal,
  runId: string,
  action: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await appendAuditLog(transaction, {
    actorId: principal.actor.actorId,
    action,
    entityType: "AgentRun",
    entityId: runId,
    requestId: principal.actor.requestId,
    metadata,
  });
}

export function leaseRuntimeRun(
  client: DatabaseExecutor,
  principal: RuntimePrincipal,
  input: RuntimeLeaseInput,
) {
  return inTransaction(client, async (transaction) => {
    await lockRuntimeAgent(transaction, principal.agentProfileId);
    const [agent, settings] = await Promise.all([
      getRuntimeAgentLifecycle(transaction, principal.agentProfileId),
      getRuntimeGlobalSettings(transaction),
    ]);
    if (!agent || agent.lifecycleStatus !== "ACTIVE" || !settings.runtimeEnabled) {
      return {
        run: null,
        reason: !agent || agent.lifecycleStatus !== "ACTIVE" ? "NOT_ACTIVE" : "PAUSED",
      };
    }
    const now = new Date();
    await finalizeExpiredCancellation(transaction, principal.agentProfileId, now);
    const run = await claimNextRuntimeRun(transaction, {
      agentProfileId: principal.agentProfileId,
      workerId: input.workerId,
      leaseSeconds: input.leaseSeconds,
      maxRetryCount: settings.maxRetryCount,
      now,
    });
    if (!run) return { run: null, reason: "QUEUE_EMPTY" };
    await setRuntimeCurrentRun(transaction, principal.agentProfileId, run.id, now);
    await appendRuntimeRunEvents(transaction, {
      runId: run.id,
      agentProfileId: principal.agentProfileId,
      events: [
        {
          eventType: "run.leased",
          safeMessage: "Run worker tarafından lease edildi.",
          metadata: { phase: "STARTING" },
        },
      ],
    });
    await auditRuntimeRun(transaction, principal, run.id, "agent.run.leased", {
      workerId: input.workerId,
      leaseExpiresAt: run.leaseExpiresAt?.toISOString(),
      attempt: run.attempts,
    });
    return { run, reason: null };
  });
}

export function heartbeatRuntimeRun(
  client: DatabaseExecutor,
  principal: RuntimePrincipal,
  runId: string,
  input: RuntimeHeartbeatInput,
) {
  return inTransaction(client, async (transaction) => {
    const now = new Date();
    await lockRuntimeRun(transaction, runId);
    const run = await findRuntimeOwnedRun(transaction, principal.agentProfileId, runId);
    assertLeaseOwner(run, input.workerId, now);
    const cancelRequested = run.runStatus === "CANCEL_REQUESTED";
    const runtimeStatus = cancelRequested ? "CANCELLING" : input.runtimeStatus;
    const leaseExpiresAt = new Date(now.getTime() + input.leaseSeconds * 1000);
    await heartbeatRuntimeRunRecord(transaction, {
      runId,
      agentProfileId: principal.agentProfileId,
      workerId: input.workerId,
      leaseExpiresAt,
      now,
      runtimeStatus,
    });
    return { runId, leaseExpiresAt, cancelRequested };
  });
}

export function getRuntimeRunContext(
  client: DatabaseExecutor,
  principal: RuntimePrincipal,
  runId: string,
  workerId: string,
) {
  return inTransaction(client, async (transaction) => {
    await lockRuntimeRun(transaction, runId);
    const run = await findRuntimeOwnedRun(transaction, principal.agentProfileId, runId);
    assertLeaseOwner(run, workerId, new Date());
    const settings = await getRuntimeGlobalSettings(transaction);
    return {
      run: {
        id: run.id,
        runType: run.runType,
        timeoutSeconds: run.timeoutSeconds,
        desiredEntryMin: run.desiredEntryMin,
        desiredEntryMax: run.desiredEntryMax,
        allowTopicCreation: run.allowTopicCreation && settings.topicCreationEnabled,
        allowVoting: run.allowVoting && settings.votingEnabled,
        allowFollowing: run.allowFollowing && settings.userFollowingEnabled,
        allowSourceReading: run.allowSourceReading && settings.sourceReadingEnabled,
        publishEnabled: settings.publishEnabled,
        saturationOverride: run.saturationOverride,
        dailyMaximumOverride: run.dailyMaximumOverride,
        adminInstruction: run.adminInstruction,
        cancelRequested: run.runStatus === "CANCEL_REQUESTED",
      },
      agent: {
        profileId: run.agentProfileId,
        username: run.agentProfile.user.username,
        displayName: run.agentProfile.user.displayName,
        publicBio: run.agentProfile.user.bio,
        lifecycleStatus: run.agentProfile.lifecycleStatus,
      },
      persona: {
        version: run.personaVersion.version,
        document: run.personaVersion.persona,
        renderedPrompt: run.personaVersion.renderedPrompt,
      },
    };
  });
}

export function recordRuntimeEvents(
  client: DatabaseExecutor,
  principal: RuntimePrincipal,
  runId: string,
  input: RuntimeEventsInput,
) {
  return inTransaction(client, async (transaction) => {
    await lockRuntimeRun(transaction, runId);
    const run = await findRuntimeOwnedRun(transaction, principal.agentProfileId, runId);
    assertLeaseOwner(run, input.workerId, new Date());
    return appendRuntimeRunEvents(transaction, {
      runId,
      agentProfileId: principal.agentProfileId,
      events: input.events,
    });
  });
}

export function recordRuntimeActions(
  client: DatabaseExecutor,
  principal: RuntimePrincipal,
  runId: string,
  input: RuntimeActionsInput,
) {
  return inTransaction(client, async (transaction) => {
    await lockRuntimeRun(transaction, runId);
    const run = await findRuntimeOwnedRun(transaction, principal.agentProfileId, runId);
    assertLeaseOwner(run, input.workerId, new Date(), false);
    const result = await appendRuntimeActions(transaction, {
      runId,
      agentProfileId: principal.agentProfileId,
      actions: input.actions.map((action) => ({
        sequence: action.sequence,
        actionType: action.actionType,
        input: action.input,
        ...(action.targetType !== undefined ? { targetType: action.targetType } : {}),
        ...(action.targetId !== undefined ? { targetId: action.targetId } : {}),
        ...(action.provenance !== undefined ? { provenance: action.provenance } : {}),
      })),
    });
    await auditRuntimeRun(transaction, principal, runId, "agent.run.actions_proposed", {
      count: result.count,
      actionTypes: input.actions.map(({ actionType }) => actionType),
    });
    return result;
  });
}

export function completeRuntimeRun(
  client: DatabaseExecutor,
  principal: RuntimePrincipal,
  runId: string,
  input: RuntimeCompleteInput,
) {
  return inTransaction(client, async (transaction) => {
    const now = new Date();
    await lockRuntimeRun(transaction, runId);
    const run = await findRuntimeOwnedRun(transaction, principal.agentProfileId, runId);
    assertLeaseOwner(run, input.workerId, now);
    const measuredMetrics = await getMeasuredRuntimeRunMetrics(transaction, runId);
    await finishRuntimeRunRecord(transaction, {
      runId,
      agentProfileId: principal.agentProfileId,
      outcome: input.outcome,
      now,
      safeRunSummary: input.safeRunSummary,
      usageMetadata: input.usageMetadata,
      performanceMetrics: { reported: input.performanceMetrics, measured: measuredMetrics },
      publishedEntries: measuredMetrics.publishedEntries,
      createdTopics: measuredMetrics.createdTopics,
      votes: measuredMetrics.votes,
      sourceReads: measuredMetrics.sourceReads,
    });
    await appendRuntimeRunEvents(transaction, {
      runId,
      agentProfileId: principal.agentProfileId,
      events: [
        {
          eventType: "run.completed",
          safeMessage: `Run ${input.outcome} durumuyla tamamlandı.`,
          metadata: { phase: input.outcome },
        },
      ],
    });
    await auditRuntimeRun(transaction, principal, runId, "agent.run.completed", {
      outcome: input.outcome,
    });
    return { runId, runStatus: input.outcome, finishedAt: now };
  });
}

export function failRuntimeRun(
  client: DatabaseExecutor,
  principal: RuntimePrincipal,
  runId: string,
  input: RuntimeFailInput,
) {
  return inTransaction(client, async (transaction) => {
    const now = new Date();
    await lockRuntimeRun(transaction, runId);
    const run = await findRuntimeOwnedRun(transaction, principal.agentProfileId, runId);
    assertLeaseOwner(run, input.workerId, now);
    await finishRuntimeRunRecord(transaction, {
      runId,
      agentProfileId: principal.agentProfileId,
      outcome: input.outcome,
      now,
      ...(input.usageMetadata ? { usageMetadata: input.usageMetadata } : {}),
      errorCode: input.errorCode,
      errorSummary: input.errorSummary,
    });
    await appendRuntimeRunEvents(transaction, {
      runId,
      agentProfileId: principal.agentProfileId,
      events: [
        {
          eventType: "run.failed",
          safeMessage: `Run ${input.outcome} durumuyla kapatıldı.`,
          metadata: { phase: input.outcome, code: input.errorCode },
        },
      ],
    });
    await auditRuntimeRun(transaction, principal, runId, "agent.run.failed", {
      outcome: input.outcome,
      errorCode: input.errorCode,
    });
    return { runId, runStatus: input.outcome, finishedAt: now };
  });
}
