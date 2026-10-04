import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { requireTestDatabaseUrl } from "../../scripts/test-database-safety";

it("zorunlu yedek komutunun native zstd arşivini metadata ve sequence ile geri yükler", () => {
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
      payload jsonb NOT NULL, amount numeric(12,3) NOT NULL, happened timestamptz NOT NULL
    );
    INSERT INTO probe(payload, amount, happened)
    SELECT jsonb_build_object('event','LEASE_HEARTBEAT','state','RUNNING',
      'run',md5(g::text),'note',repeat('sentetik Türkçe kayıt ',12)),
      g/7.0,'2026-10-04 00:00:00+00'::timestamptz+g*interval '1 second'
    FROM generate_series(1,1000) g;`,
    );
    // Üretim betiği değişmeden yürür; yalnız host ve Compose taşıması yereldir.
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
    const result = spawnSync("bash", [path.resolve("deploy/backup/uretim-yedek-komutu.sh")], {
      env: { ...process.env, PATH: `${root}:${process.env.PATH}`, BACKUP_PROBE_URL: url(source) },
      timeout: 30_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    expect(result.status, result.stderr.toString()).toBe(0);
    const metadata = result.stderr.toString();
    for (const marker of ["SNAPSHOT_OK", "DUMP_DONE", "META_DONE"])
      expect(metadata.split("\n").filter((line) => line === marker)).toHaveLength(1);
    const archive = path.join(root, "backup.dump");
    writeFileSync(archive, result.stdout, { mode: 0o600 });
    const toc = execFileSync("pg_restore", ["--list", archive], { encoding: "utf8" });
    expect(toc).toContain("Compression: zstd");
    expect(toc).toContain("Format: CUSTOM");

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
      { stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 },
    );
    const restored = sql(
      target,
      `SET timezone='UTC'; SET extra_float_digits=3;
      SELECT 'table|probe|'||count(*)::text||'|'||sum(hashtextextended(t::text,0))::text FROM probe t;`,
    );
    expect(restored).toMatch(/^table\|probe\|1000\|/u);
    expect(metadata.split("\n")).toContain(restored);
    expect(sql(target, "SELECT nextval('probe_id_seq')>(SELECT max(id) FROM probe)")).toBe("t");
  } finally {
    for (const [name, expectedOid] of owned) {
      expect(oid(name)).toBe(expectedOid);
      sql("postgres", `DROP DATABASE "${name}"`);
    }
    rmSync(root, { recursive: true, force: true });
  }
}, 90_000);
