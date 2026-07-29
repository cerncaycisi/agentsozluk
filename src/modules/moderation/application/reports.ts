import { isDatabaseError } from "@/lib/db/errors";
import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseClient, DatabaseExecutor } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { appendAuditLog } from "@/modules/audit";
import type { ActorContext } from "@/modules/auth/domain/actor";
import {
  requireModerationCapability,
  requireAnyModerationCapability,
  requireModerator,
} from "@/modules/moderation/domain/authorization";
import {
  assertNoModerationConflict,
  capabilityForReviewTrack,
  constitutionalArticlesForGammazReason,
  reviewTrackForGammazReason,
  type GammazDecisionOutcome,
} from "@/modules/moderation/domain/constitutional-moderation";
import { isGammazReason } from "@/modules/moderation/domain/gammaz";
import { appendModerationAction } from "@/modules/moderation/repository/history";
import {
  createGammazDecisionRecord,
  createReportRecord,
  decideReportRecord,
  findReportEvidenceEntryByPublicId,
  findReportDetail,
  findReporterStatus,
  findReportTarget,
  listRelatedReports,
  listReports,
  listTargetModerationHistory,
  lockReportForDecision,
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
      if (reporter.moderationCapabilities.length === 0)
        throw new AppError(
          "GAMMAZ_CAPABILITY_REQUIRED",
          403,
          "Gammaz oluşturmak için GAMMAZ capability’si gerekir.",
        );
      const target = await findReportTarget(transaction, input.targetType, input.targetId);
      if (!target) throw new AppError("REPORT_NOT_FOUND", 404, "Bildirilecek içerik bulunamadı.");
      if ("status" in target && target.status !== "ACTIVE")
        throw new AppError("REPORT_NOT_FOUND", 404, "Bildirilecek içerik bulunamadı.");
      if (targetOwnerId(target) === actor.actorId) {
        throw new AppError("FORBIDDEN", 403, "Kendinizi veya kendi içeriğinizi bildiremezsiniz.");
      }
      const evidence = Object.fromEntries(
        Object.entries(input.evidence).filter((entry) => entry[1] !== undefined),
      ) as Record<string, string | number>;
      const evidencePublicId =
        input.reason === "GAMMAZ_8_DUPLICATE_ENTRY"
          ? input.evidence.duplicateEntryPublicId
          : input.reason === "GAMMAZ_3_MISSING_CONTINUATION_CONTEXT" ||
              input.reason === "GAMMAZ_9_DELETED_BKZ_TARGET"
            ? input.evidence.referenceEntryPublicId
            : undefined;
      if (evidencePublicId !== undefined) {
        const evidenceEntry = await findReportEvidenceEntryByPublicId(
          transaction,
          evidencePublicId,
        );
        if (!evidenceEntry)
          throw new AppError(
            "GAMMAZ_EVIDENCE_NOT_FOUND",
            422,
            "Gösterilen delil entry’si bulunamadı.",
          );
        if (
          input.targetType !== "ENTRY" ||
          !("topicId" in target) ||
          evidenceEntry.topicId !== target.topicId ||
          evidenceEntry.id === target.id
        )
          throw new AppError(
            "GAMMAZ_EVIDENCE_TARGET_MISMATCH",
            422,
            "Delil entry’si hedefle aynı başlıkta ve farklı bir entry olmalıdır.",
          );
        if (input.reason === "GAMMAZ_8_DUPLICATE_ENTRY" && evidenceEntry.status !== "ACTIVE")
          throw new AppError(
            "GAMMAZ_EVIDENCE_NOT_ACTIVE",
            422,
            "Kopya delili olarak gösterilen önceki entry aktif olmalıdır.",
          );
        if (
          (input.reason === "GAMMAZ_3_MISSING_CONTINUATION_CONTEXT" ||
            input.reason === "GAMMAZ_9_DELETED_BKZ_TARGET") &&
          evidenceEntry.status === "ACTIVE"
        )
          throw new AppError(
            "GAMMAZ_EVIDENCE_NOT_DELETED",
            422,
            "Bu gerekçe için gösterilen dayanak entry artık aktif olmamalıdır.",
          );
        evidence.evidenceEntryId = evidenceEntry.id;
        evidence.evidenceEntryStatus = evidenceEntry.status;
      }
      const report = await createReportRecord(transaction, {
        reporterId: actor.actorId,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        details: input.details,
        evidence,
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
          evidence,
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
          evidence,
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
    const principal = await findModerationActor(transaction, actor.actorId);
    if (input.reviewTrack)
      requireModerationCapability(principal, actor, capabilityForReviewTrack(input.reviewTrack));
    else requireAnyModerationCapability(principal, actor, ["FORMAT_MODERATOR", "LEGAL_REVIEWER"]);
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
    if (isGammazReason(report.reason))
      requireModerationCapability(
        await findModerationActor(transaction, actor.actorId),
        actor,
        capabilityForReviewTrack(reviewTrackForGammazReason(report.reason)),
      );
    else requireModerator(await findModerationActor(transaction, actor.actorId), actor);
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
  requestedOutcome: GammazDecisionOutcome | "RESOLVED",
  input: ReportDecisionInput,
) {
  return inTransaction(client, async (transaction) => {
    const outcome: GammazDecisionOutcome =
      requestedOutcome === "RESOLVED" ? "ACCEPTED" : requestedOutcome;
    await lockReportForDecision(transaction, reportId);
    const report = await findReportDetail(transaction, reportId);
    if (!report) throw new AppError("REPORT_NOT_FOUND", 404, "Bildirim bulunamadı.");
    if (report.status !== "OPEN")
      throw new AppError("REPORT_ALREADY_OPEN", 409, "Bu bildirim daha önce sonuçlandırılmış.");
    if (!isGammazReason(report.reason))
      throw new AppError(
        "LEGACY_REPORT_READ_ONLY",
        409,
        "Tarihsel bildirim yalnız okunabilir; anayasal Gammaz kararı verilemez.",
      );
    const reviewTrack = reviewTrackForGammazReason(report.reason);
    requireModerationCapability(
      await findModerationActor(transaction, actor.actorId),
      actor,
      capabilityForReviewTrack(reviewTrack),
    );
    const target = await findReportTarget(transaction, report.targetType, report.targetId);
    if (
      !target ||
      !assertNoModerationConflict({
        actorId: actor.actorId,
        targetOwnerId: targetOwnerId(target) ?? null,
      })
    )
      throw new AppError(
        "MODERATION_CONFLICT_OF_INTEREST",
        403,
        "Kendi içeriğiniz hakkında moderasyon kararı veremezsiniz.",
      );
    const decision = await createGammazDecisionRecord(transaction, {
      reportId,
      moderatorId: actor.actorId,
      reviewTrack,
      outcome,
      constitutionalArticles: [...constitutionalArticlesForGammazReason(report.reason)],
      rationale: input.resolutionNote,
    });
    const updated = await decideReportRecord(transaction, reportId, {
      status: outcome === "ACCEPTED" ? "RESOLVED" : "REJECTED",
      handledById: actor.actorId,
      handledAt: new Date(),
      resolutionNote: input.resolutionNote,
    });
    if (!updated)
      throw new AppError("REPORT_ALREADY_OPEN", 409, "Bu bildirim daha önce sonuçlandırılmış.");
    await appendModerationAction(transaction, {
      moderatorId: actor.actorId,
      reportId,
      decisionId: decision.id,
      actionType: outcome === "ACCEPTED" ? "GAMMAZ_REASON_ACCEPTED" : "GAMMAZ_REASON_REJECTED",
      targetType: "REPORT",
      targetId: report.id,
      reason: input.resolutionNote,
      metadata: {
        reportId,
        reviewTrack,
        outcome,
        constitutionalArticles: decision.constitutionalArticles,
        targetType: report.targetType,
        targetId: report.targetId,
      },
    });
    await appendAuditLog(transaction, {
      actorId: actor.actorId,
      action: "moderation.completed",
      entityType: "Report",
      entityId: reportId,
      requestId: actor.requestId,
      metadata: {
        decisionId: decision.id,
        outcome,
        reviewTrack,
        targetType: report.targetType,
        targetId: report.targetId,
      },
    });
    await appendOutboxEvent(transaction, {
      eventType: "moderation.completed",
      aggregateType: "Report",
      aggregateId: reportId,
      actorId: actor.actorId,
      actorKind: actor.actorKind,
      requestId: actor.requestId,
      payload: {
        decisionId: decision.id,
        outcome,
        reviewTrack,
        targetType: report.targetType,
        targetId: report.targetId,
      },
    });
    return { ...updated, decision };
  });
}
