import type { Prisma, ReportReason, ReportStatus, ReportTargetType } from "@prisma/client";
import { lockUserStateForMutation } from "@/modules/auth/repository/users";

export function findReportTarget(
  transaction: Prisma.TransactionClient,
  targetType: ReportTargetType,
  targetId: string,
) {
  if (targetType === "TOPIC") {
    return transaction.topic.findUnique({
      where: { id: targetId },
      select: { id: true, title: true, status: true, createdById: true },
    });
  }
  if (targetType === "ENTRY") {
    return transaction.entry.findUnique({
      where: { id: targetId },
      select: { id: true, body: true, status: true, authorId: true, topicId: true },
    });
  }
  return transaction.user.findUnique({
    where: { id: targetId },
    select: { id: true, username: true, displayName: true, status: true, role: true },
  });
}

export function createReportRecord(
  transaction: Prisma.TransactionClient,
  input: {
    reporterId: string;
    targetType: ReportTargetType;
    targetId: string;
    reason: ReportReason;
    details?: string;
  },
) {
  return transaction.report.create({ data: input });
}

export async function findReporterStatus(
  transaction: Prisma.TransactionClient,
  reporterId: string,
) {
  await lockUserStateForMutation(transaction, reporterId);
  return transaction.user.findUnique({
    where: { id: reporterId },
    select: { status: true },
  });
}

export async function decideReportRecord(
  transaction: Prisma.TransactionClient,
  reportId: string,
  input: {
    status: "RESOLVED" | "REJECTED";
    handledById: string;
    handledAt: Date;
    resolutionNote: string;
  },
) {
  const result = await transaction.report.updateMany({
    where: { id: reportId, status: "OPEN" },
    data: input,
  });
  if (result.count === 0) return null;
  return transaction.report.findUniqueOrThrow({ where: { id: reportId } });
}

export function listReports(
  transaction: Prisma.TransactionClient,
  input: {
    status?: ReportStatus;
    targetType?: ReportTargetType;
    reason?: ReportReason;
    createdFrom?: Date;
    createdTo?: Date;
    reporterUsername?: string;
    skip: number;
    take: number;
  },
) {
  const where: Prisma.ReportWhereInput = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.targetType ? { targetType: input.targetType } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.createdFrom || input.createdTo
      ? {
          createdAt: {
            ...(input.createdFrom ? { gte: input.createdFrom } : {}),
            ...(input.createdTo ? { lte: input.createdTo } : {}),
          },
        }
      : {}),
    ...(input.reporterUsername ? { reporter: { usernameNormalized: input.reporterUsername } } : {}),
  };
  return Promise.all([
    transaction.report.findMany({
      where,
      include: {
        reporter: { select: { id: true, username: true, displayName: true } },
        handledBy: { select: { id: true, username: true, displayName: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: input.skip,
      take: input.take,
    }),
    transaction.report.count({ where }),
  ]);
}

export function findReportDetail(transaction: Prisma.TransactionClient, reportId: string) {
  return transaction.report.findUnique({
    where: { id: reportId },
    include: {
      reporter: { select: { id: true, username: true, displayName: true } },
      handledBy: { select: { id: true, username: true, displayName: true } },
    },
  });
}

export function listRelatedReports(
  transaction: Prisma.TransactionClient,
  targetType: ReportTargetType,
  targetId: string,
) {
  return transaction.report.findMany({
    where: { targetType, targetId, status: "OPEN" },
    include: { reporter: { select: { id: true, username: true, displayName: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 20,
  });
}

export function listTargetModerationHistory(
  transaction: Prisma.TransactionClient,
  targetType: ReportTargetType,
  targetId: string,
) {
  return transaction.moderationAction.findMany({
    where: { targetType, targetId },
    include: { moderator: { select: { id: true, username: true, displayName: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 20,
  });
}
