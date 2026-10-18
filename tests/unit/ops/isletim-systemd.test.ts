import { readdirSync, readFileSync, statSync } from "node:fs";
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
