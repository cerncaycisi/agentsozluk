import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import type { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { monitorHostProcess } from "@/runtime/host-metrics";
import {
  CodexCliProvider,
  safeCodexFailure,
  sanitizeRetainedRuntimeOutput,
  parseCodexTurnUsage,
} from "@/runtime/codex-cli-provider";
import { RuntimeProviderExecutionError } from "@/runtime/provider";

const temporaryRoots: string[] = [];

function completedChild(options: {
  stdout?: string;
  stderr?: string;
  exitCode: number | null;
  exitSignal: NodeJS.Signals | null;
  closeDelayMs?: number;
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
  child.kill = () => true;
  child.stdin.on("finish", () => {
    child.stdout.end(options.stdout ?? "");
    child.stderr.end(options.stderr ?? "");
    setTimeout(
      () => child.emit("close", options.exitCode, options.exitSignal),
      options.closeDelayMs ?? 0,
    );
  });
  return child as unknown as ChildProcessWithoutNullStreams;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("Codex CLI provider security contract", () => {
  const source = readFileSync("src/runtime/codex-cli-provider.ts", "utf8");

  it("uses the inspected non-interactive structured-output flags without a shell", () => {
    for (const value of [
      '"exec"',
      '"--ephemeral"',
      '"--output-schema"',
      '"--output-last-message"',
      '"read-only"',
      '"never"',
      "shell: false",
      '"--unshare-user"',
      '"--unshare-pid"',
      '"--new-session"',
      '"--tmpfs"',
      '"--ro-bind"',
      '"--clearenv"',
    ]) {
      expect(source).toContain(value);
    }
    expect(source).not.toContain("shell: true");
    expect(source).toContain('this.#inspectCommand(["--help"]');
    expect(source).toContain('this.#inspectCommand(["exec", "--help"]');
    expect(source).toMatch(/const args = \[\s*"--ask-for-approval",\s*"never"/u);
    expect(source).toContain('AGENT_RUNTIME_CODEX_MODEL = "gpt-5.6-luna"');
    expect(source).toContain('AGENT_RUNTIME_CODEX_REASONING_EFFORT = "max"');
    expect(source).toContain('`model_reasoning_effort="${AGENT_RUNTIME_CODEX_REASONING_EFFORT}"`');
    /*
      Model shell/dosya okuma aracı KAPALI olmalı. 31 Ağustos ölçümü: araç
      açıkken prompt injection ile auth.json 8'de 1 sızıyordu, kapalıyken 0/8.
      Bu satır kaldırılırsa güvenlik açığı geri gelir; docs/CODEX_CREDENTIAL_EXPOSURE_2026-08-31.md
    */
    expect(source).toContain('"features.shell_tool=false"');
    /*
      Host geneli okuma KAPALI olmalı. `--ro-bind / /` sandbox içindeki model
      aracına `/etc`, `/home` ve host'un bütün sırlarını açıyordu (31 Ağustos
      ölçümü: `/etc/passwd` okunabilir). Bu satır geri gelirse savunma derinliği
      kaybolur.

      Allowlist ölçümle kuruldu (2 Eylül, üretim host'u): codex statik derli,
      `/lib` gerekmiyor; `/etc/ssl` olmadan TLS, DNS dosyaları olmadan ad
      çözümü kırılıyor.
    */
    expect(source).not.toMatch(/"--ro-bind",\s*"\/",\s*"\/"/u);
    for (const allowed of ['"/etc/ssl"', '"/etc/resolv.conf"', '"/etc/hosts"']) {
      expect(source).toContain(allowed);
    }
  });

  it("allowlists child environment and never forwards database or deployment credentials", () => {
    expect(source).toContain("safeEnvironment");
    expect(source).not.toMatch(/DATABASE_URL|APP_SECRET|SSH_|GITHUB_TOKEN|DOCKER_HOST/u);
    expect(source).toContain("mode: 0o700");
    expect(source).toContain("mode: 0o600");
    expect(source).toContain("detached: true");
    expect(source).toContain("credentialDirectory");
    expect(source).toContain("sandboxedCodexCommand");
    expect(source).toContain("cwd: workDirectory");
    expect(source).toContain("process.kill(-child.pid, signalName)");
    expect(source).toContain('signalTree("SIGTERM")');
    expect(source).toContain('signalTree("SIGKILL")');
    expect(source).toMatch(
      /signalTree\("SIGTERM"\);[\s\S]*setTimeout\([\s\S]*signalTree\("SIGKILL"\)[\s\S]*5000/gu,
    );
  });

  it("measures process-tree RSS and host safety counters without privileged access", async () => {
    const monitor = monitorHostProcess(process.pid, 10);
    const metrics = await monitor.stop();
    expect(metrics.processPeakRssMb).toBeGreaterThan(0);
    expect(metrics.systemPeakMemoryMb).toBeGreaterThan(0);
    expect(metrics.availableMemoryMb).toBeGreaterThan(0);
    expect(metrics.swapInMb).toBeGreaterThanOrEqual(0);
    expect(metrics.swapOutMb).toBeGreaterThanOrEqual(0);
    expect(metrics.loadAverage1m).toBeGreaterThanOrEqual(0);
  });

  it("rewrites retained output to the RUNTIME-024 safe artifact allowlist", () => {
    const topicId = randomUUID();
    const evidenceId = randomUUID();
    const retained = sanitizeRetainedRuntimeOutput({
      safeSummary: "Canonical normal-run output güvenli biçimde değerlendirildi.",
      state: { curiosity: 0.5, confidence: 0.6, topicFatigue: { items: [] } },
      observations: [
        {
          subjectType: "TOPIC",
          subjectId: topicId,
          summary: "RAW_OBSERVATION_MUST_NOT_REMAIN",
          salience: 0.8,
          provenance: "PLATFORM_EVENT",
          evidenceIds: [evidenceId],
        },
      ],
      decisionJournal: [
        {
          seq: 1,
          kind: "OPTION_SELECTED",
          subject: "safe-candidate-entry",
          summary: "RAW_DECISION_JOURNAL_MUST_NOT_REMAIN",
          confidence: 0.8,
          evidenceIds: [evidenceId],
          causedBySeqs: [],
        },
      ],
      actions: [
        {
          type: "CREATE_ENTRY",
          targetId: topicId,
          body: "Safe candidate entry body.",
          desire: 0.8,
          expectedOutcome: "Topic üzerinde sınırlı bir candidate entry üretilecek.",
          selectedOptionSeq: 1,
          safeReason: "Gözlenen topic yeni ve güvenli bir entry adayını destekliyor.",
          claimProvenance: [],
        },
      ],
      beliefDeltas: [],
      relationshipDeltas: [],
      sourceProposals: [],
      memoryCandidates: [
        {
          subjectType: "TOPIC",
          subjectId: topicId,
          summary: "RAW_MEMORY_CANDIDATE_MUST_NOT_REMAIN",
          salience: 0.7,
          provenance: "PLATFORM_EVENT",
          evidenceIds: [evidenceId],
        },
      ],
    });
    const serialized = JSON.stringify(retained);

    expect(retained).toEqual({
      candidateActions: [
        expect.objectContaining({
          sequence: 1,
          actionType: "CREATE_ENTRY",
          input: expect.objectContaining({ body: "Safe candidate entry body." }),
        }),
      ],
      safeRunSummary: {
        operationSummary: "Canonical normal-run output güvenli biçimde değerlendirildi.",
        observedItemIds: [topicId],
        shortRationale: "Canonical normal-run output güvenli biçimde değerlendirildi.",
      },
    });
    expect(serialized).not.toMatch(
      /RAW_OBSERVATION|RAW_MEMORY_CANDIDATE|RAW_DECISION_JOURNAL|topicFatigue/iu,
    );
  });

  it("maps raw CLI stderr to a closed safe code without retaining dynamic values", () => {
    const rawSecret = "RAW_PROPERTY_SECRET_MUST_NOT_LEAK";

    expect(safeCodexFailure(`Invalid schema: Missing '${rawSecret}'`)).toBe(
      "CODEX_SCHEMA_MISSING_REQUIRED",
    );
    expect(safeCodexFailure("429 rate limit exceeded")).toBe("CODEX_RATE_LIMITED");
    expect(safeCodexFailure("")).toBe("CODEX_EXEC_FAILED_NO_STDERR");
    expect(safeCodexFailure(rawSecret, "SIGKILL")).toBe("CODEX_PROCESS_SIGNALLED");
    expect(safeCodexFailure("unclassified private provider detail")).toBe("CODEX_EXEC_FAILED");
    expect(
      JSON.stringify(safeCodexFailure(`Invalid schema: Missing '${rawSecret}'`)),
    ).not.toContain(rawSecret);
    expect(JSON.stringify(safeCodexFailure(rawSecret, "SIGKILL"))).not.toMatch(
      /RAW_PROPERTY_SECRET_MUST_NOT_LEAK|SIGKILL/u,
    );
  });

  it("keeps process termination details inside the provider", async () => {
    for (const termination of [
      {
        stderr: "RAW_SIGNAL_STDERR_MUST_NOT_LEAK",
        exitCode: null,
        exitSignal: "SIGKILL",
        safeCode: "CODEX_PROCESS_SIGNALLED",
      },
      {
        stderr: "",
        exitCode: 73,
        exitSignal: null,
        safeCode: "CODEX_EXEC_FAILED_NO_STDERR",
      },
    ] as const) {
      const root = await mkdtemp(path.join(tmpdir(), "agent-sozluk-provider-termination-"));
      temporaryRoots.push(root);
      const spawnMock = vi.fn((_command: string, arguments_?: readonly string[]) => {
        const codexArguments = arguments_?.slice((arguments_?.lastIndexOf("--") ?? -1) + 2) ?? [];
        if (codexArguments.includes("--version"))
          return completedChild({
            stdout: "codex-cli 0.144.6",
            exitCode: 0,
            exitSignal: null,
            closeDelayMs: 5,
          });
        if (codexArguments.length === 1 && codexArguments[0] === "--help")
          return completedChild({
            stdout: "Codex CLI help",
            exitCode: 0,
            exitSignal: null,
            closeDelayMs: 5,
          });
        if (codexArguments[0] === "exec" && codexArguments[1] === "--help")
          return completedChild({
            stdout: "--output-schema --output-last-message",
            exitCode: 0,
            exitSignal: null,
            closeDelayMs: 5,
          });
        return completedChild(termination);
      });
      const provider = new CodexCliProvider({
        executable: "/usr/bin/false",
        sandboxExecutable: "/usr/bin/bwrap",
        credentialFile: "/var/lib/agent-sozluk-runtime/credentials.json",
        runtimeHome: path.join(root, "home"),
        workRoot: path.join(root, "work"),
        spawnProcess: spawnMock as unknown as typeof spawn,
      });

      let rejection: unknown;
      try {
        await provider.invoke({
          runId: randomUUID(),
          prompt: "termination classification test",
          outputSchema: { type: "object" },
          timeoutMs: 10_000,
        });
      } catch (error) {
        rejection = error;
      }

      expect(rejection).toBeInstanceOf(RuntimeProviderExecutionError);
      expect(rejection).toMatchObject({ safeCode: termination.safeCode });
      expect(spawnMock).toHaveBeenCalledTimes(4);
      expect(JSON.stringify(rejection)).not.toMatch(/RAW_SIGNAL_STDERR_MUST_NOT_LEAK|SIGKILL|73/u);
    }
    expect(source).not.toContain("code ?? 1");
  });
});

it("aynı run ID ile dört ardışık pilot çağrısı önceki dönüş değerini taşımaz", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-sozluk-provider-pilot-"));
  temporaryRoots.push(root);
  let sequence = 0;
  const spawnMock = vi.fn((_command: string, args?: readonly string[]) => {
    const codex = args?.slice((args.lastIndexOf("--") ?? -1) + 2) ?? [];
    if (codex.includes("--version"))
      return completedChild({ stdout: "codex-cli synthetic", exitCode: 0, exitSignal: null });
    if (codex.includes("--help"))
      return completedChild({
        stdout: "--output-schema --output-last-message",
        exitCode: 0,
        exitSignal: null,
      });
    const outputPath = codex[codex.indexOf("--output-last-message") + 1]!;
    expect(existsSync(outputPath)).toBe(false);
    writeFileSync(outputPath, JSON.stringify({ sequence: ++sequence }), { mode: 0o600 });
    return completedChild({ exitCode: 0, exitSignal: null });
  });
  const workRoot = path.join(root, "work"),
    runId = randomUUID();
  const provider = new CodexCliProvider({
    executable: "/usr/bin/false",
    sandboxExecutable: "/usr/bin/bwrap",
    credentialFile: "/var/lib/agent-sozluk-runtime/credentials.json",
    runtimeHome: path.join(root, "home"),
    workRoot,
    spawnProcess: spawnMock as unknown as typeof spawn,
  });
  const outputs: unknown[] = [];
  for (let i = 0; i < 4; i++) {
    outputs.push(
      (
        await provider.invoke({
          runId,
          prompt: "sentetik ardışık pilot",
          outputSchema: { type: "object" },
          timeoutMs: 10000,
          debugRetentionHours: 0,
        })
      ).output,
    );
    expect(existsSync(path.join(workRoot, runId))).toBe(false);
  }
  expect(outputs).toEqual([{ sequence: 1 }, { sequence: 2 }, { sequence: 3 }, { sequence: 4 }]);
});

describe("Codex token telemetry (Y6)", () => {
  const usageLine = JSON.stringify({
    type: "turn.completed",
    usage: {
      input_tokens: 24_763,
      cached_input_tokens: 24_448,
      output_tokens: 122,
      reasoning_output_tokens: 64,
    },
  });

  it("reads only numeric turn.completed usage and ignores content events", () => {
    expect(parseCodexTurnUsage(usageLine)).toEqual({
      inputTokens: 24_763,
      cachedInputTokens: 24_448,
      outputTokens: 122,
      reasoningOutputTokens: 64,
    });
    for (const line of [
      JSON.stringify({ type: "item.completed", item: { text: "turn.completed gibi metin" } }),
      JSON.stringify({ type: "turn.completed" }),
      JSON.stringify({ type: "turn.completed", usage: { input_tokens: -1, output_tokens: 1 } }),
      JSON.stringify({ type: "turn.completed", usage: { input_tokens: 1.5, output_tokens: 1 } }),
      JSON.stringify({ type: "turn.completed", usage: { output_tokens: 1 } }),
      '{"type":"turn.completed","usage":',
      JSON.stringify({ type: "turn.completed", usage: { input_tokens: null, output_tokens: 1 } }),
      JSON.stringify({
        type: "turn.completed",
        usage: { input_tokens: 1, output_tokens: 1, cached_input_tokens: -3 },
      }),
      "",
    ])
      expect(parseCodexTurnUsage(line)).toBeUndefined();
  });

  it("keeps missing or null optional counters absent instead of zero (Astra, 10 Ekim)", () => {
    expect(
      parseCodexTurnUsage(
        JSON.stringify({ type: "turn.completed", usage: { input_tokens: 20, output_tokens: 10 } }),
      ),
    ).toEqual({ inputTokens: 20, outputTokens: 10 });
    expect(
      parseCodexTurnUsage(
        JSON.stringify({
          type: "turn.completed",
          usage: { input_tokens: 20, output_tokens: 10, reasoning_output_tokens: null },
        }),
      ),
    ).toEqual({ inputTokens: 20, outputTokens: 10 });
  });

  async function invokeWithHelp(execHelp: string) {
    const root = await mkdtemp(path.join(tmpdir(), "agent-sozluk-provider-tokens-"));
    temporaryRoots.push(root);
    const decisionArguments: string[][] = [];
    const spawnMock = vi.fn((_command: string, args?: readonly string[]) => {
      const codex = args?.slice((args.lastIndexOf("--") ?? -1) + 2) ?? [];
      if (codex.includes("--version"))
        return completedChild({ stdout: "codex-cli 0.144.6", exitCode: 0, exitSignal: null });
      if (codex.length === 1 && codex[0] === "--help")
        return completedChild({ stdout: "Codex CLI help", exitCode: 0, exitSignal: null });
      if (codex[0] === "exec" && codex[1] === "--help")
        return completedChild({ stdout: execHelp, exitCode: 0, exitSignal: null });
      decisionArguments.push([...codex]);
      const outputPath = codex[codex.indexOf("--output-last-message") + 1]!;
      writeFileSync(outputPath, JSON.stringify({ ok: true }), { mode: 0o600 });
      // Olaylar parça parça gelebilir; son satırda yeni satır olmayabilir.
      const events = [
        JSON.stringify({ type: "thread.started", thread_id: "t" }),
        JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "{}" } }),
        usageLine,
      ].join("\n");
      return completedChild({ stdout: events, exitCode: 0, exitSignal: null });
    });
    const provider = new CodexCliProvider({
      executable: "/usr/bin/false",
      sandboxExecutable: "/usr/bin/bwrap",
      credentialFile: "/var/lib/agent-sozluk-runtime/credentials.json",
      runtimeHome: path.join(root, "home"),
      workRoot: path.join(root, "work"),
      spawnProcess: spawnMock as unknown as typeof spawn,
    });
    const result = await provider.invoke({
      runId: randomUUID(),
      prompt: "token telemetrisi",
      outputSchema: { type: "object" },
      timeoutMs: 10_000,
      debugRetentionHours: 0,
    });
    return { result, decisionArguments };
  }

  it("adds --json only when the CLI advertises it and carries usage into diagnostics", async () => {
    const supported = await invokeWithHelp("--output-schema --output-last-message\n      --json\n");
    expect(supported.decisionArguments[0]).toContain("--json");
    expect(supported.result.output).toEqual({ ok: true });
    expect(supported.result.diagnostics?.tokenUsage).toEqual({
      inputTokens: 24_763,
      cachedInputTokens: 24_448,
      outputTokens: 122,
      reasoningOutputTokens: 64,
    });

    const legacy = await invokeWithHelp("--output-schema --output-last-message");
    expect(legacy.decisionArguments[0]).not.toContain("--json");
    // --json yokken stdout'taki olay biçimli metin ölçüm sayılmaz (Astra, 10 Ekim).
    expect(legacy.result.diagnostics?.tokenUsage).toBeUndefined();
  });
});
