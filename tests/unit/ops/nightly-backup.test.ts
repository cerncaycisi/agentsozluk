import { spawnSync } from "node:child_process";
import {
  chmodSync,
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
    expect(run().status).toBe(0);
    const dumps = readdirSync(backups)
      .filter((name) => /^agent-sozluk-\d{8}T\d{6}Z\.dump$/u.test(name))
      .sort();
    expect(dumps).toHaveLength(7);
    expect(dumps[0]).toBe("agent-sozluk-20260903T010000Z.dump");
    expect(readdirSync(backups)).not.toContain("agent-sozluk-20260901T010000Z.meta");
    expect(readdirSync(backups)).toContain("baska-dosya.dump");
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
    expect(readdirSync(backups).sort()).toStrictEqual(["agent-sozluk-20260901T010000Z.dump"]);
    expect(readFileSync(path.join(root, "pings"), "utf8")).toContain(code);
  });

  it("üretim komutu yalnız okur ve her exec'in stdin'ini ayrı bağlar", () => {
    expect(remote).toContain('test "$(hostname)" = agent-sozluk-prod');
    expect(remote).toContain("REPEATABLE READ READ ONLY");
    expect(remote).toMatch(/pg_dump [^\n]*--snapshot="\$snapshot"/u);
    expect(remote).toMatch(/--no-privileges <\/dev\/null/u);
    // Yorumlar hariç kod: istemcinin istediği komut hiçbir biçimde kullanılmaz, dosya yazılmaz.
    const code = remote
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("#"))
      .join("\n");
    expect(code).not.toMatch(/SSH_ORIGINAL_COMMAND|\beval\b/u);
    expect(code).not.toMatch(/>\s*\/(opt|var|tmp|home)/u);
  });

  it("zamanlayıcı gecelik ve kaçırılanı telafi eder", () => {
    expect(timer).toMatch(/^OnCalendar=\*-\*-\* 04:30:00 Europe\/Istanbul$/mu);
    expect(timer).toMatch(/^Persistent=true$/mu);
    expect(service).toMatch(/^Type=oneshot$/mu);
    expect(service).toMatch(
      /^ExecStart=%h\/\.local\/share\/agentsozluk-yedek\/gecelik-yedek\.sh$/mu,
    );
  });
});
