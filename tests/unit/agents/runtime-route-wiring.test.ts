import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeActionCalls = vi.hoisted(() => vi.fn());
const adminActionCalls = vi.hoisted(() => vi.fn());
const leaseRuntimeRun = vi.hoisted(() => vi.fn());
const runRuntimeStochasticTick = vi.hoisted(() => vi.fn());
const heartbeatRuntimeRun = vi.hoisted(() => vi.fn());
const executeRuntimeActions = vi.hoisted(() => vi.fn());
const completeRuntimeRun = vi.hoisted(() => vi.fn());
const failRuntimeRun = vi.hoisted(() => vi.fn());
const setSocietyFlowEnabled = vi.hoisted(() => vi.fn());

vi.mock("@/lib/http/agent-runtime-action", () => ({
  replayRuntimeLeaseIdempotencyTombstone: vi.fn(),
  runAgentRuntimeAction: runtimeActionCalls,
  storeRuntimeLeaseIdempotencyTombstone: vi.fn(),
}));

vi.mock("@/lib/http/agent-admin-action", () => ({
  runAgentAdminAction: adminActionCalls,
}));

vi.mock("@/modules/agents", () => ({
  completeRuntimeRun,
  executeRuntimeActions,
  failRuntimeRun,
  heartbeatRuntimeRun,
  leaseRuntimeRun,
  runRuntimeStochasticTick,
  runtimeCompleteSchema: { name: "complete" },
  runtimeControlSchema: { name: "control" },
  runtimeExecuteActionsSchema: { name: "execute" },
  runtimeFailSchema: { name: "fail" },
  runtimeHeartbeatSchema: { name: "heartbeat" },
  runtimeLeaseSchema: { name: "lease" },
  runtimeStochasticTickSchema: { name: "tick" },
  setSocietyFlowEnabled,
}));

import { POST as heartbeatRoute } from "@/app/api/v1/internal/agent-runtime/heartbeat/route";
import { POST as leaseRoute } from "@/app/api/v1/internal/agent-runtime/lease/route";
import { POST as executeRoute } from "@/app/api/v1/internal/agent-runtime/runs/[runId]/actions/execute/route";
import { POST as completeRoute } from "@/app/api/v1/internal/agent-runtime/runs/[runId]/complete/route";
import { POST as failRoute } from "@/app/api/v1/internal/agent-runtime/runs/[runId]/fail/route";
import { POST as tickRoute } from "@/app/api/v1/internal/agent-runtime/scheduler/tick/route";
import { POST as pauseRoute } from "@/app/api/v1/admin/agent-runtime/pause/route";
import { POST as resumeRoute } from "@/app/api/v1/admin/agent-runtime/resume/route";

const runId = "00000000-0000-4000-8000-000000000123";
const request = new Request("http://localhost/api/runtime", {
  method: "POST",
}) as NextRequest;

describe("critical runtime route wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeActionCalls.mockImplementation(
      async (
        _request: NextRequest,
        _schema: unknown,
        _scope: string,
        handler: (client: unknown, principal: unknown, input: Record<string, unknown>) => unknown,
      ) => {
        await handler("client", "principal", { runId, marker: "input" });
        return new Response(null, { status: 204 });
      },
    );
    adminActionCalls.mockImplementation(
      async (
        _request: NextRequest,
        _schema: unknown,
        handler: (client: unknown, actor: unknown, input: Record<string, unknown>) => unknown,
      ) => {
        await handler("client", "actor", { marker: "input" });
        return new Response(null, { status: 204 });
      },
    );
  });

  it("routes lease, scheduler and heartbeat through their exact runtime scopes", async () => {
    await expect(leaseRoute(request)).resolves.toHaveProperty("status", 204);
    expect(runtimeActionCalls).toHaveBeenLastCalledWith(
      request,
      { name: "lease" },
      "runtime:lease",
      leaseRuntimeRun,
      expect.objectContaining({
        replayedBodyTransform: expect.any(Function),
        storedBodyTransform: expect.any(Function),
      }),
    );

    await expect(tickRoute(request)).resolves.toHaveProperty("status", 204);
    expect(runtimeActionCalls).toHaveBeenLastCalledWith(
      request,
      { name: "tick" },
      "runtime:plan",
      runRuntimeStochasticTick,
    );

    await expect(heartbeatRoute(request)).resolves.toHaveProperty("status", 204);
    expect(runtimeActionCalls.mock.calls.at(-1)?.[2]).toBe("runtime:write");
    expect(heartbeatRuntimeRun).toHaveBeenCalledWith("client", "principal", runId, {
      runId,
      marker: "input",
    });
  });

  it("pins execute, complete and fail writes to the route run id", async () => {
    const context = { params: Promise.resolve({ runId }) };

    await expect(executeRoute(request, context)).resolves.toHaveProperty("status", 204);
    expect(executeRuntimeActions).toHaveBeenCalledWith("client", "principal", runId, {
      runId,
      marker: "input",
    });

    await expect(completeRoute(request, context)).resolves.toHaveProperty("status", 204);
    expect(completeRuntimeRun).toHaveBeenCalledWith("client", "principal", runId, {
      runId,
      marker: "input",
    });

    await expect(failRoute(request, context)).resolves.toHaveProperty("status", 204);
    expect(failRuntimeRun).toHaveBeenCalledWith("client", "principal", runId, {
      runId,
      marker: "input",
    });
    expect(runtimeActionCalls.mock.calls.slice(-3).map((call) => call[2])).toEqual([
      "runtime:write",
      "runtime:write",
      "runtime:write",
    ]);
  });

  it("maps the admin pause and resume routes to the whole-society switch", async () => {
    await expect(pauseRoute(request)).resolves.toHaveProperty("status", 204);
    expect(setSocietyFlowEnabled).toHaveBeenLastCalledWith("client", "actor", false, {
      marker: "input",
    });

    await expect(resumeRoute(request)).resolves.toHaveProperty("status", 204);
    expect(setSocietyFlowEnabled).toHaveBeenLastCalledWith("client", "actor", true, {
      marker: "input",
    });
  });
});
