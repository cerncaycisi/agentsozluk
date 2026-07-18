import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  claimNextRuntimeRun,
  listExpiredCancellationRunsForFinalization,
  listExpiredNonMaintenanceRunsForMaintenanceFinalization,
} from "@/modules/agents/repository/runtime";

function transactionMock() {
  return {
    $queryRaw: vi.fn(),
    agentRun: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    agentScheduleSlot: { updateMany: vi.fn() },
    agentRuntimeState: { updateMany: vi.fn() },
  };
}

const leaseInput = {
  agentProfileId: randomUUID(),
  workerId: "maintenance-worker",
  leaseSeconds: 60,
  maxRetryCount: 2,
  writeRunsPaused: false,
  catchUpFrozen: true,
  contentSlowdownMinutes: 0,
  runtimeOperatingMode: "MAINTENANCE" as const,
  now: new Date("2026-07-18T15:00:00.000Z"),
};

describe("maintenance-mode lease fencing", () => {
  it("selects expired non-maintenance work for effect-aware application finalization", async () => {
    const transaction = transactionMock();
    const runId = randomUUID();
    const scheduleSlotId = randomUUID();
    const leaseExpiresAt = new Date("2026-07-18T14:59:00.000Z");
    transaction.agentRun.findMany.mockResolvedValue([
      { id: runId, runType: "NORMAL_WAKE", scheduleSlotId, leaseExpiresAt },
    ]);
    await expect(
      listExpiredNonMaintenanceRunsForMaintenanceFinalization(
        transaction as unknown as Prisma.TransactionClient,
        leaseInput.agentProfileId,
        leaseInput.now,
      ),
    ).resolves.toEqual([
      {
        id: runId,
        runType: "NORMAL_WAKE",
        scheduleSlotId,
        leaseExpiresAt,
        previousStatus: "RUNNING",
      },
    ]);

    expect(transaction.agentRun.findMany).toHaveBeenCalledWith({
      where: {
        agentProfileId: leaseInput.agentProfileId,
        runStatus: "RUNNING",
        runType: { notIn: ["REFLECTION", "SOURCE_REFRESH"] },
        leaseExpiresAt: { lt: leaseInput.now },
      },
      select: { id: true, runType: true, scheduleSlotId: true, leaseExpiresAt: true },
    });
    expect(transaction.agentRun.updateMany).not.toHaveBeenCalled();
  });

  it("selects expired cancellation requests through the same finalization boundary", async () => {
    const transaction = transactionMock();
    const run = {
      id: randomUUID(),
      runType: "NORMAL_WAKE",
      scheduleSlotId: null,
      leaseExpiresAt: new Date("2026-07-18T14:59:00.000Z"),
    };
    transaction.agentRun.findMany.mockResolvedValue([run]);

    await expect(
      listExpiredCancellationRunsForFinalization(
        transaction as unknown as Prisma.TransactionClient,
        leaseInput.agentProfileId,
        leaseInput.now,
      ),
    ).resolves.toEqual([{ ...run, previousStatus: "CANCEL_REQUESTED" }]);
    expect(transaction.agentRun.findMany).toHaveBeenCalledWith({
      where: {
        agentProfileId: leaseInput.agentProfileId,
        runStatus: "CANCEL_REQUESTED",
        leaseExpiresAt: { lt: leaseInput.now },
      },
      select: { id: true, runType: true, scheduleSlotId: true, leaseExpiresAt: true },
    });
  });

  it("does not lease maintenance work beside another valid active run", async () => {
    const transaction = transactionMock();
    const candidateId = randomUUID();
    transaction.$queryRaw.mockResolvedValue([{ id: candidateId, startedAt: null }]);
    transaction.agentRun.findFirst.mockResolvedValue({ id: randomUUID() });

    await expect(
      claimNextRuntimeRun(transaction as unknown as Prisma.TransactionClient, leaseInput),
    ).resolves.toBeNull();
    expect(transaction.agentRun.findFirst).toHaveBeenCalledWith({
      where: {
        id: { not: candidateId },
        agentProfileId: leaseInput.agentProfileId,
        runStatus: { in: ["RUNNING", "CANCEL_REQUESTED"] },
        leaseExpiresAt: { gte: leaseInput.now },
      },
      select: { id: true },
    });
    expect(transaction.agentRun.update).not.toHaveBeenCalled();
  });

  it("keeps expiry selection ahead of the low-level reflection claim", async () => {
    const transaction = transactionMock();
    const expiredRunId = randomUUID();
    const reflectionRunId = randomUUID();
    const leaseExpiresAt = new Date("2026-07-18T14:59:00.000Z");
    transaction.agentRun.findMany.mockResolvedValueOnce([
      {
        id: expiredRunId,
        runType: "NORMAL_WAKE",
        scheduleSlotId: null,
        leaseExpiresAt,
      },
    ]);
    transaction.$queryRaw.mockResolvedValue([{ id: reflectionRunId, startedAt: null }]);
    transaction.agentRun.findFirst.mockResolvedValue(null);
    transaction.agentRun.update.mockResolvedValue({
      id: reflectionRunId,
      runType: "REFLECTION",
      scheduleSlotId: null,
    });

    await expect(
      listExpiredNonMaintenanceRunsForMaintenanceFinalization(
        transaction as unknown as Prisma.TransactionClient,
        leaseInput.agentProfileId,
        leaseInput.now,
      ),
    ).resolves.toEqual([
      {
        id: expiredRunId,
        runType: "NORMAL_WAKE",
        scheduleSlotId: null,
        leaseExpiresAt,
        previousStatus: "RUNNING",
      },
    ]);
    await expect(
      claimNextRuntimeRun(transaction as unknown as Prisma.TransactionClient, leaseInput),
    ).resolves.toMatchObject({ id: reflectionRunId, runType: "REFLECTION" });
    expect(transaction.agentRun.findMany.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.$queryRaw.mock.invocationCallOrder[0]!,
    );
    expect(transaction.agentRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: reflectionRunId } }),
    );
  });
});
