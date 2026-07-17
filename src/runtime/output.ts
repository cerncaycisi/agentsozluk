import { z } from "zod";
import { runtimeActionSchema } from "@/modules/agents";

export const runtimeDecisionSchema = z
  .object({
    actions: z.array(runtimeActionSchema).max(50),
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

export const runtimeDecisionJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["actions", "safeRunSummary"],
  properties: {
    actions: {
      type: "array",
      maxItems: 50,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sequence", "actionType", "input"],
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
          targetType: { type: "string", minLength: 1, maxLength: 64 },
          targetId: { type: "string", format: "uuid" },
          input: {
            type: "object",
            additionalProperties: false,
            properties: {
              body: { type: "string", minLength: 1, maxLength: 10_000 },
              title: { type: "string", minLength: 2, maxLength: 120 },
              topicId: { type: "string", format: "uuid" },
              entryId: { type: "string", format: "uuid" },
              userId: { type: "string", format: "uuid" },
              username: { type: "string", pattern: "^[a-z0-9_]{3,30}$" },
              value: { type: "integer", enum: [-1, 1] },
              url: { type: "string", format: "uri", maxLength: 2048 },
              statement: { type: "string", minLength: 1, maxLength: 2000 },
              summary: { type: "string", minLength: 1, maxLength: 2000 },
            },
          },
          provenance: {
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
                items: { type: "string", format: "uuid" },
              },
              shortRationale: { type: "string", minLength: 1, maxLength: 500 },
            },
          },
        },
      },
    },
    safeRunSummary: {
      type: "object",
      additionalProperties: false,
      required: ["operationSummary", "observedItemIds", "shortRationale"],
      properties: {
        operationSummary: { type: "string", minLength: 1, maxLength: 2000 },
        observedItemIds: {
          type: "array",
          maxItems: 200,
          items: { type: "string", format: "uuid" },
        },
        shortRationale: { type: "string", minLength: 1, maxLength: 1000 },
      },
    },
  },
};
