import { describe, expect, it } from "vitest";
import {
  normalizeRuntimeDecisionOutput,
  runtimeDecisionJsonSchema,
  runtimeDecisionSchema,
} from "@/runtime/output";

function assertStrictObjects(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const schema = value as Record<string, unknown>;
  if (schema.type === "object" && schema.properties) {
    expect(schema.additionalProperties).toBe(false);
    expect([...(Array.isArray(schema.required) ? schema.required : [])].sort()).toEqual(
      Object.keys(schema.properties as Record<string, unknown>).sort(),
    );
  }
  for (const child of Object.values(schema)) assertStrictObjects(child);
}

describe("runtime structured output wire contract", () => {
  it("uses strict required properties accepted by Codex structured output", () => {
    assertStrictObjects(runtimeDecisionJsonSchema);
  });

  it("removes nullable wire placeholders before Zod action validation", () => {
    const normalized = normalizeRuntimeDecisionOutput({
      state: { curiosity: 0.5, confidence: 0.5, topicFatigue: {} },
      observations: [],
      actions: [
        {
          sequence: 1,
          actionType: "NO_ACTION",
          targetType: null,
          targetId: null,
          input: {
            body: null,
            title: null,
            topicId: null,
            entryId: null,
            userId: null,
            username: null,
            value: null,
            url: null,
            statement: null,
            summary: null,
            topicKey: null,
            confidence: null,
            familiarity: null,
            trust: null,
            interest: null,
            disagreement: null,
            sourceType: null,
            topics: null,
          },
          provenance: null,
        },
      ],
      beliefDeltas: [],
      relationshipDeltas: [],
      sourceProposals: [],
      memoryCandidates: [],
      safeRunSummary: {
        operationSummary: "Güvenli değerlendirme tamamlandı.",
        observedItemIds: [],
        shortRationale: "Yeni kanıt yok.",
      },
    });
    expect(runtimeDecisionSchema.parse(normalized).actions).toEqual([
      { sequence: 1, actionType: "NO_ACTION", input: {} },
    ]);
  });
});
