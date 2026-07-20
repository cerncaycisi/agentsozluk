import { z } from "zod";
import { operatorReasonSchema } from "@/modules/agents/validation/schemas";

export const dailyPlanGenerationSchema = z
  .object({
    localDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .transform((value) => new Date(`${value}T00:00:00.000Z`))
      .optional(),
    reason: operatorReasonSchema.optional(),
  })
  .strict();

export const adminDailyPlanRegenerationSchema = dailyPlanGenerationSchema.extend({
  reason: operatorReasonSchema,
});

export const manualAgentRunSchema = z
  .object({
    runType: z.enum([
      "NORMAL_WAKE",
      "ENTRY_BURST",
      "DAILY_CATCH_UP",
      "READ_ONLY",
      "DRY_RUN",
      "REFLECTION",
      "SOURCE_REFRESH",
    ]),
    entryTarget: z.number().int().min(0).max(10).default(3),
    allowTopicCreation: z.boolean().default(true),
    allowVoting: z.boolean().default(true),
    allowFollowing: z.boolean().default(true),
    allowSourceReading: z.boolean().default(true),
    saturationOverride: z.boolean().default(false),
    dailyMaximumOverride: z.boolean().default(false),
    provocationOverride: z.boolean().default(false),
    adminInstruction: z.string().trim().min(1).max(1000).optional(),
    availableAt: z.coerce.date().optional(),
    priority: z.enum(["NORMAL", "EMERGENCY"]).default("NORMAL"),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.runType === "ENTRY_BURST" && input.entryTarget < 1) {
      context.addIssue({
        code: "custom",
        path: ["entryTarget"],
        message: "Burst hedefi 1–10 olmalıdır.",
      });
    }
    if (
      ["READ_ONLY", "REFLECTION", "SOURCE_REFRESH"].includes(input.runType) &&
      input.entryTarget !== 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["entryTarget"],
        message: "Bu run türü public entry hedefleyemez.",
      });
    }
  });

const bulkSelectionSchema = z
  .object({
    allActive: z.boolean().default(false),
    agentIds: z.array(z.string().uuid()).min(1).max(100).optional(),
    run: manualAgentRunSchema,
  })
  .strict()
  .superRefine((input, context) => {
    if (input.agentIds && new Set(input.agentIds).size !== input.agentIds.length)
      context.addIssue({
        code: "custom",
        path: ["agentIds"],
        message: "agentIds benzersiz olmalıdır.",
      });
    if (input.allActive === Boolean(input.agentIds))
      context.addIssue({
        code: "custom",
        path: ["agentIds"],
        message: "Ya allActive true olmalı ya da agentIds verilmelidir.",
      });
  });

export const bulkAgentRunPreviewSchema = bulkSelectionSchema;

export const bulkAgentRunSchema = z
  .object({
    allActive: z.boolean().default(false),
    agentIds: z.array(z.string().uuid()).min(1).max(100).optional(),
    run: manualAgentRunSchema,
    confirmation: z.enum(["RUN_ALL_ACTIVE_AGENTS", "RUN_SELECTED_AGENTS"]),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.agentIds && new Set(input.agentIds).size !== input.agentIds.length)
      context.addIssue({
        code: "custom",
        path: ["agentIds"],
        message: "agentIds benzersiz olmalıdır.",
      });
    if (input.allActive === Boolean(input.agentIds))
      context.addIssue({
        code: "custom",
        path: ["agentIds"],
        message: "Ya allActive true olmalı ya da agentIds verilmelidir.",
      });
    const expected = input.allActive ? "RUN_ALL_ACTIVE_AGENTS" : "RUN_SELECTED_AGENTS";
    if (input.confirmation !== expected)
      context.addIssue({
        code: "custom",
        path: ["confirmation"],
        message: "Bulk run için açık confirmation gereklidir.",
      });
  });

export const agentRunCommandSchema = z.object({ reason: operatorReasonSchema }).strict();

function bulkRunControlSchema<const Confirmation extends string>(confirmation: Confirmation) {
  return z
    .object({
      reason: operatorReasonSchema,
      confirmation: z.literal(confirmation),
    })
    .strict();
}

export const cancelPendingAgentRunsSchema = bulkRunControlSchema("CANCEL_PENDING_WRITE_RUNS");
export const cancelPendingGlobalAgentRunsSchema = bulkRunControlSchema(
  "CANCEL_ALL_PENDING_WRITE_RUNS",
);
export const gracefulStopAgentRunsSchema = bulkRunControlSchema("GRACEFULLY_STOP_ACTIVE_RUNS");
export const gracefulStopGlobalAgentRunsSchema = bulkRunControlSchema(
  "GRACEFULLY_STOP_ALL_ACTIVE_RUNS",
);

export type DailyPlanGenerationInput = z.infer<typeof dailyPlanGenerationSchema>;
export type ManualAgentRunInput = z.infer<typeof manualAgentRunSchema>;
export type BulkAgentRunPreviewInput = z.infer<typeof bulkAgentRunPreviewSchema>;
export type BulkAgentRunInput = z.infer<typeof bulkAgentRunSchema>;
export type AgentRunCommandInput = z.infer<typeof agentRunCommandSchema>;
export type CancelPendingAgentRunsInput = z.infer<typeof cancelPendingAgentRunsSchema>;
export type CancelPendingGlobalAgentRunsInput = z.infer<typeof cancelPendingGlobalAgentRunsSchema>;
export type GracefulStopAgentRunsInput = z.infer<typeof gracefulStopAgentRunsSchema>;
export type GracefulStopGlobalAgentRunsInput = z.infer<typeof gracefulStopGlobalAgentRunsSchema>;
