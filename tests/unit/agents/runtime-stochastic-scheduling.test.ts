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

  it("draws the next healthy tick between three and ten minutes", () => {
    expect(randomStochasticTickDelay(() => 0)).toBe(3 * 60_000);
    expect(randomStochasticTickDelay(() => 1)).toBe(10 * 60_000);
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
      stochasticScheduling: { credential, controlPlane: scheduler },
      now: () => now,
      random: () => 0,
    });

    await worker.runOnce();
    now = new Date(now.getTime() + 3 * 60_000 - 1);
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
      stochasticScheduling: { credential, controlPlane: scheduler },
      now: () => now,
    });

    await worker.runOnce();
    now = new Date(now.getTime() + STOCHASTIC_BUSY_RETRY_MS - 1);
    await worker.runOnce();
    now = new Date(now.getTime() + 1);
    await worker.runOnce();
    expect(scheduler.tickScheduler).toHaveBeenCalledTimes(2);
  });

  it("rechecks an operator-paused flow after one minute instead of waiting 3-10 minutes", async () => {
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
      stochasticScheduling: { credential, controlPlane: scheduler },
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
});
