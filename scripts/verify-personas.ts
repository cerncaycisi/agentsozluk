import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { lintOntology } from "../src/modules/agents/personas/ontology-linter";
import { renderPersonaPrompt } from "../src/modules/agents/personas/prompt-renderer";
import {
  seedPersonaPackSchema,
  temperamentKeys,
  type SeedPersona,
} from "../src/modules/agents/personas/schema";

interface BaselineSignatures {
  version: number;
  ngramSize: number;
  profileCount: number;
  profiles: Array<{ anonymousId: string; ngramHashes: string[] }>;
  identityScanPassed: true;
  candidatePackHash: string;
}

const root = process.cwd();
const packPath = path.join(root, "src/modules/agents/personas/original-personas.json");
const signaturesPath = path.join(root, "src/modules/agents/personas/baseline-signatures.json");
const reportPath = path.join(root, "reports/persona-distance.json");

const normalize = (value: string): string[] =>
  value
    .normalize("NFKD")
    .replace(/\p{Mark}+/gu, "")
    .toLocaleLowerCase("tr-TR")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim()
    .split(/\s+/gu)
    .filter(Boolean);

const hash = (value: string, length = 16): string =>
  createHash("sha256").update(value).digest("hex").slice(0, length);

const flattenStrings = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flattenStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(flattenStrings);
  return [];
};

const ngrams = (tokens: string[], size: number): string[] => {
  const values: string[] = [];
  for (let index = 0; index <= tokens.length - size; index += 1) {
    values.push(tokens.slice(index, index + size).join(" "));
  }
  return values;
};

const overlapRatio = (left: Set<string>, right: Set<string>): number => {
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  for (const value of left) if (right.has(value)) overlap += 1;
  return overlap / Math.min(left.size, right.size);
};

const temperamentDistance = (left: SeedPersona, right: SeedPersona): number => {
  const squared = temperamentKeys.reduce((sum, key) => {
    const difference = left.temperament[key] - right.temperament[key];
    return sum + difference * difference;
  }, 0);
  return Math.sqrt(squared / temperamentKeys.length);
};

const interestJaccard = (left: SeedPersona, right: SeedPersona): number => {
  const leftKeys = new Set(left.interests.map(({ key }) => key));
  const rightKeys = new Set(right.interests.map(({ key }) => key));
  const union = new Set([...leftKeys, ...rightKeys]);
  const intersection = [...leftKeys].filter((key) => rightKeys.has(key));
  return union.size === 0 ? 0 : intersection.length / union.size;
};

const packRaw = readFileSync(packPath, "utf8");
const pack = seedPersonaPackSchema.parse(JSON.parse(packRaw));
const signatures = JSON.parse(readFileSync(signaturesPath, "utf8")) as BaselineSignatures;
if (signatures.profileCount !== 10 || signatures.profiles.length !== 10) {
  throw new Error("Anonymous baseline signature set must contain exactly 10 profiles.");
}
if (!signatures.identityScanPassed || signatures.candidatePackHash !== hash(packRaw, 64)) {
  throw new Error(
    "Persona pack changed after the local baseline identity scan; rebuild anonymous signatures.",
  );
}

const usernames = pack.personas.map(({ username }) => username);
const displayNames = pack.personas.map(({ displayName }) => displayName);
if (new Set(usernames).size !== 10 || new Set(displayNames).size !== 10) {
  throw new Error("Persona usernames and display names must be unique.");
}

const baselineProfiles = signatures.profiles.map((profile) => ({
  anonymousId: profile.anonymousId,
  hashes: new Set(profile.ngramHashes),
}));

const personaResults = pack.personas.map((persona) => {
  const renderedPrompt = renderPersonaPrompt(persona);
  const ontologyViolations = lintOntology(persona, renderedPrompt, "Initial original persona");
  const tokens = normalize(flattenStrings(persona).join(" "));
  const candidateHashes = new Set(ngrams(tokens, signatures.ngramSize).map((value) => hash(value)));
  const profileOverlaps = baselineProfiles.map(({ anonymousId, hashes }) => ({
    anonymousId,
    ratio: overlapRatio(candidateHashes, hashes),
    matches: [...candidateHashes].filter((value) => hashes.has(value)).length,
  }));
  const maxProfileOverlap = profileOverlaps.reduce(
    (maximum, current) => (current.ratio > maximum.ratio ? current : maximum),
    { anonymousId: "none", ratio: 0, matches: 0 },
  );
  return {
    username: persona.username,
    ontologyViolations,
    maxBaselineNgramOverlap: Number(maxProfileOverlap.ratio.toFixed(4)),
    baselineLongPhraseMatches: maxProfileOverlap.matches,
    renderedPromptHash: hash(renderedPrompt, 64),
  };
});

const pairwise = [];
for (let leftIndex = 0; leftIndex < pack.personas.length; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < pack.personas.length; rightIndex += 1) {
    const left = pack.personas[leftIndex]!;
    const right = pack.personas[rightIndex]!;
    const leftText = new Set(ngrams(normalize(flattenStrings(left).join(" ")), 5));
    const rightText = new Set(ngrams(normalize(flattenStrings(right).join(" ")), 5));
    pairwise.push({
      left: left.username,
      right: right.username,
      temperamentDistance: Number(temperamentDistance(left, right).toFixed(4)),
      interestJaccard: Number(interestJaccard(left, right).toFixed(4)),
      textNgramOverlap: Number(overlapRatio(leftText, rightText).toFixed(4)),
    });
  }
}

const failures = [
  ...personaResults.flatMap((result) =>
    result.ontologyViolations.map((violation) => `${result.username}:${violation.code}`),
  ),
  ...personaResults
    .filter(({ maxBaselineNgramOverlap }) => maxBaselineNgramOverlap > 0.08)
    .map(({ username }) => `${username}:BASELINE_NGRAM_OVERLAP`),
  ...personaResults
    .filter(({ baselineLongPhraseMatches }) => baselineLongPhraseMatches > 4)
    .map(({ username }) => `${username}:BASELINE_LONG_PHRASE`),
  ...pairwise
    .filter(({ temperamentDistance }) => temperamentDistance < 0.16)
    .map(({ left, right }) => `${left}/${right}:TEMPERAMENT_DISTANCE`),
  ...pairwise
    .filter(({ interestJaccard }) => interestJaccard > 0.7)
    .map(({ left, right }) => `${left}/${right}:INTEREST_OVERLAP`),
  ...pairwise
    .filter(({ textNgramOverlap }) => textNgramOverlap > 0.2)
    .map(({ left, right }) => `${left}/${right}:TEXT_OVERLAP`),
];

const report = {
  version: 1,
  generatedAt: "2026-07-17",
  personaCount: pack.personas.length,
  methodology: pack.methodology,
  baselineIdentityScanPassed: signatures.identityScanPassed,
  thresholds: {
    maxBaselineNgramOverlap: 0.08,
    maxBaselineLongPhraseMatches: 4,
    minPairwiseTemperamentDistance: 0.16,
    maxPairwiseInterestJaccard: 0.7,
    maxPairwiseTextNgramOverlap: 0.2,
  },
  personas: personaResults,
  pairwise,
  failures,
  passed: failures.length === 0,
};

mkdirSync(path.dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length > 0) throw new Error(`Persona verification failed: ${failures.join(", ")}`);
process.stdout.write(
  `Persona verification passed: ${pack.personas.length} original personas, ${pairwise.length} pairwise comparisons.\n`,
);
