import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { chmod, lstat, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "@/lib/http/errors";
import type {
  RuntimeProvider,
  RuntimeProviderRequest,
  RuntimeProviderResult,
} from "@/runtime/provider";
import { RuntimeProviderCancelledError, RuntimeProviderTimeoutError } from "@/runtime/provider";
import { monitorHostProcess } from "@/runtime/host-metrics";
import { parseRuntimeDecisionOutput } from "@/runtime/output";

interface CodexCliProviderOptions {
  executable: string;
  sandboxExecutable: string;
  credentialFile: string;
  runtimeHome: string;
  workRoot: string;
  spawnProcess?: typeof spawn;
}

export const AGENT_RUNTIME_CODEX_MODEL = "gpt-5.6-sol";
export const AGENT_RUNTIME_CODEX_REASONING_EFFORT = "high" as const;

export const RETAINED_RUNTIME_WORK_FILES = ["output.json", "output.schema.json"] as const;
const maximumActiveRunAndCleanupGraceMs = 25 * 60 * 1000;
const runtimeWorkExpiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

function validateDebugRetentionHours(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 24)
    throw new Error("Runtime debug retention 0–24 saat aralığında olmalıdır.");
  return value;
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

function assertAbsoluteSandboxPath(label: string, value: string): void {
  if (!path.isAbsolute(value) || path.normalize(value) !== value)
    throw new Error(`${label} mutlak ve normalize bir yol olmalıdır.`);
}

function containsPath(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function sandboxedCodexCommand(
  options: CodexCliProviderOptions,
  codexArguments: string[],
  workDirectory: string,
): { command: string; args: string[]; env: NodeJS.ProcessEnv } {
  const credentialDirectory = path.dirname(options.credentialFile);
  for (const [label, value] of [
    ["Codex executable", options.executable],
    ["Codex sandbox executable", options.sandboxExecutable],
    ["Runtime credential file", options.credentialFile],
    ["Runtime Codex home", options.runtimeHome],
    ["Runtime work root", options.workRoot],
    ["Runtime work directory", workDirectory],
  ] as const)
    assertAbsoluteSandboxPath(label, value);
  if (credentialDirectory === path.parse(credentialDirectory).root)
    throw new Error("Runtime credential dizini kök dizin olamaz.");
  if (
    containsPath(credentialDirectory, options.runtimeHome) ||
    containsPath(options.runtimeHome, credentialDirectory) ||
    containsPath(credentialDirectory, options.workRoot) ||
    containsPath(options.workRoot, credentialDirectory)
  )
    throw new Error("Runtime credential dizini Codex home veya work root ile örtüşemez.");
  if (!containsPath(options.workRoot, workDirectory))
    throw new Error("Codex work directory runtime work root dışında olamaz.");

  const env = safeEnvironment(options.runtimeHome, workDirectory);
  const environmentArguments = Object.entries(env).flatMap(([key, value]) =>
    value === undefined ? [] : ["--setenv", key, value],
  );
  return {
    command: options.sandboxExecutable,
    args: [
      "--die-with-parent",
      "--new-session",
      "--unshare-user",
      "--unshare-pid",
      "--unshare-ipc",
      "--unshare-uts",
      "--clearenv",
      ...environmentArguments,
      "--ro-bind",
      "/",
      "/",
      "--proc",
      "/proc",
      "--dev",
      "/dev",
      "--tmpfs",
      "/tmp",
      "--tmpfs",
      credentialDirectory,
      "--bind",
      options.runtimeHome,
      options.runtimeHome,
      "--bind",
      workDirectory,
      workDirectory,
      "--chdir",
      workDirectory,
      "--",
      options.executable,
      ...codexArguments,
    ],
    env,
  };
}

export async function cleanupExpiredRuntimeWork(
  workRoot: string,
  retainWorkHours: number,
  nowMs = Date.now(),
): Promise<void> {
  validateDebugRetentionHours(retainWorkHours);
  const cutoff =
    nowMs -
    (retainWorkHours === 0 ? maximumActiveRunAndCleanupGraceMs : retainWorkHours * 60 * 60 * 1000);
  for (const entry of await readdir(workRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const target = path.join(workRoot, entry.name);
    if ((await stat(target)).mtimeMs < cutoff) await rm(target, { recursive: true, force: true });
  }
}

export async function finalizeRuntimeWorkDirectory(
  workDirectory: string,
  retainWorkHours: number,
): Promise<void> {
  validateDebugRetentionHours(retainWorkHours);
  if (retainWorkHours === 0) {
    await rm(workDirectory, { recursive: true, force: true });
    return;
  }
  const allowed = new Set<string>(RETAINED_RUNTIME_WORK_FILES);
  for (const entry of await readdir(workDirectory, { withFileTypes: true })) {
    const target = path.join(workDirectory, entry.name);
    if (!allowed.has(entry.name) || !entry.isFile() || !(await lstat(target)).isFile()) {
      await rm(target, { recursive: true, force: true });
      continue;
    }
    await chmod(target, 0o600);
  }
}

export function scheduleRuntimeWorkDirectoryExpiry(
  workDirectory: string,
  retainWorkHours: number,
): void {
  validateDebugRetentionHours(retainWorkHours);
  cancelRuntimeWorkDirectoryExpiry(workDirectory);
  if (retainWorkHours === 0) return;
  const timer = setTimeout(
    () => {
      if (runtimeWorkExpiryTimers.get(workDirectory) !== timer) return;
      runtimeWorkExpiryTimers.delete(workDirectory);
      void rm(workDirectory, { recursive: true, force: true }).catch(() => undefined);
    },
    retainWorkHours * 60 * 60 * 1000,
  );
  runtimeWorkExpiryTimers.set(workDirectory, timer);
  timer.unref();
}

export function cancelRuntimeWorkDirectoryExpiry(workDirectory: string): void {
  const timer = runtimeWorkExpiryTimers.get(workDirectory);
  if (!timer) return;
  clearTimeout(timer);
  runtimeWorkExpiryTimers.delete(workDirectory);
}

function collect(
  child: ChildProcessWithoutNullStreams,
  input: string,
  timeoutMs: number,
  signal?: AbortSignal,
  terminateProcessGroup = false,
): Promise<{ exitCode: number; stderr: string; timedOut: boolean; cancelled: boolean }> {
  return new Promise((resolve, reject) => {
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let cancelled = false;
    const signalTree = (signalName: NodeJS.Signals) => {
      if (terminateProcessGroup && child.pid) {
        try {
          process.kill(-child.pid, signalName);
          return;
        } catch {
          // The group may already have exited; direct PID signaling is the safe fallback.
        }
      }
      child.kill(signalName);
    };
    const terminate = () => {
      signalTree("SIGTERM");
      setTimeout(() => {
        if (!settled) signalTree("SIGKILL");
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

export function sanitizeRetainedRuntimeOutput(output: unknown): Record<string, unknown> {
  const parsed = parseRuntimeDecisionOutput(output, { allowExtendedCompatibility: true });
  if (!parsed.success) return { candidateActions: [], errorCode: "CODEX_OUTPUT_SCHEMA_INVALID" };
  return {
    candidateActions: parsed.data.actions,
    safeRunSummary: parsed.data.safeRunSummary,
  };
}

async function persistSafeRetainedRuntimeOutput(
  outputPath: string,
  output: unknown,
  errorCode: string,
): Promise<void> {
  const artifact =
    output === undefined
      ? { candidateActions: [], errorCode }
      : sanitizeRetainedRuntimeOutput(output);
  try {
    await writeFile(outputPath, JSON.stringify(artifact), { mode: 0o600, flag: "w" });
    await chmod(outputPath, 0o600);
  } catch {
    // Never retain the raw Codex file when the safe rewrite fails.
    await rm(outputPath, { force: true });
  }
}

export class CodexCliProvider implements RuntimeProvider {
  readonly #options: CodexCliProviderOptions;

  constructor(options: CodexCliProviderOptions) {
    this.#options = options;
  }

  async #inspectCommand(args: string[], timeoutMs: number, signal?: AbortSignal): Promise<string> {
    await Promise.all([
      mkdir(this.#options.runtimeHome, { recursive: true, mode: 0o700 }),
      mkdir(this.#options.workRoot, { recursive: true, mode: 0o700 }),
    ]);
    const sandboxed = sandboxedCodexCommand(this.#options, args, this.#options.workRoot);
    const child = (this.#options.spawnProcess ?? spawn)(sandboxed.command, sandboxed.args, {
      cwd: this.#options.workRoot,
      shell: false,
      detached: true,
      env: sandboxed.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    const result = await collect(
      child,
      "",
      timeoutMs,
      signal,
      this.#options.spawnProcess === undefined,
    );
    if (result.cancelled) throw new RuntimeProviderCancelledError();
    if (result.timedOut) throw new RuntimeProviderTimeoutError();
    if (result.exitCode !== 0) throw new AppError("INTERNAL_ERROR", 500, "Codex CLI incelenemedi.");
    return stdout.trim();
  }

  async #inspectWithin(
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<{
    version: string;
    supportsStructuredOutput: boolean;
    model: string;
    reasoningEffort: typeof AGENT_RUNTIME_CODEX_REASONING_EFFORT;
  }> {
    const [version, topLevelHelp, execHelp] = await Promise.all([
      this.#inspectCommand(["--version"], timeoutMs, signal),
      this.#inspectCommand(["--help"], timeoutMs, signal),
      this.#inspectCommand(["exec", "--help"], timeoutMs, signal),
    ]);
    if (topLevelHelp.length === 0)
      throw new AppError("INTERNAL_ERROR", 500, "Codex CLI yardım çıktısı incelenemedi.");
    return {
      version,
      model: AGENT_RUNTIME_CODEX_MODEL,
      reasoningEffort: AGENT_RUNTIME_CODEX_REASONING_EFFORT,
      supportsStructuredOutput:
        execHelp.includes("--output-schema") && execHelp.includes("--output-last-message"),
    };
  }

  async inspect(): Promise<{
    version: string;
    supportsStructuredOutput: boolean;
    model: string;
    reasoningEffort: typeof AGENT_RUNTIME_CODEX_REASONING_EFFORT;
  }> {
    await mkdir(this.#options.workRoot, { recursive: true, mode: 0o700 });
    // A worker restart must also sweep leftovers; otherwise the final retained run
    // could outlive the hard twenty-four-hour debug ceiling indefinitely.
    await cleanupExpiredRuntimeWork(this.#options.workRoot, 24);
    return this.#inspectWithin(10_000);
  }

  async invoke(request: RuntimeProviderRequest): Promise<RuntimeProviderResult> {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        request.runId,
      )
    )
      throw new AppError("VALIDATION_ERROR", 422, "Runtime run kimliği geçersizdir.");
    const startedAt = Date.now();
    if (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0)
      throw new RuntimeProviderTimeoutError();
    const deadlineAtMs = startedAt + request.timeoutMs;
    const remainingMs = (): number => {
      if (request.signal?.aborted) throw new RuntimeProviderCancelledError();
      const remaining = Math.ceil(deadlineAtMs - Date.now());
      if (remaining <= 0) throw new RuntimeProviderTimeoutError();
      return remaining;
    };
    const debugRetentionHours = validateDebugRetentionHours(request.debugRetentionHours ?? 0);
    const workDirectory = path.join(this.#options.workRoot, request.runId);
    const schemaPath = path.join(workDirectory, "output.schema.json");
    const outputPath = path.join(workDirectory, "output.json");
    let retainedOutput: unknown;
    let retainedErrorCode = "CODEX_RUN_INCOMPLETE";
    await Promise.all([
      mkdir(this.#options.runtimeHome, { recursive: true, mode: 0o700 }),
      mkdir(this.#options.workRoot, { recursive: true, mode: 0o700 }),
    ]);
    await cleanupExpiredRuntimeWork(this.#options.workRoot, debugRetentionHours);
    cancelRuntimeWorkDirectoryExpiry(workDirectory);
    await rm(workDirectory, { recursive: true, force: true });
    await mkdir(workDirectory, { recursive: false, mode: 0o700 });
    try {
      await writeFile(schemaPath, JSON.stringify(request.outputSchema), {
        mode: 0o600,
        flag: "wx",
      });
      await chmod(schemaPath, 0o600);
      const inspected = await this.#inspectWithin(remainingMs(), request.signal);
      if (!inspected.supportsStructuredOutput) {
        throw new AppError("INTERNAL_ERROR", 500, "Codex CLI structured output desteklemiyor.");
      }
      const args = [
        "--ask-for-approval",
        "never",
        "--model",
        AGENT_RUNTIME_CODEX_MODEL,
        "-c",
        `model_reasoning_effort="${AGENT_RUNTIME_CODEX_REASONING_EFFORT}"`,
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
      const sandboxed = sandboxedCodexCommand(this.#options, args, workDirectory);
      const child = (this.#options.spawnProcess ?? spawn)(sandboxed.command, sandboxed.args, {
        cwd: workDirectory,
        shell: false,
        detached: true,
        env: sandboxed.env,
        stdio: ["pipe", "pipe", "pipe"],
      });
      const monitor = monitorHostProcess(child.pid);
      const result = await collect(
        child,
        request.prompt,
        remainingMs(),
        request.signal,
        this.#options.spawnProcess === undefined,
      );
      const hostMetrics = await monitor.stop();
      if (result.cancelled) throw new RuntimeProviderCancelledError();
      if (result.timedOut) throw new RuntimeProviderTimeoutError();
      if (result.exitCode !== 0) {
        retainedErrorCode = safeCodexFailure(result.stderr);
        throw new AppError(
          "INTERNAL_ERROR",
          500,
          `Codex CLI run güvenli biçimde tamamlanamadı: ${retainedErrorCode}.`,
        );
      }
      let output: unknown;
      try {
        output = JSON.parse(await readFile(outputPath, "utf8")) as unknown;
        retainedOutput = output;
      } catch {
        retainedErrorCode = "CODEX_OUTPUT_INVALID";
        throw new AppError(
          "INTERNAL_ERROR",
          500,
          "Codex CLI structured output dosyası geçersiz: CODEX_OUTPUT_INVALID.",
        );
      }
      return {
        provider: "codex-cli",
        version: inspected.version,
        model: inspected.model,
        reasoningEffort: inspected.reasoningEffort,
        output,
        durationMs: Date.now() - startedAt,
        hostMetrics,
      };
    } finally {
      if (debugRetentionHours > 0)
        await persistSafeRetainedRuntimeOutput(outputPath, retainedOutput, retainedErrorCode);
      await finalizeRuntimeWorkDirectory(workDirectory, debugRetentionHours);
      scheduleRuntimeWorkDirectoryExpiry(workDirectory, debugRetentionHours);
    }
  }
}
