import { describe, expect, it } from "vitest";
import {
  ukteCreateSchema,
  ukteVisibilitySchema,
  ukteListSchema,
} from "@/modules/uktes/validation/schemas";

describe("ukte request boundaries", () => {
  it("uses the shared normalized topic limits and strips display bidi controls", () => {
    expect(ukteCreateSchema.parse({ title: "  ＡＢ  konu\u202e  " })).toEqual({ title: "AB konu" });
    expect(ukteCreateSchema.safeParse({ title: "a".repeat(100) }).success).toBe(true);
    expect(ukteCreateSchema.safeParse({ title: "a".repeat(101) }).success).toBe(false);
  });
  it.each(["", "a", "\u200b\u200b", "bozuk\u0000başlık", "iki\nkonu", "tek\ud800"])(
    "rejects unusable input %j",
    (title) => {
      expect(ukteCreateSchema.safeParse({ title }).success).toBe(false);
    },
  );
  it("cannot smuggle an entry, owner or status through the create body", () => {
    for (const patch of [
      { entryBody: "istenmeyen entry" },
      { requestedById: "başkası" },
      { status: "HIDDEN" },
    ])
      expect(ukteCreateSchema.safeParse({ title: "geçerli başlık", ...patch }).success).toBe(false);
  });
  it("requires an exact moderation version and a concrete reason", () => {
    expect(
      ukteVisibilitySchema.safeParse({ hidden: true, expectedVersion: 0, reason: "gerekçe" })
        .success,
    ).toBe(false);
    expect(
      ukteVisibilitySchema.safeParse({ hidden: true, expectedVersion: 1, reason: "   " }).success,
    ).toBe(false);
    expect(
      ukteVisibilitySchema.safeParse({ hidden: true, expectedVersion: 1, reason: "a".repeat(501) })
        .success,
    ).toBe(false);
    expect(
      ukteVisibilitySchema.parse({
        hidden: false,
        expectedVersion: 2,
        reason: "  tekrar incelendi  ",
      }).reason,
    ).toBe("tekrar incelendi");
  });
  it("bounds cursor inputs without accepting arbitrary filters", () => {
    expect(ukteListSchema.safeParse({ before: "not-an-id" }).success).toBe(false);
    expect(ukteListSchema.safeParse({ status: "HIDDEN" }).success).toBe(false);
  });
});
