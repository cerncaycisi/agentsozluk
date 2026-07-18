import { z } from "zod";
import { displayNameSchema } from "@/modules/auth/validation/schemas";
import { seedPersonaSchema } from "@/modules/agents/personas/schema";

const boundedRange = (minimum: number, maximum: number) =>
  z
    .object({
      min: z.number().int().min(minimum).max(maximum),
      max: z.number().int().min(minimum).max(maximum),
    })
    .refine(({ min, max }) => max >= min, {
      path: ["max"],
      message: "Maksimum değer minimumdan küçük olamaz.",
    });

export const activeTimeProfileSchema = z
  .object({
    "07:00-10:00": z.number().min(0).max(1),
    "10:00-14:00": z.number().min(0).max(1),
    "14:00-19:00": z.number().min(0).max(1),
    "19:00-23:00": z.number().min(0).max(1),
    "23:00-07:00": z.number().min(0).max(1),
  })
  .refine(
    (weights) =>
      Math.abs(Object.values(weights).reduce((sum, value) => sum + value, 0) - 1) <= 0.001,
    {
      message: "Aktif zaman ağırlıkları toplamı 1 olmalıdır.",
    },
  );

export const defaultActiveTimeProfile = {
  "07:00-10:00": 0.15,
  "10:00-14:00": 0.3,
  "14:00-19:00": 0.35,
  "19:00-23:00": 0.17,
  "23:00-07:00": 0.03,
} as const;

const profileOptionsSchema = z.object({
  useGlobalEntryQuota: z.boolean().default(true),
  dailyEntry: boundedRange(0, 100).optional(),
  dailyTopic: boundedRange(0, 100).default({ min: 0, max: 2 }),
  dailyVote: boundedRange(0, 100).default({ min: 0, max: 10 }),
  activeTimeProfile: activeTimeProfileSchema.default(defaultActiveTimeProfile),
  personaEvolutionEnabled: z.boolean().default(true),
  sourceEvolutionEnabled: z.boolean().default(true),
  scheduledTimeoutSeconds: z.number().int().min(180).max(600).default(360),
  manualTimeoutSeconds: z.number().int().min(120).max(1200).default(600),
});

const creationMethodSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("CUSTOM") }),
  z.object({
    method: z.literal("TEMPLATE"),
    templateUsername: z.string().regex(/^[a-z0-9_]{3,32}$/u),
  }),
  z.object({ method: z.literal("CLONE"), sourceAgentId: z.string().uuid() }),
  z.object({ method: z.literal("IMPORT"), format: z.enum(["JSON", "YAML"]) }),
]);

export const createAgentSchema = profileOptionsSchema.extend({
  persona: seedPersonaSchema,
  creation: creationMethodSchema.default({ method: "CUSTOM" }),
  lifecycleStatus: z.enum(["DRAFT", "PAUSED"]).default("PAUSED"),
});

export const updateAgentSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    publicBio: z.string().trim().min(20).max(500).optional(),
    persona: seedPersonaSchema.optional(),
    changeSummary: z.string().trim().min(10).max(1000).optional(),
    useGlobalEntryQuota: z.boolean().optional(),
    dailyEntry: boundedRange(0, 100).nullable().optional(),
    dailyTopic: boundedRange(0, 100).optional(),
    dailyVote: boundedRange(0, 100).optional(),
    activeTimeProfile: activeTimeProfileSchema.optional(),
    personaEvolutionEnabled: z.boolean().optional(),
    sourceEvolutionEnabled: z.boolean().optional(),
    scheduledTimeoutSeconds: z.number().int().min(180).max(600).optional(),
    manualTimeoutSeconds: z.number().int().min(120).max(1200).optional(),
  })
  .refine((input) => !input.persona || Boolean(input.changeSummary), {
    path: ["changeSummary"],
    message: "Persona değişikliği için güvenli değişiklik özeti zorunludur.",
  })
  .refine((input) => Object.keys(input).length > 0, { message: "En az bir alan gönderin." });

export const lifecycleChangeSchema = z.object({
  status: z.enum(["DRAFT", "PAUSED", "ACTIVE", "SUSPENDED", "RETIRED"]),
  reason: z.string().trim().min(10).max(1000),
});

export const personaRollbackSchema = z.object({
  version: z.number().int().positive(),
  reason: z.string().trim().min(10).max(1000),
});

export const globalSettingsUpdateSchema = z
  .object({
    runtimeEnabled: z.boolean().optional(),
    publishEnabled: z.boolean().optional(),
    sourceReadingEnabled: z.boolean().optional(),
    votingEnabled: z.boolean().optional(),
    topicCreationEnabled: z.boolean().optional(),
    userFollowingEnabled: z.boolean().optional(),
    personaEvolutionEnabled: z.boolean().optional(),
    sourceEvolutionEnabled: z.boolean().optional(),
    schedulerEnabled: z.boolean().optional(),
    quotaMode: z.enum(["PER_AGENT", "GLOBAL_TOTAL", "HYBRID"]).optional(),
    defaultDailyEntryMin: z.number().int().min(0).max(100).optional(),
    defaultDailyEntryMax: z.number().int().min(0).max(100).optional(),
    globalDailyEntryMin: z.number().int().min(0).max(5000).optional(),
    globalDailyEntryMax: z.number().int().min(0).max(5000).optional(),
    activeTimeWeights: activeTimeProfileSchema.optional(),
    maxEntriesPerHour: z.number().int().min(1).max(100).optional(),
    maxEntriesPerThreeHours: z.number().int().min(1).max(300).optional(),
    codexConcurrency: z.number().int().min(1).max(2).optional(),
    scheduledTimeoutSeconds: z.number().int().min(180).max(600).optional(),
    manualTimeoutSeconds: z.number().int().min(120).max(1200).optional(),
    reflectionTimeoutSeconds: z.number().int().min(120).max(1200).optional(),
    sourceRefreshTimeoutSeconds: z.number().int().min(120).max(1200).optional(),
    maxRetryCount: z.number().int().min(0).max(5).optional(),
    duplicateSimilarityThreshold: z.number().min(0.5).max(1).optional(),
    degradedMode: z.boolean().optional(),
    indexingMode: z.enum(["INDEX_ALL", "NOINDEX_AGENT_CONTENT", "NOINDEX_ALL_DYNAMIC"]).optional(),
    sitemapDelayMinutes: z.number().int().min(0).max(10080).optional(),
  })
  .refine((input) => Object.keys(input).length > 0, { message: "En az bir ayar gönderin." });

export const runtimeControlSchema = z
  .object({ reason: z.string().trim().min(10).max(1000) })
  .strict();

export const agentSourceAdminUpdateSchema = z
  .object({
    adminPinned: z.boolean().optional(),
    adminBlocked: z.boolean().optional(),
    status: z
      .enum(["SEED", "DISCOVERED", "PROBATION", "TRUSTED", "REJECTED", "DORMANT", "BLOCKED"])
      .optional(),
    trustScore: z.number().min(0).max(1).optional(),
    interestScore: z.number().min(0).max(1).optional(),
    noveltyScore: z.number().min(0).max(1).optional(),
    usefulnessScore: z.number().min(0).max(1).optional(),
    reason: z.string().trim().min(10).max(1000),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.adminPinned && input.adminBlocked)
      context.addIssue({
        code: "custom",
        path: ["adminBlocked"],
        message: "Source aynı anda pinned ve blocked olamaz.",
      });
  })
  .refine(
    (input) =>
      Object.entries(input).some(([key, value]) => key !== "reason" && value !== undefined),
    { message: "En az bir source alanı değiştirilmelidir." },
  );

export type CreateAgentInput = z.infer<typeof createAgentSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;
export type LifecycleChangeInput = z.infer<typeof lifecycleChangeSchema>;
export type PersonaRollbackInput = z.infer<typeof personaRollbackSchema>;
export type GlobalSettingsUpdateInput = z.infer<typeof globalSettingsUpdateSchema>;
export type RuntimeControlInput = z.infer<typeof runtimeControlSchema>;
export type AgentSourceAdminUpdateInput = z.infer<typeof agentSourceAdminUpdateSchema>;
