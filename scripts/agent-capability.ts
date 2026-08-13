import { chmod, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { runtimeCapabilityMeasurementSchema } from "../src/modules/agents/validation/capacity-schemas";
import { CodexCliProvider } from "../src/runtime/codex-cli-provider";
import {
  type CapabilityBenchmarkOptions,
  runCapacityBenchmark,
  runConcurrencyCapabilityTest,
} from "../src/runtime/capability-benchmark";
import {
  createCapabilityBenchmarkDiagnosticCollector,
  writeCapabilityBenchmarkDiagnostics,
} from "../src/runtime/capability-diagnostics";

const environmentSchema = z
  .object({
    CODEX_EXECUTABLE: z.string().min(1).default("/usr/local/bin/codex"),
    CODEX_SANDBOX_EXECUTABLE: z.string().min(1).default("/usr/bin/bwrap"),
    AGENT_RUNTIME_CREDENTIAL_FILE: z
      .string()
      .min(1)
      .default("/var/lib/agent-sozluk-runtime/credentials.json"),
    AGENT_RUNTIME_CODEX_HOME: z.string().min(1),
    AGENT_RUNTIME_WORK_ROOT: z.string().min(1),
    AGENT_RUNTIME_BASE_URL: z.string().url(),
    AGENT_RUNTIME_BENCHMARK_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(60_000)
      .max(20 * 60_000)
      .default(10 * 60_000),
    AGENT_RUNTIME_PLANNED_CONTENT_RUNS: z.coerce.number().int().min(1).max(1000).default(70),
    AGENT_RUNTIME_CAPACITY_INPUT: z.string().min(1).optional(),
    AGENT_RUNTIME_CAPABILITY_OUTPUT: z.string().min(1).optional(),
    AGENT_RUNTIME_CAPABILITY_DIAGNOSTICS_OUTPUT: z.string().min(1).optional(),
  })
  .passthrough();

async function main(): Promise<void> {
  const mode = z.enum(["capacity", "concurrency"]).parse(process.argv[2]);
  const environment = environmentSchema.parse(process.env);
  const provider = new CodexCliProvider({
    executable: environment.CODEX_EXECUTABLE,
    sandboxExecutable: environment.CODEX_SANDBOX_EXECUTABLE,
    credentialFile: environment.AGENT_RUNTIME_CREDENTIAL_FILE,
    runtimeHome: environment.AGENT_RUNTIME_CODEX_HOME,
    workRoot: environment.AGENT_RUNTIME_WORK_ROOT,
  });
  const outputPaths = [
    environment.AGENT_RUNTIME_CAPABILITY_OUTPUT,
    environment.AGENT_RUNTIME_CAPABILITY_DIAGNOSTICS_OUTPUT,
  ].filter((value): value is string => Boolean(value));
  if (
    outputPaths.some((value) => !path.isAbsolute(value) || path.normalize(value) !== value) ||
    new Set(outputPaths).size !== outputPaths.length
  )
    throw new Error("CAPABILITY_OUTPUT_PATH_INVALID");
  const diagnostics = createCapabilityBenchmarkDiagnosticCollector(
    mode === "capacity" ? "capacity" : "concurrency",
  );
  const options: CapabilityBenchmarkOptions = {
    baseUrl: environment.AGENT_RUNTIME_BASE_URL,
    timeoutMs: environment.AGENT_RUNTIME_BENCHMARK_TIMEOUT_MS,
    plannedContentRuns: environment.AGENT_RUNTIME_PLANNED_CONTENT_RUNS,
    diagnosticSink: diagnostics.record,
  };
  let result: Awaited<ReturnType<typeof runCapacityBenchmark>>;
  try {
    result =
      mode === "capacity"
        ? await runCapacityBenchmark(provider, options)
        : await runConcurrencyCapabilityTest(
            provider,
            options,
            runtimeCapabilityMeasurementSchema.parse(
              JSON.parse(
                await readFile(
                  environment.AGENT_RUNTIME_CAPACITY_INPUT ??
                    (() => {
                      throw new Error(
                        "Concurrency testi için AGENT_RUNTIME_CAPACITY_INPUT gereklidir.",
                      );
                    })(),
                  "utf8",
                ),
              ),
            ),
          );
  } catch (error) {
    const terminalCode =
      error instanceof Error && error.message === "CAPABILITY_BENCHMARK_EXHAUSTED"
        ? "BENCHMARK_EXHAUSTED"
        : "BENCHMARK_FAILED";
    if (environment.AGENT_RUNTIME_CAPABILITY_DIAGNOSTICS_OUTPUT)
      await writeCapabilityBenchmarkDiagnostics(
        environment.AGENT_RUNTIME_CAPABILITY_DIAGNOSTICS_OUTPUT,
        diagnostics.document(terminalCode),
      );
    process.stderr.write(`${terminalCode}\n`);
    process.exitCode = 1;
    return;
  }
  if (environment.AGENT_RUNTIME_CAPABILITY_DIAGNOSTICS_OUTPUT)
    await writeCapabilityBenchmarkDiagnostics(
      environment.AGENT_RUNTIME_CAPABILITY_DIAGNOSTICS_OUTPUT,
      diagnostics.document("BENCHMARK_COMPLETED"),
    );
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  if (environment.AGENT_RUNTIME_CAPABILITY_OUTPUT) {
    await writeFile(environment.AGENT_RUNTIME_CAPABILITY_OUTPUT, serialized, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    await chmod(environment.AGENT_RUNTIME_CAPABILITY_OUTPUT, 0o600);
    process.stderr.write("Capability ölçümü güvenli output dosyasına yazıldı.\n");
  } else {
    process.stdout.write(serialized);
  }
}

main().catch(() => {
  process.stderr.write("CAPABILITY_COMMAND_FAILED\n");
  process.exitCode = 1;
});
