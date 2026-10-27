import { inspect } from "node:util";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import type { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { monitorHostProcess } from "@/runtime/host-metrics";
import {
  AGENT_RUNTIME_CODEX_PROFILES,
  CODEX_TOOL_DISABLE_ARGUMENTS,
  classifyCodexItemEvent,
  codexStreamFailureText,
  codexSupportsThreadLimit,
  codexToolFeaturesDisabled,
  CodexCliProvider,
  safeCodexFailure,
  sanitizeRetainedRuntimeOutput,
  parseCodexTurnUsage,
} from "@/runtime/codex-cli-provider";
import { RuntimeProviderExecutionError } from "@/runtime/provider";

const temporaryRoots: string[] = [];

/* Kapatma sözleşmesini sağlayan `codex features list` çıktısı (CLI 0.160.0 biçimi). */
const DISABLED_FEATURE_LIST = [
  "apply_patch_freeform                     removed            false",
  ...[
    "shell_tool",
    "apps",
    "multi_agent",
    "image_generation",
    "goals",
    "plugins",
    "remote_plugin",
    "tool_suggest",
    "code_mode_host",
    "view_image",
    "skill_search",
    "sleep_tool",
  ].map((feature) => `${feature.padEnd(41)}stable             false`),
].join("\n");
const isFeatureList = (codex: readonly string[]) =>
  codex.at(-2) === "features" && codex.at(-1) === "list";

function completedChild(options: {
  stdout?: string;
  stderr?: string;
  exitCode: number | null;
  exitSignal: NodeJS.Signals | null;
  closeDelayMs?: number;
  /** Bayt parçaları: çok baytlı karakter parça sınırında bölünebilir. */
  chunkBytes?: number;
  /** Süreç kendiliğinden kapanmaz; yalnız sinyalle kapanır (zaman aşımı). */
  closeOnKillOnly?: boolean;
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
  child.kill = () => {
    if (options.closeOnKillOnly) setImmediate(() => child.emit("close", null, "SIGTERM"));
    return true;
  };
  child.stdin.on("finish", () => {
    void (async () => {
      // Gerçek boru gibi parçalar, ayrı turlarda: büyük olay satırı birden çok parçada gelir.
      const stdout = Buffer.from(options.stdout ?? "", "utf8");
      const size = options.chunkBytes ?? 65_536;
      for (let offset = 0; offset < stdout.length; offset += size) {
        child.stdout.write(stdout.subarray(offset, offset + size));
        await new Promise((resolve) => setImmediate(resolve));
      }
      if (options.closeOnKillOnly) return;
      child.stdout.end();
      child.stderr.end(options.stderr ?? "");
      setTimeout(
        () => child.emit("close", options.exitCode, options.exitSignal),
        options.closeDelayMs ?? 0,
      );
    })();
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
    // 14 Ekim: model ve çaba kapalı profil listesinden gelir; varsayılan luna max.
    expect(source).toContain('`model_reasoning_effort="${this.#profile.reasoningEffort}"`');
    expect(source).toContain('options.codexProfile ?? "luna-max"');
    /*
      Model shell/dosya okuma aracı KAPALI olmalı. 31 Ağustos ölçümü: araç
      açıkken prompt injection ile auth.json 8'de 1 sızıyordu, kapalıyken 0/8.
      Bu satır kaldırılırsa güvenlik açığı geri gelir; docs/CODEX_CREDENTIAL_EXPOSURE_2026-08-31.md
    */
    expect(source).toContain('  "shell_tool",');
    expect(source).toContain("...CODEX_TOOL_DISABLE_ARGUMENTS,");
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
      // 19 Ekim: hata stderr'e değil `--json` olay akışına yazılıyordu.
      {
        stdout:
          '{"type":"turn.started"}\n{"type":"turn.failed","error":{"message":"You have hit your usage limit RAW_SIGNAL_STDERR_MUST_NOT_LEAK"}}\n',
        stderr: "",
        exitCode: 1,
        exitSignal: null,
        safeCode: "CODEX_RATE_LIMITED",
      },
      {
        stdout:
          '{"type":"error","message":"stream disconnected before completion RAW_SIGNAL_STDERR_MUST_NOT_LEAK"}\n',
        stderr: "",
        exitCode: 1,
        exitSignal: null,
        safeCode: "CODEX_UPSTREAM_UNAVAILABLE",
      },
      // Yeniden deneme iletileri 4 KiB bütçeyi doldurur (200 × 35 karakter); turu bitiren neden yine kırpılmaz.
      {
        stdout: `${'{"type":"error","message":"Reconnecting... connection refused"}\n'.repeat(200)}{"type":"turn.failed","error":{"message":"You have hit your usage limit"}}\n`,
        stderr: "",
        exitCode: 1,
        exitSignal: null,
        safeCode: "CODEX_RATE_LIMITED",
      },
      {
        stdout: '{"type":"error","message":"RAW_SIGNAL_STDERR_MUST_NOT_LEAK"}\n',
        stderr: "",
        exitCode: 1,
        exitSignal: null,
        safeCode: "CODEX_EXEC_FAILED",
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
            stdout: "--output-schema --output-last-message\n      --json\n",
            exitCode: 0,
            exitSignal: null,
            closeDelayMs: 5,
          });
        if (isFeatureList(codexArguments))
          return completedChild({
            stdout: DISABLED_FEATURE_LIST,
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
      expect(spawnMock).toHaveBeenCalledTimes(5);
      expect(JSON.stringify(rejection)).not.toMatch(/RAW_SIGNAL_STDERR_MUST_NOT_LEAK|SIGKILL|73/u);
      // Gizli (enumerable olmayan) alanlar, ileti ve yığın da dahil (Fable, 19 Ekim).
      expect(inspect(rejection, { showHidden: true, depth: 10 })).not.toMatch(
        /RAW_SIGNAL_STDERR_MUST_NOT_LEAK|usage limit|stream disconnected/u,
      );
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
    if (isFeatureList(codex))
      return completedChild({ stdout: DISABLED_FEATURE_LIST, exitCode: 0, exitSignal: null });
    if (codex.includes("--help"))
      return completedChild({
        stdout: "--output-schema --output-last-message\n      --json\n",
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

  async function invokeWithHelp(
    execHelp: string,
    codexProfile?:
      "luna-max" | "sol-medium" | "sol6-medium" | "terra-medium" | "sol56-medium" | "luna6-max",
    featureList = DISABLED_FEATURE_LIST,
    extraEvents: string[] = [],
    version = "codex-cli 0.144.6",
    configToml = false,
    decisionChild: { chunkBytes?: number; closeOnKillOnly?: boolean; timeoutMs?: number } = {},
  ) {
    const root = await mkdtemp(path.join(tmpdir(), "agent-sozluk-provider-tokens-"));
    temporaryRoots.push(root);
    const decisionArguments: string[][] = [];
    const spawnMock = vi.fn((_command: string, args?: readonly string[]) => {
      const codex = args?.slice((args.lastIndexOf("--") ?? -1) + 2) ?? [];
      if (codex.includes("--version"))
        return completedChild({ stdout: version, exitCode: 0, exitSignal: null });
      if (codex.length === 1 && codex[0] === "--help")
        return completedChild({ stdout: "Codex CLI help", exitCode: 0, exitSignal: null });
      if (codex[0] === "exec" && codex[1] === "--help")
        return completedChild({ stdout: execHelp, exitCode: 0, exitSignal: null });
      if (isFeatureList(codex))
        return completedChild({ stdout: featureList, exitCode: 0, exitSignal: null });
      decisionArguments.push([...codex]);
      const outputPath = codex[codex.indexOf("--output-last-message") + 1]!;
      writeFileSync(outputPath, JSON.stringify({ ok: true }), { mode: 0o600 });
      // Olaylar parça parça gelebilir; son satırda yeni satır olmayabilir.
      const events = [
        JSON.stringify({ type: "thread.started", thread_id: "t" }),
        JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "{}" } }),
        ...extraEvents,
        usageLine,
      ].join("\n");
      return completedChild({
        stdout: events,
        exitCode: 0,
        exitSignal: null,
        ...(decisionChild.chunkBytes ? { chunkBytes: decisionChild.chunkBytes } : {}),
        ...(decisionChild.closeOnKillOnly ? { closeOnKillOnly: true } : {}),
      });
    });
    const provider = new CodexCliProvider({
      executable: "/usr/bin/false",
      sandboxExecutable: "/usr/bin/bwrap",
      credentialFile: "/var/lib/agent-sozluk-runtime/credentials.json",
      runtimeHome: path.join(root, "home"),
      workRoot: path.join(root, "work"),
      ...(codexProfile ? { codexProfile } : {}),
      spawnProcess: spawnMock as unknown as typeof spawn,
    });
    if (configToml) {
      await mkdir(path.join(root, "home"), { recursive: true });
      writeFileSync(path.join(root, "home", "config.toml"), "");
    }
    const result = await provider.invoke({
      runId: randomUUID(),
      prompt: "token telemetrisi",
      outputSchema: { type: "object" },
      timeoutMs: decisionChild.timeoutMs ?? 10_000,
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

    // 15 Ekim (Astra 2. tur): araç denetimi olay akışına dayanır; --json yoksa çağrı yapılmaz.
    await expect(invokeWithHelp("--output-schema --output-last-message")).rejects.toThrow(
      "Codex CLI olay akışı (--json) desteklemiyor.",
    );
  });

  // 15 Ekim: CLI bilinmeyen `-c` anahtarını yok saydığı için sözleşme `features list` ile doğrulanır.
  it("refuses to call Codex when the CLI does not confirm the tool-disable contract", async () => {
    const help = "--output-schema --output-last-message\n      --json\n";
    const legacy = DISABLED_FEATURE_LIST.split("\n")
      .filter((line) => !/^(view_image|skill_search|sleep_tool)\s/u.test(line))
      .join("\n");
    expect(codexToolFeaturesDisabled(legacy)).toBe(true);
    const missingRequired = DISABLED_FEATURE_LIST.split("\n")
      .filter((line) => !line.startsWith("apps "))
      .join("\n");
    const optionalEnabled = DISABLED_FEATURE_LIST.replace(
      /^(view_image\s+stable\s+)false$/mu,
      "$1true",
    );
    const requiredEnabled = DISABLED_FEATURE_LIST.replace(
      /^(code_mode_host\s+stable\s+)false$/mu,
      "$1true",
    );
    for (const featureList of ["", missingRequired, optionalEnabled, requiredEnabled]) {
      expect(codexToolFeaturesDisabled(featureList)).toBe(false);
      await expect(invokeWithHelp(help, undefined, featureList)).rejects.toThrow(
        "Codex CLI araç kapatma sözleşmesi doğrulanamadı.",
      );
    }
    const ok = await invokeWithHelp(help, undefined, legacy);
    expect(ok.decisionArguments).toHaveLength(1);
  });

  it("fails closed on an external tool item and only counts error or unknown items", async () => {
    const help = "--output-schema --output-last-message\n      --json\n";
    const item = (type: string, item: Record<string, unknown>) => JSON.stringify({ type, item });
    for (const toolType of [
      "web_search",
      "mcp_tool_call",
      "collab_tool_call",
      "command_execution",
    ]) {
      await expect(
        invokeWithHelp(help, undefined, DISABLED_FEATURE_LIST, [
          item("item.started", { id: "t1", type: toolType }),
          item("item.completed", { id: "t1", type: toolType }),
        ]),
      ).rejects.toMatchObject({
        safeCode: "CODEX_TOOL_ITEM",
        diagnostics: { itemCounts: { errorItems: 0, toolItems: 1, unknownItems: 0 } },
      });
    }
    const tolerated = await invokeWithHelp(help, undefined, DISABLED_FEATURE_LIST, [
      item("item.completed", { id: "e1", type: "error", message: "Code Mode is unavailable" }),
      item("item.completed", { id: "r1", type: "reasoning", text: "..." }),
      item("item.completed", { id: "u1", type: "future_item" }),
    ]);
    expect(tolerated.result.diagnostics?.itemCounts).toEqual({
      errorItems: 1,
      toolItems: 0,
      unknownItems: 1,
    });
    expect(classifyCodexItemEvent('{"type":"turn.completed"}')).toBeUndefined();
    expect(codexStreamFailureText('{"type":"turn.completed"}')).toBeUndefined();
    expect(codexStreamFailureText('{"type":"item.completed","item":{"type":"error"}}')).toBe(
      undefined,
    );
    expect(codexStreamFailureText('{"type":"error","message":"429 Too Many Requests"}')).toEqual({
      text: "429 Too Many Requests",
      terminal: false,
    });
    expect(codexStreamFailureText('{"type":"turn.failed"}')).toBeUndefined();
    expect(codexStreamFailureText('{"type":"turn.failed","error":{"message":"boom"}}')).toEqual({
      text: "boom",
      terminal: true,
    });
    expect(
      codexStreamFailureText(`{"type":"error","message":"${"a".repeat(5000)}"}`)?.text.length,
    ).toBe(4096);
  });

  it("rejects malformed contract lines, a config.toml and an unreadable event line", async () => {
    const help = "--output-schema --output-last-message\n      --json\n";
    for (const broken of [
      DISABLED_FEATURE_LIST.replace(/^sleep_tool\s.*$/mu, "sleep_tool true"),
      DISABLED_FEATURE_LIST.replace(/^sleep_tool\s.*$/mu, "sleep_tool stable true (enabled)"),
      DISABLED_FEATURE_LIST.replace(/^apps\s.*$/mu, "apps stable false extra"),
      `${DISABLED_FEATURE_LIST}\napps                stable             true`,
    ])
      expect(codexToolFeaturesDisabled(broken), broken.slice(-40)).toBe(false);
    await expect(
      invokeWithHelp(help, undefined, DISABLED_FEATURE_LIST, [], "codex-cli 0.144.6", true),
    ).rejects.toThrow("Codex home içinde config.toml beklenmiyor.");
    const huge = JSON.stringify({
      type: "item.completed",
      item: { id: "m1", type: "mcp_tool_call", padding: "x".repeat(3_000_000) },
    });
    await expect(
      invokeWithHelp(help, undefined, DISABLED_FEATURE_LIST, [huge]),
    ).rejects.toMatchObject({ safeCode: "CODEX_EVENT_STREAM_INVALID" });
    // Sınır parçalanmadan bağımsız: son parçada biten 1,1 MB'lık zararsız satır da okunmaz.
    const longBenign = JSON.stringify({
      type: "item.completed",
      item: { id: "a1", type: "agent_message", text: "y".repeat(1_100_000) },
    });
    await expect(
      invokeWithHelp(help, undefined, DISABLED_FEATURE_LIST, [longBenign]),
    ).rejects.toMatchObject({ safeCode: "CODEX_EVENT_STREAM_INVALID" });
    // Taşma ardından zaman aşımı: sözleşme ihlali önce gelir (Sol 6.1 2. tur).
    await expect(
      invokeWithHelp(help, undefined, DISABLED_FEATURE_LIST, [huge], "codex-cli 0.144.6", false, {
        closeOnKillOnly: true,
        timeoutMs: 1_500,
      }),
    ).rejects.toMatchObject({ safeCode: "CODEX_EVENT_STREAM_INVALID" });
    // Çok baytlı karakter parça sınırında bölünse de sınırın altındaki satır okunur.
    const base = JSON.stringify({
      type: "item.completed",
      item: { id: "a2", type: "agent_message", text: "" },
    }).length;
    const nearLimit = JSON.stringify({
      type: "item.completed",
      item: { id: "a2", type: "agent_message", text: "ç".repeat(1_048_576 - 10 - base) },
    });
    const split = await invokeWithHelp(
      help,
      undefined,
      DISABLED_FEATURE_LIST,
      [nearLimit],
      "codex-cli 0.144.6",
      false,
      { chunkBytes: 32_767 },
    );
    expect(split.result.diagnostics?.itemCounts).toEqual({
      errorItems: 0,
      toolItems: 0,
      unknownItems: 0,
    });
    // Kimliksiz yalnız başlangıç olayı da ihlaldir.
    await expect(
      invokeWithHelp(help, undefined, DISABLED_FEATURE_LIST, [
        JSON.stringify({ type: "item.started", item: { type: "web_search" } }),
      ]),
    ).rejects.toMatchObject({ safeCode: "CODEX_TOOL_ITEM" });
  });

  it("adds the sub-agent thread limit only for CLI versions that accept it", async () => {
    const help = "--output-schema --output-last-message\n      --json\n";
    expect(codexSupportsThreadLimit("codex-cli 0.144.6")).toBe(false);
    expect(codexSupportsThreadLimit("codex-cli 0.159.9")).toBe(false);
    expect(codexSupportsThreadLimit("codex-cli 0.160.0")).toBe(true);
    expect(codexSupportsThreadLimit("codex-cli 0.161.2")).toBe(true);
    expect(codexSupportsThreadLimit("codex-cli 1.0.0")).toBe(true);
    expect(codexSupportsThreadLimit("codex-cli synthetic")).toBe(false);
    const setting = "agents.max_concurrent_threads_per_session=1";
    const legacy = await invokeWithHelp(help);
    expect(legacy.decisionArguments[0]).not.toContain(setting);
    const current = await invokeWithHelp(
      help,
      undefined,
      DISABLED_FEATURE_LIST,
      [],
      "codex-cli 0.160.0",
    );
    const decision = current.decisionArguments[0]!;
    expect(decision[decision.indexOf(setting) - 1]).toBe("-c");
    expect(decision.indexOf(setting)).toBeLessThan(decision.indexOf("exec"));
  });

  // 14 Ekim: model denemesi için kapalı profil; varsayılan değişmez.
  it("passes the selected closed-list model profile to Codex and reports it", async () => {
    const help = "--output-schema --output-last-message\n      --json\n";
    const defaults = await invokeWithHelp(help);
    const flags = (args: string[]) => [
      args[args.indexOf("--model") + 1],
      args[args.indexOf("-c") + 1],
    ];
    expect(flags(defaults.decisionArguments[0]!)).toEqual([
      "gpt-5.6-luna",
      'model_reasoning_effort="max"',
    ]);
    const sol = await invokeWithHelp(help, "sol-medium");
    expect(flags(sol.decisionArguments[0]!)).toEqual([
      "gpt-6.1-sol",
      'model_reasoning_effort="medium"',
    ]);
    const sol6 = await invokeWithHelp(help, "sol6-medium");
    expect(flags(sol6.decisionArguments[0]!)).toEqual([
      "gpt-6-sol",
      'model_reasoning_effort="medium"',
    ]);
    const terra = await invokeWithHelp(help, "terra-medium");
    expect(flags(terra.decisionArguments[0]!)).toEqual([
      "gpt-5.6-terra",
      'model_reasoning_effort="medium"',
    ]);
    const sol56 = await invokeWithHelp(help, "sol56-medium");
    expect(flags(sol56.decisionArguments[0]!)).toEqual([
      "gpt-5.6-sol",
      'model_reasoning_effort="medium"',
    ]);
    const luna6 = await invokeWithHelp(help, "luna6-max");
    expect(flags(luna6.decisionArguments[0]!)).toEqual([
      "gpt-6-luna",
      'model_reasoning_effort="max"',
    ]);
    /*
      15 Ekim araç kapatma sözleşmesi (Astra 1. tur): beklenen liste sabitten BAĞIMSIZ yazılır.
      Her iki profilde her çift `exec`'ten önce, tam olarak bir kez ve çelişen başka değer olmadan
      bulunmalı; yazım hatası, silme ya da `exec` sonrasına taşıma testi düşürür.
    */
    const expectedToolSettings = [
      "features.shell_tool=false",
      "features.apps=false",
      "features.multi_agent=false",
      "features.image_generation=false",
      "features.goals=false",
      "features.plugins=false",
      "features.remote_plugin=false",
      "features.tool_suggest=false",
      "features.code_mode_host=false",
      "features.view_image=false",
      "features.skill_search=false",
      "features.sleep_tool=false",
      'web_search="disabled"',
    ];
    for (const decision of [
      defaults.decisionArguments[0]!,
      sol.decisionArguments[0]!,
      sol6.decisionArguments[0]!,
      terra.decisionArguments[0]!,
      sol56.decisionArguments[0]!,
    ]) {
      const execIndex = decision.indexOf("exec");
      const settings = decision.flatMap((value, index) =>
        decision[index - 1] === "-c" ? [{ value, index }] : [],
      );
      for (const expected of expectedToolSettings) {
        const matches = settings.filter(({ value }) => value === expected);
        expect(matches, expected).toHaveLength(1);
        expect(matches[0]!.index, expected).toBeLessThan(execIndex);
        const key = expected.slice(0, expected.indexOf("="));
        expect(
          settings.filter(({ value }) => value.startsWith(`${key}=`)),
          `${key} tek değer`,
        ).toHaveLength(1);
      }
      expect(decision.slice(execIndex).includes("-c")).toBe(false);
    }
    expect(CODEX_TOOL_DISABLE_ARGUMENTS).toEqual(
      expectedToolSettings.flatMap((setting) => ["-c", setting]),
    );
    expect(AGENT_RUNTIME_CODEX_PROFILES).toEqual({
      "luna-max": { model: "gpt-5.6-luna", reasoningEffort: "max" },
      "sol-medium": { model: "gpt-6.1-sol", reasoningEffort: "medium" },
      "sol6-medium": { model: "gpt-6-sol", reasoningEffort: "medium" },
      "terra-medium": { model: "gpt-5.6-terra", reasoningEffort: "medium" },
      "sol56-medium": { model: "gpt-5.6-sol", reasoningEffort: "medium" },
      "luna6-max": { model: "gpt-6-luna", reasoningEffort: "max" },
    });
  });

  // Astra, 14 Ekim: kapasite ve durum komutları worker ile aynı profili kullanır.
  it("makes every runtime CLI entry point honor the same codex profile setting", () => {
    for (const script of [
      "scripts/agent-runtime-worker.ts",
      "scripts/agent-capability.ts",
      "scripts/agent-codex-status.ts",
    ]) {
      const text = readFileSync(script, "utf8");
      expect(text, script).toContain(
        'AGENT_RUNTIME_CODEX_PROFILE: z.enum(agentRuntimeCodexProfileNames).default("luna-max")',
      );
      expect(text, script).toContain("codexProfile: environment.AGENT_RUNTIME_CODEX_PROFILE");
    }
  });
});
