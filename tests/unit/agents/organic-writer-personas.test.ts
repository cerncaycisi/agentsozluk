import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validatePersonaCandidate } from "@/modules/agents/domain/persona-validation";
import { everydayWriterPersonas } from "@/modules/agents/personas/everyday-writer-personas";
import {
  organicWriterArchetypes,
  organicWriterPersonaPack,
  organicWriterPersonas,
} from "@/modules/agents/personas/organic-writer-personas";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import { renderPersonaPrompt } from "@/modules/agents/personas/prompt-renderer";
import {
  agentPersonaTemplates,
  findAgentPersonaTemplate,
} from "@/modules/agents/personas/templates";

const root = process.cwd();
const sourceVerification = JSON.parse(
  readFileSync(path.join(root, "src/modules/agents/personas/source-verification.json"), "utf8"),
) as {
  results: Array<{ url: string; status: string; observedItemCount: number }>;
};

describe("W4 organic writer cohort", () => {
  it("adds fourteen varied dictionary identities without public role labels or biographies", () => {
    expect(organicWriterPersonas).toHaveLength(14);
    expect(new Set(organicWriterPersonas.map(({ username }) => username)).size).toBe(14);
    expect(organicWriterArchetypes.map(({ username }) => username)).toEqual(
      organicWriterPersonas.map(({ username }) => username),
    );
    expect(new Set(organicWriterArchetypes.map(({ archetype }) => archetype)).size).toBe(14);
    expect(organicWriterPersonaPack.methodology).toMatchObject({
      containsIdentityMappings: false,
      biographiesAreEmpty: true,
      sourcesComeFromVerifiedCanonicalPool: true,
      behavioralTargetsAreTendenciesNotQuotas: true,
      publicIdentitiesFollowDictionaryBenchmark: true,
    });
    expect(organicWriterPersonas.map(({ writing }) => writing.entryLength).sort()).toEqual([
      "MEDIUM",
      "MEDIUM",
      "MEDIUM",
      "MEDIUM",
      "MEDIUM",
      "MEDIUM",
      "MIXED",
      "MIXED",
      "MIXED",
      "MIXED",
      "SHORT",
      "SHORT",
      "SHORT",
      "SHORT",
    ]);
    for (const persona of organicWriterPersonas) {
      expect(persona.identity.biography).toBe("");
      expect(persona.displayName).toBe(persona.displayName.toLocaleLowerCase("tr-TR"));
      expect(persona.displayName).not.toMatch(
        /(?:uzman|gözlemci|teknolog|eleştirmen|araştırmacı|yazar)/iu,
      );
      expect(persona.publicBio.length).toBeLessThanOrEqual(80);
      expect(persona.publicBio).not.toMatch(/(?:ilgileniyorum|paylaşıyorum|içerik üretiyorum)/iu);
      expect(persona.writing.avoidPatterns.length).toBeGreaterThanOrEqual(3);
      expect(new Set(persona.writing.avoidPatterns).size).toBe(
        persona.writing.avoidPatterns.length,
      );
      expect(persona.behavior.topicCreationTendency).toBeGreaterThanOrEqual(0.4);
      expect(persona.behavior.topicCreationTendency).toBeLessThanOrEqual(0.7);
    }
  });

  it("uses ten verified sources per writer across at least eight origins and five topics", () => {
    const verified = new Map(sourceVerification.results.map((result) => [result.url, result]));
    for (const persona of organicWriterPersonas) {
      expect(persona.sources).toHaveLength(10);
      expect(
        new Set(persona.sources.map(({ url }) => new URL(url).origin)).size,
      ).toBeGreaterThanOrEqual(8);
      expect(new Set(persona.sources.flatMap(({ topics }) => topics)).size).toBeGreaterThanOrEqual(
        5,
      );
      for (const source of persona.sources) {
        expect(verified.get(source.url)).toMatchObject({ status: "USABLE" });
        expect(verified.get(source.url)!.observedItemCount).toBeGreaterThan(0);
      }
    }
  });

  it("passes ontology, baseline and sequential pairwise validation against all existing templates", () => {
    const existing: unknown[] = [...originalPersonaPack.personas, ...everydayWriterPersonas];
    for (const persona of organicWriterPersonas) {
      const validated = validatePersonaCandidate(
        persona,
        existing,
        "W4: add one reviewed grounded dictionary writer.",
      );
      expect(validated.report).toMatchObject({
        ontologyPassed: true,
        baselineDistancePassed: true,
        pairwiseDistancePassed: true,
      });
      expect(validated.report.minimumTemperamentDistance).toBeGreaterThanOrEqual(0.16);
      expect(validated.report.maximumTextNgramOverlap).toBeLessThanOrEqual(0.2);
      expect(renderPersonaPrompt(persona)).toContain(
        "tek cümlelik kısa bir tanım, örnek, gözlem, yorum veya bkz tamamen normaldir",
      );
      existing.push(persona);
    }
  });

  it("exposes every W4 persona through the managed creation registry", () => {
    expect(agentPersonaTemplates).toHaveLength(30);
    expect(new Set(agentPersonaTemplates.map(({ username }) => username)).size).toBe(30);
    for (const persona of organicWriterPersonas) {
      expect(findAgentPersonaTemplate(persona.username)).toBe(persona);
    }
  });
});
