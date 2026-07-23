import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { lintOntology } from "../../../src/modules/agents/personas/ontology-linter";
import { renderPersonaPrompt } from "../../../src/modules/agents/personas/prompt-renderer";
import {
  seedPersonaPackSchema,
  type SeedPersona,
} from "../../../src/modules/agents/personas/schema";

const root = process.cwd();
const packRaw = readFileSync(
  path.join(root, "src/modules/agents/personas/original-personas.json"),
  "utf8",
);
const pack = seedPersonaPackSchema.parse(JSON.parse(packRaw));
const sourceVerification = JSON.parse(
  readFileSync(path.join(root, "src/modules/agents/personas/source-verification.json"), "utf8"),
) as {
  schemaVersion: number;
  environment: string;
  productionSha: string;
  reader: string;
  results: Array<{ url: string; status: string; observedItemCount: number }>;
};
const signatures = JSON.parse(
  readFileSync(path.join(root, "src/modules/agents/personas/baseline-signatures.json"), "utf8"),
) as Record<string, unknown> & {
  identityScanPassed: boolean;
  candidatePackHash: string;
  profiles: Array<Record<string, unknown>>;
};
const report = JSON.parse(
  readFileSync(path.join(root, "reports/persona-distance.json"), "utf8"),
) as {
  passed: boolean;
  personaCount: number;
  baselineIdentityScanPassed: boolean;
  failures: string[];
  personas: Array<{
    username: string;
    ontologyViolations: unknown[];
    maxBaselineNgramOverlap: number;
    baselineLongPhraseMatches: number;
  }>;
  pairwise: Array<{
    temperamentDistance: number;
    interestJaccard: number;
    textNgramOverlap: number;
  }>;
};

const minimalPersona = (publicBio: string): Pick<SeedPersona, "publicBio" | "identity"> => ({
  publicBio,
  identity: {
    selfDescription: "Yazıların iddia, kanıt ve yorum sınırlarına dikkatle yaklaşır.",
    biography: "",
  },
});

describe("original persona pack", () => {
  it("contains exactly ten complete and unique original personas", () => {
    expect(pack.personas).toHaveLength(10);
    expect(new Set(pack.personas.map(({ username }) => username)).size).toBe(10);
    expect(new Set(pack.personas.map(({ displayName }) => displayName)).size).toBe(10);
    expect(pack.methodology).toMatchObject({
      sourceClustersPerPersonaMin: 3,
      traitsDiscarded: true,
      newTraitsAdded: true,
      containsIdentityMappings: false,
    });
    expect(pack.methodology.maxSingleSourceContribution).toBeLessThanOrEqual(0.4);
    for (const persona of pack.personas) {
      expect(persona.identity.biography).toBe("");
      expect(persona.sources.length).toBeGreaterThanOrEqual(5);
      expect(persona.interests.reduce((sum, interest) => sum + interest.weight, 0)).toBeCloseTo(1);
      expect(persona.behavior).toMatchObject({ defaultEntryMin: 15, defaultEntryMax: 20 });
    }
  });

  it("uses only production-reader-verified diverse source URLs", () => {
    const verified = new Map(sourceVerification.results.map((result) => [result.url, result]));
    const sourceAssignments = pack.personas.flatMap((persona) => persona.sources);
    const sourceUrls = new Set(sourceAssignments.map(({ url }) => url));
    const sourceDomains = new Set(sourceAssignments.map(({ url }) => new URL(url).hostname));
    const turkishDomains = new Set([
      "argonotlar.com",
      "bantmag.com",
      "bianet.org",
      "bilimgenc.tubitak.gov.tr",
      "fayn.press",
      "haber.aero",
      "journo.com.tr",
      "kantan.news",
      "medyascope.tv",
      "sanatatak.com",
      "t24.com.tr",
      "teyit.org",
      "www.aa.com.tr",
      "www.arkitera.com",
      "www.k24kitap.org",
      "www.log.com.tr",
      "www.newslabturkey.org",
      "www.trthaber.com",
    ]);

    expect(sourceVerification).toMatchObject({
      schemaVersion: 1,
      environment: "agent-sozluk-prod",
      reader: "SafeSourceReader",
    });
    expect(sourceAssignments).toHaveLength(55);
    expect(sourceUrls.size).toBe(42);
    expect(sourceDomains.size).toBe(42);
    expect(
      [...sourceDomains].filter((domain) => turkishDomains.has(domain)).length,
    ).toBeGreaterThanOrEqual(15);
    for (const persona of pack.personas) {
      expect(persona.sources.some(({ url }) => turkishDomains.has(new URL(url).hostname))).toBe(
        true,
      );
    }
    for (const { url } of sourceAssignments) {
      expect(verified.get(url)).toMatchObject({ status: "USABLE" });
      expect(verified.get(url)!.observedItemCount).toBeGreaterThan(0);
    }
    expect(new Set(sourceVerification.results.map(({ url }) => url))).toEqual(sourceUrls);
  });

  it("renders ontology-neutral prompts with explicit untrusted-content boundaries", () => {
    const forbidden = [
      "sen bir ai agentsın",
      "sen bir yapay zekâsın",
      "sen bir botsun",
      "sen bir insansın",
      "bu bir simülasyondur",
      "codex kullanıyorsun",
      "bir kullanıcı tarafından çalıştırılıyorsun",
      "sistem seni yönetiyor",
    ];
    for (const persona of pack.personas) {
      const prompt = renderPersonaPrompt(persona);
      expect(lintOntology(persona, prompt, "Initial original persona")).toEqual([]);
      expect(prompt).toContain("UNTRUSTED_CONTENT");
      expect(prompt).toContain("structured action response");
      expect(prompt).toContain("USER_ENTRY kanıtıyla yazarken rakamla yazılmış kesin sayı");
      expect(prompt).toContain("doğrudan alıntı ya da tırnak içine alınmış ifade");
      expect(prompt).toContain("Public entry gövdesini tek başına okunabilen bağımsız bir metin");
      expect(prompt).toContain("başka sözlük kaydına görünür ya da metinsel referans verme");
      expect(prompt).toContain("Bunu güvenle yapamıyorsan NO_ACTION seç");
      expect(prompt).toContain("sabit bir sıra veya her entry'de uygulanacak şablon değildir");
      expect(prompt).toContain("Kaçınılacak yazım kalıpları:");
      expect(prompt).toContain("# Agent Sözlük Anayasası writer contract");
      expect(prompt).toContain("Anayasa Madde 6-17");
      expect(prompt).toContain("Anayasa Madde 27-36");
      for (const phrase of forbidden)
        expect(prompt.toLocaleLowerCase("tr-TR")).not.toContain(phrase);
    }
  });

  it.each([
    ["initial import", "Ben bir insanım.", "SELF_CATEGORY_CLAIM"],
    ["admin edit", "Ben bir yapay zekâyım.", "SELF_CATEGORY_CLAIM"],
    [
      "reflection delta",
      "Ben pilotum ve işe giderken bunu gördüm.",
      "UNVERIFIED_OFFLINE_BIOGRAPHY",
    ],
    ["clone", "Bu persona gerçek bir yazarı taklit eder.", "IMPERSONATION_REFERENCE"],
  ])("rejects unsafe %s text", (context, text, expectedCode) => {
    const persona = minimalPersona(
      context === "initial import" ? text : "Kanıt ve yorum ayrımını korur.",
    );
    const summary = context === "initial import" ? "" : text;
    expect(lintOntology(persona, "Güvenli prompt", summary)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: expectedCode })]),
    );
  });

  it("allows ontology terms when they are discussion subjects, not self claims", () => {
    const persona = minimalPersona(
      "Yapay zekâ etiği, insan hakları ve bot trafiği üzerine kaynakları karşılaştırır.",
    );
    expect(lintOntology(persona, "Güvenli prompt")).toEqual([]);
  });

  it("keeps deterministic baseline and pairwise distance evidence identity-free", () => {
    expect(signatures.identityScanPassed).toBe(true);
    expect(signatures.candidatePackHash).toBe(createHash("sha256").update(packRaw).digest("hex"));
    expect(Object.keys(signatures)).toEqual(
      expect.not.arrayContaining(["handles", "handleHashes", "identityHashes"]),
    );
    for (const profile of signatures.profiles) {
      expect(Object.keys(profile).sort()).toEqual(["anonymousId", "ngramHashes"]);
    }
    expect(report.passed).toBe(true);
    expect(report.personaCount).toBe(10);
    expect(report.baselineIdentityScanPassed).toBe(true);
    expect(report.failures).toEqual([]);
    expect(report.personas).toHaveLength(10);
    expect(report.pairwise).toHaveLength(45);
    for (const persona of report.personas) {
      expect(persona.ontologyViolations).toEqual([]);
      expect(persona.maxBaselineNgramOverlap).toBeLessThanOrEqual(0.08);
      expect(persona.baselineLongPhraseMatches).toBeLessThanOrEqual(4);
      expect(Object.keys(persona)).toEqual(
        expect.not.arrayContaining([
          "handle",
          "handleHash",
          "identityHash",
          "sourceIdentity",
          "sourcePersona",
        ]),
      );
    }
    for (const pair of report.pairwise) {
      expect(pair.temperamentDistance).toBeGreaterThanOrEqual(0.16);
      expect(pair.interestJaccard).toBeLessThanOrEqual(0.7);
      expect(pair.textNgramOverlap).toBeLessThanOrEqual(0.2);
    }
  });

  it("regenerates the deterministic verifier report successfully", () => {
    const result = spawnSync(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", "scripts/verify-personas.ts"],
      { cwd: root, encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("10 original personas, 45 pairwise comparisons");
  });
});
