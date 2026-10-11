import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  isDeadlockError,
  isLockNotAvailableError,
  isRetryableLockConflict,
  TransientLockConflictError,
} from "@/lib/db/errors";
import {
  inLockConflictRetryingTransaction,
  LOCK_CONFLICT_RETRY_ATTEMPTS,
  LOCK_CONFLICT_RETRY_BUDGET_MS,
  retryOnLockConflict,
} from "@/lib/db/transaction";
import type { DatabaseExecutor } from "@/lib/db/types";

function knownError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError("database error", {
    code,
    clientVersion: Prisma.prismaVersion.client,
    ...(meta ? { meta } : {}),
  });
}

describe("lock conflict retry", () => {
  it("recognizes deadlock aborts, NOWAIT failures and the moderation busy signal", () => {
    expect(isDeadlockError(knownError("P2034"))).toBe(true);
    expect(isDeadlockError(knownError("P2010", { code: "40P01" }))).toBe(true);
    expect(isDeadlockError(knownError("P2010", { code: "25P02" }))).toBe(false);
    expect(isDeadlockError(new Error("deadlock detected"))).toBe(false);
    expect(isLockNotAvailableError(knownError("P2010", { code: "55P03" }))).toBe(true);
    expect(isLockNotAvailableError(knownError("P2010", { code: "40P01" }))).toBe(false);
    expect(isRetryableLockConflict(new TransientLockConflictError())).toBe(true);
    expect(isRetryableLockConflict(knownError("P2034"))).toBe(true);
    // NOWAIT hatası transaction'ı iptal eder; yazıcı onu meşgul sinyaline çevirmeden tekrar edilmez.
    expect(isRetryableLockConflict(knownError("P2010", { code: "55P03" }))).toBe(false);
    expect(isRetryableLockConflict(knownError("P2002"))).toBe(false);
    expect(new TransientLockConflictError()).toMatchObject({
      code: "AGENT_PROFILE_STATE_CONFLICT",
      status: 409,
    });
  });

  it("re-runs a busy or deadlocked attempt and stops at the attempt limit", async () => {
    const busy = new TransientLockConflictError();
    const recovers = vi.fn().mockRejectedValueOnce(busy).mockResolvedValueOnce("ok");
    await expect(retryOnLockConflict(recovers)).resolves.toBe("ok");
    expect(recovers).toHaveBeenCalledTimes(2);

    const clock = 0;
    const keepsFailing = vi.fn().mockRejectedValue(knownError("P2034"));
    await expect(retryOnLockConflict(keepsFailing, () => clock)).rejects.toMatchObject({
      code: "P2034",
    });
    expect(keepsFailing).toHaveBeenCalledTimes(LOCK_CONFLICT_RETRY_ATTEMPTS);
  });

  it("starts no new attempt once the budget is spent, checked after the backoff", async () => {
    const busy = new TransientLockConflictError();
    let clock = 0;
    const slow = vi.fn(async () => {
      clock += LOCK_CONFLICT_RETRY_BUDGET_MS;
      throw busy;
    });
    await expect(retryOnLockConflict(slow, () => clock)).rejects.toBe(busy);
    expect(slow).toHaveBeenCalledTimes(1);

    clock = 0;
    const almost = vi.fn(async () => {
      clock += LOCK_CONFLICT_RETRY_BUDGET_MS - 1;
      throw busy;
    });
    vi.useFakeTimers();
    try {
      const base = Date.now();
      const pending = retryOnLockConflict(almost, () => clock + Date.now() - base);
      const outcome = expect(pending).rejects.toBe(busy);
      await vi.advanceTimersByTimeAsync(1_000);
      await outcome;
    } finally {
      vi.useRealTimers();
    }
    expect(almost).toHaveBeenCalledTimes(1);
  });

  it("does not re-run other failures", async () => {
    const conflict = knownError("P2002");
    const work = vi.fn().mockRejectedValue(conflict);
    await expect(retryOnLockConflict(work)).rejects.toBe(conflict);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("leaves a nested transaction's retry to the outermost transaction", async () => {
    const busy = new TransientLockConflictError();
    const nested = {} as DatabaseExecutor;
    const work = vi.fn().mockRejectedValue(busy);
    await expect(inLockConflictRetryingTransaction(nested, work)).rejects.toBe(busy);
    expect(work).toHaveBeenCalledTimes(1);
  });
});
