import type { Prisma } from "@prisma/client";

export async function lockPersonaUniverse(transaction: Prisma.TransactionClient): Promise<void> {
  const key = "agent-persona-universe";
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
