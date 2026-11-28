import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
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
function sandbox(
  options: {
    meta?: string;
    restoreExit?: number;
    restoreDataExit?: number;
    sshExit?: number;
    notify?: string;
    driveUploadExit?: number;
    driveCheckExit?: number;
    driveLsfExit?: number;
    driveDuplicateName?: string;
    missingRclone?: boolean;
    host?: string | null;
    uploadTimeoutSec?: string;
    driveChunkSize?: string;
  } = {},
) {
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
  executable(
    path.join(bin, "pg_restore"),
    `
if [[ "$1" == --list ]]; then exit ${options.restoreExit ?? 0}; fi
[[ "$1 $2" == '--exit-on-error --file=/dev/null' ]] || exit 98
exit ${options.restoreDataExit ?? 0}`,
  );
  executable(
    path.join(bin, "timeout"),
    `printf '%s\\n' "$*" >> '${path.join(root, "timeout-calls")}'
exec /usr/bin/timeout "$@"`,
  );
  executable(path.join(root, "ping.sh"), `echo "$@" >> '${path.join(root, "pings")}'`);
  if (!options.missingRclone) {
    executable(
      path.join(bin, "rclone"),
      `
printf '%s\\n' "$*" >> '${path.join(root, "drive-calls")}'
operation="$1"
shift
include_pattern=""
while [[ "$#" -gt 0 ]]; do
  if [[ "$1" = --files-from-raw ]]; then
    shift
    cat "$1" >> '${path.join(root, "drive-files")}'
  elif [[ "$1" = --include ]]; then
    shift
    include_pattern="\${1#/}"
  fi
  shift
done
case "$operation" in
  copy) exit ${options.driveUploadExit ?? 0} ;;
  check) exit ${options.driveCheckExit ?? 0} ;;
  lsf)
    if [[ "${options.driveLsfExit ?? 0}" -ne 0 ]]; then
      exit ${options.driveLsfExit ?? 0}
    fi
    printf '%s\\n' "$include_pattern"
    if [[ -n '${options.driveDuplicateName ?? ""}' && ( '${options.driveDuplicateName ?? ""}' = '*' || "$include_pattern" = *'${options.driveDuplicateName ?? ""}'* ) ]]; then
      printf '%s\\n' "$include_pattern"
    fi
    exit 0 ;;
  *) exit 98 ;;
esac`,
    );
  }
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
        AGENTSOZLUK_RCLONE: path.join(bin, "rclone"),
        AGENTSOZLUK_BACKUP_MIN_FREE_BYTES: "1",
        ...(options.notify === undefined ? {} : { AGENTSOZLUK_BACKUP_NOTIFY: options.notify }),
        ...(options.uploadTimeoutSec === undefined
          ? {}
          : { AGENTSOZLUK_BACKUP_UPLOAD_TIMEOUT_SEC: options.uploadTimeoutSec }),
        ...(options.driveChunkSize === undefined
          ? {}
          : { AGENTSOZLUK_BACKUP_DRIVE_CHUNK_SIZE: options.driveChunkSize }),
        // Üretim hedefi depoda değil (17 Ekim 2026): testte örnek alan adı.
        ...(options.host === null
          ? {}
          : { AGENTSOZLUK_BACKUP_HOST: options.host ?? "deploy@uretim.example" }),
      },
    });
  return { root, backups, run };
}

describe("gecelik sunucu dışı yedek", () => {
  it("başarılı yedek Drive doğrulamasından sonra yerelden silinir ve eski kopyalara dokunmaz", () => {
    const { root, backups, run } = sandbox();
    mkdirSync(backups, { recursive: true });
    for (let day = 1; day <= 4; day += 1) {
      const stem = `agent-sozluk-202609${String(day).padStart(2, "0")}T010000Z`;
      for (const suffix of [".dump", ".dump.sha256", ".meta"])
        writeFileSync(path.join(backups, stem + suffix), "eski");
    }
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(
      /^DRIVE_OK file=agent-sozluk-\d{8}T\d{6}Z\.dump files=3 verified=check unique=1$/mu,
    );
    expect(result.stdout).toMatch(
      /^YEDEK_OK file=agent-sozluk-\d{8}T\d{6}Z\.dump bytes=11 tables=50 local=deleted drive=VERIFIED$/mu,
    );
    // YEREL KOPYA YOK: bu çalışmanın 3 dosyası silinir, eski 4 yerel kopya korunur.
    const dumps = readdirSync(backups)
      .filter((name) => /^agent-sozluk-\d{8}T\d{6}Z\.dump$/u.test(name))
      .sort();
    expect(dumps).toStrictEqual([
      "agent-sozluk-20260901T010000Z.dump",
      "agent-sozluk-20260902T010000Z.dump",
      "agent-sozluk-20260903T010000Z.dump",
      "agent-sozluk-20260904T010000Z.dump",
    ]);
    // Yalnız yedek anahtarı, sıkı host doğrulaması, uzak komut isteği sabit.
    const args = readFileSync(path.join(root, "ssh-args"), "utf8");
    expect(args).toContain("IdentitiesOnly=yes");
    expect(args).toContain("StrictHostKeyChecking=yes");
    expect(args).toContain("BatchMode=yes");
    expect(args).toContain(path.join(root, "key"));
    expect(args).toContain("deploy@uretim.example yedek");
  });

  it("Drive başarısızsa yeni yedeği 0600 olarak yerel kopyada tutar, kısmi dosya bırakmaz", () => {
    const { backups, run } = sandbox({ driveUploadExit: 1 });
    const result = run();
    expect(result.status, result.stderr).toBe(3);
    expect(result.stdout).toMatch(
      /^YEDEK_OK_YEREL file=agent-sozluk-\d{8}T\d{6}Z\.dump bytes=11 tables=50 local=kept drive=UPLOAD_FAILED$/mu,
    );
    const files = readdirSync(backups);
    expect(files.filter((name) => name.endsWith(".partial"))).toStrictEqual([]);
    const dump = files.find((name) => name.endsWith(".dump"))!;
    expect(statSync(path.join(backups, dump)).mode & 0o777).toBe(0o600);
    expect(readFileSync(path.join(backups, `${dump}.sha256`), "utf8")).toContain(dump);
    expect(files).toContain(dump.replace(/\.dump$/u, ".meta"));
  });

  // Depo herkese açık: üretim adresi betikte değil, ortamda ya da izlenmeyen ayar dosyasında.
  it("üretim hedefi yoksa indirmeden önce yüksek sesle düşer", () => {
    const { root, run } = sandbox({ host: null });
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("YEDEK_FAIL code=HOST_UNSET");
    expect(existsSync(path.join(root, "ssh-args"))).toBe(false);
    expect(readFileSync(path.join(root, "pings"), "utf8")).toContain("HOST_UNSET");
  });

  it("üretim hedefini ayar dosyasından okur, biçimsizini reddeder", () => {
    const { root, run } = sandbox({ host: null });
    mkdirSync(path.join(root, ".config", "agentsozluk-yedek"), { recursive: true });
    const file = path.join(root, ".config", "agentsozluk-yedek", "hedef");
    writeFileSync(file, "deploy@dosyadan.example\n");
    expect(run().status).toBe(0);
    expect(readFileSync(path.join(root, "ssh-args"), "utf8")).toContain("deploy@dosyadan.example");
    writeFileSync(file, "deploy@kotu adres; id\n");
    const bad = run();
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("YEDEK_FAIL code=HOST_INVALID");
  });

  it("eski ve biçim dışı yerel kopyalara Drive sonucu ne olursa olsun dokunmaz", () => {
    for (const driveUploadExit of [0, 1]) {
      const { backups, run } = sandbox({ driveUploadExit });
      mkdirSync(backups, { recursive: true });
      for (let day = 1; day <= 8; day += 1) {
        const name = `agent-sozluk-202609${String(day).padStart(2, "0")}T010000Z`;
        for (const suffix of [".dump", ".dump.sha256", ".meta"])
          writeFileSync(path.join(backups, `${name}${suffix}`), "eski");
      }
      writeFileSync(path.join(backups, "baska-dosya.dump"), "dokunulmaz");
      writeFileSync(path.join(backups, "agent-sozluk-1-manuelT1Z.dump"), "elle");
      const result = run();
      expect(result.status).toBe(driveUploadExit === 0 ? 0 : 3);
      const dumps = readdirSync(backups)
        .filter((name) => /^agent-sozluk-\d{8}T\d{6}Z\.dump$/u.test(name))
        .sort();
      expect(dumps).toHaveLength(driveUploadExit === 0 ? 8 : 9);
      expect(readdirSync(backups)).toContain("agent-sozluk-20260901T010000Z.meta");
      expect(readdirSync(backups)).toContain("baska-dosya.dump");
      expect(readdirSync(backups)).toContain("agent-sozluk-1-manuelT1Z.dump");
    }
  });

  it.each([
    ["başarı", {}, "VERIFIED", 5],
    ["yükleme hatası", { driveUploadExit: 1 }, "UPLOAD_FAILED", 1],
    ["kontrol hatası", { driveCheckExit: 1 }, "CHECK_FAILED", 2],
    ["mükerrer nesne", { driveDuplicateName: ".dump" }, "CHECK_FAILED", 5],
    ["lsf hatası", { driveLsfExit: 1 }, "CHECK_FAILED", 5],
    ["yükleme timeout", { driveUploadExit: 124 }, "UPLOAD_FAILED", 1],
    ["rclone yok", { missingRclone: true }, "SETUP_FAILED", 0],
  ] as const)(
    "Drive %s: üç dosyayla sınırlı, yerel kabul korunur",
    (_label, options, status, count) => {
      const { root, backups, run } = sandbox(options);
      mkdirSync(backups, { recursive: true });
      for (let day = 1; day <= 3; day += 1) {
        const stem = `agent-sozluk-202609${String(day).padStart(2, "0")}T010000Z`;
        for (const suffix of [".dump", ".dump.sha256", ".meta"])
          writeFileSync(path.join(backups, stem + suffix), "eski");
      }
      const result = run();
      // 17 Ekim (Astra bulgu 6) + 21 Ekim (YEREL KOPYA YOK + dup_ok):
      // Drive tam doğrulanmazsa yerel kopya korunur ve çıkış 3 döner.
      expect(result.status, result.stderr).toBe(status === "VERIFIED" ? 0 : 3);
      expect(result.stdout).toContain(`drive=${status}`);
      expect(result.stderr).not.toContain("YEDEK_FAIL");
      const pings = path.join(root, "pings");
      if (status === "VERIFIED") {
        expect(result.stdout).toMatch(/^YEDEK_OK file=\S+ .* local=deleted drive=VERIFIED$/mu);
        expect(result.stdout).toContain("unique=1");
        expect(existsSync(pings)).toBe(false);
      } else {
        if ("driveDuplicateName" in options || "driveLsfExit" in options) {
          expect(result.stderr).toContain("DRIVE_FAIL stage=unique");
        } else {
          expect(result.stderr).toContain("localBackupAccepted=true");
        }
        expect(result.stdout).toMatch(/^YEDEK_OK_YEREL file=\S+ .* local=kept drive=/mu);
        expect(result.stdout).not.toMatch(/^YEDEK_OK file=/mu);
        expect(readFileSync(pings, "utf8")).toContain(`Drive kopyası ${status}`);
      }
      const callFile = path.join(root, "drive-calls");
      const calls = existsSync(callFile) ? readFileSync(callFile, "utf8").trim().split("\n") : [];
      expect(calls).toHaveLength(count);
      if (count > 0) {
        expect(calls[0]).toContain("copy ");
        expect(calls[0]).toContain("--drive-chunk-size 32M");
        for (const call of calls) {
          expect(call).toContain("gdrive:agentic-server-yedekler/agentsozluk-backups");
          expect(call).not.toMatch(/(?:sync|delete|purge)/u);
        }
        if (count >= 2) {
          expect(calls[1]).toContain("--one-way");
          expect(calls[1]).toContain("--files-from-raw");
        }
        for (const lsfCall of calls.slice(2)) {
          expect(lsfCall).toMatch(/^lsf .* --files-only --include \//u);
        }
        const selected = readFileSync(path.join(root, "drive-files"), "utf8").trim().split("\n");
        const expectedManifestReads = count >= 2 ? 2 : 1;
        expect(selected).toHaveLength(3 * expectedManifestReads);
        const names = [...new Set(selected)];
        expect(names).toHaveLength(3);
        expect(
          names.every(
            (name) =>
              !name.includes("/") &&
              /^agent-sozluk-\d{8}T\d{6}Z\.(?:dump(?:\.sha256)?|meta)$/u.test(name),
          ),
        ).toBe(true);
        if (status === "VERIFIED") {
          expect(names.every((name) => !existsSync(path.join(backups, name)))).toBe(true);
        } else {
          expect(names.every((name) => existsSync(path.join(backups, name)))).toBe(true);
        }
      }
      expect(
        readdirSync(backups).filter((name) => /^agent-sozluk-\d{8}T\d{6}Z\.dump$/u.test(name)),
      ).toHaveLength(status === "VERIFIED" ? 3 : 4);
      expect(readdirSync(backups).some((name) => name.startsWith(".drive-files."))).toBe(false);
    },
  );

  it("Drive upload timeout ve chunk boyutunu varsayılan 2700s/32M ve özel değerle geçirir", () => {
    const def = sandbox();
    expect(def.run().status).toBe(0);
    const defaultTimeouts = readFileSync(path.join(def.root, "timeout-calls"), "utf8");
    expect(defaultTimeouts).toMatch(/--kill-after=15 2700 .*rclone copy /u);
    expect(readFileSync(path.join(def.root, "drive-calls"), "utf8")).toContain(
      "--drive-chunk-size 32M",
    );

    const custom = sandbox({ uploadTimeoutSec: "3600", driveChunkSize: "64M" });
    expect(custom.run().status).toBe(0);
    const customTimeouts = readFileSync(path.join(custom.root, "timeout-calls"), "utf8");
    expect(customTimeouts).toMatch(/--kill-after=15 3600 .*rclone copy /u);
    expect(readFileSync(path.join(custom.root, "drive-calls"), "utf8")).toContain(
      "--drive-chunk-size 64M",
    );
  });

  it.each(["0", "-5", "abc", "3601", "9999", "9999999999999999999999"])(
    "geçersiz upload timeout indirmeden önce reddedilir: %s",
    (uploadTimeoutSec) => {
      const { root, run } = sandbox({ uploadTimeoutSec });
      const result = run();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("YEDEK_FAIL code=UPLOAD_TIMEOUT_INVALID");
      expect(existsSync(path.join(root, "ssh-args"))).toBe(false);
      expect(readFileSync(path.join(root, "pings"), "utf8")).toContain("UPLOAD_TIMEOUT_INVALID");
    },
  );

  it.each(["1M", "4M", "256M", "32G", "bad", "32m"])(
    "geçersiz Drive chunk boyutu indirmeden önce reddedilir: %s",
    (driveChunkSize) => {
      const { root, run } = sandbox({ driveChunkSize });
      const result = run();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("YEDEK_FAIL code=DRIVE_CHUNK_SIZE_INVALID");
      expect(existsSync(path.join(root, "ssh-args"))).toBe(false);
      expect(readFileSync(path.join(root, "pings"), "utf8")).toContain("DRIVE_CHUNK_SIZE_INVALID");
    },
  );

  it("Drive doğrulandıktan sonra yerel temizlik başarısızsa YEDEK_TEMIZLIK_FAIL + çıkış 3 verir", () => {
    const { root, backups, run } = sandbox();
    executable(
      path.join(root, "bin", "rm"),
      `for arg in "$@"; do
  case "$arg" in
    */agent-sozluk-*.dump) exit 1 ;;
  esac
done
exec /bin/rm "$@"`,
    );
    const result = run();
    expect(result.status).toBe(3);
    expect(result.stdout).toMatch(
      /^YEDEK_TEMIZLIK_FAIL file=agent-sozluk-\d{8}T\d{6}Z\.dump bytes=11 tables=50 drive=VERIFIED$/mu,
    );
    expect(result.stdout).not.toMatch(/^YEDEK_OK /mu);
    expect(readFileSync(path.join(root, "pings"), "utf8")).toContain("yerel temizlik başarısız");
    expect(
      readdirSync(backups).filter((name) => /^agent-sozluk-\d{8}T\d{6}Z\.dump$/u.test(name)),
    ).toHaveLength(1);
  });

  it("bildirim gönderilemezse sessiz kalmaz; çıkış kodu değişmez", () => {
    const { root, run } = sandbox({ driveUploadExit: 1 });
    writeFileSync(path.join(root, "ping.sh"), "#!/usr/bin/env bash\nexit 7\n");
    chmodSync(path.join(root, "ping.sh"), 0o755);
    const result = run();
    expect(result.status).toBe(3);
    expect(result.stderr).toContain("YEDEK_NOTIFY_FAIL exit=7");
    const failed = sandbox({ sshExit: 255 });
    writeFileSync(path.join(failed.root, "ping.sh"), "#!/usr/bin/env bash\nexit 7\n");
    chmodSync(path.join(failed.root, "ping.sh"), 0o755);
    const hata = failed.run();
    expect(hata.status).toBe(1);
    expect(hata.stderr).toContain("YEDEK_FAIL code=SSH_OR_DUMP");
    expect(hata.stderr).toContain("YEDEK_NOTIFY_FAIL exit=7");
  });

  it("yerel yedek reddedilirse Drive'a kopyalamaz", () => {
    const { root, run } = sandbox({ sshExit: 255 });
    expect(run().status).toBe(1);
    expect(existsSync(path.join(root, "drive-calls"))).toBe(false);
  });

  it.each([
    ["eksik işaret", { meta: "SNAPSHOT_OK\nDUMP_DONE" }, "MARKER_MISSING_META_DONE"],
    ["az tablo", { meta: "SNAPSHOT_OK\nDUMP_DONE\ntable|a|1|0\nMETA_DONE" }, "TABLES_TOO_FEW"],
    ["okunamayan arşiv", { restoreExit: 1 }, "ARCHIVE_UNREADABLE"],
    ["TOC geçer ama veri/codec çözülmez", { restoreDataExit: 1 }, "ARCHIVE_DATA_UNREADABLE"],
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

  it("saat geri alınsa da önceki gelecek tarihli kopyaları korur", () => {
    const { backups, run } = sandbox();
    mkdirSync(backups, { recursive: true });
    for (let day = 1; day <= 3; day += 1)
      writeFileSync(
        path.join(backups, `agent-sozluk-209901${String(day).padStart(2, "0")}T010000Z.dump`),
        "gelecek",
      );
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("local=deleted drive=VERIFIED");
    const dumps = readdirSync(backups)
      .filter((name) => /^agent-sozluk-\d{8}T\d{6}Z\.dump$/u.test(name))
      .sort();
    expect(dumps).toStrictEqual([
      "agent-sozluk-20990101T010000Z.dump",
      "agent-sozluk-20990102T010000Z.dump",
      "agent-sozluk-20990103T010000Z.dump",
    ]);
  });

  it.each([
    ["komut hatası", "exit 1", "DUMP_SIZE_UNREADABLE"],
    ["geçersiz çıktı", "echo belirsiz", "DUMP_SIZE_INVALID"],
  ])("stat %s: başarı yazmadan durur ve önceki yedeği korur", (_label, body, code) => {
    const { root, backups, run } = sandbox();
    mkdirSync(backups, { recursive: true });
    const previous = "agent-sozluk-20260901T010000Z.dump";
    writeFileSync(path.join(backups, previous), "onceki");
    executable(path.join(root, "bin", "stat"), body);
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`YEDEK_FAIL code=${code}`);
    expect(result.stdout).not.toContain("YEDEK_OK");
    expect(readdirSync(backups).filter((name) => name !== ".lock")).toEqual([previous]);
    expect(readFileSync(path.join(root, "pings"), "utf8")).toContain(code);
  });

  it("tek seferlik sessiz işletimde dış bildirim çalıştırmadan hata verir", () => {
    const { root, run } = sandbox({ sshExit: 255, notify: "0" });
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("YEDEK_FAIL code=SSH_OR_DUMP");
    expect(existsSync(path.join(root, "pings"))).toBe(false);
  });

  it("belirsiz bildirim ayarını indirmeden önce reddeder", () => {
    const { root, run } = sandbox({ notify: "maybe" });
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("YEDEK_FAIL code=NOTIFY_INVALID");
    expect(existsSync(path.join(root, "ssh-args"))).toBe(false);
    expect(readFileSync(path.join(root, "pings"), "utf8")).toContain("NOTIFY_INVALID");
  });

  it.each(["printf ''", "echo eksik-hash"])(
    "boş/geçersiz checksum ile yedeği yayımlamaz: %s",
    (body) => {
      const { root, backups, run } = sandbox();
      mkdirSync(backups, { recursive: true });
      const previous = "agent-sozluk-20260901T010000Z.dump";
      writeFileSync(path.join(backups, previous), "onceki");
      executable(path.join(root, "bin", "sha256sum"), body);
      const result = run();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("YEDEK_FAIL code=CHECKSUM_INVALID");
      expect(result.stdout).not.toContain("YEDEK_OK");
      expect(readdirSync(backups).filter((name) => name !== ".lock")).toEqual([previous]);
    },
  );

  it("ERR yakalayıcısı alt kabuklara geçmez (çifte FAIL/OK yok)", () => {
    const script = readFileSync(nightly, "utf8");
    expect(script).toMatch(/^set -euo pipefail$/mu);
    expect(script).not.toMatch(/^set -E/mu);
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
    expect(remote).toMatch(/--no-privileges --compress=zstd:3 <\/dev\/null/u);
    // Yorumlar hariç kod: istemcinin istediği komut hiçbir biçimde kullanılmaz, dosya yazılmaz.
    const code = remote
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("#"))
      .join("\n");
    expect(code).not.toMatch(/SSH_ORIGINAL_COMMAND|\beval\b/u);
    // Yazılan tek dosya veri içermeyen tek-çalışma kilidi.
    expect(code).toContain("exec 9>>lock");
    expect(code).toContain("umask 077");
    expect(code).toContain("lock_invalid");
    expect(code).not.toContain(">/tmp/agentsozluk-yedek.lock");
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
    // İstemci okumayı bırakırsa bloklanan dump ve sayım da süreyle sınırlı (Astra 2. tur P1).
    expect(remote).toMatch(
      /timeout --kill-after=30 "\$LIMIT_S" "\$\{compose\[@\]\}" exec [^\n]*db pg_dump/u,
    );
    expect(remote).toMatch(/timeout --kill-after=30 600 "\$\{compose\[@\]\}" exec/u);
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
    const script = path.join(root, "producer.sh");
    expect(
      remote.match(/lock_dir="\/opt\/agent-sozluk\/scripts\/\.agentsozluk-yedek-\$\{lock_uid\}"/gu),
    ).toHaveLength(1);
    writeFileSync(
      script,
      remote.replace(
        'lock_dir="/opt/agent-sozluk/scripts/.agentsozluk-yedek-${lock_uid}"',
        `lock_dir="${root}/lock-directory"`,
      ),
      { mode: 0o700 },
    );
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

  it("üretim kilidinde symlink, hardlink ve açık dizin reddedilir; sentinel değişmez", () => {
    const root = mkdtempSync(path.join(tmpdir(), "yedek-lock-"));
    roots.push(root);
    const bin = path.join(root, "bin");
    mkdirSync(bin);
    executable(path.join(bin, "hostname"), "echo agent-sozluk-prod");
    executable(path.join(bin, "docker"), "echo UNEXPECTED_DATABASE_ACCESS >&2; exit 98");
    const dir = path.join(root, "lock-directory");
    const script = path.join(root, "producer.sh");
    writeFileSync(
      script,
      remote.replace(
        'lock_dir="/opt/agent-sozluk/scripts/.agentsozluk-yedek-${lock_uid}"',
        `lock_dir="${dir}"`,
      ),
      { mode: 0o700 },
    );
    const sentinel = path.join(root, "sentinel");
    writeFileSync(sentinel, "korunacak veri");
    const reject = () => {
      const result = spawnSync("bash", [script], {
        encoding: "utf8",
        env: { NODE_ENV: "test", PATH: `${bin}:/usr/bin:/bin` },
        timeout: 5000,
      });
      expect(result.status).toBe(76);
      expect(result.stderr).toContain("YEDEK_LOCK_UNSAFE");
      expect(result.stderr).not.toContain("UNEXPECTED_DATABASE_ACCESS");
      expect(readFileSync(sentinel, "utf8")).toBe("korunacak veri");
    };
    symlinkSync(root, dir);
    reject();
    rmSync(dir);
    mkdirSync(dir, { mode: 0o755 });
    reject();
    chmodSync(dir, 0o700);
    symlinkSync(sentinel, path.join(dir, "lock"));
    reject();
    rmSync(path.join(dir, "lock"));
    execFileSync("ln", [sentinel, path.join(dir, "lock")]);
    chmodSync(sentinel, 0o600);
    reject();
  });

  it("zamanlayıcı gecelik ve kaçırılanı telafi eder", () => {
    expect(timer).toMatch(/^OnCalendar=\*-\*-\* 04:30:00 Europe\/Istanbul$/mu);
    expect(timer).toMatch(/^Persistent=true$/mu);
    expect(service).toMatch(/^Type=oneshot$/mu);
    expect(service).toMatch(
      /^ExecStart=%h\/\.local\/share\/agentsozluk-yedek\/gecelik-yedek\.sh$/mu,
    );
  });

  it("birim TimeoutStartSec değeri betiğin en kötü durum aşama bütçesinden büyüktür", () => {
    const unitMatch = service.match(/^TimeoutStartSec=(\d+)min$/mu);
    expect(unitMatch).not.toBeNull();
    const serviceTimeoutSeconds = Number(unitMatch![1]) * 60;

    const script = readFileSync(nightly, "utf8");
    const sshMatch = script.match(/timeout (\d+) ssh\b/u);
    const restoreMatch = script.match(/timeout --kill-after=(\d+) (\d+) "\$PG_RESTORE"/u);
    const uploadMaxMatch = script.match(/UPLOAD_TIMEOUT <= (\d+)/u);
    const uploadKillMatch = script.match(/timeout --kill-after=(\d+) "\$UPLOAD_TIMEOUT"/u);
    const checkMatch = script.match(/timeout --kill-after=(\d+) (\d+) "\$rclone_bin" check/u);
    const lsfMatch = script.match(/timeout --kill-after=(\d+) (\d+) "\$rclone_bin" lsf/u);

    expect(sshMatch).not.toBeNull();
    expect(restoreMatch).not.toBeNull();
    expect(uploadMaxMatch).not.toBeNull();
    expect(uploadKillMatch).not.toBeNull();
    expect(checkMatch).not.toBeNull();
    expect(lsfMatch).not.toBeNull();

    const worstCaseSeconds =
      Number(sshMatch![1]) +
      Number(restoreMatch![1]) +
      Number(restoreMatch![2]) +
      Number(uploadKillMatch![1]) +
      Number(uploadMaxMatch![1]) +
      Number(checkMatch![1]) +
      Number(checkMatch![2]) +
      3 * (Number(lsfMatch![1]) + Number(lsfMatch![2]));

    expect(worstCaseSeconds).toBeLessThan(serviceTimeoutSeconds);
  });
});
