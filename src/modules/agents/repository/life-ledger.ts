import type { Prisma } from "@prisma/client";
import type { TransactionClient } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { assertSafeLifeLedgerValue } from "@/modules/agents/domain/life-ledger-safety";

function canonicalValue(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalValue(nested)]),
  );
}

export function canonicalLifeEventJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function topLevelChangedFields(before: unknown, after: unknown): string[] {
  if (
    !before ||
    !after ||
    typeof before !== "object" ||
    typeof after !== "object" ||
    Array.isArray(before) ||
    Array.isArray(after)
  )
    return [];
  const left = before as Record<string, unknown>;
  const right = after as Record<string, unknown>;
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter((key) => canonicalLifeEventJson(left[key]) !== canonicalLifeEventJson(right[key]))
    .sort();
}

export interface AppendAgentLifeEventInput {
  agentProfileId: string;
  runId?: string;
  actionId?: string;
  batchId?: string;
  batchSequence?: number;
  decisionSequence?: number;
  schemaVersion?: number;
  eventType: string;
  subject?: Prisma.InputJsonValue;
  summary: string;
  confidence?: number;
  evidenceIds?: string[];
  causedByEventIds?: bigint[];
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
  occurredAt?: Date;
  createdAt?: Date;
}

export async function lockAgentLifeLedger(
  transaction: TransactionClient,
  agentProfileId: string,
): Promise<void> {
  const key = `agent-life:${agentProfileId}`;
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

export async function appendAgentLifeEventRecord(
  transaction: TransactionClient,
  input: AppendAgentLifeEventInput,
) {
  assertSafeLifeLedgerValue({
    subject: input.subject,
    summary: input.summary,
    before: input.before,
    after: input.after,
    metadata: input.metadata,
  });
  await lockAgentLifeLedger(transaction, input.agentProfileId);
  const occurredAt = input.occurredAt ?? new Date();
  const schemaVersion = input.schemaVersion ?? 1;
  const evidenceIds = [...new Set(input.evidenceIds ?? [])];
  const causedByEventIds = [...new Set(input.causedByEventIds ?? [])];
  if (causedByEventIds.length > 0) {
    const causes = await transaction.agentRuntimeEvent.findMany({
      where: {
        id: { in: causedByEventIds },
        agentProfileId: input.agentProfileId,
        agentSequence: { not: null },
      },
      select: { id: true },
    });
    if (causes.length !== causedByEventIds.length)
      throw new AppError(
        "VALIDATION_ERROR",
        422,
        "Life event nedenleri aynı agente ait, daha önce kaydedilmiş eventleri göstermelidir.",
      );
  }
  const changedFields = topLevelChangedFields(input.before, input.after);
  const metadata = input.metadata ?? {};
  return transaction.agentRuntimeEvent.create({
    data: {
      agentProfileId: input.agentProfileId,
      ...(input.runId ? { runId: input.runId } : {}),
      ...(input.actionId ? { actionId: input.actionId } : {}),
      ...(input.batchId ? { batchId: input.batchId } : {}),
      ...(input.batchSequence ? { batchSequence: input.batchSequence } : {}),
      ...(input.decisionSequence ? { decisionSequence: input.decisionSequence } : {}),
      schemaVersion,
      eventType: input.eventType,
      ...(input.subject !== undefined ? { subject: input.subject } : {}),
      safeMessage: input.summary,
      ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
      evidenceIds,
      causedByEventIds,
      ...(input.before !== undefined ? { beforeState: input.before } : {}),
      ...(input.after !== undefined ? { afterState: input.after } : {}),
      changedFields,
      metadata,
      occurredAt,
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    },
  });
}

export function findAgentLifeBatchRecords(transaction: TransactionClient, batchId: string) {
  return transaction.agentRuntimeEvent.findMany({
    where: { batchId },
    orderBy: { batchSequence: "asc" },
  });
}

export function findRuntimeActionsForLifeIntents(
  transaction: TransactionClient,
  input: { agentProfileId: string; runId: string; sequences: number[] },
) {
  return transaction.agentAction.findMany({
    where: {
      agentProfileId: input.agentProfileId,
      runId: input.runId,
      sequence: { in: input.sequences },
    },
    select: {
      id: true,
      sequence: true,
      actionType: true,
      actionStatus: true,
      targetType: true,
      targetId: true,
    },
  });
}

export function findRuntimeActionLifeProposal(
  transaction: TransactionClient,
  input: { agentProfileId: string; runId: string; actionId: string },
) {
  return transaction.agentRuntimeEvent.findFirst({
    where: {
      agentProfileId: input.agentProfileId,
      runId: input.runId,
      actionId: input.actionId,
      eventType: "ACTION_PROPOSED",
      agentSequence: { not: null },
      batchId: { not: null },
    },
    select: { id: true, batchId: true, causedByEventIds: true },
  });
}

export function findRuntimeSourceAttemptLifeEvent(
  transaction: TransactionClient,
  input: { agentProfileId: string; runId: string; sourceId: string; attemptId: string },
) {
  return transaction.agentRuntimeEvent.findFirst({
    where: {
      agentProfileId: input.agentProfileId,
      runId: input.runId,
      eventType: "SOURCE_FETCH_ATTEMPT",
      subject: { path: ["id"], equals: input.sourceId },
      metadata: { path: ["attemptId"], equals: input.attemptId },
    },
    select: { id: true },
  });
}

export function findAgentProfileForLifeLedger(
  transaction: TransactionClient,
  agentProfileId: string,
) {
  return transaction.agentProfile.findUnique({
    where: { id: agentProfileId },
    select: { id: true },
  });
}

export async function listAgentLifeEventRecords(
  transaction: TransactionClient,
  input: {
    agentProfileId: string;
    cursor?: bigint;
    limit: number;
    eventType?: string;
    runId?: string;
    from?: Date;
    to?: Date;
  },
) {
  return transaction.agentRuntimeEvent.findMany({
    where: {
      agentProfileId: input.agentProfileId,
      agentSequence: { not: null },
      ...(input.cursor ? { id: { lt: input.cursor } } : {}),
      ...(input.eventType ? { eventType: input.eventType } : {}),
      ...(input.runId ? { runId: input.runId } : {}),
      ...(input.from || input.to
        ? {
            occurredAt: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.to ? { lte: input.to } : {}),
            },
          }
        : {}),
    },
    orderBy: { id: "desc" },
    take: input.limit + 1,
  });
}
