import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = process.cwd();
const checker = path.join(root, "scripts/reviewed-migration-profile.mjs");
const profilePath = path.join(root, "scripts/migration-profiles/october-2026-v1.json");
const profile = JSON.parse(readFileSync(profilePath, "utf8")) as {
  migrations: Record<string, string>;
  newColumns: Record<string, string>;
  catalog: unknown;
};
const temporary: string[] = [];
function directory() {
  const dir = mkdtempSync(path.join(tmpdir(), "reviewed-migration-"));
  temporary.push(dir);
  return dir;
}
afterEach(() =>
  temporary.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })),
);
function cli(args: string[], input = "") {
  return spawnSync(process.execPath, [checker, ...args], { input, encoding: "utf8" });
}
function check(names: string[], source = root, name = "october-2026-v1") {
  const pending = path.join(directory(), "pending");
  writeFileSync(pending, names.join("\n") + "\n");
  return cli(["verify", name, source, pending]);
}
const before =
  "CREATE TABLE public.agent_global_settings (\n    id text,\n    CONSTRAINT eski CHECK (true)\n);\n";
const added = Object.values(profile.newColumns).join("\n") + "\n";
const after = before.replace("    CONSTRAINT", added + "    CONSTRAINT");

describe("incelenmiş exact Ekim migration paketi", () => {
  it("yalnız sekiz değişmez dosyayı kabul eder; genel denetçinin reddi korunur", () => {
    const names = Object.keys(profile.migrations);
    const result = check(names);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(profile.catalog);
    const generic = spawnSync(
      process.execPath,
      [path.join(root, "scripts/check-additive-migration.mjs"), "-"],
      {
        input: names
          .map((name) =>
            readFileSync(path.join(root, "prisma/migrations", name, "migration.sql"), "utf8"),
          )
          .join("\n"),
        encoding: "utf8",
      },
    );
    expect(generic.status).toBe(3);
  });
  it.each(["partial", "reordered", "extra", "duplicate", "unknown"])(
    "%s paketini reddeder",
    (kind) => {
      const names = Object.keys(profile.migrations);
      if (kind === "partial") names.pop();
      if (kind === "reordered") names.reverse();
      if (kind === "extra") names.push("20261005120000_baska");
      if (kind === "duplicate") names.push(names[0]!);
      expect(check(names, root, kind === "unknown" ? "baska" : "october-2026-v1").status).toBe(3);
    },
  );
  it("aynı migration adıyla değiştirilmiş SQL'i reddeder", () => {
    const copy = directory();
    for (const name of Object.keys(profile.migrations)) {
      cpSync(
        path.join(root, "prisma/migrations", name),
        path.join(copy, "prisma/migrations", name),
        { recursive: true },
      );
    }
    const file = path.join(
      copy,
      "prisma/migrations",
      Object.keys(profile.migrations)[0]!,
      "migration.sql",
    );
    writeFileSync(file, readFileSync(file, "utf8") + "\nDROP TABLE users;\n");
    const result = check(Object.keys(profile.migrations), copy);
    expect(result.status).toBe(3);
    expect(result.stderr).toContain("REVIEWED_PROFILE_CHECKSUM_MISMATCH");
  });
  it("yalnız exact yeni sütunları çıkarır; eski şemadaki değişikliği saklamaz", () => {
    const normalize = (input: string) => cli(["normalize-schema", "october-2026-v1"], input);
    expect(normalize(before).stdout).toBe(before);
    expect(normalize(after).stdout).toBe(before);
    expect(normalize(after.replace("id text", "id uuid")).stdout).not.toBe(before);
    expect(normalize(after.replace("CHECK (true)", "CHECK (false)")).stdout).not.toBe(before);
    expect(normalize(before.replace("agent_global_settings", "baska")).stdout).toContain("baska");
  });
  it.each(["default", "type", "missing", "duplicate"])("%s sütun sapmasını reddeder", (kind) => {
    let source = after;
    if (kind === "default") source = source.replace("'OFF'", "'CANDIDATES'");
    if (kind === "type") source = source.replace("timestamp(3)", "timestamp(6)");
    if (kind === "missing") source = source.replace(profile.newColumns.lastBirthScanAt! + "\n", "");
    if (kind === "duplicate")
      source = source.replace("    CONSTRAINT", profile.newColumns.birthMode + "\n    CONSTRAINT");
    expect(cli(["normalize-schema", "october-2026-v1"], source).status).toBe(3);
  });
  it("trigger eksikliği, fonksiyon gövdesi ve indeks predicate değişikliğini reddeder", () => {
    const expected = JSON.parse(
      readFileSync(
        path.join(root, "scripts/migration-profiles/october-2026-v1-extra.json"),
        "utf8",
      ),
    );
    const file = path.join(directory(), "actual.json");
    writeFileSync(file, JSON.stringify(expected));
    expect(cli(["verify-extra", "october-2026-v1", file]).status).toBe(0);
    for (const prefix of ["trigger:", "function:", "index:"]) {
      const changed = structuredClone(expected);
      const key = Object.keys(changed).find((item) => item.startsWith(prefix))!;
      if (prefix === "trigger:") delete changed[key];
      else changed[key].definition += " DEGISTIRILMIS_TANIM";
      writeFileSync(file, JSON.stringify(changed));
      expect(cli(["verify-extra", "october-2026-v1", file]).status).toBe(3);
    }
  });
});
