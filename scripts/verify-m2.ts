import { spawnSync } from "node:child_process";
import path from "node:path";
import { requireTestDatabaseUrl } from "./test-database-safety";

const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);
if (nodeMajor !== 22)
  throw new Error(`verify:m2 requires Node.js 22; received ${process.versions.node}.`);

const testDatabaseUrl = requireTestDatabaseUrl(process.env.TEST_DATABASE_URL, "verify:m2");
const developmentTraceability = process.argv.slice(2).includes("--development");
const unsupportedArguments = process.argv
  .slice(2)
  .filter((argument) => argument !== "--development");
if (unsupportedArguments.length > 0)
  throw new Error(`verify:m2 received unsupported arguments: ${unsupportedArguments.join(", ")}.`);
const applicationUrl = new URL(process.env.E2E_APP_URL ?? "http://127.0.0.1:3000");
const port = Number.parseInt(applicationUrl.port, 10);
if (
  applicationUrl.protocol !== "http:" ||
  !["127.0.0.1", "localhost", "[::1]"].includes(applicationUrl.hostname) ||
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65_535 ||
  applicationUrl.pathname !== "/" ||
  Boolean(
    applicationUrl.username ||
    applicationUrl.password ||
    applicationUrl.search ||
    applicationUrl.hash,
  )
)
  throw new Error("verify:m2 requires E2E_APP_URL to be an explicit loopback http origin.");

const pnpmCli = process.env.npm_execpath;
const verificationPath = [path.dirname(process.execPath), process.env.PATH]
  .filter((entry): entry is string => Boolean(entry))
  .join(path.delimiter);
const environment: NodeJS.ProcessEnv = {
  ...process.env,
  PATH: verificationPath,
  NODE_ENV: "test",
  DATABASE_URL: testDatabaseUrl,
  TEST_DATABASE_URL: testDatabaseUrl,
  APP_URL: applicationUrl.origin,
  APP_SECRET: "agent-sozluk-m2-verification-only-secret",
  NEXT_PUBLIC_APP_NAME: "Agent Sözlük",
  SESSION_COOKIE_NAME: "ajan_session",
  TERMS_VERSION: "1.0",
  TRUST_PROXY: "true",
  TRUST_PROXY_HOPS: "0",
  HOSTNAME: "0.0.0.0",
  PORT: applicationUrl.port,
  SEED_DEMO: "false",
  DEMO_PASSWORD: "change-this-demo-password",
  NEXT_TELEMETRY_DISABLED: "1",
  E2E_APP_URL: applicationUrl.origin,
};

function run(label: string, args: string[], extra: Partial<NodeJS.ProcessEnv> = {}): void {
  process.stdout.write(`\n==> ${label}\n`);
  const result = pnpmCli
    ? spawnSync(process.execPath, [pnpmCli, ...args], {
        env: { ...environment, ...extra },
        stdio: "inherit",
      })
    : spawnSync("pnpm", args, { env: { ...environment, ...extra }, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}.`);
}

function main(): void {
  run("format", ["format:check"]);
  run("lint", ["lint"]);
  run("typecheck", ["typecheck"]);
  run("Prisma validate", ["exec", "prisma", "validate"]);
  run("clean migration", ["exec", "prisma", "migrate", "reset", "--force", "--skip-seed"]);
  run("Milestone 1 regression", ["verify:m1"]);
  run("agent unit", ["test:agent-unit"]);
  run("agent integration", ["test:agent-integration"]);
  run("agent simulation", ["test:agent-simulation"]);
  run("production build", ["build"], { NODE_ENV: "production" });
  run("agent E2E", ["test:agent-e2e"], { E2E_PRODUCTION_SERVER: "true" });
  run("OpenAPI", ["openapi:validate"]);
  run("persona verification", ["agent:verify-personas"]);
  run("public metadata leak scan", ["exec", "tsx", "scripts/scan-agent-metadata.ts"]);
  run("repository and history secret scan", ["security:scan-secrets"]);
  if (!developmentTraceability) run("clean candidate tree", ["repo:check-clean"]);
  run(
    developmentTraceability
      ? "M2 development requirement traceability"
      : "M2 final requirement traceability",
    [developmentTraceability ? "requirements:m2:check:development" : "requirements:m2:check"],
  );
  process.stdout.write(
    developmentTraceability
      ? "\nMilestone 2 pre-merge development verification passed.\n"
      : "\nMilestone 2 final integrated verification passed.\n",
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "M2 verification failed."}\n`);
  process.exitCode = 1;
}
