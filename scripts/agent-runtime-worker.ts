import { z } from "zod";
import { CodexCliProvider } from "../src/runtime/codex-cli-provider";
import { RuntimeControlPlaneHttpClient } from "../src/runtime/control-plane-client";
import { loadRuntimeCredentialFile } from "../src/runtime/credential-file";
import { AgentRuntimeWorker } from "../src/runtime/worker";
import { SafeSourceReader } from "../src/runtime/source-reader";

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
    CODEX_SANDBOX_EXECUTABLE: z.string().min(1),
    AGENT_RUNTIME_POLL_MS: z.coerce.number().int().min(1000).max(60_000).default(5000),
    AGENT_RUNTIME_STOCHASTIC_TICK_MIN_MS: z.coerce
      .number()
      .int()
      .min(60_000)
      .max(30 * 60_000)
      .default(3 * 60_000),
    AGENT_RUNTIME_STOCHASTIC_TICK_MAX_MS: z.coerce
      .number()
      .int()
      .min(60_000)
      .max(30 * 60_000)
      .default(10 * 60_000),
  })
  .refine(
    (environment) =>
      environment.AGENT_RUNTIME_STOCHASTIC_TICK_MAX_MS >=
      environment.AGENT_RUNTIME_STOCHASTIC_TICK_MIN_MS,
    { message: "Stochastic tick maksimumu minimumdan küçük olamaz." },
  )
  .passthrough();

async function main(): Promise<void> {
  const environment = workerEnvironmentSchema.parse(process.env);
  const { credentialFile, credentials } = await loadRuntimeCredentialFile(
    environment.AGENT_RUNTIME_CREDENTIAL_FILE,
  );
  const provider = new CodexCliProvider({
    executable: environment.CODEX_EXECUTABLE,
    sandboxExecutable: environment.CODEX_SANDBOX_EXECUTABLE,
    credentialFile,
    runtimeHome: environment.AGENT_RUNTIME_CODEX_HOME,
    workRoot: environment.AGENT_RUNTIME_WORK_ROOT,
  });
  const capability = await provider.inspect();
  if (!capability.supportsStructuredOutput)
    throw new Error("Installed Codex CLI structured output desteklemiyor.");
  process.stdout.write(`agent-runtime started (${capability.version})\n`);
  const controlPlane = new RuntimeControlPlaneHttpClient(environment.AGENT_RUNTIME_BASE_URL);
  const worker = new AgentRuntimeWorker({
    workerId: environment.AGENT_RUNTIME_WORKER_ID,
    credentials,
    controlPlane,
    stochasticScheduling: { credential: credentials[0]!, controlPlane },
    provider,
    sourceReader: new SafeSourceReader(),
    pollIntervalMs: environment.AGENT_RUNTIME_POLL_MS,
    stochasticTickMinimumMs: environment.AGENT_RUNTIME_STOCHASTIC_TICK_MIN_MS,
    stochasticTickMaximumMs: environment.AGENT_RUNTIME_STOCHASTIC_TICK_MAX_MS,
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
