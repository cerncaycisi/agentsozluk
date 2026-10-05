import { execFileSync, spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { compareBackupRestore } from "../../scripts/backup-restore/receipt";
import { requireTestDatabaseUrl } from "../../scripts/test-database-safety";

it("zorunlu yedek komutunun native zstd arşivini metadata ve sequence ile geri yükler", async () => {
  const base = new URL(requireTestDatabaseUrl(process.env.TEST_DATABASE_URL, "Backup format"));
  base.search = "";
  const suffix = randomBytes(6).toString("hex");
  const source = `backup_source_${suffix}_test`;
  const target = `backup_restore_${suffix}_test`;
  const owned = new Map<string, string>();
  const root = mkdtempSync(path.join(tmpdir(), "backup-format-"));
  const url = (name: string) => {
    const result = new URL(base);
    result.pathname = `/${name}`;
    return result.toString();
  };
  const sql = (name: string, query: string) =>
    execFileSync("psql", ["-XAtq", "-v", "ON_ERROR_STOP=1", "-d", url(name)], {
      input: query,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 15_000,
    }).trim();
  const oid = (name: string) =>
    sql("postgres", `SELECT oid FROM pg_database WHERE datname='${name}'`);
  const executable = (name: string, body: string) => {
    const file = path.join(root, name);
    writeFileSync(file, `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n`);
    chmodSync(file, 0o700);
  };
  const errors: unknown[] = [];
  try {
    for (const name of [source, target]) {
      expect(oid(name)).toBe("");
      sql("postgres", `CREATE DATABASE "${name}" TEMPLATE template0`);
      owned.set(name, oid(name));
    }
    sql(
      source,
      `CREATE TABLE probe (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      payload jsonb NOT NULL, amount numeric(12,3) NOT NULL, happened timestamptz NOT NULL,
      calendar date NOT NULL, elapsed interval NOT NULL, bytes_value bytea NOT NULL, price money NOT NULL, approximation double precision NOT NULL
    );
    INSERT INTO probe(payload, amount, happened, calendar, elapsed, bytes_value, price, approximation)
    SELECT jsonb_build_object('event','LEASE_HEARTBEAT','state','RUNNING',
      'run',md5(g::text),'note',repeat('sentetik Türkçe kayıt ',12)),
      g/7.0,'2026-10-04 00:00:00+00'::timestamptz+g*interval '1 second',
      date '2026-10-04'+(g%28),g*interval '2 minutes',decode(lpad(to_hex(g),8,'0'),'hex'),g::numeric::money,g::double precision/7
    FROM generate_series(1,1000) g;
    CREATE TABLE empty_probe (id bigserial PRIMARY KEY, note text);`,
    );
    // İki owned DB'de farklı render GUC'ları: actual producer +verify açık oturum
    // ayarları olmadan aynı typed verinin satır hash'i eşit olmaz. Global rol değişmez.
    sql("postgres", `ALTER DATABASE "${source}" SET DateStyle = 'German, DMY'`);
    sql("postgres", `ALTER DATABASE "${source}" SET IntervalStyle = 'sql_standard'`);
    sql("postgres", `ALTER DATABASE "${source}" SET bytea_output = 'escape'`);
    sql("postgres", `ALTER DATABASE "${target}" SET DateStyle = 'SQL, DMY'`);
    sql("postgres", `ALTER DATABASE "${target}" SET IntervalStyle = 'postgres_verbose'`);
    sql("postgres", `ALTER DATABASE "${target}" SET bytea_output = 'escape'`);
    sql("postgres", `ALTER DATABASE "${source}" SET timezone = 'Asia/Tokyo'`);
    sql("postgres", `ALTER DATABASE "${target}" SET timezone = 'America/New_York'`);
    sql("postgres", `ALTER DATABASE "${source}" SET extra_float_digits = -3`);
    sql("postgres", `ALTER DATABASE "${target}" SET extra_float_digits = 0`);
    const monetaryLocale = process.env.O3_TEST_MONETARY_LOCALE ?? "C.UTF-8";
    expect(monetaryLocale).toMatch(/^[a-zA-Z0-9_.@-]+$/u);
    sql("postgres", `ALTER DATABASE "${source}" SET lc_monetary = '${monetaryLocale}'`);
    sql("postgres", `ALTER DATABASE "${target}" SET lc_monetary = 'C'`);
    for (const setting of ["timezone", "extra_float_digits", "lc_monetary"])
      expect(sql(source, `SHOW ${setting}`)).not.toBe(sql(target, `SHOW ${setting}`));
    if (process.env.O3_TEST_MONETARY_LOCALE)
      expect(sql(source, "SELECT price::text FROM probe WHERE id = 1")).not.toBe(
        sql(target, "SELECT 1::numeric::money::text"),
      );
    sql(
      source,
      "CREATE FUNCTION public.hashtextextended(text,bigint) RETURNS bigint LANGUAGE sql IMMUTABLE AS 'SELECT 0::bigint'",
    );
    sql("postgres", `ALTER DATABASE "${source}" SET search_path = public,pg_catalog`);
    sql("postgres", `ALTER DATABASE "${target}" SET search_path = public,pg_catalog`);
    expect(sql(source, "SELECT hashtextextended('sentetik',0)")).toBe("0");
    expect(sql(source, "SELECT pg_catalog.hashtextextended('sentetik',0)")).not.toBe("0");
    // Aynı guard'lar; yalnız sabit lock dizini/host/Compose taşıması owned fixture'dadır.
    const producer = readFileSync("deploy/backup/uretim-yedek-komutu.sh", "utf8");
    expect(producer.match(/lock_dir="\/tmp\/agentsozluk-yedek-\$\{lock_uid\}"/gu)).toHaveLength(1);
    const producerScript = path.join(root, "producer.sh");
    writeFileSync(
      producerScript,
      producer.replace(
        'lock_dir="/tmp/agentsozluk-yedek-${lock_uid}"',
        `lock_dir="${root}/lock-directory"`,
      ),
      { mode: 0o700 },
    );
    executable("hostname", "echo agent-sozluk-prod");
    executable(
      "docker",
      `[[ "$1 $2 $4 $6 $7" == 'compose --env-file -f exec -T' ]] || exit 91
shift 7
while [[ "$1" == '-e' ]]; do export "$2"; shift 2; done
[[ "$1" == db ]] || exit 92
command_name="$2"; shift 2
case "$command_name" in psql|pg_dump) ;; *) exit 93 ;; esac
args=()
while (($#)); do
  case "$1" in
    -U) [[ "$2" == agent_sozluk ]] || exit 94; shift 2 ;;
    -d) [[ "$2" == agent_sozluk ]] || exit 95; args+=(-d "$BACKUP_PROBE_URL"); shift 2 ;;
    *) args+=("$1"); shift ;;
  esac
done
exec "$command_name" "\${args[@]}"`,
    );
    // Farklı UID/çalışma ve önceki sürümün backendleri aynı kaynak DB'de yaşarken
    // başarılı producer'ın EXIT temizliği yalnız kendi UID/PID application_name'ini kapatır.
    const foreignNames = ["agentsozluk-yedek", `agentsozluk-yedek-99999-${suffix}`];
    const foreignClients = foreignNames.map((name) =>
      spawn(
        "psql",
        ["-XAtq", "-v", "ON_ERROR_STOP=1", "-d", url(source), "-c", "SELECT pg_sleep(60)"],
        {
          env: { ...process.env, PGAPPNAME: name },
          stdio: "ignore",
        },
      ),
    );
    const foreignCount = () =>
      sql(
        source,
        `SELECT count(*) FROM pg_stat_activity WHERE datname='${source}' AND application_name IN ('${foreignNames.join("','")}') AND state='active'`,
      );
    let result: Awaited<ReturnType<typeof runOwnedProducer>>;
    try {
      const deadline = Date.now() + 5000;
      while (foreignCount() !== "2" && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 50));
      expect(foreignCount()).toBe("2");
      result = await runOwnedProducer(
        { ...process.env, PATH: `${root}:${process.env.PATH}`, BACKUP_PROBE_URL: url(source) },
        { script: producerScript, timeoutMs: 30_000 },
      );
      expect(result.status, result.stderr.toString()).toBe(0);
      expect(foreignCount()).toBe("2");
      expect(
        sql(
          source,
          `SELECT count(*) FROM pg_stat_activity WHERE datname='${source}' AND application_name LIKE 'agentsozluk-yedek-%' AND application_name NOT IN ('${foreignNames.join("','")}')`,
        ),
      ).toBe("0");
    } finally {
      // Yalnız bu fixture'ın yeni DB'sindeki iki sentetik application_name.
      sql(
        source,
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${source}' AND application_name IN ('${foreignNames.join("','")}')`,
      );
      for (const client of foreignClients) {
        if (client.exitCode === null && client.signalCode === null) client.kill("SIGTERM");
      }
    }
    expect(result.status, result.stderr.toString()).toBe(0);
    const metadata = result.stderr.toString();
    for (const marker of ["SNAPSHOT_OK", "DUMP_DONE", "META_DONE"])
      expect(metadata.split("\n").filter((line) => line === marker)).toHaveLength(1);
    const archive = path.join(root, "backup.dump");
    writeFileSync(archive, result.stdout, { mode: 0o600 });
    const toc = execFileSync("pg_restore", ["--list", archive], { encoding: "utf8" });
    expect(toc).toContain("Compression: zstd");
    expect(toc).toContain("Format: CUSTOM");

    sql(source, "ALTER TABLE probe ADD COLUMN t text DEFAULT 'same'");
    const aliasRejected = await runOwnedProducer(
      { ...process.env, PATH: `${root}:${process.env.PATH}`, BACKUP_PROBE_URL: url(source) },
      { script: producerScript, timeoutMs: 30_000 },
    );
    expect(aliasRejected.status).not.toBe(0);
    expect(aliasRejected.stderr.toString()).toContain("O3_AMBIGUOUS_ROW_ALIAS");
    expect(aliasRejected.stdout.length).toBe(0);
    sql(source, "ALTER TABLE probe DROP COLUMN t");

    // TOC okunabilen arşiv bile kesilmiş veri bloğu taşıyabilir; gece kapısı bunu bulmalı.
    const truncated = path.join(root, "truncated.dump");
    writeFileSync(truncated, result.stdout.subarray(0, Math.floor(result.stdout.length * 0.75)));
    expect(spawnSync("pg_restore", ["--list", truncated]).status).toBe(0);
    const decode = (file: string) =>
      spawnSync("pg_restore", ["--exit-on-error", "--file=/dev/null", file]);
    expect(decode(archive).status).toBe(0);
    expect(decode(truncated).status).not.toBe(0);
    execFileSync(
      "pg_restore",
      ["--exit-on-error", "--no-owner", "--no-privileges", "--dbname", url(target), archive],
      {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30_000,
        env: { ...process.env, PGOPTIONS: "-c lc_monetary=C" },
      },
    );
    expect(sql(target, "SELECT hashtextextended('sentetik',0)")).toBe("0");
    expect(sql(target, "SELECT pg_catalog.hashtextextended('sentetik',0)")).not.toBe("0");
    const verificationSql = readFileSync("scripts/backup-restore/verify.sql", "utf8");
    const verify = (expectedOid = owned.get(target)!, expectedName = target) =>
      execFileSync(
        "psql",
        [
          "-XAtq",
          "-d",
          url(target),
          "-v",
          `restore_database=${expectedName}`,
          "-v",
          `restore_oid=${expectedOid}`,
        ],
        {
          input: verificationSql,
          encoding: "utf8",
          stdio: ["pipe", "pipe", "pipe"],
          timeout: 15_000,
        },
      );
    const beforeSequence = sql(target, "SELECT last_value || '|' || is_called FROM probe_id_seq");
    expect(compareBackupRestore(metadata, verify())).toEqual({
      result: "O3_DATA_MATCH",
      scope: "public",
      serverVersion: sql(target, "SHOW server_version"),
      tables: 2,
      rows: "1000",
      sequences: 2,
    });
    expect(sql(target, "SELECT last_value || '|' || is_called FROM probe_id_seq")).toBe(
      beforeSequence,
    );
    expect(() => verify("0")).toThrow("O3_TARGET_MISMATCH");
    expect(() => verify(owned.get(target)!, "agent_sozluk")).toThrow("O3_TARGET_MISMATCH");
    sql(target, "ALTER TABLE probe ADD COLUMN t text DEFAULT 'same'");
    const aliasHash = () => sql(target, "SELECT sum(hashtextextended(t::text, 0)) FROM probe AS t");
    const beforeAlias = aliasHash();
    sql(target, "UPDATE probe SET amount = amount + 1 WHERE id = 1");
    expect(aliasHash()).toBe(beforeAlias);
    expect(() => verify()).toThrow("O3_AMBIGUOUS_ROW_ALIAS");
    sql(
      target,
      "ALTER TABLE probe DROP COLUMN t; CREATE SCHEMA other_data; CREATE TABLE other_data.extra (id int)",
    );
    expect(() => verify()).toThrow("O3_UNVERIFIED_SCHEMA");
    sql(target, "DROP SCHEMA other_data CASCADE; SELECT lo_create(0)");
    expect(() => verify()).toThrow("O3_UNSUPPORTED_LARGE_OBJECT");
    sql(
      target,
      "SELECT lo_unlink(oid) FROM pg_largeobject_metadata; UPDATE probe SET amount = amount - 1 WHERE id = 1",
    );
    expect(compareBackupRestore(metadata, verify()).result).toBe("O3_DATA_MATCH");
    expect(sql(target, "SELECT last_value || '|' || is_called FROM probe_id_seq")).toBe(
      beforeSequence,
    );

    // Aynı satır sayısıyla içerik bozulması gizlenemez.
    sql(target, "UPDATE probe SET payload = '{}' WHERE id = 1");
    expect(() => compareBackupRestore(metadata, verify())).toThrow("O3_TABLE_MISMATCH");
    sql(
      target,
      "DROP TABLE probe, empty_probe; DROP FUNCTION public.hashtextextended(text,bigint)",
    );
    execFileSync(
      "pg_restore",
      ["--exit-on-error", "--no-owner", "--no-privileges", "--dbname", url(target), archive],
      {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30_000,
        env: { ...process.env, PGOPTIONS: "-c lc_monetary=C" },
      },
    );
    expect(compareBackupRestore(metadata, verify()).result).toBe("O3_DATA_MATCH");
    sql(target, "DELETE FROM probe WHERE id = 1");
    expect(() => compareBackupRestore(metadata, verify())).toThrow("O3_TABLE_MISMATCH");

    // Test yalnız kendi küçük kopyasını yeniden yükler; gerçek operatör bunu otomatik yapmaz.
    sql(
      target,
      "DROP TABLE probe, empty_probe; DROP FUNCTION public.hashtextextended(text,bigint)",
    );
    execFileSync(
      "pg_restore",
      ["--exit-on-error", "--no-owner", "--no-privileges", "--dbname", url(target), archive],
      {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30_000,
        env: { ...process.env, PGOPTIONS: "-c lc_monetary=C" },
      },
    );
    expect(compareBackupRestore(metadata, verify()).result).toBe("O3_DATA_MATCH");
    sql(target, "SELECT setval('probe_id_seq', 1, false)");
    expect(() => compareBackupRestore(metadata, verify())).toThrow("O3_SEQUENCE_UNSAFE");
    sql(target, "SELECT setval('probe_id_seq', 1000, true)");
    expect(compareBackupRestore(metadata, verify()).sequences).toBe(2);
    sql(target, "ALTER SEQUENCE probe_id_seq CYCLE");
    expect(() => compareBackupRestore(metadata, verify())).toThrow("O3_SEQUENCE_UNSAFE");
    sql(target, "ALTER SEQUENCE probe_id_seq NO CYCLE");
    sql(target, "CREATE SEQUENCE stray");
    expect(() => compareBackupRestore(metadata, verify())).toThrow("O3_SEQUENCE_UNSAFE");
    sql(target, "DROP SEQUENCE stray; ALTER SEQUENCE probe_id_seq MAXVALUE 1000");
    expect(() => compareBackupRestore(metadata, verify())).toThrow("O3_SEQUENCE_UNSAFE");
  } catch (error) {
    errors.push(error);
  } finally {
    for (const [name, expectedOid] of owned) {
      try {
        expect(oid(name)).toBe(expectedOid);
        sql("postgres", `DROP DATABASE "${name}"`);
      } catch (error) {
        // Bilinmeyen OID'yi silme; diğer sahip olunan kopyanın temizliğini yine dene.
        errors.push(error);
      }
    }
    try {
      rmSync(root, { recursive: true, force: true });
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length)
    throw new AggregateError(errors, "Backup fixture doğrulaması/temizliği başarısız", {
      cause: errors[0],
    });
}, 90_000);

// Timeout yalnız kabuğu değil, bu testin ayrı süreç grubunu da kapatır.
function runOwnedProducer(
  env: NodeJS.ProcessEnv,
  options = { script: path.resolve("deploy/backup/uretim-yedek-komutu.sh"), timeoutMs: 30_000 },
) {
  return new Promise<{ status: number | null; stdout: Buffer; stderr: Buffer }>(
    (resolve, reject) => {
      const child = spawn("bash", [options.script], {
        env,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const stdout: Buffer[] = [],
        stderr: Buffer[] = [];
      let bytes = 0;
      let failure: Error | undefined;
      const kill = () => {
        if (child.pid) {
          try {
            process.kill(-child.pid, "SIGKILL");
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ESRCH")
              failure ??= new Error("BACKUP_TEST_CLEANUP_FAILED");
          }
        }
      };
      const timer = setTimeout(() => {
        failure = new Error("BACKUP_TEST_TIMEOUT");
        kill();
      }, options.timeoutMs);
      for (const [stream, chunks] of [
        [child.stdout, stdout],
        [child.stderr, stderr],
      ] as const) {
        stream.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 8 * 1024 * 1024) {
            failure = new Error("BACKUP_TEST_OUTPUT_LIMIT");
            kill();
          } else chunks.push(chunk);
        });
      }
      child.once("error", (error) => {
        failure = error;
        kill();
      });
      child.once("close", (status) => {
        clearTimeout(timer);
        kill();
        if (failure) reject(failure);
        else resolve({ status, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) });
      });
    },
  );
}

it("yedek testinin timeout'u kendi alt süreç grubunu da kapatır", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "backup-group-"));
  const script = path.join(root, "hang.sh");
  const childFile = path.join(root, "child.pid");
  writeFileSync(
    script,
    "trap '' TERM\nsleep 60 &\nprintf '%s\\n' \"$!\" > \"$BACKUP_CHILD_PID_FILE\"\nwait\n",
  );
  try {
    await expect(
      runOwnedProducer(
        { ...process.env, BACKUP_CHILD_PID_FILE: childFile },
        { script, timeoutMs: 3000 },
      ),
    ).rejects.toThrow("BACKUP_TEST_TIMEOUT");
    const childPid = readFileSync(childFile, "utf8").trim();
    expect(childPid).toMatch(/^[1-9][0-9]*$/u);
    // SIGKILL gönderimi ile scheduler'ın süreci terminalleştirmesi aynı an değildir.
    // Bütçe içinde Z/ENOENT ölçülür; canlı R/S durumu başarı sayılmaz.
    const deadline = Date.now() + 2000;
    let terminal = false;
    do {
      try {
        const stat = readFileSync(`/proc/${childPid}/stat`, "utf8");
        terminal = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[0] === "Z";
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        terminal = true;
      }
      if (!terminal) await new Promise((resolve) => setTimeout(resolve, 20));
    } while (!terminal && Date.now() < deadline);
    expect(terminal).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 10_000);
