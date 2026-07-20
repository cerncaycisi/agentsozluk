import { z } from "zod";
import { operatorReasonSchema } from "@/modules/agents/validation/schemas";

export const invalidateAgentMemorySchema = z
  .object({
    reason: operatorReasonSchema,
    confirmation: z.literal("INVALIDATE_AGENT_MEMORY"),
  })
  .strict();

export const forgetAgentMemorySchema = z
  .object({
    reason: operatorReasonSchema,
    confirmation: z.literal("FORGET_AGENT_MEMORY"),
  })
  .strict();

export const reconsolidateAgentMemorySchema = z
  .object({
    reason: operatorReasonSchema,
    confirmation: z.literal("RECONSOLIDATE_AGENT_MEMORY"),
  })
  .strict();

export type InvalidateAgentMemoryInput = z.infer<typeof invalidateAgentMemorySchema>;
export type ForgetAgentMemoryInput = z.infer<typeof forgetAgentMemorySchema>;
export type ReconsolidateAgentMemoryInput = z.infer<typeof reconsolidateAgentMemorySchema>;
