import { z } from "zod";
import { isSafeLifeLedgerText } from "@/modules/agents/domain/life-ledger-safety";
import { weeklyPersonaEvolutionDeltaSchema } from "@/modules/agents/domain/persona-evolution";
import { operatorReasonSchema } from "@/modules/agents/validation/schemas";

export const runtimeWorkerIdSchema = z
  .string()
  .min(3)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/u, "Worker kimliği yalnız güvenli karakterler içerebilir.");

export const runtimeLeaseTokenSchema = z
  .string()
  .length(43)
  .regex(/^[A-Za-z0-9_-]{43}$/u, "Lease token biçimi geçersizdir.");

export const runtimeLeaseSchema = z
  .object({
    workerId: runtimeWorkerIdSchema,
    leaseSeconds: z.number().int().min(15).max(300).default(60),
  })
  .strict();

export const runtimeDailyPlanSchema = z
  .object({
    workerId: runtimeWorkerIdSchema,
  })
  .strict();

export const runtimeHeartbeatSchema = z
  .object({
    runId: z.string().uuid(),
    workerId: runtimeWorkerIdSchema,
    leaseToken: runtimeLeaseTokenSchema,
    leaseSeconds: z.number().int().min(15).max(300).default(60),
    runtimeStatus: z.enum([
      "STARTING",
      "READING",
      "THINKING",
      "VALIDATING",
      "EXECUTING",
      "REFLECTING",
      "CANCELLING",
    ]),
  })
  .strict();

const safeRuntimeMetadataSchema = z
  .object({
    phase: z.string().trim().min(1).max(64).optional(),
    code: z.string().trim().min(1).max(100).optional(),
    count: z.number().int().min(0).max(10_000).optional(),
    durationMs: z.number().int().min(0).max(86_400_000).optional(),
    itemIds: z.array(z.string().uuid()).max(100).optional(),
  })
  .strict();

const runtimeWorkerEventTypeSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) => !value.toLowerCase().startsWith("runtime.production."), {
    message: "Worker event type production control-plane namespace kullanamaz.",
  });

export const runtimeEventsSchema = z
  .object({
    workerId: runtimeWorkerIdSchema,
    leaseToken: runtimeLeaseTokenSchema,
    events: z
      .array(
        z
          .object({
            eventType: runtimeWorkerEventTypeSchema,
            safeMessage: z.string().trim().min(1).max(1000),
            metadata: safeRuntimeMetadataSchema.default({}),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();

export const runtimeActionInputSchema = z
  .object({
    body: z.string().trim().min(1).max(10_000).optional(),
    title: z.string().trim().min(2).max(120).optional(),
    topicId: z.string().uuid().optional(),
    entryId: z.string().uuid().optional(),
    replyToEntryId: z.string().uuid().optional(),
    provocationSignal: z.number().min(0).max(1).optional(),
    userId: z.string().uuid().optional(),
    username: z
      .string()
      .regex(/^[a-z0-9_]{3,30}$/u)
      .optional(),
    value: z.union([z.literal(-1), z.literal(1)]).optional(),
    url: z.string().url().max(2048).optional(),
    statement: z.string().trim().min(1).max(2000).optional(),
    summary: z.string().trim().min(1).max(2000).optional(),
    topicKey: z.string().trim().min(1).max(200).optional(),
    confidence: z.number().min(0).max(1).optional(),
    familiarity: z.number().min(0).max(1).optional(),
    trust: z.number().min(0).max(1).optional(),
    interest: z.number().min(0).max(1).optional(),
    disagreement: z.number().min(0).max(1).optional(),
    sourceType: z.enum(["RSS", "ATOM", "HTML"]).optional(),
    topics: z.array(z.string().trim().min(2).max(100)).min(1).max(8).optional(),
  })
  .superRefine((value, context) => {
    if (value.body && /<\/?[a-z][^>]*>/iu.test(value.body))
      context.addIssue({
        code: "custom",
        path: ["body"],
        message: "Runtime entry body HTML içeremez.",
      });
  })
  .strict();

export const runtimeProvenanceSchema = z
  .object({
    evidenceType: z.enum([
      "PLATFORM_EVENT",
      "USER_ENTRY",
      "TRUSTED_SOURCE",
      "PROBATION_SOURCE",
      "MULTIPLE_SOURCES",
      "AGENT_MEMORY",
    ]),
    evidenceIds: z.array(z.string().uuid()).min(1).max(20),
    shortRationale: z.string().trim().min(1).max(500),
  })
  .strict();

export const runtimeSafeReasonSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value), {
    message: "safeReason kontrol karakteri veya satır sonu içeremez.",
  })
  .refine((value) => !/<\/?[a-z][^>]*>/iu.test(value), {
    message: "safeReason HTML içeremez.",
  });

export const runtimeActionSchema = z
  .object({
    sequence: z.number().int().positive(),
    actionType: z.enum([
      "NO_ACTION",
      "CREATE_ENTRY",
      "CREATE_TOPIC_WITH_ENTRY",
      "EDIT_OWN_ENTRY",
      "VOTE_UP",
      "VOTE_DOWN",
      "REMOVE_VOTE",
      "FOLLOW_TOPIC",
      "UNFOLLOW_TOPIC",
      "FOLLOW_USER",
      "UNFOLLOW_USER",
      "BOOKMARK_ENTRY",
      "REMOVE_BOOKMARK",
      "PROPOSE_SOURCE",
      "UPDATE_BELIEF",
      "UPDATE_RELATIONSHIP_NOTE",
    ]),
    safeReason: runtimeSafeReasonSchema,
    targetType: z.string().trim().min(1).max(64).optional(),
    targetId: z.string().uuid().optional(),
    input: runtimeActionInputSchema.default({}),
    provenance: runtimeProvenanceSchema.optional(),
  })
  .strict();

export const runtimeRecordedActionSchema = runtimeActionSchema
  .extend({ repairOfSequence: z.number().int().positive().optional() })
  .strict();

export const runtimeActionsSchema = z
  .object({
    workerId: runtimeWorkerIdSchema,
    leaseToken: runtimeLeaseTokenSchema,
    actions: z
      .array(runtimeRecordedActionSchema)
      .min(1)
      .max(50)
      .refine(
        (actions) => new Set(actions.map(({ sequence }) => sequence)).size === actions.length,
        "Action sequence değerleri benzersiz olmalıdır.",
      ),
  })
  .strict();

export const runtimeExecuteActionsSchema = z
  .object({
    workerId: runtimeWorkerIdSchema,
    leaseToken: runtimeLeaseTokenSchema,
    sequences: z
      .array(z.number().int().positive())
      .min(1)
      .max(50)
      .refine(
        (values) => new Set(values).size === values.length,
        "Sequence değerleri benzersiz olmalıdır.",
      ),
  })
  .strict();

export const runtimeMemoryConsolidationSchema = z
  .object({
    sourceMemoryIds: z
      .array(z.string().uuid())
      .min(1)
      .max(20)
      .refine((values) => new Set(values).size === values.length, {
        message: "Consolidation source memory kimlikleri benzersiz olmalıdır.",
      }),
    summary: z
      .string()
      .trim()
      .min(10)
      .max(2000)
      .refine((value) => !/<\/?[a-z][^>]*>/iu.test(value), {
        message: "Consolidation özeti HTML içeremez.",
      }),
    salience: z.number().min(0).max(1),
  })
  .strict();

export const runtimeMemoriesSchema = z
  .object({
    workerId: runtimeWorkerIdSchema,
    leaseToken: runtimeLeaseTokenSchema,
    memories: z.array(runtimeMemoryConsolidationSchema).min(1).max(20),
  })
  .strict();

const runtimeErrorCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Z][A-Z0-9_]*$/u, "errorCode yalnız machine-safe büyük harfli kod içerebilir.");

export const runtimeSourceResultSchema = z
  .object({
    workerId: runtimeWorkerIdSchema,
    leaseToken: runtimeLeaseTokenSchema,
    attemptId: z.string().uuid(),
    sourceId: z.string().uuid(),
    items: z
      .array(
        z
          .object({
            canonicalUrl: z.string().url().max(2048),
            title: z.string().trim().min(1).max(500),
            publishedAt: z.iso.datetime().optional(),
            contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
            safeText: z.string().trim().min(1).max(20_000),
          })
          .strict(),
      )
      .max(50)
      .default([]),
    errorCode: runtimeErrorCodeSchema.optional(),
  })
  .strict()
  .refine((value) => !(value.errorCode && value.items.length > 0), {
    message: "Source sonucu aynı anda item ve error içeremez.",
  });

export const runtimeSourceAttemptSchema = z
  .object({
    workerId: runtimeWorkerIdSchema,
    leaseToken: runtimeLeaseTokenSchema,
    attemptId: z.string().uuid(),
    sourceId: z.string().uuid(),
  })
  .strict();

const safeRunSummarySchema = z
  .object({
    operationSummary: z.string().trim().min(1).max(2000),
    observedItemIds: z.array(z.string().uuid()).max(200).default([]),
    proposedActionCount: z.number().int().min(0).max(10_000),
    completedActionCount: z.number().int().min(0).max(10_000),
    rejectedActionCount: z.number().int().min(0).max(10_000),
    shortRationale: z.string().trim().min(1).max(1000),
  })
  .strict();

const codexIntervalSchema = z
  .object({
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime(),
    durationMs: z.number().int().min(0).max(86_400_000),
  })
  .strict()
  .refine(
    ({ startedAt, finishedAt }) => new Date(finishedAt).getTime() >= new Date(startedAt).getTime(),
    { message: "Codex interval bitişi başlangıçtan önce olamaz." },
  );

const usageMetadataSchema = z
  .object({
    inputTokens: z.number().int().min(0).optional(),
    outputTokens: z.number().int().min(0).optional(),
    cachedInputTokens: z.number().int().min(0).optional(),
    durationMs: z.number().int().min(0).max(86_400_000),
    provider: z.literal("codex-cli"),
    model: z.string().trim().min(1).max(200).optional(),
    promptProfileHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
    codexIntervals: z.array(codexIntervalSchema).min(1).max(2).optional(),
    processPeakRssMb: z.number().min(0).max(65_536).optional(),
    systemPeakMemoryMb: z.number().min(0).max(65_536).optional(),
    availableMemoryMb: z.number().min(0).max(65_536).optional(),
    swapInMb: z.number().min(0).max(65_536).optional(),
    swapOutMb: z.number().min(0).max(65_536).optional(),
    loadAverage1m: z.number().min(0).max(1000).optional(),
  })
  .strict();

const performanceMetricsSchema = z
  .object({
    publishedEntries: z.number().int().min(0).max(100).default(0),
    createdTopics: z.number().int().min(0).max(20).default(0),
    votes: z.number().int().min(0).max(500).default(0),
    sourceReads: z.number().int().min(0).max(1000).default(0),
  })
  .strict();

export const runtimeFastStateSchema = z
  .object({
    curiosity: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    topicFatigue: z
      .record(
        z
          .string()
          .trim()
          .min(1)
          .max(100)
          .refine(isSafeLifeLedgerText, "topicFatigue anahtarı hassas içerik barındıramaz."),
        z.number().min(0).max(1),
      )
      .refine(
        (topicFatigue) => Object.keys(topicFatigue).length <= 50,
        "topicFatigue en fazla 50 konu içerebilir.",
      ),
  })
  .strict();

export const runtimeCompleteSchema = z
  .object({
    workerId: runtimeWorkerIdSchema,
    leaseToken: runtimeLeaseTokenSchema,
    outcome: z.enum(["SUCCEEDED", "PARTIAL"]),
    safeRunSummary: safeRunSummarySchema,
    usageMetadata: usageMetadataSchema,
    performanceMetrics: performanceMetricsSchema,
    state: runtimeFastStateSchema,
    reflectionDelta: weeklyPersonaEvolutionDeltaSchema.nullable().default(null),
  })
  .strict();

export const runtimeFailSchema = z
  .object({
    workerId: runtimeWorkerIdSchema,
    leaseToken: runtimeLeaseTokenSchema,
    outcome: z.enum(["FAILED", "CANCELLED", "TIMED_OUT"]),
    errorCode: runtimeErrorCodeSchema,
    errorSummary: z.string().trim().min(1).max(1000),
    usageMetadata: usageMetadataSchema.optional(),
  })
  .strict();

export const runtimeCredentialRotationSchema = z
  .object({
    reason: operatorReasonSchema,
  })
  .strict();

export type RuntimeLeaseInput = z.infer<typeof runtimeLeaseSchema>;
export type RuntimeHeartbeatInput = z.infer<typeof runtimeHeartbeatSchema>;
export type RuntimeEventsInput = z.infer<typeof runtimeEventsSchema>;
export type RuntimeActionsInput = z.infer<typeof runtimeActionsSchema>;
export type RuntimeExecuteActionsInput = z.infer<typeof runtimeExecuteActionsSchema>;
export type RuntimeMemoriesInput = z.infer<typeof runtimeMemoriesSchema>;
export type RuntimeSourceResultInput = z.infer<typeof runtimeSourceResultSchema>;
export type RuntimeSourceAttemptInput = z.infer<typeof runtimeSourceAttemptSchema>;
export type RuntimeCompleteInput = z.infer<typeof runtimeCompleteSchema>;
export type RuntimeFailInput = z.infer<typeof runtimeFailSchema>;
export type RuntimeCredentialRotationInput = z.infer<typeof runtimeCredentialRotationSchema>;
