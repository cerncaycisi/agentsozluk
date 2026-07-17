import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { lockUserStates } from "@/modules/auth/repository/users";
import { assertCanActOnUser, requireModerator } from "@/modules/moderation/domain/authorization";
import {
  findModerationAuthorizationTarget,
  findModerationPrincipal,
} from "@/modules/moderation/repository/authorization";

export interface ModerationAuthorizationOptions {
  adminOnly?: boolean;
  targetUserId?: string;
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
    const [principal, target] = await Promise.all([
      findModerationPrincipal(transaction, actor.actorId),
      options.targetUserId
        ? findModerationAuthorizationTarget(transaction, options.targetUserId)
        : Promise.resolve(null),
    ]);
    const moderator = requireModerator(
      principal,
      actor,
      options.adminOnly === undefined ? {} : { adminOnly: options.adminOnly },
    );
    if (!options.targetUserId) return;
    if (!target) throw new AppError("USER_NOT_FOUND", 404, "Kullanıcı bulunamadı.");
    assertCanActOnUser(moderator, target);
  });
}
