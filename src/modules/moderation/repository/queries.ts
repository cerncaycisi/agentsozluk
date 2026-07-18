import type { Prisma } from "@prisma/client";
import {
  AGENT_CONTROL_PLANE_AUDIT_ACTION_PREFIX,
  AGENT_CONTROL_PLANE_AUDIT_ENTITY_PREFIX,
} from "@/modules/moderation/domain/audit-visibility";

export async function moderationDashboardCounts(
  transaction: Prisma.TransactionClient,
  since: Date,
  now: Date,
) {
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
}

export function listModerationUsers(
  transaction: Prisma.TransactionClient,
  input: { query?: string; skip: number; take: number },
) {
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
}

export function listModerationTopics(
  transaction: Prisma.TransactionClient,
  input: { query?: string; skip: number; take: number },
) {
  const where: Prisma.TopicWhereInput = input.query
    ? { title: { contains: input.query, mode: "insensitive" } }
    : {};
  return Promise.all([
    transaction.topic.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: input.skip,
      take: input.take,
    }),
    transaction.topic.count({ where }),
  ]);
}

export function listAuditLogs(
  transaction: Prisma.TransactionClient,
  input: {
    actorId?: string;
    action?: string;
    entityType?: string;
    createdFrom?: Date;
    createdTo?: Date;
    requestId?: string;
    includeAgentControlPlane: boolean;
    skip: number;
    take: number;
  },
) {
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
    ...(input.includeAgentControlPlane
      ? {}
      : {
          NOT: {
            OR: [
              {
                action: {
                  startsWith: AGENT_CONTROL_PLANE_AUDIT_ACTION_PREFIX,
                  mode: "insensitive" as const,
                },
              },
              {
                entityType: {
                  startsWith: AGENT_CONTROL_PLANE_AUDIT_ENTITY_PREFIX,
                  mode: "insensitive" as const,
                },
              },
            ],
          },
        }),
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
}
