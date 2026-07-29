import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseClient, DatabaseExecutor } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { appendAuditLog } from "@/modules/audit";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { lockUserActorAndTargetTransition } from "@/modules/auth/repository/users";
import { requireModerator } from "@/modules/moderation/domain/authorization";
import type { ModerationCapabilityName } from "@/modules/moderation/domain/gammaz";
import { findModerationActor } from "@/modules/moderation/repository/actions";
import {
  findActiveModerationCapability,
  findModerationCapabilitySubject,
  grantModerationCapabilityRecord,
  hasActiveModerationCapability,
  revokeModerationCapabilityRecord,
} from "@/modules/moderation/repository/capabilities";
import { appendModerationAction } from "@/modules/moderation/repository/history";
import type { ModerationReasonInput } from "@/modules/moderation/validation/schemas";
import { appendOutboxEvent } from "@/modules/outbox";

export function userHasModerationCapability(
  client: DatabaseClient,
  userId: string,
  capability: ModerationCapabilityName,
): Promise<boolean> {
  return client.$transaction((transaction) =>
    hasActiveModerationCapability(transaction, userId, capability),
  );
}

export async function setUserModerationCapability(
  client: DatabaseExecutor,
  actor: ActorContext,
  userId: string,
  capability: ModerationCapabilityName,
  enabled: boolean,
  input: ModerationReasonInput,
) {
  return inTransaction(client, async (transaction) => {
    await lockUserActorAndTargetTransition(transaction, actor.actorId, userId);
    requireModerator(await findModerationActor(transaction, actor.actorId), actor, {
      adminOnly: true,
    });
    const target = await findModerationCapabilitySubject(transaction, userId);
    if (!target) throw new AppError("USER_NOT_FOUND", 404, "Kullanıcı bulunamadı.");
    if (target.status !== "ACTIVE")
      throw new AppError(
        "FORBIDDEN",
        409,
        "Moderasyon capability’si yalnız aktif kullanıcıya verilebilir.",
      );
    if (enabled && (userId !== actor.actorId || target.role !== "ADMIN"))
      throw new AppError(
        "FORBIDDEN",
        403,
        "İlk aşamada moderasyon capability’si yalnız aktif adminin kendi hesabına verilebilir.",
      );
    if (target.kind !== "HUMAN")
      throw new AppError(
        "AGENT_MODERATION_NOT_ENABLED",
        409,
        "Agent moderasyon capability’leri sonraki ürün fazında açılacak.",
      );

    const current = await findActiveModerationCapability(transaction, userId, capability);
    if (enabled && current)
      throw new AppError("CAPABILITY_ALREADY_GRANTED", 409, "Bu capability zaten etkin.");
    if (!enabled && !current)
      throw new AppError("CAPABILITY_NOT_GRANTED", 409, "Bu capability zaten etkin değil.");

    const now = new Date();
    const record = enabled
      ? await grantModerationCapabilityRecord(transaction, {
          userId,
          capability,
          grantedById: actor.actorId,
        })
      : await revokeModerationCapabilityRecord(transaction, {
          id: current!.id,
          revokedById: actor.actorId,
          revokedAt: now,
          revocationReason: input.reason,
        });
    const eventType = enabled ? "user.capability_granted" : "user.capability_revoked";
    const actionType = enabled ? "CAPABILITY_GRANTED" : "CAPABILITY_REVOKED";
    const metadata = {
      actorKind: actor.actorKind,
      capability,
      reason: input.reason,
      before: { active: !enabled },
      after: { active: enabled },
    };
    await appendModerationAction(transaction, {
      moderatorId: actor.actorId,
      actionType,
      targetType: "USER",
      targetId: userId,
      reason: input.reason,
      metadata,
    });
    await appendAuditLog(transaction, {
      actorId: actor.actorId,
      action: eventType,
      entityType: "UserModerationCapability",
      entityId: record.id,
      requestId: actor.requestId,
      metadata: { capability, targetUserId: userId, active: enabled },
    });
    await appendOutboxEvent(transaction, {
      eventType,
      aggregateType: "UserModerationCapability",
      aggregateId: record.id,
      actorId: actor.actorId,
      actorKind: actor.actorKind,
      requestId: actor.requestId,
      payload: { capability, targetUserId: userId, active: enabled },
    });
    return { capability, active: enabled, userId };
  });
}
