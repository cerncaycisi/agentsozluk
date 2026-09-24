import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { flowWriteNeeded } from "../../../scripts/agent-society-flow";

const root = process.cwd();
const wrapper = readFileSync(path.join(root, "scripts/deploy-production-no-migration.sh"), "utf8");
const operator = readFileSync(path.join(root, "scripts/agent-society-flow.ts"), "utf8");
const assemble = readFileSync(path.join(root, "scripts/assemble-runtime-release.sh"), "utf8");

/*
  Migration'sız dağıtımın önkoşulu genel duraklatmaydı ve yalnız panelden
  yapılabiliyordu (24 Eylül). Operatör betiği panelle aynı servisi kullanır;
  sarmalayıcı `--pause-society-flow` ile uzak betik ayar parmak izini almadan önce
  adayın release'inden duraklatır.
*/
describe("toplum akışı operatör duraklatması", () => {
  it("idempotent: istenen durum zaten geçerliyse yazmaz", () => {
    expect(flowWriteNeeded("pause", true)).toBe(true);
    expect(flowWriteNeeded("pause", false)).toBe(false);
    expect(flowWriteNeeded("resume", false)).toBe(true);
    expect(flowWriteNeeded("resume", true)).toBe(false);
    expect(flowWriteNeeded("status", true)).toBe(false);
    expect(flowWriteNeeded("status", false)).toBe(false);
  });

  it("panelle aynı uygulama servisini ve operatör yönetici çözümünü kullanır", () => {
    expect(operator).toContain("setSocietyFlowEnabled(database, actor");
    expect(operator).toContain("resolveOperatorAdmin(database");
    expect(operator).toContain("runtimeControlSchema.parse");
    // Doğrudan ayar yazımı yok: denetim kaydı servisin içinde.
    expect(operator).not.toMatch(/agentGlobalSettings\.(update|upsert|create)/u);
    expect(assemble).toContain("scripts/agent-society-flow.ts");
  });

  it("sarmalayıcı duraklatmayı uzak dağıtım betiğinden ÖNCE, adayın release'inden yapar", () => {
    const pause = wrapper.indexOf("./node_modules/.bin/tsx scripts/agent-society-flow.ts pause");
    const remote = wrapper.indexOf("exec '$remote_script' '$candidate_sha'");
    const fetchRuntime = wrapper.indexOf("exec '$remote_github_fetcher'");
    expect(pause).toBeGreaterThan(fetchRuntime);
    expect(remote).toBeGreaterThan(pause);
    const block = wrapper.slice(
      wrapper.indexOf('if test "$pause_society_flow" = 1; then\n  ssh'),
      remote,
    );
    expect(block).toContain("$lock_check");
    expect(block).toContain("$scope_check");
    expect(block).toContain("release=/opt/agent-sozluk/runtime/releases/$candidate_sha");
    expect(block).toContain(".release-sha\\\")\\\" = '$candidate_sha'");
    // Devam ettirme otomatik değil.
    expect(wrapper).not.toContain("agent-society-flow.ts resume");
  });

  it("host derlemesiyle birlikte reddedilir (aday release yok)", () => {
    let failure: { status: number; stderr: string } | null = null;
    try {
      execFileSync(
        "bash",
        [
          path.join(root, "scripts/deploy-production-no-migration.sh"),
          "--sha",
          "a".repeat(40),
          "--execute",
          "--build-on-host",
          "--pause-society-flow",
        ],
        {
          encoding: "utf8",
          stdio: "pipe",
          env: { ...process.env, AGENT_SOZLUK_PRODUCTION_APPROVED_SHA: "a".repeat(40) },
        },
      );
    } catch (error) {
      failure = error as { status: number; stderr: string };
    }
    expect(failure?.status).toBe(90);
    expect(failure?.stderr).toContain("PAUSE_REQUIRES_ARTIFACT_RELEASE");
  });
});
