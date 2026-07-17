import { readFile, stat } from "node:fs/promises";
import { z } from "zod";
import { CodexCliProvider } from "../src/runtime/codex-cli-provider";
import { RuntimeControlPlaneHttpClient } from "../src/runtime/control-plane-client";
import { AgentRuntimeWorker } from "../src/runtime/worker";

const workerEnvironmentSchema = z
  .object({
    AGENT_RUNTIME_BASE_URL: z.string().url(),
    AGENT_RUNTIME_CREDENTIAL_FILE: z.string().min(1),
    AGENT_RUNTIME_CODEX_HOME: z.string().min(1),
    AGENT_RUNTIME_WORK_ROOT: z.string().min(1),
    AGENT_RUNTIME_WORKER_ID: z
      .string()
      .min(3)
      .max(200)
      .regex(/^[A-Za-z0-9._:-]+$/u),
    CODEX_EXECUTABLE: z.string().min(1),
    AGENT_RUNTIME_POLL_MS: z.coerce.number().int().min(1000).max(60_000).default(5000),
    AGENT_RUNTIME_RETAIN_HOURS: z.coerce.number().int().min(0).max(24).default(0),
  })
  .passthrough();

const credentialFileSchema = z
  .object({
    credentials: z
      .array(z.string().regex(/^agt_[A-Za-z0-9_-]{40,100}$/u))
      .min(1)
      .max(100),
  })
  .strict();

async function main(): Promise<void> {
  const environment = workerEnvironmentSchema.parse(process.env);
  const credentialFile = await stat(environment.AGENT_RUNTIME_CREDENTIAL_FILE);
  if ((credentialFile.mode & 0o077) !== 0)
    throw new Error("Runtime credential dosyası group/other izinlerine kapalı olmalıdır.");
  const credentials = credentialFileSchema.parse(
    JSON.parse(await readFile(environment.AGENT_RUNTIME_CREDENTIAL_FILE, "utf8")),
  ).credentials;
  const provider = new CodexCliProvider({
    executable: environment.CODEX_EXECUTABLE,
    runtimeHome: environment.AGENT_RUNTIME_CODEX_HOME,
    workRoot: environment.AGENT_RUNTIME_WORK_ROOT,
    retainWorkHours: environment.AGENT_RUNTIME_RETAIN_HOURS,
  });
  const capability = await provider.inspect();
  if (!capability.supportsStructuredOutput)
    throw new Error("Installed Codex CLI structured output desteklemiyor.");
  process.stdout.write(`agent-runtime started (${capability.version})\n`);
  const worker = new AgentRuntimeWorker({
    workerId: environment.AGENT_RUNTIME_WORKER_ID,
    credentials,
    controlPlane: new RuntimeControlPlaneHttpClient(environment.AGENT_RUNTIME_BASE_URL),
    provider,
    pollIntervalMs: environment.AGENT_RUNTIME_POLL_MS,
    onSafeEvent: ({ level, code, runId }) =>
      process[level === "error" ? "stderr" : "stdout"].write(
        `${code}${runId ? ` run=${runId}` : ""}\n`,
      ),
  });
  const controller = new AbortController();
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => controller.abort());
  await worker.run(controller.signal);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown runtime worker error";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
