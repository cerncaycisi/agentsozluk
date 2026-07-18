import { PrismaClient } from "@prisma/client";
import { requireTestDatabaseUrl } from "../../scripts/test-database-safety";

const databaseUrl = requireTestDatabaseUrl(process.env.TEST_DATABASE_URL, "Integration tests");

export const integrationDatabase = new PrismaClient({ datasourceUrl: databaseUrl });

export async function resetIntegrationDatabase(): Promise<void> {
  await integrationDatabase.$executeRaw`
    TRUNCATE TABLE
      "agent_runtime_events",
      "agent_capacity_snapshots",
      "agent_runtime_capabilities",
      "agent_global_settings",
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
  await integrationDatabase.agentGlobalSettings.upsert({
    where: { id: "global" },
    update: {},
    create: {
      id: "global",
      activeTimeWeights: {
        "07:00-10:00": 0.15,
        "10:00-14:00": 0.3,
        "14:00-19:00": 0.35,
        "19:00-23:00": 0.17,
        "23:00-07:00": 0.03,
      },
      circuitBreakerConfig: {
        errorRateWindowMinutes: 15,
        errorRateThreshold: 0.5,
        consecutiveCodexFailures: 5,
        duplicateWindowSize: 50,
        duplicateThreshold: 0.4,
        duplicateCooldownMinutes: 60,
        utilizationWindowMinutes: 120,
        utilizationThreshold: 0.9,
      },
    },
  });
}

export function closeIntegrationDatabase(): Promise<void> {
  return integrationDatabase.$disconnect();
}
