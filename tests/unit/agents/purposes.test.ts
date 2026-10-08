import { describe, expect, it } from "vitest";
import { runtimePurposeChangesSchema } from "@/modules/agents/validation/purpose-schemas";
import { deriveRuntimePerceptionEvidence } from "@/modules/agents/domain/runtime-evidence";
import { browsableTopicMenu } from "@/modules/agents/domain/runtime-browse";
import { runtimeEvidenceCatalogFrom } from "@/modules/agents/domain/runtime-evidence-catalog";
import { runtimeNormalDecisionWireJsonSchema } from "@/runtime/output";

const targetId = "00000000-0000-4000-8000-000000000001";
const purposeId = "00000000-0000-4000-8000-000000000002";
const create = {
  operation: "CREATE",
  kind: "UNDERSTAND_CONCEPT",
  targetType: "TOPIC",
  targetId,
  question: "Bu kavramın sınırlarını anlamak istiyorum.",
};

describe("bounded author purpose contract", () => {
  it("rejects self-awarded success, custom policy and quota fields", () => {
    for (const field of [
      { status: "FULFILLED" },
      { reward: 1 },
      { expiresAt: "2099-01-01" },
      { completionCriterion: "TEN_ENTRIES" },
      { entryTarget: 10 },
    ])
      expect(runtimePurposeChangesSchema.safeParse([{ ...create, ...field }]).success).toBe(false);
    expect(
      runtimePurposeChangesSchema.safeParse([
        { operation: "FULFILL", purposeId, expectedVersion: 1, note: "Tamamladım." },
      ]).success,
    ).toBe(false);
    expect(runtimePurposeChangesSchema.safeParse([create, create, create]).success).toBe(false);
    expect(
      runtimePurposeChangesSchema.safeParse([
        { operation: "REVIEW", purposeId, note: "Tekrar düşündüm." },
      ]).success,
    ).toBe(false);
  });
  it("keeps intent identities out of evidence while offering only the bounded topic menu", () => {
    const perception = {
      purposes: [{ id: purposeId, targetId, question: "Niyet" }],
      purposeTopics: [{ id: targetId, title: "Kavram" }],
      trendingTopics: Array.from({ length: 30 }, (_, i) => ({
        id: `topic-${i}`,
        title: `Başlık ${i}`,
      })),
      linkedTopics: Array.from({ length: 30 }, (_, i) => ({
        topic: { id: `linked-${i}`, title: `Bağlantı ${i}` },
      })),
    };
    expect(deriveRuntimePerceptionEvidence(perception).ids).toEqual([targetId]);
    expect(runtimeEvidenceCatalogFrom(perception, "run").PLATFORM_EVENT).not.toContain(purposeId);
    expect(browsableTopicMenu(perception)).toHaveLength(24);
    expect(browsableTopicMenu(perception)[0]).toMatchObject({ id: targetId });
    expect(browsableTopicMenu(perception).filter(({ hint }) => hint === "gündem")).toHaveLength(3);
  });
  it("uses provider-compatible required purpose output without default, format or oneOf", () => {
    const json = JSON.stringify(runtimeNormalDecisionWireJsonSchema);
    for (const keyword of ['"default"', '"format"', '"oneOf"']) expect(json).not.toContain(keyword);
    expect(runtimeNormalDecisionWireJsonSchema.required).toContain("purposeChanges");
  });
});
