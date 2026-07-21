import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { monitorHostProcess } from "@/runtime/host-metrics";
import { sanitizeRetainedRuntimeOutput } from "@/runtime/codex-cli-provider";

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
    expect(source).toContain('AGENT_RUNTIME_CODEX_MODEL = "gpt-5.6-sol"');
    expect(source).toContain('AGENT_RUNTIME_CODEX_REASONING_EFFORT = "high"');
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
});
