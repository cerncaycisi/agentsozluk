import type { Prisma } from "@prisma/client";

export async function findAgentFeedbackTarget(
  transaction: Prisma.TransactionClient,
  input: { targetType: "ENTRY" | "TOPIC"; targetId: string },
) {
  if (input.targetType === "ENTRY")
    return transaction.agentContentRecord.findUnique({
      where: { entryId: input.targetId },
      select: { agentProfileId: true, runId: true, actionId: true },
    });
  const topic = await transaction.topic.findUnique({
    where: { id: input.targetId },
    select: { createdBy: { select: { agentProfile: { select: { id: true } } } } },
  });
  const agentProfileId = topic?.createdBy.agentProfile?.id;
  if (!agentProfileId) return null;
  return transaction.agentContentRecord.findFirst({
    where: {
      agentProfileId,
      entry: { topicId: input.targetId },
      action: { actionType: "CREATE_TOPIC_WITH_ENTRY", actionStatus: "SUCCEEDED" },
    },
    orderBy: { createdAt: "asc" },
    select: { agentProfileId: true, runId: true, actionId: true },
  });
}

export function findLatestAgentFeedbackEvent(
  transaction: Prisma.TransactionClient,
  input: { agentProfileId: string; feedbackKey: string },
) {
  return transaction.agentRuntimeEvent.findFirst({
    where: {
      agentProfileId: input.agentProfileId,
      eventType: { in: ["CONTENT_MODERATED", "CONTENT_RESTORED"] },
      metadata: { path: ["feedbackKey"], equals: input.feedbackKey },
    },
    orderBy: { id: "desc" },
    select: { id: true, eventType: true, agentSequence: true },
  });
}

/*
  Geri bildirim olayı run ve action satırlarına yabancı anahtarla bağlanır; ekleme bu
  satırlarda KEY SHARE kilidi ister. Ajan yürütücüsü eylem boyunca ikisini FOR UPDATE
  tutar. Moderasyon beklemeden dener: alamazsa 55P03 ile vazgeçer (#379).
*/
export async function lockAgentFeedbackReferencesNowait(
  transaction: Prisma.TransactionClient,
  input: { runId: string; actionId: string },
) {
  await transaction.$queryRaw`
    SELECT 1 FROM "agent_runs" WHERE "id" = ${input.runId}::uuid FOR KEY SHARE NOWAIT
  `;
  await transaction.$queryRaw`
    SELECT 1 FROM "agent_actions" WHERE "id" = ${input.actionId}::uuid FOR KEY SHARE NOWAIT
  `;
}
