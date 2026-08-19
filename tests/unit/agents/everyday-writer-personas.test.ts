import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validatePersonaCandidate } from "@/modules/agents/domain/persona-validation";
import {
  everydayWriterArchetypes,
  everydayWriterPersonaPack,
  everydayWriterPersonas,
} from "@/modules/agents/personas/everyday-writer-personas";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import { renderPersonaPrompt } from "@/modules/agents/personas/prompt-renderer";
import {
  agentPersonaTemplates,
  findAgentPersonaTemplate,
} from "@/modules/agents/personas/templates";
import type { SeedPersona } from "@/modules/agents/personas/schema";

const root = process.cwd();
const sourceVerification = JSON.parse(
  readFileSync(path.join(root, "src/modules/agents/personas/source-verification.json"), "utf8"),
) as {
  results: Array<{ url: string; status: string; observedItemCount: number }>;
};

describe("everyday dictionary writer cohort", () => {
  it("contains six distinct non-biographical dictionary archetypes", () => {
    expect(everydayWriterPersonas).toHaveLength(6);
    expect(new Set(everydayWriterPersonas.map(({ username }) => username)).size).toBe(6);
    expect(everydayWriterArchetypes.map(({ username }) => username)).toEqual(
      everydayWriterPersonas.map(({ username }) => username),
    );
    expect(new Set(everydayWriterArchetypes.map(({ archetype }) => archetype)).size).toBe(6);
    expect(everydayWriterPersonaPack.methodology).toMatchObject({
      containsIdentityMappings: false,
      biographiesAreEmpty: true,
      sourcesComeFromVerifiedCanonicalPool: true,
      behavioralTargetsAreTendenciesNotQuotas: true,
    });
    expect(everydayWriterPersonas.map(({ writing }) => writing.entryLength).sort()).toEqual([
      "MEDIUM",
      "MIXED",
      "MIXED",
      "SHORT",
      "SHORT",
      "SHORT",
    ]);
    for (const persona of everydayWriterPersonas) {
      expect(persona.identity.biography).toBe("");
      expect(persona.publicBio.length).toBeLessThanOrEqual(180);
      expect(persona.publicBio).toMatch(
        /\b(?:ararım|dolaşırım|ilgimi çeker|merak ederim|severim|yazarım)\b/iu,
      );
      expect(persona.writing.structure.join(" ")).not.toMatch(
        /\b(?:argüman|giriş|kapanış|sonuç|tez)\b/iu,
      );
      expect(persona.writing.avoidPatterns.length).toBeGreaterThanOrEqual(3);
      expect(new Set(persona.writing.avoidPatterns).size).toBe(
        persona.writing.avoidPatterns.length,
      );
      expect(persona.behavior.topicCreationTendency).toBeGreaterThanOrEqual(0.4);
      expect(persona.behavior.topicCreationTendency).toBeLessThanOrEqual(0.7);
    }
  });

  it("uses twelve production-reader-verified sources per writer with diverse origins and topics", () => {
    const verified = new Map(sourceVerification.results.map((result) => [result.url, result]));
    for (const persona of everydayWriterPersonas) {
      expect(persona.sources).toHaveLength(12);
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

  it("passes ontology, baseline and sequential pairwise validation against original writers", () => {
    const existing: unknown[] = [...originalPersonaPack.personas];
    for (const persona of everydayWriterPersonas) {
      const validated = validatePersonaCandidate(
        persona,
        existing,
        "Add reviewed everyday dictionary writer template.",
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

  it("does not treat a shared reviewed source pack as a cloned personality", () => {
    const candidate = everydayWriterPersonas.find(({ username }) => username === "bkzgezgini")!;
    const sourceCarrier = structuredClone(originalPersonaPack.personas[0]!) as SeedPersona;
    sourceCarrier.sources = structuredClone(candidate.sources);
    sourceCarrier.sourceTopicMappings = structuredClone(candidate.sourceTopicMappings);

    const validated = validatePersonaCandidate(
      candidate,
      [sourceCarrier],
      "Verify that shared reviewed sources do not define persona distance.",
    );

    expect(validated.report).toMatchObject({
      ontologyPassed: true,
      baselineDistancePassed: true,
      pairwiseDistancePassed: true,
    });
    expect(validated.report.maximumTextNgramOverlap).toBeLessThanOrEqual(0.2);
  });

  it("keeps the dictionary-link navigator comfortably above the pairwise temperament gate", () => {
    const candidate = everydayWriterPersonas.find(({ username }) => username === "bkzgezgini")!;
    const existing = [
      ...originalPersonaPack.personas,
      ...everydayWriterPersonas.filter(({ username }) => username !== candidate.username),
    ];

    const validated = validatePersonaCandidate(
      candidate,
      existing,
      "Preserve managed-onboarding distance margin.",
    );

    expect(validated.report.minimumTemperamentDistance).toBeGreaterThanOrEqual(0.2);
  });

  it("exposes the cohort through the same validated template contract used by UI and creation", () => {
    expect(agentPersonaTemplates).toHaveLength(22);
    expect(new Set(agentPersonaTemplates.map(({ username }) => username)).size).toBe(22);
    for (const persona of everydayWriterPersonas) {
      expect(findAgentPersonaTemplate(persona.username)).toBe(persona);
    }
    expect(findAgentPersonaTemplate("missing-template")).toBeUndefined();

    const page = readFileSync(path.join(root, "src/app/moderasyon/agentlar/yeni/page.tsx"), "utf8");
    const controlPlane = readFileSync(
      path.join(root, "src/modules/agents/application/control-plane.ts"),
      "utf8",
    );
    expect(page).toContain("templates={[...agentPersonaTemplates]}");
    expect(controlPlane).toContain("findAgentPersonaTemplate(templateUsername)");
  });
});
