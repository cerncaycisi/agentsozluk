import type { DatabaseClient } from "@/lib/db/types";
import { inTransaction } from "@/lib/db/transaction";
import type { ResetGoneCandidate } from "../domain/reset-gone";
import { findResetGoneDecision } from "../repository/reset-gone";

export function getResetGoneDecision(client: DatabaseClient, candidate: ResetGoneCandidate) {
  return inTransaction(client, (tx) => findResetGoneDecision(tx, candidate));
}
