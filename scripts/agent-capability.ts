import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { runtimeCapabilityMeasurementSchema } from "../src/modules/agents/validation/capacity-schemas";
import { CodexCliProvider } from "../src/runtime/codex-cli-provider";
import {
  runCapacityBenchmark,
  runConcurrencyCapabilityTest,
} from "../src/runtime/capability-benchmark";

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
  const options = {
    baseUrl: environment.AGENT_RUNTIME_BASE_URL,
    timeoutMs: environment.AGENT_RUNTIME_BENCHMARK_TIMEOUT_MS,
    plannedContentRuns: environment.AGENT_RUNTIME_PLANNED_CONTENT_RUNS,
  };
  const result =
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
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  if (environment.AGENT_RUNTIME_CAPABILITY_OUTPUT) {
    await writeFile(environment.AGENT_RUNTIME_CAPABILITY_OUTPUT, serialized, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    process.stderr.write("Capability ölçümü güvenli output dosyasına yazıldı.\n");
  } else {
    process.stdout.write(serialized);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Capability ölçümü başarısız.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
