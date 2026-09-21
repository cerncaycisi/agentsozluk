import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

/*
  Lease telemetrisinin zinciri (Sol, 21 Eylül 2026): route → runAgentRuntimeAction →
  idempotentResponse → executeIdempotently → withIdempotencyLock. Halkalardan biri
  etiketi düşürürse üretimde tek kayıt oluşmaz, telemetri testleri yine geçer.
  Burada her aktarım halkası ayrı ayrı sabitleniyor; route halkası
  runtime-route-wiring testinde.
*/

const withIdempotencyLock = vi.hoisted(() => vi.fn());
const executeIdempotently = vi.hoisted(() => vi.fn());
const idempotentResponse = vi.hoisted(() => vi.fn());

vi.mock("@/modules/idempotency/repository/idempotency", () => ({
  createIdempotencyRecord: vi.fn(),
  deleteIdempotencyRecord: vi.fn(),
  findIdempotencyRecord: vi.fn(),
  withIdempotencyLock,
}));

vi.mock("@/lib/db/client", () => ({ getDatabase: () => ({ marker: "db" }) }));

vi.mock("@/modules/agents/application/runtime-auth", () => ({
  authenticateRuntimeRequest: vi.fn(async () => ({
    credentialId: "credential",
    agentProfileId: "profile",
    lifecycleStatus: "ACTIVE",
    actor: { actorId: "actor" },
  })),
}));

vi.mock("@/modules/rate-limit/application/rate-limit", () => ({
  enforceRateLimit: vi.fn(async () => undefined),
  RATE_LIMIT_RULES: { agentRuntimeInternal: {} },
  runtimeCredentialRateLimitIdentifier: (id: string) => id,
}));

function runtimeRequest() {
  return new NextRequest("http://localhost/api/v1/internal/agent-runtime/lease", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "anahtar-1" },
    body: JSON.stringify({ workerId: "worker" }),
  });
}

beforeEach(() => {
  withIdempotencyLock.mockReset();
  executeIdempotently.mockReset();
  idempotentResponse.mockReset();
});

describe("lease telemetri etiketinin aktarımı", () => {
  it("executeIdempotently etiketi withIdempotencyLock'a iletir, etiketsizde iletmez", async () => {
    const { executeIdempotently: gercek } =
      await import("@/modules/idempotency/application/idempotency");
    withIdempotencyLock.mockResolvedValue({ status: 200, body: {}, replayed: false });
    const girdi = { actorId: "actor", route: "/r", key: "anahtar-1", requestBody: {} };

    await gercek({} as never, { ...girdi, telemetryLabel: "runtime.lease" }, vi.fn());
    expect(withIdempotencyLock.mock.calls[0]?.[3]).toEqual({ label: "runtime.lease" });

    await gercek({} as never, girdi, vi.fn());
    expect(withIdempotencyLock.mock.calls[1]?.[3]).toBeUndefined();
  });

  it("idempotentResponse etiketi executeIdempotently'ye iletir", async () => {
    vi.doMock("@/modules/idempotency/application/idempotency", () => ({ executeIdempotently }));
    vi.resetModules();
    const { idempotentResponse: gercek } = await import("@/lib/http/idempotency");
    executeIdempotently.mockResolvedValue({ status: 200, body: {}, replayed: false });

    await gercek(
      runtimeRequest(),
      { actorId: "actor", route: "/r", requestBody: {}, telemetryLabel: "runtime.lease" },
      vi.fn(),
    );
    expect(executeIdempotently.mock.calls[0]?.[1]).toMatchObject({
      telemetryLabel: "runtime.lease",
    });
    vi.doUnmock("@/modules/idempotency/application/idempotency");
  });

  it("runAgentRuntimeAction transactionTelemetryLabel'ı idempotentResponse'a iletir", async () => {
    vi.doMock("@/lib/http/idempotency", () => ({ idempotentResponse }));
    vi.resetModules();
    const { runAgentRuntimeAction } = await import("@/lib/http/agent-runtime-action");
    idempotentResponse.mockResolvedValue(NextResponse.json({}, { status: 200 }));
    const sema = z.object({ workerId: z.string() });

    await runAgentRuntimeAction(runtimeRequest(), sema, "runtime:lease", vi.fn(), {
      transactionTelemetryLabel: "runtime.lease",
    });
    expect(idempotentResponse.mock.calls[0]?.[1]).toMatchObject({
      telemetryLabel: "runtime.lease",
    });

    await runAgentRuntimeAction(runtimeRequest(), sema, "runtime:lease", vi.fn());
    expect(idempotentResponse.mock.calls[1]?.[1]).not.toHaveProperty("telemetryLabel");
    vi.doUnmock("@/lib/http/idempotency");
  });
});
