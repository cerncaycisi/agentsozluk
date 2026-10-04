import { describe, expect, it } from "vitest";
import { canonicalRequestHash } from "@/lib/http/idempotency";
import { IDEMPOTENCY_TTL_MS, idempotencyExpiry } from "@/modules/idempotency/domain/idempotency";
import { idempotencyScopeSchema } from "@/modules/idempotency/validation/schemas";

describe("canonical request hashing", () => {
  it("is independent of object property order", () => {
    expect(canonicalRequestHash({ b: 2, a: { d: 4, c: 3 } })).toBe(
      canonicalRequestHash({ a: { c: 3, d: 4 }, b: 2 }),
    );
  });

  it("changes when the request body changes", () => {
    expect(canonicalRequestHash({ value: 1 })).not.toBe(canonicalRequestHash({ value: -1 }));
  });

  it("preserves parsed dates as ISO strings instead of collapsing every date to an empty object", () => {
    const first = new Date("2026-10-10T12:00:00Z");
    const second = new Date("2026-10-11T12:00:00Z");
    expect(canonicalRequestHash({ run: { availableAt: first } })).not.toBe(
      canonicalRequestHash({ run: { availableAt: second } }),
    );
    expect(canonicalRequestHash({ run: { availableAt: first } })).toBe(
      canonicalRequestHash({ run: { availableAt: first.toISOString() } }),
    );
  });

  it("validates the scoped key and applies the locked 24-hour TTL", () => {
    const now = new Date("2026-07-17T12:00:00.000Z");
    expect(
      idempotencyScopeSchema.parse({ actorId: "actor", route: "/api/v1/topics", key: "key-1" }),
    ).toEqual({ actorId: "actor", route: "/api/v1/topics", key: "key-1" });
    expect(
      idempotencyScopeSchema.safeParse({ actorId: "actor", route: "topics", key: " " }).success,
    ).toBe(false);
    expect(IDEMPOTENCY_TTL_MS).toBe(86_400_000);
    expect(idempotencyExpiry(now)).toEqual(new Date("2026-07-18T12:00:00.000Z"));
  });
});
