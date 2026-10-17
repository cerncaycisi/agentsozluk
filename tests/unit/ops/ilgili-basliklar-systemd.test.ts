import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  RELATED_TOPIC_LOCK_RETRIES,
  RELATED_TOPIC_LOCK_RETRY_DELAY_MS,
  RELATED_TOPIC_RETRY_BUDGET_MS,
  RELATED_TOPIC_TRANSACTION_TIMEOUT_MS,
} from "@/modules/topics/application/related-topics";

/*
  İlgili başlıklar gece işi (Gökhan kararı, 17 Ekim 2026). Birim karagöz'le aynı kalıpta:
  app konteynerinde tek komut, dışarıya ağ yok, sır yok. Zamanlayıcı Gökhan ekran görüntüsünü
  onaylamadan kurulmaz; runbook bunu söylemeli.
*/

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const service = read("deploy/systemd/agent-sozluk-ilgili.service");
const timer = read("deploy/systemd/agent-sozluk-ilgili.timer");
const karagozService = read("deploy/systemd/agent-sozluk-karagoz.service");
const dockerfile = read("Dockerfile");
const runbook = read("docs/PRODUCTION_RUNBOOK.md");
const script = read("scripts/ilgili-basliklar.ts");
const repository = read("src/modules/topics/repository/related-topics.ts");

function section(unit: string, name: string): string {
  const parts = unit.split(/^\[(\w+)\]$/mu);
  return parts[parts.indexOf(name) + 1] ?? "";
}

describe("ilgili başlıklar gece birimi", () => {
  it("app konteynerinde tek komutla tabloyu yazar; sır ve dış ağ yok", () => {
    const body = section(service, "Service");
    expect(body).toMatch(/^Type=oneshot$/mu);
    expect(body).toMatch(/^User=deploy$/mu);
    expect(body).toMatch(/^Group=deploy$/mu);
    expect(body).toContain(
      "ExecStart=/usr/bin/docker compose --env-file /opt/agent-sozluk/app/.env -f /opt/agent-sozluk/runtime/compose.production.yaml exec -T app timeout -k 30 1620 node node_modules/tsx/dist/cli.mjs scripts/ilgili-basliklar.ts --uygula",
    );
    expect(body).toMatch(/^RuntimeDirectory=agent-sozluk-ilgili$/mu);
    expect(body).toMatch(/^Environment=DOCKER_CONFIG=\/run\/agent-sozluk-ilgili$/mu);
    expect(body).toMatch(/^RestrictAddressFamilies=AF_UNIX$/mu);
    expect(body).toMatch(/^IPAddressDeny=any$/mu);
    expect(body).toMatch(/^TimeoutStartSec=30min$/mu);
    // Konteynerdeki süreç systemd sınırından önce ölür: 1620 + 30 sn < 30 dk. Yeniden deneme
    // bütçesi (24 dk) 10 × 60 sn beklemeyi ve son tam hesabı (13 dk) içerir ve 1620 sn'ye sığar.
    expect(1620 + 30).toBeLessThan(30 * 60);
    expect(RELATED_TOPIC_RETRY_BUDGET_MS / 1000).toBeLessThan(1620);
    expect(
      (RELATED_TOPIC_LOCK_RETRIES - 1) * RELATED_TOPIC_LOCK_RETRY_DELAY_MS +
        RELATED_TOPIC_LOCK_RETRY_DELAY_MS +
        RELATED_TOPIC_TRANSACTION_TIMEOUT_MS,
    ).toBeLessThanOrEqual(RELATED_TOPIC_RETRY_BUDGET_MS);
    expect(body).toMatch(/^Nice=15$/mu);
    expect(body).toMatch(/^SyslogIdentifier=agent-sozluk-ilgili$/mu);
    expect(service).not.toMatch(/(?:DATABASE_URL=|APP_SECRET=|PASSWORD=|TOKEN=)/u);
  });

  it("karagöz biriminin sertleştirme satırlarının hepsini taşır", () => {
    const hardening = karagozService
      .split("\n")
      .filter((line) =>
        /^(?:UMask|NoNewPrivileges|Private|Protect|CapabilityBoundingSet|AmbientCapabilities|LockPersonality|Restrict|RemoveIPC|SystemCallArchitectures|ReadOnlyPaths|InaccessiblePaths)/u.test(
          line,
        ),
      );
    expect(hardening.length).toBeGreaterThan(15);
    for (const line of hardening) expect(service).toContain(line);
  });

  it("zamanlayıcı her gece 03:30 UTC'de, [Timer] bölümünde", () => {
    const body = section(timer, "Timer");
    expect(body).toMatch(/^OnCalendar=\*-\*-\* 03:30:00 UTC$/mu);
    expect(body).toMatch(/^Persistent=true$/mu);
    expect(body).toMatch(/^RandomizedDelaySec=10min$/mu);
    expect(body).toMatch(/^Unit=agent-sozluk-ilgili\.service$/mu);
    expect(section(timer, "Install")).toMatch(/^WantedBy=timers\.target$/mu);
  });

  it("imaj betiği taşır; betik hata kodunu güvenli biçimde basar", () => {
    expect(dockerfile).toContain(
      "COPY --chown=nextjs:nodejs scripts/ilgili-basliklar.ts ./scripts/ilgili-basliklar.ts",
    );
    expect(script).toContain("ILGILI_FAILED code=");
    expect(script).toContain('process.argv.includes("--uygula")');
    expect(script).toContain("--ornek=");
    // Uygula modunda yazılamazsa (kilit ya da çatışma) birim başarısız görünür.
    expect(script).toContain("status: result.status");
    expect(script).toContain("process.exitCode = relatedTopicExitCode(result, apply);");
    expect(script).toContain('{"status":"CONFLICT_RETRY_EXHAUSTED"}');
  });

  it("runbook kurulumu karagöz'ün yanında ve onay kapısıyla anlatır", () => {
    const start = runbook.indexOf("## İlgili başlıklar (gece hesabı)");
    expect(start).toBeGreaterThan(runbook.indexOf("## Karagöz (kopya başlık taraması)"));
    const text = runbook.slice(start, runbook.indexOf("## IndexNow bildirimi"));
    expect(text).toContain("Zamanlayıcı, Gökhan blok ekran görüntüsünü onaylamadan");
    expect(text).toContain("scripts/ilgili-basliklar.ts --ornek=10");
    expect(text).toContain("scripts/ilgili-basliklar.ts --uygula");
    expect(text).toContain(
      "$A/deploy/systemd/agent-sozluk-ilgili.service $A/deploy/systemd/agent-sozluk-ilgili.timer /etc/systemd/system/",
    );
    expect(text).toContain("sudo systemctl enable --now agent-sozluk-ilgili.timer");
    expect(text).toContain("20261017120000_topic_related_links");
    expect(text).toContain("Robots, noindex ve site haritası değişmez.");
    expect(text).toContain('{"status":"ALREADY_RUNNING"}');
    const prose = text.replace(/\s+/gu, " ");
    expect(prose).toContain("`--uygula` 60 sn arayla 10 kez yeniden dener");
    expect(prose).toContain("75 (EX_TEMPFAIL) ile çıkar");
    expect(prose).toContain("`timeout -k 30 1620`");
    expect(prose).toContain('`{"status":"CONFLICT_RETRY_EXHAUSTED"}` basar ve 75 ile çıkar');
  });

  it("geri alma sırası: zamanlayıcı, servis, süreç ve kilit denetimi, ancak sonra boşaltma", () => {
    const start = runbook.indexOf("**Geri alma sırası.**");
    expect(start).toBeGreaterThan(-1);
    const text = runbook.slice(start, runbook.indexOf("## IndexNow bildirimi"));
    const steps = [
      "sudo systemctl disable --now agent-sozluk-ilgili.timer",
      "sudo systemctl stop agent-sozluk-ilgili.service",
      `exec -T app sh -c 'ps -o args | grep -c "[i]lgili-basliklar"'`,
      "objid = 2026101701 AND objsubid = 1",
      "Ancak bundan sonra tabloyu boşalt.",
    ];
    let previous = -1;
    for (const step of steps) {
      const index = text.indexOf(step);
      expect(index, step).toBeGreaterThan(previous);
      previous = index;
    }
    // Belgedeki kilit anahtarı koddakiyle aynı olmalı.
    expect(repository).toContain("RELATED_TOPIC_ADVISORY_LOCK_KEY = 2_026_101_701n");
  });
});
