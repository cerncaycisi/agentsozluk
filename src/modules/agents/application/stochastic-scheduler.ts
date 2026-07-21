import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import type { RuntimePrincipal } from "@/modules/agents/application/runtime-auth";
import { guardProductionRolloutRuntimeMutation } from "@/modules/agents/application/rollout-guard";
import {
  selectStochasticWakeCandidates,
  stochasticDispatchProbability,
  stochasticTickKey,
  stochasticTickShouldDispatch,
  type StochasticActiveTimeProfile,
} from "@/modules/agents/domain/stochastic-scheduler";
import { appendRuntimeEvent, lockAgentSettings } from "@/modules/agents/repository/control-plane";
import {
  createStochasticWakeRuns,
  getStochasticSchedulerSnapshot,
  lockStochasticSchedulerTick,
  stochasticSchedulerTickWasCreated,
} from "@/modules/agents/repository/stochastic-scheduler";
import { activeTimeProfileSchema } from "@/modules/agents/validation/schemas";
import { appendOutboxEvent } from "@/modules/outbox";

export type StochasticSchedulerSkipReason =
  | "RUNTIME_DISABLED"
  | "SCHEDULER_DISABLED"
  | "PUBLIC_WRITE_DISABLED"
  | "MAINTENANCE_MODE"
  | "CAPACITY_FULL"
  | "QUEUE_NOT_EMPTY"
  | "TICK_ALREADY_PROCESSED"
  | "QUIET_WINDOW"
  | "NO_ELIGIBLE_AGENT"
  | null;

export function runRuntimeStochasticTick(
  client: DatabaseExecutor,
  principal: RuntimePrincipal,
  input: { workerId: string },
  now = new Date(),
) {
  return inTransaction(client, async (transaction) => {
    if (
      principal.actor.actorKind !== "AGENT" ||
      principal.actor.actorRole !== "USER" ||
      principal.actor.origin !== "AGENT"
    )
      throw new AppError("FORBIDDEN", 403, "Toplum tick'i yalnız runtime actor çalıştırabilir.");

    await lockAgentSettings(transaction);
    const rolloutBlock = await guardProductionRolloutRuntimeMutation(
      transaction,
      principal.actor,
      now,
    );
    if (rolloutBlock) return rolloutBlock;

    const tickKey = stochasticTickKey(now);
    await lockStochasticSchedulerTick(transaction, tickKey);
    const finish = (skipReason: StochasticSchedulerSkipReason) => ({
      tickKey,
      createdRuns: 0,
      selectedAgentProfileIds: [] as string[],
      skipReason,
      workerId: input.workerId,
    });
    if (await stochasticSchedulerTickWasCreated(transaction, tickKey))
      return finish("TICK_ALREADY_PROCESSED");
    const snapshot = await getStochasticSchedulerSnapshot(transaction, now);
    if (!snapshot.settings.runtimeEnabled) return finish("RUNTIME_DISABLED");
    if (!snapshot.settings.schedulerEnabled) return finish("SCHEDULER_DISABLED");
    if (!snapshot.settings.publishEnabled || !snapshot.settings.publicWriteEnabled)
      return finish("PUBLIC_WRITE_DISABLED");
    if (snapshot.settings.runtimeOperatingMode !== "NORMAL") return finish("MAINTENANCE_MODE");

    const concurrency = snapshot.settings.codexConcurrency === 2 ? 2 : 1;
    const availableLanes = concurrency - snapshot.runningCount - snapshot.queuedCount;
    if (availableLanes <= 0)
      return finish(snapshot.queuedCount > 0 ? "QUEUE_NOT_EMPTY" : "CAPACITY_FULL");

    const globalActiveTimeProfile = activeTimeProfileSchema.parse(
      snapshot.settings.activeTimeWeights,
    ) as StochasticActiveTimeProfile;
    const probability = stochasticDispatchProbability(globalActiveTimeProfile, now);
    const seed = `${snapshot.settings.settingsVersion}:${tickKey}`;
    if (!stochasticTickShouldDispatch({ tickKey, probability, seed }))
      return finish("QUIET_WINDOW");

    const candidateRecords = snapshot.candidates.flatMap((candidate) => {
      if (!candidate.currentPersonaVersionId) return [];
      return [
        {
          id: candidate.id,
          personaVersionId: candidate.currentPersonaVersionId,
          activeTimeProfile: activeTimeProfileSchema.parse(
            candidate.activeTimeProfile,
          ) as StochasticActiveTimeProfile,
          lastRunAt: candidate.runtimeState?.lastRunAt ?? null,
        },
      ];
    });
    const selected = selectStochasticWakeCandidates({
      candidates: candidateRecords,
      count: availableLanes,
      now,
      seed,
    });
    if (selected.length === 0) return finish("NO_ELIGIBLE_AGENT");

    const runs = await createStochasticWakeRuns(transaction, {
      candidates: selected.map(({ id, personaVersionId }) => ({ id, personaVersionId })),
      tickKey,
      now,
      timeoutSeconds: snapshot.settings.scheduledTimeoutSeconds,
      allowTopicCreation: snapshot.settings.topicCreationEnabled,
      allowVoting: snapshot.settings.votingEnabled,
      allowFollowing: snapshot.settings.userFollowingEnabled,
      allowSourceReading: snapshot.settings.sourceReadingEnabled,
    });
    for (const run of runs)
      await appendOutboxEvent(transaction, {
        eventType: "agent.run.queued",
        aggregateType: "AgentRun",
        aggregateId: run.id,
        actorId: null,
        actorKind: null,
        requestId: principal.actor.requestId,
        payload: {
          agentProfileId: run.agentProfileId,
          runType: run.runType,
          trigger: run.trigger,
          runStatus: run.runStatus,
          queuePriority: run.queuePriority,
          availableAt: run.availableAt.toISOString(),
          desiredEntryMin: run.desiredEntryMin,
          desiredEntryMax: run.desiredEntryMax,
          parentRunId: run.parentRunId,
        },
      });
    const selectedAgentProfileIds = runs.map(({ agentProfileId }) => agentProfileId);
    await appendRuntimeEvent(transaction, {
      eventType: "scheduler.stochastic_tick",
      safeMessage: "Toplum tick'i uygun ACTIVE agentlar için çalışma kuyruğu oluşturdu.",
      metadata: {
        tickKey,
        probability,
        availableLanes,
        createdRuns: runs.length,
        selectedAgentProfileIds,
      },
    });
    return {
      tickKey,
      createdRuns: runs.length,
      selectedAgentProfileIds,
      skipReason: null,
      workerId: input.workerId,
    };
  });
}
