// P3 ilk sonuç kanalı: yalnız commit edilmiş teknik sonuç. Kalite/ödül değildir.
export const actionFeedbackLimit = 5;
export const actionFeedbackWindowMs = 7 * 24 * 60 * 60 * 1000;
export const actionFeedbackPolicyVersion = 1;

const knownRejectionReasons = {
  DUPLICATE_SIMILARITY: "SIMILARITY_REVIEW_REQUIRED",
  DUPLICATE_FRAMING: "FRAMING_REVIEW_REQUIRED",
  TOPIC_SEMANTIC_REPETITION: "TOPIC_NOVELTY_REVIEW_REQUIRED",
} as const;

interface ActionFeedbackRecord {
  id: string;
  runId: string;
  actionType: string;
  actionStatus: string;
  rejectionCode: string | null;
  updatedAt: Date;
}

export function projectActionFeedback(records: readonly ActionFeedbackRecord[], now: Date) {
  return records.slice(0, actionFeedbackLimit).map((record) => ({
    eventKey: `ACTION_RESULT:${record.id}`,
    actionId: record.id,
    runId: record.runId,
    channel: "EXECUTION" as const,
    policyVersion: actionFeedbackPolicyVersion,
    actionType: record.actionType,
    executionStatus: record.actionStatus,
    reason:
      record.actionStatus === "REJECTED" &&
      record.rejectionCode !== null &&
      Object.hasOwn(knownRejectionReasons, record.rejectionCode)
        ? knownRejectionReasons[record.rejectionCode as keyof typeof knownRejectionReasons]
        : null,
    semanticAssessment: "NOT_EVALUATED" as const,
    recordedAt: record.updatedAt.toISOString(),
    expiresAt: new Date(record.updatedAt.getTime() + actionFeedbackWindowMs).toISOString(),
    observedAt: now.toISOString(),
  }));
}
