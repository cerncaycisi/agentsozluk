import type { RuntimeActionsInput } from "@/modules/agents/validation/runtime-schemas";
import {
  istanbulQuotaDay,
  readProperNounCapRejectionDetail,
} from "@/modules/agents/domain/topic-creation-cap";

// P3 ilk sonuç kanalı: yalnız commit edilmiş teknik sonuç. Kalite/ödül değildir.
export const actionFeedbackKey = "actionFeedback";
export const actionFeedbackLimit = 5;
export const actionFeedbackWindowMs = 7 * 24 * 60 * 60 * 1000;
export const actionFeedbackPolicyVersion = 1;
export const actionFeedbackStatuses = ["SUCCEEDED", "REJECTED", "FAILED", "SKIPPED"] as const;

const knownRejectionReasons = {
  DUPLICATE_SIMILARITY: "SIMILARITY_REVIEW_REQUIRED",
  DUPLICATE_FRAMING: "FRAMING_REVIEW_REQUIRED",
  STOCK_FRAMING_PART_OF: "FRAMING_REVIEW_REQUIRED",
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
  validationResult?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

/*
  Özel adlı başlık tavanı (17 Ekim) genel `TOPIC_CREATION_DISABLED` ayar kapatmasından ayrı
  anlatılır (Astra tavan 1. tur P2). Kart yalnız kota günü bugünün İstanbul günüyse güvenli
  neden ve kota gününü taşır; dünkü tavan bugün geçerli olmadığından eski kart nötr kalır.
  Genel ayar kapatması eskisi gibi neden taşımaz.
*/
const properNounDailyCapReason = "PROPER_NOUN_DAILY_CAP_USE_EXISTING_OR_CONCEPT";

function currentProperNounCap(record: ActionFeedbackRecord, now: Date) {
  if (record.rejectionCode !== "TOPIC_CREATION_DISABLED") return null;
  const detail = readProperNounCapRejectionDetail(record.validationResult);
  return detail && detail.quotaDay === istanbulQuotaDay(now) ? detail : null;
}

/*
  Donmuş perception aynı koşunun sonraki bağlam isteğinde yeniden sunulur; koşu İstanbul gece
  yarısını aşarsa dünkü tavan kartı yeni günde geçerli değildir (Astra tavan 2. tur P2). Kart
  yalnız daralır: neden nötrleşir ve kota günü düşer, başka alan değişmez.
*/
export function refreshFrozenActionFeedback(cards: unknown, now: Date): unknown {
  if (!Array.isArray(cards)) return cards;
  const today = istanbulQuotaDay(now);
  return cards.map((card: unknown) => {
    if (typeof card !== "object" || card === null) return card;
    const { quotaDay, ...rest } = card as Record<string, unknown>;
    if (rest.reason !== properNounDailyCapReason || quotaDay === today) return card;
    return { ...rest, reason: null };
  });
}

export function projectActionFeedback(records: readonly ActionFeedbackRecord[], now: Date) {
  return records
    .flatMap((record) => {
      // Prisma where filtresi dönüş tipini daraltmaz; domain sınırı da kapalı kalsın.
      const status = actionFeedbackStatuses.find((value) => value === record.actionStatus);
      if (!status || record.actionType === "NO_ACTION") return [];
      const properNounCap = status === "REJECTED" ? currentProperNounCap(record, now) : null;
      if (properNounCap)
        return [
          {
            ...actionFeedbackCard(record, status, now, properNounDailyCapReason),
            quotaDay: properNounCap.quotaDay,
          },
        ];
      return [
        actionFeedbackCard(
          record,
          status,
          now,
          status === "REJECTED" &&
            record.rejectionCode !== null &&
            Object.hasOwn(knownRejectionReasons, record.rejectionCode)
            ? knownRejectionReasons[record.rejectionCode as keyof typeof knownRejectionReasons]
            : null,
        ),
      ];
    })
    .slice(0, actionFeedbackLimit);
}

function actionFeedbackCard(
  record: ActionFeedbackRecord,
  status: (typeof actionFeedbackStatuses)[number],
  now: Date,
  reason: string | null,
) {
  return {
    eventKey: `ACTION_RESULT:${record.id}`,
    actionId: record.id,
    runId: record.runId,
    channel: "EXECUTION" as const,
    policyVersion: actionFeedbackPolicyVersion,
    actionType: record.actionType,
    executionStatus: status,
    reason,
    semanticAssessment: "NOT_EVALUATED" as const,
    actionCreatedAt: record.createdAt.toISOString(),
    resultRecordedAt: record.updatedAt.toISOString(),
    expiresAt: new Date(record.createdAt.getTime() + actionFeedbackWindowMs).toISOString(),
    observedAt: now.toISOString(),
  };
}
