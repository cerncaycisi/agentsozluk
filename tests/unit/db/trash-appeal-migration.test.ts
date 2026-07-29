import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260729113000_add_entry_trash_revival_appeal/migration.sql",
  ),
  "utf8",
);

describe("entry trash, revival and appeal migration", () => {
  it("creates one open trash case and immutable review history", () => {
    expect(migration).toContain('"entry_trash_cases_one_open_per_entry"');
    for (const trigger of [
      "entry_trash_cases_protect",
      "entry_revisions_immutable",
      "entry_revival_requests_immutable",
      "entry_revival_decisions_immutable",
      "entry_appeals_immutable",
      "entry_appeal_decisions_immutable",
    ]) {
      expect(migration).toContain(`CREATE TRIGGER "${trigger}"`);
    }
  });

  it("revalidates entry identity, exact snapshots, capability and conflicts in PostgreSQL", () => {
    for (const functionName of [
      "validate_entry_trash_case",
      "validate_entry_revival_request",
      "validate_entry_revival_decision",
      "validate_entry_appeal",
      "validate_entry_appeal_decision",
      "validate_entry_review_decider",
    ]) {
      expect(migration).toContain(`CREATE FUNCTION ${functionName}`);
    }
    expect(migration).toContain(`capabilities."capability" = 'APPEAL_DECIDER'`);
    expect(migration).toContain("entry review conflict of interest");
    expect(migration).toContain("appeal must match a rejected revival request and open trash case");
    expect(migration).toContain(`entry_body <> request_body`);
    expect(migration).toContain(`entry_body <> NEW."bodySnapshot"`);
    expect(migration).toContain(`entry_body <> appeal_body`);
  });

  it("pins each decision type to the constitutional article set", () => {
    expect(migration).toContain('"constitutionalArticles" = ARRAY[37, 38, 41]::INTEGER[]');
    expect(migration).toContain('"constitutionalArticles" = ARRAY[39, 40, 41, 42]::INTEGER[]');
  });

  it("backfills recoverable historical deleted and constitutionally hidden entries", () => {
    expect(migration).toContain(`'entry-trash-author-delete:'`);
    expect(migration).toContain(`entries."status" = 'DELETED'`);
    expect(migration).toContain(`'entry-trash-moderation-hide:'`);
    expect(migration).toContain(`latest_action."actionType" = 'ENTRY_HIDDEN'`);
    expect(migration).toContain(`entries."status" = 'HIDDEN'`);
    expect(migration.match(/entries\."origin" <> 'SEED'/g)).toHaveLength(2);
  });
});
