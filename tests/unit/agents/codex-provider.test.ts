import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Codex CLI provider security contract", () => {
  const source = readFileSync("src/runtime/codex-cli-provider.ts", "utf8");

  it("uses the inspected non-interactive structured-output flags without a shell", () => {
    for (const value of [
      '"exec"',
      '"--ephemeral"',
      '"--output-schema"',
      '"--output-last-message"',
      '"read-only"',
      '"never"',
      "shell: false",
    ]) {
      expect(source).toContain(value);
    }
    expect(source).not.toContain("shell: true");
  });

  it("allowlists child environment and never forwards database or deployment credentials", () => {
    expect(source).toContain("safeEnvironment");
    expect(source).not.toMatch(/DATABASE_URL|APP_SECRET|SSH_|GITHUB_TOKEN|DOCKER_HOST/u);
    expect(source).toContain("mode: 0o700");
    expect(source).toContain("mode: 0o600");
    expect(source).toContain('child.kill("SIGTERM")');
    expect(source).toContain('child.kill("SIGKILL")');
  });
});
