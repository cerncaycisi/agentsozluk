import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { getDatabase } from "@/lib/db/client";
import { requireTestDatabaseUrl } from "./test-database-safety";

interface CounterMismatchRow {
  entryMismatches: bigint;
  topicMismatches: bigint;
}

const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);
if (nodeMajor !== 22) {
  throw new Error(`verify:m1 requires Node.js 22; received ${process.versions.node}.`);
}

const testDatabaseUrl = requireTestDatabaseUrl(process.env.TEST_DATABASE_URL, "verify:m1");
const verificationUrl = new URL(process.env.E2E_APP_URL ?? "http://127.0.0.1:3000");
const verificationPort = Number.parseInt(verificationUrl.port, 10);
if (
  verificationUrl.protocol !== "http:" ||
  !["127.0.0.1", "localhost", "[::1]"].includes(verificationUrl.hostname) ||
  !Number.isInteger(verificationPort) ||
  verificationPort < 1024 ||
  verificationPort > 65_535 ||
  verificationUrl.pathname !== "/" ||
  Boolean(
    verificationUrl.username ||
    verificationUrl.password ||
    verificationUrl.search ||
    verificationUrl.hash,
  )
) {
  throw new Error("verify:m1 requires E2E_APP_URL to be an explicit loopback http origin.");
}
const verificationAppUrl = verificationUrl.origin;
const verificationSecret = "agent-sozluk-verification-only-secret";
const verificationDemoPassword = "change-this-demo-password";
const verificationPath = [path.dirname(process.execPath), process.env.PATH]
  .filter((entry): entry is string => Boolean(entry))
  .join(path.delimiter);

const canonicalEntryIds = Array.from(
  { length: 180 },
  (_, index) => `00000000-0000-4000-8000-${String(index + 1001).padStart(12, "0")}`,
);
const expectedCanonicalEntryFingerprint =
  "826da961001bc2f5de2bcd765e9b8b7d3694a0369a8f76182ca84c211868523d";

const baseEnvironment: NodeJS.ProcessEnv = {
  ...process.env,
  PATH: verificationPath,
  NODE_ENV: "test",
  DATABASE_URL: testDatabaseUrl,
  TEST_DATABASE_URL: testDatabaseUrl,
  APP_URL: verificationAppUrl,
  APP_SECRET: verificationSecret,
  NEXT_PUBLIC_APP_NAME: "Agent Sözlük",
  SESSION_COOKIE_NAME: "ajan_session",
  TERMS_VERSION: "1.0",
  TRUST_PROXY: "true",
  TRUST_PROXY_HOPS: "0",
  HOSTNAME: "0.0.0.0",
  PORT: verificationUrl.port,
  SEED_DEMO: "false",
  DEMO_PASSWORD: verificationDemoPassword,
  NEXT_TELEMETRY_DISABLED: "1",
};

function run(label: string, command: string, args: string[], environment = baseEnvironment): void {
  process.stdout.write(`\n==> ${label}\n`);
  const result = spawnSync(command, args, { env: environment, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}.`);
}

function runPnpm(label: string, args: string[], environment = baseEnvironment): void {
  const pnpmCli = process.env.npm_execpath;
  if (pnpmCli) run(label, process.execPath, [pnpmCli, ...args], environment);
  else run(label, "pnpm", args, environment);
}

function composeValidationEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const key of [
    "APP_IMAGE",
    "APP_PORT",
    "APP_SECRET",
    "APP_URL",
    "COMPOSE_FILE",
    "COMPOSE_PROFILES",
    "COMPOSE_PROJECT_NAME",
    "DATABASE_URL",
    "DEMO_PASSWORD",
    "LOG_LEVEL",
    "NEXT_PUBLIC_APP_NAME",
    "NEXT_TELEMETRY_DISABLED",
    "NODE_ENV",
    "POSTGRES_DB",
    "POSTGRES_PASSWORD",
    "POSTGRES_USER",
    "SEED_DEMO",
    "SESSION_COOKIE_NAME",
    "SESSION_TTL_DAYS",
    "TERMS_VERSION",
    "TRUST_PROXY",
    "TRUST_PROXY_HOPS",
  ]) {
    delete environment[key];
  }
  return environment;
}

function runComposeConfig(): void {
  const environment = composeValidationEnvironment();
  const plugin = spawnSync("docker", ["compose", "version"], { stdio: "ignore" });
  if (plugin.status === 0) {
    run(
      "Docker Compose config",
      "docker",
      ["compose", "--file", "compose.yaml", "--env-file", ".env.example", "config"],
      environment,
    );
    return;
  }
  const standalone = spawnSync("docker-compose", ["version"], { stdio: "ignore" });
  if (standalone.status === 0) {
    run(
      "Docker Compose config",
      "docker-compose",
      ["--file", "compose.yaml", "--env-file", ".env.example", "config"],
      environment,
    );
    return;
  }
  throw new Error("Neither 'docker compose' nor 'docker-compose' is available.");
}

async function canonicalSeedFingerprint(): Promise<string> {
  const database = getDatabase();
  try {
    const entries = await database.entry.findMany({
      where: { id: { in: canonicalEntryIds } },
      orderBy: { id: "asc" },
      select: { id: true, topicId: true, authorId: true, body: true, status: true, origin: true },
    });
    if (
      entries.length !== canonicalEntryIds.length ||
      entries.some((entry) => entry.origin !== "SEED" || entry.status !== "ACTIVE")
    ) {
      throw new Error(
        `Canonical seed corpus check failed: expected ${canonicalEntryIds.length} ACTIVE SEED entries, found ${entries.length}.`,
      );
    }
    const seedEntryCount = await database.entry.count({ where: { origin: "SEED" } });
    if (seedEntryCount !== canonicalEntryIds.length) {
      throw new Error(
        `Canonical seed corpus check failed: expected exactly ${canonicalEntryIds.length} SEED entries, found ${seedEntryCount}.`,
      );
    }
    const fingerprint = createHash("sha256").update(JSON.stringify(entries)).digest("hex");
    if (fingerprint !== expectedCanonicalEntryFingerprint) {
      throw new Error(
        "Canonical seed corpus check failed: IDs, topic, author or original body differ from the locked M1 corpus.",
      );
    }
    return fingerprint;
  } finally {
    await database.$disconnect();
  }
}

async function assertCounterConsistency(): Promise<void> {
  const database = getDatabase();
  try {
    const [result] = await database.$queryRaw<CounterMismatchRow[]>`
      SELECT
        (
          SELECT COUNT(*)
          FROM "entries" AS entry
          WHERE
            entry."upvoteCount" <> (
              SELECT COUNT(*) FROM "entry_votes" AS vote
              WHERE vote."entryId" = entry."id" AND vote."value" = 1
            )
            OR entry."downvoteCount" <> (
              SELECT COUNT(*) FROM "entry_votes" AS vote
              WHERE vote."entryId" = entry."id" AND vote."value" = -1
            )
            OR entry."score" <> (
              SELECT COALESCE(SUM(vote."value"), 0) FROM "entry_votes" AS vote
              WHERE vote."entryId" = entry."id"
            )
        ) AS "entryMismatches",
        (
          SELECT COUNT(*)
          FROM "topics" AS topic
          WHERE
            topic."entryCount" <> (
              SELECT COUNT(*) FROM "entries" AS entry
              WHERE entry."topicId" = topic."id" AND entry."status" = 'ACTIVE'
            )
            OR topic."lastEntryAt" IS DISTINCT FROM (
              SELECT MAX(entry."createdAt") FROM "entries" AS entry
              WHERE entry."topicId" = topic."id" AND entry."status" = 'ACTIVE'
            )
        ) AS "topicMismatches"
    `;
    const entryMismatches = Number(result?.entryMismatches ?? -1);
    const topicMismatches = Number(result?.topicMismatches ?? -1);
    process.stdout.write(
      `Counter consistency: entry mismatches ${entryMismatches}; topic mismatches ${topicMismatches}.\n`,
    );
    if (entryMismatches !== 0 || topicMismatches !== 0) {
      throw new Error("Counter consistency check failed.");
    }
  } finally {
    await database.$disconnect();
  }
}

async function main(): Promise<void> {
  Object.assign(process.env, baseEnvironment);
  runPnpm("generate Prisma client", ["db:generate"]);
  runPnpm("clean test database", ["exec", "prisma", "migrate", "reset", "--force", "--skip-seed"]);
  runPnpm("deploy migrations", ["db:deploy"]);
  const seedEnvironment: NodeJS.ProcessEnv = {
    ...baseEnvironment,
    NODE_ENV: "test",
    SEED_DEMO: "true",
  };
  runPnpm("seed first run", ["db:seed"], seedEnvironment);
  const canonicalFingerprint = await canonicalSeedFingerprint();
  runPnpm("seed second run", ["db:seed"], seedEnvironment);
  const repeatedCanonicalFingerprint = await canonicalSeedFingerprint();
  if (canonicalFingerprint !== repeatedCanonicalFingerprint) {
    throw new Error("Canonical seed corpus changed during the idempotent seed check.");
  }
  process.stdout.write(
    "Canonical seed corpus: 180 ACTIVE SEED entries retained; IDs and content stayed stable across the second seed run.\n",
  );
  runPnpm("recalculate counters", ["db:recalculate"]);
  await assertCounterConsistency();
  runPnpm("format", ["format:check"]);
  runPnpm("lint", ["lint"]);
  runPnpm("typecheck", ["typecheck"]);
  runPnpm("unit tests", ["test:unit"]);
  runPnpm("integration tests", ["test:integration"]);
  runPnpm("coverage", ["test:coverage"]);
  runPnpm("OpenAPI", ["openapi:validate"]);
  runPnpm("production build", ["build"], { ...baseEnvironment, NODE_ENV: "production" });
  runPnpm("E2E", ["test:e2e"], {
    ...baseEnvironment,
    E2E_APP_URL: verificationAppUrl,
    E2E_PRODUCTION_SERVER: "true",
  });
  runPnpm("requirements", ["requirements:check"]);
  runComposeConfig();
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "M1 verification failed."}\n`);
  process.exitCode = 1;
});
