import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor } from "@/lib/db/types";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { lockUserStateForMutation } from "@/modules/auth/repository/users";
import { requireHumanAdmin } from "@/modules/agents/domain/authorization";
import { findAgentAdminPrincipal } from "@/modules/agents/repository/control-plane";

export function authorizeAgentAdmin(client: DatabaseExecutor, actor: ActorContext): Promise<void> {
  return inTransaction(client, async (transaction) => {
    await lockUserStateForMutation(transaction, actor.actorId);
    requireHumanAdmin(await findAgentAdminPrincipal(transaction, actor.actorId), actor);
  });
}
