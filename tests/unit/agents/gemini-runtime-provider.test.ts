import { inspect } from "node:util";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import type { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AGENT_RUNTIME_GEMINI_PROFILES,
  agentRuntimeGeminiProfileNames,
  type AgentRuntimeGeminiProfileName,
} from "@/runtime/gemini-profiles";
import {
  GeminiRuntimeProvider,
  buildGeminiStructuredPrompt,
  geminiRuntimeArguments,
  isCompletableJsonObjectPrefix,
  parseGeminiStreamTokenUsage,
  parseGeminiStructuredOutput,
  safeGeminiRuntimeFailure,
} from "@/runtime/gemini-runtime-provider";
import { geminiWriterSettings } from "@/runtime/gemini-cli-provider";
import { buildMainRuntimeProvider } from "@/runtime/main-provider";
import { CodexCliProvider } from "@/runtime/codex-cli-provider";
import {
  RuntimeProviderCancelledError,
  RuntimeProviderExecutionError,
  RuntimeProviderTimeoutError,
} from "@/runtime/provider";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function completedChild(options: {
  stdout?: string;
  stderr?: string;
  exitCode: number | null;
  exitSignal: NodeJS.Signals | null;
  chunkBytes?: number;
  closeOnKillOnly?: boolean;
  afterStdout?: () => void;
  onStdin?: (text: string) => void;
}): ChildProcessWithoutNullStreams {
  const child = new EventEmitter() as EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
    pid: number;
    kill: () => boolean;
  };
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.pid = process.pid;
  let stdinText = "";
  child.stdin.on("data", (chunk: Buffer) => {
    stdinText += chunk.toString("utf8");
  });
  child.kill = () => {
    if (options.closeOnKillOnly) setImmediate(() => child.emit("close", null, "SIGTERM"));
    return true;
  };
  child.stdin.on("finish", () => {
    options.onStdin?.(stdinText);
    void (async () => {
      const stdout = Buffer.from(options.stdout ?? "", "utf8");
      const size = options.chunkBytes ?? 65_536;
      for (let offset = 0; offset < stdout.length; offset += size) {
        child.stdout.write(stdout.subarray(offset, offset + size));
        await new Promise((resolve) => setImmediate(resolve));
      }
      options.afterStdout?.();
      if (options.closeOnKillOnly) return;
      child.stdout.end();
      child.stderr.end(options.stderr ?? "");
      setImmediate(() => child.emit("close", options.exitCode, options.exitSignal));
    })();
  });
  return child as unknown as ChildProcessWithoutNullStreams;
}

describe("GeminiRuntimeProvider security and CLI contract", () => {
  it("passes stream-json flags before -p= with no prompt or bypass flags in argv", () => {
    const args = geminiRuntimeArguments("hydrogen-high");
    expect(args.slice(0, 4)).toEqual([
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
    ]);
    expect(args.at(-1)).toBe("-p=");
    expect(args.indexOf("-p=")).toBeGreaterThan(args.indexOf("--input-format"));
    expect(args[args.indexOf("--model") + 1]).toBe("gemini-4-hydrogen-high");
    expect(args).toContain("--disable-slash-commands");
    expect(args[args.indexOf("--agent") + 1]).toBe("sozluk-writer");
    expect(JSON.parse(args[args.indexOf("--settings") + 1]!)).toEqual(geminiWriterSettings);
    expect(args).not.toContain("--json-schema");
    expect(args).not.toContain("--dangerously-skip-permissions");
    expect(args).not.toContain("--approve-all");
    expect(AGENT_RUNTIME_GEMINI_PROFILES["hydrogen-high"]).toEqual({
      model: "gemini-4-hydrogen-high",
      reasoningEffort: "high",
    });
    expect(agentRuntimeGeminiProfileNames).toContain("hydrogen-high");
  });

  it("appends the strict JSON schema contract cleanly in buildGeminiStructuredPrompt", () => {
    const prompt = buildGeminiStructuredPrompt("ANA İSTEM", {
      type: "object",
      required: ["ok"],
      additionalProperties: false,
    });
    expect(prompt).toContain("ANA İSTEM");
    expect(prompt).toContain("# Zorunlu Çıktı Biçimi (JSON Schema)");
    expect(prompt).toContain('{"type":"object","required":["ok"],"additionalProperties":false}');
  });

  it("parses token usage strictly without coercing missing optional counters to zero", () => {
    expect(
      parseGeminiStreamTokenUsage({
        input_tokens: 32_836,
        output_tokens: 14_547,
        thinking_tokens: 12_165,
        cache_read_tokens: 100,
      }),
    ).toEqual({
      inputTokens: 32_836,
      outputTokens: 14_547,
      cachedInputTokens: 100,
      reasoningOutputTokens: 12_165,
    });
    expect(parseGeminiStreamTokenUsage({ input_tokens: 20, output_tokens: 10 })).toEqual({
      inputTokens: 20,
      outputTokens: 10,
    });
    expect(
      parseGeminiStreamTokenUsage({
        input_tokens: 20,
        output_tokens: 10,
        cache_read_tokens: null,
        thinking_tokens: null,
      }),
    ).toEqual({ inputTokens: 20, outputTokens: 10 });
    for (const invalid of [
      null,
      {},
      { input_tokens: -1, output_tokens: 1 },
      { input_tokens: 1.5, output_tokens: 1 },
      { input_tokens: 1, output_tokens: 2_000_000_000 },
      { input_tokens: 1, output_tokens: 1, thinking_tokens: -3 },
    ]) {
      expect(parseGeminiStreamTokenUsage(invalid)).toBeUndefined();
    }
  });

  it("maps raw agy failure text to closed Codex-compatible safe codes", () => {
    expect(safeGeminiRuntimeFailure("SECRET", "SIGKILL")).toBe("CODEX_PROCESS_SIGNALLED");
    expect(safeGeminiRuntimeFailure("Error: --settings: unknown setting foo")).toBe(
      "CODEX_ARGUMENT_UNSUPPORTED",
    );
    expect(safeGeminiRuntimeFailure("Authentication required. Please visit URL")).toBe(
      "CODEX_AUTH_REQUIRED",
    );
    expect(safeGeminiRuntimeFailure("You have exhausted your capacity / usage limit")).toBe(
      "CODEX_USAGE_LIMITED",
    );
    expect(safeGeminiRuntimeFailure("RESOURCE_EXHAUSTED (code 429)")).toBe("CODEX_RATE_LIMITED");
    expect(safeGeminiRuntimeFailure("stream disconnected / 503 service unavailable")).toBe(
      "CODEX_UPSTREAM_UNAVAILABLE",
    );
    expect(safeGeminiRuntimeFailure("")).toBe("CODEX_EXEC_FAILED_NO_STDERR");
    expect(safeGeminiRuntimeFailure("User location is not supported")).toBe("CODEX_EXEC_FAILED");
  });

  it("parses raw JSON strictly and rejects markdown wrappers or extra text", () => {
    expect(parseGeminiStructuredOutput('{"ok":true}\n')).toEqual({ ok: true });
    for (const bad of [
      "",
      "   ",
      '```json\n{"ok":true}\n```',
      '{"ok":true}\n{"ok":false}',
      'text {"ok":true}',
      123,
    ]) {
      expect(() => parseGeminiStructuredOutput(bad)).toThrowError(RuntimeProviderExecutionError);
    }
  });

  it("makes every runtime CLI entry point honor the shared main provider configuration", () => {
    for (const script of [
      "scripts/agent-runtime-worker.ts",
      "scripts/agent-codex-status.ts",
      "scripts/agent-capability.ts",
    ]) {
      const text = readFileSync(script, "utf8");
      expect(text, script).toContain("mainRuntimeProviderEnvironmentShape");
      expect(text, script).toContain("AGENT_RUNTIME_MAIN_PROVIDER");
      expect(text, script).toContain("AGENT_RUNTIME_GEMINI_MAIN_PROFILE");
    }
  });

  it("builds Codex or Gemini providers from buildMainRuntimeProvider and rejects missing dirs", () => {
    expect(
      buildMainRuntimeProvider({
        mainProvider: "codex",
        sandboxExecutable: "/usr/bin/bwrap",
        credentialFile: "/var/lib/agent-sozluk-runtime/credentials.json",
        codexExecutable: "/usr/local/bin/codex",
        codexHome: "/opt/agent-sozluk/runtime/codex-home",
        workRoot: "/opt/agent-sozluk/runtime/work",
        codexProfile: "luna-max",
        geminiExecutable: "/usr/local/bin/agy",
        geminiProfile: "hydrogen-high",
      }),
    ).toBeInstanceOf(CodexCliProvider);

    const gem = buildMainRuntimeProvider({
      mainProvider: "gemini",
      sandboxExecutable: "/usr/bin/bwrap",
      credentialFile: "/var/lib/agent-sozluk-runtime/credentials.json",
      codexProfile: "luna-max",
      geminiExecutable: "/usr/local/bin/agy",
      geminiHome: "/opt/agent-sozluk/runtime/gemini-home",
      geminiWorkRoot: "/opt/agent-sozluk/runtime/gemini-work",
      geminiProfile: "hydrogen-high",
    });
    expect(gem).toBeInstanceOf(GeminiRuntimeProvider);
    expect(gem.providerName).toBe("gemini-cli");

    expect(() =>
      buildMainRuntimeProvider({
        mainProvider: "gemini",
        sandboxExecutable: "/usr/bin/bwrap",
        credentialFile: "/var/lib/agent-sozluk-runtime/credentials.json",
        codexProfile: "luna-max",
        geminiExecutable: "/usr/local/bin/agy",
        geminiProfile: "hydrogen-high",
      }),
    ).toThrow("AGENT_RUNTIME_GEMINI_HOME");
  });
});

describe("GeminiRuntimeProvider process handling", () => {
  async function createProvider(options: {
    spawnProcess: typeof spawn;
    profile?: AgentRuntimeGeminiProfileName;
    credentialFile?: string;
    configHome?: string;
    workRoot?: string;
  }) {
    const root = await mkdtemp(path.join(tmpdir(), "gemini-main-provider-"));
    temporaryRoots.push(root);
    const home = options.configHome ?? path.join(root, "gemini-home");
    const workRoot = options.workRoot ?? path.join(root, "gemini-work");
    const provider = new GeminiRuntimeProvider({
      executable: "/usr/local/bin/agy",
      sandboxExecutable: "/usr/bin/bwrap",
      credentialFile: options.credentialFile ?? "/var/lib/agent-sozluk-runtime/credentials.json",
      configHome: home,
      workRoot,
      geminiProfile: options.profile ?? "hydrogen-high",
      spawnProcess: options.spawnProcess,
    });
    return { provider, root, home, workRoot };
  }

  function makeSpawn(handlers: {
    version?: string;
    agents?: string;
    modelStdout?: string | ((stdin: string) => string);
    modelStderr?: string;
    exitCode?: number | null;
    exitSignal?: NodeJS.Signals | null;
    chunkBytes?: number;
    closeOnKillOnly?: boolean;
    afterStdout?: () => void;
    onCall?: (args: string[], stdin: string) => void;
  }) {
    const capturedStdin: string[] = [];
    const spawnMock = vi.fn((_cmd: string, args: string[]) => {
      const cliArgs = args.slice(args.indexOf("--") + 2);
      if (cliArgs[0] === "--version") {
        return completedChild({
          stdout: `${handlers.version ?? "1.5.18"}\n`,
          exitCode: 0,
          exitSignal: null,
        });
      }
      if (cliArgs.includes("agents")) {
        return completedChild({
          stdout: handlers.agents ?? "sozluk-writer\n",
          exitCode: 0,
          exitSignal: null,
        });
      }
      let stdoutText = typeof handlers.modelStdout === "string" ? handlers.modelStdout : "";
      return completedChild({
        stdout: stdoutText,
        stderr: handlers.modelStderr ?? "",
        exitCode: handlers.exitCode ?? 0,
        exitSignal: handlers.exitSignal ?? null,
        ...(handlers.chunkBytes ? { chunkBytes: handlers.chunkBytes } : {}),
        ...(handlers.closeOnKillOnly ? { closeOnKillOnly: true } : {}),
        ...(handlers.afterStdout ? { afterStdout: handlers.afterStdout } : {}),
        onStdin: (text) => {
          capturedStdin.push(text);
          handlers.onCall?.(args, text);
          if (typeof handlers.modelStdout === "function") stdoutText = handlers.modelStdout(text);
        },
      });
    });
    return { spawnMock: spawnMock as unknown as typeof spawn, capturedStdin };
  }

  function okStreamLines(response: unknown, usage?: Record<string, number>) {
    return [
      JSON.stringify({
        event: "init",
        conversation_id: "c1",
        init: { model: "gemini-4-hydrogen-high", agent: "sozluk-writer", tools: [] },
      }),
      JSON.stringify({
        event: "step_update",
        step_update: { step_index: 0, state: "DONE", step_type: "user_input" },
      }),
      JSON.stringify({
        event: "step_update",
        step_update: {
          step_index: 1,
          state: "DONE",
          step_type: "agent_response",
          text_delta: JSON.stringify(response),
        },
      }),
      JSON.stringify({
        event: "result",
        result: {
          conversation_id: "c1",
          status: "SUCCESS",
          response: `${JSON.stringify(response)}\n`,
          duration_seconds: 1.5,
          num_turns: 1,
          usage: usage ?? {
            input_tokens: 1500,
            output_tokens: 200,
            thinking_tokens: 120,
            cache_read_tokens: 0,
            total_tokens: 1700,
          },
        },
      }),
    ].join("\n");
  }

  it("handles 200 KB stdin prompts in Bubblewrap without prompt args and cleans workdir", async () => {
    const bigPrompt = `BAĞLAM:${"ç".repeat(100_000)}`;
    const seenArgs: string[][] = [];
    const seenStdin: string[] = [];
    const spawnMock = vi.fn((_cmd: string, args: string[]) => {
      const cliArgs = args.slice(args.indexOf("--") + 2);
      if (cliArgs[0] === "--version")
        return completedChild({ stdout: "1.5.18\n", exitCode: 0, exitSignal: null });
      if (cliArgs.includes("agents"))
        return completedChild({ stdout: "sozluk-writer\n", exitCode: 0, exitSignal: null });
      seenArgs.push([...args]);
      return completedChild({
        stdout: okStreamLines({ actions: [], safeSummary: "tamam", state: {} }),
        exitCode: 0,
        exitSignal: null,
        onStdin: (text) => seenStdin.push(text),
      });
    });
    const { provider, home, workRoot } = await createProvider({
      spawnProcess: spawnMock as unknown as typeof spawn,
    });
    const inspected = await provider.inspect();
    expect(inspected).toEqual({
      version: "agy 1.5.18",
      supportsStructuredOutput: true,
      model: "gemini-4-hydrogen-high",
      reasoningEffort: "high",
    });

    const result = await provider.invoke({
      runId: randomUUID(),
      prompt: bigPrompt,
      outputSchema: { type: "object", required: ["safeSummary"] },
      timeoutMs: 10_000,
      debugRetentionHours: 0,
    });

    expect(result.provider).toBe("gemini-cli");
    expect(result.version).toBe("agy 1.5.18");
    expect(result.model).toBe("gemini-4-hydrogen-high");
    expect(result.reasoningEffort).toBe("high");
    expect(result.output).toEqual({ actions: [], safeSummary: "tamam", state: {} });
    expect(result.diagnostics?.tokenUsage).toEqual({
      inputTokens: 1500,
      outputTokens: 200,
      cachedInputTokens: 0,
      reasoningOutputTokens: 120,
    });
    expect(result.diagnostics?.itemCounts).toEqual({
      errorItems: 0,
      toolItems: 0,
      unknownItems: 0,
    });
    expect(seenArgs[0]!.join(" ")).not.toContain("BAĞLAM:");
    expect(seenArgs[0]).toContain(path.join(home, ".gemini", "config", "agents"));
    const ndjson = JSON.parse(seenStdin[0]!.trim()) as {
      event: string;
      message: { role: string; content: string };
    };
    expect(ndjson.event).toBe("user");
    expect(ndjson.message.role).toBe("user");
    expect(ndjson.message.content).toContain(bigPrompt);
    expect(ndjson.message.content).toContain('{"type":"object","required":["safeSummary"]}');
    expect(readdirSync(workRoot)).toEqual([]);
  });

  it("fails closed on unpinned CLI version or missing sozluk-writer agent", async () => {
    const badVersion = makeSpawn({ version: "1.5.19" });
    const p1 = await createProvider({ spawnProcess: badVersion.spawnMock });
    await expect(p1.provider.inspect()).rejects.toThrow("sürümü beklenenden farklı");
    expect(badVersion.spawnMock).toHaveBeenCalledTimes(1);

    const missingAgent = makeSpawn({ agents: "other-agent\n" });
    const p2 = await createProvider({ spawnProcess: missingAgent.spawnMock });
    await expect(
      p2.provider.invoke({
        runId: randomUUID(),
        prompt: "hi",
        outputSchema: { type: "object" },
        timeoutMs: 10_000,
      }),
    ).rejects.toThrow("özel ajanı doğrulanamadı");
    expect(missingAgent.spawnMock).toHaveBeenCalledTimes(2);
  });

  it("fails closed with CODEX_TOOL_ITEM before timeout, cancel, or exit error", async () => {
    const toolAndTimeout = makeSpawn({
      closeOnKillOnly: true,
      modelStdout: [
        JSON.stringify({
          event: "init",
          init: { model: "gemini-4-hydrogen-high", agent: "sozluk-writer", tools: [] },
        }),
        JSON.stringify({
          event: "step_update",
          step_update: {
            step_index: 2,
            state: "ACTIVE",
            step_type: "tool",
            tool_name: "read_file",
            tool_info: { name: "read_file" },
          },
        }),
        JSON.stringify({
          event: "step_update",
          step_update: {
            step_index: 2,
            state: "ERROR",
            step_type: "tool",
            tool_name: "read_file",
          },
        }),
      ].join("\n"),
    });
    const { provider } = await createProvider({ spawnProcess: toolAndTimeout.spawnMock });
    await expect(
      provider.invoke({
        runId: randomUUID(),
        prompt: "p",
        outputSchema: { type: "object" },
        timeoutMs: 500,
      }),
    ).rejects.toMatchObject({
      safeCode: "CODEX_TOOL_ITEM",
      diagnostics: { itemCounts: { toolItems: 1, errorItems: 0, unknownItems: 0 } },
    });
  });

  it("rejects init agent mismatch, unparseable stream lines, and oversized lines", async () => {
    const wrongAgent = makeSpawn({
      modelStdout: [
        JSON.stringify({ event: "init", init: { agent: "default", tools: [] } }),
        JSON.stringify({ event: "result", result: { status: "SUCCESS", response: '{"ok":true}' } }),
      ].join("\n"),
    });
    const p1 = await createProvider({ spawnProcess: wrongAgent.spawnMock });
    await expect(
      p1.provider.invoke({
        runId: randomUUID(),
        prompt: "p",
        outputSchema: { type: "object" },
        timeoutMs: 10_000,
      }),
    ).rejects.toMatchObject({ safeCode: "CODEX_EVENT_STREAM_INVALID" });

    const invalidLine = makeSpawn({ modelStdout: "jetski: not json\n" });
    const p2 = await createProvider({ spawnProcess: invalidLine.spawnMock });
    await expect(
      p2.provider.invoke({
        runId: randomUUID(),
        prompt: "p",
        outputSchema: { type: "object" },
        timeoutMs: 10_000,
      }),
    ).rejects.toMatchObject({ safeCode: "CODEX_EVENT_STREAM_INVALID" });

    const hugeLine = makeSpawn({
      modelStdout: `${JSON.stringify({ event: "step_update", step_update: { step_type: "agent_response", text_delta: "x".repeat(1_200_000) } })}\n`,
    });
    const p3 = await createProvider({ spawnProcess: hugeLine.spawnMock });
    await expect(
      p3.provider.invoke({
        runId: randomUUID(),
        prompt: "p",
        outputSchema: { type: "object" },
        timeoutMs: 10_000,
      }),
    ).rejects.toMatchObject({ safeCode: "CODEX_EVENT_STREAM_INVALID" });
  });

  it("reports genuine timeout instead of CODEX_EVENT_STREAM_INVALID when killed mid-line", async () => {
    const hanging = makeSpawn({
      closeOnKillOnly: true,
      modelStdout:
        '{"event":"init","init":{"agent":"sozluk-writer"}}\n{"event":"step_update","partial":true',
    });
    const { provider } = await createProvider({ spawnProcess: hanging.spawnMock });
    await expect(
      provider.invoke({
        runId: randomUUID(),
        prompt: "p",
        outputSchema: { type: "object" },
        timeoutMs: 300,
      }),
    ).rejects.toBeInstanceOf(RuntimeProviderTimeoutError);
  });

  it("rejects complete trailing tool event without newline on timeout and cancellation", async () => {
    const trailingToolEvent = [
      JSON.stringify({ event: "init", init: { agent: "sozluk-writer" } }),
      JSON.stringify({
        event: "step_update",
        step_update: { step_index: 1, step_type: "tool", state: "ACTIVE", tool_name: "read_file" },
      }),
    ].join("\n");

    const timedOutSpawn = makeSpawn({
      closeOnKillOnly: true,
      modelStdout: trailingToolEvent,
    });
    const p1 = await createProvider({ spawnProcess: timedOutSpawn.spawnMock });
    await expect(
      p1.provider.invoke({
        runId: randomUUID(),
        prompt: "p",
        outputSchema: { type: "object" },
        timeoutMs: 300,
      }),
    ).rejects.toMatchObject({
      name: "RuntimeProviderExecutionError",
      safeCode: "CODEX_TOOL_ITEM",
      diagnostics: { itemCounts: { toolItems: 1, errorItems: 0, unknownItems: 0 } },
    });

    const controller = new AbortController();
    const cancelledSpawn = makeSpawn({
      closeOnKillOnly: true,
      modelStdout: trailingToolEvent,
      afterStdout: () => controller.abort(),
    });
    const p2 = await createProvider({ spawnProcess: cancelledSpawn.spawnMock });
    await expect(
      p2.provider.invoke({
        runId: randomUUID(),
        prompt: "p",
        outputSchema: { type: "object" },
        timeoutMs: 10_000,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      name: "RuntimeProviderExecutionError",
      safeCode: "CODEX_TOOL_ITEM",
      diagnostics: { itemCounts: { toolItems: 1, errorItems: 0, unknownItems: 0 } },
    });

    const cancelController = new AbortController();
    const cancelledPartialSpawn = makeSpawn({
      closeOnKillOnly: true,
      modelStdout:
        '{"event":"init","init":{"agent":"sozluk-writer"}}\n{"event":"step_update","partial":true',
      afterStdout: () => cancelController.abort(),
    });
    const p3 = await createProvider({ spawnProcess: cancelledPartialSpawn.spawnMock });
    await expect(
      p3.provider.invoke({
        runId: randomUUID(),
        prompt: "p",
        outputSchema: { type: "object" },
        timeoutMs: 10_000,
        signal: cancelController.signal,
      }),
    ).rejects.toBeInstanceOf(RuntimeProviderCancelledError);
  });

  it("distinguishes completable truncated JSON object prefixes from malformed trailing lines", async () => {
    for (const validPrefix of [
      "{",
      '{"event":"step_update","partial":true',
      '{"event":"step_update","partial":tr',
      '{"a":"hello \\u00',
      '{"a":"hello \\\\',
      '{"a":12.3e-',
      '{"a":[1,2,',
      '  {"a":null',
    ]) {
      expect(isCompletableJsonObjectPrefix(validPrefix), validPrefix).toBe(true);
    }

    for (const invalidPrefix of [
      '{"event":!}',
      "not-json",
      '{"a":tx}',
      '{"a":"bad\\x"}',
      '{"a":"bad\\ ',
      '{"a":01}',
      '{"a":+1}',
      '{"a":.5}',
      '{"a":1,}',
      '{"a":[1,]}',
      '{"a":1} trailing',
      '{"a":1}',
      "[1,2",
      "123",
      '"abc"',
      '{"a":"\u0001',
    ]) {
      expect(isCompletableJsonObjectPrefix(invalidPrefix), invalidPrefix).toBe(false);
    }

    for (const malformedTail of ['{"event":!}', "not-json"]) {
      const timedOutSpawn = makeSpawn({
        closeOnKillOnly: true,
        modelStdout: `${JSON.stringify({ event: "init", init: { agent: "sozluk-writer" } })}\n${malformedTail}`,
      });
      const pTimeout = await createProvider({ spawnProcess: timedOutSpawn.spawnMock });
      await expect(
        pTimeout.provider.invoke({
          runId: randomUUID(),
          prompt: "p",
          outputSchema: { type: "object" },
          timeoutMs: 300,
        }),
      ).rejects.toMatchObject({
        name: "RuntimeProviderExecutionError",
        safeCode: "CODEX_EVENT_STREAM_INVALID",
      });

      const controller = new AbortController();
      const cancelledSpawn = makeSpawn({
        closeOnKillOnly: true,
        modelStdout: `${JSON.stringify({ event: "init", init: { agent: "sozluk-writer" } })}\n${malformedTail}`,
        afterStdout: () => controller.abort(),
      });
      const pCancel = await createProvider({ spawnProcess: cancelledSpawn.spawnMock });
      await expect(
        pCancel.provider.invoke({
          runId: randomUUID(),
          prompt: "p",
          outputSchema: { type: "object" },
          timeoutMs: 10_000,
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({
        name: "RuntimeProviderExecutionError",
        safeCode: "CODEX_EVENT_STREAM_INVALID",
      });
    }
  });

  it("classifies stream/stderr failures without leaking raw secrets or diagnostics in JSON", async () => {
    const failing = makeSpawn({
      exitCode: 1,
      modelStdout: JSON.stringify({
        event: "result",
        result: {
          status: "ERROR",
          error: "quota exceeded RAW_PROVIDER_SECRET",
        },
      }),
      modelStderr: "RAW_STDERR_SECRET",
    });
    const { provider } = await createProvider({ spawnProcess: failing.spawnMock });
    let caught: unknown;
    try {
      await provider.invoke({
        runId: randomUUID(),
        prompt: "p",
        outputSchema: { type: "object" },
        timeoutMs: 10_000,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RuntimeProviderExecutionError);
    expect(caught).toMatchObject({ safeCode: "CODEX_USAGE_LIMITED" });
    expect(JSON.parse(JSON.stringify(caught))).toEqual({
      safeCode: "CODEX_USAGE_LIMITED",
      name: "RuntimeProviderExecutionError",
    });
    expect(JSON.stringify(caught)).not.toContain("diagnostics");
    expect(inspect(caught, { showHidden: true, depth: 10 })).not.toMatch(
      /RAW_PROVIDER_SECRET|RAW_STDERR_SECRET/u,
    );
  });

  it("aborts cleanly when already cancelled before spawning", async () => {
    const spawn = makeSpawn({});
    const { provider } = await createProvider({ spawnProcess: spawn.spawnMock });
    const controller = new AbortController();
    controller.abort();
    await expect(
      provider.invoke({
        runId: randomUUID(),
        prompt: "p",
        outputSchema: { type: "object" },
        timeoutMs: 10_000,
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(RuntimeProviderCancelledError);
    expect(spawn.spawnMock).not.toHaveBeenCalled();
  });

  it("enforces symlink and protected-directory isolation", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gemini-main-iso-"));
    temporaryRoots.push(root);
    await mkdir(path.join(root, "creds"));
    await symlink(path.join(root, "creds"), path.join(root, "alias"));
    const provider = new GeminiRuntimeProvider({
      executable: "/usr/local/bin/agy",
      sandboxExecutable: "/usr/bin/bwrap",
      credentialFile: path.join(root, "alias", "credentials.json"),
      configHome: path.join(root, "creds", "sub"),
      workRoot: path.join(root, "work"),
      spawnProcess: makeSpawn({}).spawnMock,
    });
    await expect(provider.inspect()).rejects.toThrow("örtüşemez");
  });

  it("retains only sanitized output.json and output.schema.json when debugRetentionHours > 0", async () => {
    const runId = randomUUID();
    const ok = makeSpawn({
      modelStdout: okStreamLines({
        safeSummary: "Test özeti.",
        state: { curiosity: 0.5, confidence: 0.5, topicFatigue: { items: [] } },
        observations: [],
        decisionJournal: [],
        actions: [],
        beliefDeltas: [],
        relationshipDeltas: [],
        sourceProposals: [],
        memoryCandidates: [],
      }),
    });
    const { provider, workRoot } = await createProvider({ spawnProcess: ok.spawnMock });
    await provider.invoke({
      runId,
      prompt: "p",
      outputSchema: { type: "object" },
      timeoutMs: 10_000,
      debugRetentionHours: 1,
    });
    const dirs = readdirSync(workRoot);
    expect(dirs).toHaveLength(1);
    const files = readdirSync(path.join(workRoot, dirs[0]!)).sort();
    expect(files).toEqual(["output.json", "output.schema.json"]);
    expect(existsSync(path.join(workRoot, dirs[0]!, ".agents"))).toBe(false);
    const retained = JSON.parse(
      readFileSync(path.join(workRoot, dirs[0]!, "output.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(retained).toHaveProperty("candidateActions");
    expect(retained).not.toHaveProperty("state");
  });
});
