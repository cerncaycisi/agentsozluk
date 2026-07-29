import type { ReportReason } from "@prisma/client";
import type { DatabaseExecutor } from "@/lib/db/types";

export function findModerationPrincipal(client: DatabaseExecutor, actorId: string) {
  return client.user.findUnique({
    where: { id: actorId },
    select: {
      id: true,
      kind: true,
      role: true,
      status: true,
      moderationCapabilities: {
        where: { revokedAt: null },
        select: { capability: true },
      },
    },
  });
}

export function findModerationAuthorizationTarget(client: DatabaseExecutor, userId: string) {
  return client.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, status: true },
  });
}

export async function findReportAuthorizationContext(
  client: DatabaseExecutor,
  reportId: string,
): Promise<{
  reason: ReportReason;
  targetType: "ENTRY" | "TOPIC";
  targetId: string;
  targetOwnerId: string | null;
  decision: { id: string; outcome: "ACCEPTED" | "REJECTED" } | null;
} | null> {
  const report = await client.report.findUnique({
    where: { id: reportId },
    select: {
      reason: true,
      targetType: true,
      targetId: true,
      decision: { select: { id: true, outcome: true } },
    },
  });
  if (!report || (report.targetType !== "ENTRY" && report.targetType !== "TOPIC")) return null;
  const targetOwnerId =
    report.targetType === "ENTRY"
      ? (
          await client.entry.findUnique({
            where: { id: report.targetId },
            select: { authorId: true },
          })
        )?.authorId
      : (
          await client.topic.findUnique({
            where: { id: report.targetId },
            select: { createdById: true },
          })
        )?.createdById;
  return {
    reason: report.reason,
    targetType: report.targetType,
    targetId: report.targetId,
    targetOwnerId: targetOwnerId ?? null,
    decision: report.decision,
  };
}

export async function findContentAuthorizationTarget(
  client: DatabaseExecutor,
  targetType: "ENTRY" | "TOPIC",
  targetId: string,
): Promise<{ targetOwnerId: string } | null> {
  if (targetType === "ENTRY") {
    const entry = await client.entry.findUnique({
      where: { id: targetId },
      select: { authorId: true },
    });
    return entry ? { targetOwnerId: entry.authorId } : null;
  }
  const topic = await client.topic.findUnique({
    where: { id: targetId },
    select: { createdById: true },
  });
  return topic ? { targetOwnerId: topic.createdById } : null;
}
