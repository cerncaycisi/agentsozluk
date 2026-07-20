import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { constantTimeEqual } from "@/lib/security/crypto";
import { requireAgentAdminInTransaction } from "@/modules/agents/application/authorization";
import type { RuntimePrincipal } from "@/modules/agents/application/runtime-auth";
import { guardProductionRolloutRuntimeMutation } from "@/modules/agents/application/rollout-guard";
import { lockAgentSettings } from "@/modules/agents/repository/control-plane";
import {
  findRuntimeOwnedRun,
  lockRuntimeAgent,
  lockRuntimeRunForLeaseMutation,
} from "@/modules/agents/repository/runtime";
import {
  appendAgentLifeEventRecord,
  canonicalLifeEventJson,
  findAgentLifeBatchRecords,
  findAgentProfileForLifeLedger,
  findRuntimeActionLifeProposal,
  findRuntimeActionsForLifeIntents,
  listAgentLifeEventRecords,
} from "@/modules/agents/repository/life-ledger";
import type {
  AgentLifeQueryInput,
  RuntimeLifeEventBatchInput,
} from "@/modules/agents/validation/life-schemas";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { sha256 } from "@/lib/security/crypto";

type LifeEventRecord = Awaited<ReturnType<typeof appendAgentLifeEventRecord>>;

function invalidRuntimeLease(): AppError {
  return new AppError(
    "AGENT_RUN_LEASE_INVALID",
    409,
    "Life event batch yalnız geçerli run lease sahibi tarafından kaydedilebilir.",
  );
}

function assertLifeEventLease(
  run: Awaited<ReturnType<typeof findRuntimeOwnedRun>>,
  workerId: string,
  leaseToken: string,
  now: Date,
): asserts run is NonNullable<typeof run> {
  if (
    !run ||
    run.runStatus !== "RUNNING" ||
    run.leaseOwner !== workerId ||
    !run.leaseToken ||
    !constantTimeEqual(run.leaseToken, leaseToken) ||
    !run.leaseExpiresAt ||
    run.leaseExpiresAt < now ||
    !run.startedAt ||
    now.getTime() >= run.startedAt.getTime() + run.timeoutSeconds * 1000
  )
    throw invalidRuntimeLease();
}

function lifeBatchId(
  agentProfileId: string,
  runId: string,
  input: RuntimeLifeEventBatchInput,
): string {
  return sha256(
    canonicalLifeEventJson({
      agentProfileId,
      runId,
      workerId: input.workerId,
      payload: input.payload,
    }),
  );
}

export function serializeAgentLifeEvent(record: LifeEventRecord) {
  return {
    id: record.id.toString(),
    agentProfileId: record.agentProfileId,
    runId: record.runId,
    actionId: record.actionId,
    decisionSeq: record.decisionSequence,
    eventType: record.eventType,
    subject: record.subject,
    summary: record.safeMessage,
    confidence: record.confidence,
    evidenceIds: record.evidenceIds,
    causedBy: record.causedByEventIds.map((id) => id.toString()),
    before: record.beforeState,
    after: record.afterState,
    changedFields: record.changedFields,
    metadata: record.metadata,
    occurredAt: record.occurredAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    schemaVersion: record.schemaVersion,
    agentSequence: record.agentSequence?.toString() ?? null,
    batchId: record.batchId,
    batchSequence: record.batchSequence,
    contentHash: record.contentHash,
    previousEventHash: record.previousEventHash,
    eventHash: record.eventHash,
  };
}

export function recordRuntimeLifeEventBatch(
  client: DatabaseExecutor,
  principal: RuntimePrincipal,
  runId: string,
  input: RuntimeLifeEventBatchInput,
  now = new Date(),
) {
  return inTransaction(client, async (transaction) => {
    await lockRuntimeAgent(transaction, principal.agentProfileId);
    await lockRuntimeRunForLeaseMutation(transaction, runId);
    const run = await findRuntimeOwnedRun(transaction, principal.agentProfileId, runId);
    assertLifeEventLease(run, input.workerId, input.leaseToken, now);
    await lockAgentSettings(transaction);
    const rolloutBlock = await guardProductionRolloutRuntimeMutation(
      transaction,
      principal.actor,
      now,
    );
    if (rolloutBlock) return rolloutBlock as never;
    const batchId = lifeBatchId(principal.agentProfileId, runId, input);
    const replay = await findAgentLifeBatchRecords(transaction, batchId);
    if (replay.length > 0)
      return {
        batchId,
        inserted: 0,
        replayed: true,
        events: replay.map(serializeAgentLifeEvent),
      };

    const actionSequences = input.payload.actionIntents.map(({ sequence }) => sequence);
    const actions = await findRuntimeActionsForLifeIntents(transaction, {
      agentProfileId: principal.agentProfileId,
      runId,
      sequences: actionSequences,
    });
    const actionsBySequence = new Map(actions.map((action) => [action.sequence, action]));
    if (actions.length !== actionSequences.length)
      throw new AppError(
        "AGENT_ACTION_NOT_FOUND",
        409,
        "Life event action intent'leri önce immutable action proposal olarak kaydedilmelidir.",
      );
    for (const intent of input.payload.actionIntents) {
      const action = actionsBySequence.get(intent.sequence)!;
      if (action.actionStatus !== "PROPOSED")
        throw new AppError(
          "AGENT_ACTION_STATE_INVALID",
          409,
          "Life event action intent'i yalnız henüz çalıştırılmamış PROPOSED action için kaydedilebilir.",
        );
      if (
        await findRuntimeActionLifeProposal(transaction, {
          agentProfileId: principal.agentProfileId,
          runId,
          actionId: action.id,
        })
      )
        throw new AppError(
          "AGENT_ACTION_LIFE_PROPOSAL_EXISTS",
          409,
          "Action için immutable life proposal daha önce kaydedildi.",
        );
      if (action.actionType !== "NO_ACTION" && intent.selectedOptionSeq === null)
        throw new AppError(
          "AGENT_DECISION_LINK_REQUIRED",
          409,
          "Çalıştırılabilir action intent bir OPTION_SELECTED decision adımına bağlanmalıdır.",
        );
    }

    const inserted: LifeEventRecord[] = [];
    const decisionEventIds = new Map<number, bigint>();
    let batchSequence = 0;
    const append = async (
      event: Omit<
        Parameters<typeof appendAgentLifeEventRecord>[1],
        "agentProfileId" | "runId" | "batchId" | "batchSequence" | "occurredAt"
      >,
    ) => {
      const record = await appendAgentLifeEventRecord(transaction, {
        ...event,
        agentProfileId: principal.agentProfileId,
        runId,
        batchId,
        batchSequence: (batchSequence += 1),
        occurredAt: now,
      });
      inserted.push(record);
      return record;
    };

    for (const observation of input.payload.observations)
      await append({
        eventType: "OBSERVATION_RECORDED",
        subject: { type: observation.subjectType, id: observation.subjectId },
        summary: observation.summary,
        confidence: observation.salience,
        evidenceIds: observation.provenance.evidenceIds,
        after: {
          salience: observation.salience,
          provenance: observation.provenance.evidenceType,
        },
        metadata: {
          origin: "RUNTIME_DECISION",
          shortRationale: observation.provenance.shortRationale,
        },
      });

    for (const candidate of input.payload.memoryCandidates)
      await append({
        eventType: "MEMORY_CANDIDATE_PROPOSED",
        subject: { type: candidate.subjectType, id: candidate.subjectId },
        summary: candidate.summary,
        confidence: candidate.salience,
        evidenceIds: candidate.provenance.evidenceIds,
        after: {
          status: "PROPOSED",
          salience: candidate.salience,
          provenance: candidate.provenance.evidenceType,
        },
        metadata: {
          origin: "RUNTIME_DECISION",
          shortRationale: candidate.provenance.shortRationale,
        },
      });

    for (const step of [...input.payload.decisionJournal].sort((a, b) => a.seq - b.seq)) {
      const record = await append({
        eventType: "DECISION_STEP_RECORDED",
        decisionSequence: step.seq,
        subject: { kind: step.kind, label: step.subject },
        summary: step.summary,
        confidence: step.confidence,
        evidenceIds: step.evidenceIds,
        causedByEventIds: step.causedBySeqs.map((seq) => decisionEventIds.get(seq)!),
        metadata: { origin: "RUNTIME_DECISION_JOURNAL" },
      });
      decisionEventIds.set(step.seq, record.id);
    }

    for (const intent of [...input.payload.actionIntents].sort(
      (left, right) => left.sequence - right.sequence,
    )) {
      const action = actionsBySequence.get(intent.sequence)!;
      const selectedEventId =
        intent.selectedOptionSeq === null
          ? undefined
          : decisionEventIds.get(intent.selectedOptionSeq);
      await append({
        actionId: action.id,
        eventType: "ACTION_PROPOSED",
        subject: {
          type: "ACTION",
          id: action.id,
          actionType: action.actionType,
          sequence: action.sequence,
        },
        summary: intent.expectedOutcome,
        confidence: intent.desire,
        causedByEventIds: selectedEventId ? [selectedEventId] : [],
        after: {
          status: action.actionStatus,
          desire: intent.desire,
          expectedOutcome: intent.expectedOutcome,
          targetType: action.targetType,
          targetId: action.targetId,
        },
        metadata: {
          origin: "RUNTIME_ACTION_INTENT",
          selectedOptionSeq: intent.selectedOptionSeq,
        },
      });
    }

    return {
      batchId,
      inserted: inserted.length,
      replayed: false,
      events: inserted.map(serializeAgentLifeEvent),
    };
  });
}

export function listAgentLifeEvents(
  client: DatabaseExecutor,
  actor: ActorContext,
  agentProfileId: string,
  input: AgentLifeQueryInput,
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    if (!(await findAgentProfileForLifeLedger(transaction, agentProfileId)))
      throw new AppError("AGENT_NOT_FOUND", 404, "Agent bulunamadı.");
    const records = await listAgentLifeEventRecords(transaction, {
      agentProfileId,
      limit: input.limit,
      ...(input.cursor ? { cursor: BigInt(input.cursor) } : {}),
      ...(input.eventType ? { eventType: input.eventType } : {}),
      ...(input.runId ? { runId: input.runId } : {}),
      ...(input.from ? { from: new Date(input.from) } : {}),
      ...(input.to ? { to: new Date(input.to) } : {}),
    });
    const hasMore = records.length > input.limit;
    const page = hasMore ? records.slice(0, input.limit) : records;
    return {
      items: page.map(serializeAgentLifeEvent),
      nextCursor: hasMore ? page.at(-1)!.id.toString() : null,
    };
  });
}
