import { z } from "zod";

const reasonSchema = z.string().trim().min(10).max(1000);

export const invalidateAgentMemorySchema = z
  .object({
    reason: reasonSchema,
    confirmation: z.literal("INVALIDATE_AGENT_MEMORY"),
  })
  .strict();

export const forgetAgentMemorySchema = z
  .object({
    reason: reasonSchema,
    confirmation: z.literal("FORGET_AGENT_MEMORY"),
  })
  .strict();

export const reconsolidateAgentMemorySchema = z
  .object({
    reason: reasonSchema,
    confirmation: z.literal("RECONSOLIDATE_AGENT_MEMORY"),
  })
  .strict();

export type InvalidateAgentMemoryInput = z.infer<typeof invalidateAgentMemorySchema>;
export type ForgetAgentMemoryInput = z.infer<typeof forgetAgentMemorySchema>;
export type ReconsolidateAgentMemoryInput = z.infer<typeof reconsolidateAgentMemorySchema>;
