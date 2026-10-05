import { afterEach, describe, expect, it, vi } from "vitest";
import type { DatabaseClient, TransactionClient } from "@/lib/db/types";
import { getResetGoneDecision } from "@/modules/maintenance/application/reset-gone";
const uuid = "550e8400-e29b-41d4-a716-446655440000";
const candidate = { kind: "ENTRY", reference: "PUBLIC_ID", publicId: 42 } as const;
function fixture(commit = true, live = false) {
  const tx = {
    $executeRaw: vi.fn(async () => 0),
    greatResetCommit: { findFirst: vi.fn(async () => (commit ? { operationId: "reset" } : null)) },
    greatResetTombstone: {
      findMany: vi.fn(async () => [
        { kind: "ENTRY", uuid, publicId: 42n },
        { kind: "TOPIC", uuid, publicId: 43n },
      ]),
    },
    topic: { findUnique: vi.fn(async () => (live ? { id: uuid } : null)) },
    entry: { findUnique: vi.fn(async () => (live ? { id: uuid } : null)) },
  };
  const transaction = vi.fn(async (work: (client: TransactionClient) => unknown) =>
    work(tx as unknown as TransactionClient),
  );
  return { tx, transaction, client: { $transaction: transaction } as unknown as DatabaseClient };
}
afterEach(() => vi.useRealTimers());
describe("reset gone process cache and prefetch pressure", () => {
  it("coalesces one hundred simultaneous marker and same-address live lookups", async () => {
    const f = fixture();
    expect(
      await Promise.all(
        Array.from({ length: 100 }, () => getResetGoneDecision(f.client, candidate)),
      ),
    ).toEqual(Array(100).fill("GONE"));
    expect(f.tx.greatResetCommit.findFirst).toHaveBeenCalledTimes(1);
    expect(f.tx.greatResetTombstone.findMany).toHaveBeenCalledTimes(1);
    expect(f.tx.entry.findUnique).toHaveBeenCalledTimes(1);
    expect(f.transaction).toHaveBeenCalledTimes(2);
  });
  it("unknown links use no DB after the immutable index was loaded", async () => {
    const f = fixture();
    await getResetGoneDecision(f.client, candidate);
    const before = f.transaction.mock.calls.length;
    expect(
      await Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          getResetGoneDecision(f.client, {
            kind: "ENTRY",
            reference: "PUBLIC_ID",
            publicId: i + 1000,
          }),
        ),
      ),
    ).toEqual(Array(100).fill("PASS"));
    expect(f.transaction).toHaveBeenCalledTimes(before);
  });
  it("does not cache live absence across completed reads", async () => {
    const f = fixture();
    expect(await getResetGoneDecision(f.client, candidate)).toBe("GONE");
    f.tx.entry.findUnique.mockResolvedValue({ id: uuid });
    expect(await getResetGoneDecision(f.client, candidate)).toBe("PASS");
    expect(f.tx.entry.findUnique).toHaveBeenCalledTimes(2);
  });
  it("bounds absent-marker caching by monotonic time and reloads after the TTL", async () => {
    vi.useFakeTimers({ toFake: ["performance"] });
    const f = fixture(false);
    expect(await getResetGoneDecision(f.client, candidate)).toBe("PASS");
    f.tx.greatResetCommit.findFirst.mockResolvedValue({ operationId: "reset" });
    expect(await getResetGoneDecision(f.client, candidate)).toBe("PASS");
    vi.advanceTimersByTime(251);
    expect(await getResetGoneDecision(f.client, candidate)).toBe("GONE");
    expect(f.tx.greatResetCommit.findFirst).toHaveBeenCalledTimes(2);
  });
  it("does not cache an unsuccessful marker/index load or invent GONE", async () => {
    const f = fixture();
    f.tx.greatResetTombstone.findMany.mockRejectedValueOnce(new Error("private query details"));
    await expect(getResetGoneDecision(f.client, candidate)).rejects.toThrow(
      "private query details",
    );
    expect(await getResetGoneDecision(f.client, candidate)).toBe("GONE");
    expect(f.tx.greatResetCommit.findFirst).toHaveBeenCalledTimes(2);
  });
  it("keeps cache lifetime bound to the DB client/process; a fresh client sees restored state", async () => {
    const original = fixture();
    expect(await getResetGoneDecision(original.client, candidate)).toBe("GONE");
    const restored = fixture(false);
    expect(await getResetGoneDecision(restored.client, candidate)).toBe("PASS");
  });
  it("keeps topic/entry and UUID/public-id namespaces separate", async () => {
    const f = fixture();
    expect(
      await getResetGoneDecision(f.client, { kind: "TOPIC", reference: "PUBLIC_ID", publicId: 42 }),
    ).toBe("PASS");
    expect(await getResetGoneDecision(f.client, { kind: "TOPIC", reference: "UUID", uuid })).toBe(
      "GONE",
    );
    expect(await getResetGoneDecision(f.client, { kind: "ENTRY", reference: "UUID", uuid })).toBe(
      "GONE",
    );
  });
});
