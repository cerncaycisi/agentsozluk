import type { Prisma } from "@prisma/client";
import type { TransactionClient } from "@/lib/db/types";
import { publiclyVisibleEntryWhere } from "@/modules/entries/repository/public-visibility";

export const findAssessmentPurpose = (tx: TransactionClient, agentProfileId: string, id: string) =>
  tx.agentPurpose.findFirst({
    where: { id, agentProfileId },
    include: { agentProfile: { select: { userId: true } } },
  });
export const findAssessmentPacket = (tx: TransactionClient, id: string) =>
  tx.agentAssessmentPacket.findUnique({ where: { id } });
export const createAssessmentPacket = (
  tx: TransactionClient,
  data: Prisma.AgentAssessmentPacketUncheckedCreateInput,
) => tx.agentAssessmentPacket.create({ data });
export const consumeAssessmentPacket = (tx: TransactionClient, id: string, now: Date) =>
  tx.agentAssessmentPacket.updateMany({
    where: { id, consumedAt: null, expiresAt: { gt: now } },
    data: { consumedAt: now },
  });
export const createRewardAssessment = (
  tx: TransactionClient,
  data: Prisma.AgentRewardAssessmentUncheckedCreateInput,
) => tx.agentRewardAssessment.create({ data });
export const findRewardAssessment = (tx: TransactionClient, id: string) =>
  tx.agentRewardAssessment.findUnique({
    where: { id },
    include: { reversal: true, purpose: true },
  });
export const createRewardReversal = (
  tx: TransactionClient,
  data: Prisma.AgentRewardReversalUncheckedCreateInput,
) => tx.agentRewardReversal.create({ data });
export const revokeFulfilledPurpose = (tx: TransactionClient, id: string, now: Date) =>
  tx.agentPurpose.updateMany({
    where: { id, status: "FULFILLED" },
    data: { status: "REVIEW_REVOKED", version: { increment: 1 }, updatedAt: now },
  });
export const getRewardConfiguration = async (tx: TransactionClient) =>
  (await tx.agentGlobalSettings.findUnique({
    where: { id: "global" },
    select: { rewardMode: true, settingsVersion: true },
  })) ?? { rewardMode: "OFF" as const, settingsVersion: 0 };
export const getRewardMode = async (tx: TransactionClient) =>
  (await getRewardConfiguration(tx)).rewardMode;
export const setRewardMode = (
  tx: TransactionClient,
  mode: "OFF" | "SHADOW" | "FULFILL_SLOT",
  actorId: string,
) =>
  tx.agentGlobalSettings.update({
    where: { id: "global" },
    data: { rewardMode: mode, settingsVersion: { increment: 1 }, updatedById: actorId },
  });
export const countRecentRewardCredits = (
  tx: TransactionClient,
  agentProfileId: string,
  since: Date,
) =>
  tx.agentRewardAssessment.count({
    where: { agentProfileId, applied: true, createdAt: { gt: since } },
  });
export const findConsumedRewardCredit = (
  tx: TransactionClient,
  agentProfileId: string,
  key: string,
  hash: string,
) =>
  tx.agentRewardAssessment.findFirst({
    where: { agentProfileId, OR: [{ creditedSourceKey: key }, { creditedContentHash: hash }] },
    select: { id: true },
  });
export const findAssessmentRun = (tx: TransactionClient, agentProfileId: string, id: string) =>
  tx.agentRun.findFirst({
    where: {
      id,
      agentProfileId,
      runType: "NORMAL_WAKE",
      runStatus: { in: ["SUCCEEDED", "PARTIAL"] },
    },
    select: { perceptionSummary: true },
  });
export const findAssessmentJournal = (
  tx: TransactionClient,
  agentProfileId: string,
  runId: string,
  id: bigint,
  topicId: string,
) =>
  tx.agentRuntimeEvent.findFirst({
    where: {
      id,
      agentProfileId,
      runId,
      eventType: "DECISION_STEP_RECORDED",
      evidenceIds: { has: topicId },
      subject: { path: ["kind"], equals: "INTERPRETATION" },
    },
    select: { id: true, safeMessage: true, occurredAt: true },
  });
export const findAssessmentBelief = (
  tx: TransactionClient,
  agentProfileId: string,
  id: string,
  version: number,
) => tx.agentBelief.findFirst({ where: { id, agentProfileId, version } });
export const findAssessmentBaseline = (
  tx: TransactionClient,
  agentProfileId: string,
  topicKey: string,
  version: number,
) =>
  // @@unique([agentProfileId, topicKey, version]) başlangıç sürümünü tekilleştirir.
  tx.agentBelief.findUnique({
    where: { agentProfileId_topicKey_version: { agentProfileId, topicKey, version } },
    select: { statement: true, evidenceSummary: true },
  });
export const findBeliefOriginAction = (
  tx: TransactionClient,
  agentProfileId: string,
  beliefId: string,
) =>
  tx.agentAction.findFirst({
    where: {
      agentProfileId,
      actionType: "UPDATE_BELIEF",
      actionStatus: "SUCCEEDED",
      result: { path: ["beliefId"], equals: beliefId },
      run: { runType: "NORMAL_WAKE", runStatus: { in: ["SUCCEEDED", "PARTIAL"] } },
    },
    // Normal yürütmede bir belief sürümünü tek action üretir; tarihsel çoğullukta en eski köken.
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, createdAt: true },
  });
export const findAssessmentEntries = (tx: TransactionClient, ids: string[]) =>
  tx.entry.findMany({
    where: {
      id: { in: ids },
      status: "ACTIVE",
      topic: { status: "ACTIVE" },
      ...publiclyVisibleEntryWhere,
    },
    select: { id: true, authorId: true, body: true, topicId: true },
    orderBy: { id: "asc" },
  });
export const findAssessmentSourceItems = (
  tx: TransactionClient,
  agentProfileId: string,
  ids: string[],
  now: Date,
) =>
  tx.agentSourceItem.findMany({
    where: {
      id: { in: ids },
      source: { agentProfileId, adminBlocked: false, status: { in: ["TRUSTED", "PROBATION"] } },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { id: true, title: true, safeText: true, canonicalUrl: true },
    orderBy: { id: "asc" },
  });
