import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.join(process.cwd(), "prisma/migrations/20260926120000_great_reset_records/migration.sql"),
  "utf8",
);
const tables = [
  "great_reset_intents",
  "great_reset_commits",
  "great_reset_tombstones",
  "great_reset_exposure_events",
];

describe("great reset records migration", () => {
  it("guards every table against TRUNCATE unless the test cleanup opts in", () => {
    for (const table of tables) {
      expect(migration).toContain(`BEFORE TRUNCATE ON "${table}"`);
    }
    expect(migration).toContain("agentsozluk.allow_great_reset_truncate");
    // GUC tek başına yetmez; üretim veritabanı adı test kuralına uymaz.
    expect(migration).toContain("current_database() !~* '(^|[_-])test$'");
  });

  it("keeps commits, tombstones and exposure events append-only", () => {
    for (const table of tables.slice(1)) {
      expect(migration).toContain(`BEFORE UPDATE OR DELETE ON "${table}"`);
    }
    expect(migration).toContain(`BEFORE DELETE ON "great_reset_intents"`);
    expect(migration).toContain(`BEFORE UPDATE ON "great_reset_intents"`);
  });

  it("encodes the single reset, legacy tombstone range and intent outcome rules", () => {
    expect(migration).toContain('ON "great_reset_commits" ((true))');
    expect(migration).toContain('CHECK ("publicId" BETWEEN 1 AND 2147483647)');
    expect(migration).toContain('ON "great_reset_tombstones" ("kind", "publicId")');
    expect(migration).toContain('CHECK ("consumedAt" IS NULL OR "invalidatedAt" IS NULL)');
    expect(migration).toContain("INTERVAL '2 hours'");
    expect(migration).toContain(`CHECK ("eventType" = 'TRAFFIC_OPEN')`);
  });
});
