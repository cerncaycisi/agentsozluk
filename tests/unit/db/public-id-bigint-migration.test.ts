import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260926090000_public_id_bigint_namespace/migration.sql",
  ),
  "utf8",
);
const statements = migration
  .split("\n")
  .filter((line) => !line.startsWith("--"))
  .join("\n");

describe("public ID BIGINT namespace migration", () => {
  it("widens both columns and keeps the sequences capped at the legacy maximum", () => {
    for (const table of ["topics", "entries"]) {
      expect(statements).toContain(`ALTER TABLE "${table}" ALTER COLUMN "publicId" TYPE BIGINT;`);
      expect(statements).toContain(
        `ALTER SEQUENCE "${table}_public_id_seq" AS BIGINT MAXVALUE 2147483647 NO CYCLE CACHE 1;`,
      );
    }
  });

  it("locks the upper namespace with named checks until the reset opens it", () => {
    for (const table of ["topics", "entries"]) {
      expect(statements).toContain(
        `ADD CONSTRAINT "${table}_public_id_legacy_range_check" CHECK ("publicId" <= 2147483647);`,
      );
    }
    expect(statements).not.toMatch(/NOT VALID|RESTART|setval|DROP CONSTRAINT/u);
  });

  it("restores the immutability triggers it has to drop for the type change", () => {
    for (const table of ["topics", "entries"]) {
      const drop = statements.indexOf(`DROP TRIGGER "${table}_public_id_immutable"`);
      const alter = statements.indexOf(
        `ALTER TABLE "${table}" ALTER COLUMN "publicId" TYPE BIGINT`,
      );
      const create = statements.indexOf(`CREATE TRIGGER "${table}_public_id_immutable"`);
      expect(drop).toBeGreaterThanOrEqual(0);
      expect(drop).toBeLessThan(alter);
      expect(create).toBeGreaterThan(alter);
    }
    expect(statements.match(/EXECUTE FUNCTION prevent_public_id_update\(\)/gu)).toHaveLength(2);
  });
});
