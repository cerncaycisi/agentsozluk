import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { AppError } from "@/lib/http/errors";
import { sandboxedWriterCommand, collectWriterProcess } from "@/runtime/claude-cli-provider";
import {
  cleanupExpiredRuntimeWork,
  finalizeRuntimeWorkDirectory,
  persistSafeRetainedRuntimeOutput,
  scheduleRuntimeWorkDirectoryExpiry,
} from "@/runtime/codex-cli-provider";
import {
  GEMINI_CLI_PINNED_VERSION,
  assertGeminiDirectoryIsolation,
  canonicalDirectory,
  geminiSandboxEnvironment,
  geminiWriterSettings,
  prepareWriterAgent,
} from "@/runtime/gemini-cli-provider";
import {
  AGENT_RUNTIME_GEMINI_PROFILES,
  type AgentRuntimeGeminiProfileName,
} from "@/runtime/gemini-profiles";
import { monitorHostProcess } from "@/runtime/host-metrics";
import {
  RuntimeProviderCancelledError,
  RuntimeProviderExecutionError,
  RuntimeProviderTimeoutError,
  type RuntimeProvider,
  type RuntimeProviderAttemptDiagnostics,
  type RuntimeProviderExecutionSafeCode,
  type RuntimeProviderHostMetrics,
  type RuntimeProviderRequest,
  type RuntimeProviderResult,
  type RuntimeProviderTokenUsage,
} from "@/runtime/provider";

/*
  Gemini ana runtime sağlayıcısı (27 Kasım 2026). Bütün karar/kapı/bakım fazlarında
  (`DECISION`, `DECISION_REPAIR`, `ACTION_WORTHINESS`, `FINAL_READ`, `NOVELTY`,
  `CONTENT_REPAIR`, `REFLECTION`, `MEMORY_CONSOLIDATION`, `SOURCE_REFRESH`, `BROWSE`)
  Codex yerine `agy 1.5.18` CLI'ını Bubblewrap içinde çalıştırır.

  Taşıma: `--input-format stream-json --output-format stream-json ... -p=` ile tek NDJSON
  kullanıcı iletisi stdin'den gönderilir. Böylece canlı `DECISION` istemlerinin 128 KiB argv
  sınırını (ölçülen p50 ~150 KB, max ~210 KB) aşması ve istemlerin süreç argümanlarında
  görünmesi ortadan kalkar. Güvenlik sözleşmesi Codex ve Gemini yazardakiyle aynıdır:
  `--agent sozluk-writer` + katı `--settings` + olay akışında araç çağrısı veya okunamayan
  olay satırı tespitinde hata/iptal/timeout'tan önce fail-closed ret.
*/

const MAX_GEMINI_STDIN_BYTES = 2 * 1024 * 1024;
const MAX_PENDING_EVENT_CHARS = 1_048_576;
const MAX_EVENT_STREAM_BYTES = 16 * 1024 * 1024;
const MAX_STDERR_CHARS = 16_384;
const MAX_STREAM_FAILURE_CHARS = 4_096;
const MAX_TOKEN_COUNT = 1_000_000_000;
const MAX_TRACKED_STEPS = 1_000;
const RUN_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const BENIGN_STEP_TYPES = new Set(["user_input", "agent_response"]);

export interface GeminiRuntimeProviderOptions {
  executable: string;
  sandboxExecutable: string;
  credentialFile: string;
  configHome: string;
  workRoot: string;
  protectedDirectories?: string[];
  geminiProfile?: AgentRuntimeGeminiProfileName;
  spawnProcess?: typeof spawn;
}

interface GeminiTerminalResult {
  status: string;
  response?: string;
  error?: string;
}

function assertAbsoluteNormalized(label: string, value: string): void {
  if (!path.isAbsolute(value) || path.normalize(value) !== value)
    throw new Error(`${label} mutlak ve normalize bir yol olmalıdır.`);
}

function validateDebugRetentionHours(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 24)
    throw new Error("Runtime debug retention 0–24 saat aralığında olmalıdır.");
  return value;
}

/** Ana istemin sonuna katı JSON Schema talimatını ekler (`--agent sozluk-writer` araçsızdır). */
export function buildGeminiStructuredPrompt(
  prompt: string,
  outputSchema: Record<string, unknown>,
): string {
  return [
    prompt,
    "",
    "# Zorunlu Çıktı Biçimi (JSON Schema)",
    "Yalnızca aşağıdaki JSON Schema ile birebir uyumlu TEK bir ham JSON nesnesi döndür; markdown kod bloğu (```), ek açıklama veya birden fazla nesne ekleme. Hiçbir araç çağırma.",
    JSON.stringify(outputSchema),
  ].join("\n");
}

/** `agy` stream-json çağrısı için argüman dizisi (`-p=` sonradan gelir, argv istem taşımaz). */
export function geminiRuntimeArguments(profile: AgentRuntimeGeminiProfileName): string[] {
  return [
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--model",
    AGENT_RUNTIME_GEMINI_PROFILES[profile].model,
    "--disable-slash-commands",
    "--agent",
    "sozluk-writer",
    "--settings",
    JSON.stringify(geminiWriterSettings),
    "-p=",
  ];
}

/** `agy` `result.usage` sayaçlarını doğrular; eksik ya da null isteğe bağlı sayaç sıfır sayılmaz. */
export function parseGeminiStreamTokenUsage(
  rawUsage: unknown,
): RuntimeProviderTokenUsage | undefined {
  if (!rawUsage || typeof rawUsage !== "object" || Array.isArray(rawUsage)) return undefined;
  const raw = rawUsage as Record<string, unknown>;
  const valid = (value: unknown): value is number =>
    Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= MAX_TOKEN_COUNT;
  const optional = (key: string): number | undefined | null => {
    if (!(key in raw) || raw[key] === null) return undefined;
    return valid(raw[key]) ? raw[key] : null;
  };
  if (!valid(raw.input_tokens) || !valid(raw.output_tokens)) return undefined;
  const cachedInputTokens = optional("cache_read_tokens");
  const reasoningOutputTokens = optional("thinking_tokens");
  if (cachedInputTokens === null || reasoningOutputTokens === null) return undefined;
  return {
    inputTokens: raw.input_tokens,
    outputTokens: raw.output_tokens,
    ...(cachedInputTokens === undefined ? {} : { cachedInputTokens }),
    ...(reasoningOutputTokens === undefined ? {} : { reasoningOutputTokens }),
  };
}

/** Ham `agy` hata metnini kapalı güvenli hata koduna çevirir; ham metni taşımaz. */
export function safeGeminiRuntimeFailure(
  text: string,
  exitSignal: NodeJS.Signals | null = null,
): RuntimeProviderExecutionSafeCode {
  if (exitSignal !== null) return "CODEX_PROCESS_SIGNALLED";
  if (
    /unknown flag|unknown option|unrecognized option|unknown setting|unexpected argument/iu.test(
      text,
    )
  )
    return "CODEX_ARGUMENT_UNSUPPORTED";
  if (
    /authentication required|not signed in|unauthenticated|invalid_grant|unauthorized|login required|\b401\b/iu.test(
      text,
    )
  )
    return "CODEX_AUTH_REQUIRED";
  if (/quota exceeded|usage limit|daily limit|weekly limit|exhausted your capacity/iu.test(text))
    return "CODEX_USAGE_LIMITED";
  if (/resource_exhausted|rate limit|too many requests|\b429\b/iu.test(text))
    return "CODEX_RATE_LIMITED";
  if (
    /stream disconnected|error sending request|connection (failed|refused|closed)|econnreset|etimedout|overloaded|at capacity|capacity unavailable|service unavailable|\b502\b|\b503\b|\b504\b|unavailable|internal error/iu.test(
      text,
    )
  )
    return "CODEX_UPSTREAM_UNAVAILABLE";
  if (text.trim().length === 0) return "CODEX_EXEC_FAILED_NO_STDERR";
  return "CODEX_EXEC_FAILED";
}

/** `result.response` alanını ham JSON olarak ayrıştırır; markdown ayıklama yapmaz. */
export function parseGeminiStructuredOutput(response: unknown): unknown {
  if (typeof response !== "string" || response.trim().length === 0)
    throw new RuntimeProviderExecutionError("CODEX_OUTPUT_INVALID");
  try {
    return JSON.parse(response) as unknown;
  } catch {
    throw new RuntimeProviderExecutionError("CODEX_OUTPUT_INVALID");
  }
}

function collectGeminiStream(
  child: ChildProcessWithoutNullStreams,
  stdinPayload: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  terminateProcessGroup: boolean,
): Promise<{
  exitCode: number | null;
  exitSignal: NodeJS.Signals | null;
  stderr: string;
  timedOut: boolean;
  cancelled: boolean;
  tokenUsage?: RuntimeProviderTokenUsage;
  itemCounts: { errorItems: number; toolItems: number; unknownItems: number };
  eventStreamOverflow: boolean;
  eventStreamInvalid: boolean;
  seenInit: boolean;
  initAgentMatches: boolean;
  terminalResult?: GeminiTerminalResult;
  streamFailure: string;
}> {
  return new Promise((resolve, reject) => {
    let stderr = "";
    let streamFailure = "";
    let pendingEvent = "";
    let stdoutBytes = 0;
    let tokenUsage: RuntimeProviderTokenUsage | undefined;
    const itemCounts = { errorItems: 0, toolItems: 0, unknownItems: 0 };
    const seenToolSteps = new Set<number>();
    const seenErrorSteps = new Set<number>();
    const seenUnknownSteps = new Set<number>();
    let toolSeen = false;
    let eventStreamOverflow = false;
    let eventStreamInvalid = false;
    let seenInit = false;
    let initAgentMatches = true;
    let terminalResult: GeminiTerminalResult | undefined;
    const stdoutDecoder = new StringDecoder("utf8");

    const appendFailure = (text: string) => {
      const cleaned = text.trim();
      if (!cleaned || streamFailure.length >= MAX_STREAM_FAILURE_CHARS) return;
      streamFailure += `${cleaned}\n`.slice(0, MAX_STREAM_FAILURE_CHARS - streamFailure.length);
    };

    const recordStep = (
      set: Set<number>,
      key: "toolItems" | "errorItems" | "unknownItems",
      stepIndex: unknown,
      countWithoutIndex: boolean,
    ) => {
      if (Number.isSafeInteger(stepIndex)) {
        const idx = stepIndex as number;
        if (set.has(idx) || set.size >= MAX_TRACKED_STEPS) return;
        set.add(idx);
        itemCounts[key] += 1;
        return;
      }
      if (countWithoutIndex) itemCounts[key] += 1;
    };

    const readEvent = (rawLine: string) => {
      const line = rawLine.trim();
      if (line.length === 0) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        eventStreamInvalid = true;
        return;
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        eventStreamInvalid = true;
        return;
      }
      const obj = parsed as Record<string, unknown>;
      const event = obj.event;
      if (event === "init") {
        seenInit = true;
        const init = obj.init;
        if (!init || typeof init !== "object" || Array.isArray(init)) {
          initAgentMatches = false;
          return;
        }
        if ((init as Record<string, unknown>).agent !== "sozluk-writer") initAgentMatches = false;
        return;
      }
      if (event === "step_update") {
        const step = obj.step_update;
        if (!step || typeof step !== "object" || Array.isArray(step)) {
          eventStreamInvalid = true;
          return;
        }
        const su = step as Record<string, unknown>;
        const stepIndex = su.step_index;
        const stepType = su.step_type;
        const state = su.state;
        const toolInfo = su.tool_info;
        const stepError = su.error;
        if (typeof stepError === "string") appendFailure(stepError);
        else if (stepError && typeof stepError === "object") {
          const msg = (stepError as Record<string, unknown>).message;
          if (typeof msg === "string") appendFailure(msg);
        }
        if (
          stepType === "tool" ||
          typeof su.tool_name === "string" ||
          (toolInfo !== undefined && toolInfo !== null)
        ) {
          toolSeen = true;
          recordStep(
            seenToolSteps,
            "toolItems",
            stepIndex,
            state === "ACTIVE" || state === "DONE" || state === "ERROR",
          );
          if (toolInfo && typeof toolInfo === "object") {
            const errObj = (toolInfo as Record<string, unknown>).error;
            if (errObj && typeof errObj === "object") {
              const msg = (errObj as Record<string, unknown>).message;
              if (typeof msg === "string") appendFailure(msg);
            }
          }
          return;
        }
        if (state === "ERROR" || stepType === "error") {
          recordStep(seenErrorSteps, "errorItems", stepIndex, true);
          return;
        }
        if (typeof stepType === "string" && BENIGN_STEP_TYPES.has(stepType)) return;
        recordStep(seenUnknownSteps, "unknownItems", stepIndex, state === "DONE");
        return;
      }
      if (event === "result") {
        const res = obj.result;
        if (!res || typeof res !== "object" || Array.isArray(res)) {
          eventStreamInvalid = true;
          return;
        }
        const record = res as Record<string, unknown>;
        tokenUsage = parseGeminiStreamTokenUsage(record.usage) ?? tokenUsage;
        terminalResult = {
          status: typeof record.status === "string" ? record.status : "",
          ...(typeof record.response === "string" ? { response: record.response } : {}),
          ...(typeof record.error === "string"
            ? { error: record.error.slice(0, MAX_STREAM_FAILURE_CHARS) }
            : {}),
        };
        if (terminalResult.error) appendFailure(terminalResult.error);
        return;
      }
      if (event === "error") {
        itemCounts.errorItems += 1;
        if (typeof obj.message === "string") appendFailure(obj.message);
        else if (typeof obj.error === "string") appendFailure(obj.error);
        return;
      }
      itemCounts.unknownItems += 1;
    };

    let settled = false;
    let timedOut = false;
    let cancelled = false;
    let terminating = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const signalTree = (signalName: NodeJS.Signals) => {
      if (terminateProcessGroup && child.pid) {
        try {
          process.kill(-child.pid, signalName);
          return;
        } catch {
          // Process group may already have exited; direct signal is safe fallback.
        }
      }
      child.kill(signalName);
    };
    const terminate = () => {
      if (terminating || settled) return;
      terminating = true;
      signalTree("SIGTERM");
      killTimer = setTimeout(() => {
        if (!settled) signalTree("SIGKILL");
      }, 5000);
      killTimer.unref();
    };
    const onAbort = () => {
      cancelled = true;
      terminate();
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      signal?.removeEventListener("abort", onAbort);
      callback();
    };

    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < MAX_STDERR_CHARS)
        stderr += chunk.toString("utf8").slice(0, MAX_STDERR_CHARS - stderr.length);
    });
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > MAX_EVENT_STREAM_BYTES) {
        eventStreamOverflow = true;
        pendingEvent = "";
        terminate();
        return;
      }
      if (eventStreamOverflow) return;
      pendingEvent += stdoutDecoder.write(chunk);
      let newline = pendingEvent.indexOf("\n");
      while (newline >= 0) {
        if (newline > MAX_PENDING_EVENT_CHARS) {
          eventStreamOverflow = true;
          pendingEvent = "";
          terminate();
          return;
        }
        readEvent(pendingEvent.slice(0, newline));
        pendingEvent = pendingEvent.slice(newline + 1);
        newline = pendingEvent.indexOf("\n");
      }
      if (pendingEvent.length > MAX_PENDING_EVENT_CHARS) {
        pendingEvent = "";
        eventStreamOverflow = true;
        terminate();
      }
    });
    child.on("error", (error) => finish(() => reject(error)));
    child.on("close", (exitCode, exitSignal) =>
      finish(() => {
        if (!eventStreamOverflow) {
          pendingEvent += stdoutDecoder.end();
          if (pendingEvent.length > MAX_PENDING_EVENT_CHARS) eventStreamOverflow = true;
          else if (pendingEvent.trim().length > 0 && !timedOut && !cancelled)
            readEvent(pendingEvent);
        }
        pendingEvent = "";
        resolve({
          exitCode,
          exitSignal,
          stderr,
          timedOut,
          cancelled,
          ...(tokenUsage ? { tokenUsage } : {}),
          itemCounts: {
            ...itemCounts,
            toolItems: Math.max(itemCounts.toolItems, toolSeen ? 1 : 0),
          },
          eventStreamOverflow,
          eventStreamInvalid,
          seenInit,
          initAgentMatches,
          ...(terminalResult ? { terminalResult } : {}),
          streamFailure,
        });
      }),
    );
    child.stdin.on("error", () => undefined);
    child.stdin.end(stdinPayload);
    const timeout = setTimeout(() => {
      timedOut = true;
      terminate();
    }, timeoutMs);
    timeout.unref();
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export class GeminiRuntimeProvider implements RuntimeProvider {
  readonly providerName = "gemini-cli" as const;
  readonly #options: GeminiRuntimeProviderOptions;
  readonly #profile: (typeof AGENT_RUNTIME_GEMINI_PROFILES)[AgentRuntimeGeminiProfileName];
  readonly #profileName: AgentRuntimeGeminiProfileName;

  constructor(options: GeminiRuntimeProviderOptions) {
    this.#options = options;
    this.#profileName = options.geminiProfile ?? "hydrogen-high";
    this.#profile = AGENT_RUNTIME_GEMINI_PROFILES[this.#profileName];
  }

  async #canonicalize(): Promise<{ home: string; workRoot: string }> {
    assertAbsoluteNormalized("Gemini executable", this.#options.executable);
    assertAbsoluteNormalized("Gemini sandbox executable", this.#options.sandboxExecutable);
    assertAbsoluteNormalized("Runtime credential file", this.#options.credentialFile);
    assertAbsoluteNormalized("Gemini config home", this.#options.configHome);
    assertAbsoluteNormalized("Gemini work root", this.#options.workRoot);
    const credentialDirectory = path.dirname(this.#options.credentialFile);
    if (credentialDirectory === path.parse(credentialDirectory).root)
      throw new Error("Runtime credential dizini kök dizin olamaz.");
    const home = await canonicalDirectory(this.#options.configHome);
    const workRoot = await canonicalDirectory(this.#options.workRoot);
    await assertGeminiDirectoryIsolation(home, workRoot, [
      credentialDirectory,
      this.#options.credentialFile,
      "/var/lib/agent-sozluk-runtime",
      "/etc/agent-sozluk",
      ...(this.#options.protectedDirectories ?? []),
    ]);
    await mkdir(path.join(home, ".gemini", "config", "agents"), { recursive: true, mode: 0o700 });
    await mkdir(workRoot, { recursive: true, mode: 0o700 });
    return { home, workRoot };
  }

  #command(
    cliArguments: string[],
    paths: { home: string; workRoot: string },
    workDirectory: string,
  ) {
    const command = sandboxedWriterCommand(
      {
        label: "Gemini",
        executable: this.#options.executable,
        sandboxExecutable: this.#options.sandboxExecutable,
        configHome: paths.home,
        workRoot: paths.workRoot,
      },
      geminiSandboxEnvironment(paths.home, workDirectory),
      cliArguments,
      workDirectory,
    );
    command.args.splice(
      command.args.indexOf("--"),
      0,
      "--ro-bind",
      path.join(workDirectory, ".agents", "agents"),
      path.join(paths.home, ".gemini", "config", "agents"),
    );
    return command;
  }

  #spawn(command: { command: string; args: string[] }, workDirectory: string) {
    return (this.#options.spawnProcess ?? spawn)(command.command, command.args, {
      cwd: workDirectory,
      shell: false,
      detached: true,
      env: { NODE_ENV: "production" },
      stdio: ["pipe", "pipe", "pipe"],
    }) as ChildProcessWithoutNullStreams;
  }

  async #capability(
    paths: { home: string; workRoot: string },
    workDirectory: string,
    deadlineAtMs: number,
    signal?: AbortSignal,
  ): Promise<string> {
    let version = "";
    for (const args of [
      ["--version"],
      ["--settings", JSON.stringify(geminiWriterSettings), "agents"],
    ]) {
      if (signal?.aborted) throw new RuntimeProviderCancelledError();
      const remaining = Math.ceil(deadlineAtMs - Date.now());
      if (remaining <= 0) throw new RuntimeProviderTimeoutError();
      const result = await collectWriterProcess(
        this.#spawn(this.#command(args, paths, workDirectory), workDirectory),
        "",
        remaining,
        signal,
        this.#options.spawnProcess === undefined,
      );
      if (result.cancelled) throw new RuntimeProviderCancelledError();
      if (result.timedOut) throw new RuntimeProviderTimeoutError();
      if (result.exitCode !== 0 || result.overflow)
        throw new AppError("INTERNAL_ERROR", 500, "Gemini CLI (agy) incelenemedi.");
      if (args[0] === "--version") {
        version = result.stdout.trim();
        if (version !== GEMINI_CLI_PINNED_VERSION)
          throw new AppError("INTERNAL_ERROR", 500, "Gemini CLI sürümü beklenenden farklı.");
      } else if (!result.stdout.split(/\r?\n/u).some((line) => line.trim() === "sozluk-writer")) {
        throw new AppError("INTERNAL_ERROR", 500, "Gemini CLI özel ajanı doğrulanamadı.");
      }
    }
    return version;
  }

  async inspect(): Promise<{
    version: string;
    supportsStructuredOutput: boolean;
    model: string;
    reasoningEffort: (typeof AGENT_RUNTIME_GEMINI_PROFILES)[AgentRuntimeGeminiProfileName]["reasoningEffort"];
  }> {
    const paths = await this.#canonicalize();
    await cleanupExpiredRuntimeWork(paths.workRoot, 24);
    const workDirectory = path.join(
      paths.workRoot,
      `inspect-${Date.now()}-${randomBytes(4).toString("hex")}`,
    );
    await mkdir(workDirectory, { recursive: false, mode: 0o700 });
    try {
      await prepareWriterAgent(workDirectory);
      const version = await this.#capability(paths, workDirectory, Date.now() + 30_000);
      return {
        version: `agy ${version}`,
        supportsStructuredOutput: true,
        model: this.#profile.model,
        reasoningEffort: this.#profile.reasoningEffort,
      };
    } finally {
      await rm(workDirectory, { recursive: true, force: true });
    }
  }

  async invoke(request: RuntimeProviderRequest): Promise<RuntimeProviderResult> {
    if (!RUN_ID_PATTERN.test(request.runId))
      throw new AppError("VALIDATION_ERROR", 422, "Runtime run kimliği geçersizdir.");
    const startedAt = Date.now();
    if (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0)
      throw new RuntimeProviderTimeoutError();
    const deadlineAtMs = startedAt + request.timeoutMs;
    const debugRetentionHours = validateDebugRetentionHours(request.debugRetentionHours ?? 0);

    let inspectMs = 0;
    let setupMs = 0;
    let modelStartedAtMs = 0;
    let hostMetrics: RuntimeProviderHostMetrics | undefined;
    let tokenUsage: RuntimeProviderTokenUsage | undefined;
    let itemCounts: { errorItems: number; toolItems: number; unknownItems: number } | undefined;
    const diagnostics = (): RuntimeProviderAttemptDiagnostics => ({
      setupMs,
      inspectMs,
      modelMs: modelStartedAtMs === 0 ? 0 : Math.max(0, Date.now() - modelStartedAtMs),
      ...(hostMetrics ? { hostMetrics } : {}),
      ...(tokenUsage ? { tokenUsage } : {}),
      ...(itemCounts ? { itemCounts } : {}),
    });
    const remainingMs = (): number => {
      if (request.signal?.aborted) throw new RuntimeProviderCancelledError(diagnostics());
      const remaining = Math.ceil(deadlineAtMs - Date.now());
      if (remaining <= 0) throw new RuntimeProviderTimeoutError(diagnostics());
      return remaining;
    };

    const structuredPrompt = buildGeminiStructuredPrompt(request.prompt, request.outputSchema);
    const stdinPayload = `${JSON.stringify({ event: "user", message: { role: "user", content: structuredPrompt } })}\n`;
    if (Buffer.byteLength(stdinPayload, "utf8") > MAX_GEMINI_STDIN_BYTES)
      throw new RuntimeProviderExecutionError("CODEX_EXEC_FAILED", diagnostics());
    if (request.signal?.aborted) throw new RuntimeProviderCancelledError(diagnostics());

    const paths = await this.#canonicalize();
    await cleanupExpiredRuntimeWork(paths.workRoot, debugRetentionHours);
    const workDirectory = path.join(
      paths.workRoot,
      `main-${request.runId}-${startedAt}-${randomBytes(4).toString("hex")}`,
    );
    const schemaPath = path.join(workDirectory, "output.schema.json");
    const outputPath = path.join(workDirectory, "output.json");
    let retainedOutput: unknown;
    let retainedErrorCode = "CODEX_RUN_INCOMPLETE";
    await mkdir(workDirectory, { recursive: false, mode: 0o700 });

    try {
      await writeFile(schemaPath, JSON.stringify(request.outputSchema), {
        mode: 0o600,
        flag: "wx",
      });
      await chmod(schemaPath, 0o600);
      await prepareWriterAgent(workDirectory);
      if (request.signal?.aborted) throw new RuntimeProviderCancelledError(diagnostics());

      const inspectStartedAtMs = Date.now();
      let cliVersion: string;
      try {
        cliVersion = await this.#capability(paths, workDirectory, deadlineAtMs, request.signal);
      } catch (error) {
        inspectMs = Date.now() - inspectStartedAtMs;
        if (error instanceof RuntimeProviderCancelledError) {
          retainedErrorCode = "CODEX_CANCELLED";
          throw new RuntimeProviderCancelledError(diagnostics());
        }
        if (error instanceof RuntimeProviderTimeoutError) {
          retainedErrorCode = "CODEX_TIMEOUT";
          throw new RuntimeProviderTimeoutError(diagnostics());
        }
        retainedErrorCode = "CODEX_EXEC_FAILED";
        throw error;
      }
      inspectMs = Date.now() - inspectStartedAtMs;

      const command = this.#command(
        geminiRuntimeArguments(this.#profileName),
        paths,
        workDirectory,
      );
      const timeoutForCall = remainingMs();
      const child = this.#spawn(command, workDirectory);
      const monitor = monitorHostProcess(child.pid);
      setupMs = Date.now() - startedAt;
      modelStartedAtMs = Date.now();
      let result: Awaited<ReturnType<typeof collectGeminiStream>>;
      try {
        result = await collectGeminiStream(
          child,
          stdinPayload,
          timeoutForCall,
          request.signal,
          this.#options.spawnProcess === undefined,
        );
      } finally {
        hostMetrics = await monitor.stop();
      }
      tokenUsage = result.tokenUsage;
      itemCounts = result.itemCounts;

      if ((itemCounts.toolItems ?? 0) > 0) {
        retainedErrorCode = "CODEX_TOOL_ITEM";
        throw new RuntimeProviderExecutionError("CODEX_TOOL_ITEM", diagnostics());
      }
      if (result.eventStreamOverflow || result.eventStreamInvalid) {
        retainedErrorCode = "CODEX_EVENT_STREAM_INVALID";
        throw new RuntimeProviderExecutionError("CODEX_EVENT_STREAM_INVALID", diagnostics());
      }
      if (result.seenInit && !result.initAgentMatches) {
        retainedErrorCode = "CODEX_EVENT_STREAM_INVALID";
        throw new RuntimeProviderExecutionError("CODEX_EVENT_STREAM_INVALID", diagnostics());
      }
      if (result.cancelled) {
        retainedErrorCode = "CODEX_CANCELLED";
        throw new RuntimeProviderCancelledError(diagnostics());
      }
      if (result.timedOut) {
        retainedErrorCode = "CODEX_TIMEOUT";
        throw new RuntimeProviderTimeoutError(diagnostics());
      }
      if (result.exitCode !== 0 || result.exitSignal !== null) {
        const failureText = [
          result.stderr,
          result.streamFailure,
          result.terminalResult?.error ?? "",
        ]
          .filter((text) => text.length > 0)
          .join("\n");
        const safeCode = safeGeminiRuntimeFailure(failureText, result.exitSignal);
        retainedErrorCode = safeCode;
        throw new RuntimeProviderExecutionError(safeCode, diagnostics());
      }
      if (!result.seenInit) {
        retainedErrorCode = "CODEX_EVENT_STREAM_INVALID";
        throw new RuntimeProviderExecutionError("CODEX_EVENT_STREAM_INVALID", diagnostics());
      }
      if (!result.terminalResult) {
        retainedErrorCode = "CODEX_OUTPUT_INVALID";
        throw new RuntimeProviderExecutionError("CODEX_OUTPUT_INVALID", diagnostics());
      }
      if (result.terminalResult.status !== "SUCCESS") {
        const failureText = [
          result.terminalResult.error ?? "",
          result.terminalResult.response ?? "",
          result.streamFailure,
          result.stderr,
        ]
          .filter((text) => text.trim().length > 0)
          .join("\n");
        delete result.terminalResult;
        const safeCode = safeGeminiRuntimeFailure(failureText);
        retainedErrorCode = safeCode;
        throw new RuntimeProviderExecutionError(safeCode, diagnostics());
      }
      let output: unknown;
      try {
        output = parseGeminiStructuredOutput(result.terminalResult.response);
        retainedOutput = output;
      } catch {
        retainedErrorCode = "CODEX_OUTPUT_INVALID";
        throw new RuntimeProviderExecutionError("CODEX_OUTPUT_INVALID", diagnostics());
      } finally {
        delete result.terminalResult;
      }
      return {
        provider: "gemini-cli",
        version: `agy ${cliVersion}`,
        model: this.#profile.model,
        reasoningEffort: this.#profile.reasoningEffort,
        output,
        durationMs: Date.now() - startedAt,
        hostMetrics,
        diagnostics: diagnostics(),
      };
    } finally {
      if (debugRetentionHours > 0) {
        await persistSafeRetainedRuntimeOutput(outputPath, retainedOutput, retainedErrorCode);
        await finalizeRuntimeWorkDirectory(workDirectory, debugRetentionHours);
        scheduleRuntimeWorkDirectoryExpiry(workDirectory, debugRetentionHours);
      } else {
        await rm(workDirectory, { recursive: true, force: true });
      }
    }
  }
}
