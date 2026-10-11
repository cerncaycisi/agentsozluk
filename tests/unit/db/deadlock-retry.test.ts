import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { isDeadlockError } from "@/lib/db/errors";
import {
  DEADLOCK_RETRY_ATTEMPTS,
  DEADLOCK_RETRY_BUDGET_MS,
  inDeadlockRetryingTransaction,
  retryOnDeadlock,
} from "@/lib/db/transaction";
import type { DatabaseExecutor } from "@/lib/db/types";

function knownError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError("database error", {
    code,
    clientVersion: Prisma.prismaVersion.client,
    ...(meta ? { meta } : {}),
  });
}

describe("deadlock retry", () => {
  it("recognizes only PostgreSQL deadlock aborts", () => {
    expect(isDeadlockError(knownError("P2034"))).toBe(true);
    expect(isDeadlockError(knownError("P2010", { code: "40P01" }))).toBe(true);
    expect(isDeadlockError(knownError("P2010", { code: "25P02" }))).toBe(false);
    expect(isDeadlockError(knownError("P2002"))).toBe(false);
    expect(isDeadlockError(new Error("deadlock detected"))).toBe(false);
  });

  it("re-runs a deadlock victim and stops at the attempt limit", async () => {
    const deadlock = knownError("P2010", { code: "40P01" });
    const recovers = vi.fn().mockRejectedValueOnce(deadlock).mockResolvedValueOnce("ok");
    await expect(retryOnDeadlock(recovers)).resolves.toBe("ok");
    expect(recovers).toHaveBeenCalledTimes(2);

    const keepsFailing = vi.fn().mockRejectedValue(deadlock);
    await expect(retryOnDeadlock(keepsFailing)).rejects.toBe(deadlock);
    expect(keepsFailing).toHaveBeenCalledTimes(DEADLOCK_RETRY_ATTEMPTS);
  });

  it("starts no new attempt after the retry limit, checked after the backoff", async () => {
    const deadlock = knownError("P2034");
    let clock = 0;
    const now = () => clock;
    const slow = vi.fn(async () => {
      clock += DEADLOCK_RETRY_BUDGET_MS;
      throw deadlock;
    });
    await expect(retryOnDeadlock(slow, { now })).rejects.toBe(deadlock);
    expect(slow).toHaveBeenCalledTimes(1);

    // Sınırın hemen altında biten deneme: bekleme sınırı aşırınca yeni deneme başlamaz.
    clock = 0;
    const almost = vi.fn(async () => {
      clock += DEADLOCK_RETRY_BUDGET_MS - 1;
      throw deadlock;
    });
    vi.useFakeTimers();
    try {
      const base = Date.now();
      const pending = retryOnDeadlock(almost, { now: () => clock + Date.now() - base });
      const outcome = expect(pending).rejects.toBe(deadlock);
      await vi.advanceTimersByTimeAsync(200);
      await outcome;
    } finally {
      vi.useRealTimers();
    }
    expect(almost).toHaveBeenCalledTimes(1);

    clock = 0;
    const fast = vi.fn(async () => {
      clock += 100;
      throw deadlock;
    });
    await expect(retryOnDeadlock(fast, { now, retryUntil: 150 })).rejects.toBe(deadlock);
    expect(fast).toHaveBeenCalledTimes(2);
  });

  it("does not re-run other failures", async () => {
    const conflict = knownError("P2002");
    const work = vi.fn().mockRejectedValue(conflict);
    await expect(retryOnDeadlock(work)).rejects.toBe(conflict);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("leaves a nested transaction's retry to the outermost transaction", async () => {
    const deadlock = knownError("P2034");
    const nested = {} as DatabaseExecutor;
    const work = vi.fn().mockRejectedValue(deadlock);
    await expect(inDeadlockRetryingTransaction(nested, work)).rejects.toBe(deadlock);
    expect(work).toHaveBeenCalledTimes(1);
  });
});
