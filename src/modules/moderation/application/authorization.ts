import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { lockUserStates } from "@/modules/auth/repository/users";
import {
  assertCanActOnUser,
  requireModerationCapability,
  requireModerator,
} from "@/modules/moderation/domain/authorization";
import {
  assertNoModerationConflict,
  capabilityForReviewTrack,
  isContentActionAllowed,
  reviewTrackForGammazReason,
} from "@/modules/moderation/domain/constitutional-moderation";
import { isGammazReason } from "@/modules/moderation/domain/gammaz";
import {
  findContentAuthorizationTarget,
  findReportAuthorizationContext,
  findModerationAuthorizationTarget,
  findModerationPrincipal,
} from "@/modules/moderation/repository/authorization";

export interface ModerationAuthorizationOptions {
  adminOnly?: boolean;
  targetUserId?: string;
  allowSelfAdminTarget?: boolean;
  reportDecisionId?: string;
  contentAction?: {
    sourceReportId?: string;
    targetType: "ENTRY" | "TOPIC";
    targetId: string;
    actionType: string;
  };
}

/**
 * Read-only authorization preflight for idempotent moderation HTTP commands.
 *
 * Mutation services deliberately repeat these checks in their own transaction.
 * This preflight exists so a stored response cannot bypass current actor or
 * target-user authorization.
 */
export function authorizeModerationCommand(
  client: DatabaseExecutor,
  actor: ActorContext,
  options: ModerationAuthorizationOptions = {},
): Promise<void> {
  return inTransaction(client, async (transaction) => {
    await lockUserStates(transaction, [
      { userId: actor.actorId, mode: "shared" },
      ...(options.targetUserId
        ? [{ userId: options.targetUserId, mode: "exclusive" } as const]
        : []),
    ]);
    const [principal, target, reportContext, contentTarget] = await Promise.all([
      findModerationPrincipal(transaction, actor.actorId),
      options.targetUserId
        ? findModerationAuthorizationTarget(transaction, options.targetUserId)
        : Promise.resolve(null),
      options.reportDecisionId
        ? findReportAuthorizationContext(transaction, options.reportDecisionId)
        : Promise.resolve(null),
      options.contentAction
        ? findContentAuthorizationTarget(
            transaction,
            options.contentAction.targetType,
            options.contentAction.targetId,
          )
        : Promise.resolve(null),
    ]);
    if (options.contentAction) {
      if (!contentTarget) throw new AppError("REPORT_NOT_FOUND", 404, "İçerik bulunamadı.");
      if (!options.contentAction.sourceReportId) {
        requireModerationCapability(principal, actor, "FORMAT_MODERATOR");
      } else {
        const sourceReport = await findReportAuthorizationContext(
          transaction,
          options.contentAction.sourceReportId,
        );
        if (
          !sourceReport ||
          !sourceReport.decision ||
          sourceReport.decision.outcome !== "ACCEPTED" ||
          !isGammazReason(sourceReport.reason)
        )
          throw new AppError(
            "MODERATION_DECISION_REQUIRED",
            409,
            "İçerik işlemi için kabul edilmiş anayasal Gammaz kararı gerekir.",
          );
        if (
          sourceReport.targetType !== options.contentAction.targetType ||
          sourceReport.targetId !== options.contentAction.targetId
        )
          throw new AppError(
            "MODERATION_DECISION_TARGET_MISMATCH",
            422,
            "Gammaz kararı bu içerik hedefiyle eşleşmiyor.",
          );
        requireModerationCapability(
          principal,
          actor,
          capabilityForReviewTrack(reviewTrackForGammazReason(sourceReport.reason)),
        );
        if (
          !isContentActionAllowed(
            sourceReport.reason,
            sourceReport.targetType,
            options.contentAction.actionType,
          )
        )
          throw new AppError(
            "MODERATION_ACTION_NOT_ALLOWED",
            422,
            "Bu Gammaz gerekçesi için seçilen içerik işlemi uygulanamaz.",
          );
      }
      if (
        !assertNoModerationConflict({
          actorId: actor.actorId,
          targetOwnerId: contentTarget.targetOwnerId,
        })
      )
        throw new AppError(
          "MODERATION_CONFLICT_OF_INTEREST",
          403,
          "Kendi içeriğiniz üzerinde moderasyon işlemi yapamazsınız.",
        );
      return;
    }
    if (options.reportDecisionId) {
      if (!reportContext || !isGammazReason(reportContext.reason))
        throw new AppError("REPORT_NOT_FOUND", 404, "Gammaz bulunamadı.");
      requireModerationCapability(
        principal,
        actor,
        capabilityForReviewTrack(reviewTrackForGammazReason(reportContext.reason)),
      );
      if (
        !assertNoModerationConflict({
          actorId: actor.actorId,
          targetOwnerId: reportContext.targetOwnerId,
        })
      )
        throw new AppError(
          "MODERATION_CONFLICT_OF_INTEREST",
          403,
          "Kendi içeriğiniz hakkında moderasyon kararı veremezsiniz.",
        );
      return;
    }
    const moderator = requireModerator(
      principal,
      actor,
      options.adminOnly === undefined ? {} : { adminOnly: options.adminOnly },
    );
    if (!options.targetUserId) return;
    if (!target) throw new AppError("USER_NOT_FOUND", 404, "Kullanıcı bulunamadı.");
    if (options.allowSelfAdminTarget) {
      if (!options.adminOnly)
        throw new AppError(
          "FORBIDDEN",
          403,
          "Kendi hesabını hedefleyen işlem yalnız admin capability akışında kullanılabilir.",
        );
      return;
    }
    assertCanActOnUser(moderator, target);
  });
}
