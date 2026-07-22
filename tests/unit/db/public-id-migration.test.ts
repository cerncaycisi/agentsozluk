import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.join(process.cwd(), "prisma/migrations/20260722170000_add_public_content_ids/migration.sql"),
  "utf8",
);

describe("public content id migration", () => {
  it("backfills both content types deterministically and continues separate sequences", () => {
    expect(migration).toContain('CREATE SEQUENCE "topics_public_id_seq" AS INTEGER');
    expect(migration).toContain('CREATE SEQUENCE "entries_public_id_seq" AS INTEGER');
    expect(
      migration.match(/row_number\(\) OVER \(ORDER BY "createdAt" ASC, id ASC\)/gu),
    ).toHaveLength(2);
    expect(migration).toContain(
      'ALTER SEQUENCE "topics_public_id_seq" OWNED BY "topics"."publicId"',
    );
    expect(migration).toContain(
      'ALTER SEQUENCE "entries_public_id_seq" OWNED BY "entries"."publicId"',
    );
  });

  it("enforces non-null uniqueness and database-level immutability", () => {
    expect(migration).toContain('ALTER COLUMN "publicId" SET NOT NULL');
    expect(migration).toContain('CREATE UNIQUE INDEX "topics_publicId_key"');
    expect(migration).toContain('CREATE UNIQUE INDEX "entries_publicId_key"');
    expect(migration).toContain('CREATE TRIGGER "topics_public_id_immutable"');
    expect(migration).toContain('CREATE TRIGGER "entries_public_id_immutable"');
    expect(migration).toContain("RAISE EXCEPTION 'publicId is immutable'");
  });
});
