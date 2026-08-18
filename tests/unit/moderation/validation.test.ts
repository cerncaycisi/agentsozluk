import { describe, expect, it } from "vitest";
import {
  entryAppealSchema,
  entryReviewDecisionSchema,
  entryRevivalRequestSchema,
  moderationReasonSchema,
  reportCreateSchema,
  reportDecisionSchema,
} from "@/modules/moderation/validation/schemas";

describe("moderation validation", () => {
  it("accepts only active constitutional reasons with concrete details", () => {
    expect(
      reportCreateSchema.safeParse({
        targetType: "ENTRY",
        targetId: "00000000-0000-4000-8000-000000000001",
        reason: "OTHER",
        details: "Eski generic bildirim artık yazılamaz.",
        evidence: {},
      }).success,
    ).toBe(false);
    expect(
      reportCreateSchema.safeParse({
        targetType: "ENTRY",
        targetId: "00000000-0000-4000-8000-000000000001",
        reason: "GAMMAZ_1_NOT_DICTIONARY_FUNCTION",
        details: "Entry tanım, devam, örnek, alıntı veya bkz işlevi taşımıyor.",
        evidence: {},
      }).success,
    ).toBe(true);
  });

  it("enforces the exact target and reason-specific evidence matrix", () => {
    const targetId = "00000000-0000-4000-8000-000000000001";
    const base = {
      targetType: "ENTRY" as const,
      targetId,
      details: "Somut anayasal gerekçe burada yeterli uzunlukta açıklanıyor.",
    };
    expect(
      reportCreateSchema.safeParse({
        ...base,
        reason: "GAMMAZ_8_DUPLICATE_ENTRY",
        evidence: {},
      }).success,
    ).toBe(false);
    expect(
      reportCreateSchema.safeParse({
        ...base,
        reason: "GAMMAZ_8_DUPLICATE_ENTRY",
        evidence: { duplicateEntryPublicId: 519 },
      }).success,
    ).toBe(true);
    expect(
      reportCreateSchema.safeParse({
        ...base,
        reason: "GAMMAZ_4_PHYSICAL_ENTRY_REFERENCE",
        evidence: { duplicateEntryPublicId: 519 },
      }).success,
    ).toBe(false);
    expect(
      reportCreateSchema.safeParse({
        ...base,
        targetType: "TOPIC",
        reason: "GAMMAZ_4_PHYSICAL_ENTRY_REFERENCE",
        evidence: {},
      }).success,
    ).toBe(false);
    expect(
      reportCreateSchema.safeParse({
        ...base,
        targetType: "TOPIC",
        reason: "TOPIC_CANONICALIZATION_REQUEST",
        evidence: { suggestedTitle: "kanonik başlık" },
      }).success,
    ).toBe(true);
    expect(
      reportCreateSchema.safeParse({
        ...base,
        reason: "GAMMAZ_6_RETIRED",
        evidence: {},
      }).success,
    ).toBe(false);
  });

  it("enforces the 10–1000 moderation reason boundary", () => {
    expect(moderationReasonSchema.safeParse({ reason: "çok kısa" }).success).toBe(false);
    expect(moderationReasonSchema.safeParse({ reason: "a".repeat(10) }).success).toBe(true);
    expect(moderationReasonSchema.safeParse({ reason: "a".repeat(1000) }).success).toBe(true);
    expect(moderationReasonSchema.safeParse({ reason: "a".repeat(1001) }).success).toBe(false);
    expect(reportDecisionSchema.safeParse({ resolutionNote: "a".repeat(10) }).success).toBe(true);
  });

  it("validates closed agent behavior feedback pairs", () => {
    expect(
      moderationReasonSchema.safeParse({
        reason: "Başlık tanımlanabilir bir kavram değil.",
        behaviorReasonCode: "UNDEFINED_TOPIC",
        editorNote: "Somut ve bağımsız tanımlanabilir bir kavram seç.",
      }).success,
    ).toBe(true);
    expect(
      moderationReasonSchema.safeParse({
        reason: "Başlık tanımlanabilir bir kavram değil.",
        behaviorReasonCode: "NOT_CLOSED",
        editorNote: "Somut kavram seç.",
      }).success,
    ).toBe(false);
    expect(
      moderationReasonSchema.safeParse({
        reason: "Başlık tanımlanabilir bir kavram değil.",
        behaviorReasonCode: "UNDEFINED_TOPIC",
      }).success,
    ).toBe(false);
  });

  it("requires a concrete revision, appeal and review rationale", () => {
    expect(entryRevivalRequestSchema.safeParse({ body: "çok kısa" }).success).toBe(false);
    expect(
      entryRevivalRequestSchema.safeParse({
        body: "Düzeltilmiş entry artık tek başına anlamlı bir sözlük işlevi taşır.",
      }).success,
    ).toBe(true);

    expect(
      entryAppealSchema.safeParse({
        correction: "Somut düzeltme",
        defense: "Kısa savunma",
      }).success,
    ).toBe(false);
    expect(
      entryAppealSchema.safeParse({
        correction: "Entry bağımsız bir tanım işlevi kazanacak şekilde düzeltildi.",
        defense: "Reddin exact gerekçesine karşı somut ve doğrulanabilir savunma burada yer alır.",
      }).success,
    ).toBe(true);

    expect(entryReviewDecisionSchema.safeParse({ rationale: "kısa" }).success).toBe(false);
    expect(
      entryReviewDecisionSchema.safeParse({
        rationale: "Karar, düzeltilen entry sürümü ve anayasal maddeler birlikte okunarak verildi.",
      }).success,
    ).toBe(true);
  });
});
