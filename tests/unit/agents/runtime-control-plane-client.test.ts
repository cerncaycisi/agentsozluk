import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { RuntimeControlPlaneHttpClient } from "@/runtime/control-plane-client";
import type { RuntimeControlPlaneError } from "@/runtime/control-plane-client";

const LEASE_TOKEN = "l".repeat(43);

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("runtime control-plane HTTP contract", () => {
  it("parses the authoritative lease start and DB debug retention without identity aliases", async () => {
    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/lease"))
        return jsonResponse({
          data: {
            run: { id: runId, timeoutSeconds: 360, startedAt, leaseToken: LEASE_TOKEN },
            reason: null,
          },
        });
      return jsonResponse({
        data: {
          run: {
            id: runId,
            runType: "NORMAL_WAKE",
            trigger: "UNIT_TEST",
            timeoutSeconds: 360,
            desiredEntryMin: 1,
            desiredEntryMax: 2,
            allowTopicCreation: true,
            allowVoting: true,
            allowFollowing: true,
            allowSourceReading: true,
            publishEnabled: true,
            publicWriteEnabled: true,
            runtimeOperatingMode: "NORMAL",
            sourceFetchLimit: 8,
            debugRetentionHours: 12,
            saturationOverride: false,
            dailyMaximumOverride: false,
            adminInstruction: null,
            cancelRequested: false,
          },
          agent: { username: "runtime_agent", displayName: "Runtime Agent", publicBio: null },
          persona: { version: 1, renderedPrompt: "Trusted persona." },
          perception: {},
        },
      });
    });
    const client = new RuntimeControlPlaneHttpClient("http://127.0.0.1:3000", fetchMock);

    await expect(client.lease("credential", "worker-one")).resolves.toEqual({
      run: { id: runId, timeoutSeconds: 360, startedAt, leaseToken: LEASE_TOKEN },
      reason: null,
    });
    const context = await client.context("credential", "worker-one", runId, LEASE_TOKEN);
    expect(context.run.debugRetentionHours).toBe(12);
    expect(context.agent).toEqual({
      username: "runtime_agent",
      displayName: "Runtime Agent",
      publicBio: null,
    });
    expect(JSON.stringify(context.agent)).not.toMatch(/profileId|lifecycleStatus/iu);
    const contextHeaders = fetchMock.mock.calls[1]![1]?.headers as Record<string, string>;
    expect(contextHeaders).toMatchObject({
      "x-agent-worker-id": "worker-one",
      "x-agent-lease-token": LEASE_TOKEN,
    });
  });

  it("preserves safe server error codes for deadline and cancellation classification", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ error: { code: "AGENT_RUN_DEADLINE_EXCEEDED", message: "safe" } }, 409),
      );
    const client = new RuntimeControlPlaneHttpClient("http://127.0.0.1:3000", fetchMock);

    await expect(
      client.executeActions("credential", "worker-one", randomUUID(), LEASE_TOKEN, [1]),
    ).rejects.toEqual(
      expect.objectContaining<Partial<RuntimeControlPlaneError>>({
        name: "RuntimeControlPlaneError",
        code: "AGENT_RUN_DEADLINE_EXCEEDED",
      }),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toMatchObject({
      workerId: "worker-one",
      leaseToken: LEASE_TOKEN,
      sequences: [1],
    });
  });

  it("uses the narrow runtime planning endpoint with an idempotent authenticated write", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        data: {
          localDate: "2026-07-18",
          createdPlans: 10,
          existingPlans: 0,
          blocked: false,
          blockedReason: null,
        },
      }),
    );
    const client = new RuntimeControlPlaneHttpClient("http://127.0.0.1:3000", fetchMock);

    await expect(client.planToday("planning-credential", "orchestrator-01")).resolves.toEqual({
      localDate: "2026-07-18",
      createdPlans: 10,
      existingPlans: 0,
      blocked: false,
      blockedReason: null,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("http://127.0.0.1:3000/api/v1/internal/agent-runtime/plans/today");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ workerId: "orchestrator-01" }));
    expect(init?.headers).toMatchObject({
      authorization: "Bearer planning-credential",
      "content-type": "application/json",
      "idempotency-key": expect.stringMatching(/^[0-9a-f-]{36}$/u),
    });
  });

  it("combines caller cancellation with the bounded per-request timeout signal", async () => {
    const observedSignals: AbortSignal[] = [];
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal as AbortSignal;
          observedSignals.push(signal);
          signal.addEventListener("abort", () => reject(new Error("REQUEST_ABORTED")), {
            once: true,
          });
        }),
    );
    const client = new RuntimeControlPlaneHttpClient("http://127.0.0.1:3000", fetchMock);
    const controller = new AbortController();
    const pending = client.context("credential", "worker-one", randomUUID(), LEASE_TOKEN, {
      signal: controller.signal,
      timeoutMs: 1000,
    });

    controller.abort();

    await expect(pending).rejects.toThrow("REQUEST_ABORTED");
    expect(observedSignals).toHaveLength(1);
    expect(observedSignals[0]!.aborted).toBe(true);
  });

  it("retries a timed-out terminal report with the same idempotency key", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new DOMException("request timed out", "TimeoutError"))
      .mockResolvedValueOnce(jsonResponse({ data: { runStatus: "TIMED_OUT" } }));
    const client = new RuntimeControlPlaneHttpClient("http://127.0.0.1:3000", fetchMock);

    await expect(
      client.fail("credential", "worker-one", randomUUID(), LEASE_TOKEN, {
        outcome: "TIMED_OUT",
        errorCode: "RUNTIME_TIMEOUT",
        errorSummary: "Runtime deadline reached.",
      }),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstHeaders = fetchMock.mock.calls[0]![1]?.headers as Record<string, string>;
    const secondHeaders = fetchMock.mock.calls[1]![1]?.headers as Record<string, string>;
    expect(firstHeaders["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/u);
    expect(secondHeaders["idempotency-key"]).toBe(firstHeaders["idempotency-key"]);
  });

  it("recovers a committed lease after its first response is lost by replaying the same key", async () => {
    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    const committedLease = {
      data: {
        run: { id: runId, timeoutSeconds: 360, startedAt, leaseToken: LEASE_TOKEN },
        reason: null,
      },
    };
    let committed = false;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => {
      if (!committed) {
        committed = true;
        throw new TypeError("connection closed after commit");
      }
      return jsonResponse(committedLease);
    });
    const client = new RuntimeControlPlaneHttpClient("http://127.0.0.1:3000", fetchMock);

    await expect(client.lease("credential", "worker-one")).resolves.toEqual(committedLease.data);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstHeaders = fetchMock.mock.calls[0]![1]?.headers as Record<string, string>;
    const secondHeaders = fetchMock.mock.calls[1]![1]?.headers as Record<string, string>;
    expect(firstHeaders["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/u);
    expect(secondHeaders["idempotency-key"]).toBe(firstHeaders["idempotency-key"]);
    expect(fetchMock.mock.calls[1]![1]?.body).toBe(fetchMock.mock.calls[0]![1]?.body);
  });

  it("bounds a lease transport replay to one retry with the original idempotency key", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException("request timed out", "TimeoutError"));
    const client = new RuntimeControlPlaneHttpClient("http://127.0.0.1:3000", fetchMock);

    await expect(client.lease("credential", "worker-one")).rejects.toMatchObject({
      name: "TimeoutError",
      message: "request timed out",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstHeaders = fetchMock.mock.calls[0]![1]?.headers as Record<string, string>;
    const secondHeaders = fetchMock.mock.calls[1]![1]?.headers as Record<string, string>;
    expect(secondHeaders["idempotency-key"]).toBe(firstHeaders["idempotency-key"]);
  });

  it("does not replay a lease after a semantic HTTP error", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ error: { code: "AGENT_LEASE_REPLAY_UNAVAILABLE", message: "safe" } }, 409),
      );
    const client = new RuntimeControlPlaneHttpClient("http://127.0.0.1:3000", fetchMock);

    await expect(client.lease("credential", "worker-one")).rejects.toMatchObject({
      name: "RuntimeControlPlaneError",
      code: "AGENT_LEASE_REPLAY_UNAVAILABLE",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses a fresh lease idempotency key after a definitive empty poll", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () =>
      jsonResponse({
        data: { run: null, reason: "NO_ELIGIBLE_PLAN" },
      }),
    );
    const client = new RuntimeControlPlaneHttpClient("http://127.0.0.1:3000", fetchMock);

    await expect(client.lease("credential", "worker-one")).resolves.toEqual({
      run: null,
      reason: "NO_ELIGIBLE_PLAN",
    });
    await expect(client.lease("credential", "worker-one")).resolves.toEqual({
      run: null,
      reason: "NO_ELIGIBLE_PLAN",
    });

    const firstHeaders = fetchMock.mock.calls[0]![1]?.headers as Record<string, string>;
    const secondHeaders = fetchMock.mock.calls[1]![1]?.headers as Record<string, string>;
    expect(firstHeaders["idempotency-key"]).not.toBe(secondHeaders["idempotency-key"]);
  });
});
