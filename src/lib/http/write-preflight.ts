import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor } from "@/lib/db/types";
import { requireActiveActor } from "@/modules/auth/application/guards";

/**
 * Rechecks the current account state while holding the shared user-state lock.
 * When used as an idempotency preflight, the lock lives until replay/mutation
 * completion and serializes the response against suspension or deactivation.
 */
export function activeActorWritePreflight(
  actorId: string,
): (client: DatabaseExecutor) => Promise<void> {
  return (client) =>
    inTransaction(client, (transaction) => requireActiveActor(transaction, actorId));
}
