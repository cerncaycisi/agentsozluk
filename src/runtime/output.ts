import { z } from "zod";
import { runtimeActionSchema, runtimeProvenanceSchema } from "@/modules/agents";

const uuidJsonPattern =
  "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$";

const observationSchema = z
  .object({
    subjectType: z.enum(["TOPIC", "ENTRY", "USER", "SOURCE"]),
    subjectId: z.string().uuid(),
    summary: z.string().trim().min(1).max(1000),
    salience: z.number().min(0).max(1),
    provenance: runtimeProvenanceSchema,
  })
  .strict();

export const runtimeDecisionSchema = z
  .object({
    state: z
      .object({
        curiosity: z.number().min(0).max(1),
        confidence: z.number().min(0).max(1),
        topicFatigue: z.record(z.string().max(100), z.number().min(0).max(1)),
      })
      .strict(),
    observations: z.array(observationSchema).max(100),
    actions: z.array(runtimeActionSchema).max(50),
    beliefDeltas: z
      .array(
        z
          .object({
            topicKey: z.string().trim().min(1).max(200),
            statement: z.string().trim().min(1).max(2000),
            confidence: z.number().min(0).max(1),
            evidenceSummary: z.string().trim().min(1).max(2000),
            provenance: runtimeProvenanceSchema,
          })
          .strict(),
      )
      .max(20),
    relationshipDeltas: z
      .array(
        z
          .object({
            userId: z.string().uuid(),
            familiarity: z.number().min(0).max(1),
            trust: z.number().min(0).max(1),
            interest: z.number().min(0).max(1),
            disagreement: z.number().min(0).max(1),
            summary: z.string().trim().min(1).max(2000),
            provenance: runtimeProvenanceSchema,
          })
          .strict(),
      )
      .max(20),
    sourceProposals: z
      .array(
        z
          .object({
            url: z.string().url().max(2048),
            sourceType: z.enum(["RSS", "ATOM", "HTML"]),
            topics: z.array(z.string().trim().min(2).max(100)).min(1).max(8),
            provenance: runtimeProvenanceSchema,
          })
          .strict(),
      )
      .max(10),
    memoryCandidates: z.array(observationSchema).max(50),
    safeRunSummary: z
      .object({
        operationSummary: z.string().trim().min(1).max(2000),
        observedItemIds: z.array(z.string().uuid()).max(200).default([]),
        shortRationale: z.string().trim().min(1).max(1000),
      })
      .strict(),
  })
  .superRefine((value, context) => {
    if (new Set(value.actions.map(({ sequence }) => sequence)).size !== value.actions.length)
      context.addIssue({
        code: "custom",
        path: ["actions"],
        message: "Action sequence değerleri benzersiz olmalıdır.",
      });
  })
  .strict();

export type RuntimeDecision = z.infer<typeof runtimeDecisionSchema>;

export function normalizeRuntimeDecisionOutput(output: unknown): unknown {
  if (!output || typeof output !== "object" || Array.isArray(output)) return output;
  const record = output as Record<string, unknown>;
  if (!Array.isArray(record.actions)) return output;
  return {
    ...record,
    actions: record.actions.map((action) => {
      if (!action || typeof action !== "object" || Array.isArray(action)) return action;
      const actionRecord = action as Record<string, unknown>;
      const input = actionRecord.input;
      return {
        ...Object.fromEntries(Object.entries(actionRecord).filter(([, value]) => value !== null)),
        input:
          input && typeof input === "object" && !Array.isArray(input)
            ? Object.fromEntries(
                Object.entries(input as Record<string, unknown>).filter(
                  ([, value]) => value !== null,
                ),
              )
            : input,
      };
    }),
  };
}

const provenanceJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["evidenceType", "evidenceIds", "shortRationale"],
  properties: {
    evidenceType: {
      type: "string",
      enum: [
        "PLATFORM_EVENT",
        "USER_ENTRY",
        "TRUSTED_SOURCE",
        "PROBATION_SOURCE",
        "MULTIPLE_SOURCES",
        "AGENT_MEMORY",
      ],
    },
    evidenceIds: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: { type: "string", pattern: uuidJsonPattern },
    },
    shortRationale: { type: "string", minLength: 1, maxLength: 500 },
  },
} as const;

const observationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["subjectType", "subjectId", "summary", "salience", "provenance"],
  properties: {
    subjectType: { type: "string", enum: ["TOPIC", "ENTRY", "USER", "SOURCE"] },
    subjectId: { type: "string", pattern: uuidJsonPattern },
    summary: { type: "string", minLength: 1, maxLength: 1000 },
    salience: { type: "number", minimum: 0, maximum: 1 },
    provenance: provenanceJsonSchema,
  },
} as const;

const nullableUuidJsonSchema = {
  anyOf: [{ type: "string", pattern: uuidJsonPattern }, { type: "null" }],
} as const;

const nullableProvenanceJsonSchema = {
  anyOf: [provenanceJsonSchema, { type: "null" }],
} as const;

export const runtimeDecisionJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "state",
    "observations",
    "actions",
    "beliefDeltas",
    "relationshipDeltas",
    "sourceProposals",
    "memoryCandidates",
    "safeRunSummary",
  ],
  properties: {
    state: {
      type: "object",
      additionalProperties: false,
      required: ["curiosity", "confidence", "topicFatigue"],
      properties: {
        curiosity: { type: "number", minimum: 0, maximum: 1 },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        topicFatigue: {
          type: "object",
          additionalProperties: false,
          properties: {},
        },
      },
    },
    observations: { type: "array", maxItems: 100, items: observationJsonSchema },
    actions: {
      type: "array",
      maxItems: 50,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sequence", "actionType", "targetType", "targetId", "input", "provenance"],
        properties: {
          sequence: { type: "integer", minimum: 1 },
          actionType: {
            type: "string",
            enum: [
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
            ],
          },
          targetType: { type: ["string", "null"], minLength: 1, maxLength: 64 },
          targetId: nullableUuidJsonSchema,
          input: {
            type: "object",
            additionalProperties: false,
            required: [
              "body",
              "title",
              "topicId",
              "entryId",
              "replyToEntryId",
              "provocationSignal",
              "userId",
              "username",
              "value",
              "url",
              "statement",
              "summary",
              "topicKey",
              "confidence",
              "familiarity",
              "trust",
              "interest",
              "disagreement",
              "sourceType",
              "topics",
            ],
            properties: {
              body: { type: ["string", "null"], minLength: 1, maxLength: 10_000 },
              title: { type: ["string", "null"], minLength: 2, maxLength: 120 },
              topicId: nullableUuidJsonSchema,
              entryId: nullableUuidJsonSchema,
              replyToEntryId: nullableUuidJsonSchema,
              provocationSignal: { type: ["number", "null"], minimum: 0, maximum: 1 },
              userId: nullableUuidJsonSchema,
              username: { type: ["string", "null"], pattern: "^[a-z0-9_]{3,30}$" },
              value: { enum: [-1, 1, null] },
              url: { type: ["string", "null"], maxLength: 2048 },
              statement: { type: ["string", "null"], minLength: 1, maxLength: 2000 },
              summary: { type: ["string", "null"], minLength: 1, maxLength: 2000 },
              topicKey: { type: ["string", "null"], minLength: 1, maxLength: 200 },
              confidence: { type: ["number", "null"], minimum: 0, maximum: 1 },
              familiarity: { type: ["number", "null"], minimum: 0, maximum: 1 },
              trust: { type: ["number", "null"], minimum: 0, maximum: 1 },
              interest: { type: ["number", "null"], minimum: 0, maximum: 1 },
              disagreement: { type: ["number", "null"], minimum: 0, maximum: 1 },
              sourceType: { enum: ["RSS", "ATOM", "HTML", null] },
              topics: {
                anyOf: [
                  {
                    type: "array",
                    minItems: 1,
                    maxItems: 8,
                    items: { type: "string", minLength: 2, maxLength: 100 },
                  },
                  { type: "null" },
                ],
              },
            },
          },
          provenance: nullableProvenanceJsonSchema,
        },
      },
    },
    beliefDeltas: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["topicKey", "statement", "confidence", "evidenceSummary", "provenance"],
        properties: {
          topicKey: { type: "string", minLength: 1, maxLength: 200 },
          statement: { type: "string", minLength: 1, maxLength: 2000 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          evidenceSummary: { type: "string", minLength: 1, maxLength: 2000 },
          provenance: provenanceJsonSchema,
        },
      },
    },
    relationshipDeltas: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "userId",
          "familiarity",
          "trust",
          "interest",
          "disagreement",
          "summary",
          "provenance",
        ],
        properties: {
          userId: { type: "string", pattern: uuidJsonPattern },
          familiarity: { type: "number", minimum: 0, maximum: 1 },
          trust: { type: "number", minimum: 0, maximum: 1 },
          interest: { type: "number", minimum: 0, maximum: 1 },
          disagreement: { type: "number", minimum: 0, maximum: 1 },
          summary: { type: "string", minLength: 1, maxLength: 2000 },
          provenance: provenanceJsonSchema,
        },
      },
    },
    sourceProposals: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["url", "sourceType", "topics", "provenance"],
        properties: {
          url: { type: "string", maxLength: 2048 },
          sourceType: { type: "string", enum: ["RSS", "ATOM", "HTML"] },
          topics: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: { type: "string", minLength: 2, maxLength: 100 },
          },
          provenance: provenanceJsonSchema,
        },
      },
    },
    memoryCandidates: { type: "array", maxItems: 50, items: observationJsonSchema },
    safeRunSummary: {
      type: "object",
      additionalProperties: false,
      required: ["operationSummary", "observedItemIds", "shortRationale"],
      properties: {
        operationSummary: { type: "string", minLength: 1, maxLength: 2000 },
        observedItemIds: {
          type: "array",
          maxItems: 200,
          items: { type: "string", pattern: uuidJsonPattern },
        },
        shortRationale: { type: "string", minLength: 1, maxLength: 1000 },
      },
    },
  },
};
