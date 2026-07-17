import { spawnSync } from "node:child_process";
import { requireTestDatabaseUrl } from "../../scripts/test-database-safety";

function runPnpm(args: string[], label: string, environment: NodeJS.ProcessEnv): void {
  const pnpmCli = process.env.npm_execpath;
  const command = pnpmCli ? process.execPath : "pnpm";
  const commandArgs = pnpmCli ? [pnpmCli, ...args] : args;
  const result = spawnSync(command, commandArgs, { env: environment, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`);
}

export default function globalSetup(): void {
  const testDatabaseUrl = requireTestDatabaseUrl(process.env.TEST_DATABASE_URL, "E2E setup");
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: testDatabaseUrl,
    TEST_DATABASE_URL: testDatabaseUrl,
    NODE_ENV: "test",
    APP_URL: process.env.APP_URL ?? "http://127.0.0.1:3000",
    APP_SECRET: process.env.APP_SECRET ?? "agent-sozluk-e2e-validation-only-secret",
    SEED_DEMO: "true",
    DEMO_PASSWORD: process.env.DEMO_PASSWORD ?? "change-this-demo-password",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  runPnpm(
    ["exec", "prisma", "migrate", "reset", "--force", "--skip-seed"],
    "E2E database reset",
    environment,
  );
  runPnpm(["db:seed"], "E2E database seed", environment);
}
