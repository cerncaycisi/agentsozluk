import type { Prisma } from "@prisma/client";

export function createManualRunRecord(
  transaction: Prisma.TransactionClient,
  input: {
    agentProfileId: string;
    personaVersionId: string;
    requestedById: string;
    requestId: string;
    runType:
      | "NORMAL_WAKE"
      | "ENTRY_BURST"
      | "DAILY_CATCH_UP"
      | "READ_ONLY"
      | "DRY_RUN"
      | "REFLECTION"
      | "SOURCE_REFRESH";
    queuePriority: "MANUAL_SINGLE" | "EMERGENCY_ADMIN";
    availableAt: Date;
    timeoutSeconds: number;
    desiredEntryMin: number;
    desiredEntryMax: number;
    allowTopicCreation: boolean;
    allowVoting: boolean;
    allowFollowing: boolean;
    allowSourceReading: boolean;
    saturationOverride: boolean;
    dailyMaximumOverride: boolean;
    adminInstruction?: string;
  },
) {
  return transaction.agentRun.create({
    data: {
      agentProfileId: input.agentProfileId,
      runType: input.runType,
      queuePriority: input.queuePriority,
      trigger: "ADMIN_MANUAL",
      requestedById: input.requestedById,
      personaVersionId: input.personaVersionId,
      idempotencyKey: `manual:${input.requestId}`,
      availableAt: input.availableAt,
      timeoutSeconds: input.timeoutSeconds,
      desiredEntryMin: input.desiredEntryMin,
      desiredEntryMax: input.desiredEntryMax,
      allowTopicCreation: input.allowTopicCreation,
      allowVoting: input.allowVoting,
      allowFollowing: input.allowFollowing,
      allowSourceReading: input.allowSourceReading,
      saturationOverride: input.saturationOverride,
      dailyMaximumOverride: input.dailyMaximumOverride,
      ...(input.adminInstruction ? { adminInstruction: input.adminInstruction } : {}),
    },
  });
}

export function listAgentRunsRecord(transaction: Prisma.TransactionClient, agentProfileId: string) {
  return transaction.agentRun.findMany({
    where: { agentProfileId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      runType: true,
      runStatus: true,
      queuePriority: true,
      availableAt: true,
      startedAt: true,
      finishedAt: true,
      desiredEntryMin: true,
      desiredEntryMax: true,
      errorCode: true,
      errorSummary: true,
      createdAt: true,
    },
  });
}
