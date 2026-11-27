import { z } from "zod";
import {
  capacityBenchmarkRequest,
  invokeWithStructuredRepair,
} from "../src/runtime/capability-benchmark";
import { agentRuntimeCodexProfileNames } from "../src/runtime/codex-cli-provider";
import {
  buildMainRuntimeProvider,
  mainRuntimeProviderEnvironmentShape,
  protectedRuntimeDirectoriesFromEnvironment,
  validateMainRuntimeProviderEnvironment,
} from "../src/runtime/main-provider";
import { parseRuntimeDecisionOutput } from "../src/runtime/output";

const environmentSchema = z
  .object({
    CODEX_EXECUTABLE: z.string().min(1).default("/usr/local/bin/codex"),
    CODEX_SANDBOX_EXECUTABLE: z.string().min(1).default("/usr/bin/bwrap"),
    AGENT_RUNTIME_CODEX_PROFILE: z.enum(agentRuntimeCodexProfileNames).default("luna-max"),
    AGENT_RUNTIME_CREDENTIAL_FILE: z
      .string()
      .min(1)
      .default("/var/lib/agent-sozluk-runtime/credentials.json"),
    ...mainRuntimeProviderEnvironmentShape,
    AGENT_RUNTIME_CODEX_HOME: z.string().min(1).optional(),
    AGENT_RUNTIME_WORK_ROOT: z.string().min(1).optional(),
    AGENT_RUNTIME_STATUS_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(30_000)
      .max(10 * 60_000)
      .default(3 * 60_000),
  })
  .superRefine(validateMainRuntimeProviderEnvironment)
  .passthrough();

async function main(): Promise<void> {
  const environment = environmentSchema.parse(process.env);
  const provider = buildMainRuntimeProvider({
    mainProvider: environment.AGENT_RUNTIME_MAIN_PROVIDER,
    codexExecutable: environment.CODEX_EXECUTABLE,
    sandboxExecutable: environment.CODEX_SANDBOX_EXECUTABLE,
    credentialFile: environment.AGENT_RUNTIME_CREDENTIAL_FILE,
    codexHome: environment.AGENT_RUNTIME_CODEX_HOME,
    workRoot: environment.AGENT_RUNTIME_WORK_ROOT,
    // Worker ile aynı profil (Astra, 14 Ekim): ölçüm ve durum, çalışan modelin kanıtı olmalı.
    codexProfile: environment.AGENT_RUNTIME_CODEX_PROFILE,
    geminiExecutable: environment.GEMINI_EXECUTABLE,
    geminiHome: environment.AGENT_RUNTIME_GEMINI_HOME,
    geminiWorkRoot: environment.AGENT_RUNTIME_GEMINI_WORK_ROOT,
    geminiProfile: environment.AGENT_RUNTIME_GEMINI_MAIN_PROFILE,
    protectedDirectories: protectedRuntimeDirectoriesFromEnvironment(environment),
  });
  const inspected = await provider.inspect();
  const benchmark = capacityBenchmarkRequest(0);
  const result = await invokeWithStructuredRepair(provider, {
    ...benchmark.request,
    timeoutMs: environment.AGENT_RUNTIME_STATUS_TIMEOUT_MS,
  });
  const parsedDecision = parseRuntimeDecisionOutput(result.output);
  if (!parsedDecision.success) throw parsedDecision.error;
  const decision = parsedDecision.data;
  process.stdout.write(
    `${JSON.stringify({
      executableInspected: true,
      provider: result.provider,
      version: inspected.version,
      model: inspected.model,
      reasoningEffort: inspected.reasoningEffort,
      supportsStructuredOutput: inspected.supportsStructuredOutput,
      structuredDryRun: true,
      scenario: benchmark.scenario,
      durationMs: result.durationMs,
      actionCount: decision.actions.length,
      hostMetrics: result.hostMetrics,
    })}\n`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Codex CLI status probe başarısız.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
