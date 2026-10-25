import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
  İşletim körlüğü (17 Ekim 2026; Astra bulgu 5 ve 9, Fable P1-1). Sunucu içi yedek birimi depoya
  alındı; her oneshot birim başarısızlığını ortak bildirim birimine bağlar; bildirim birimi
  alarmla aynı yoldan gider ve kendisi OnFailure taşımaz (döngü).
*/

const root = process.cwd();
const systemdDir = path.join(root, "deploy/systemd");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

function section(unit: string, name: string): string {
  const parts = unit.split(/^\[(\w+)\]$/mu);
  return parts[parts.indexOf(name) + 1] ?? "";
}

const units = readdirSync(systemdDir).filter((name) => name.endsWith(".service"));
const oneshots = units.filter(
  (name) =>
    !name.includes("@") &&
    /^Type=oneshot$/mu.test(section(read(`deploy/systemd/${name}`), "Service")),
);

describe("OnFailure bildirimi", () => {
  it("beklenen bütün oneshot birimler listede", () => {
    for (const name of [
      "agent-sozluk-alarm.service",
      "agent-sozluk-backup.service",
      "agent-sozluk-ilgili.service",
      "agent-sozluk-indexnow.service",
      "agent-sozluk-karagoz.service",
      "agent-sozluk-maintenance.service",
      "agent-sozluk-sayac.service",
      "agent-sozluk.service",
    ])
      expect(oneshots).toContain(name);
  });

  it.each(oneshots)("%s başarısızlığını ortak bildirim birimine bağlar", (name) => {
    const unit = section(read(`deploy/systemd/${name}`), "Unit");
    expect(unit).toMatch(/^OnFailure=agent-sozluk-bildirim@%n\.service$/mu);
  });

  it("bildirim birimi alarmın yolunu kullanır, OnFailure taşımaz ve ağ dışında yetki istemez", () => {
    const unit = read("deploy/systemd/agent-sozluk-bildirim@.service");
    expect(unit).not.toMatch(/^OnFailure=/mu);
    const service = section(unit, "Service");
    expect(service).toMatch(/^Type=oneshot$/mu);
    expect(service).toMatch(/^User=deploy$/mu);
    expect(service).toMatch(
      /^ExecStart=\/opt\/agent-sozluk\/scripts\/canlilik-alarmi\.sh --bildir %i$/mu,
    );
    expect(service).toMatch(/^EnvironmentFile=\/etc\/agent-sozluk-alarm\.env$/mu);
    expect(service).toMatch(/^StateDirectory=agent-sozluk-alarm$/mu);
    expect(service).toMatch(
      /^Environment=ALARM_DURUM_DOSYASI=\/var\/lib\/agent-sozluk-alarm\/durum$/mu,
    );
    expect(service).toMatch(/^ProtectSystem=strict$/mu);
    // Disk doluyken bastırma kaydı tmpfs'e düşer; açılışa kadar korunur (Astra 1. tur).
    expect(service).toMatch(/^RuntimeDirectory=agent-sozluk-bildirim$/mu);
    expect(service).toMatch(/^RuntimeDirectoryPreserve=yes$/mu);
    expect(service).toMatch(/^NoNewPrivileges=yes$/mu);
    expect(service).toMatch(/^CapabilityBoundingSet=$/mu);
    expect(service).toContain("-/run/docker.sock");
    expect(service).toContain("-/opt/agent-sozluk/app");
  });

  it("alarm birimi körlükte (3) başarısız olur; süre sınırı alt kontrollere yeter", () => {
    const service = section(read("deploy/systemd/agent-sozluk-alarm.service"), "Service");
    expect(service).toMatch(/^SuccessExitStatus=0 2$/mu);
    expect(service).toMatch(/^TimeoutStartSec=4min$/mu);
    const script = read("deploy/alarm/canlilik-alarmi.sh");
    expect(script).toContain("işletim 25+5 = 185 sn; birimin TimeoutStartSec=4min");
    expect(185).toBeLessThan(4 * 60);
  });
});

describe("sunucu içi gece yedeği birimi", () => {
  const service = read("deploy/systemd/agent-sozluk-backup.service");
  const timer = read("deploy/systemd/agent-sozluk-backup.timer");
  const script = read("deploy/backup/backup-postgres.sh");

  it("eksik dizin 226/NAMESPACE yerine betikte adıyla düşer", () => {
    const body = section(service, "Service");
    expect(body).toMatch(
      /^ReadWritePaths=-\/opt\/agent-sozluk\/runtime\/state -\/opt\/agent-sozluk\/backups\/postgres -\/var\/log\/agent-sozluk$/mu,
    );
    expect(body).toMatch(/^ProtectSystem=strict$/mu);
    expect(body).not.toMatch(/^ExecStartPre=\+/mu);
    expect(body).toMatch(
      /^ExecStart=\/opt\/agent-sozluk\/scripts\/backup-postgres\.sh scheduled$/mu,
    );
    expect(script).toContain('for required_dir in "${BACKUP_DIR}" "${RUNTIME_DIR}/state"; do');
    expect(script).toContain("directory is unsafe or missing: ${required_dir}");
    expect(statSync(path.join(root, "deploy/backup/backup-postgres.sh")).mode & 0o111).not.toBe(0);
  });

  /*
    25 Ekim 2026: boş yer eşiği ham veritabanı boyutunun 2 katıydı ve 6,8 GB'lık veritabanında
    yedek hiç başlamadı. Eşik artık saklanan en büyük geçerli dökümün 2 katı; döküm yoksa eski
    kural. Sol 6.1: döküm ayrıca rezervi koruyan bir yazım sınırıyla kesilir ve dosya listesi
    yarıda hata verirse betik durur. Bloklar betikteki işaretler arasından alınıp sahte bir yedek
    dizininde ve sahte `docker` ile çalıştırılır.
  */
  const block = (name: string) => {
    const begin = script.indexOf(`# BEGIN ${name}`);
    const end = script.indexOf(`# END ${name}`);
    expect(begin).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(begin);
    return script.slice(begin, end);
  };
  const runBash = (lines: string[]) =>
    execFileSync("bash", ["-c", ["set -Eeuo pipefail", ...lines].join("\n")], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  const dump = (stamp: string) => `agent-sozluk-postgres-${stamp}-scheduled.dump`;

  it("boş yer eşiği saklanan en büyük dökümün 2 katıdır; döküm yoksa veritabanının 2 katı", () => {
    const sizing = block("required-free");
    const measure = (
      files: Record<string, number>,
      databaseBytes: number,
      backupDir?: string,
    ): { required: number; reserve: number; limit: number } => {
      const dir = mkdtempSync(path.join(tmpdir(), "yedek-esik-"));
      try {
        for (const [name, size] of Object.entries(files))
          writeFileSync(path.join(dir, name), Buffer.alloc(size));
        const output = runBash([
          `BACKUP_DIR=${JSON.stringify(backupDir ?? dir)}`,
          "MIN_BACKUP_BYTES=1024",
          "MIN_FREE_BYTES=4096",
          "MIN_RESERVE_BYTES=1000",
          `database_bytes=${databaseBytes}`,
          "available_bytes=100000",
          "total_kib=200",
          sizing,
          'printf "%s %s %s" "${required_free_bytes}" "${reserve_bytes}" "${output_limit_bytes}"',
        ]);
        const [required, reserve, limit] = output.split(" ").map(Number);
        return { required: required!, reserve: reserve!, limit: limit! };
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    };
    // En büyük geçerli döküm belirler; veritabanı boyutu artık eşiği şişirmez.
    expect(
      measure({ [dump("20261023T003001Z")]: 3000, [dump("20261024T003001Z")]: 5000 }, 900_000),
    ).toEqual({ required: 10_000, reserve: 20_480, limit: 79_520 });
    // Geçersiz adlar, yarım dosyalar ve 1 KiB altı dökümler sayılmaz.
    expect(
      measure(
        {
          [`${dump("20261024T003001Z")}.part`]: 50_000,
          "agent-sozluk-20261017T124604Z-pre-d78125259e48.dump": 60_000,
          [dump("20261022T003001Z")]: 100,
        },
        9000,
      ).required,
    ).toBe(18_000);
    // Hiç döküm yoksa eski temkinli kural; alt sınır MIN_FREE_BYTES.
    expect(measure({}, 9000).required).toBe(18_000);
    expect(measure({}, 100).required).toBe(4096);
    // Liste alınamazsa betik eksik listeyle sürmez, durur.
    expect(() => measure({}, 9000, "/olmayan/yedek/dizini")).toThrow();
  });

  it("döküm yazım sınırına konteyner içinde ulaşırsa üretici sonlandırılır ve betik durur", () => {
    const cap = block("dump-cap");
    expect(cap).toContain('kill -TERM "$dump_pid"');
    const dumpWith = (producer: string, limit: number) => {
      const dir = mkdtempSync(path.join(tmpdir(), "yedek-sinir-"));
      try {
        // Sahte pg_dump PATH'te; sahte docker, `sh -c …` kısmını konteyner yerine yerelde koşar.
        writeFileSync(path.join(dir, "pg_dump"), `#!/bin/sh\n${producer}\n`, { mode: 0o755 });
        const part = path.join(dir, "x.dump.part");
        try {
          return runBash([
            `export PATH=${JSON.stringify(dir)}:"$PATH"`,
            'die() { printf "DIE %s" "$*"; exit 1; }',
            // Üretimdeki busybox sh yerine bash: CI'daki eski dash `pipefail`/`wait` farkı yaratmasın.
            'docker() { while [ "$1" != sh ]; do shift; done; shift; bash "$@"; }',
            "ENV_FILE=/dev/null COMPOSE_FILE=/dev/null",
            `PART_FILE=${JSON.stringify(part)}`,
            `output_limit_bytes=${limit}`,
            cap,
            'printf "OK %s" "${backup_bytes}"',
          ]);
        } catch (error) {
          return String((error as { stdout?: string }).stdout ?? "");
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    };
    expect(dumpWith("head -c 5000 /dev/zero", 10_000)).toBe("OK 5000");
    // Çıktıyı kapatıp kapanışını sürdüren başarılı döküm öldürülmez (Sol 6.1, 5. tur).
    expect(dumpWith("head -c 5000 /dev/zero; exec 1>&-; exec sleep 0.2", 10_000)).toBe("OK 5000");
    // Sonsuz üretici: sınırda sonlandırılmasaydı test hiç bitmezdi.
    expect(dumpWith("cat /dev/zero", 10_000)).toMatch(/^DIE /u);
    expect(dumpWith("head -c 10000 /dev/zero", 10_000)).toMatch(/^DIE /u);
    // Sınırda yazıp bekleyen üretici de (ör. sorgu bekleyen pg_dump) sonlandırılır.
    const started = Date.now();
    expect(dumpWith("head -c 10000 /dev/zero; exec sleep 30", 10_000)).toMatch(/^DIE /u);
    expect(Date.now() - started).toBeLessThan(10_000);
    // Döküm hatası kesilmeden de yakalanır.
    expect(dumpWith("head -c 100 /dev/zero; exit 3", 10_000)).toMatch(/^DIE /u);
  }, 30_000);

  it("zamanlayıcı her gece ve kaçırılanı telafi eder", () => {
    const body = section(timer, "Timer");
    expect(body).toMatch(/^OnCalendar=\*-\*-\* 03:30:00 Europe\/Istanbul$/mu);
    expect(body).toMatch(/^Persistent=true$/mu);
    expect(body).toMatch(/^Unit=agent-sozluk-backup\.service$/mu);
  });

  it("runbook kurulumu ReadWritePaths dizinlerini birimden önce oluşturur", () => {
    const runbook = read("docs/PRODUCTION_RUNBOOK.md");
    const start = runbook.indexOf("## Sunucu içi gece yedeği, canlılık alarmı ve OnFailure");
    expect(start).toBeGreaterThan(-1);
    const kurulum = runbook.slice(start, runbook.indexOf("\n## ", start + 1));
    const dizinler = section(service, "Service")
      .match(/^ReadWritePaths=(.*)$/mu)![1]!
      .split(/\s+/u)
      .map((yol) => yol.replace(/^-/u, ""));
    for (const dizin of dizinler)
      expect(kurulum).toMatch(new RegExp(`install -d [^\\n]*${dizin}`, "u"));
    expect(kurulum.indexOf("install -d")).toBeLessThan(kurulum.indexOf("systemctl enable --now"));
    expect(kurulum).toContain("agent-sozluk-bildirim@.service");
  });
});
