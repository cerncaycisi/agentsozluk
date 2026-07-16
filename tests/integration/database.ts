import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl) throw new Error("TEST_DATABASE_URL integration testleri için zorunludur.");

const parsedDatabaseUrl = new URL(databaseUrl);
if (!parsedDatabaseUrl.pathname.endsWith("_test"))
  throw new Error(
    "Integration testleri yalnızca adı _test ile biten bir veritabanında çalışabilir.",
  );

export const integrationDatabase = new PrismaClient({ datasourceUrl: databaseUrl });

export async function resetIntegrationDatabase(): Promise<void> {
  await integrationDatabase.$executeRaw`
    TRUNCATE TABLE
      "idempotency_records",
      "rate_limit_buckets",
      "outbox_events",
      "audit_logs",
      "moderation_actions",
      "reports",
      "user_blocks",
      "topic_follows",
      "entry_bookmarks",
      "entry_votes",
      "entry_revisions",
      "entries",
      "topic_aliases",
      "topics",
      "sessions",
      "users"
    RESTART IDENTITY CASCADE
  `;
}

export function closeIntegrationDatabase(): Promise<void> {
  return integrationDatabase.$disconnect();
}
