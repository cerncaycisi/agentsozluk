import { z } from "zod";
import { displayNameSchema } from "@/modules/auth/validation/schemas";
import { circuitBreakerConfigSchema } from "@/modules/agents/domain/circuit-breaker";
import { runtimeOperatingModes } from "@/modules/agents/domain/runtime-controls";
import { seedPersonaSchema } from "@/modules/agents/personas/schema";

const operatorReasonControlCharacter = /[\u0000-\u001f\u007f-\u009f]/u;
const operatorReasonUrl = /\b[a-z][a-z0-9+.-]{1,31}:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+/iu;
const operatorReasonEmail = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const operatorReasonHtmlElement = /<\/?[a-z][^>]*>/iu;
const operatorReasonOtp = /\b\d{6}\b/u;
const operatorReasonOpaqueToken = /[A-Za-z0-9_-]{24,}/gu;
const operatorReasonCredentialPatterns = [
  /\b(?:Bearer|Basic)\s+\S+/iu,
  /\b(?:(?:AKIA|ASIA)[A-Z0-9]{16}|sk-[A-Za-z0-9_-]{8,}|agt_[A-Za-z0-9_-]{8,}|github_pat_[A-Za-z0-9_]{8,}|gh[pousr]_[A-Za-z0-9]{8,}|glpat-[A-Za-z0-9_-]{8,}|xox[baprs]-[A-Za-z0-9-]{8,})\b/iu,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/u,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/iu,
  /(?:^|[^a-z0-9])["']?(?:api[\s_-]?key|access[\s_-]?key(?:[\s_-]?id)?|access[\s_-]?token|refresh[\s_-]?token|client[\s_-]?secret|private[\s_-]?key|secret[\s_-]?(?:access[\s_-]?)?key|signing[\s_-]?key|jwt[\s_-]?secret|password(?:[\s_-]?hash)?|passwd|pwd|secret|token(?:[\s_-]?hash)?|credential|authorization|x[\s_-]?amz[\s_-]?signature|x[\s_-]?goog[\s_-]?signature|signature|sig|key)["']?\s*[:=]\s*[^\s,;]+/iu,
  /(?:^|[?&])(?:token|key|api[_-]?key|sig|signature|credential|x-amz-[^=&#\s]+|x-goog-[^=&#\s]+)=[^&#\s]+/iu,
] as const;

export const operatorReasonSchema = z
  .string()
  .refine((value) => !operatorReasonControlCharacter.test(value), {
    message: "Operator gerekçesi kontrol karakteri veya satır sonu içeremez.",
  })
  .refine((value) => !operatorReasonUrl.test(value), {
    message: "Operator gerekçesi URL içeremez.",
  })
  .refine((value) => !operatorReasonEmail.test(value), {
    message: "Operator gerekçesi e-posta adresi içeremez.",
  })
  .refine((value) => !operatorReasonHtmlElement.test(value), {
    message: "Operator gerekçesi HTML içeremez.",
  })
  .refine((value) => !operatorReasonCredentialPatterns.some((pattern) => pattern.test(value)), {
    message: "Operator gerekçesi credential, token, anahtar veya imza içeremez.",
  })
  .refine((value) => !operatorReasonOtp.test(value), {
    message: "Operator gerekçesi altı haneli doğrulama kodu içeremez.",
  })
  .refine(
    (value) =>
      ![...value.matchAll(operatorReasonOpaqueToken)].some(
        ({ 0: token }) => /[a-z]/u.test(token) && /[A-Z]/u.test(token) && /\d/u.test(token),
      ),
    { message: "Operator gerekçesi yüksek entropili opaque değer içeremez." },
  )
  .trim()
  .min(10)
  .max(1000);

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
    changeSummary: operatorReasonSchema.optional(),
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
  .refine(
    (input) =>
      (!input.persona && input.displayName === undefined && input.publicBio === undefined) ||
      Boolean(input.changeSummary),
    {
      path: ["changeSummary"],
      message: "Persona kimliği değişikliği için güvenli değişiklik özeti zorunludur.",
    },
  )
  .refine((input) => Object.keys(input).length > 0, { message: "En az bir alan gönderin." });

export const lifecycleChangeSchema = z.object({
  status: z.enum(["DRAFT", "PAUSED", "ACTIVE", "SUSPENDED", "RETIRED"]),
  reason: operatorReasonSchema,
});

export const personaRollbackSchema = z.object({
  version: z.number().int().positive(),
  reason: operatorReasonSchema,
});

export const quotaApplyModeSchema = z.enum(["NEXT_DAY", "REGENERATE_REMAINING_TODAY"]);

const quotaSettingFieldNames = [
  "quotaMode",
  "defaultDailyEntryMin",
  "defaultDailyEntryMax",
  "globalDailyEntryMin",
  "globalDailyEntryMax",
] as const;

export const globalSettingsUpdateSchema = z
  .object({
    quotaApplyMode: quotaApplyModeSchema.optional(),
    expectedSettingsVersion: z.number().int().positive().optional(),
    changeReason: operatorReasonSchema.optional(),
    publishEnabled: z.boolean().optional(),
    publicWriteEnabled: z.boolean().optional(),
    runtimeOperatingMode: z.enum(runtimeOperatingModes).optional(),
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
    sourceFetchLimit: z.number().int().min(1).max(50).optional(),
    debugRetentionHours: z.number().int().min(0).max(24).optional(),
    maxRetryCount: z.number().int().min(0).max(5).optional(),
    duplicateSimilarityThreshold: z.number().min(0.5).max(1).optional(),
    circuitBreakerConfig: circuitBreakerConfigSchema.optional(),
    degradedMode: z.boolean().optional(),
    indexingMode: z.enum(["INDEX_ALL", "NOINDEX_AGENT_CONTENT", "NOINDEX_ALL_DYNAMIC"]).optional(),
    sitemapDelayMinutes: z.number().int().min(0).max(10080).optional(),
    agentTopicIndexingEnabled: z.boolean().optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.expectedSettingsVersion === undefined)
      context.addIssue({
        code: "custom",
        path: ["expectedSettingsVersion"],
        message: "Global ayar değişikliği için güncel settings version gereklidir.",
      });
    if (input.changeReason === undefined)
      context.addIssue({
        code: "custom",
        path: ["changeReason"],
        message: "Global ayar değişikliği için gerekçe zorunludur.",
      });
    if (
      quotaSettingFieldNames.some((field) => input[field] !== undefined) &&
      input.quotaApplyMode === undefined
    )
      context.addIssue({
        code: "custom",
        path: ["quotaApplyMode"],
        message: "Quota değişikliğinin ne zaman uygulanacağı seçilmelidir.",
      });
  })
  .refine(
    (input) =>
      Object.keys(input).some(
        (key) =>
          key !== "quotaApplyMode" && key !== "expectedSettingsVersion" && key !== "changeReason",
      ),
    { message: "En az bir ayar gönderin." },
  );

export const runtimeControlSchema = z.object({ reason: operatorReasonSchema }).strict();

export const productionRolloutStartSchema = z
  .object({
    attemptId: z.string().uuid(),
    commandId: z.string().uuid(),
    reasonCode: z.literal("DAY0_START"),
  })
  .strict();

export const productionRolloutCommandSchema = z
  .object({
    attemptId: z.string().uuid(),
    commandId: z.string().uuid(),
    reasonCode: z.enum(["DAY0_ABORT", "DAY0_COMPLETE"]),
  })
  .strict();

export const agentSourceStatuses = [
  "SEED",
  "DISCOVERED",
  "PROBATION",
  "TRUSTED",
  "DORMANT",
  "REJECTED",
  "BLOCKED",
] as const;
export type AgentSourceStatusValue = (typeof agentSourceStatuses)[number];

export const agentSourceAdminUpdateSchema = z
  .object({
    adminPinned: z.boolean().optional(),
    adminBlocked: z.boolean().optional(),
    status: z.enum(agentSourceStatuses).optional(),
    trustScore: z.number().min(0).max(1).optional(),
    interestScore: z.number().min(0).max(1).optional(),
    noveltyScore: z.number().min(0).max(1).optional(),
    usefulnessScore: z.number().min(0).max(1).optional(),
    reason: operatorReasonSchema,
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
export type ProductionRolloutStartInput = z.infer<typeof productionRolloutStartSchema>;
export type ProductionRolloutCommandInput = z.infer<typeof productionRolloutCommandSchema>;
export type AgentSourceAdminUpdateInput = z.infer<typeof agentSourceAdminUpdateSchema>;
