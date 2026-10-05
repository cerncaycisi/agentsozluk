import { describe, expect, expectTypeOf, it } from "vitest";
import { convertPublicIds, publicIdBigInt, publicIdNumber, publicIds } from "@/lib/db/public-ids";
import {
  entryPublicUrl,
  parseEntryRouteReference,
  parseTopicRouteReference,
} from "@/lib/routing/public-urls";

describe("BIGINT public ids at the repository boundary", () => {
  it("keeps upper namespace ids exact through nested DTOs, JSON and canonical URLs", async () => {
    const createdAt = new Date("2026-10-05T21:00:00Z");
    const rows = await publicIds(
      Promise.resolve([
        {
          publicId: 2147483648n,
          topic: { publicId: 9007199254740991n, createdAt },
          mergedInto: null,
        },
      ]),
    );
    expectTypeOf(rows[0]!.publicId).toEqualTypeOf<number>();
    expect(rows[0]!.publicId).toBe(2147483648);
    expect(rows[0]!.topic.publicId).toBe(Number.MAX_SAFE_INTEGER);
    expect(rows[0]!.topic.createdAt).toBe(createdAt);
    expect(JSON.parse(JSON.stringify(rows))[0].topic.publicId).toBe(Number.MAX_SAFE_INTEGER);
    expect(entryPublicUrl(rows[0]!)).toBe("/entry/2147483648");
    expect(parseEntryRouteReference("2147483648")).toEqual({
      kind: "public",
      publicId: 2147483648,
    });
    expect(parseTopicRouteReference("yeni--9007199254740991")).toEqual({
      kind: "public",
      publicId: Number.MAX_SAFE_INTEGER,
      slug: "yeni",
    });
  });

  it("fails closed instead of rounding an unsafe SQL id", async () => {
    for (const publicId of [0n, -1n, 9007199254740992n]) {
      await expect(publicIds(Promise.resolve({ publicId }))).rejects.toThrow(
        "PUBLIC_ID_OUT_OF_RANGE",
      );
    }
    expect(parseEntryRouteReference("9007199254740992")).toBeNull();
    expect(parseTopicRouteReference("yeni--9007199254740992")).toBeNull();
  });

  it("checks numeric inputs before building Prisma BIGINT predicates", () => {
    expect(publicIdBigInt(2147483648)).toBe(2147483648n);
    expect(publicIdBigInt(Number.MAX_SAFE_INTEGER)).toBe(9007199254740991n);
    for (const invalid of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => publicIdBigInt(invalid)).toThrow("PUBLIC_ID_OUT_OF_RANGE");
      expect(() => publicIdNumber(invalid)).toThrow("PUBLIC_ID_OUT_OF_RANGE");
    }
  });

  it("preserves unrelated ledger BIGINTs and numeric JSON payloads", () => {
    const result = convertPublicIds({
      id: 7n,
      publicId: null,
      metadata: { publicId: 0, other: 1.5 },
      rows: [{ publicId: 42n }],
    });
    expect(result).toEqual({
      id: 7n,
      publicId: null,
      metadata: { publicId: 0, other: 1.5 },
      rows: [{ publicId: 42 }],
    });
    expect(convertPublicIds(null)).toBeNull();
    expect(convertPublicIds(undefined)).toBeUndefined();
  });
});
