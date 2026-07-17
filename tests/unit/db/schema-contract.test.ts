import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
const migration = readFileSync(
  path.join(root, "prisma/migrations/20260716220000_initial_milestone_1/migration.sql"),
  "utf8",
);

describe("database schema contract", () => {
  it("declares every required model", () => {
    for (const model of [
      "User",
      "Session",
      "Topic",
      "TopicAlias",
      "Entry",
      "EntryRevision",
      "EntryVote",
      "EntryBookmark",
      "TopicFollow",
      "UserBlock",
      "Report",
      "ModerationAction",
      "AuditLog",
      "OutboxEvent",
      "RateLimitBucket",
      "IdempotencyRecord",
    ]) {
      expect(schema).toContain(`model ${model} {`);
    }
  });

  it("enables extensions, checks and trigram indexes in the migration", () => {
    expect(migration).toContain('CREATE EXTENSION IF NOT EXISTS "pg_trgm"');
    expect(migration).toContain('CREATE EXTENSION IF NOT EXISTS "unaccent"');
    expect(migration).toContain("entry_votes_value_check");
    expect(migration).toContain("user_blocks_not_self_check");
    expect(migration).toContain("entries_score_consistency_check");
    expect(migration).toContain("reports_unique_open_target_per_reporter");
    expect(migration.match(/gin_trgm_ops/gu)).toHaveLength(3);
  });

  it("makes audit and moderation history append-only", () => {
    expect(migration).toContain('CREATE TRIGGER "audit_logs_immutable"');
    expect(migration).toContain('CREATE TRIGGER "moderation_actions_immutable"');
  });
});
