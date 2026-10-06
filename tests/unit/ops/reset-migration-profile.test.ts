import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
const root = process.cwd();
const checker = path.join(root, "scripts/reviewed-migration-profile.mjs");
const profile = JSON.parse(
  readFileSync(path.join(root, "scripts/migration-profiles/reset-2026-v1.json"), "utf8"),
);
const temporary: string[] = [];
function directory() {
  const value = mkdtempSync(path.join(tmpdir(), "reset-profile-"));
  temporary.push(value);
  return value;
}
afterEach(() =>
  temporary.splice(0).forEach((value) => rmSync(value, { recursive: true, force: true })),
);
function cli(command: string, input = "", args: string[] = []) {
  return spawnSync(process.execPath, [checker, command, "reset-2026-v1", ...args], {
    input,
    encoding: "utf8",
  });
}
function check(names: string[], source = root) {
  const file = path.join(directory(), "pending");
  writeFileSync(file, names.join("\n") + "\n");
  return cli("verify", "", [source, file]);
}
function schema(bigint: boolean) {
  return ["entries", "topics"]
    .map(
      (table) => `CREATE TABLE public.${table} (
    id uuid NOT NULL,
    score integer DEFAULT 0 NOT NULL,
    "publicId" ${bigint ? "bigint" : "integer"} NOT NULL,
${bigint ? `    CONSTRAINT ${table}_public_id_legacy_range CHECK ((("publicId" >= 1) AND ("publicId" <= 2147483647))),\n` : ""}    CONSTRAINT ${table}_score CHECK ((score >= 0))
);
CREATE SEQUENCE public.${table}_public_id_seq
${bigint ? "" : "    AS integer\n"}    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    ${bigint ? "MAXVALUE 2147483647" : "NO MAXVALUE"}
    CACHE 1;
ALTER SEQUENCE public.${table}_public_id_seq OWNED BY public.${table}."publicId";
`,
    )
    .join("\n");
}
function pre() {
  return {
    columns: ["entries", "topics"].map((table) => ({
      table,
      type: "integer",
      notNull: true,
      default: `nextval('${table}_public_id_seq'::regclass)`,
      ownerMatches: true,
      legacyRangeCount: 0,
      invalidRows: 0,
    })),
    sequences: ["entries", "topics"].map((table) => ({
      name: `${table}_public_id_seq`,
      type: "integer",
      start: "1",
      min: "1",
      max: "2147483647",
      increment: "1",
      cycle: false,
      cache: "1",
      persistence: "p",
      ownerMatches: true,
      ownedByTable: table,
      ownedByColumn: "publicId",
      dependency: "a",
    })),
    journalsPresent: 0,
    journalFunctionsPresent: 0,
  };
}
function verifyPre(value: ReturnType<typeof pre>) {
  const file = path.join(directory(), "pre.json");
  writeFileSync(file, JSON.stringify(value));
  return cli("verify-pre", "", [file]);
}

function migrationPreflight(profileName: string) {
  const phase = readFileSync(path.join(root, "scripts/production-migration-phase.sh"), "utf8");
  const definition = phase.match(/^preflight_migration\(\) \{[\s\S]*?^\}/mu)?.[0];
  expect(definition).toBeDefined();
  return spawnSync(
    "bash",
    [
      "-c",
      `set -Eeuo pipefail
reviewed_migration_profile=${profileName}
compose=(compose_stub)
migration_fail() { printf '%s\n' "$1" >&2; exit 97; }
compose_stub() { printf 't\n'; }
db_psql() {
 case "$*" in
  *server_encoding*) printf 'UTF8\n' ;;
  *datdba*) printf 't\n' ;;
  *pg_db_role_setting*) printf '0\n' ;;
  *rewardMode*) printf '4\n' ;;
  *block_size*) printf '8192\n' ;;
  *) exit 98 ;;
 esac
}
assert_fk_targets() { :; }
assert_existing_index_targets() { :; }
reviewed_index_size_receipt() { printf 'OCTOBER_INDEX_RECEIPT\n'; }
assert_disk_budget() { printf 'DISK_GATE\n'; }
${definition}
preflight_migration
printf 'PASSED\n'`,
    ],
    { encoding: "utf8", timeout: 5000 },
  );
}

function schemaHashProbe(name: "schema_hash" | "archive_schema_hash", mode: string) {
  const phase = readFileSync(path.join(root, "scripts/production-migration-phase.sh"), "utf8");
  const definition = phase.match(new RegExp(`^${name}\\(\\) \\{[\\s\\S]*?^\\}`, "mu"))?.[0];
  expect(definition).toBeDefined();
  const dir = directory();
  const archive = path.join(dir, "archive");
  writeFileSync(archive, "synthetic fixture");
  const columnType = mode === "invalid" ? "text" : "integer";
  const filter =
    mode === "empty"
      ? "cat >/dev/null"
      : `"${process.execPath}" "${checker}" normalize-schema reset-2026-v1`;
  return spawnSync(
    "bash",
    [
      "-c",
      `set -Eeuo pipefail
migration_dir='${dir}'
compose=(compose_stub)
compose_stub() { printf 'CREATE TABLE public.topics (\\n    "publicId" ${columnType} NOT NULL\\n);\\n'; }
deadline_prefix() { deadline=(); }
migration_fail() { printf '%s\\n' "$1" >&2; exit 97; }
schema_dump_filter() { ${filter}; }
${definition}
# Exercise the || caller that suppresses errexit in the entire function body.
${name} '${name === "schema_hash" ? "fixture" : archive}' || exit $?
printf 'HASH_ACCEPTED\\n'`,
    ],
    { encoding: "utf8", timeout: 5000 },
  );
}
describe("exact reset migration delivery profile", () => {
  it.each(["schema_hash", "archive_schema_hash"] as const)(
    "%s rejects failed or empty normalization even inside an OR caller",
    (name) => {
      const invalid = schemaHashProbe(name, "invalid");
      expect(invalid.status).toBe(97);
      expect(invalid.stderr).toContain("SCHEMA_NORMALIZATION_FAILED");
      expect(invalid.stderr).toContain("REVIEWED_RESET_COLUMN_MISMATCH");
      expect(invalid.stdout).not.toContain("HASH_ACCEPTED");
      const empty = schemaHashProbe(name, "empty");
      expect(empty.status).toBe(97);
      expect(empty.stderr).toContain("SCHEMA_HASH_INVALID");
      expect(empty.stdout).not.toContain("HASH_ACCEPTED");
      const valid = schemaHashProbe(name, "valid");
      expect(valid.status, valid.stderr).toBe(0);
      expect(valid.stdout).toContain("HASH_ACCEPTED");
    },
  );
  it("accepts a D202 database with existing reward/birth columns for reset", () => {
    const result = migrationPreflight("reset-2026-v1");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("DISK_GATE");
    expect(result.stdout).toContain("PASSED");
    expect(result.stdout).not.toContain("OCTOBER_INDEX_RECEIPT");
  });
  it.each(["october-2026-v1", "october-2026-v2"])(
    "keeps the existing-column rejection for %s",
    (profileName) => {
      const result = migrationPreflight(profileName);
      expect(result.status).toBe(97);
      expect(result.stderr).toContain("REVIEWED_COLUMNS_ALREADY_PRESENT");
      expect(result.stdout).not.toContain("DISK_GATE");
    },
  );
  it("accepts only all six immutable migration bytes", () => {
    expect(Object.keys(profile.migrations)).toHaveLength(6);
    const result = check(Object.keys(profile.migrations));
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(profile.catalog);
  });
  it.each(["partial", "reverse", "duplicate", "extra"])("rejects %s migration set", (kind) => {
    const names = Object.keys(profile.migrations);
    if (kind === "partial") names.pop();
    if (kind === "reverse") names.reverse();
    if (kind === "duplicate") names.push(names[0]!);
    if (kind === "extra") names.push("20261006000000_extra");
    expect(check(names).status).toBe(3);
  });
  it.each([0, -1])("rejects changed SQL with unchanged name (%s)", (index) => {
    const dir = directory();
    for (const name of Object.keys(profile.migrations))
      cpSync(
        path.join(root, "prisma/migrations", name),
        path.join(dir, "prisma/migrations", name),
        { recursive: true },
      );
    const file = path.join(
      dir,
      "prisma/migrations",
      Object.keys(profile.migrations).at(index)!,
      "migration.sql",
    );
    writeFileSync(file, readFileSync(file, "utf8") + "\nDROP TABLE users;\n");
    expect(check(Object.keys(profile.migrations), dir).stderr).toContain(
      "REVIEWED_PROFILE_CHECKSUM_MISMATCH",
    );
  });
  it("normalizes the actual INTEGER-to-BIGINT column/sequence changes only", () => {
    const before = cli("normalize-schema", schema(false));
    const after = cli("normalize-schema", schema(true));
    expect(before.status, before.stderr).toBe(0);
    expect(after.status, after.stderr).toBe(0);
    expect(after.stdout).toBe(before.stdout);
    const unrelated = cli(
      "normalize-schema",
      schema(true).replace("score integer", "score bigint"),
    );
    expect(unrelated.stdout).not.toBe(before.stdout);
  });
  it.each(["minimum", "maximum", "missing-range", "column-type", "duplicate"])(
    "rejects malformed %s conversion",
    (kind) => {
      let input = schema(true);
      if (kind === "minimum") input = input.replace('"publicId" >= 1', '"publicId" >= 0');
      if (kind === "maximum")
        input = input.replace('"publicId" <= 2147483647', '"publicId" <= 9007199254740991');
      if (kind === "missing-range")
        input = input
          .split("\n")
          .filter((line) => !line.includes("entries_public_id_legacy_range"))
          .join("\n");
      if (kind === "column-type") input = input.replace('"publicId" bigint', '"publicId" text');
      if (kind === "duplicate") input += schema(true);
      expect(cli("normalize-schema", input).status).toBe(3);
    },
  );
  it("keeps sequence values, range and unrelated sequence changes visible", () => {
    const before =
      "seq:entries_public_id_seq|17|t\nseqdef:entries_public_id_seq|integer|1|1|2147483647|1|false\nseqdef:other_seq|integer|1|1|100|1|false\n";
    const after = before.replace("entries_public_id_seq|integer", "entries_public_id_seq|bigint");
    expect(cli("normalize-fingerprint", after).stdout).toBe(before);
    for (const changed of [
      after.replace("|17|t", "|18|t"),
      after.replace("2147483647", "100"),
      after.replace("other_seq|integer", "other_seq|bigint"),
    ])
      expect(cli("normalize-fingerprint", changed).stdout).not.toBe(before);
    expect(cli("normalize-fingerprint", after.replace("|bigint|", "|smallint|")).status).toBe(3);
  });
  it("requires the exact existing INTEGER owner/default/sequence definition", () => {
    const result = verifyPre(pre());
    expect(result.status, result.stderr).toBe(0);
  });
  it.each([
    "bigint",
    "owner",
    "default",
    "range",
    "rows",
    "increment",
    "cache",
    "journal",
    "function",
  ])("rejects existing %s drift before production rewrite", (kind) => {
    const value = pre();
    if (kind === "bigint") value.columns[0]!.type = "bigint";
    if (kind === "owner") value.columns[0]!.ownerMatches = false;
    if (kind === "default") value.columns[0]!.default = "nextval('other_seq'::regclass)";
    if (kind === "range") value.columns[0]!.legacyRangeCount = 1;
    if (kind === "rows") value.columns[0]!.invalidRows = 1;
    if (kind === "increment") value.sequences[0]!.increment = "2";
    if (kind === "cache") value.sequences[0]!.cache = "2";
    if (kind === "journal") value.journalsPresent = 1;
    if (kind === "function") value.journalFunctionsPresent = 1;
    expect(verifyPre(value).status).toBe(3);
  });
  it("rejects invalid legacy range catalog despite identical table names", () => {
    const actual = JSON.parse(
      readFileSync(path.join(root, "scripts/migration-profiles/reset-2026-v1-extra.json"), "utf8"),
    );
    const file = path.join(directory(), "extra.json");
    writeFileSync(file, JSON.stringify(actual));
    expect(cli("verify-extra", "", [file]).status).toBe(0);
    actual["constraint:entries:entries_public_id_legacy_range"].validated = false;
    writeFileSync(file, JSON.stringify(actual));
    expect(cli("verify-extra", "", [file]).status).toBe(3);
  });
});
