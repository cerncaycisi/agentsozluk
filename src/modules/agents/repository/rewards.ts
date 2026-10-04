import { authorFeedbackLimit, authorFeedbackScanLimit } from "@/modules/agents/domain/rewards";
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
    select: {
      id: true,
      authorId: true,
      body: true,
      topicId: true,
      topic: { select: { title: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
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

export const findQualityAssessmentEntry = (
  tx: TransactionClient,
  agentProfileId: string,
  entryId: string,
) =>
  tx.agentContentRecord.findFirst({
    where: {
      agentProfileId,
      entryId,
      entry: { status: "ACTIVE", topic: { status: "ACTIVE" }, ...publiclyVisibleEntryWhere },
      action: {
        actionStatus: "SUCCEEDED",
        actionType: { in: ["CREATE_ENTRY", "CREATE_TOPIC_WITH_ENTRY"] },
      },
      run: {
        runType: "NORMAL_WAKE",
        runStatus: { in: ["SUCCEEDED", "PARTIAL", "FAILED", "TIMED_OUT", "CANCELLED"] },
      },
    },
    select: {
      agentProfile: { select: { userId: true } },
      action: { select: { id: true, createdAt: true } },
      entry: {
        select: {
          id: true,
          authorId: true,
          body: true,
          createdAt: true,
          updatedAt: true,
          topicId: true,
          topic: { select: { title: true } },
        },
      },
    },
  });
export const findQualityPriorEntries = (
  tx: TransactionClient,
  entryId: string,
  topicId: string,
  before: Date,
) =>
  tx.entry.findMany({
    where: {
      id: { not: entryId },
      topicId,
      createdAt: { lte: before },
      status: "ACTIVE",
      ...publiclyVisibleEntryWhere,
    },
    select: {
      id: true,
      body: true,
      createdAt: true,
      topicId: true,
      topic: { select: { title: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 5,
  });

export const findAuthorFeedbackAssessments = (
  tx: TransactionClient,
  agentProfileId: string,
  now: Date,
  ids?: readonly string[],
) =>
  tx.agentRewardAssessment.findMany({
    where: {
      agentProfileId,
      mode: "FULFILL_SLOT",
      createdAt: { lte: now },
      sourceAt: { lte: now },
      expiresAt: { gt: now },
      ...(ids ? { id: { in: [...ids] } } : {}),
    },
    include: {
      reversal: true,
      purpose: { select: { id: true, question: true, targetType: true, targetId: true } },
      entry: { select: { id: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: ids ? Math.min(ids.length, authorFeedbackLimit) : authorFeedbackScanLimit,
  });
export const hasPresentedAssessment = (
  tx: TransactionClient,
  agentProfileId: string,
  assessmentId: string,
  since: Date,
) =>
  tx.agentRuntimeEvent.findFirst({
    where: {
      agentProfileId,
      eventType: "CONTEXT_PRESENTED",
      occurredAt: { gte: since },
      metadata: { path: ["feedbackAssessmentIds"], array_contains: [assessmentId] },
    },
    select: { id: true },
  });
