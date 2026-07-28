import type { Prisma } from "@prisma/client";

export function appendModerationAction(
  transaction: Prisma.TransactionClient,
  input: {
    moderatorId: string;
    reportId?: string;
    decisionId?: string;
    actionType: string;
    targetType: string;
    targetId: string;
    reason: string;
    metadata?: Record<string, unknown>;
  },
) {
  return transaction.moderationAction.create({
    data: {
      moderatorId: input.moderatorId,
      ...(input.reportId ? { reportId: input.reportId } : {}),
      ...(input.decisionId ? { decisionId: input.decisionId } : {}),
      actionType: input.actionType,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}
