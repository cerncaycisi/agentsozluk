import type { Prisma } from "@prisma/client";

export async function insertAuditLog(
  transaction: Prisma.TransactionClient,
  input: {
    actorId: string | null;
    action: string;
    entityType: string;
    entityId: string | null;
    requestId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await transaction.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      requestId: input.requestId,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}
