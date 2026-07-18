import { describe, expect, it, vi } from "vitest";
import type { DatabaseExecutor } from "@/lib/db/types";
import {
  replayRuntimeLeaseIdempotencyTombstone,
  storeRuntimeLeaseIdempotencyTombstone,
} from "@/lib/http/agent-runtime-action";
import { sha256 } from "@/lib/security/crypto";
import { assertRuntimeLeaseDatabaseReadiness } from "@/modules/agents";
import type { RuntimePrincipal } from "@/modules/agents/application/runtime-auth";

describe("runtime lease database readiness", () => {
  const executor = {} as DatabaseExecutor;

  it("allows lease evaluation only after the readiness probe succeeds", async () => {
    const checkReadiness = vi.fn().mockResolvedValue(undefined);

    await expect(
      assertRuntimeLeaseDatabaseReadiness(executor, checkReadiness),
    ).resolves.toBeUndefined();
    expect(checkReadiness).toHaveBeenCalledOnce();
    expect(checkReadiness).toHaveBeenCalledWith(executor);
  });

  it("fails closed with a stable 503 and hides the database error", async () => {
    const checkReadiness = vi
      .fn()
      .mockRejectedValue(new Error("password authentication failed for private_database_user"));

    await expect(
      assertRuntimeLeaseDatabaseReadiness(executor, checkReadiness),
    ).rejects.toMatchObject({
      code: "SERVICE_NOT_READY",
      status: 503,
      message: "Database hazır değil; runtime lease verilmedi.",
    });
  });

  it("stores lease idempotency as a token-free fingerprint tombstone", () => {
    const leaseToken = "A".repeat(43);
    const stored = storeRuntimeLeaseIdempotencyTombstone({
      data: {
        run: {
          id: "00000000-0000-4000-8000-000000000111",
          leaseToken,
          leaseExpiresAt: "2026-07-18T12:01:00.000Z",
        },
      },
      requestId: "request-1",
    });

    expect(JSON.stringify(stored)).not.toContain(leaseToken);
    expect(stored).toMatchObject({
      data: {
        run: {
          id: "00000000-0000-4000-8000-000000000111",
          leaseTokenFingerprint: sha256(leaseToken),
        },
      },
    });
    expect(storeRuntimeLeaseIdempotencyTombstone({ data: { run: null } })).toEqual({
      data: { run: null },
    });
  });

  it("rehydrates only an authoritative matching active lease generation", async () => {
    const leaseToken = "B".repeat(43);
    const runId = "00000000-0000-4000-8000-000000000222";
    const body = {
      data: { run: { id: runId, leaseToken, runStatus: "RUNNING" } },
      requestId: "request-2",
    } as const;
    const tombstone = storeRuntimeLeaseIdempotencyTombstone(body);
    const findFirst = vi.fn().mockResolvedValue({ leaseToken });
    const database = { agentRun: { findFirst } } as unknown as DatabaseExecutor;
    const principal: RuntimePrincipal = {
      credentialId: "credential-1",
      agentProfileId: "00000000-0000-4000-8000-000000000333",
      lifecycleStatus: "ACTIVE",
      actor: {
        actorId: "00000000-0000-4000-8000-000000000444",
        actorKind: "AGENT",
        actorRole: "USER",
        requestId: "request-2",
        origin: "AGENT",
      },
    };

    await expect(
      replayRuntimeLeaseIdempotencyTombstone(
        database,
        principal,
        { workerId: "worker-1" },
        tombstone,
      ),
    ).resolves.toEqual(body);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: runId,
        agentProfileId: principal.agentProfileId,
        leaseOwner: "worker-1",
        runStatus: { in: ["RUNNING", "CANCEL_REQUESTED"] },
        leaseExpiresAt: { gte: expect.any(Date) },
      },
      select: { leaseToken: true },
    });

    findFirst.mockResolvedValueOnce(null);
    await expect(
      replayRuntimeLeaseIdempotencyTombstone(
        database,
        principal,
        { workerId: "worker-1" },
        tombstone,
      ),
    ).rejects.toMatchObject({ code: "AGENT_RUN_LEASE_INVALID", status: 409 });
  });
});
