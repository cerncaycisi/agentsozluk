import type { Prisma, PrismaClient } from "@prisma/client";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { requireModerator } from "@/modules/moderation/domain/authorization";

export async function getModerationDashboard(
  client: PrismaClient,
  actor: ActorContext,
  now = new Date(),
) {
  return client.$transaction(async (transaction) => {
    await requireModerator(transaction, actor);
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const [openReports, reports24h, hiddenEntries, hiddenTopics, suspendedUsers, actions24h] =
      await Promise.all([
        transaction.report.count({ where: { status: "OPEN" } }),
        transaction.report.count({ where: { createdAt: { gte: since, lte: now } } }),
        transaction.entry.count({ where: { status: "HIDDEN" } }),
        transaction.topic.count({ where: { status: "HIDDEN" } }),
        transaction.user.count({ where: { status: "SUSPENDED" } }),
        transaction.moderationAction.count({ where: { createdAt: { gte: since, lte: now } } }),
      ]);
    return { openReports, reports24h, hiddenEntries, hiddenTopics, suspendedUsers, actions24h };
  });
}

export async function getModerationUsers(
  client: PrismaClient,
  actor: ActorContext,
  input: { query?: string; skip: number; take: number },
) {
  return client.$transaction(async (transaction) => {
    await requireModerator(transaction, actor);
    const where: Prisma.UserWhereInput = input.query
      ? {
          OR: [
            { usernameNormalized: { contains: input.query, mode: "insensitive" } },
            { displayName: { contains: input.query, mode: "insensitive" } },
          ],
        }
      : {};
    return Promise.all([
      transaction.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          displayName: true,
          role: true,
          status: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: input.skip,
        take: input.take,
      }),
      transaction.user.count({ where }),
    ]);
  });
}

export async function getAuditLogs(
  client: PrismaClient,
  actor: ActorContext,
  input: {
    actorId?: string;
    action?: string;
    entityType?: string;
    createdFrom?: Date;
    createdTo?: Date;
    requestId?: string;
    skip: number;
    take: number;
  },
) {
  return client.$transaction(async (transaction) => {
    await requireModerator(transaction, actor);
    const where: Prisma.AuditLogWhereInput = {
      ...(input.actorId ? { actorId: input.actorId } : {}),
      ...(input.action ? { action: input.action } : {}),
      ...(input.entityType ? { entityType: input.entityType } : {}),
      ...(input.requestId ? { requestId: input.requestId } : {}),
      ...(input.createdFrom || input.createdTo
        ? {
            createdAt: {
              ...(input.createdFrom ? { gte: input.createdFrom } : {}),
              ...(input.createdTo ? { lte: input.createdTo } : {}),
            },
          }
        : {}),
    };
    return Promise.all([
      transaction.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, username: true, displayName: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: input.skip,
        take: input.take,
      }),
      transaction.auditLog.count({ where }),
    ]);
  });
}
