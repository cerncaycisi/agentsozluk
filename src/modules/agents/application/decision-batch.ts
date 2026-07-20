import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor } from "@/lib/db/types";
import { recordRuntimeLifeEventBatch } from "@/modules/agents/application/life-ledger";
import { recordRuntimeActions } from "@/modules/agents/application/runtime";
import type { RuntimePrincipal } from "@/modules/agents/application/runtime-auth";
import { isProductionRolloutRuntimeMutationBlocked } from "@/modules/agents/application/rollout-guard";
import type { RuntimeDecisionBatchInput } from "@/modules/agents/validation/life-schemas";

/**
 * Persists immutable action proposals and their complete declared decision journal
 * in one database transaction. A crash can leave neither half committed alone.
 */
export function recordRuntimeDecisionBatch(
  client: DatabaseExecutor,
  principal: RuntimePrincipal,
  runId: string,
  input: RuntimeDecisionBatchInput,
) {
  return inTransaction(client, async (transaction) => {
    const now = new Date();
    const actions = await recordRuntimeActions(
      transaction,
      principal,
      runId,
      {
        workerId: input.workerId,
        leaseToken: input.leaseToken,
        actions: input.actions,
      },
      now,
    );
    if (isProductionRolloutRuntimeMutationBlocked(actions)) return actions;
    const life = await recordRuntimeLifeEventBatch(
      transaction,
      principal,
      runId,
      {
        workerId: input.workerId,
        leaseToken: input.leaseToken,
        payload: input.payload,
      },
      now,
    );
    if (isProductionRolloutRuntimeMutationBlocked(life)) return life;
    return { actions, life };
  });
}
