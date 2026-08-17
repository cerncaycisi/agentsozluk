import { describe, expect, it } from "vitest";
import { validatePersonaCandidate } from "@/modules/agents/domain/persona-validation";
import { agentPersonaTemplates } from "@/modules/agents/personas/templates";
import {
  applyWriterNaturalizationW2Batch1Target,
  findWriterNaturalizationW2Batch1Target,
  writerNaturalizationW2Batch1Targets,
} from "@/modules/agents/personas/writer-naturalization-w2-batch1";

const expectedUsernames = [
  "akisnobeti",
  "apartmanfilozofu",
  "barsinegi",
  "bkzgezgini",
  "dengeharitasi",
];

describe("W2 ilk yazar doğallaştırma paketi", () => {
  it("beş sabit yazarı tekil ve gözden geçirilebilir bir sırada tutar", () => {
    expect(writerNaturalizationW2Batch1Targets.map(({ username }) => username)).toEqual(
      expectedUsernames,
    );
    expect(
      new Set(writerNaturalizationW2Batch1Targets.map(({ publicNick }) => publicNick)).size,
    ).toBe(5);
    for (const username of expectedUsernames) {
      expect(findWriterNaturalizationW2Batch1Target(username)?.username).toBe(username);
    }
    expect(findWriterNaturalizationW2Batch1Target("olmayan-yazar")).toBeUndefined();
  });

  it("tek numara yerine kesişen ilgiler ve farklı yazım eğilimleri verir", () => {
    const entryLengths = new Set(
      writerNaturalizationW2Batch1Targets.map(({ fields }) => fields.writing.entryLength),
    );
    expect(entryLengths).toEqual(new Set(["SHORT", "MEDIUM", "MIXED"]));

    const interestOwners = new Map<string, Set<string>>();
    for (const target of writerNaturalizationW2Batch1Targets) {
      const totalWeight = target.fields.interests.reduce(
        (sum, interest) => sum + interest.weight,
        0,
      );
      expect(totalWeight).toBeCloseTo(1, 8);
      expect(Math.max(...target.fields.interests.map(({ weight }) => weight))).toBeLessThanOrEqual(
        0.22,
      );
      expect(target.fields.interests).toHaveLength(6);
      expect(target.fields.writing.preferredMaxWords).toBeGreaterThan(
        target.fields.writing.preferredMinWords,
      );
      for (const interest of target.fields.interests) {
        const owners = interestOwners.get(interest.key) ?? new Set<string>();
        owners.add(target.username);
        interestOwners.set(interest.key, owners);
      }
      for (const value of Object.values(target.fields.temperament)) {
        expect(value).toBeGreaterThanOrEqual(0.12);
        expect(value).toBeLessThanOrEqual(0.88);
      }
    }

    expect(interestOwners.get("şehir hayatı")?.size).toBe(5);
    expect(interestOwners.get("müzik")?.size).toBe(3);
    expect(interestOwners.get("gündelik teknoloji")?.size).toBe(2);
    expect(interestOwners.get("film ve diziler")?.size).toBe(3);
  });

  it("repoda bulunan üç mevcut personaya şema ve çeşitlilik kurallarını bozmadan uygulanır", () => {
    const sourceBackedTargets = writerNaturalizationW2Batch1Targets.filter((target) =>
      ["akisnobeti", "bkzgezgini", "dengeharitasi"].includes(target.username),
    );

    for (const target of sourceBackedTargets) {
      const current = agentPersonaTemplates.find(({ username }) => username === target.username)!;
      const candidate = applyWriterNaturalizationW2Batch1Target(current, target);

      expect(candidate).toMatchObject({
        username: current.username,
        displayName: current.displayName,
        publicBio: current.publicBio,
        sources: current.sources,
        sourceTopicMappings: current.sourceTopicMappings,
        evolution: current.evolution,
      });
      const existing = agentPersonaTemplates.filter(({ username }) => username !== target.username);
      expect(
        validatePersonaCandidate(candidate, existing, target.changeSummary).report,
      ).toMatchObject({
        ontologyPassed: true,
        baselineDistancePassed: true,
        pairwiseDistancePassed: true,
      });
    }
  });

  it("yanlış kullanıcıya yama uygulanmasını reddeder", () => {
    const current = agentPersonaTemplates.find(({ username }) => username === "akisnobeti")!;
    const wrongTarget = findWriterNaturalizationW2Batch1Target("dengeharitasi")!;
    expect(() => applyWriterNaturalizationW2Batch1Target(current, wrongTarget)).toThrow(
      "WRITER_W2_USERNAME_MISMATCH",
    );
  });
});
