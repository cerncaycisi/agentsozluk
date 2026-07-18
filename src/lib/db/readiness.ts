import { getDatabase } from "@/lib/db/client";
import type { DatabaseExecutor } from "@/lib/db/types";

export async function checkDatabaseReadiness(
  executor: DatabaseExecutor = getDatabase(),
): Promise<void> {
  await executor.$queryRaw`SELECT 1`;
}
