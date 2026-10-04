import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = process.cwd();
const checker = path.join(root, "scripts/reviewed-migration-profile.mjs");
describe.each(["october-2026-v1", "october-2026-v2"])("%s", (profileName) => {
  const profilePath = path.join(root, `scripts/migration-profiles/${profileName}.json`);
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
  function check(names: string[], source = root, name = profileName) {
    const pending = path.join(directory(), "pending");
    writeFileSync(pending, names.join("\n") + "\n");
    return cli(["verify", name, source, pending]);
  }
  const before =
    "CREATE TABLE public.agent_global_settings (\n    id text,\n    CONSTRAINT eski CHECK (true)\n);\n";
  const added = Object.values(profile.newColumns).join("\n") + "\n";
  const after = before.replace("    CONSTRAINT", added + "    CONSTRAINT");

  describe("incelenmiş exact Ekim migration paketi", () => {
    it("yalnız exact değişmez dosya kümesini kabul eder; genel denetçinin reddi korunur", () => {
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
        expect(check(names, root, kind === "unknown" ? "baska" : profileName).status).toBe(3);
      },
    );
    it.each([0, -1])("aynı migration adıyla değiştirilmiş SQL'i reddeder (%s)", (index) => {
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
        Object.keys(profile.migrations).at(index)!,
        "migration.sql",
      );
      writeFileSync(file, readFileSync(file, "utf8") + "\nDROP TABLE users;\n");
      const result = check(Object.keys(profile.migrations), copy);
      expect(result.status).toBe(3);
      expect(result.stderr).toContain("REVIEWED_PROFILE_CHECKSUM_MISMATCH");
    });
    it("yalnız exact yeni sütunları çıkarır; eski şemadaki değişikliği saklamaz", () => {
      const normalize = (input: string) => cli(["normalize-schema", profileName], input);
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
      if (kind === "missing")
        source = source.replace(profile.newColumns.lastBirthScanAt! + "\n", "");
      if (kind === "duplicate")
        source = source.replace(
          "    CONSTRAINT",
          profile.newColumns.birthMode + "\n    CONSTRAINT",
        );
      expect(cli(["normalize-schema", profileName], source).status).toBe(3);
    });
    it("trigger eksikliği, fonksiyon gövdesi ve indeks predicate değişikliğini reddeder", () => {
      const expected = JSON.parse(
        readFileSync(
          path.join(root, `scripts/migration-profiles/${profileName}-extra.json`),
          "utf8",
        ),
      );
      const file = path.join(directory(), "actual.json");
      writeFileSync(file, JSON.stringify(expected));
      expect(cli(["verify-extra", profileName, file]).status).toBe(0);
      for (const prefix of ["trigger:", "function:", "index:", "constraint:"]) {
        const changed = structuredClone(expected);
        const key = Object.keys(changed).find((item) => item.startsWith(prefix))!;
        if (prefix === "trigger:") delete changed[key];
        else changed[key].definition += " DEGISTIRILMIS_TANIM";
        writeFileSync(file, JSON.stringify(changed));
        expect(cli(["verify-extra", profileName, file]).status).toBe(3);
      }
    });
  });
});

it("v1 makbuzları değişmez; v2 yalnız aynı sekiz dosyanın ardına dokuzuncuyu ekler", () => {
  const pinned = {
    "october-2026-v1.json": "53fd9cff1ab28d3cecfab13779b523ac1316764cf524a9295212522317e4a331",
    "october-2026-v1-extra.json":
      "4346d18306ea273d4e8139822d171cef6807889c4440e0be92ed15c4bfaf4a1e",
    "october-2026-v1-extra.sql": "82453fd10e520f1daa512385448c20e5daa8cb23d13f9062989cf307ddb33ac1",
  };
  for (const [name, hash] of Object.entries(pinned)) {
    expect(
      createHash("sha256")
        .update(readFileSync(path.join(root, "scripts/migration-profiles", name)))
        .digest("hex"),
    ).toBe(hash);
  }
  const v1 = JSON.parse(
    readFileSync(path.join(root, "scripts/migration-profiles/october-2026-v1.json"), "utf8"),
  );
  const v2 = JSON.parse(
    readFileSync(path.join(root, "scripts/migration-profiles/october-2026-v2.json"), "utf8"),
  );
  expect(Object.entries(v2.migrations).slice(0, 8)).toEqual(Object.entries(v1.migrations));
  expect(Object.keys(v2.migrations).slice(8)).toEqual(["20261004120000_birth_preparation"]);
  expect(v2.newColumns).toEqual(v1.newColumns);
});
