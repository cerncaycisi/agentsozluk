import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260729170000_add_seed_entry_visibility/migration.sql",
  ),
  "utf8",
);

describe("canonical seed entry visibility migration", () => {
  it("uses an overlay without mutating the canonical entries table", () => {
    expect(migration).toContain('CREATE TABLE "seed_entry_visibility"');
    expect(migration).not.toMatch(/ALTER TABLE "entries"[\s\S]*ADD COLUMN/u);
    expect(migration).toContain(
      'FOREIGN KEY ("entryId") REFERENCES "entries"("id") ON DELETE RESTRICT',
    );
  });

  it("accepts only canonical seed targets and active human admins", () => {
    expect(migration).toContain("entry_origin IS DISTINCT FROM 'SEED'");
    expect(migration).toContain("seed visibility target must be a canonical seed entry");
    expect(migration).toContain("seed visibility suppressor must be an active human admin");
    expect(migration).toContain("seed visibility restorer must be an active human admin");
  });

  it("keeps the target and visibility history durable", () => {
    expect(migration).toContain("seed visibility target is immutable");
    expect(migration).toContain("seed visibility history cannot be deleted");
    expect(migration).toContain('CREATE TRIGGER "seed_entry_visibility_no_delete"');
  });
});
