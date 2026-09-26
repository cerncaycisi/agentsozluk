import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { publicIdToNumber, UnsafePublicIdError, withNumericPublicIds } from "@/lib/db/public-id";

describe("public ID bigint boundary", () => {
  it("converts nested publicId fields and keeps tuples, dates and other bigint fields", () => {
    const createdAt = new Date("2026-09-26T00:00:00Z");
    const [rows, total] = withNumericPublicIds([
      [
        {
          publicId: 2147483648n,
          createdAt,
          sequence: 7n,
          topic: { publicId: 12n, mergedInto: null },
          revisions: [{ entry: { publicId: 3n } }],
        },
      ],
      5,
    ] as const);
    expect(total).toBe(5);
    expect(rows[0]).toEqual({
      publicId: 2147483648,
      createdAt,
      sequence: 7n,
      topic: { publicId: 12, mergedInto: null },
      revisions: [{ entry: { publicId: 3 } }],
    });
    expect(rows[0]?.createdAt).toBe(createdAt);
    expect(JSON.stringify(withNumericPublicIds({ publicId: 9n }))).toBe('{"publicId":9}');
  });

  it("passes null and already numeric values through", () => {
    expect(withNumericPublicIds(null)).toBeNull();
    expect(withNumericPublicIds({ publicId: null })).toEqual({ publicId: null });
    expect(withNumericPublicIds({ publicId: 4 })).toEqual({ publicId: 4 });
  });

  it("accepts the largest safe integer and rejects anything above it", () => {
    expect(publicIdToNumber(9007199254740991n)).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => publicIdToNumber(9007199254740992n)).toThrow(UnsafePublicIdError);
    expect(() => withNumericPublicIds({ entry: { publicId: 2n ** 60n } })).toThrow(
      "PUBLIC_ID_UNSAFE",
    );
  });

  it("keeps JSON __proto__ keys as data and leaves opaque objects usable", () => {
    const metadata = JSON.parse('{"publicId":7,"__proto__":{"unexpected":true}}') as object;
    const converted = withNumericPublicIds({ metadata, raw: Buffer.from("ab") });
    expect(Object.keys(converted.metadata)).toEqual(["publicId", "__proto__"]);
    expect(Object.getPrototypeOf(converted.metadata)).toBe(Object.prototype);
    expect((converted.metadata as { unexpected?: boolean }).unexpected).toBeUndefined();
    expect(converted.raw.toString("hex")).toBe("6162");
  });

  it("refuses a non-plain object that still carries a bigint publicId", () => {
    class Row {
      publicId = 5n;
    }
    expect(() => withNumericPublicIds({ row: new Row() })).toThrow(UnsafePublicIdError);
  });

  it("types a plain row with a toJSON method the same way it converts it", () => {
    const row = withNumericPublicIds({
      publicId: 7n,
      toJSON() {
        return "row";
      },
    });
    const next: number = row.publicId + 1;
    expect(next).toBe(8);
  });

  it("keeps Prisma Decimal values usable", () => {
    const converted = withNumericPublicIds({ amount: new Prisma.Decimal("1.5"), publicId: 2n });
    expect(converted.amount.toFixed(2)).toBe("1.50");
    expect(converted.publicId).toBe(2);
  });
});
