import type { ModerationCapability, Prisma } from "@prisma/client";

export function findActiveModerationCapability(
  transaction: Prisma.TransactionClient,
  userId: string,
  capability: ModerationCapability,
) {
  return transaction.userModerationCapability.findFirst({
    where: { userId, capability, revokedAt: null },
    orderBy: [{ grantedAt: "desc" }, { id: "desc" }],
  });
}

export async function hasActiveModerationCapability(
  transaction: Prisma.TransactionClient,
  userId: string,
  capability: ModerationCapability,
): Promise<boolean> {
  return Boolean(await findActiveModerationCapability(transaction, userId, capability));
}

export function findModerationCapabilitySubject(
  transaction: Prisma.TransactionClient,
  userId: string,
) {
  return transaction.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      kind: true,
      role: true,
      status: true,
      writerApproved: true,
    },
  });
}

export function grantModerationCapabilityRecord(
  transaction: Prisma.TransactionClient,
  input: {
    userId: string;
    capability: ModerationCapability;
    grantedById: string;
  },
) {
  return transaction.userModerationCapability.create({ data: input });
}

export function revokeModerationCapabilityRecord(
  transaction: Prisma.TransactionClient,
  input: {
    id: string;
    revokedById: string;
    revokedAt: Date;
    revocationReason: string;
  },
) {
  return transaction.userModerationCapability.update({
    where: { id: input.id },
    data: {
      revokedById: input.revokedById,
      revokedAt: input.revokedAt,
      revocationReason: input.revocationReason,
    },
  });
}
