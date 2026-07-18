import { z } from "zod";
import { sourceUrlHasSensitiveQuery } from "@/modules/agents/domain/source-query-security";

const weightedKeySchema = z.object({
  key: z.string().min(2).max(100),
  weight: z.number().min(0).max(1),
  pinned: z.boolean().default(false),
});

const sourceSchema = z.object({
  url: z
    .string()
    .url()
    .refine((url) => {
      const parsed = new URL(url);
      return ["http:", "https:"].includes(parsed.protocol) && !sourceUrlHasSensitiveQuery(parsed);
    }),
  sourceType: z.enum(["RSS", "ATOM", "HTML"]),
  topics: z.array(z.string().min(2).max(100)).min(1).max(8),
  status: z.enum(["SEED", "TRUSTED"]),
  weight: z.number().min(0).max(1),
  pinned: z.boolean(),
});

const temperamentSchema = z.object({
  curiosity: z.number().min(0).max(1),
  skepticism: z.number().min(0).max(1),
  warmth: z.number().min(0).max(1),
  directness: z.number().min(0).max(1),
  humor: z.number().min(0).max(1),
  conflict: z.number().min(0).max(1),
  explanationDensity: z.number().min(0).max(1),
  uncertaintyTolerance: z.number().min(0).max(1),
  topicExploration: z.number().min(0).max(1),
  evidenceDemand: z.number().min(0).max(1),
});

const weeklyBoundsSchema = z.object({
  interest: z.literal(0.08),
  sourceTrust: z.literal(0.1),
  relationshipTrust: z.literal(0.1),
  beliefConfidence: z.literal(0.15),
  temperament: z.literal(0.03),
  coreValue: z.literal(0.02),
});

export const seedPersonaSchema = z
  .object({
    schemaVersion: z.literal(1),
    username: z.string().regex(/^[a-z0-9_]{3,32}$/u),
    displayName: z.string().min(2).max(80),
    publicBio: z.string().min(20).max(500),
    identity: z.object({
      selfDescription: z.string().min(20).max(500),
      biography: z.literal(""),
    }),
    coreValues: z.array(weightedKeySchema).min(3).max(8),
    epistemicApproach: z.object({
      evidenceThreshold: z.enum(["LOW", "MEDIUM", "HIGH", "VERY_HIGH"]),
      uncertaintyStyle: z.string().min(10).max(400),
      factInferenceBoundary: z.string().min(10).max(400),
      persuasionSignals: z.array(z.string().min(4).max(200)).min(2).max(8),
    }),
    temperament: temperamentSchema,
    interests: z.array(weightedKeySchema).min(4).max(12),
    writing: z.object({
      rhythm: z.string().min(10).max(300),
      entryLength: z.enum(["SHORT", "MEDIUM", "LONG", "MIXED"]),
      preferredMinWords: z.number().int().min(20).max(500),
      preferredMaxWords: z.number().int().min(40).max(1000),
      structure: z.array(z.string().min(3).max(120)).min(2).max(8),
      avoidPatterns: z.array(z.string().min(3).max(160)).min(2).max(10),
    }),
    humor: z.object({
      style: z.string().min(5).max(200),
      intensity: z.number().min(0).max(1),
      preferredTargets: z.array(z.string().min(3).max(120)).min(1).max(6),
      neverTargets: z.array(z.string().min(3).max(120)).min(2).max(8),
    }),
    conflict: z.object({
      threshold: z.number().min(0).max(1),
      responseMode: z.string().min(10).max(300),
      deescalationSignals: z.array(z.string().min(3).max(160)).min(2).max(6),
    }),
    persuasionConditions: z.array(z.string().min(5).max(240)).min(2).max(8),
    boredomConditions: z.array(z.string().min(5).max(240)).min(2).max(8),
    indifferentTopics: z.array(z.string().min(3).max(120)).min(1).max(8),
    valuedContent: z.array(z.string().min(4).max(180)).min(2).max(8),
    dislikedBehaviors: z.array(z.string().min(4).max(180)).min(2).max(8),
    sources: z.array(sourceSchema).min(3).max(12),
    sourceTopicMappings: z.record(z.string(), z.array(z.string().min(2).max(100)).min(1)),
    evolution: z.object({
      personaEnabled: z.boolean(),
      sourceEnabled: z.boolean(),
      weeklyBounds: weeklyBoundsSchema,
      pinnedFields: z.array(z.string().min(2).max(120)).min(3).max(20),
      forbiddenDirections: z.array(z.string().min(5).max(200)).min(3).max(12),
    }),
    relationshipTendencies: z.object({
      initialTrust: z.number().min(0).max(1),
      initialInterest: z.number().min(0).max(1),
      trustGains: z.array(z.string().min(3).max(160)).min(2).max(8),
      trustLosses: z.array(z.string().min(3).max(160)).min(2).max(8),
    }),
    behavior: z.object({
      topicCreationTendency: z.number().min(0).max(1),
      votingTendency: z.number().min(0).max(1),
      followingTendency: z.number().min(0).max(1),
      defaultEntryMin: z.literal(15),
      defaultEntryMax: z.literal(20),
    }),
  })
  .superRefine((persona, context) => {
    if (persona.writing.preferredMinWords > persona.writing.preferredMaxWords) {
      context.addIssue({
        code: "custom",
        path: ["writing", "preferredMaxWords"],
        message: "preferredMaxWords must be at least preferredMinWords",
      });
    }
    const totalInterestWeight = persona.interests.reduce(
      (sum, interest) => sum + interest.weight,
      0,
    );
    if (Math.abs(totalInterestWeight - 1) > 0.001) {
      context.addIssue({
        code: "custom",
        path: ["interests"],
        message: "interest weights must sum to 1",
      });
    }
    const sourceUrls = persona.sources.map(({ url }) => url);
    if (new Set(sourceUrls).size !== sourceUrls.length) {
      context.addIssue({
        code: "custom",
        path: ["sources"],
        message: "source URLs must be unique",
      });
    }
  });

export const seedPersonaPackSchema = z.object({
  schemaVersion: z.literal(1),
  methodology: z.object({
    sourceClustersPerPersonaMin: z.number().int().min(3),
    maxSingleSourceContribution: z.number().max(0.4),
    traitsDiscarded: z.literal(true),
    newTraitsAdded: z.literal(true),
    containsIdentityMappings: z.literal(false),
  }),
  personas: z.array(seedPersonaSchema).length(10),
});

export type SeedPersona = z.infer<typeof seedPersonaSchema>;
export type SeedPersonaPack = z.infer<typeof seedPersonaPackSchema>;

export const temperamentKeys = Object.keys(temperamentSchema.shape) as Array<
  keyof SeedPersona["temperament"]
>;
