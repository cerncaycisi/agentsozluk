import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError } from "@/lib/http/errors";
import { operatorFailureCode } from "../../../scripts/agent-society-flow";

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
  it("kilit altında idempotent, yalnız runtimeEnabled'ı değiştiren servisi kullanır", () => {
    // Durum kontrolü servis içinde, ayar kilidi altında (Astra, #186); geniş
    // `setSocietyFlowEnabled` (zamanlayıcı/yayın/mod) kullanılmaz.
    expect(operator).toContain("setGlobalRuntimeEnabledIfChanged(");
    expect(operator).not.toContain("setSocietyFlowEnabled");
    expect(operator).toContain("resolveOperatorAdmin(database");
    expect(operator).toContain("runtimeControlSchema.parse");
    // Doğrudan ayar yazımı yok: denetim kaydı servisin içinde.
    expect(operator).not.toMatch(/agentGlobalSettings\.(update|upsert|create)/u);
    expect(assemble).toContain("scripts/agent-society-flow.ts");
  });

  it("sarmalayıcı duraklatmayı uzak dağıtım betiğinden ÖNCE, adayın release'inden yapar", () => {
    const pause = wrapper.indexOf("agent-society-flow.ts pause");
    const remote = wrapper.indexOf("exec '$remote_script' '$candidate_sha'");
    const fetchRuntime = wrapper.indexOf("exec '$remote_github_fetcher'");
    expect(pause).toBeGreaterThan(fetchRuntime);
    expect(remote).toBeGreaterThan(pause);
    const block = wrapper.slice(
      wrapper.indexOf('if test "$pause_society_flow" = 1; then\n  "$local_timeout" 180 ssh'),
      remote,
    );
    expect(block).toContain("$lock_check");
    expect(block).toContain('"$local_timeout" 180 ssh');
    expect(block).toContain("timeout --kill-after=10 120 ./node_modules/.bin/tsx");
    expect(block).toContain("$scope_check");
    // İki geçerli yönetici: aktör açıkça `bootstrap_admin`, kimlik basılmaz (ATTEMPT_LOG).
    expect(block).toContain("username = 'bootstrap_admin'");
    expect(block).toContain('AGENT_OPERATOR_ADMIN_ID=\\"\\$admin_id\\"');
    expect(block).toContain("OPERATOR_ADMIN_UNRESOLVED");
    expect(block).not.toMatch(/(echo|printf)[^\n]*\$admin_id/u);
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

  it("hata kodları: Zod girdi hatası yönetici belirsizliğinden önce ayrılır", () => {
    const zod = z
      .object({ AGENT_OPERATOR_ADMIN_ID: z.string().uuid() })
      .safeParse({ AGENT_OPERATOR_ADMIN_ID: "bozuk" });
    expect(zod.success).toBe(false);
    if (!zod.success) expect(operatorFailureCode(zod.error)).toBe("OPERATOR_INPUT_INVALID");
    expect(
      operatorFailureCode(
        new Error("AGENT_OPERATOR_ADMIN_ID aktif HUMAN ADMIN hesabını göstermelidir."),
      ),
    ).toBe("OPERATOR_ADMIN_SELECTION_AMBIGUOUS");
    expect(operatorFailureCode(new AppError("FORBIDDEN", 403, "x"))).toBe("FORBIDDEN");
    expect(operatorFailureCode(new Error("başka"))).toBe("INTERNAL_ERROR");
  });

  it("uzak duraklatma metninde yerelde çalışacak ters tırnak ya da $( yok", () => {
    const start = wrapper.indexOf('if test "$pause_society_flow" = 1; then\n');
    const remoteText = wrapper.slice(start, wrapper.indexOf("\nfi\n", start));
    expect(remoteText).not.toContain("`");
    // Yalnız kaçırılmış \$( uzakta çalışır; kaçırılmamış $( yerelde çalışırdı.
    expect(remoteText).not.toMatch(/[^\\]\$\(/u);
  });

  it("yerel süre sınırlayıcı yoksa ilk uzak işlemden önce durur", () => {
    const toolCheck = wrapper.indexOf("PAUSE_TIMEOUT_TOOL_MISSING");
    const firstRemote = wrapper.indexOf('ssh "${ssh_options[@]}" deploy@"$expected_ip"');
    expect(toolCheck).toBeGreaterThan(0);
    expect(toolCheck).toBeLessThan(firstRemote);
    expect(wrapper).toContain("command -v gtimeout");
  });
});
