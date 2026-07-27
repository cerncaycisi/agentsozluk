import { AppError } from "@/lib/http/errors";
import type { TransactionClient } from "@/lib/db/types";
import { getRuntimeCredentialReadiness } from "@/modules/agents/repository/runtime-credentials";

export async function assertManagedRuntimeCredentialReady(
  transaction: TransactionClient,
  agentProfileId: string,
  now: Date,
) {
  const readiness = await getRuntimeCredentialReadiness(transaction, agentProfileId, now);
  if (!readiness.ready)
    throw new AppError(
      "AGENT_RUNTIME_NOT_READY",
      409,
      "Agent ACTIVE veya run kuyruğuna hazır değil; worker credential roster senkronunu bekleyin.",
      undefined,
      undefined,
      { readinessReason: readiness.reason },
    );
  return readiness;
}
