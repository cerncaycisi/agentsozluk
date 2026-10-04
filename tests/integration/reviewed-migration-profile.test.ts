import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { requireTestDatabaseUrl } from "../../scripts/test-database-safety";

const repo = process.cwd();
describe.each(["october-2026-v1", "october-2026-v2"])("%s", (profileName) => {
  const profile = JSON.parse(
    readFileSync(path.join(repo, `scripts/migration-profiles/${profileName}.json`), "utf8"),
  );
  const pending = Object.keys(profile.migrations) as string[];
  const names = readdirSync(path.join(repo, "prisma/migrations"))
    .filter((name) => /^\d{14}_/u.test(name))
    .sort();
  const beforeName = `agent_sozluk_october_${profileName.slice(-2)}_before_test`;
  const afterName = `agent_sozluk_october_${profileName.slice(-2)}_after_test`;
  const initialUrl = new URL(
    requireTestDatabaseUrl(process.env.TEST_DATABASE_URL, "Reviewed migration tests"),
  );
  initialUrl.search = "";
  function url(name: string) {
    const value = new URL(initialUrl);
    value.pathname = `/${name}`;
    return value.toString();
  }
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  let root = "";
  const created: string[] = [];
  function sql(database: string, query: string) {
    return execFileSync("psql", ["-XAtq", "-v", "ON_ERROR_STOP=1", "-d", url(database)], {
      input: query,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  }
  function create(database: string) {
    expect(
      sql("postgres", `SELECT count(*) FROM pg_database WHERE datname='${database}';`).trim(),
    ).toBe("0");
    sql("postgres", `CREATE DATABASE "${database}" TEMPLATE template0;`);
    created.push(database);
  }
  function migrate(database: string) {
    execFileSync(
      process.execPath,
      [
        path.join(repo, "node_modules/prisma/build/index.js"),
        "migrate",
        "deploy",
        "--schema",
        path.join(root, "prisma/schema.prisma"),
      ],
      {
        env: { ...process.env, DATABASE_URL: url(database) },
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 120_000,
      },
    );
  }
  function phase(body: string) {
    return spawnSync(
      "bash",
      [
        "-c",
        `
set -Eeuo pipefail
runtime_root=${quote(path.join(root, "runtime"))}
state_dir=${quote(path.join(root, "state"))}
app_root=${quote(repo)}
candidate_sha=${"a".repeat(40)}
op_id=0123456789abcdef
approved_migrations=${pending.join(",")}
reviewed_migration_profile=${profileName}
host_node=${quote(process.execPath)}
source "$app_root/scripts/production-migration-phase.sh"
url_for() {
  case "$1" in
    agent_sozluk | ${beforeName}) printf '%s' ${quote(url(beforeName))} ;;
    ${afterName}) printf '%s' ${quote(url(afterName))} ;;
    *) return 1 ;;
  esac
}
db_psql() { local database="$1"; shift; psql -XAtq -v ON_ERROR_STOP=1 -d "$(url_for "$database")" "$@"; }
compose_stub() {
  [[ "$1 $2 $3" == "exec -T db" ]] || return 99
  shift 3
  local command="$1" database=""; shift
  local args=()
  while (($#)); do
    case "$1" in
      -U) shift 2 ;;
      -d) database="$2"; shift 2 ;;
      *) args+=("$1"); shift ;;
    esac
  done
  "$command" "\${args[@]}" -d "$(url_for "$database")"
}
compose=(compose_stub)
${body}
`,
      ],
      { encoding: "utf8", timeout: 120_000 },
    );
  }
  function pass(body: string) {
    const result = phase(body);
    expect(result.status, result.stderr).toBe(0);
    return result;
  }

  // Senkron psql/restore çağrıları iki profil boyunca RPC cevaplarını bekletmesin.
  // Test/üretim timeout'u büyütülmez; her senaryo sonunda event loop'a dönülür.
  afterEach(async () => {
    await new Promise<void>((resolve) => setImmediate(resolve));
  });

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), "october-migration-pg-"));
    mkdirSync(path.join(root, "state/migration"), { recursive: true });
    mkdirSync(path.join(root, "runtime"));
    mkdirSync(path.join(root, "prisma/migrations"), { recursive: true });
    writeFileSync(
      path.join(root, "prisma/schema.prisma"),
      'datasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n}\n',
    );
    cpSync(
      path.join(repo, "prisma/migrations/migration_lock.toml"),
      path.join(root, "prisma/migrations/migration_lock.toml"),
    );
    const before = names.filter((name) => name < pending[0]!);
    expect(names.filter((name) => name >= pending[0]! && name <= pending.at(-1)!)).toEqual(pending);
    for (const name of before)
      cpSync(
        path.join(repo, "prisma/migrations", name),
        path.join(root, "prisma/migrations", name),
        {
          recursive: true,
        },
      );
    create(beforeName);
    migrate(beforeName);
    // Eski singleton gerçekte dolu: sütun eklerken önceki veriyi kaybetmek görünür olmalı.
    expect(sql(beforeName, "SELECT count(*) FROM agent_global_settings;").trim()).toBe("1");
    writeFileSync(path.join(root, "state/baseline-applied-migrations"), before.join("\n") + "\n");
    writeFileSync(
      path.join(root, "state/baseline-candidate-migrations"),
      [...before, ...pending].join("\n") + "\n",
    );
    pass(`plan_migrations; assert_fk_targets; assert_existing_index_targets
db_fingerprint ${beforeName} "$migration_dir/pre-fingerprint"
prisma_history ${beforeName} >"$migration_dir/pre-prisma-history"`);
    const archive = path.join(root, "before.dump");
    execFileSync("pg_dump", [
      "-Fc",
      "--no-owner",
      "--no-privileges",
      "-f",
      archive,
      "-d",
      url(beforeName),
    ]);
    create(afterName);
    execFileSync(
      "pg_restore",
      ["--exit-on-error", "--no-owner", "--no-privileges", "-d", url(afterName), archive],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    pass(`db_fingerprint ${afterName} "$migration_dir/restored-fingerprint"
cmp "$migration_dir/pre-fingerprint" "$migration_dir/restored-fingerprint"
table_schema_hashes ${afterName} "$migration_dir/scratch-pre-table-schemas"
reviewed_index_size_receipt ${afterName}`);
    for (const name of pending)
      cpSync(
        path.join(repo, "prisma/migrations", name),
        path.join(root, "prisma/migrations", name),
        {
          recursive: true,
        },
      );
    migrate(afterName);
  }, 240_000);

  afterAll(() => {
    for (const database of created.reverse())
      sql("postgres", `DROP DATABASE "${database}" WITH (FORCE);`);
    if (root) rmSync(root, { recursive: true, force: true });
  });

  describe("exact Ekim paketi: gerçek PG16 restore ve geçiş", () => {
    it("yeni tablo FK istisnası genel kapıya veya JS prototype isimlerine taşmaz", () => {
      pass("assert_fk_targets");
      const generic = phase('reviewed_migration_profile=""; assert_fk_targets');
      expect(generic.status).toBe(97);
      expect(generic.stderr).toContain("FOREIGN_KEY_TARGET_UNSUPPORTED");
      const file = path.join(root, "state/migration/expectation.json");
      const original = readFileSync(file, "utf8");
      try {
        writeFileSync(
          file,
          JSON.stringify({
            tables: { yeni: { foreignKeys: [{ referencedTable: "constructor" }] } },
          }),
        );
        const inherited = phase("assert_fk_targets");
        expect(inherited.status).toBe(97);
        expect(inherited.stderr).toContain("FOREIGN_KEY_TARGET_UNSUPPORTED");
      } finally {
        writeFileSync(file, original);
      }
    });

    it("varchar istisnası yalnız exact profil ve 100 karakterlik eventType için geçer", () => {
      pass("assert_existing_index_targets");
      const generic = phase('reviewed_migration_profile=""; assert_existing_index_targets');
      expect(generic.stderr).toContain("EXISTING_INDEX_TARGET_UNSUPPORTED");
      try {
        sql(
          beforeName,
          'ALTER TABLE agent_runtime_events ALTER COLUMN "eventType" TYPE varchar(101);',
        );
        expect(phase("assert_existing_index_targets").stderr).toContain(
          "EXISTING_INDEX_TARGET_UNSUPPORTED",
        );
      } finally {
        sql(
          beforeName,
          'ALTER TABLE agent_runtime_events ALTER COLUMN "eventType" TYPE varchar(100);',
        );
      }
    });

    it("restore üstüne exact profil migration'ları; eski veri/şema/geçmiş ve yeni nesneler doğrulanır", () => {
      pass(`post_verify ${afterName} scratch "$migration_dir/scratch-pre-table-schemas"`);
      expect(
        readFileSync(path.join(root, "state/migration/index-migration-durations-scratch"), "utf8")
          .trim()
          .split("\n"),
      ).toHaveLength(profileName === "october-2026-v2" ? 4 : 3);
      expect(
        sql(beforeName, "SELECT count(*) FROM pg_type WHERE typname='AgentRewardMode';").trim(),
      ).toBe("0");
    }, 120_000);
    it("eski ayar değerinin değişmesi parmak izi kapısını düşürür", () => {
      try {
        sql(afterName, 'UPDATE agent_global_settings SET "runtimeEnabled" = NOT "runtimeEnabled";');
        const result = phase(
          `post_verify ${afterName} drift "$migration_dir/scratch-pre-table-schemas"`,
        );
        expect(result.status).toBe(97);
        expect(result.stderr).toContain("POST_TABLE_CONTENT_CHANGED");
      } finally {
        sql(afterName, 'UPDATE agent_global_settings SET "runtimeEnabled" = NOT "runtimeEnabled";');
      }
    });
    it("aynı veri üzerinde eski constraint değişmesi şema kapısını düşürür", () => {
      try {
        sql(
          afterName,
          "ALTER TABLE agent_global_settings ADD CONSTRAINT october_unapproved CHECK (id <> 'baska');",
        );
        const result = phase(
          `post_verify ${afterName} drift "$migration_dir/scratch-pre-table-schemas"`,
        );
        expect(result.status).toBe(97);
        expect(result.stderr).toContain("POST_TABLE_SCHEMA_CHANGED");
      } finally {
        sql(afterName, "ALTER TABLE agent_global_settings DROP CONSTRAINT october_unapproved;");
      }
    }, 120_000);
    it("devre dışı immutable trigger ve OFF dışı ilk değer reddedilir", () => {
      try {
        sql(
          afterName,
          'ALTER TABLE agent_birth_candidates DISABLE TRIGGER "agent_birth_candidates_immutable";',
        );
        expect(phase(`verify_reviewed_profile_post ${afterName} drift`).stderr).toContain(
          "REVIEWED_EXTRA_CATALOG_MISMATCH",
        );
      } finally {
        sql(
          afterName,
          'ALTER TABLE agent_birth_candidates ENABLE TRIGGER "agent_birth_candidates_immutable";',
        );
      }
      try {
        sql(afterName, "UPDATE agent_global_settings SET \"rewardMode\" = 'SHADOW';");
        expect(phase(`verify_reviewed_profile_post ${afterName} drift`).stderr).toContain(
          "REVIEWED_INITIAL_VALUES_CHANGED",
        );
      } finally {
        sql(afterName, "UPDATE agent_global_settings SET \"rewardMode\" = 'OFF';");
      }
    });
  });
});
