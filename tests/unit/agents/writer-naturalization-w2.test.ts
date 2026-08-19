import { describe, expect, it } from "vitest";
import { validatePersonaCandidate } from "@/modules/agents/domain/persona-validation";
import { agentPersonaTemplates } from "@/modules/agents/personas/templates";
import {
  applyWriterNaturalizationW2Target,
  findWriterNaturalizationW2Target,
  writerNaturalizationW2Targets,
} from "@/modules/agents/personas/writer-naturalization-w2";
import writerNaturalizationW1 from "@/modules/agents/personas/writer-naturalization-w1.json";

const expectedUsernames = [
  "akisnobeti",
  "apartmanfilozofu",
  "barsinegi",
  "bkzgezgini",
  "dengeharitasi",
  "ekrankenari",
  "gundeliknot",
  "iztakvimi",
  "kadrajatesi",
  "katmanizci",
  "kisasoz",
  "kurusfarki",
  "mesafedefteri",
  "nasilolur",
  "olcekpayi",
  "oyunbozanestetik",
  "pembepanik",
  "perdepaylari",
  "rotakiriklari",
  "vesikameraki",
  "yanbakis",
  "yarinmesaisi",
];

describe("W2 yazar doğallaştırma paketi", () => {
  it("22 sabit yazarı tekil ve gözden geçirilebilir bir sırada tutar", () => {
    expect(writerNaturalizationW2Targets.map(({ username }) => username)).toEqual(
      expectedUsernames,
    );
    expect(new Set(writerNaturalizationW2Targets.map(({ publicNick }) => publicNick)).size).toBe(
      22,
    );
    expect(
      writerNaturalizationW2Targets.map(({ username, publicNick }) => ({ username, publicNick })),
    ).toEqual(
      writerNaturalizationW1.profiles.map(({ username, displayName }) => ({
        username,
        publicNick: displayName,
      })),
    );
    for (const username of expectedUsernames) {
      expect(findWriterNaturalizationW2Target(username)?.username).toBe(username);
    }
    expect(findWriterNaturalizationW2Target("olmayan-yazar")).toBeUndefined();
  });

  it("tek numara yerine kesişen ilgiler ve farklı yazım eğilimleri verir", () => {
    const entryLengths = new Set(
      writerNaturalizationW2Targets.map(({ fields }) => fields.writing.entryLength),
    );
    expect(entryLengths).toEqual(new Set(["SHORT", "MEDIUM", "MIXED"]));

    const interestOwners = new Map<string, Set<string>>();
    for (const target of writerNaturalizationW2Targets) {
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

    expect(interestOwners.get("şehir hayatı")?.size).toBeGreaterThanOrEqual(16);
    expect(interestOwners.get("müzik")?.size).toBeGreaterThanOrEqual(10);
    expect(interestOwners.get("gündelik teknoloji")?.size).toBeGreaterThanOrEqual(6);
    expect(interestOwners.get("film ve diziler")?.size).toBeGreaterThanOrEqual(7);
  });

  it("repoda bulunan 16 mevcut personaya şema ve çeşitlilik kurallarını bozmadan sırayla uygulanır", () => {
    const historicalTemplateUsernames = new Set<string>(
      writerNaturalizationW2Targets
        .map(({ username }) => username)
        .filter((username) =>
          agentPersonaTemplates.some((persona) => persona.username === username),
        ),
    );
    const universe = new Map(
      agentPersonaTemplates
        .filter((persona) => historicalTemplateUsernames.has(persona.username))
        .map((persona) => [persona.username, persona]),
    );
    let validatedCount = 0;
    for (const target of writerNaturalizationW2Targets) {
      const current = universe.get(target.username);
      if (!current) continue;
      const candidate = applyWriterNaturalizationW2Target(current, target);

      expect(candidate).toMatchObject({
        username: current.username,
        displayName: current.displayName,
        publicBio: current.publicBio,
        sources: current.sources,
        sourceTopicMappings: current.sourceTopicMappings,
        evolution: current.evolution,
        behavior: current.behavior,
      });
      const existing = [...universe.entries()]
        .filter(([username]) => username !== target.username)
        .map(([, persona]) => persona);
      expect(
        validatePersonaCandidate(candidate, existing, target.changeSummary).report,
      ).toMatchObject({
        ontologyPassed: true,
        baselineDistancePassed: true,
        pairwiseDistancePassed: true,
      });
      universe.set(target.username, candidate);
      validatedCount += 1;
    }
    expect(validatedCount).toBe(16);
  });

  it("yanlış kullanıcıya yama uygulanmasını reddeder", () => {
    const current = agentPersonaTemplates.find(({ username }) => username === "akisnobeti")!;
    const wrongTarget = findWriterNaturalizationW2Target("dengeharitasi")!;
    expect(() => applyWriterNaturalizationW2Target(current, wrongTarget)).toThrow(
      "WRITER_W2_USERNAME_MISMATCH",
    );
  });
});
