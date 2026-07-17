import { z } from "zod";

export const runtimeWorkerIdSchema = z
  .string()
  .min(3)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/u, "Worker kimliği yalnız güvenli karakterler içerebilir.");

export const runtimeLeaseSchema = z
  .object({
    workerId: runtimeWorkerIdSchema,
    leaseSeconds: z.number().int().min(15).max(300).default(60),
  })
  .strict();

export const runtimeHeartbeatSchema = z
  .object({
    runId: z.string().uuid(),
    workerId: runtimeWorkerIdSchema,
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

export const runtimeEventsSchema = z
  .object({
    workerId: runtimeWorkerIdSchema,
    events: z
      .array(
        z
          .object({
            eventType: z.string().trim().min(1).max(100),
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
    targetType: z.string().trim().min(1).max(64).optional(),
    targetId: z.string().uuid().optional(),
    input: runtimeActionInputSchema.default({}),
    provenance: runtimeProvenanceSchema.optional(),
  })
  .strict();

export const runtimeActionsSchema = z
  .object({
    workerId: runtimeWorkerIdSchema,
    actions: z
      .array(runtimeActionSchema)
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

export const runtimeMemoryCandidateSchema = z
  .object({
    subjectType: z.enum(["TOPIC", "ENTRY", "USER", "SOURCE"]),
    subjectId: z.string().uuid(),
    summary: z.string().trim().min(1).max(1000),
    salience: z.number().min(0).max(1),
    provenance: runtimeProvenanceSchema,
  })
  .strict();

export const runtimeMemoriesSchema = z
  .object({
    workerId: runtimeWorkerIdSchema,
    memories: z.array(runtimeMemoryCandidateSchema).min(1).max(50),
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

const usageMetadataSchema = z
  .object({
    inputTokens: z.number().int().min(0).optional(),
    outputTokens: z.number().int().min(0).optional(),
    cachedInputTokens: z.number().int().min(0).optional(),
    durationMs: z.number().int().min(0).max(86_400_000),
    provider: z.literal("codex-cli"),
    model: z.string().trim().min(1).max(200).optional(),
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

export const runtimeCompleteSchema = z
  .object({
    workerId: runtimeWorkerIdSchema,
    outcome: z.enum(["SUCCEEDED", "PARTIAL"]),
    safeRunSummary: safeRunSummarySchema,
    usageMetadata: usageMetadataSchema,
    performanceMetrics: performanceMetricsSchema,
  })
  .strict();

export const runtimeFailSchema = z
  .object({
    workerId: runtimeWorkerIdSchema,
    outcome: z.enum(["FAILED", "CANCELLED", "TIMED_OUT"]),
    errorCode: z.string().trim().min(1).max(100),
    errorSummary: z.string().trim().min(1).max(1000),
    usageMetadata: usageMetadataSchema.optional(),
  })
  .strict();

export const runtimeCredentialRotationSchema = z
  .object({
    reason: z.string().trim().min(10).max(1000),
  })
  .strict();

export type RuntimeLeaseInput = z.infer<typeof runtimeLeaseSchema>;
export type RuntimeHeartbeatInput = z.infer<typeof runtimeHeartbeatSchema>;
export type RuntimeEventsInput = z.infer<typeof runtimeEventsSchema>;
export type RuntimeActionsInput = z.infer<typeof runtimeActionsSchema>;
export type RuntimeExecuteActionsInput = z.infer<typeof runtimeExecuteActionsSchema>;
export type RuntimeMemoriesInput = z.infer<typeof runtimeMemoriesSchema>;
export type RuntimeCompleteInput = z.infer<typeof runtimeCompleteSchema>;
export type RuntimeFailInput = z.infer<typeof runtimeFailSchema>;
export type RuntimeCredentialRotationInput = z.infer<typeof runtimeCredentialRotationSchema>;
