import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor, TransactionClient } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { sha256 } from "@/lib/security/crypto";
import { appendAuditLog } from "@/modules/audit";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { requireAgentAdminInTransaction } from "@/modules/agents/application/authorization";
import {
  evaluateProductionGate10,
  evaluateProductionGate11,
  evaluateProductionGate9,
} from "@/modules/agents/domain/production-rollout";
import { istanbulCalendarDateKey } from "@/modules/agents/domain/runtime-controls";
import {
  appendRuntimeEvent,
  getLatestProductionRolloutAttemptEvent,
  getProductionRolloutOperationalState,
  lockAgentSettings,
} from "@/modules/agents/repository/control-plane";
import { canonicalLifeEventJson } from "@/modules/agents/repository/life-ledger";
import {
  countProductionCriticalBreakerEvents,
  findProductionRolloutAttemptEvents,
  findProductionRolloutCommandReplay,
  listProductionActiveProfileIds,
  loadProductionGate10Proof,
  loadProductionGate11Proof,
  loadProductionGate9Proof,
  loadProductionScheduledRunProof,
  productionRolloutEventTypes,
  type ProductionRolloutEventType,
} from "@/modules/agents/repository/production-rollout";
import type { ProductionRolloutCheckpointInput } from "@/modules/agents/validation/production-rollout-schemas";
import { appendOutboxEvent } from "@/modules/outbox";

const GLOBAL_SETTINGS_AGGREGATE_ID = "00000000-0000-4000-8000-000000000001";
const checkpointMinutes = [0, 30, 60, 90, 120] as const;
const checkpointToleranceMs = 15 * 60_000;

type RolloutEvent = Awaited<ReturnType<typeof findProductionRolloutAttemptEvents>>[number];

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown, key: string): string | null {
  const candidate = objectValue(value)?.[key];
  return typeof candidate === "string" ? candidate : null;
}

function stringArray(value: unknown, key: string): string[] {
  const candidate = objectValue(value)?.[key];
  return Array.isArray(candidate)
    ? candidate.filter((item): item is string => typeof item === "string")
    : [];
}

function eventOfType(events: readonly RolloutEvent[], eventType: ProductionRolloutEventType) {
  return events.find((event) => event.eventType === eventType) ?? null;
}

function requireEvent(
  events: readonly RolloutEvent[],
  eventType: ProductionRolloutEventType,
  message: string,
) {
  const event = eventOfType(events, eventType);
  if (!event) throw new AppError("AGENT_LIFECYCLE_INVALID", 409, message);
  return event;
}

function checkpointEventType(
  kind: ProductionRolloutCheckpointInput["kind"],
): ProductionRolloutEventType {
  switch (kind) {
    case "GATE9_ACCEPTED":
      return productionRolloutEventTypes.gate9Completed;
    case "GATE10_STARTED":
      return productionRolloutEventTypes.gate10Started;
    case "GATE10_SAMPLED":
      return productionRolloutEventTypes.gate10Checkpoint;
    case "GATE10_ACCEPTED":
      return productionRolloutEventTypes.gate10Completed;
    case "GATE11_STARTED":
      return productionRolloutEventTypes.gate11Started;
    case "GATE11_ACCEPTED":
      return productionRolloutEventTypes.gate11Completed;
    case "GATE12_PRE_REBOOT":
      return productionRolloutEventTypes.gate12PreReboot;
    case "GATE12_POST_REBOOT":
      return productionRolloutEventTypes.gate12PostReboot;
    case "GATE12_ACCEPTED":
      return productionRolloutEventTypes.gate12Completed;
  }
}

function assertRuntimeState(
  state: Awaited<ReturnType<typeof getProductionRolloutOperationalState>>,
  expected: { active: number; paused: number; runtimeEnabled: boolean; drained?: boolean },
): void {
  if (
    state.totalProfileCount !== 10 ||
    state.activeProfileCount !== expected.active ||
    state.pausedProfileCount !== expected.paused ||
    state.settings.runtimeEnabled !== expected.runtimeEnabled ||
    !state.settings.schedulerEnabled ||
    !state.settings.publicWriteEnabled ||
    state.settings.runtimeOperatingMode !== "NORMAL" ||
    (expected.drained === true && (state.nonterminalRunCount !== 0 || state.liveLeaseCount !== 0))
  )
    throw new AppError(
      "AGENT_LIFECYCLE_INVALID",
      409,
      "Production rollout checkpoint için authoritative runtime state uygun değil.",
      undefined,
      undefined,
      {
        totalProfileCount: state.totalProfileCount,
        activeProfileCount: state.activeProfileCount,
        pausedProfileCount: state.pausedProfileCount,
        runtimeEnabled: state.settings.runtimeEnabled,
        schedulerEnabled: state.settings.schedulerEnabled,
        publicWriteEnabled: state.settings.publicWriteEnabled,
        runtimeOperatingMode: state.settings.runtimeOperatingMode,
        nonterminalRunCount: state.nonterminalRunCount,
        liveLeaseCount: state.liveLeaseCount,
      },
    );
}

async function recordCheckpointEvidence(
  transaction: TransactionClient,
  actor: ActorContext,
  input: ProductionRolloutCheckpointInput,
  eventType: ProductionRolloutEventType,
  localDate: string,
  startedEventId: string,
  result: Record<string, unknown>,
  now: Date,
) {
  const requestHash = sha256(canonicalLifeEventJson(input));
  const metadata = {
    attemptId: input.attemptId,
    commandId: input.commandId,
    command: input.kind,
    requestHash,
    localDate,
    startedEventId,
    proofVersion: 1,
    ...result,
  };
  const event = await appendRuntimeEvent(transaction, {
    eventType,
    safeMessage: `${input.kind} production rollout kanıtı doğrulandı ve kaydedildi.`,
    metadata,
    occurredAt: now,
  });
  const auditMetadata = {
    actorKind: actor.actorKind,
    before: null,
    after: { checkpoint: input.kind, attemptId: input.attemptId },
    reason: `Production rollout checkpoint ${input.kind} recorded after deterministic verification.`,
    ...metadata,
    runtimeEventId: event.id.toString(),
  };
  await appendAuditLog(transaction, {
    actorId: actor.actorId,
    action: "agent.rollout_checkpoint.recorded",
    entityType: "AgentGlobalSettings",
    entityId: GLOBAL_SETTINGS_AGGREGATE_ID,
    requestId: actor.requestId,
    metadata: auditMetadata,
  });
  await appendOutboxEvent(transaction, {
    eventType: "agent.rollout_checkpoint.recorded",
    aggregateType: "AgentGlobalSettings",
    aggregateId: GLOBAL_SETTINGS_AGGREGATE_ID,
    actorId: actor.actorId,
    actorKind: actor.actorKind,
    requestId: actor.requestId,
    payload: auditMetadata,
  });
  return { eventId: event.id.toString(), requestHash };
}

function receiptFields(input: ProductionRolloutCheckpointInput): Record<string, unknown> {
  return { ...input };
}

export function recordProductionRolloutCheckpoint(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: ProductionRolloutCheckpointInput,
  now?: Date,
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    await lockAgentSettings(transaction);
    const observedNow = now ?? new Date();
    const requestHash = sha256(canonicalLifeEventJson(input));
    const requestedEventType = checkpointEventType(input.kind);
    const replay = await findProductionRolloutCommandReplay(transaction, input.commandId);
    if (replay) {
      if (
        replay.attemptId !== input.attemptId ||
        replay.command !== input.kind ||
        replay.requestHash !== requestHash ||
        replay.event.eventType !== requestedEventType
      )
        throw new AppError(
          "IDEMPOTENCY_CONFLICT",
          409,
          "Rollout checkpoint commandId farklı bir immutable istek için kullanılmış.",
        );
      return {
        eventId: replay.event.id.toString(),
        attemptId: input.attemptId,
        checkpoint: input.kind,
        replayed: true,
      };
    }

    const latest = await getLatestProductionRolloutAttemptEvent(transaction);
    const latestMetadata = objectValue(latest?.metadata);
    if (
      latest?.eventType !== productionRolloutEventTypes.attemptStarted ||
      latestMetadata?.attemptId !== input.attemptId
    )
      throw new AppError(
        "AGENT_LIFECYCLE_INVALID",
        409,
        "Checkpoint yalnız exact aktif production rollout attempt için kaydedilebilir.",
      );
    const localDate = stringValue(latest.metadata, "localDate");
    if (!localDate || istanbulCalendarDateKey(observedNow) !== localDate)
      throw new AppError(
        "AGENT_LIFECYCLE_INVALID",
        409,
        "Rollout checkpoint attempt İstanbul tarihi dışında kaydedilemez.",
      );
    const events = await findProductionRolloutAttemptEvents(transaction, input.attemptId);
    const started = requireEvent(
      events,
      productionRolloutEventTypes.attemptStarted,
      "Rollout STARTED kanıtı bulunamadı.",
    );
    const state = await getProductionRolloutOperationalState(transaction, observedNow);
    let result: Record<string, unknown>;

    switch (input.kind) {
      case "GATE9_ACCEPTED": {
        if (eventOfType(events, productionRolloutEventTypes.gate9Completed))
          throw new AppError("IDEMPOTENCY_CONFLICT", 409, "Gate 9 zaten kaydedilmiş.");
        assertRuntimeState(state, { active: 0, paused: 10, runtimeEnabled: false, drained: true });
        const proof = await loadProductionGate9Proof(transaction, {
          readOnlyRunId: input.readOnlyRunId,
          dryRunId: input.dryRunId,
          normalWakeRunId: input.normalWakeRunId,
          normalWakeEntryId: input.normalWakeEntryId,
          reportId: input.reportId,
          gracefulCancellationRunId: input.gracefulStoppedRunId,
          pendingCancellationRunId: input.pendingCancelledRunId,
        });
        const evaluated = evaluateProductionGate9({
          attemptLocalDate: localDate,
          attemptStartedAt: started.occurredAt,
          gateObservedAt: observedNow,
          smokeAgentProfileId: input.smokeProfileId,
          ...proof,
        });
        if (!evaluated.passed)
          throw new AppError(
            "AGENT_LIFECYCLE_INVALID",
            409,
            "Gate 9 relational proof doğrulanamadı.",
            undefined,
            undefined,
            { failures: evaluated.failures },
          );
        result = { ...receiptFields(input), metrics: evaluated.metrics };
        break;
      }
      case "GATE10_STARTED": {
        requireEvent(
          events,
          productionRolloutEventTypes.gate9Completed,
          "Önce Gate 9 tamamlanmalıdır.",
        );
        if (eventOfType(events, productionRolloutEventTypes.gate10Started))
          throw new AppError("IDEMPOTENCY_CONFLICT", 409, "Gate 10 zaten başlatılmış.");
        assertRuntimeState(state, { active: 5, paused: 5, runtimeEnabled: true });
        const cohortAgentIds = (await listProductionActiveProfileIds(transaction)).map(
          ({ id }) => id,
        );
        result = { cohortAgentIds };
        break;
      }
      case "GATE10_SAMPLED": {
        const gate10 = requireEvent(
          events,
          productionRolloutEventTypes.gate10Started,
          "Gate 10 observation başlamadı.",
        );
        if (eventOfType(events, productionRolloutEventTypes.gate10Completed))
          throw new AppError("AGENT_LIFECYCLE_INVALID", 409, "Tamamlanmış Gate 10 örneklenemez.");
        assertRuntimeState(state, { active: 5, paused: 5, runtimeEnabled: true });
        const samples = events.filter(
          (event) => event.eventType === productionRolloutEventTypes.gate10Checkpoint,
        );
        if (samples.length !== input.sampleIndex)
          throw new AppError(
            "AGENT_LIFECYCLE_INVALID",
            409,
            "Gate 10 örnekleri 0,30,60,90,120 sırasıyla kaydedilmelidir.",
          );
        const minute = checkpointMinutes[input.sampleIndex]!;
        const elapsed = observedNow.getTime() - gate10.occurredAt.getTime();
        const target = minute * 60_000;
        if (elapsed < target || elapsed > target + checkpointToleranceMs)
          throw new AppError(
            "AGENT_LIFECYCLE_INVALID",
            409,
            "Gate 10 örneği zorunlu 15 dakikalık observation toleransı dışında.",
          );
        const firstRestartCount = objectValue(samples[0]?.metadata)?.workerRestartCount;
        if (typeof firstRestartCount === "number" && firstRestartCount !== input.workerRestartCount)
          throw new AppError(
            "AGENT_LIFECYCLE_INVALID",
            409,
            "Gate 10 observation sırasında runtime restart sayısı değişti.",
          );
        result = { ...receiptFields(input), checkpointMinute: minute };
        break;
      }
      case "GATE10_ACCEPTED": {
        const gate10 = requireEvent(
          events,
          productionRolloutEventTypes.gate10Started,
          "Gate 10 observation başlamadı.",
        );
        if (eventOfType(events, productionRolloutEventTypes.gate10Completed))
          throw new AppError("IDEMPOTENCY_CONFLICT", 409, "Gate 10 zaten tamamlanmış.");
        assertRuntimeState(state, { active: 5, paused: 5, runtimeEnabled: true });
        const cohortAgentIds = stringArray(gate10.metadata, "cohortAgentIds");
        const proof = await loadProductionGate10Proof(transaction, {
          attemptId: input.attemptId,
          attemptLocalDate: localDate,
          cohortAgentIds,
          windowStartedAt: gate10.occurredAt,
          windowFinishedAt: observedNow,
        });
        const evaluated = evaluateProductionGate10({
          attemptLocalDate: localDate,
          cohortAgentIds,
          windowStartedAt: gate10.occurredAt,
          windowFinishedAt: observedNow,
          ...proof,
        });
        if (!evaluated.passed)
          throw new AppError(
            "AGENT_LIFECYCLE_INVALID",
            409,
            "Gate 10 iki saatlik relational proof doğrulanamadı.",
            undefined,
            undefined,
            { failures: evaluated.failures, metrics: evaluated.metrics },
          );
        result = {
          cohortAgentIds,
          metrics: evaluated.metrics,
          capacitySnapshotId: proof.capacitySnapshot?.id ?? null,
        };
        break;
      }
      case "GATE11_STARTED": {
        requireEvent(
          events,
          productionRolloutEventTypes.gate10Completed,
          "Önce Gate 10 tamamlanmalıdır.",
        );
        if (eventOfType(events, productionRolloutEventTypes.gate11Started))
          throw new AppError("IDEMPOTENCY_CONFLICT", 409, "Gate 11 zaten başlatılmış.");
        assertRuntimeState(state, { active: 10, paused: 0, runtimeEnabled: true });
        const activeAgentIds = (await listProductionActiveProfileIds(transaction)).map(
          ({ id }) => id,
        );
        result = { activeAgentIds };
        break;
      }
      case "GATE11_ACCEPTED": {
        const gate11 = requireEvent(
          events,
          productionRolloutEventTypes.gate11Started,
          "Gate 11 escalation başlamadı.",
        );
        if (eventOfType(events, productionRolloutEventTypes.gate11Completed))
          throw new AppError("IDEMPOTENCY_CONFLICT", 409, "Gate 11 zaten tamamlanmış.");
        assertRuntimeState(state, { active: 10, paused: 0, runtimeEnabled: true });
        const runs = await loadProductionGate11Proof(transaction, {
          escalationStartedAt: gate11.occurredAt,
          windowFinishedAt: observedNow,
        });
        const evaluated = evaluateProductionGate11({
          attemptLocalDate: localDate,
          escalationStartedAt: gate11.occurredAt,
          runs,
        });
        if (!evaluated.passed)
          throw new AppError(
            "AGENT_LIFECYCLE_INVALID",
            409,
            "Gate 11 ilk üç scheduler run proof doğrulanamadı.",
            undefined,
            undefined,
            { failures: evaluated.failures },
          );
        result = { metrics: evaluated.metrics };
        break;
      }
      case "GATE12_PRE_REBOOT": {
        requireEvent(
          events,
          productionRolloutEventTypes.gate11Completed,
          "Önce Gate 11 tamamlanmalıdır.",
        );
        if (eventOfType(events, productionRolloutEventTypes.gate12PreReboot))
          throw new AppError("IDEMPOTENCY_CONFLICT", 409, "Gate 12 pre-reboot zaten kaydedilmiş.");
        assertRuntimeState(state, { active: 10, paused: 0, runtimeEnabled: false, drained: true });
        result = receiptFields(input);
        break;
      }
      case "GATE12_POST_REBOOT": {
        const before = requireEvent(
          events,
          productionRolloutEventTypes.gate12PreReboot,
          "Gate 12 pre-reboot kanıtı yok.",
        );
        if (eventOfType(events, productionRolloutEventTypes.gate12PostReboot))
          throw new AppError("IDEMPOTENCY_CONFLICT", 409, "Gate 12 post-reboot zaten kaydedilmiş.");
        assertRuntimeState(state, { active: 10, paused: 0, runtimeEnabled: false, drained: true });
        const beforeMetadata = objectValue(before.metadata);
        if (
          beforeMetadata?.bootIdHash === input.bootIdHash ||
          beforeMetadata?.ledgerIntegrityHash !== input.ledgerIntegrityHash ||
          beforeMetadata?.ledgerRowCount !== input.ledgerRowCount ||
          beforeMetadata?.productionGitSha !== input.productionGitSha ||
          beforeMetadata?.mainGitSha !== input.mainGitSha
        )
          throw new AppError(
            "AGENT_LIFECYCLE_INVALID",
            409,
            "Gate 12 boot değişimi, ledger eşitliği veya exact SHA kanıtı uyuşmuyor.",
          );
        result = receiptFields(input);
        break;
      }
      case "GATE12_ACCEPTED": {
        const afterReboot = requireEvent(
          events,
          productionRolloutEventTypes.gate12PostReboot,
          "Gate 12 post-reboot kanıtı yok.",
        );
        if (eventOfType(events, productionRolloutEventTypes.gate12Completed))
          throw new AppError("IDEMPOTENCY_CONFLICT", 409, "Gate 12 zaten tamamlanmış.");
        assertRuntimeState(state, { active: 10, paused: 0, runtimeEnabled: true, drained: true });
        const run = await loadProductionScheduledRunProof(
          transaction,
          input.postResumeScheduledRunId,
        );
        if (
          !run ||
          run.runStatus !== "SUCCEEDED" ||
          run.createdAt < afterReboot.occurredAt ||
          !run.startedAt ||
          !run.finishedAt ||
          istanbulCalendarDateKey(run.createdAt) !== localDate ||
          istanbulCalendarDateKey(run.startedAt) !== localDate ||
          istanbulCalendarDateKey(run.finishedAt) !== localDate ||
          run.attempts !== 1 ||
          run.outbox.queued !== 1 ||
          run.outbox.started !== 1 ||
          run.outbox.completed !== 1 ||
          run.outbox.failed !== 0
        )
          throw new AppError(
            "AGENT_LIFECYCLE_INVALID",
            409,
            "Gate 12 post-resume scheduler proof doğrulanamadı.",
          );
        const gate11 = requireEvent(
          events,
          productionRolloutEventTypes.gate11Started,
          "Gate 11 escalation kanıtı yok.",
        );
        const criticalBreakerCount = await countProductionCriticalBreakerEvents(transaction, {
          startedAt: gate11.occurredAt,
          finishedAt: observedNow,
        });
        if (criticalBreakerCount !== 0)
          throw new AppError(
            "AGENT_LIFECYCLE_INVALID",
            409,
            "Gate 11 sonrası critical breaker gözlendi.",
          );
        result = {
          ...receiptFields(input),
          postResumeRunStatus: run.runStatus,
          criticalBreakerCount,
        };
        break;
      }
    }

    const recorded = await recordCheckpointEvidence(
      transaction,
      actor,
      input,
      requestedEventType,
      localDate,
      started.id.toString(),
      result,
      observedNow,
    );
    return {
      eventId: recorded.eventId,
      attemptId: input.attemptId,
      checkpoint: input.kind,
      replayed: false,
    };
  });
}
