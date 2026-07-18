import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { RuntimeControlPlane } from "@/runtime/control-plane-client";
import type { RuntimeProvider } from "@/runtime/provider";
import { RuntimeProviderCancelledError } from "@/runtime/provider";
import { AgentRuntimeWorker, RUNTIME_PROMPT_PROFILE_HASH } from "@/runtime/worker";

function fixtureContext(runId: string) {
  return {
    run: {
      id: runId,
      runType: "NORMAL_WAKE",
      timeoutSeconds: 360,
      desiredEntryMin: 2,
      desiredEntryMax: 3,
      allowTopicCreation: true,
      allowVoting: true,
      allowFollowing: true,
      allowSourceReading: true,
      publishEnabled: true,
      adminInstruction: null,
      cancelRequested: false,
    },
    agent: {
      profileId: randomUUID(),
      username: "runtime_agent",
      displayName: "Runtime Agent",
      publicBio: null,
    },
    persona: { version: 1, renderedPrompt: "Trusted persona prompt." },
    perception: { observedAt: "2026-07-17T12:00:00.000Z", recentEntries: [] },
  };
}

function controlPlane(runId: string): RuntimeControlPlane {
  return {
    lease: vi.fn().mockResolvedValue({ run: { id: runId, timeoutSeconds: 360 }, reason: null }),
    context: vi.fn().mockResolvedValue(fixtureContext(runId)),
    heartbeat: vi.fn().mockResolvedValue({ cancelRequested: false }),
    recordActions: vi.fn().mockResolvedValue(undefined),
    executeActions: vi.fn().mockResolvedValue({
      actions: [
        {
          id: randomUUID(),
          sequence: 1,
          actionType: "NO_ACTION",
          actionStatus: "SKIPPED",
          rejectionCode: null,
        },
      ],
    }),
    recordMemories: vi.fn().mockResolvedValue(undefined),
    recordSourceResult: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
  };
}

describe("long-lived agent runtime worker", () => {
  it("leases, validates structured output, executes actions and completes through the API", async () => {
    const runId = randomUUID();
    const plane = controlPlane(runId);
    const provider: RuntimeProvider = {
      inspect: vi
        .fn()
        .mockResolvedValue({ version: "codex-cli test", supportsStructuredOutput: true }),
      invoke: vi.fn().mockResolvedValue({
        provider: "codex-cli",
        version: "codex-cli test",
        durationMs: 25,
        hostMetrics: {
          processPeakRssMb: 123,
          systemPeakMemoryMb: 2048,
          availableMemoryMb: 1024,
          swapInMb: 0,
          swapOutMb: 0,
          loadAverage1m: 0.5,
        },
        output: {
          state: { curiosity: 0.4, confidence: 0.6, topicFatigue: {} },
          observations: [],
          actions: [],
          beliefDeltas: [],
          relationshipDeltas: [],
          sourceProposals: [],
          memoryCandidates: [],
          safeRunSummary: {
            operationSummary: "Akış güvenli biçimde değerlendirildi.",
            observedItemIds: [],
            shortRationale: "Yayınlanabilir aday bulunmadı.",
          },
        },
      }),
    };
    const worker = new AgentRuntimeWorker({
      workerId: "unit-worker",
      credentials: [`agt_${"x".repeat(43)}`],
      controlPlane: plane,
      provider,
    });
    await expect(worker.runOnce()).resolves.toBe(1);
    expect(plane.recordActions).toHaveBeenCalledWith(expect.any(String), "unit-worker", runId, [
      { sequence: 1, actionType: "NO_ACTION", input: {} },
    ]);
    expect(plane.complete).toHaveBeenCalledWith(
      expect.any(String),
      "unit-worker",
      runId,
      expect.objectContaining({
        outcome: "SUCCEEDED",
        usageMetadata: expect.objectContaining({
          model: "codex-cli test",
          promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
          processPeakRssMb: 123,
          availableMemoryMb: 1024,
        }),
      }),
    );
    expect(plane.fail).not.toHaveBeenCalled();
    expect(JSON.stringify((provider.invoke as ReturnType<typeof vi.fn>).mock.calls)).toContain(
      "<UNTRUSTED_CONTENT>",
    );
  });

  it("fails closed when provider output does not match the runtime schema", async () => {
    const runId = randomUUID();
    const plane = controlPlane(runId);
    const provider: RuntimeProvider = {
      inspect: vi.fn().mockResolvedValue({ version: "test", supportsStructuredOutput: true }),
      invoke: vi.fn().mockResolvedValue({
        provider: "codex-cli",
        version: "test",
        durationMs: 1,
        output: { actions: [{ actionType: "MODERATE_USER" }] },
      }),
    };
    const worker = new AgentRuntimeWorker({
      workerId: "unit-worker",
      credentials: [`agt_${"y".repeat(43)}`],
      controlPlane: plane,
      provider,
    });
    await worker.runOnce();
    expect(provider.invoke).toHaveBeenCalledTimes(2);
    expect(plane.recordActions).not.toHaveBeenCalled();
    expect(plane.fail).toHaveBeenCalledWith(
      expect.any(String),
      "unit-worker",
      runId,
      expect.objectContaining({ outcome: "FAILED", errorCode: "WORKER_EXECUTION_FAILED" }),
    );
  });

  it("propagates graceful cancellation from heartbeat to the provider", async () => {
    const runId = randomUUID();
    const plane = controlPlane(runId);
    plane.heartbeat = vi.fn().mockResolvedValue({ cancelRequested: true });
    const provider: RuntimeProvider = {
      inspect: vi.fn().mockResolvedValue({ version: "test", supportsStructuredOutput: true }),
      invoke: vi.fn().mockImplementation(async ({ signal }) => {
        await new Promise<void>((resolve) => signal?.addEventListener("abort", () => resolve()));
        throw new RuntimeProviderCancelledError();
      }),
    };
    const worker = new AgentRuntimeWorker({
      workerId: "cancel-worker",
      credentials: [`agt_${"z".repeat(43)}`],
      controlPlane: plane,
      provider,
      heartbeatIntervalMs: 5,
    });
    await worker.runOnce();
    expect(plane.fail).toHaveBeenCalledWith(
      expect.any(String),
      "cancel-worker",
      runId,
      expect.objectContaining({ outcome: "CANCELLED", errorCode: "WORKER_CANCELLED" }),
    );
  });
});
