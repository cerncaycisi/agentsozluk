import { isDatabaseError } from "@/lib/db/errors";
import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseClient, DatabaseExecutor } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { appendAuditLog } from "@/modules/audit";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { requireModerator } from "@/modules/moderation/domain/authorization";
import { appendModerationAction } from "@/modules/moderation/repository/history";
import {
  createReportRecord,
  decideReportRecord,
  findReportDetail,
  findReporterStatus,
  findReportTarget,
  listRelatedReports,
  listReports,
  listTargetModerationHistory,
} from "@/modules/moderation/repository/reports";
import { findModerationActor } from "@/modules/moderation/repository/actions";
import type {
  ReportCreateInput,
  ReportDecisionInput,
} from "@/modules/moderation/validation/schemas";
import { appendOutboxEvent } from "@/modules/outbox";

function targetOwnerId(target: unknown): string | undefined {
  if (!target || typeof target !== "object") return undefined;
  if ("authorId" in target && typeof target.authorId === "string") return target.authorId;
  if ("createdById" in target && typeof target.createdById === "string") return target.createdById;
  return undefined;
}

export async function createReport(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: ReportCreateInput,
) {
  try {
    return await inTransaction(client, async (transaction) => {
      const reporter = await findReporterStatus(transaction, actor.actorId);
      if (reporter?.status !== "ACTIVE")
        throw new AppError(
          "ACCOUNT_SUSPENDED",
          403,
          "Yalnızca aktif kullanıcılar bildirim yapabilir.",
        );
      const target = await findReportTarget(transaction, input.targetType, input.targetId);
      if (!target) throw new AppError("REPORT_NOT_FOUND", 404, "Bildirilecek içerik bulunamadı.");
      if (
        (input.targetType === "USER" && input.targetId === actor.actorId) ||
        targetOwnerId(target) === actor.actorId
      ) {
        throw new AppError("FORBIDDEN", 403, "Kendinizi veya kendi içeriğinizi bildiremezsiniz.");
      }
      const report = await createReportRecord(transaction, {
        reporterId: actor.actorId,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        ...(input.details ? { details: input.details } : {}),
      });
      await appendOutboxEvent(transaction, {
        eventType: "report.created",
        aggregateType: "Report",
        aggregateId: report.id,
        actorId: actor.actorId,
        actorKind: actor.actorKind,
        requestId: actor.requestId,
        payload: {
          targetType: report.targetType,
          targetId: report.targetId,
          reason: report.reason,
        },
      });
      await appendAuditLog(transaction, {
        actorId: actor.actorId,
        action: "report.created",
        entityType: "Report",
        entityId: report.id,
        requestId: actor.requestId,
        metadata: {
          targetType: report.targetType,
          targetId: report.targetId,
          reason: report.reason,
        },
      });
      return report;
    });
  } catch (error) {
    if (isDatabaseError(error, "P2002")) {
      throw new AppError("REPORT_ALREADY_OPEN", 409, "Bu hedef için açık bildiriminiz zaten var.");
    }
    throw error;
  }
}

export async function getModerationReports(
  client: DatabaseClient,
  actor: ActorContext,
  input: Parameters<typeof listReports>[1],
) {
  return client.$transaction(async (transaction) => {
    requireModerator(await findModerationActor(transaction, actor.actorId), actor);
    return listReports(transaction, input);
  });
}

export async function getModerationReport(
  client: DatabaseClient,
  actor: ActorContext,
  reportId: string,
) {
  return client.$transaction(async (transaction) => {
    requireModerator(await findModerationActor(transaction, actor.actorId), actor);
    const report = await findReportDetail(transaction, reportId);
    if (!report) throw new AppError("REPORT_NOT_FOUND", 404, "Bildirim bulunamadı.");
    const [target, relatedReports, moderationActions] = await Promise.all([
      findReportTarget(transaction, report.targetType, report.targetId),
      listRelatedReports(transaction, report.targetType, report.targetId),
      listTargetModerationHistory(transaction, report.targetType, report.targetId),
    ]);
    return { report, target, relatedReports, moderationActions };
  });
}

export async function decideReport(
  client: DatabaseExecutor,
  actor: ActorContext,
  reportId: string,
  decision: "RESOLVED" | "REJECTED",
  input: ReportDecisionInput,
) {
  return inTransaction(client, async (transaction) => {
    requireModerator(await findModerationActor(transaction, actor.actorId), actor);
    const report = await findReportDetail(transaction, reportId);
    if (!report) throw new AppError("REPORT_NOT_FOUND", 404, "Bildirim bulunamadı.");
    if (report.status !== "OPEN")
      throw new AppError("REPORT_ALREADY_OPEN", 409, "Bu bildirim daha önce sonuçlandırılmış.");
    const updated = await decideReportRecord(transaction, reportId, {
      status: decision,
      handledById: actor.actorId,
      handledAt: new Date(),
      resolutionNote: input.resolutionNote,
    });
    if (!updated)
      throw new AppError("REPORT_ALREADY_OPEN", 409, "Bu bildirim daha önce sonuçlandırılmış.");
    await appendModerationAction(transaction, {
      moderatorId: actor.actorId,
      actionType: decision === "RESOLVED" ? "REPORT_RESOLVED" : "REPORT_REJECTED",
      targetType: report.targetType,
      targetId: report.targetId,
      reason: input.resolutionNote,
      metadata: { reportId },
    });
    await appendAuditLog(transaction, {
      actorId: actor.actorId,
      action: "moderation.completed",
      entityType: "Report",
      entityId: reportId,
      requestId: actor.requestId,
      metadata: { decision, targetType: report.targetType, targetId: report.targetId },
    });
    await appendOutboxEvent(transaction, {
      eventType: "moderation.completed",
      aggregateType: "Report",
      aggregateId: reportId,
      actorId: actor.actorId,
      actorKind: actor.actorKind,
      requestId: actor.requestId,
      payload: { decision, targetType: report.targetType, targetId: report.targetId },
    });
    return updated;
  });
}
