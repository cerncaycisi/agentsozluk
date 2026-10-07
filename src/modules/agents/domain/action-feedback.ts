import type { RuntimeActionsInput } from "@/modules/agents/validation/runtime-schemas";

// P3 ilk sonuç kanalı: yalnız commit edilmiş teknik sonuç. Kalite/ödül değildir.
export const actionFeedbackKey = "actionFeedback";
export const actionFeedbackLimit = 5;
export const actionFeedbackWindowMs = 7 * 24 * 60 * 60 * 1000;
export const actionFeedbackPolicyVersion = 1;
export const actionFeedbackStatuses = ["SUCCEEDED", "REJECTED", "FAILED", "SKIPPED"] as const;

const knownRejectionReasons = {
  DUPLICATE_SIMILARITY: "SIMILARITY_REVIEW_REQUIRED",
  DUPLICATE_FRAMING: "FRAMING_REVIEW_REQUIRED",
  TOPIC_SEMANTIC_REPETITION: "TOPIC_NOVELTY_REVIEW_REQUIRED",
  TOPIC_EXISTS_UNREAD: "TOPIC_EXISTS_READ_FIRST",
  TOPIC_EXISTS_WRITE_AS_ENTRY: "TOPIC_EXISTS_WRITE_AS_ENTRY",
  TOPIC_NOT_READ: "TOPIC_EXISTS_READ_FIRST",
  TOPIC_CHANGED_SINCE_READ: "TOPIC_CHANGED_READ_AGAIN",
} as const;

interface ActionFeedbackRecord {
  id: string;
  runId: string;
  actionType: RuntimeActionsInput["actions"][number]["actionType"];
  actionStatus: unknown;
  rejectionCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function projectActionFeedback(records: readonly ActionFeedbackRecord[], now: Date) {
  return records
    .flatMap((record) => {
      // Prisma where filtresi dönüş tipini daraltmaz; domain sınırı da kapalı kalsın.
      const status = actionFeedbackStatuses.find((value) => value === record.actionStatus);
      if (!status || record.actionType === "NO_ACTION") return [];
      return [
        {
          eventKey: `ACTION_RESULT:${record.id}`,
          actionId: record.id,
          runId: record.runId,
          channel: "EXECUTION" as const,
          policyVersion: actionFeedbackPolicyVersion,
          actionType: record.actionType,
          executionStatus: status,
          reason:
            status === "REJECTED" &&
            record.rejectionCode !== null &&
            Object.hasOwn(knownRejectionReasons, record.rejectionCode)
              ? knownRejectionReasons[record.rejectionCode as keyof typeof knownRejectionReasons]
              : null,
          semanticAssessment: "NOT_EVALUATED" as const,
          actionCreatedAt: record.createdAt.toISOString(),
          resultRecordedAt: record.updatedAt.toISOString(),
          expiresAt: new Date(record.createdAt.getTime() + actionFeedbackWindowMs).toISOString(),
          observedAt: now.toISOString(),
        },
      ];
    })
    .slice(0, actionFeedbackLimit);
}
