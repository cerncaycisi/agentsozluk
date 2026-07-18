import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { chmod, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "@/lib/http/errors";
import type {
  RuntimeProvider,
  RuntimeProviderRequest,
  RuntimeProviderResult,
} from "@/runtime/provider";
import { RuntimeProviderCancelledError, RuntimeProviderTimeoutError } from "@/runtime/provider";
import { monitorHostProcess } from "@/runtime/host-metrics";

interface CodexCliProviderOptions {
  executable: string;
  runtimeHome: string;
  workRoot: string;
  retainWorkHours?: number;
  spawnProcess?: typeof spawn;
}

function safeEnvironment(runtimeHome: string, workDirectory: string): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    HOME: runtimeHome,
    CODEX_HOME: runtimeHome,
    TMPDIR: workDirectory,
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    NO_COLOR: "1",
  };
}

async function cleanupExpiredWork(workRoot: string, retainWorkHours: number): Promise<void> {
  if (retainWorkHours === 0) return;
  const cutoff = Date.now() - retainWorkHours * 60 * 60 * 1000;
  for (const entry of await readdir(workRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const target = path.join(workRoot, entry.name);
    if ((await stat(target)).mtimeMs < cutoff) await rm(target, { recursive: true, force: true });
  }
}

function collect(
  child: ChildProcessWithoutNullStreams,
  input: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<{ exitCode: number; stderr: string; timedOut: boolean; cancelled: boolean }> {
  return new Promise((resolve, reject) => {
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let cancelled = false;
    const terminate = () => {
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!settled) child.kill("SIGKILL");
      }, 5000).unref();
    };
    const onAbort = () => {
      cancelled = true;
      terminate();
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      callback();
    };
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 16_384) stderr += chunk.toString("utf8").slice(0, 16_384 - stderr.length);
    });
    child.stdout.resume();
    child.on("error", (error) => finish(() => reject(error)));
    child.on("close", (code) =>
      finish(() => resolve({ exitCode: code ?? 1, stderr, timedOut, cancelled })),
    );
    child.stdin.end(input);
    const timeout = setTimeout(() => {
      timedOut = true;
      terminate();
    }, timeoutMs);
    timeout.unref();
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function safeCodexFailure(stderr: string): string {
  if (/unexpected argument|unknown option|unrecognized option/iu.test(stderr))
    return "CODEX_ARGUMENT_UNSUPPORTED";
  if (/not logged in|login required|authentication required|unauthorized/iu.test(stderr))
    return "CODEX_AUTH_REQUIRED";
  if (/schema.{0,160}(invalid|unsupported)|invalid.{0,160}schema/iu.test(stderr)) {
    const missingProperty = stderr.match(/Missing ['"]([A-Za-z0-9_]{1,64})['"]/iu)?.[1];
    if (missingProperty) return `CODEX_SCHEMA_MISSING_REQUIRED_${missingProperty.toUpperCase()}`;
    if (/additionalProperties/iu.test(stderr)) return "CODEX_SCHEMA_ADDITIONAL_PROPERTIES";
    if (/format.{0,80}(unsupported|invalid)/iu.test(stderr))
      return "CODEX_SCHEMA_FORMAT_UNSUPPORTED";
    return "CODEX_SCHEMA_UNSUPPORTED";
  }
  if (/rate limit|usage limit|quota exceeded|too many requests/iu.test(stderr))
    return "CODEX_RATE_LIMITED";
  if (/stream disconnected|error sending request|connection (failed|refused|closed)/iu.test(stderr))
    return "CODEX_UPSTREAM_UNAVAILABLE";
  return "CODEX_EXEC_FAILED";
}

export class CodexCliProvider implements RuntimeProvider {
  readonly #options: CodexCliProviderOptions;

  constructor(options: CodexCliProviderOptions) {
    if ((options.retainWorkHours ?? 0) < 0 || (options.retainWorkHours ?? 0) > 24) {
      throw new Error("Runtime debug retention 0–24 saat aralığında olmalıdır.");
    }
    this.#options = options;
  }

  async #inspectCommand(args: string[]): Promise<string> {
    await Promise.all([
      mkdir(this.#options.runtimeHome, { recursive: true, mode: 0o700 }),
      mkdir(this.#options.workRoot, { recursive: true, mode: 0o700 }),
    ]);
    const child = (this.#options.spawnProcess ?? spawn)(this.#options.executable, args, {
      shell: false,
      env: safeEnvironment(this.#options.runtimeHome, this.#options.workRoot),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    const result = await collect(child, "", 10_000);
    if (result.exitCode !== 0) throw new AppError("INTERNAL_ERROR", 500, "Codex CLI incelenemedi.");
    return stdout.trim();
  }

  async inspect(): Promise<{ version: string; supportsStructuredOutput: boolean }> {
    const [version, help] = await Promise.all([
      this.#inspectCommand(["--version"]),
      this.#inspectCommand(["exec", "--help"]),
    ]);
    return {
      version,
      supportsStructuredOutput:
        help.includes("--output-schema") && help.includes("--output-last-message"),
    };
  }

  async invoke(request: RuntimeProviderRequest): Promise<RuntimeProviderResult> {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        request.runId,
      )
    )
      throw new AppError("VALIDATION_ERROR", 422, "Runtime run kimliği geçersizdir.");
    const startedAt = Date.now();
    const workDirectory = path.join(this.#options.workRoot, request.runId);
    const schemaPath = path.join(workDirectory, "output.schema.json");
    const outputPath = path.join(workDirectory, "output.json");
    await Promise.all([
      mkdir(this.#options.runtimeHome, { recursive: true, mode: 0o700 }),
      mkdir(this.#options.workRoot, { recursive: true, mode: 0o700 }),
    ]);
    await cleanupExpiredWork(this.#options.workRoot, this.#options.retainWorkHours ?? 0);
    await rm(workDirectory, { recursive: true, force: true });
    await mkdir(workDirectory, { recursive: false, mode: 0o700 });
    await writeFile(schemaPath, JSON.stringify(request.outputSchema), { mode: 0o600, flag: "wx" });
    await chmod(schemaPath, 0o600);
    try {
      const inspected = await this.inspect();
      if (!inspected.supportsStructuredOutput) {
        throw new AppError("INTERNAL_ERROR", 500, "Codex CLI structured output desteklemiyor.");
      }
      const args = [
        "--ask-for-approval",
        "never",
        "exec",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--skip-git-repo-check",
        "--sandbox",
        "read-only",
        "--output-schema",
        schemaPath,
        "--output-last-message",
        outputPath,
        "-",
      ];
      const child = (this.#options.spawnProcess ?? spawn)(this.#options.executable, args, {
        cwd: workDirectory,
        shell: false,
        env: safeEnvironment(this.#options.runtimeHome, workDirectory),
        stdio: ["pipe", "pipe", "pipe"],
      });
      const monitor = monitorHostProcess(child.pid);
      const result = await collect(child, request.prompt, request.timeoutMs, request.signal);
      const hostMetrics = await monitor.stop();
      if (result.cancelled) throw new RuntimeProviderCancelledError();
      if (result.timedOut) throw new RuntimeProviderTimeoutError();
      if (result.exitCode !== 0) {
        throw new AppError(
          "INTERNAL_ERROR",
          500,
          `Codex CLI run güvenli biçimde tamamlanamadı: ${safeCodexFailure(result.stderr)}.`,
        );
      }
      let output: unknown;
      try {
        output = JSON.parse(await readFile(outputPath, "utf8")) as unknown;
      } catch {
        throw new AppError(
          "INTERNAL_ERROR",
          500,
          "Codex CLI structured output dosyası geçersiz: CODEX_OUTPUT_INVALID.",
        );
      }
      return {
        provider: "codex-cli",
        version: inspected.version,
        output,
        durationMs: Date.now() - startedAt,
        hostMetrics,
      };
    } finally {
      if (!this.#options.retainWorkHours) await rm(workDirectory, { recursive: true, force: true });
    }
  }
}
