import { getDatabase } from "@/lib/db/client";

export async function checkDatabaseReadiness(): Promise<void> {
  await getDatabase().$queryRaw`SELECT 1`;
}
