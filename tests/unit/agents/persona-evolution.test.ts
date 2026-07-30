import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  applyWeeklyPersonaEvolution,
  assertPinnedPersonaFieldsUnchanged,
  assertWeeklyPersonaEvolutionBudget,
  unlockPersonaWeightLocks,
  WEEKLY_PERSONA_EVOLUTION_BOUNDS,
  weeklyPersonaEvolutionDeltaSchema,
} from "@/modules/agents/domain/persona-evolution";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";

const currentPersona = originalPersonaPack.personas[0]!;

function emptyDelta() {
  return {
    safeSummary: "Haftalık değişimler yalnız gözlenen dijital kanıtlara dayanıyor.",
    interestDeltas: [],
    sourceTrustDeltas: [],
    relationshipTrustDeltas: [],
    beliefConfidenceDeltas: [],
    temperamentDeltas: [],
    coreValueDeltas: [],
  };
}

describe("weekly persona evolution domain", () => {
  it("accepts every exact positive and negative weekly boundary", () => {
    const sourceId = randomUUID();
    const targetUserId = randomUUID();
    expect(
      weeklyPersonaEvolutionDeltaSchema.parse({
        ...emptyDelta(),
        interestDeltas: [
          { key: "dijital kültür", delta: WEEKLY_PERSONA_EVOLUTION_BOUNDS.interest },
          { key: "şehir altyapısı", delta: -WEEKLY_PERSONA_EVOLUTION_BOUNDS.interest },
        ],
        sourceTrustDeltas: [{ sourceId, delta: -WEEKLY_PERSONA_EVOLUTION_BOUNDS.sourceTrust }],
        relationshipTrustDeltas: [
          { targetUserId, delta: WEEKLY_PERSONA_EVOLUTION_BOUNDS.relationshipTrust },
        ],
        beliefConfidenceDeltas: [
          { topicKey: "kanıt", delta: -WEEKLY_PERSONA_EVOLUTION_BOUNDS.beliefConfidence },
        ],
        temperamentDeltas: [
          { key: "curiosity", delta: WEEKLY_PERSONA_EVOLUTION_BOUNDS.temperament },
        ],
        coreValueDeltas: [
          { key: "ölçülü karmaşıklık", delta: -WEEKLY_PERSONA_EVOLUTION_BOUNDS.coreValue },
        ],
      }),
    ).toBeTruthy();
  });

  it("enforces cumulative per-target weekly budgets across reflection versions", () => {
    const sourceId = randomUUID();
    const previous = {
      ...emptyDelta(),
      interestDeltas: [
        { key: "dijital kültür", delta: 0.04 },
        { key: "şehir altyapısı", delta: -0.04 },
      ],
      sourceTrustDeltas: [{ sourceId, delta: 0.06 }],
    };
    expect(
      assertWeeklyPersonaEvolutionBudget({
        previousWeeklyDeltas: [previous],
        delta: {
          ...emptyDelta(),
          interestDeltas: [
            { key: "dijital kültür", delta: 0.04 },
            { key: "şehir altyapısı", delta: -0.04 },
          ],
          sourceTrustDeltas: [{ sourceId, delta: 0.04 }],
        },
      }),
    ).toBeTruthy();
    expect(() =>
      assertWeeklyPersonaEvolutionBudget({
        previousWeeklyDeltas: [previous],
        delta: {
          ...emptyDelta(),
          interestDeltas: [
            { key: "dijital kültür", delta: 0.041 },
            { key: "şehir altyapısı", delta: -0.041 },
          ],
        },
      }),
    ).toThrow(/haftalık persona evolution sınırı/iu);
    expect(() =>
      assertWeeklyPersonaEvolutionBudget({
        previousWeeklyDeltas: [previous],
        delta: { ...emptyDelta(), sourceTrustDeltas: [{ sourceId, delta: 0.041 }] },
      }),
    ).toThrow(/haftalık persona evolution sınırı/iu);
  });

  it.each([
    ["interestDeltas", { key: "dijital kültür", delta: 0.080_001 }],
    ["sourceTrustDeltas", { sourceId: randomUUID(), delta: -0.100_001 }],
    ["relationshipTrustDeltas", { targetUserId: randomUUID(), delta: 0.100_001 }],
    ["beliefConfidenceDeltas", { topicKey: "kanıt", delta: -0.150_001 }],
    ["temperamentDeltas", { key: "curiosity", delta: 0.030_001 }],
    ["coreValueDeltas", { key: "ölçülü karmaşıklık", delta: -0.020_001 }],
  ])("rejects a %s value even slightly beyond its exact bound", (field, value) => {
    expect(() =>
      weeklyPersonaEvolutionDeltaSchema.parse({
        ...emptyDelta(),
        [field]: [value],
      }),
    ).toThrow();
  });

  it("rejects unknown fields, unknown targets and duplicate targets", () => {
    expect(() =>
      weeklyPersonaEvolutionDeltaSchema.parse({ ...emptyDelta(), writingDeltas: [] }),
    ).toThrow();
    expect(() =>
      weeklyPersonaEvolutionDeltaSchema.parse({
        ...emptyDelta(),
        temperamentDeltas: [{ key: "privateThoughts", delta: 0.01 }],
      }),
    ).toThrow();
    expect(() =>
      weeklyPersonaEvolutionDeltaSchema.parse({
        ...emptyDelta(),
        coreValueDeltas: [
          { key: "ölçülü karmaşıklık", delta: 0.01 },
          { key: "ölçülü karmaşıklık", delta: -0.01 },
        ],
      }),
    ).toThrow(/yalnız bir kez/iu);
    expect(() =>
      applyWeeklyPersonaEvolution({
        currentPersona,
        delta: { ...emptyDelta(), coreValueDeltas: [{ key: "olmayan değer", delta: 0.01 }] },
      }),
    ).toThrow(/bulunamadı/iu);
  });

  it("applies only allowed persona fields and keeps interest weights normalized", () => {
    const result = applyWeeklyPersonaEvolution({
      currentPersona,
      delta: {
        ...emptyDelta(),
        interestDeltas: [
          { key: "dijital kültür", delta: 0.04 },
          { key: "şehir altyapısı", delta: -0.04 },
        ],
        temperamentDeltas: [{ key: "warmth", delta: 0.03 }],
        coreValueDeltas: [{ key: "ölçülü karmaşıklık", delta: 0.02 }],
      },
    });
    expect(result.persona.interests.find(({ key }) => key === "dijital kültür")?.weight).toBe(0.22);
    expect(result.persona.interests.find(({ key }) => key === "şehir altyapısı")?.weight).toBe(
      0.11,
    );
    expect(result.persona.interests.reduce((sum, item) => sum + item.weight, 0)).toBe(1);
    expect(result.persona.temperament.warmth).toBe(0.45);
    expect(result.persona.coreValues.find(({ key }) => key === "ölçülü karmaşıklık")?.weight).toBe(
      0.82,
    );
    expect(result.persona.username).toBe(currentPersona.username);
    expect(result.persona.writing).toEqual(currentPersona.writing);
    expect(result.validationReport.changedPaths).toEqual([
      "interests.dijital kültür",
      "interests.şehir altyapısı",
      "temperament.warmth",
      "coreValues.ölçülü karmaşıklık",
    ]);
    expect(result.validationReport).toMatchObject({
      deltaBoundsPassed: true,
      pinnedFieldsPassed: true,
      interestsNormalized: true,
      candidate: { ontologyPassed: true },
    });
  });

  it("rejects unbalanced interest changes instead of silently changing unlisted fields", () => {
    expect(() =>
      applyWeeklyPersonaEvolution({
        currentPersona,
        delta: {
          ...emptyDelta(),
          interestDeltas: [{ key: "dijital kültür", delta: 0.04 }],
        },
      }),
    ).toThrow(/toplam ağırlığı 1/iu);
  });

  it("rejects resulting values outside the closed zero-to-one interval", () => {
    const nearCeiling = structuredClone(currentPersona);
    nearCeiling.temperament.warmth = 0.99;
    expect(() =>
      applyWeeklyPersonaEvolution({
        currentPersona: nearCeiling,
        delta: { ...emptyDelta(), temperamentDeltas: [{ key: "warmth", delta: 0.03 }] },
      }),
    ).toThrow(/0 ile 1/iu);
  });

  it("unlocks legacy weight pins while preserving bounded evolution", () => {
    const legacy = structuredClone(currentPersona);
    legacy.coreValues[0]!.pinned = true;
    legacy.interests[0]!.pinned = true;
    legacy.evolution.pinnedFields.push(
      `coreValues.${legacy.coreValues[0]!.key}`,
      `interests.${legacy.interests[0]!.key}`,
      "temperament.warmth",
    );
    const unlocked = unlockPersonaWeightLocks(legacy);
    expect(unlocked.coreValues.every(({ pinned }) => !pinned)).toBe(true);
    expect(unlocked.interests.every(({ pinned }) => !pinned)).toBe(true);
    expect(unlocked.evolution.pinnedFields).toEqual(["username", "identity.biography"]);

    const result = applyWeeklyPersonaEvolution({
      currentPersona: legacy,
      delta: {
        ...emptyDelta(),
        interestDeltas: [
          { key: legacy.interests[0]!.key, delta: 0.01 },
          { key: legacy.interests[1]!.key, delta: -0.01 },
        ],
        temperamentDeltas: [{ key: "warmth", delta: 0.01 }],
        coreValueDeltas: [{ key: legacy.coreValues[0]!.key, delta: 0.01 }],
      },
    });
    expect(result.persona.evolution.pinnedFields).toEqual(["username", "identity.biography"]);
    expect(result.persona.temperament.warmth).toBe(
      Number((legacy.temperament.warmth + 0.01).toFixed(12)),
    );
  });

  it("protects identity invariants while allowing legacy weight locks to be removed", () => {
    const current = structuredClone(currentPersona);
    current.evolution.pinnedFields.push("temperament.warmth");
    expect(() => assertPinnedPersonaFieldsUnchanged(current, current)).not.toThrow();
    expect(() =>
      assertPinnedPersonaFieldsUnchanged(current, {
        ...current,
        temperament: { ...current.temperament, warmth: 0.42 },
      }),
    ).not.toThrow();
    expect(() =>
      assertPinnedPersonaFieldsUnchanged(current, {
        ...current,
        evolution: {
          ...current.evolution,
          pinnedFields: current.evolution.pinnedFields.filter(
            (path) => path !== "temperament.warmth",
          ),
        },
      }),
    ).not.toThrow();
    expect(() =>
      assertPinnedPersonaFieldsUnchanged(current, {
        ...current,
        username: "baska_yazar",
      }),
    ).toThrow(/Pinned persona alanı/iu);
    expect(() =>
      assertPinnedPersonaFieldsUnchanged(current, {
        ...current,
        evolution: {
          ...current.evolution,
          pinnedFields: [...current.evolution.pinnedFields, "temperament.unknownField"],
        },
      }),
    ).toThrow(/pinned field yolu/iu);
  });

  it("runs the existing persona schema and ontology checks before returning a candidate", () => {
    expect(() =>
      applyWeeklyPersonaEvolution({
        currentPersona: { ...currentPersona, publicBio: "çok kısa" },
        delta: emptyDelta(),
      }),
    ).toThrow();
    expect(() =>
      applyWeeklyPersonaEvolution({
        currentPersona,
        delta: {
          ...emptyDelta(),
          safeSummary: "Ben pilotum ve işe giderken bu kanaate vardım.",
        },
      }),
    ).toThrow(/offline biyografi/iu);
  });
});
