import type { Prisma } from "@prisma/client";

const adminMemorySelect = {
  id: true,
  eventType: true,
  subjectType: true,
  subjectId: true,
  summary: true,
  salience: true,
  provenance: true,
  evidence: true,
  runId: true,
  invalidatedAt: true,
  occurredAt: true,
  createdAt: true,
} satisfies Prisma.AgentMemoryEpisodeSelect;

export function getMemoryLifecycleAgentRecord(
  transaction: Prisma.TransactionClient,
  agentProfileId: string,
) {
  return transaction.agentProfile.findUnique({
    where: { id: agentProfileId },
    select: {
      id: true,
      lifecycleStatus: true,
      currentPersonaVersionId: true,
      user: { select: { username: true, displayName: true } },
    },
  });
}

export function listAgentMemoryRecords(
  transaction: Prisma.TransactionClient,
  input: { agentProfileId: string; skip: number; take: number },
) {
  const where = {
    agentProfileId: input.agentProfileId,
  } satisfies Prisma.AgentMemoryEpisodeWhereInput;
  return Promise.all([
    transaction.agentMemoryEpisode.findMany({
      where,
      select: adminMemorySelect,
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      skip: input.skip,
      take: input.take,
    }),
    transaction.agentMemoryEpisode.count({ where }),
  ]);
}

export async function lockAgentMemoryRecords(
  transaction: Prisma.TransactionClient,
  agentProfileId: string,
): Promise<void> {
  await transaction.$queryRaw`
    SELECT "id"
    FROM "agent_memory_episodes"
    WHERE "agentProfileId" = ${agentProfileId}::uuid
    FOR UPDATE
  `;
}

export function findOwnedAgentMemoryRecord(
  transaction: Prisma.TransactionClient,
  agentProfileId: string,
  memoryId: string,
) {
  return transaction.agentMemoryEpisode.findFirst({
    where: { id: memoryId, agentProfileId },
    select: adminMemorySelect,
  });
}

export function listOwnedAgentMemoryLineage(
  transaction: Prisma.TransactionClient,
  agentProfileId: string,
) {
  return transaction.agentMemoryEpisode.findMany({
    where: { agentProfileId },
    select: { id: true, evidence: true, invalidatedAt: true },
    orderBy: { createdAt: "asc" },
  });
}

export function invalidateOwnedAgentMemories(
  transaction: Prisma.TransactionClient,
  input: { agentProfileId: string; memoryIds: string[]; invalidatedAt: Date },
) {
  return transaction.agentMemoryEpisode.updateMany({
    where: {
      agentProfileId: input.agentProfileId,
      id: { in: input.memoryIds },
      invalidatedAt: null,
    },
    data: { invalidatedAt: input.invalidatedAt },
  });
}

export function getMemoryReflectionTimeout(transaction: Prisma.TransactionClient) {
  return transaction.agentGlobalSettings.findUniqueOrThrow({
    where: { id: "global" },
    select: { reflectionTimeoutSeconds: true },
  });
}

export function findPendingMemoryReconsolidation(
  transaction: Prisma.TransactionClient,
  agentProfileId: string,
) {
  return transaction.agentRun.findFirst({
    where: {
      agentProfileId,
      trigger: "ADMIN_MEMORY_RECONSOLIDATE",
      runStatus: { in: ["QUEUED", "RUNNING", "CANCEL_REQUESTED"] },
    },
    select: { id: true, runStatus: true },
    orderBy: { createdAt: "asc" },
  });
}

export function createMemoryReconsolidationRun(
  transaction: Prisma.TransactionClient,
  input: {
    agentProfileId: string;
    personaVersionId: string;
    requestedById: string;
    requestId: string;
    timeoutSeconds: number;
    availableAt: Date;
  },
) {
  return transaction.agentRun.create({
    data: {
      agentProfileId: input.agentProfileId,
      runType: "REFLECTION",
      queuePriority: "REFLECTION",
      trigger: "ADMIN_MEMORY_RECONSOLIDATE",
      requestedById: input.requestedById,
      personaVersionId: input.personaVersionId,
      idempotencyKey: `memory-reconsolidate:${input.agentProfileId}:${input.requestId}`,
      availableAt: input.availableAt,
      timeoutSeconds: input.timeoutSeconds,
      desiredEntryMin: 0,
      desiredEntryMax: 0,
      allowTopicCreation: false,
      allowVoting: false,
      allowFollowing: false,
      allowSourceReading: false,
      saturationOverride: false,
      dailyMaximumOverride: false,
      provocationOverride: false,
    },
    select: {
      id: true,
      agentProfileId: true,
      runType: true,
      runStatus: true,
      queuePriority: true,
      trigger: true,
      availableAt: true,
      timeoutSeconds: true,
      createdAt: true,
    },
  });
}
