import type { Prisma } from "@prisma/client";

const sensitiveKeys = /password|passwordHash|token|authorization|cookie|email/iu;

function assertSafeMetadata(metadata: Record<string, unknown>): void {
  for (const key of Object.keys(metadata)) {
    if (sensitiveKeys.test(key)) throw new Error("SENSITIVE_AUDIT_METADATA");
  }
}

export async function appendAuditLog(
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
  const metadata = input.metadata ?? {};
  assertSafeMetadata(metadata);
  await transaction.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      requestId: input.requestId,
      metadata: metadata as Prisma.InputJsonValue,
    },
  });
}
