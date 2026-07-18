import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.join(process.cwd(), "prisma/migrations/20260718180000_add_runtime_plan_scope/migration.sql"),
  "utf8",
);

describe("runtime planning scope migration", () => {
  it("upgrades existing credentials without duplicating the scope on replay", () => {
    expect(migration).toContain('UPDATE "agent_credentials"');
    expect(migration).toContain("array_append(\"scopes\", 'runtime:plan')");
    expect(migration).toContain("WHERE NOT ('runtime:plan' = ANY(\"scopes\"))");
    expect(migration).not.toMatch(/DELETE|TRUNCATE|DROP/iu);
  });
});
