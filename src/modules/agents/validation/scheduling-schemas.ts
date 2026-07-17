import { z } from "zod";

export const dailyPlanGenerationSchema = z
  .object({
    localDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .transform((value) => new Date(`${value}T00:00:00.000Z`))
      .optional(),
  })
  .strict();

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

export const agentRunCommandSchema = z
  .object({ reason: z.string().trim().min(10).max(1000) })
  .strict();

export type DailyPlanGenerationInput = z.infer<typeof dailyPlanGenerationSchema>;
export type ManualAgentRunInput = z.infer<typeof manualAgentRunSchema>;
export type BulkAgentRunPreviewInput = z.infer<typeof bulkAgentRunPreviewSchema>;
export type BulkAgentRunInput = z.infer<typeof bulkAgentRunSchema>;
export type AgentRunCommandInput = z.infer<typeof agentRunCommandSchema>;
