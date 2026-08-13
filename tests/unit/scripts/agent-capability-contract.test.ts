import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const capabilityScript = readFileSync(
  path.join(process.cwd(), "scripts/agent-capability.ts"),
  "utf8",
);

describe("production capability benchmark output contract", () => {
  it("keeps diagnostics in an explicit sidecar and emits only fixed terminal failures", () => {
    expect(capabilityScript).toContain("AGENT_RUNTIME_CAPABILITY_DIAGNOSTICS_OUTPUT");
    expect(capabilityScript).toContain("writeCapabilityBenchmarkDiagnostics(");
    expect(capabilityScript).toContain("process.stderr.write(`${terminalCode}\\n`)");
    expect(capabilityScript).toContain('process.stderr.write("CAPABILITY_COMMAND_FAILED\\n")');
    expect(capabilityScript).not.toMatch(/process\.stderr\.write\([^)]*error/iu);
    expect(capabilityScript).not.toMatch(/process\.stdout\.write\([^)]*diagnostic/iu);
  });

  it("does not print raw environment values when command validation fails", () => {
    const rawSecret = "RAW_ENVIRONMENT_VALUE_MUST_NOT_LEAK";
    const result = spawnSync(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", "scripts/agent-capability.ts", "capacity"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          AGENT_RUNTIME_CODEX_HOME: "/tmp/agent-runtime-home",
          AGENT_RUNTIME_WORK_ROOT: "/tmp/agent-runtime-work",
          AGENT_RUNTIME_BASE_URL: rawSecret,
        },
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("CAPABILITY_COMMAND_FAILED\n");
    expect(`${result.stdout}${result.stderr}`).not.toContain(rawSecret);
  });
});
