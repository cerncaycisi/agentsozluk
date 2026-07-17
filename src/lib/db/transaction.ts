import type { DatabaseClient, DatabaseExecutor, TransactionClient } from "@/lib/db/types";

export function inTransaction<T>(
  client: DatabaseExecutor,
  work: (transaction: TransactionClient) => Promise<T>,
): Promise<T> {
  if ("$transaction" in client && typeof client.$transaction === "function") {
    return (client as DatabaseClient).$transaction(work);
  }
  return work(client as TransactionClient);
}
