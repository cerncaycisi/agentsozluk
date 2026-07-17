import { createHash } from "node:crypto";
import { AppError } from "@/lib/http/errors";
import signaturesJson from "@/modules/agents/personas/baseline-signatures.json";
import { lintOntology } from "@/modules/agents/personas/ontology-linter";
import { renderPersonaPrompt } from "@/modules/agents/personas/prompt-renderer";
import {
  seedPersonaSchema,
  temperamentKeys,
  type SeedPersona,
} from "@/modules/agents/personas/schema";

interface BaselineSignatures {
  ngramSize: number;
  profiles: Array<{ anonymousId: string; ngramHashes: string[] }>;
}

const signatures = signaturesJson as BaselineSignatures;

const normalize = (value: string): string[] =>
  value
    .normalize("NFKD")
    .replace(/\p{Mark}+/gu, "")
    .toLocaleLowerCase("tr-TR")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim()
    .split(/\s+/gu)
    .filter(Boolean);

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

const hash = (value: string): string =>
  createHash("sha256").update(value).digest("hex").slice(0, 16);

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

export interface PersonaValidationReport {
  [key: string]: string | number | boolean | null;
  ontologyPassed: true;
  baselineDistancePassed: true;
  pairwiseDistancePassed: true;
  maxBaselineNgramOverlap: number;
  maxBaselineLongPhraseMatches: number;
  minimumTemperamentDistance: number | null;
  maximumInterestJaccard: number | null;
  maximumTextNgramOverlap: number | null;
  comparedPersonaCount: number;
}

export function validatePersonaCandidate(
  candidateInput: unknown,
  existingInputs: unknown[],
  changeSummary: string,
): { persona: SeedPersona; renderedPrompt: string; report: PersonaValidationReport } {
  const persona = seedPersonaSchema.parse(candidateInput);
  const renderedPrompt = renderPersonaPrompt(persona);
  const ontologyViolations = lintOntology(persona, renderedPrompt, changeSummary);
  if (ontologyViolations.length > 0) {
    throw new AppError(
      "PERSONA_ONTOLOGY_REJECTED",
      422,
      ontologyViolations[0]!.safeReason,
      undefined,
      undefined,
      {
        violations: ontologyViolations.map(({ code, field, safeReason }) => ({
          code,
          field,
          safeReason,
        })),
      },
    );
  }

  const candidateTokens = normalize(flattenStrings(persona).join(" "));
  const candidateHashes = new Set(
    ngrams(candidateTokens, signatures.ngramSize).map((value) => hash(value)),
  );
  let maxBaselineNgramOverlap = 0;
  let maxBaselineLongPhraseMatches = 0;
  for (const profile of signatures.profiles) {
    const baselineHashes = new Set(profile.ngramHashes);
    const matches = [...candidateHashes].filter((value) => baselineHashes.has(value)).length;
    maxBaselineNgramOverlap = Math.max(
      maxBaselineNgramOverlap,
      overlapRatio(candidateHashes, baselineHashes),
    );
    maxBaselineLongPhraseMatches = Math.max(maxBaselineLongPhraseMatches, matches);
  }
  if (maxBaselineNgramOverlap > 0.08 || maxBaselineLongPhraseMatches > 4) {
    throw new AppError(
      "PERSONA_BASELINE_DISTANCE_REJECTED",
      422,
      "Persona geçici tasarım girdisine gereğinden fazla benziyor.",
    );
  }

  const existingPersonas = existingInputs.map((value) => seedPersonaSchema.parse(value));
  const distances = existingPersonas.map((existing) => {
    const leftText = new Set(ngrams(candidateTokens, 5));
    const rightText = new Set(ngrams(normalize(flattenStrings(existing).join(" ")), 5));
    return {
      temperament: temperamentDistance(persona, existing),
      interests: interestJaccard(persona, existing),
      text: overlapRatio(leftText, rightText),
    };
  });
  const minimumTemperamentDistance =
    distances.length > 0 ? Math.min(...distances.map(({ temperament }) => temperament)) : null;
  const maximumInterestJaccard =
    distances.length > 0 ? Math.max(...distances.map(({ interests }) => interests)) : null;
  const maximumTextNgramOverlap =
    distances.length > 0 ? Math.max(...distances.map(({ text }) => text)) : null;
  if (
    (minimumTemperamentDistance !== null && minimumTemperamentDistance < 0.16) ||
    (maximumInterestJaccard !== null && maximumInterestJaccard > 0.7) ||
    (maximumTextNgramOverlap !== null && maximumTextNgramOverlap > 0.2)
  ) {
    throw new AppError(
      "PERSONA_PAIRWISE_DISTANCE_REJECTED",
      422,
      "Persona mevcut bir agent personasına gereğinden fazla benziyor.",
    );
  }

  return {
    persona,
    renderedPrompt,
    report: {
      ontologyPassed: true,
      baselineDistancePassed: true,
      pairwiseDistancePassed: true,
      maxBaselineNgramOverlap: Number(maxBaselineNgramOverlap.toFixed(4)),
      maxBaselineLongPhraseMatches,
      minimumTemperamentDistance:
        minimumTemperamentDistance === null ? null : Number(minimumTemperamentDistance.toFixed(4)),
      maximumInterestJaccard:
        maximumInterestJaccard === null ? null : Number(maximumInterestJaccard.toFixed(4)),
      maximumTextNgramOverlap:
        maximumTextNgramOverlap === null ? null : Number(maximumTextNgramOverlap.toFixed(4)),
      comparedPersonaCount: existingPersonas.length,
    },
  };
}
