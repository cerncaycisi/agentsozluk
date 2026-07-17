import type { Prisma } from "@prisma/client";
import type { AgentContentBulkActionInput } from "@/modules/moderation/validation/schemas";

export function resolveAgentContentRecords(
  transaction: Prisma.TransactionClient,
  input: AgentContentBulkActionInput,
  now: Date,
) {
  return transaction.agentContentRecord.findMany({
    where: input.entryIds
      ? { entryId: { in: input.entryIds } }
      : input.runId
        ? { runId: input.runId }
        : {
            agentProfileId: input.agentProfileId!,
            createdAt: { gte: new Date(now.getTime() - input.sinceHours! * 60 * 60_000) },
          },
    orderBy: [{ createdAt: "desc" }, { entryId: "desc" }],
    take: 500,
    select: {
      entryId: true,
      runId: true,
      agentProfileId: true,
      entry: { select: { status: true, topicId: true } },
    },
  });
}
