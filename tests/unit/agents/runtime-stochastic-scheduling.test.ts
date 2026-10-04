import { describe, expect, it, vi } from "vitest";
import type {
  RuntimeControlPlane,
  RuntimeStochasticSchedulerControlPlane,
} from "@/runtime/control-plane-client";
import type { RuntimeProvider } from "@/runtime/provider";
import {
  AgentRuntimeWorker,
  randomStochasticTickDelay,
  STOCHASTIC_BUSY_RETRY_MS,
  BIRTH_SCAN_FAILURE_RETRY_MS,
} from "@/runtime/worker";

function idleControlPlane(): RuntimeControlPlane {
  return {
    lease: vi.fn().mockResolvedValue({ run: null, reason: "QUEUE_EMPTY" }),
    context: vi.fn(),
    heartbeat: vi.fn(),
    recordActions: vi.fn(),
    recordLifeEvents: vi.fn(),
    executeActions: vi.fn(),
    recordMemories: vi.fn(),
    recordSourceAttempt: vi.fn(),
    recordSourceResult: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
  };
}

const unusedProvider: RuntimeProvider = {
  inspect: vi.fn(),
  invoke: vi.fn(),
};

describe("stochastic society scheduling", () => {
  const credential = `agt_${"s".repeat(43)}`;

  function tickResult(
    overrides: Partial<
      Awaited<ReturnType<RuntimeStochasticSchedulerControlPlane["tickScheduler"]>>
    > = {},
  ) {
    return {
      tickKey: "2026-07-21T12:32:00.000Z",
      createdRuns: 1,
      selectedAgentProfileIds: ["00000000-0000-4000-8000-000000000123"],
      skipReason: null,
      workerId: "society-worker",
      ...overrides,
    };
  }

  it("calls the separate birth endpoint only when the scheduler marks it due", async () => {
    const controlPlane = idleControlPlane();
    const tickBirthCandidates = vi.fn().mockResolvedValue({
      outcome: "PROPOSED",
      candidateId: "00000000-0000-4000-8000-000000000999",
    });
    const scheduler: RuntimeStochasticSchedulerControlPlane = {
      tickScheduler: vi.fn().mockResolvedValue(tickResult({ birthScanDue: true })),
      tickBirthCandidates,
    };
    const worker = new AgentRuntimeWorker({
      workerId: "society-worker",
      credentials: [credential],
      controlPlane,
      provider: unusedProvider,
      stochasticScheduling: { controlPlane: scheduler },
    });
    await worker.runOnce();
    expect(tickBirthCandidates).toHaveBeenCalledWith(credential, "society-worker");
    expect(controlPlane.lease).toHaveBeenCalledTimes(1);
    const legacy = new AgentRuntimeWorker({
      workerId: "legacy-worker",
      credentials: [credential],
      controlPlane,
      provider: unusedProvider,
      stochasticScheduling: {
        controlPlane: {
          tickScheduler: vi.fn().mockResolvedValue(tickResult()),
          tickBirthCandidates,
        },
      },
    });
    await legacy.runOnce();
    expect(tickBirthCandidates).toHaveBeenCalledTimes(1);
  });
  it.each(["failure", "missing"])(
    "keeps leasing when the independent birth adapter has %s",
    async (kind) => {
      let now = new Date("2026-10-04T12:00:00Z");
      const controlPlane = idleControlPlane();
      const onSafeEvent = vi.fn();
      const scheduler: RuntimeStochasticSchedulerControlPlane = {
        tickScheduler: vi.fn().mockResolvedValue(tickResult({ birthScanDue: true })),
        ...(kind === "failure"
          ? { tickBirthCandidates: vi.fn().mockRejectedValue(new Error("LOCAL_TEST")) }
          : {}),
      };
      const worker = new AgentRuntimeWorker({
        workerId: "society-worker",
        credentials: [credential],
        controlPlane,
        provider: unusedProvider,
        stochasticScheduling: { controlPlane: scheduler },
        onSafeEvent,
        now: () => now,
        random: () => 0,
      });
      await worker.runOnce();
      now = new Date(now.getTime() + 2 * 60_000);
      await worker.runOnce();
      expect(controlPlane.lease).toHaveBeenCalledTimes(2);
      expect(scheduler.tickScheduler).toHaveBeenCalledTimes(2);
      if (kind === "failure") expect(scheduler.tickBirthCandidates).toHaveBeenCalledTimes(1);
      expect(
        onSafeEvent.mock.calls.filter(([event]) => event.code === "BIRTH_SCAN_FAILED"),
      ).toHaveLength(1);
      now = new Date(now.getTime() + BIRTH_SCAN_FAILURE_RETRY_MS);
      await worker.runOnce();
      expect(controlPlane.lease).toHaveBeenCalledTimes(3);
      if (kind === "failure") expect(scheduler.tickBirthCandidates).toHaveBeenCalledTimes(2);
      expect(onSafeEvent).toHaveBeenCalledWith({ level: "error", code: "BIRTH_SCAN_FAILED" });
      expect(onSafeEvent).toHaveBeenCalledWith({ level: "info", code: "STOCHASTIC_TICK_QUEUED" });
    },
  );
  it("draws the next healthy tick between two and five minutes", () => {
    expect(randomStochasticTickDelay(() => 0)).toBe(2 * 60_000);
    expect(randomStochasticTickDelay(() => 1)).toBe(5 * 60_000);
  });

  it("ticks immediately, waits the randomized delay and keeps leasing", async () => {
    let now = new Date("2026-07-21T12:32:00.000Z");
    const controlPlane = idleControlPlane();
    const scheduler: RuntimeStochasticSchedulerControlPlane = {
      tickScheduler: vi.fn().mockResolvedValue(tickResult()),
    };
    const worker = new AgentRuntimeWorker({
      workerId: "society-worker",
      credentials: [credential],
      controlPlane,
      provider: unusedProvider,
      stochasticScheduling: { controlPlane: scheduler },
      now: () => now,
      random: () => 0,
    });

    await worker.runOnce();
    now = new Date(now.getTime() + 2 * 60_000 - 1);
    await worker.runOnce();
    now = new Date(now.getTime() + 1);
    await worker.runOnce();

    expect(scheduler.tickScheduler).toHaveBeenCalledTimes(2);
    expect(controlPlane.lease).toHaveBeenCalledTimes(3);
  });

  it("rechecks busy capacity after one minute without creating a backlog", async () => {
    let now = new Date("2026-07-21T12:32:00.000Z");
    const scheduler: RuntimeStochasticSchedulerControlPlane = {
      tickScheduler: vi
        .fn()
        .mockResolvedValue(
          tickResult({ createdRuns: 0, selectedAgentProfileIds: [], skipReason: "CAPACITY_FULL" }),
        ),
    };
    const worker = new AgentRuntimeWorker({
      workerId: "society-worker",
      credentials: [credential],
      controlPlane: idleControlPlane(),
      provider: unusedProvider,
      stochasticScheduling: { controlPlane: scheduler },
      now: () => now,
    });

    await worker.runOnce();
    now = new Date(now.getTime() + STOCHASTIC_BUSY_RETRY_MS - 1);
    await worker.runOnce();
    now = new Date(now.getTime() + 1);
    await worker.runOnce();
    expect(scheduler.tickScheduler).toHaveBeenCalledTimes(2);
  });

  it("rechecks an operator-paused flow after one minute instead of waiting 2-5 minutes", async () => {
    let now = new Date("2026-07-21T12:32:00.000Z");
    const scheduler: RuntimeStochasticSchedulerControlPlane = {
      tickScheduler: vi
        .fn()
        .mockResolvedValueOnce(
          tickResult({
            createdRuns: 0,
            selectedAgentProfileIds: [],
            skipReason: "RUNTIME_DISABLED",
          }),
        )
        .mockResolvedValue(tickResult()),
    };
    const worker = new AgentRuntimeWorker({
      workerId: "society-worker",
      credentials: [credential],
      controlPlane: idleControlPlane(),
      provider: unusedProvider,
      stochasticScheduling: { controlPlane: scheduler },
      now: () => now,
      random: () => 1,
    });

    await worker.runOnce();
    now = new Date(now.getTime() + STOCHASTIC_BUSY_RETRY_MS - 1);
    await worker.runOnce();
    now = new Date(now.getTime() + 1);
    await worker.runOnce();

    expect(scheduler.tickScheduler).toHaveBeenCalledTimes(2);
  });

  it("uses the refreshed credential roster for scheduling and lease lanes without a restart", async () => {
    let now = new Date("2026-07-21T12:32:00.000Z");
    const addedCredential = `agt_${"n".repeat(43)}`;
    let currentCredentials = [credential];
    const loadCredentials = vi.fn(async () => [...currentCredentials]);
    const controlPlane = idleControlPlane();
    const scheduler: RuntimeStochasticSchedulerControlPlane = {
      tickScheduler: vi.fn().mockResolvedValue(tickResult()),
    };
    const worker = new AgentRuntimeWorker({
      workerId: "society-worker",
      credentials: [credential],
      loadCredentials,
      controlPlane,
      provider: unusedProvider,
      processingLanes: 2,
      stochasticScheduling: { controlPlane: scheduler },
      now: () => now,
      random: () => 0,
    });

    await worker.runOnce();
    currentCredentials = [addedCredential, credential];
    now = new Date(now.getTime() + 2 * 60_000);
    await worker.runOnce();

    expect(loadCredentials).toHaveBeenCalledTimes(2);
    expect(scheduler.tickScheduler).toHaveBeenNthCalledWith(1, credential, "society-worker");
    expect(scheduler.tickScheduler).toHaveBeenNthCalledWith(2, addedCredential, "society-worker");
    expect(controlPlane.lease).toHaveBeenCalledWith(addedCredential, "society-worker");
    expect(controlPlane.lease).toHaveBeenCalledWith(credential, "society-worker");
  });
});
