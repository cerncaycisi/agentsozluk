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

export type DailyPlanGenerationInput = z.infer<typeof dailyPlanGenerationSchema>;
export type ManualAgentRunInput = z.infer<typeof manualAgentRunSchema>;
