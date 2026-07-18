import { spawnSync } from "node:child_process";
import path from "node:path";
import { requireTestDatabaseUrl } from "./test-database-safety";

const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);
if (nodeMajor !== 22)
  throw new Error(
    `agent:verify-life-ledger requires Node.js 22; received ${process.versions.node}.`,
  );

const testDatabaseUrl = requireTestDatabaseUrl(
  process.env.TEST_DATABASE_URL,
  "agent:verify-life-ledger",
);
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
  APP_URL: "http://127.0.0.1:3000",
  APP_SECRET: "agent-life-ledger-development-verification-secret",
  NEXT_PUBLIC_APP_NAME: "Agent Sözlük",
  SESSION_COOKIE_NAME: "ajan_session",
  TERMS_VERSION: "1.0",
  NEXT_TELEMETRY_DISABLED: "1",
};

function run(label: string, args: string[]): void {
  process.stdout.write(`\n==> ${label}\n`);
  const result = pnpmCli
    ? spawnSync(process.execPath, [pnpmCli, ...args], {
        env: environment,
        stdio: "inherit",
      })
    : spawnSync("pnpm", args, { env: environment, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}.`);
}

function main(): void {
  run("clean life-ledger migration", [
    "exec",
    "prisma",
    "migrate",
    "reset",
    "--force",
    "--skip-seed",
  ]);
  run("structured decision and life-event contracts", [
    "exec",
    "vitest",
    "run",
    "tests/unit/agents/runtime-output.test.ts",
    "tests/unit/agents/life-ledger.test.ts",
  ]);
  run("life-ledger chain, replay, pagination and append-only database gate", [
    "exec",
    "vitest",
    "run",
    "tests/integration/agent-life-ledger.test.ts",
  ]);
  run("server mutation-hook snapshots", [
    "exec",
    "vitest",
    "run",
    "tests/integration/agent-memory-lifecycle.test.ts",
    "tests/integration/agent-control-plane.test.ts",
    "tests/integration/agent-runtime-api.test.ts",
    "--testNamePattern",
    [
      "allows a HUMAN ADMIN to list and invalidate one episode",
      "appends persona edits and rollback as immutable new versions",
      "administers source evolution with pin, block, approval and weekly score limits",
      "fences a stale same-worker generation on heartbeat and terminal completion",
      "atomically applies weekly persona and source, relationship, belief deltas",
      "persists source, belief and relationship evolution only with visible provenance",
      "requires a causal life proposal before direct production action execution",
    ].join("|"),
  ]);
  process.stdout.write(
    "\nAgent Life Ledger development acceptance passed. Production backup/restore, reboot persistence and live runtime evidence are intentionally separate production-only gates.\n",
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Agent Life Ledger verification failed."}\n`,
  );
  process.exitCode = 1;
}
