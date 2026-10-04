import { z } from "zod";
import { isSafeLifeLedgerText } from "@/modules/agents/domain/life-ledger-safety";
import { rewardModes, authorFeedbackLimit } from "@/modules/agents/domain/rewards";
const safeText = z
  .string()
  .trim()
  .min(3)
  .max(500)
  .refine((text) => !/[\u0000-\u001f\u007f<>]/u.test(text) && isSafeLifeLedgerText(text));
export const issueAssessmentPacketSchema = z.union([
  z.object({ agentProfileId: z.string().uuid(), purposeId: z.string().uuid() }).strict(),
  z.object({ agentProfileId: z.string().uuid(), entryId: z.string().uuid() }).strict(),
]);
export const submitRewardAssessmentSchema = z
  .object({
    packetId: z.string().uuid(),
    nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
    packageHash: z.string().regex(/^[a-f0-9]{64}$/u),
    verdict: z.enum(["SUPPORTED", "INSUFFICIENT", "CORRECTIVE"]),
    independentReviewConfirmed: z.literal(true),
    reviewerModel: safeText.pipe(z.string().max(100)),
    reason: safeText,
  })
  .strict();
export const reverseRewardAssessmentSchema = z
  .object({
    assessmentId: z.string().uuid(),
    reason: safeText,
  })
  .strict();
export const rewardModeSchema = z
  .object({
    mode: z.enum(rewardModes),
    expectedMode: z.enum(rewardModes),
    reason: safeText,
  })
  .strict();
export type IssueAssessmentPacketInput = z.infer<typeof issueAssessmentPacketSchema>;
export type SubmitRewardAssessmentInput = z.infer<typeof submitRewardAssessmentSchema>;
export type ReverseRewardAssessmentInput = z.infer<typeof reverseRewardAssessmentSchema>;
export type RewardModeInput = z.infer<typeof rewardModeSchema>;

export const assessmentVisibilityChecksSchema = z
  .array(
    z
      .object({
        kind: z.enum(["ENTRY", "SOURCE_ITEM"]),
        id: z.string().uuid(),
        contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
      })
      .strict(),
  )
  .min(1)
  .max(20);
export const frozenFeedbackIdsSchema = z.array(z.string().uuid()).max(authorFeedbackLimit);
