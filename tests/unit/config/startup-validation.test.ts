import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const tsxCli = require.resolve("tsx/cli");
const validationScript = path.join(process.cwd(), "scripts", "validate-environment.ts");

function validate(overrides: Record<string, string | undefined>) {
  return spawnSync(process.execPath, [tsxCli, validationScript], {
    encoding: "utf8",
    env: Object.assign(
      {},
      process.env,
      {
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/agent_sozluk",
        APP_URL: "http://localhost:3000",
        APP_SECRET: "agent-sozluk-test-startup-secret-value",
        NEXT_TELEMETRY_DISABLED: "1",
        SEED_DEMO: "false",
      },
      overrides,
    ),
  });
}

describe("startup environment validation", () => {
  it("exits successfully for a valid production environment", () => {
    const result = validate({});
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Environment validation passed.");
  });

  it("fails before startup for a placeholder secret or production demo seed", () => {
    expect(
      validate({
        APP_SECRET: "replace-with-at-least-32-random-bytes",
        SEED_DEMO: "true",
      }).status,
    ).toBe(1);
  });
});
