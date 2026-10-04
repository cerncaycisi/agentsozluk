import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { requireTestDatabaseUrl } from "../../scripts/test-database-safety";

const script = path.resolve("scripts/backup-restore/run-owned.sh");
const verify = path.resolve("scripts/backup-restore/verify.sql");
const sha = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

it("O3 yalnız yeni kopyaya restore eder; hash/ad/tekrar koruması ve makbuzu gerçek PG16 ile sınanır", async () => {
  await fixture(async (f) => {
    expect(
      f.sql("postgres", `SELECT rolsuper OR rolcreatedb FROM pg_roles WHERE rolname='${f.owner}'`),
    ).toBe("f");
    f.sql(
      f.source,
      "CREATE TABLE sample (id bigserial PRIMARY KEY, note text); INSERT INTO sample(note) VALUES ('sentetik')",
    );
    const good = f.stage();
    f.dump(good);
    const result = await f.run(good, 30);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe("O3_RESTORE_READY");
    f.remember(good);
    expect(f.sql(good.target, "SELECT count(*) FROM sample")).toBe("1");
    expect(readFileSync(`${good.dir}/run/verify.stdout`, "utf8")).toContain("RESTORE_DONE");
    expect(readFileSync(`${good.dir}/run/identity`, "utf8")).toContain(
      `oid=${f.oid(good.target)}\n`,
    );
    expect(readFileSync(`${good.dir}/run/status`, "utf8")).toContain("O3_RESTORE_READY");
    const repeated = await f.run(good, 30);
    expect(repeated.code).not.toBe(0);
    expect(repeated.stderr).toContain("O3_OPERATION_ALREADY_USED");

    const badHash = f.stage();
    f.dump(badHash);
    const bad = await f.run(badHash, 30, "0".repeat(64));
    expect(bad.code).not.toBe(0);
    expect(bad.stderr).toContain("O3_ARCHIVE_HASH_MISMATCH");
    expect(f.oid(badHash.target)).toBe("");

    const collision = f.stage();
    f.dump(collision);
    f.sql(
      "postgres",
      `CREATE DATABASE "${collision.target}" OWNER "${f.owner}" TEMPLATE template0`,
    );
    f.remember(collision);
    f.sql(collision.target, "CREATE TABLE untouched (id int); INSERT INTO untouched VALUES (7)");
    const rejected = await f.run(collision, 30);
    expect(rejected.code).not.toBe(0);
    expect(rejected.stderr).toContain("O3_CREATE_FAILED");
    expect(f.sql(collision.target, "SELECT id FROM untouched")).toBe("7");
    expect(f.sql(collision.target, "SELECT to_regclass('public.sample') IS NULL")).toBe("t");
    expect(f.sql(f.source, "SELECT note FROM sample")).toBe("sentetik");
  });
}, 60_000);

it("O3 toplam süreyi aşan gerçek restore'u keser; yabancı oturumları ve kaynak DB'yi korur", async () => {
  await fixture(async (f) => {
    f.sql(
      f.source,
      `CREATE FUNCTION public.slow_key(value int) RETURNS int LANGUAGE plpgsql IMMUTABLE AS
      $$ BEGIN PERFORM pg_sleep(0.2); RETURN value; END $$;
      CREATE TABLE slow_data (id int); INSERT INTO slow_data SELECT g FROM generate_series(1,30) g;
      CREATE INDEX slow_index ON slow_data(public.slow_key(id));`,
    );
    const stage = f.stage();
    f.dump(stage);
    const began = Date.now();
    const running = f.run(stage, 5);
    await f.until(() => f.oid(stage.target) !== "");
    f.remember(stage);
    // Aynı hedefte başka app; aynı app adıyla kaynakta başka oturum: ikisine de dokunulamaz.
    const foreignTarget = f.sleeper(stage.target, "o3-foreign-fixture");
    const foreignSource = f.sleeper(f.source, `o3-${stage.op}`);
    await f.until(
      () =>
        f.active(stage.target, "o3-foreign-fixture") === "1" &&
        f.active(f.source, `o3-${stage.op}`) === "1",
    );
    const result = await running;
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("O3_RESTORE_CLIENT_FAILED");
    expect(Date.now() - began).toBeLessThan(15_000);
    expect(readFileSync(`${stage.dir}/run/cleanup.stdout`, "utf8")).toContain(
      "O3_OWNED_SESSIONS_GONE",
    );
    expect(f.active(stage.target, `o3-${stage.op}`)).toBe("0");
    expect(f.active(stage.target, "o3-foreign-fixture")).toBe("1");
    expect(f.active(f.source, `o3-${stage.op}`)).toBe("1");
    expect(f.sql(f.source, "SELECT count(*) FROM slow_data")).toBe("30");
    expect(f.oid(stage.target)).toBeTruthy(); // Otomatik DROP yok.
    await f.stop(foreignTarget);
    await f.stop(foreignSource);
  });
}, 45_000);

it("O3 doğrulama da restore ile aynı süre bütçesindedir", async () => {
  await fixture(async (f) => {
    f.sql(f.source, "CREATE TABLE sample(id int)");
    const stage = f.stage();
    f.dump(stage);
    // Operatörün hash'le seçtiği SQL gecikmesi: ayrı tam bütçe açılamaz.
    writeFileSync(`${stage.dir}/verify.sql`, "SELECT pg_sleep(30);\n");
    const result = await f.run(stage, 3);
    f.remember(stage);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("O3_VERIFY_CLIENT_FAILED");
    expect(readFileSync(`${stage.dir}/run/cleanup.stdout`, "utf8")).toContain(
      "O3_OWNED_SESSIONS_GONE",
    );
    expect(f.active(stage.target, `o3-${stage.op}`)).toBe("0");
  });
}, 30_000);

it("O3 CREATE kontrolünde uygulama sahibinin ayrıcalığını artırmadan yetkisiz kontrol rolünü reddeder", async () => {
  await fixture(async (f) => {
    f.sql(f.source, "CREATE TABLE sample(id int)");
    const stage = f.stage();
    f.dump(stage);
    const denied = await f.run(stage, 30, sha(`${stage.dir}/backup.dump`), f.owner);
    expect(denied.code).not.toBe(0);
    expect(denied.stderr).toContain("O3_CREATE_FAILED");
    expect(f.oid(stage.target)).toBe("");
    expect(
      f.sql("postgres", `SELECT rolsuper OR rolcreatedb FROM pg_roles WHERE rolname='${f.owner}'`),
    ).toBe("f");
  });
}, 30_000);

it("O3 temizlikte değişen hedef kimliğine dokunmaz ve belirsizliği ayrı exit ile bildirir", async () => {
  await fixture(async (f) => {
    f.sql(f.source, "CREATE TABLE sample(id int)");
    const stage = f.stage();
    f.dump(stage);
    writeFileSync(`${stage.dir}/verify.sql`, "SELECT pg_sleep(30);\n");
    const running = f.run(stage, 4);
    await f.until(() => existsSync(`${stage.dir}/run/verify.stdout`));
    f.remember(stage);
    const preserved = f.sleeper(stage.target, `o3-${stage.op}`);
    await f.until(() => f.active(stage.target, `o3-${stage.op}`) === "2");
    f.sql("postgres", `COMMENT ON DATABASE "${stage.target}" IS 'fixture-identity-changed'`);
    const result = await running;
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("O3_CLEANUP_UNCONFIRMED");
    expect(readFileSync(`${stage.dir}/run/cleanup.stderr`, "utf8")).toContain(
      "O3_CLEANUP_IDENTITY_MISMATCH",
    );
    expect(readFileSync(`${stage.dir}/run/cleanup-status`, "utf8").trim()).toBe(
      "O3_CLEANUP_UNCONFIRMED",
    );
    expect(f.active(stage.target, `o3-${stage.op}`)).toBe("2");
    await f.stop(preserved);
    expect(f.sql(f.source, "SELECT count(*) FROM sample")).toBe("0");
  });
}, 30_000);

type Stage = { op: string; target: string; dir: string };
type Sleeper = {
  child: ReturnType<typeof spawn>;
  closed: Promise<void>;
  database: string;
  application: string;
};
async function fixture(work: (f: ReturnType<typeof makeFixture>) => Promise<void>) {
  const f = makeFixture();
  let failure: unknown;
  try {
    await work(f);
  } catch (error) {
    failure = error;
  }
  const errors: unknown[] = failure ? [failure] : [];
  let databasesDropped = true;
  for (const child of f.sleepers) {
    try {
      await f.stop(child);
    } catch (error) {
      errors.push(error);
    }
  }
  for (const [name, oid] of f.owned) {
    try {
      expect(f.oid(name)).toBe(oid);
      f.sql("postgres", `DROP DATABASE "${name}"`);
    } catch (error) {
      databasesDropped = false;
      errors.push(error);
    }
  }
  if (databasesDropped) {
    try {
      expect(f.sql("postgres", `SELECT oid FROM pg_roles WHERE rolname='${f.owner}'`)).toBe(
        f.ownerOid,
      );
      f.sql("postgres", `DROP ROLE "${f.owner}"`);
    } catch (error) {
      errors.push(error);
    }
  }
  // SQL kanıtı/kimlik belirsizliğinde temp dosyaları koru; testte bile sessizce silme.
  if (!errors.length) for (const dir of f.dirs) rmSync(dir, { recursive: true });
  if (errors.length)
    throw new AggregateError(errors, "O3 fixture doğrulaması/temizliği başarısız", {
      cause: errors[0],
    });
}

function makeFixture() {
  const base = new URL(requireTestDatabaseUrl(process.env.TEST_DATABASE_URL, "Owned restore"));
  base.search = "";
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PGHOST: base.hostname,
    PGPORT: base.port || "5432",
    PGUSER: decodeURIComponent(base.username),
  };
  delete env.PGPASSWORD;
  const control = decodeURIComponent(base.username);
  const owner = `o3_owner_${randomBytes(6).toString("hex")}_test`;
  const authDirectory = mkdtempSync(path.join(tmpdir(), "o3-fixture-auth-"));
  const pass = (value: string) => value.replaceAll("\\", "\\\\").replaceAll(":", "\\:");
  const ownerPassword = "o3-fixture-only";
  env.PGPASSFILE = path.join(authDirectory, "pgpass");
  writeFileSync(
    env.PGPASSFILE,
    [
      [base.hostname, base.port || "5432", "*", control, decodeURIComponent(base.password)],
      [base.hostname, base.port || "5432", "*", owner, ownerPassword],
    ]
      .map((values) => values.map(pass).join(":"))
      .join("\n") + "\n",
    { mode: 0o600 },
  );
  const source = `o3_source_${randomBytes(6).toString("hex")}_test`;
  const sql = (database: string, query: string) =>
    execFileSync("psql", ["-XAtq", "-v", "ON_ERROR_STOP=1", "-d", database], {
      env: database === "postgres" ? env : { ...env, PGUSER: owner },
      input: query,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 10_000,
    }).trim();
  const oid = (name: string) =>
    sql("postgres", `SELECT oid FROM pg_database WHERE datname='${name}'`);
  expect(sql("postgres", "SELECT rolsuper FROM pg_roles WHERE rolname=current_user")).toBe("t");
  expect(sql("postgres", `SELECT count(*) FROM pg_roles WHERE rolname='${owner}'`)).toBe("0");
  sql(
    "postgres",
    `CREATE ROLE "${owner}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${ownerPassword}'`,
  );
  const ownerOid = sql("postgres", `SELECT oid FROM pg_roles WHERE rolname='${owner}'`);
  expect(oid(source)).toBe("");
  sql("postgres", `CREATE DATABASE "${source}" OWNER "${owner}" TEMPLATE template0`);
  const owned = new Map([[source, oid(source)]]);
  const dirs: string[] = [authDirectory];
  const sleepers: Sleeper[] = [];
  const remember = (s: Stage) => {
    const value = oid(s.target);
    expect(value).toMatch(/^[1-9][0-9]*$/u);
    owned.set(s.target, value);
  };
  const active = (db: string, app: string) =>
    sql(
      "postgres",
      `SELECT count(*) FROM pg_stat_activity WHERE datname='${db}' AND application_name='${app}'`,
    );
  const until = async (condition: () => boolean) => {
    const end = Date.now() + 2500;
    while (!condition()) {
      if (Date.now() >= end) throw new Error("O3_TEST_START_TIMEOUT");
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  };
  const stop = async (s: Sleeper) => {
    expect(oid(s.database)).toBe(owned.get(s.database));
    sql(
      "postgres",
      `SELECT pg_terminate_backend(pid, 1000) FROM pg_stat_activity WHERE datname='${s.database}' AND application_name='${s.application}'`,
    );
    s.child.kill("SIGKILL");
    await s.closed;
  };
  return {
    source,
    owner,
    control,
    ownerOid,
    sql,
    oid,
    owned,
    dirs,
    sleepers,
    remember,
    active,
    until,
    stop,
    stage: (): Stage => {
      const op = randomBytes(16).toString("hex");
      const dir = `/tmp/agentsozluk-o3-${op}`;
      mkdirSync(dir, { mode: 0o700 });
      dirs.push(dir);
      copyFileSync(verify, `${dir}/verify.sql`);
      return { op, dir, target: `agent_sozluk_o3_${op}` };
    },
    dump: (s: Stage) => {
      execFileSync(
        "pg_dump",
        ["-Fc", "--compress=zstd:3", "-d", source, "-f", `${s.dir}/backup.dump`],
        { env: { ...env, PGUSER: owner }, stdio: ["ignore", "pipe", "pipe"], timeout: 10_000 },
      );
    },
    sleeper: (db: string, app: string): Sleeper => {
      const child = spawn("psql", ["-XAtq", "-d", db, "-c", "SELECT pg_sleep(60)"], {
        env: { ...env, PGUSER: owner, PGAPPNAME: app },
        stdio: "ignore",
      });
      const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
      const result = { child, closed, database: db, application: app };
      sleepers.push(result);
      return result;
    },
    run: (s: Stage, limit: number, dumpSha = sha(`${s.dir}/backup.dump`), controlRole = control) =>
      new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
        const child = spawn(
          "sh",
          [
            script,
            s.op,
            source,
            owner,
            controlRole,
            dumpSha,
            sha(`${s.dir}/verify.sql`),
            String(limit),
          ],
          { env, detached: true, stdio: ["ignore", "pipe", "pipe"] },
        );
        let stdout = "",
          stderr = "",
          timedOut = false;
        const kill = () => {
          if (child.pid) {
            try {
              process.kill(-child.pid, "SIGKILL");
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
            }
          }
        };
        const timer = setTimeout(() => {
          timedOut = true;
          kill();
        }, 40_000);
        child.stdout.on("data", (data: Buffer) => {
          stdout += data.toString();
        });
        child.stderr.on("data", (data: Buffer) => {
          stderr += data.toString();
        });
        child.once("error", reject);
        child.once("close", (code) => {
          clearTimeout(timer);
          if (timedOut) reject(new Error("O3_TEST_OUTER_TIMEOUT"));
          else resolve({ code, stdout, stderr });
        });
      }),
  };
}

it("O3 eksik argümanlarda DB komutuna erişmez", () => {
  const bad = spawnSync("sh", [script, "not-a-valid-op"], { encoding: "utf8" });
  expect(bad.status).not.toBe(0);
  expect(bad.stderr.trim()).toBe("O3_ARGUMENTS_INVALID");
});

it("O3 yedi argümanın bozuk içeriğini ve staging symlinklerini DB erişiminden önce reddeder", () => {
  const op = randomBytes(16).toString("hex");
  const target = `agent_sozluk_o3_${op}`;
  const base = [
    op,
    "o3_source_test",
    "o3_owner_test",
    "o3_control_test",
    "a".repeat(64),
    "b".repeat(64),
    "30",
  ];
  const badArguments: Array<[number, string]> = [
    [0, "f".repeat(31)],
    [0, "F".repeat(32)],
    [1, "source-bad"],
    [1, "Source"],
    [1, "s".repeat(64)],
    [1, target],
    [2, "owner'bad"],
    [3, "control;bad"],
    [4, "c".repeat(63)],
    [5, "C".repeat(64)],
    [6, "0"],
    [6, "01"],
    [6, "2701"],
    [6, "1;psql"],
  ];
  const markerDir = mkdtempSync(path.join(tmpdir(), "o3-guard-test-"));
  const called = path.join(markerDir, "db-command-called");
  for (const binary of ["psql", "pg_restore", "sha256sum"])
    writeFileSync(path.join(markerDir, binary), `#!/bin/sh\ntouch '${called}'\nexit 99\n`, {
      mode: 0o700,
    });
  const env = { ...process.env, PATH: `${markerDir}:${process.env.PATH}` };
  const stage = `/tmp/agentsozluk-o3-${op}`;
  expect(existsSync(stage)).toBe(false);
  try {
    for (const [index, value] of badArguments) {
      const args = [...base];
      args[index] = value;
      const result = spawnSync("sh", [script, ...args], { env, encoding: "utf8", timeout: 5000 });
      expect(result.status).toBe(1);
      expect(result.stderr.trim()).toBe("O3_ARGUMENTS_INVALID");
      expect(existsSync(called)).toBe(false);
    }
    // Dizin linki, dump linki ve verify linki bağımsız; hepsi hash/DB komutundan önce.
    const real = path.join(markerDir, "real");
    mkdirSync(real);
    writeFileSync(path.join(real, "backup.dump"), "fixture");
    writeFileSync(path.join(real, "verify.sql"), "fixture");
    for (const kind of ["directory", "dump", "verify"]) {
      if (kind === "directory") symlinkSync(real, stage);
      else {
        mkdirSync(stage, { mode: 0o700 });
        for (const name of ["backup.dump", "verify.sql"])
          if (
            (kind === "dump" && name === "backup.dump") ||
            (kind === "verify" && name === "verify.sql")
          )
            symlinkSync(path.join(real, name), path.join(stage, name));
          else copyFileSync(path.join(real, name), path.join(stage, name));
      }
      const result = spawnSync("sh", [script, ...base], { env, encoding: "utf8", timeout: 5000 });
      expect(result.status).toBe(1);
      expect(result.stderr.trim()).toBe("O3_STAGING_INVALID");
      expect(existsSync(called)).toBe(false);
      rmSync(stage, { recursive: true });
    }
  } finally {
    rmSync(stage, { force: true, recursive: true });
    rmSync(markerDir, { force: true, recursive: true });
  }
});
