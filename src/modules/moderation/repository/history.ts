import type { Prisma } from "@prisma/client";

export function appendModerationAction(
  transaction: Prisma.TransactionClient,
  input: {
    moderatorId: string;
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
      actionType: input.actionType,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}
