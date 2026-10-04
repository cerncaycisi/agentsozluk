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
