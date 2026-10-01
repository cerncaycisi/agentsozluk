/*
  Hızlandırılmış yerel toplum simülasyonu. Gerçek worker (`AgentRuntimeWorker`), gerçek HTTP
  istemcisi ve gerçek route handler'ları süreç içinde bağlanır; veritabanı yerel simülasyon
  kopyasıdır. Model çağrısı üretimle aynı model/effort/bayraklarla, sandbox'sız.
  Kullanım: DATABASE_URL=... tsx scripts/sim/society.ts <çıktı-dizini> <tur> <eşzamanlılık>
*/
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import type { ActorContext } from "@/modules/auth/domain/actor";
import {
  createBulkAgentRuns,
  rotateAgentCredential,
  runtimeCredentialRotationSchema,
  bulkAgentRunSchema,
} from "@/modules/agents";
import { RuntimeControlPlaneHttpClient } from "@/runtime/control-plane-client";
import type { RuntimeProvider } from "@/runtime/provider";
import { AgentRuntimeWorker } from "@/runtime/worker";
import { SafeSourceReader } from "@/runtime/source-reader";
import {
  AGENT_RUNTIME_CODEX_MODEL,
  AGENT_RUNTIME_CODEX_REASONING_EFFORT,
} from "@/runtime/codex-cli-provider";
import * as lease from "@/app/api/v1/internal/agent-runtime/lease/route";
import * as heartbeat from "@/app/api/v1/internal/agent-runtime/heartbeat/route";
import * as context from "@/app/api/v1/internal/agent-runtime/runs/[runId]/context/route";
import * as actions from "@/app/api/v1/internal/agent-runtime/runs/[runId]/actions/route";
import * as execute from "@/app/api/v1/internal/agent-runtime/runs/[runId]/actions/execute/route";
import * as lifeEvents from "@/app/api/v1/internal/agent-runtime/runs/[runId]/life-events/route";
import * as memories from "@/app/api/v1/internal/agent-runtime/runs/[runId]/memories/route";
import * as sources from "@/app/api/v1/internal/agent-runtime/runs/[runId]/sources/route";
import * as attempts from "@/app/api/v1/internal/agent-runtime/runs/[runId]/sources/attempts/route";
import * as events from "@/app/api/v1/internal/agent-runtime/runs/[runId]/events/route";
import * as complete from "@/app/api/v1/internal/agent-runtime/runs/[runId]/complete/route";
import * as fail from "@/app/api/v1/internal/agent-runtime/runs/[runId]/fail/route";

type Handler = (request: NextRequest, context: { params: Promise<{ runId: string }> }) => Promise<Response>;
const runRoutes: [RegExp, Record<string, unknown>][] = [
  [/^\/runs\/([^/]+)\/context$/u, context],
  [/^\/runs\/([^/]+)\/actions\/execute$/u, execute],
  [/^\/runs\/([^/]+)\/actions$/u, actions],
  [/^\/runs\/([^/]+)\/life-events$/u, lifeEvents],
  [/^\/runs\/([^/]+)\/memories$/u, memories],
  [/^\/runs\/([^/]+)\/sources\/attempts$/u, attempts],
  [/^\/runs\/([^/]+)\/sources$/u, sources],
  [/^\/runs\/([^/]+)\/events$/u, events],
  [/^\/runs\/([^/]+)\/complete$/u, complete],
  [/^\/runs\/([^/]+)\/fail$/u, fail],
];
const prefix = "/api/v1/internal/agent-runtime";

const inProcessFetch: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  const method = (init?.method ?? "GET").toUpperCase();
  const sub = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : url.pathname;
  const request = new NextRequest(url, init as ConstructorParameters<typeof NextRequest>[1]);
  const pick = (module: Record<string, unknown>) => module[method] as Handler | undefined;
  if (sub === "/lease") return pick(lease)!(request, { params: Promise.resolve({ runId: "" }) });
  if (sub === "/heartbeat")
    return pick(heartbeat)!(request, { params: Promise.resolve({ runId: "" }) });
  for (const [pattern, module] of runRoutes) {
    const match = pattern.exec(sub);
    const handler = match ? pick(module) : undefined;
    if (match && handler) return handler(request, { params: Promise.resolve({ runId: match[1]! }) });
  }
  return new Response(JSON.stringify({ error: { code: "SIM_ROUTE_MISSING" } }), { status: 404 });
};

const provider: RuntimeProvider = {
  async inspect() {
    return {
      version: "codex-cli 0.156.0",
      supportsStructuredOutput: true,
      model: AGENT_RUNTIME_CODEX_MODEL,
      reasoningEffort: AGENT_RUNTIME_CODEX_REASONING_EFFORT,
    };
  },
  async invoke(request) {
    const dir = await mkdtemp(path.join(tmpdir(), "sim-codex-"));
    const schemaPath = path.join(dir, "schema.json");
    const outputPath = path.join(dir, "output.json");
    await writeFile(schemaPath, JSON.stringify(request.outputSchema));
    const args = [
      "--ask-for-approval", "never", "--model", AGENT_RUNTIME_CODEX_MODEL,
      "-c", `model_reasoning_effort="${AGENT_RUNTIME_CODEX_REASONING_EFFORT}"`,
      "-c", "features.shell_tool=false", "exec", "--ephemeral", "--ignore-user-config",
      "--ignore-rules", "--skip-git-repo-check", "--sandbox", "read-only",
      "--output-schema", schemaPath, "--output-last-message", outputPath, "-",
    ];
    const started = Date.now();
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn("codex", args, { cwd: dir, stdio: ["pipe", "ignore", "pipe"] });
        let stderr = "";
        child.stderr.on("data", (chunk: Buffer) => (stderr = (stderr + chunk.toString()).slice(-2000)));
        const timer = setTimeout(() => child.kill("SIGKILL"), request.timeoutMs);
        const abort = () => child.kill("SIGKILL");
        request.signal?.addEventListener("abort", abort, { once: true });
        child.on("close", (code) => {
          clearTimeout(timer);
          request.signal?.removeEventListener("abort", abort);
          if (code === 0) resolve();
          else {
            void appendFile("/tmp/sim/provider-errors.log", `${new Date().toISOString()} ${request.runId} çıkış=${code}\n${stderr.slice(-1500)}\n---\n`);
            reject(new Error(`codex çıkış ${code}`));
          }
        });
        child.stdin.end(request.prompt);
      });
      return {
        provider: "codex-cli",
        version: "codex-cli 0.156.0",
        model: AGENT_RUNTIME_CODEX_MODEL,
        reasoningEffort: AGENT_RUNTIME_CODEX_REASONING_EFFORT,
        output: JSON.parse(await readFile(outputPath, "utf8")),
        durationMs: Date.now() - started,
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
};

async function main() {
  const [outDir, roundsArg, concurrencyArg] = process.argv.slice(2);
  const rounds = Number(roundsArg ?? 1);
  const concurrency = Number(concurrencyArg ?? 3);
  await mkdir(outDir!, { recursive: true });
  const log = (line: string) => appendFile(path.join(outDir!, "sim.log"), `${new Date().toISOString()} ${line}\n`);
  const db = new PrismaClient({ log: [] });
  const admin = await db.user.findFirstOrThrow({
    where: { kind: "HUMAN", role: "ADMIN", status: "ACTIVE", username: "bootstrap_admin" },
    select: { id: true },
  });
  const actor: ActorContext = {
    actorId: admin.id, actorKind: "HUMAN", actorRole: "ADMIN", requestId: randomUUID(), origin: "API",
  };
  const agents = await db.agentProfile.findMany({
    where: { lifecycleStatus: "ACTIVE" },
    select: { id: true },
    orderBy: { id: "asc" },
    ...(process.env.SIM_AGENT_LIMIT ? { take: Number(process.env.SIM_AGENT_LIMIT) } : {}),
  });
  const credPath = path.join(outDir!, "creds.json");
  let credentials: string[];
  if (existsSync(credPath)) credentials = JSON.parse(await readFile(credPath, "utf8"));
  else {
    await db.agentRun.updateMany({
      where: { runStatus: { in: ["QUEUED", "RUNNING"] } },
      data: { runStatus: "CANCELLED", leaseOwner: null, leaseExpiresAt: null, leaseToken: null, finishedAt: new Date() },
    });
    await db.agentGlobalSettings.update({
      where: { id: "global" },
      data: { sourceReadingEnabled: process.env.SIM_SOURCE_READING === "1", schedulerEnabled: false },
    });
    credentials = [];
    for (const agent of agents) {
      const rotated = await rotateAgentCredential(db, { ...actor, requestId: randomUUID() }, agent.id,
        runtimeCredentialRotationSchema.parse({ reason: "Yerel simülasyon kimlik bilgisi." }));
      credentials.push(rotated.credential);
    }
    await writeFile(credPath, JSON.stringify(credentials), { mode: 0o600 });
    await log(`kurulum ajan=${agents.length}`);
  }
  const client = new RuntimeControlPlaneHttpClient("http://127.0.0.1:3000/", inProcessFetch);
  const workers = Array.from({ length: concurrency }, (_, index) =>
    new AgentRuntimeWorker({
      workerId: `sim-worker-${index}`,
      credentials,
      controlPlane: client,
      provider,
      processingLanes: 1,
      pollIntervalMs: 3000,
      // Gerçek haber çekme (yalnız SIM_SOURCE_READING=1): üretimdeki güvenli okuyucu.
      ...(process.env.SIM_SOURCE_READING === "1" ? { sourceReader: new SafeSourceReader() } : {}),
      onSafeEvent: (event) => void log(`${event.level} ${event.code} ${event.runId ?? ""}`),
    }),
  );
  // Üretimde worker roster senkronunu kendisi yazar; simülasyonda kimlikler zaten süreçte.
  const syncRoster = async () => {
    const loaded = await db.agentCredential.findMany({
      where: { agentProfileId: { in: agents.map(({ id }) => id) }, revokedAt: null },
      select: { id: true },
    });
    const data = {
      workerId: "sim-worker",
      desiredFingerprint: "sim",
      loadedCredentialIds: loaded.map(({ id }) => id),
      syncedAt: new Date(),
      processingLanes: 2,
    };
    await db.agentRuntimeCredentialSync.upsert({ where: { id: "global" }, create: { id: "global", ...data }, update: data });
  };
  const pendingRuns = () =>
    db.agentRun.count({ where: { runStatus: { in: ["QUEUED", "RUNNING"] }, trigger: "ADMIN_BULK" } });
  for (let round = 1; round <= rounds; round += 1) {
    await syncRoster();
    if (round === 1 && (await pendingRuns()) > 0) await log("önceki tur sürüyor, önce o bitirilecek");
    else {
      const bulk = bulkAgentRunSchema.parse({
        agentIds: agents.map(({ id }) => id),
        run: { runType: "NORMAL_WAKE", allowSourceReading: process.env.SIM_SOURCE_READING === "1" },
        confirmation: "RUN_SELECTED_AGENTS",
      });
      await createBulkAgentRuns(db, { ...actor, requestId: randomUUID() }, bulk);
    }
    await log(`tur ${round} başladı`);
    const controller = new AbortController();
    const running = workers.map((worker) => worker.run(controller.signal));
    while ((await pendingRuns()) > 0) {
      await new Promise((resolve) => setTimeout(resolve, 15_000));
      await syncRoster();
    }
    controller.abort();
    await Promise.allSettled(running);
    await log(`tur ${round} bitti`);
  }
  await db.$disconnect();
}

void main().catch(async (error: unknown) => {
  console.error("SIM_HATA", error instanceof Error ? error.stack : error);
  process.exit(1);
});
