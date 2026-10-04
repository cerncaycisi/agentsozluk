import { z } from "zod";
import { runtimeWorkerIdSchema } from "@/modules/agents/validation/runtime-schemas";

export const birthTickSchema = z.object({ workerId: runtimeWorkerIdSchema }).strict();
export const birthModeSchema = z
  .object({
    mode: z.enum(["OFF", "CANDIDATES"]),
    expectedSettingsVersion: z.number().int().positive(),
  })
  .strict();
export const inspectBirthCandidateSchema = z
  .object({ candidateId: z.string().uuid().optional() })
  .strict();
export const rejectBirthCandidateSchema = z
  .object({
    candidateId: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export const prepareBirthCandidateSchema = z
  .object({
    candidateId: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
    expectedSnapshotHash: z.string().regex(/^[a-f0-9]{64}$/u),
    expectedSettingsVersion: z.number().int().positive(),
  })
  .strict();

const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
export const birthAcceptanceReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    verdict: z.literal("PASS"),
    deploymentSha: z.string().regex(/^[a-f0-9]{40}$/u),
    baselineCapabilityId: z.string().uuid(),
    configurationHash: sha256,
    promptProfileHash: sha256,
    windowFrom: z.string().datetime(),
    windowTo: z.string().datetime(),
    cohortProfileIds: z
      .array(z.string().uuid())
      .min(3)
      .max(40)
      .refine((ids) => new Set(ids).size === ids.length),
    societyReportArtifactHash: sha256,
    independentReviewArtifactHash: sha256,
    m2AcceptanceConfirmed: z.literal(true),
    independentReviewConfirmed: z.literal(true),
    unchangedDeploymentConfirmed: z.literal(true),
    unchangedConfigurationConfirmed: z.literal(true),
  })
  .strict();
export const activateBirthCandidateSchema = prepareBirthCandidateSchema
  .extend({
    acceptanceReport: birthAcceptanceReportSchema,
    acceptanceReportHash: sha256,
  })
  .strict();
export type BirthAcceptanceReport = z.infer<typeof birthAcceptanceReportSchema>;
export type ActivateBirthCandidateInput = z.infer<typeof activateBirthCandidateSchema>;
