import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { AppError } from "@/lib/http/errors";
import {
  validatePersonaCandidate,
  type PersonaValidationReport,
} from "@/modules/agents/domain/persona-validation";
import {
  seedPersonaSchema,
  temperamentKeys,
  type SeedPersona,
} from "@/modules/agents/personas/schema";

export const WEEKLY_PERSONA_EVOLUTION_BOUNDS = {
  interest: 0.08,
  sourceTrust: 0.1,
  relationshipTrust: 0.1,
  beliefConfidence: 0.15,
  temperament: 0.03,
  coreValue: 0.02,
} as const;

const boundedDelta = (bound: number) => z.number().finite().min(-bound).max(bound);

const interestDeltaSchema = z
  .object({
    key: z.string().trim().min(2).max(100),
    delta: boundedDelta(WEEKLY_PERSONA_EVOLUTION_BOUNDS.interest),
  })
  .strict();

const sourceTrustDeltaSchema = z
  .object({
    sourceId: z.string().uuid(),
    delta: boundedDelta(WEEKLY_PERSONA_EVOLUTION_BOUNDS.sourceTrust),
  })
  .strict();

const relationshipTrustDeltaSchema = z
  .object({
    targetUserId: z.string().uuid(),
    delta: boundedDelta(WEEKLY_PERSONA_EVOLUTION_BOUNDS.relationshipTrust),
  })
  .strict();

const beliefConfidenceDeltaSchema = z
  .object({
    topicKey: z.string().trim().min(1).max(200),
    delta: boundedDelta(WEEKLY_PERSONA_EVOLUTION_BOUNDS.beliefConfidence),
  })
  .strict();

type TemperamentKey = (typeof temperamentKeys)[number];

const temperamentKeySchema = z.enum(temperamentKeys as [TemperamentKey, ...TemperamentKey[]]);

const temperamentDeltaSchema = z
  .object({
    key: temperamentKeySchema,
    delta: boundedDelta(WEEKLY_PERSONA_EVOLUTION_BOUNDS.temperament),
  })
  .strict();

const coreValueDeltaSchema = z
  .object({
    key: z.string().trim().min(2).max(100),
    delta: boundedDelta(WEEKLY_PERSONA_EVOLUTION_BOUNDS.coreValue),
  })
  .strict();

function addDuplicateIssue(values: string[], path: string, context: z.RefinementCtx): void {
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    if (seen.has(value)) {
      context.addIssue({
        code: "custom",
        path: [path, index],
        message: "Aynı weekly delta hedefi yalnız bir kez değiştirilebilir.",
      });
    }
    seen.add(value);
  }
}

export const weeklyPersonaEvolutionDeltaSchema = z
  .object({
    safeSummary: z.string().trim().min(10).max(1000),
    interestDeltas: z.array(interestDeltaSchema).max(12),
    sourceTrustDeltas: z.array(sourceTrustDeltaSchema).max(20),
    relationshipTrustDeltas: z.array(relationshipTrustDeltaSchema).max(20),
    beliefConfidenceDeltas: z.array(beliefConfidenceDeltaSchema).max(20),
    temperamentDeltas: z.array(temperamentDeltaSchema).max(10),
    coreValueDeltas: z.array(coreValueDeltaSchema).max(8),
  })
  .strict()
  .superRefine((value, context) => {
    addDuplicateIssue(
      value.interestDeltas.map(({ key }) => key),
      "interestDeltas",
      context,
    );
    addDuplicateIssue(
      value.sourceTrustDeltas.map(({ sourceId }) => sourceId),
      "sourceTrustDeltas",
      context,
    );
    addDuplicateIssue(
      value.relationshipTrustDeltas.map(({ targetUserId }) => targetUserId),
      "relationshipTrustDeltas",
      context,
    );
    addDuplicateIssue(
      value.beliefConfidenceDeltas.map(({ topicKey }) => topicKey),
      "beliefConfidenceDeltas",
      context,
    );
    addDuplicateIssue(
      value.temperamentDeltas.map(({ key }) => key),
      "temperamentDeltas",
      context,
    );
    addDuplicateIssue(
      value.coreValueDeltas.map(({ key }) => key),
      "coreValueDeltas",
      context,
    );
  });

export type WeeklyPersonaEvolutionDelta = z.infer<typeof weeklyPersonaEvolutionDeltaSchema>;

export interface PersonaEvolutionValidationReport {
  deltaBoundsPassed: true;
  pinnedFieldsPassed: true;
  interestsNormalized: true;
  changedPaths: string[];
  candidate: PersonaValidationReport;
}

export interface AppliedWeeklyPersonaEvolution {
  persona: SeedPersona;
  delta: WeeklyPersonaEvolutionDelta;
  renderedPrompt: string;
  validationReport: PersonaEvolutionValidationReport;
}

export interface ApplyWeeklyPersonaEvolutionInput {
  currentPersona: unknown;
  delta: unknown;
  existingPersonas?: unknown[];
  previousWeeklyDeltas?: unknown[];
}

const PRECISION = 12;
const NORMALIZATION_EPSILON = 1e-9;

function rounded(value: number): number {
  return Number(value.toFixed(PRECISION));
}

function evolutionError(reasonCode: string, message: string, field: string): AppError {
  return new AppError("VALIDATION_ERROR", 422, message, { [field]: [message] }, undefined, {
    reasonCode,
  });
}

type DeltaCollectionName = Exclude<keyof WeeklyPersonaEvolutionDelta, "safeSummary">;

const weeklyDeltaCollections = [
  { field: "interestDeltas", target: "key", bound: WEEKLY_PERSONA_EVOLUTION_BOUNDS.interest },
  {
    field: "sourceTrustDeltas",
    target: "sourceId",
    bound: WEEKLY_PERSONA_EVOLUTION_BOUNDS.sourceTrust,
  },
  {
    field: "relationshipTrustDeltas",
    target: "targetUserId",
    bound: WEEKLY_PERSONA_EVOLUTION_BOUNDS.relationshipTrust,
  },
  {
    field: "beliefConfidenceDeltas",
    target: "topicKey",
    bound: WEEKLY_PERSONA_EVOLUTION_BOUNDS.beliefConfidence,
  },
  {
    field: "temperamentDeltas",
    target: "key",
    bound: WEEKLY_PERSONA_EVOLUTION_BOUNDS.temperament,
  },
  {
    field: "coreValueDeltas",
    target: "key",
    bound: WEEKLY_PERSONA_EVOLUTION_BOUNDS.coreValue,
  },
] as const satisfies ReadonlyArray<{
  field: DeltaCollectionName;
  target: string;
  bound: number;
}>;

export function assertWeeklyPersonaEvolutionBudget(input: {
  delta: unknown;
  previousWeeklyDeltas?: unknown[];
}): WeeklyPersonaEvolutionDelta {
  const delta = weeklyPersonaEvolutionDeltaSchema.parse(input.delta);
  const previous = (input.previousWeeklyDeltas ?? []).map((candidate) =>
    weeklyPersonaEvolutionDeltaSchema.parse(candidate),
  );
  for (const collection of weeklyDeltaCollections) {
    const totals = new Map<string, number>();
    for (const candidate of [...previous, delta]) {
      const values = candidate[collection.field] as Array<Record<string, string | number>>;
      for (const value of values) {
        const target = String(value[collection.target]);
        totals.set(target, rounded((totals.get(target) ?? 0) + Number(value.delta)));
      }
    }
    for (const [target, total] of totals) {
      if (Math.abs(total) > collection.bound + NORMALIZATION_EPSILON) {
        throw evolutionError(
          "PERSONA_WEEKLY_DELTA_BUDGET_EXCEEDED",
          "Aynı hedef için haftalık persona evolution sınırı aşılamaz.",
          `${collection.field}.${target}`,
        );
      }
    }
  }
  return delta;
}

function boundedResult(current: number, delta: number, path: string): number {
  const result = rounded(current + delta);
  if (result < 0 || result > 1) {
    throw evolutionError(
      "PERSONA_DELTA_RESULT_OUT_OF_RANGE",
      "Weekly delta sonucunda değer 0 ile 1 aralığında kalmalıdır.",
      path,
    );
  }
  return result;
}

function pinnedPathValue(persona: SeedPersona, path: string): { found: boolean; value: unknown } {
  const [root, ...segments] = path.split(".");
  if ((root === "coreValues" || root === "interests") && segments.length > 0) {
    const key = segments.join(".");
    const value = persona[root].find((item) => item.key === key);
    return { found: value !== undefined, value };
  }
  let value: unknown = persona;
  for (const segment of path.split(".")) {
    if (!value || typeof value !== "object" || Array.isArray(value) || !(segment in value)) {
      return { found: false, value: undefined };
    }
    value = (value as Record<string, unknown>)[segment];
  }
  return { found: true, value };
}

function assertPinnedPathsResolve(persona: SeedPersona): void {
  for (const path of persona.evolution.pinnedFields) {
    if (!pinnedPathValue(persona, path).found) {
      throw evolutionError(
        "PERSONA_PINNED_PATH_INVALID",
        "Persona pinned field yolu mevcut persona içinde çözümlenemedi.",
        `evolution.pinnedFields.${path}`,
      );
    }
  }
}

function assertTargetMutable(
  persona: SeedPersona,
  collection: "interests" | "coreValues",
  key: string,
): void {
  const item = persona[collection].find((candidate) => candidate.key === key);
  if (!item) {
    throw evolutionError(
      "PERSONA_DELTA_TARGET_NOT_FOUND",
      "Weekly delta hedefi mevcut personada bulunamadı.",
      `${collection}.${key}`,
    );
  }
  const path = `${collection}.${key}`;
  if (item.pinned || persona.evolution.pinnedFields.includes(path)) {
    throw evolutionError(
      "PERSONA_PINNED_FIELD_CHANGED",
      "Pinned persona alanı reflection delta ile değiştirilemez.",
      path,
    );
  }
}

function assertTemperamentMutable(persona: SeedPersona, key: TemperamentKey): void {
  const path = `temperament.${key}`;
  if (persona.evolution.pinnedFields.includes(path)) {
    throw evolutionError(
      "PERSONA_PINNED_FIELD_CHANGED",
      "Pinned persona alanı reflection delta ile değiştirilemez.",
      path,
    );
  }
}

function applyInterestDeltas(
  persona: SeedPersona,
  deltas: WeeklyPersonaEvolutionDelta["interestDeltas"],
): SeedPersona["interests"] {
  if (deltas.length === 0) return persona.interests;
  const byKey = new Map(deltas.map((delta) => [delta.key, delta.delta]));
  for (const { key } of deltas) assertTargetMutable(persona, "interests", key);
  const interests = persona.interests.map((interest) => {
    const delta = byKey.get(interest.key);
    return delta === undefined
      ? interest
      : {
          ...interest,
          weight: boundedResult(interest.weight, delta, `interests.${interest.key}`),
        };
  });
  const total = interests.reduce((sum, interest) => sum + interest.weight, 0);
  if (Math.abs(total - 1) > NORMALIZATION_EPSILON) {
    throw evolutionError(
      "PERSONA_INTERESTS_NOT_NORMALIZED",
      "Interest deltaları toplam ağırlığı 1 olarak korumalıdır.",
      "interestDeltas",
    );
  }
  const residual = rounded(1 - total);
  if (residual !== 0) {
    const correctionKey = deltas[0]!.key;
    const index = interests.findIndex(({ key }) => key === correctionKey);
    const current = persona.interests[index]!;
    const corrected = rounded(interests[index]!.weight + residual);
    if (
      corrected < 0 ||
      corrected > 1 ||
      Math.abs(corrected - current.weight) >
        WEEKLY_PERSONA_EVOLUTION_BOUNDS.interest + NORMALIZATION_EPSILON
    ) {
      throw evolutionError(
        "PERSONA_INTERESTS_NOT_NORMALIZED",
        "Interest ağırlıkları weekly bound içinde normalize edilemedi.",
        "interestDeltas",
      );
    }
    interests[index] = { ...interests[index]!, weight: corrected };
  }
  return interests;
}

function assertPinnedFieldsUnchanged(current: SeedPersona, candidate: SeedPersona): void {
  for (const path of current.evolution.pinnedFields) {
    if (!candidate.evolution.pinnedFields.includes(path)) {
      throw evolutionError(
        "PERSONA_PINNED_FIELD_CHANGED",
        "Pinned persona alanı kaldırılamaz veya serbest bırakılamaz.",
        `evolution.pinnedFields.${path}`,
      );
    }
    const before = pinnedPathValue(current, path);
    const after = pinnedPathValue(candidate, path);
    if (!before.found || !after.found || !isDeepStrictEqual(before.value, after.value)) {
      throw evolutionError(
        "PERSONA_PINNED_FIELD_CHANGED",
        "Pinned persona alanı reflection delta ile değiştirilemez.",
        path,
      );
    }
  }
  for (const collection of ["interests", "coreValues"] as const) {
    for (const item of current[collection].filter(({ pinned }) => pinned)) {
      const next = candidate[collection].find(({ key }) => key === item.key);
      if (!next || !isDeepStrictEqual(item, next)) {
        throw evolutionError(
          "PERSONA_PINNED_FIELD_CHANGED",
          "Pinned persona alanı reflection delta ile değiştirilemez.",
          `${collection}.${item.key}`,
        );
      }
    }
  }
}

export function assertPinnedPersonaFieldsUnchanged(
  currentPersona: unknown,
  candidatePersona: unknown,
): void {
  const current = seedPersonaSchema.parse(currentPersona);
  const candidate = seedPersonaSchema.parse(candidatePersona);
  assertPinnedPathsResolve(current);
  assertPinnedPathsResolve(candidate);
  assertPinnedFieldsUnchanged(current, candidate);
}

export function applyWeeklyPersonaEvolution(
  input: ApplyWeeklyPersonaEvolutionInput,
): AppliedWeeklyPersonaEvolution {
  const current = seedPersonaSchema.parse(input.currentPersona);
  const delta = assertWeeklyPersonaEvolutionBudget({
    delta: input.delta,
    ...(input.previousWeeklyDeltas ? { previousWeeklyDeltas: input.previousWeeklyDeltas } : {}),
  });
  assertPinnedPathsResolve(current);

  const temperamentDeltas = new Map(
    delta.temperamentDeltas.map(({ key, delta: value }) => [key, value]),
  );
  const coreValueDeltas = new Map(
    delta.coreValueDeltas.map(({ key, delta: value }) => [key, value]),
  );

  for (const { key } of delta.temperamentDeltas) assertTemperamentMutable(current, key);
  for (const { key } of delta.coreValueDeltas) assertTargetMutable(current, "coreValues", key);

  const candidate: SeedPersona = {
    ...current,
    interests: applyInterestDeltas(current, delta.interestDeltas),
    temperament: Object.fromEntries(
      temperamentKeys.map((key) => [
        key,
        temperamentDeltas.has(key)
          ? boundedResult(
              current.temperament[key],
              temperamentDeltas.get(key)!,
              `temperament.${key}`,
            )
          : current.temperament[key],
      ]),
    ) as SeedPersona["temperament"],
    coreValues: current.coreValues.map((value) => {
      const change = coreValueDeltas.get(value.key);
      return change === undefined
        ? value
        : {
            ...value,
            weight: boundedResult(value.weight, change, `coreValues.${value.key}`),
          };
    }),
  };

  assertPinnedFieldsUnchanged(current, candidate);
  const validated = validatePersonaCandidate(
    candidate,
    input.existingPersonas ?? [],
    delta.safeSummary,
  );
  const changedPaths = [
    ...delta.interestDeltas
      .filter(({ delta: value }) => value !== 0)
      .map(({ key }) => `interests.${key}`),
    ...delta.temperamentDeltas
      .filter(({ delta: value }) => value !== 0)
      .map(({ key }) => `temperament.${key}`),
    ...delta.coreValueDeltas
      .filter(({ delta: value }) => value !== 0)
      .map(({ key }) => `coreValues.${key}`),
  ];

  return {
    persona: validated.persona,
    delta,
    renderedPrompt: validated.renderedPrompt,
    validationReport: {
      deltaBoundsPassed: true,
      pinnedFieldsPassed: true,
      interestsNormalized: true,
      changedPaths,
      candidate: validated.report,
    },
  };
}
