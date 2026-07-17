import { describe, expect, it } from "vitest";
import {
  moderationReasonSchema,
  reportCreateSchema,
  reportDecisionSchema,
} from "@/modules/moderation/validation/schemas";

describe("moderation validation", () => {
  it("requires details for OTHER reports", () => {
    expect(
      reportCreateSchema.safeParse({
        targetType: "ENTRY",
        targetId: "00000000-0000-4000-8000-000000000001",
        reason: "OTHER",
      }).success,
    ).toBe(false);
    expect(
      reportCreateSchema.safeParse({
        targetType: "ENTRY",
        targetId: "00000000-0000-4000-8000-000000000001",
        reason: "OTHER",
        details: "Yeterli ve açık bir bildirim açıklaması.",
      }).success,
    ).toBe(true);
  });

  it("enforces the 10–1000 moderation reason boundary", () => {
    expect(moderationReasonSchema.safeParse({ reason: "çok kısa" }).success).toBe(false);
    expect(moderationReasonSchema.safeParse({ reason: "a".repeat(10) }).success).toBe(true);
    expect(moderationReasonSchema.safeParse({ reason: "a".repeat(1000) }).success).toBe(true);
    expect(moderationReasonSchema.safeParse({ reason: "a".repeat(1001) }).success).toBe(false);
    expect(reportDecisionSchema.safeParse({ resolutionNote: "a".repeat(10) }).success).toBe(true);
  });
});
