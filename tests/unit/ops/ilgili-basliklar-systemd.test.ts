import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

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
      "ExecStart=/usr/bin/docker compose --env-file /opt/agent-sozluk/app/.env -f /opt/agent-sozluk/runtime/compose.production.yaml exec -T app node node_modules/tsx/dist/cli.mjs scripts/ilgili-basliklar.ts --uygula",
    );
    expect(body).toMatch(/^RuntimeDirectory=agent-sozluk-ilgili$/mu);
    expect(body).toMatch(/^Environment=DOCKER_CONFIG=\/run\/agent-sozluk-ilgili$/mu);
    expect(body).toMatch(/^RestrictAddressFamilies=AF_UNIX$/mu);
    expect(body).toMatch(/^IPAddressDeny=any$/mu);
    expect(body).toMatch(/^TimeoutStartSec=15min$/mu);
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
  });
});
