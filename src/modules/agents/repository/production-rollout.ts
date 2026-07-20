import type { Prisma } from "@prisma/client";
import type { TransactionClient } from "@/lib/db/types";
import type {
  ProductionCapacityProof,
  ProductionRunProof,
} from "@/modules/agents/domain/production-rollout";
import { isPublicRuntimeAction } from "@/modules/agents/domain/runtime-controls";

export const productionRolloutEventTypes = {
  attemptStarted: "runtime.production.rollout_attempt.started",
  gate9Completed: "runtime.production.rollout_gate9.completed",
  gate10Started: "runtime.production.rollout_gate10.started",
  gate10Checkpoint: "runtime.production.rollout_gate10.checkpoint",
  gate10Completed: "runtime.production.rollout_gate10.completed",
  gate11Started: "runtime.production.rollout_gate11.started",
  gate11Completed: "runtime.production.rollout_gate11.completed",
  gate12PreReboot: "runtime.production.rollout_gate12.pre_reboot",
  gate12PostReboot: "runtime.production.rollout_gate12.post_reboot",
  gate12Completed: "runtime.production.rollout_gate12.completed",
  attemptAborted: "runtime.production.rollout_attempt.aborted",
  attemptCompleted: "runtime.production.rollout_attempt.completed",
} as const;

export type ProductionRolloutEventType =
  (typeof productionRolloutEventTypes)[keyof typeof productionRolloutEventTypes];

const productionRolloutEventTypeValues = Object.values(productionRolloutEventTypes);
const canonicalRunOutboxEventTypes = [
  "agent.run.queued",
  "agent.run.started",
  "agent.run.completed",
  "agent.run.failed",
] as const;
const productionCriticalBreakerCodes = new Set([
  "RUNTIME_ERROR_RATE",
  "CONSECUTIVE_CODEX_FAILURES",
]);

const productionRunSelect = {
  id: true,
  agentProfileId: true,
  personaVersionId: true,
  runType: true,
  runStatus: true,
  trigger: true,
  scheduleSlotId: true,
  createdAt: true,
  startedAt: true,
  finishedAt: true,
  timeoutSeconds: true,
  attempts: true,
  desiredEntryMin: true,
  desiredEntryMax: true,
  requestedScheduleSlot: {
    select: { id: true, status: true, runId: true },
  },
} as const satisfies Prisma.AgentRunSelect;

type ProductionRunRow = Prisma.AgentRunGetPayload<{ select: typeof productionRunSelect }>;

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringArray(value: unknown, key: string): string[] {
  const candidate = objectValue(value)?.[key];
  return Array.isArray(candidate)
    ? candidate.filter((item): item is string => typeof item === "string")
    : [];
}

function rolloutLocalDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value))
    throw new RangeError("Production rollout localDate YYYY-MM-DD olmalıdır.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new RangeError("Production rollout localDate geçersizdir.");
  return date;
}

export function findProductionRolloutAttemptEvents(
  transaction: TransactionClient,
  attemptId: string,
) {
  return transaction.agentRuntimeEvent.findMany({
    where: {
      eventType: { in: productionRolloutEventTypeValues },
      agentProfileId: null,
      runId: null,
      actionId: null,
      metadata: { path: ["attemptId"], equals: attemptId },
    },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      eventType: true,
      metadata: true,
      occurredAt: true,
      createdAt: true,
    },
  });
}

export function findProductionRolloutAttemptEvent(
  transaction: TransactionClient,
  input: { attemptId: string; eventType: ProductionRolloutEventType },
) {
  return transaction.agentRuntimeEvent.findFirst({
    where: {
      eventType: input.eventType,
      agentProfileId: null,
      runId: null,
      actionId: null,
      metadata: { path: ["attemptId"], equals: input.attemptId },
    },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      eventType: true,
      metadata: true,
      occurredAt: true,
      createdAt: true,
    },
  });
}

/**
 * Command replay is resolved only from the append-only rollout journal. The
 * application layer compares the persisted attempt/command/request hash before
 * returning a prior result; malformed metadata therefore remains fail-closed.
 */
export async function findProductionRolloutCommandReplay(
  transaction: TransactionClient,
  commandId: string,
) {
  const events = await transaction.agentRuntimeEvent.findMany({
    where: {
      eventType: { in: productionRolloutEventTypeValues },
      agentProfileId: null,
      runId: null,
      actionId: null,
      metadata: { path: ["commandId"], equals: commandId },
    },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    take: 2,
    select: {
      id: true,
      eventType: true,
      metadata: true,
      occurredAt: true,
      createdAt: true,
    },
  });
  const event = events[0];
  if (!event) return null;
  const metadata = objectValue(event.metadata);
  return {
    event,
    commandId: typeof metadata?.commandId === "string" ? metadata.commandId : null,
    attemptId: typeof metadata?.attemptId === "string" ? metadata.attemptId : null,
    command: typeof metadata?.command === "string" ? metadata.command : null,
    requestHash: typeof metadata?.requestHash === "string" ? metadata.requestHash : null,
    result: metadata?.result ?? null,
    duplicateEventDetected: events.length > 1,
  } as const;
}

export function findProductionRolloutGate10CheckpointEvents(
  transaction: TransactionClient,
  input: { attemptId: string; windowStartedAt: Date; windowFinishedAt: Date },
) {
  return transaction.agentRuntimeEvent.findMany({
    where: {
      eventType: productionRolloutEventTypes.gate10Checkpoint,
      agentProfileId: null,
      runId: null,
      actionId: null,
      metadata: { path: ["attemptId"], equals: input.attemptId },
      occurredAt: { gte: input.windowStartedAt, lte: input.windowFinishedAt },
    },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    select: { metadata: true },
  });
}

interface ProductionProofArtifacts {
  actions: Array<{
    id: string;
    runId: string;
    sequence: number;
    actionType: string;
    actionStatus: string;
    provenance: unknown;
    createdAt: Date;
    updatedAt: Date;
  }>;
  contentRecords: Array<{ runId: string; entryId: string; actionId: string; createdAt: Date }>;
  outboxEvents: Array<{ aggregateId: string; eventType: string; createdAt: Date }>;
  auditEvents: Array<{ entityId: string | null; createdAt: Date }>;
  runtimeEvents: Array<{ runId: string | null; occurredAt: Date; createdAt: Date }>;
}

async function loadProductionProofArtifacts(
  transaction: TransactionClient,
  runIds: readonly string[],
): Promise<ProductionProofArtifacts> {
  if (runIds.length === 0)
    return {
      actions: [],
      contentRecords: [],
      outboxEvents: [],
      auditEvents: [],
      runtimeEvents: [],
    };
  const [actions, contentRecords, outboxEvents, auditEvents, runtimeEvents] = await Promise.all([
    transaction.agentAction.findMany({
      where: { runId: { in: [...runIds] } },
      select: {
        id: true,
        runId: true,
        sequence: true,
        actionType: true,
        actionStatus: true,
        provenance: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    transaction.agentContentRecord.findMany({
      where: { runId: { in: [...runIds] } },
      select: { runId: true, entryId: true, actionId: true, createdAt: true },
    }),
    transaction.outboxEvent.findMany({
      where: {
        aggregateType: "AgentRun",
        aggregateId: { in: [...runIds] },
        eventType: { in: [...canonicalRunOutboxEventTypes] },
      },
      select: { aggregateId: true, eventType: true, createdAt: true },
    }),
    transaction.auditLog.findMany({
      where: { entityType: "AgentRun", entityId: { in: [...runIds] } },
      select: { entityId: true, createdAt: true },
    }),
    transaction.agentRuntimeEvent.findMany({
      where: { runId: { in: [...runIds] } },
      select: { runId: true, occurredAt: true, createdAt: true },
    }),
  ]);
  return { actions, contentRecords, outboxEvents, auditEvents, runtimeEvents };
}

function countBy<T>(values: readonly T[], predicate: (value: T) => boolean): number {
  return values.reduce((count, value) => count + Number(predicate(value)), 0);
}

async function hydrateProductionRunProofs(
  transaction: TransactionClient,
  rows: readonly ProductionRunRow[],
): Promise<ProductionRunProof[]> {
  const artifacts = await loadProductionProofArtifacts(
    transaction,
    rows.map((run) => run.id),
  );
  return rows.map((run) => {
    const actions = artifacts.actions.filter((action) => action.runId === run.id);
    const contentRecords = artifacts.contentRecords.filter((record) => record.runId === run.id);
    const outboxEvents = artifacts.outboxEvents.filter((event) => event.aggregateId === run.id);
    const auditEvents = artifacts.auditEvents.filter((event) => event.entityId === run.id);
    const runtimeEvents = artifacts.runtimeEvents.filter((event) => event.runId === run.id);
    const actionById = new Map(actions.map((action) => [action.id, action]));
    const provenanceBackedContentCount = contentRecords.reduce((count, record) => {
      const action = actionById.get(record.actionId);
      return (
        count +
        Number(
          action?.actionStatus === "SUCCEEDED" &&
            action.provenance !== null &&
            objectValue(action.provenance)?.evidenceIds !== undefined,
        )
      );
    }, 0);
    return {
      id: run.id,
      agentProfileId: run.agentProfileId,
      personaVersionId: run.personaVersionId,
      runType: run.runType,
      runStatus: run.runStatus,
      trigger: run.trigger,
      scheduleSlotId: run.scheduleSlotId,
      scheduleSlotStatus: run.requestedScheduleSlot?.status ?? null,
      scheduleSlotRunId: run.requestedScheduleSlot?.runId ?? null,
      createdAt: run.createdAt,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      timeoutSeconds: run.timeoutSeconds,
      attempts: run.attempts,
      desiredEntryMin: run.desiredEntryMin,
      desiredEntryMax: run.desiredEntryMax,
      actionCount: actions.length,
      distinctActionSequenceCount: new Set(actions.map((action) => action.sequence)).size,
      proposedActionCount: actions.length,
      succeededActionCount: countBy(actions, (action) => action.actionStatus === "SUCCEEDED"),
      publicActionCount: countBy(
        actions,
        (action) => action.actionStatus === "SUCCEEDED" && isPublicRuntimeAction(action.actionType),
      ),
      provenanceBackedPublicActionCount: countBy(
        actions,
        (action) =>
          action.actionStatus === "SUCCEEDED" &&
          action.provenance !== null &&
          isPublicRuntimeAction(action.actionType),
      ),
      contentRecordCount: contentRecords.length,
      distinctContentEntryCount: new Set(contentRecords.map((record) => record.entryId)).size,
      distinctContentActionCount: new Set(contentRecords.map((record) => record.actionId)).size,
      provenanceBackedContentCount,
      auditEventCount: auditEvents.length,
      runtimeEventCount: runtimeEvents.length,
      supportingEvidenceTimestamps: [
        ...actions.flatMap((action) => [action.createdAt, action.updatedAt]),
        ...contentRecords.map((record) => record.createdAt),
        ...outboxEvents.map((event) => event.createdAt),
        ...auditEvents.map((event) => event.createdAt),
        ...runtimeEvents.flatMap((event) => [event.occurredAt, event.createdAt]),
      ],
      outbox: {
        queued: countBy(outboxEvents, (event) => event.eventType === "agent.run.queued"),
        started: countBy(outboxEvents, (event) => event.eventType === "agent.run.started"),
        completed: countBy(outboxEvents, (event) => event.eventType === "agent.run.completed"),
        failed: countBy(outboxEvents, (event) => event.eventType === "agent.run.failed"),
      },
    };
  });
}

export async function loadProductionGate9Proof(
  transaction: TransactionClient,
  input: {
    readOnlyRunId: string;
    dryRunId: string;
    normalWakeRunId: string;
    normalWakeEntryId: string;
    reportId: string;
    gracefulCancellationRunId: string;
    pendingCancellationRunId: string;
  },
) {
  const runIds = [
    input.readOnlyRunId,
    input.dryRunId,
    input.normalWakeRunId,
    input.gracefulCancellationRunId,
    input.pendingCancellationRunId,
  ];
  const [rows, entryRecord, report, moderationActions, takedownAudits] = await Promise.all([
    transaction.agentRun.findMany({
      where: { id: { in: runIds } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: productionRunSelect,
    }),
    transaction.agentContentRecord.findUnique({
      where: { entryId: input.normalWakeEntryId },
      select: {
        entryId: true,
        runId: true,
        createdAt: true,
        entry: { select: { createdAt: true } },
      },
    }),
    transaction.report.findUnique({
      where: { id: input.reportId },
      select: {
        id: true,
        targetType: true,
        targetId: true,
        createdAt: true,
        updatedAt: true,
        handledAt: true,
      },
    }),
    transaction.moderationAction.findMany({
      where: {
        targetType: "ENTRY",
        targetId: input.normalWakeEntryId,
        actionType: { in: ["ENTRY_HIDDEN", "ENTRY_RESTORED"] },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { actionType: true, createdAt: true },
    }),
    transaction.auditLog.findMany({
      where: {
        entityType: "Entry",
        entityId: input.normalWakeEntryId,
        action: { in: ["entry.hidden", "entry.restored"] },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { action: true, createdAt: true },
    }),
  ]);
  const proofById = new Map(
    (await hydrateProductionRunProofs(transaction, rows)).map((proof) => [proof.id, proof]),
  );
  return {
    readOnlyRun: proofById.get(input.readOnlyRunId) ?? null,
    dryRun: proofById.get(input.dryRunId) ?? null,
    normalWakeRun: proofById.get(input.normalWakeRunId) ?? null,
    gracefulCancellationRun: proofById.get(input.gracefulCancellationRunId) ?? null,
    pendingCancellationRun: proofById.get(input.pendingCancellationRunId) ?? null,
    takedownProof: {
      entryLinkedToNormalWake:
        entryRecord?.entryId === input.normalWakeEntryId &&
        entryRecord.runId === input.normalWakeRunId,
      reportTargetsEntry:
        report?.targetType === "ENTRY" && report.targetId === input.normalWakeEntryId,
      entryHiddenModerationActionCount: countBy(
        moderationActions,
        (action) => action.actionType === "ENTRY_HIDDEN",
      ),
      entryRestoredModerationActionCount: countBy(
        moderationActions,
        (action) => action.actionType === "ENTRY_RESTORED",
      ),
      entryHiddenAuditCount: countBy(takedownAudits, (audit) => audit.action === "entry.hidden"),
      entryRestoredAuditCount: countBy(
        takedownAudits,
        (audit) => audit.action === "entry.restored",
      ),
      evidenceTimestamps: [
        ...(entryRecord ? [entryRecord.createdAt, entryRecord.entry.createdAt] : []),
        ...(report
          ? [report.createdAt, report.updatedAt, ...(report.handledAt ? [report.handledAt] : [])]
          : []),
        ...moderationActions.map((action) => action.createdAt),
        ...takedownAudits.map((audit) => audit.createdAt),
      ],
    },
  } as const;
}

function criticalBreakerObserved(event: { eventType: string; metadata: unknown }): boolean {
  const metadata = objectValue(event.metadata);
  if (
    event.eventType === "runtime.global.paused" &&
    metadata?.reason === "DAY_ZERO_CRITICAL_BREAKER"
  )
    return true;
  return stringArray(metadata, "activeCodes").some((code) =>
    productionCriticalBreakerCodes.has(code),
  );
}

export async function loadProductionGate10Proof(
  transaction: TransactionClient,
  input: {
    attemptId: string;
    attemptLocalDate: string;
    cohortAgentIds: readonly string[];
    windowStartedAt: Date;
    windowFinishedAt: Date;
  },
) {
  const localDate = rolloutLocalDate(input.attemptLocalDate);
  const [rows, capacitySnapshot, breakerEvents, checkpointEvents] = await Promise.all([
    transaction.agentRun.findMany({
      where: {
        runType: "SCHEDULED_WAKE",
        trigger: "SCHEDULER_SLOT",
        scheduleSlotId: { not: null },
        createdAt: { gte: input.windowStartedAt, lte: input.windowFinishedAt },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: productionRunSelect,
    }),
    transaction.agentCapacitySnapshot.findFirst({
      where: {
        localDate,
        createdAt: { gte: input.windowStartedAt, lte: input.windowFinishedAt },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        localDate: true,
        createdAt: true,
        reserveFactor: true,
        capacityStatus: true,
        dailyPlans: {
          where: {
            agentProfileId: { in: [...input.cohortAgentIds] },
            status: { not: "CANCELLED" },
            agentProfile: { lifecycleStatus: "ACTIVE" },
          },
          orderBy: [{ agentProfileId: "asc" }, { id: "asc" }],
          select: { agentProfileId: true },
        },
      },
    }),
    transaction.agentRuntimeEvent.findMany({
      where: {
        eventType: { in: ["runtime.circuit_breaker.snapshot", "runtime.global.paused"] },
        occurredAt: { gte: input.windowStartedAt, lte: input.windowFinishedAt },
      },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      select: { eventType: true, metadata: true },
    }),
    findProductionRolloutGate10CheckpointEvents(transaction, {
      attemptId: input.attemptId,
      windowStartedAt: input.windowStartedAt,
      windowFinishedAt: input.windowFinishedAt,
    }),
  ]);
  const runs = await hydrateProductionRunProofs(transaction, rows);
  const snapshotProof: ProductionCapacityProof | null = capacitySnapshot
    ? {
        id: capacitySnapshot.id,
        localDate: capacitySnapshot.localDate.toISOString().slice(0, 10),
        createdAt: capacitySnapshot.createdAt,
        reserveFactor: capacitySnapshot.reserveFactor,
        capacityStatus: capacitySnapshot.capacityStatus,
        linkedActiveAgentIds: capacitySnapshot.dailyPlans.map((plan) => plan.agentProfileId),
      }
    : null;
  const checkpointMinutes = checkpointEvents.flatMap((event) => {
    const checkpointMinute = objectValue(event.metadata)?.checkpointMinute;
    return typeof checkpointMinute === "number" && Number.isInteger(checkpointMinute)
      ? [checkpointMinute]
      : [];
  });
  return {
    runs,
    capacitySnapshot: snapshotProof,
    criticalBreakerCount: breakerEvents.filter(criticalBreakerObserved).length,
    checkpointMinutes,
  } as const;
}

export async function loadProductionGate11Proof(
  transaction: TransactionClient,
  input: { escalationStartedAt: Date; windowFinishedAt: Date },
) {
  const rows = await transaction.agentRun.findMany({
    where: {
      runType: "SCHEDULED_WAKE",
      trigger: "SCHEDULER_SLOT",
      scheduleSlotId: { not: null },
      createdAt: { gte: input.escalationStartedAt, lte: input.windowFinishedAt },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 3,
    select: productionRunSelect,
  });
  return hydrateProductionRunProofs(transaction, rows);
}

export function listProductionActiveProfileIds(transaction: TransactionClient) {
  return transaction.agentProfile.findMany({
    where: { lifecycleStatus: "ACTIVE" },
    orderBy: { id: "asc" },
    select: { id: true },
  });
}

export async function loadProductionScheduledRunProof(
  transaction: TransactionClient,
  runId: string,
) {
  const row = await transaction.agentRun.findFirst({
    where: {
      id: runId,
      runType: "SCHEDULED_WAKE",
      trigger: "SCHEDULER_SLOT",
      scheduleSlotId: { not: null },
    },
    select: productionRunSelect,
  });
  if (!row) return null;
  return (await hydrateProductionRunProofs(transaction, [row]))[0] ?? null;
}

export async function countProductionCriticalBreakerEvents(
  transaction: TransactionClient,
  input: { startedAt: Date; finishedAt: Date },
) {
  const events = await transaction.agentRuntimeEvent.findMany({
    where: {
      eventType: { in: ["runtime.circuit_breaker.snapshot", "runtime.global.paused"] },
      occurredAt: { gte: input.startedAt, lte: input.finishedAt },
    },
    select: { eventType: true, metadata: true },
  });
  return events.filter(criticalBreakerObserved).length;
}
