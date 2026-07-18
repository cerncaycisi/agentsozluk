import { z } from "zod";
import { capacityBenchmarkRequest } from "../src/runtime/capability-benchmark";
import { CodexCliProvider } from "../src/runtime/codex-cli-provider";
import { normalizeRuntimeDecisionOutput, runtimeDecisionSchema } from "../src/runtime/output";

const environmentSchema = z
  .object({
    CODEX_EXECUTABLE: z.string().min(1).default("codex"),
    AGENT_RUNTIME_CODEX_HOME: z.string().min(1),
    AGENT_RUNTIME_WORK_ROOT: z.string().min(1),
    AGENT_RUNTIME_STATUS_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(30_000)
      .max(10 * 60_000)
      .default(3 * 60_000),
    AGENT_RUNTIME_RETAIN_HOURS: z.coerce.number().int().min(0).max(24).default(0),
  })
  .passthrough();

async function main(): Promise<void> {
  const environment = environmentSchema.parse(process.env);
  const provider = new CodexCliProvider({
    executable: environment.CODEX_EXECUTABLE,
    runtimeHome: environment.AGENT_RUNTIME_CODEX_HOME,
    workRoot: environment.AGENT_RUNTIME_WORK_ROOT,
    retainWorkHours: environment.AGENT_RUNTIME_RETAIN_HOURS,
  });
  const inspected = await provider.inspect();
  const benchmark = capacityBenchmarkRequest(0);
  const result = await provider.invoke({
    ...benchmark.request,
    timeoutMs: environment.AGENT_RUNTIME_STATUS_TIMEOUT_MS,
  });
  const decision = runtimeDecisionSchema.parse(normalizeRuntimeDecisionOutput(result.output));
  process.stdout.write(
    `${JSON.stringify({
      executableInspected: true,
      version: inspected.version,
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
