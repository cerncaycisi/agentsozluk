import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const service = readFileSync(
  path.join(root, "deploy/systemd/agent-sozluk-maintenance.service"),
  "utf8",
);
const timer = readFileSync(
  path.join(root, "deploy/systemd/agent-sozluk-maintenance.timer"),
  "utf8",
);
const dockerfile = readFileSync(path.join(root, "Dockerfile"), "utf8");
const runbook = readFileSync(path.join(root, "docs/PRODUCTION_RUNBOOK.md"), "utf8");

describe("bounded operational-record maintenance timer", () => {
  it("runs one bounded app-container cleanup without embedding secrets", () => {
    expect(service).toContain("Type=oneshot");
    expect(service).toContain("User=deploy");
    expect(service).toContain("Group=deploy");
    expect(service).toContain("scripts/cleanup-rate-limits.ts --batch-size=500 --max-batches=4");
    expect(service).toContain(
      "--env-file /opt/agent-sozluk/app/.env -f /opt/agent-sozluk/runtime/compose.production.yaml",
    );
    expect(service).toContain("RuntimeDirectory=agent-sozluk-maintenance");
    expect(service).toContain("RuntimeDirectoryMode=0700");
    expect(service).toContain("Environment=DOCKER_CONFIG=/run/agent-sozluk-maintenance");
    expect(service).not.toMatch(/(?:DATABASE_URL=|APP_SECRET=|PASSWORD=|TOKEN=)/u);
    expect(service).toContain("NoNewPrivileges=yes");
    expect(service).toContain("ProtectSystem=strict");
    expect(service).toContain("ProtectHome=yes");
    expect(service).toContain("RestrictAddressFamilies=AF_UNIX");
    expect(service).toContain("TimeoutStartSec=5min");
    expect(dockerfile).toContain("scripts/cleanup-rate-limits.ts ./scripts/cleanup-rate-limits.ts");
  });

  it("uses one persistent five-minute timer and documents operator-gated installation", () => {
    // 21 Eylül 2026: saatlikten beş dakikada bire. Parti boyutu (500x4) ve
    // 5 dk'lık zaman aşımı BİLEREK aynı kaldı — iki tablonun tüm partileri
    // tek transaction'da koşuyor; kapasite parti büyütmekle değil daha sık
    // koşmakla artırıldı. Gerekçe ve ölçüm timer dosyasının başında.
    // Zamanlama anahtarları [Timer] bölümünün İÇİNDE olmalı. 21 Eylül'de bir
    // açıklama bloğu eklerken [Timer] başlığı silindi; OnCalendar [Unit]'e düştü
    // ve timer üretimde "bad unit file setting" ile başlamadı. Bu test yalnız
    // anahtarın metinde geçtiğine baktığı için yakalamadı.
    const bolumler = timer.split(/^\[(\w+)\]$/mu);
    const timerBolumu = bolumler[bolumler.indexOf("Timer") + 1] ?? "";
    expect(bolumler).toContain("Timer");
    expect(timerBolumu).toMatch(/^OnCalendar=\*:0\/5$/mu);
    expect(timerBolumu).toMatch(/^RandomizedDelaySec=30s$/mu);
    expect(timerBolumu).toMatch(/^Unit=agent-sozluk-maintenance\.service$/mu);
    expect(timer).toContain("OnCalendar=*:0/5");
    expect(timer).toContain("RandomizedDelaySec=30s");
    // Runbook timer'la aynı şeyi söylemeli. İlk değişiklikte runbook "saatlik,
    // 15 dakika" demeye devam etti ve bu test yalnız başlığa baktığı için
    // yakalamadı (Sol, 21 Eylül).
    expect(runbook).toContain("one run every five minutes");
    expect(runbook).not.toContain("one run per hour with up to fifteen minutes");
    expect(runbook).toContain("**Stop threshold.**");
    expect(timer).toContain("Persistent=true");
    expect(timer).toContain("Unit=agent-sozluk-maintenance.service");
    expect(runbook).toContain("## Bounded expired-record maintenance timer");
    expect(runbook).toContain("systemd-analyze verify agent-sozluk-maintenance.service");
    expect(runbook).toContain("systemctl enable --now agent-sozluk-maintenance.timer");
    expect(runbook).toContain("No raw key, route, response body or actor");
    expect(runbook).toContain("identifier is emitted.");
  });
});
