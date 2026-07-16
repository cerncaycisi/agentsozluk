import { z } from "zod";

export const reportTargetTypeSchema = z.enum(["TOPIC", "ENTRY", "USER"]);
export const reportReasonSchema = z.enum([
  "SPAM",
  "HARASSMENT",
  "HATE",
  "ILLEGAL_CONTENT",
  "PERSONAL_DATA",
  "COPYRIGHT",
  "OFF_TOPIC",
  "OTHER",
]);

export const reportCreateSchema = z
  .object({
    targetType: reportTargetTypeSchema,
    targetId: z.string().uuid(),
    reason: reportReasonSchema,
    details: z.string().trim().max(1000).optional(),
  })
  .superRefine((value, context) => {
    if (value.reason === "OTHER" && (!value.details || value.details.length < 10)) {
      context.addIssue({
        code: "custom",
        path: ["details"],
        message: "Diğer gerekçesi için 10–1000 karakter açıklama zorunludur.",
      });
    }
  });

export const moderationReasonSchema = z.object({
  reason: z.string().trim().min(10).max(1000),
});

export const reportDecisionSchema = z.object({
  resolutionNote: z.string().trim().min(10).max(1000),
});

export const topicRenameSchema = moderationReasonSchema.extend({
  title: z.string().trim().min(2).max(120),
});

export const topicMergeSchema = moderationReasonSchema.extend({
  targetTopicId: z.string().uuid(),
});

export const entryMoveSchema = moderationReasonSchema.extend({
  targetTopicId: z.string().uuid(),
});

export type ReportCreateInput = z.infer<typeof reportCreateSchema>;
export type ReportDecisionInput = z.infer<typeof reportDecisionSchema>;
export type ModerationReasonInput = z.infer<typeof moderationReasonSchema>;
export type TopicRenameInput = z.infer<typeof topicRenameSchema>;
export type TopicMergeInput = z.infer<typeof topicMergeSchema>;
export type EntryMoveInput = z.infer<typeof entryMoveSchema>;
