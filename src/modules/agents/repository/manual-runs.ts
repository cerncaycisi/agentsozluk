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
    queuePriority: "MANUAL_SINGLE" | "EMERGENCY_ADMIN" | "SCHEDULED_CONTENT";
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
    idempotencySuffix?: string;
    trigger?: string;
    parentRunId?: string;
  },
) {
  return transaction.agentRun.create({
    data: {
      agentProfileId: input.agentProfileId,
      runType: input.runType,
      queuePriority: input.queuePriority,
      trigger: input.trigger ?? "ADMIN_MANUAL",
      requestedById: input.requestedById,
      personaVersionId: input.personaVersionId,
      idempotencyKey: `manual:${input.requestId}${input.idempotencySuffix ? `:${input.idempotencySuffix}` : ""}`,
      parentRunId: input.parentRunId ?? null,
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

export function listBulkRunAgents(transaction: Prisma.TransactionClient, agentIds?: string[]) {
  return transaction.agentProfile.findMany({
    where: {
      lifecycleStatus: "ACTIVE",
      currentPersonaVersionId: { not: null },
      ...(agentIds ? { id: { in: agentIds } } : {}),
    },
    select: {
      id: true,
      currentPersonaVersionId: true,
      manualTimeoutSeconds: true,
    },
    orderBy: { id: "asc" },
  });
}

export async function getBulkRunPreviewMetrics(transaction: Prisma.TransactionClient) {
  const [queueLength, running, capability, settings, oldestQueued] = await Promise.all([
    transaction.agentRun.count({ where: { runStatus: "QUEUED" } }),
    transaction.agentRun.count({ where: { runStatus: { in: ["RUNNING", "CANCEL_REQUESTED"] } } }),
    transaction.agentRuntimeCapability.findFirst({ orderBy: { measuredAt: "desc" } }),
    transaction.agentGlobalSettings.findUniqueOrThrow({ where: { id: "global" } }),
    transaction.agentRun.findFirst({
      where: { runStatus: "QUEUED" },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
  ]);
  return { queueLength, running, capability, settings, oldestQueued };
}

export async function lockAgentRun(transaction: Prisma.TransactionClient, runId: string) {
  const key = `agent-run:${runId}`;
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

export function findAgentRunForCommand(transaction: Prisma.TransactionClient, runId: string) {
  return transaction.agentRun.findUnique({ where: { id: runId } });
}

export async function cancelAgentRunRecord(
  transaction: Prisma.TransactionClient,
  runId: string,
  running: boolean,
  now: Date,
) {
  const run = await transaction.agentRun.update({
    where: { id: runId },
    data: running
      ? { runStatus: "CANCEL_REQUESTED", cancelRequestedAt: now }
      : {
          runStatus: "CANCELLED",
          cancelRequestedAt: now,
          finishedAt: now,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
  });
  if (!running && run.scheduleSlotId) {
    await transaction.agentScheduleSlot.updateMany({
      where: { id: run.scheduleSlotId, status: { in: ["PLANNED", "QUEUED"] } },
      data: { status: "CANCELLED" },
    });
  }
  return run;
}

export function createRetryRunRecord(
  transaction: Prisma.TransactionClient,
  input: {
    run: NonNullable<Awaited<ReturnType<typeof findAgentRunForCommand>>>;
    requestedById: string;
    requestId: string;
  },
) {
  return transaction.agentRun.create({
    data: {
      agentProfileId: input.run.agentProfileId,
      runType: input.run.runType,
      queuePriority: "MANUAL_SINGLE",
      trigger: "ADMIN_RETRY",
      requestedById: input.requestedById,
      parentRunId: input.run.id,
      personaVersionId: input.run.personaVersionId,
      idempotencyKey: `retry:${input.run.id}:${input.requestId}`,
      availableAt: new Date(),
      timeoutSeconds: input.run.timeoutSeconds,
      desiredEntryMin: input.run.desiredEntryMin,
      desiredEntryMax: input.run.desiredEntryMax,
      allowTopicCreation: input.run.allowTopicCreation,
      allowVoting: input.run.allowVoting,
      allowFollowing: input.run.allowFollowing,
      allowSourceReading: input.run.allowSourceReading,
      saturationOverride: input.run.saturationOverride,
      dailyMaximumOverride: input.run.dailyMaximumOverride,
      adminInstruction: input.run.adminInstruction,
    },
  });
}

export function getAgentRunDetailRecord(transaction: Prisma.TransactionClient, runId: string) {
  return transaction.agentRun.findUnique({
    where: { id: runId },
    include: {
      events: { orderBy: { sequence: "asc" } },
      actions: { orderBy: { sequence: "asc" } },
      contentRecords: { select: { entryId: true, createdAt: true } },
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
