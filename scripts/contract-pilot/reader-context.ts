import { z } from "zod";

// Bu dokuz çiftin sabit bağlam şekli. Yeni alan sessizce okuyucuya taşınmaz.
const scalar = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);
const fields = (keys: string) =>
  z
    .object(Object.fromEntries(keys.split(" ").map((key) => [key, scalar])))
    .strict()
    .partial();
const contextSchema = z
  .object({
    observedAt: z.string().optional(),
    recentEntries: z
      .array(
        z
          .object({
            id: z.string(),
            body: z.string(),
            createdAt: z.string(),
            topic: fields("id title"),
            author: fields("id username displayName publicBio"),
          })
          .strict(),
      )
      .optional(),
    purposes: z
      .array(
        fields(
          "id kind status version question completionCriterion createdAt expiresAt claimStatus lastReviewNote lastReviewedAt semanticAssessment targetAvailable targetId targetType topicKey",
        ),
      )
      .optional(),
    actionFeedback: z
      .array(
        fields(
          "actionCreatedAt actionId actionType channel eventKey executionStatus expiresAt observedAt policyVersion reason resultRecordedAt runId semanticAssessment",
        ),
      )
      .optional(),
    authorFeedback: z
      .array(
        fields("channel effect entryId expiresAt id observedAt purposeId question reason state"),
      )
      .optional(),
  })
  .strict();

export function readerPerception(value: unknown): Record<string, unknown> {
  const context = contextSchema.parse(value);
  return {
    ...context,
    ...(context.recentEntries
      ? {
          recentEntries: context.recentEntries.map(({ id, body, createdAt, topic }) => ({
            id,
            body,
            createdAt,
            topic,
          })),
        }
      : {}),
  };
}
