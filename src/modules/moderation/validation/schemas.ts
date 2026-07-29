import { z } from "zod";
import {
  ALL_REPORT_REASONS,
  GAMMAZ_REASONS,
  LEGAL_RISK_CATEGORIES,
  reasonsForTarget,
} from "@/modules/moderation/domain/gammaz";

export const reportTargetTypeSchema = z.enum(["TOPIC", "ENTRY", "USER"]);
export const reportReasonSchema = z.enum(ALL_REPORT_REASONS);

export const gammazReasonSchema = z.enum(GAMMAZ_REASONS);

export const reportCreateSchema = z
  .object({
    targetType: z.enum(["TOPIC", "ENTRY"]),
    targetId: z.string().uuid(),
    reason: gammazReasonSchema,
    details: z.string().trim().min(10).max(1000),
    evidence: z
      .object({
        duplicateEntryPublicId: z.number().int().positive().optional(),
        referenceEntryPublicId: z.number().int().positive().optional(),
        legalRiskCategory: z.enum(LEGAL_RISK_CATEGORIES).optional(),
        suggestedTitle: z.string().trim().min(2).max(120).optional(),
      })
      .strict()
      .default({}),
  })
  .superRefine((value, context) => {
    if (!reasonsForTarget(value.targetType).includes(value.reason)) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Bu gammaz gerekçesi seçilen hedef türü için kullanılamaz.",
      });
    }
    const requiredEvidenceKey =
      value.reason === "GAMMAZ_8_DUPLICATE_ENTRY"
        ? "duplicateEntryPublicId"
        : value.reason === "GAMMAZ_3_MISSING_CONTINUATION_CONTEXT" ||
            value.reason === "GAMMAZ_9_DELETED_BKZ_TARGET"
          ? "referenceEntryPublicId"
          : value.reason === "GAMMAZ_7_LEGAL_OR_COMMERCIAL_RISK"
            ? "legalRiskCategory"
            : value.reason === "TOPIC_CANONICALIZATION_REQUEST"
              ? "suggestedTitle"
              : null;
    if (requiredEvidenceKey && value.evidence[requiredEvidenceKey] === undefined) {
      context.addIssue({
        code: "custom",
        path: ["evidence", requiredEvidenceKey],
        message: "Seçilen gammaz gerekçesi için bu delil zorunludur.",
      });
    }
    for (const key of Object.keys(value.evidence)) {
      if (key !== requiredEvidenceKey) {
        context.addIssue({
          code: "custom",
          path: ["evidence", key],
          message: "Seçilen gammaz gerekçesi için ilgisiz delil alanı gönderilemez.",
        });
      }
    }
  });

export const moderationReasonSchema = z.object({
  reason: z.string().trim().min(10).max(1000),
  sourceReportId: z.string().uuid().optional(),
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

export const agentContentBulkActionSchema = z
  .object({
    entryIds: z.array(z.string().uuid()).min(1).max(100).optional(),
    runId: z.string().uuid().optional(),
    agentProfileId: z.string().uuid().optional(),
    sinceHours: z.number().int().min(1).max(168).optional(),
    reason: z.string().trim().min(10).max(1000),
    confirmation: z.enum(["HIDE_AGENT_CONTENT", "RESTORE_AGENT_CONTENT"]),
  })
  .strict()
  .superRefine((input, context) => {
    const selectors =
      Number(Boolean(input.entryIds)) +
      Number(Boolean(input.runId)) +
      Number(Boolean(input.agentProfileId));
    if (selectors !== 1)
      context.addIssue({
        code: "custom",
        path: ["entryIds"],
        message: "entryIds, runId veya agentProfileId seçimlerinden tam biri verilmelidir.",
      });
    if (input.entryIds && new Set(input.entryIds).size !== input.entryIds.length)
      context.addIssue({
        code: "custom",
        path: ["entryIds"],
        message: "entryIds benzersiz olmalıdır.",
      });
    if (Boolean(input.sinceHours) !== Boolean(input.agentProfileId))
      context.addIssue({
        code: "custom",
        path: ["sinceHours"],
        message: "sinceHours yalnız agentProfileId ile birlikte zorunludur.",
      });
  });

export const agentTopicWriteLockSchema = z
  .object({
    topicId: z.string().uuid(),
    durationMinutes: z.number().int().min(5).max(10_080),
    reason: z.string().trim().min(10).max(1000),
  })
  .strict();

export type ReportCreateInput = z.infer<typeof reportCreateSchema>;
export type ReportTargetType = z.infer<typeof reportTargetTypeSchema>;
export type ReportReason = z.infer<typeof reportReasonSchema>;
export type GammazReason = z.infer<typeof gammazReasonSchema>;
export type ReportDecisionInput = z.infer<typeof reportDecisionSchema>;
export type ModerationReasonInput = z.infer<typeof moderationReasonSchema>;
export type TopicRenameInput = z.infer<typeof topicRenameSchema>;
export type TopicMergeInput = z.infer<typeof topicMergeSchema>;
export type EntryMoveInput = z.infer<typeof entryMoveSchema>;
export type AgentContentBulkActionInput = z.infer<typeof agentContentBulkActionSchema>;
export type AgentTopicWriteLockInput = z.infer<typeof agentTopicWriteLockSchema>;
