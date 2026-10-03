import { AppError } from "@/lib/http/errors";
import { activePurposeLimit } from "@/modules/agents/domain/purpose";
import { Prisma } from "@prisma/client";
import type { TransactionClient } from "@/lib/db/types";
import { publiclyVisibleEntryWhere } from "@/modules/entries/repository/public-visibility";

export type PurposeRecord = Awaited<ReturnType<typeof listActivePurposeRecords>>[number];

export function listActivePurposeRecords(transaction: TransactionClient, agentProfileId: string) {
  return transaction.agentPurpose.findMany({
    where: { agentProfileId, status: "ACTIVE" },
    orderBy: { activeSlot: "asc" },
    take: activePurposeLimit,
  });
}

export function findPurposeTopicRecords(transaction: TransactionClient, ids: readonly string[]) {
  if (ids.length === 0) return Promise.resolve([]);
  return transaction.topic.findMany({
    where: {
      id: { in: [...ids] },
      status: "ACTIVE",
      entries: { some: { status: "ACTIVE", ...publiclyVisibleEntryWhere } },
    },
    select: { id: true, title: true },
    take: activePurposeLimit,
  });
}

export function findPurposeBeliefRecord(
  transaction: TransactionClient,
  agentProfileId: string,
  id: string,
) {
  return transaction.agentBelief.findFirst({ where: { id, agentProfileId } });
}

export function latestPurposeBeliefRecord(
  transaction: TransactionClient,
  agentProfileId: string,
  topicKey: string,
) {
  return transaction.agentBelief.findFirst({
    where: { agentProfileId, topicKey },
    orderBy: { version: "desc" },
  });
}

export function createPurposeRecord(transaction: TransactionClient, record: PurposeRecord) {
  return transaction.agentPurpose.create({
    data: {
      ...record,
      baseline: record.baseline === null ? Prisma.JsonNull : record.baseline,
      claimEvidence: record.claimEvidence === null ? Prisma.DbNull : record.claimEvidence,
    },
  });
}

export async function updatePurposeRecord(
  transaction: TransactionClient,
  record: PurposeRecord,
  data: Prisma.AgentPurposeUncheckedUpdateManyInput,
) {
  const changed = await transaction.agentPurpose.updateMany({
    where: {
      id: record.id,
      agentProfileId: record.agentProfileId,
      version: record.version,
      status: "ACTIVE",
    },
    data: { ...data, version: { increment: 1 } },
  });
  if (changed.count !== 1)
    throw new AppError("AGENT_PURPOSE_VERSION_CONFLICT", 409, "Amaç sürümü eşzamanlı değişti.");
  return transaction.agentPurpose.findUniqueOrThrow({ where: { id: record.id } });
}

export function hasPurposeTopicReviewRecord(
  transaction: TransactionClient,
  agentProfileId: string,
  runId: string,
  topicId: string,
) {
  return transaction.agentRuntimeEvent.findFirst({
    where: {
      agentProfileId,
      runId,
      eventType: "DECISION_STEP_RECORDED",
      evidenceIds: { has: topicId },
      subject: { path: ["kind"], equals: "INTERPRETATION" },
    },
    select: { id: true },
  });
}
