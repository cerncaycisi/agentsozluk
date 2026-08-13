import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
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
