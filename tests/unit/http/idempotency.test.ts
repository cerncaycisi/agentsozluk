import { describe, expect, it } from "vitest";
import { canonicalRequestHash } from "@/lib/http/idempotency";

describe("canonical request hashing", () => {
  it("is independent of object property order", () => {
    expect(canonicalRequestHash({ b: 2, a: { d: 4, c: 3 } })).toBe(
      canonicalRequestHash({ a: { c: 3, d: 4 }, b: 2 }),
    );
  });

  it("changes when the request body changes", () => {
    expect(canonicalRequestHash({ value: 1 })).not.toBe(canonicalRequestHash({ value: -1 }));
  });
});
