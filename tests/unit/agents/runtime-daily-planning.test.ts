import { describe, expect, it, vi } from "vitest";
import type {
  RuntimeControlPlane,
  RuntimeDailyPlanControlPlane,
} from "@/runtime/control-plane-client";
import type { RuntimeProvider } from "@/runtime/provider";
import {
  AgentRuntimeWorker,
  ISTANBUL_DAILY_PLAN_MINUTE,
  istanbulPlanningClock,
} from "@/runtime/worker";

function idleControlPlane(): RuntimeControlPlane {
  return {
    lease: vi.fn().mockResolvedValue({ run: null, reason: "QUEUE_EMPTY" }),
    context: vi.fn(),
    heartbeat: vi.fn(),
    recordActions: vi.fn(),
    executeActions: vi.fn(),
    recordMemories: vi.fn(),
    recordSourceResult: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
  };
}

const unusedProvider: RuntimeProvider = {
  inspect: vi.fn(),
  invoke: vi.fn(),
};

describe("automatic Istanbul daily planning", () => {
  it("identifies the Istanbul date and the 00:05 planning boundary", () => {
    expect(ISTANBUL_DAILY_PLAN_MINUTE).toBe(5);
    expect(istanbulPlanningClock(new Date("2026-07-17T21:04:00.000Z"))).toEqual({
      dateKey: "2026-07-18",
      minuteOfDay: 4,
    });
    expect(istanbulPlanningClock(new Date("2026-07-17T21:05:00.000Z"))).toEqual({
      dateKey: "2026-07-18",
      minuteOfDay: 5,
    });
  });

  it("ticks once after 00:05, catches up on startup and resets on the next Istanbul day", async () => {
    const credential = `agt_${"p".repeat(43)}`;
    let now = new Date("2026-07-17T21:04:00.000Z");
    const planner: RuntimeDailyPlanControlPlane = {
      planToday: vi
        .fn()
        .mockResolvedValueOnce({
          localDate: "2026-07-18",
          createdPlans: 10,
          existingPlans: 0,
          blocked: false,
          blockedReason: null,
        })
        .mockResolvedValueOnce({
          localDate: "2026-07-19",
          createdPlans: 0,
          existingPlans: 10,
          blocked: false,
          blockedReason: null,
        }),
    };
    const worker = new AgentRuntimeWorker({
      workerId: "daily-orchestrator",
      credentials: [credential],
      controlPlane: idleControlPlane(),
      provider: unusedProvider,
      dailyPlanning: { credential, controlPlane: planner },
      now: () => now,
    });

    await expect(worker.runOnce()).resolves.toBe(0);
    expect(planner.planToday).not.toHaveBeenCalled();

    now = new Date("2026-07-17T21:05:00.000Z");
    await expect(worker.runOnce()).resolves.toBe(0);
    await expect(worker.runOnce()).resolves.toBe(0);
    expect(planner.planToday).toHaveBeenCalledTimes(1);

    now = new Date("2026-07-18T21:05:00.000Z");
    await expect(worker.runOnce()).resolves.toBe(0);
    expect(planner.planToday).toHaveBeenCalledTimes(2);
  });

  it("keeps leasing while a blocked planning tick retries on the bounded interval", async () => {
    const credential = `agt_${"r".repeat(43)}`;
    let now = new Date("2026-07-17T21:05:00.000Z");
    const events: string[] = [];
    const controlPlane = idleControlPlane();
    const planner: RuntimeDailyPlanControlPlane = {
      planToday: vi
        .fn()
        .mockResolvedValueOnce({
          localDate: "2026-07-18",
          createdPlans: 0,
          existingPlans: 0,
          blocked: true,
          blockedReason: "CAPABILITY_MISSING",
        })
        .mockResolvedValueOnce({
          localDate: "2026-07-18",
          createdPlans: 10,
          existingPlans: 0,
          blocked: false,
          blockedReason: null,
        }),
    };
    const worker = new AgentRuntimeWorker({
      workerId: "retrying-orchestrator",
      credentials: [credential],
      controlPlane,
      provider: unusedProvider,
      dailyPlanning: { credential, controlPlane: planner },
      dailyPlanningRetryMs: 5 * 60_000,
      now: () => now,
      onSafeEvent: ({ code }) => events.push(code),
    });

    await worker.runOnce();
    now = new Date("2026-07-17T21:09:59.000Z");
    await worker.runOnce();
    expect(planner.planToday).toHaveBeenCalledTimes(1);

    now = new Date("2026-07-17T21:10:00.000Z");
    await worker.runOnce();
    expect(planner.planToday).toHaveBeenCalledTimes(2);
    expect(controlPlane.lease).toHaveBeenCalledTimes(3);
    expect(events).toEqual(["DAILY_PLAN_BLOCKED", "DAILY_PLAN_READY"]);
  });
});
