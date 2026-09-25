import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const nightly = path.resolve("deploy/backup/gecelik-yedek.sh");
const remote = readFileSync(path.resolve("deploy/backup/uretim-yedek-komutu.sh"), "utf8");
const service = readFileSync(path.resolve("deploy/backup/agentsozluk-yedek.service"), "utf8");
const timer = readFileSync(path.resolve("deploy/backup/agentsozluk-yedek.timer"), "utf8");

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function executable(file: string, body: string) {
  writeFileSync(file, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(file, 0o755);
}

/** Sahte ssh (üretim komutunu taklit eder), sahte pg_restore ve sahte ping ile sandbox. */
function sandbox(options: { meta?: string; restoreExit?: number; sshExit?: number } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "yedek-"));
  roots.push(root);
  const bin = path.join(root, "bin");
  const backups = path.join(root, "backups");
  mkdirSync(bin);
  const tables = Array.from({ length: 50 }, (_, index) => `table|t${index}|1|0`).join("\n");
  const meta = options.meta ?? `SNAPSHOT_OK\nDUMP_DONE\nserver_version|16.14\n${tables}\nMETA_DONE`;
  writeFileSync(path.join(root, "meta.txt"), `${meta}\n`);
  executable(
    path.join(bin, "ssh"),
    `printf 'PGDMP-sahte'; cat '${path.join(root, "meta.txt")}' >&2; echo "$@" > '${path.join(root, "ssh-args")}'; exit ${options.sshExit ?? 0}`,
  );
  executable(path.join(bin, "pg_restore"), `exit ${options.restoreExit ?? 0}`);
  executable(path.join(root, "ping.sh"), `echo "$@" >> '${path.join(root, "pings")}'`);
  const run = () =>
    spawnSync("bash", [nightly], {
      encoding: "utf8",
      env: {
        NODE_ENV: "test",
        PATH: `${bin}:/usr/bin:/bin`,
        HOME: root,
        AGENTSOZLUK_BACKUP_DIR: backups,
        AGENTSOZLUK_BACKUP_KEY: path.join(root, "key"),
        AGENTSOZLUK_KNOWN_HOSTS: path.join(root, "known_hosts"),
        AGENTSOZLUK_PG_RESTORE: path.join(bin, "pg_restore"),
        AGENTSOZLUK_BACKUP_MIN_FREE_BYTES: "1",
      },
    });
  return { root, backups, run };
}

describe("gecelik sunucu dışı yedek", () => {
  it("başarılı yedeği 0600 olarak kalıcı adına taşır, kısmi dosya bırakmaz", () => {
    const { root, backups, run } = sandbox();
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(
      /^YEDEK_OK file=agent-sozluk-\d{8}T\d{6}Z\.dump bytes=\d+ tables=50/mu,
    );
    const files = readdirSync(backups);
    expect(files.filter((name) => name.endsWith(".partial"))).toStrictEqual([]);
    const dump = files.find((name) => name.endsWith(".dump"))!;
    expect(statSync(path.join(backups, dump)).mode & 0o777).toBe(0o600);
    expect(readFileSync(path.join(backups, `${dump}.sha256`), "utf8")).toContain(dump);
    // Yalnız yedek anahtarı, sıkı host doğrulaması, uzak komut isteği sabit.
    const args = readFileSync(path.join(root, "ssh-args"), "utf8");
    expect(args).toContain("IdentitiesOnly=yes");
    expect(args).toContain("StrictHostKeyChecking=yes");
    expect(args).toContain("BatchMode=yes");
    expect(args).toContain(path.join(root, "key"));
  });

  it("son 7 kopyayı tutar, en eskileri siler", () => {
    const { backups, run } = sandbox();
    mkdirSync(backups, { recursive: true });
    for (let day = 1; day <= 8; day += 1) {
      const name = `agent-sozluk-202609${String(day).padStart(2, "0")}T010000Z`;
      for (const suffix of [".dump", ".dump.sha256", ".meta"])
        writeFileSync(path.join(backups, `${name}${suffix}`), "eski");
    }
    writeFileSync(path.join(backups, "baska-dosya.dump"), "dokunulmaz");
    // Biçime uymayan ad (ör. elle korunmuş kopya) döndürmeye girmez (Astra P2).
    writeFileSync(path.join(backups, "agent-sozluk-1-manuelT1Z.dump"), "elle");
    expect(run().status).toBe(0);
    const dumps = readdirSync(backups)
      .filter((name) => /^agent-sozluk-\d{8}T\d{6}Z\.dump$/u.test(name))
      .sort();
    expect(dumps).toHaveLength(7);
    expect(dumps[0]).toBe("agent-sozluk-20260903T010000Z.dump");
    expect(readdirSync(backups)).not.toContain("agent-sozluk-20260901T010000Z.meta");
    expect(readdirSync(backups)).toContain("baska-dosya.dump");
    expect(readdirSync(backups)).toContain("agent-sozluk-1-manuelT1Z.dump");
  });

  it.each([
    ["eksik işaret", { meta: "SNAPSHOT_OK\nDUMP_DONE" }, "MARKER_MISSING_META_DONE"],
    ["az tablo", { meta: "SNAPSHOT_OK\nDUMP_DONE\ntable|a|1|0\nMETA_DONE" }, "TABLES_TOO_FEW"],
    ["okunamayan arşiv", { restoreExit: 1 }, "ARCHIVE_UNREADABLE"],
    ["ssh hatası", { sshExit: 255 }, "SSH_OR_DUMP"],
  ])("%s: hata verir, bildirim dener, önceki kopyaya dokunmaz", (_label, options, code) => {
    const { root, backups, run } = sandbox(options);
    mkdirSync(backups, { recursive: true });
    writeFileSync(path.join(backups, "agent-sozluk-20260901T010000Z.dump"), "onceki");
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`YEDEK_FAIL code=${code}`);
    // Kalıcı tek-çalışma kilidi dışında hiçbir geçici/yan dosya kalmaz.
    expect(
      readdirSync(backups)
        .filter((name) => name !== ".lock")
        .sort(),
    ).toStrictEqual(["agent-sozluk-20260901T010000Z.dump"]);
    expect(readFileSync(path.join(root, "pings"), "utf8")).toContain(code);
  });

  it("kilit başka çalışmadayken durur, var olan kopyaya dokunmaz", () => {
    const { backups, run } = sandbox();
    mkdirSync(backups, { recursive: true });
    writeFileSync(path.join(backups, "agent-sozluk-20260901T010000Z.dump"), "onceki");
    const lock = path.join(backups, ".lock");
    // Kilidi tutan ayrı süreç; hazır olduğunu işaret dosyasıyla bildirir.
    const ready = path.join(backups, "..", "hazir");
    const holder = spawn("flock", [lock, "bash", "-c", `touch '${ready}'; sleep 20`], {
      stdio: "ignore",
    });
    try {
      const deadline = Date.now() + 10_000;
      while (!existsSync(ready) && Date.now() < deadline) spawnSync("sleep", ["0.05"]);
      expect(existsSync(ready)).toBe(true);
      const result = run();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("YEDEK_FAIL code=BUSY");
      expect(readdirSync(backups).filter((name) => !name.startsWith("."))).toStrictEqual([
        "agent-sozluk-20260901T010000Z.dump",
      ]);
    } finally {
      holder.kill("SIGKILL");
    }
  });

  it("dizin kurulamazsa hata yolundan geçer ve bildirim dener", () => {
    const { root, backups, run } = sandbox();
    writeFileSync(backups, "dizin değil, dosya");
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("YEDEK_FAIL code=DIR_UNAVAILABLE");
    expect(readFileSync(path.join(root, "pings"), "utf8")).toContain("DIR_UNAVAILABLE");
  });

  it("üretim komutu yalnız okur ve her exec'in stdin'ini ayrı bağlar", () => {
    expect(remote).toContain('test "$(hostname)" = agent-sozluk-prod');
    expect(remote).toContain("REPEATABLE READ READ ONLY");
    expect(remote).toMatch(/pg_dump [^\n]*\n?[^\n]*--snapshot="\$snapshot"/u);
    expect(remote).toMatch(/--no-privileges <\/dev\/null/u);
    // Yorumlar hariç kod: istemcinin istediği komut hiçbir biçimde kullanılmaz, dosya yazılmaz.
    const code = remote
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("#"))
      .join("\n");
    expect(code).not.toMatch(/SSH_ORIGINAL_COMMAND|\beval\b/u);
    // Yazılan tek dosya veri içermeyen tek-çalışma kilidi.
    expect(code.match(/>\s*\/(opt|var|tmp|home)\S*/gu)).toStrictEqual([
      ">/tmp/agentsozluk-yedek.lock",
    ]);
  });

  it("üretim komutu tek çalışır, süre sınırı ve bekçi oturumları kapatır", () => {
    expect(remote).toMatch(/flock -n 9 \|\| \{ echo "YEDEK_BUSY" >&2; exit 75; \}/u);
    expect(remote).toContain("idle_in_transaction_session_timeout=${LIMIT_S}s");
    expect(remote).toContain("pg_terminate_backend(pid)");
    expect(remote).toContain("application_name = '$APP'");
    expect(remote).toMatch(/^trap '.*terminate_backup_sessions' EXIT$/mu);
    // Bekçi kilidi ve SSH akışını devralmaz.
    expect(remote).toMatch(/\(\n\s+exec 9>&-\n\s+sleep "\$LIMIT_S" 8>&-/u);
    // Coprocess PID'i hemen saklanır; `HOLDER_PID` yeniden okunmaz (Astra: 250'de 10 düşüş).
    expect(remote).toContain("holder_pid=$HOLDER_PID");
    expect(remote).toContain('wait "$holder_pid"');
    expect(remote.match(/HOLDER_PID/gu)).toHaveLength(2);
  });

  it("üretim komutu sahte docker ile 50 koşuda da tamamlanır (coprocess yarışı)", () => {
    const root = mkdtempSync(path.join(tmpdir(), "yedek-uzak-"));
    roots.push(root);
    const bin = path.join(root, "bin");
    mkdirSync(bin);
    executable(path.join(bin, "hostname"), "echo agent-sozluk-prod");
    executable(
      path.join(bin, "docker"),
      [
        'args="$*"',
        'case "$args" in',
        "  *pg_terminate_backend*) exit 0 ;;",
        "  *pg_dump*) printf PGDMP; exit 0 ;;",
        "  *\"-F |\"*) cat >/dev/null; printf 'server_version|16.14\\ntable|a|1|0\\n'; exit 0 ;;",
        '  *psql*) while IFS= read -r line; do case "$line" in *pg_export_snapshot*) echo 00000003-00000002-1 ;; esac; done; exit 0 ;;',
        "esac",
        "exit 9",
      ].join("\n"),
    );
    const script = path.resolve("deploy/backup/uretim-yedek-komutu.sh");
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const result = spawnSync("bash", [script], {
        encoding: "utf8",
        env: { NODE_ENV: "test", PATH: `${bin}:/usr/bin:/bin` },
        timeout: 20_000,
      });
      expect(result.status, `${attempt}: ${result.stderr}`).toBe(0);
      expect(result.stdout).toBe("PGDMP");
      expect(result.stderr).toMatch(/SNAPSHOT_OK\n[\s\S]*DUMP_DONE\n[\s\S]*META_DONE\n$/u);
    }
  }, 120_000);

  it("zamanlayıcı gecelik ve kaçırılanı telafi eder", () => {
    expect(timer).toMatch(/^OnCalendar=\*-\*-\* 04:30:00 Europe\/Istanbul$/mu);
    expect(timer).toMatch(/^Persistent=true$/mu);
    expect(service).toMatch(/^Type=oneshot$/mu);
    expect(service).toMatch(
      /^ExecStart=%h\/\.local\/share\/agentsozluk-yedek\/gecelik-yedek\.sh$/mu,
    );
  });
});
