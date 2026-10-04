import type { TransactionClient } from "@/lib/db/types";
import {
  assessmentContentHash,
  assessmentEntryVisibilityHash,
  authorFeedbackKey,
  authorFeedbackLimit,
  rewardObject as object,
} from "@/modules/agents/domain/rewards";
import {
  assessmentVisibilityChecksSchema,
  frozenFeedbackIdsSchema,
} from "@/modules/agents/validation/reward-schemas";
import { findPurposeTopicRecords } from "@/modules/agents/repository/purposes";
import * as records from "@/modules/agents/repository/rewards";

export interface AuthorFeedbackCard {
  id: string;
  channel: "INTRINSIC" | "QUALITY";
  state: "SUPPORTED" | "INSUFFICIENT" | "CORRECTIVE" | "REVERSED";
  effect: "PURPOSE_FULFILLED" | "QUALITY_RECORDED" | "NONE";
  reason: string;
  purposeId: string | null;
  entryId: string | null;
  question: string | null;
  observedAt: string;
  expiresAt: string;
}

export function frozenAuthorFeedbackIds(perception: unknown): string[] | undefined {
  if (!perception || typeof perception !== "object" || Array.isArray(perception)) return undefined;
  const rows = object(perception)[authorFeedbackKey];
  const parsed = frozenFeedbackIdsSchema.safeParse(
    Array.isArray(rows) ? rows.map((row) => object(row).id) : [],
  );
  return parsed.success ? parsed.data : [];
}

// Çağıran runtime transaction'ı kendi profile/lease/ayar kilitlerini tutar.
export async function runtimeAuthorFeedback(
  tx: TransactionClient,
  agentProfileId: string,
  now: Date,
  frozenIds?: readonly string[],
): Promise<AuthorFeedbackCard[]> {
  if ((await records.getRewardMode(tx)) !== "FULFILL_SLOT" || frozenIds?.length === 0) return [];
  const assessments = await records.findAuthorFeedbackAssessments(
    tx,
    agentProfileId,
    now,
    frozenIds,
  );
  // Görünürlük okumaları kart başına değil, en çok 12 aday için tek toplu küme.
  const checksById = new Map(
    assessments.flatMap((assessment) => {
      if (assessment.reversal) return [];
      const parsed = assessmentVisibilityChecksSchema.safeParse(
        object(assessment.evidenceSnapshot).visibilityChecks,
      );
      return parsed.success ? [[assessment.id, parsed.data] as const] : [];
    }),
  );
  const allChecks = [...checksById.values()].flat();
  const entryIds = [
    ...new Set(allChecks.filter((check) => check.kind === "ENTRY").map((check) => check.id)),
  ];
  const sourceIds = [
    ...new Set(allChecks.filter((check) => check.kind === "SOURCE_ITEM").map((check) => check.id)),
  ];
  const topicIds = [
    ...new Set(
      assessments.flatMap((assessment) =>
        !assessment.reversal && assessment.purpose?.targetType === "TOPIC"
          ? [assessment.purpose.targetId]
          : [],
      ),
    ),
  ];
  const [entries, sources, topics] = await Promise.all([
    entryIds.length ? records.findAssessmentEntries(tx, entryIds) : [],
    sourceIds.length ? records.findAssessmentSourceItems(tx, agentProfileId, sourceIds, now) : [],
    topicIds.length ? findPurposeTopicRecords(tx, topicIds) : [],
  ]);
  const visibleTopics = new Set(topics.map((topic) => topic.id));
  const current = new Map([
    ...entries.map((entry) => [`ENTRY:${entry.id}`, assessmentEntryVisibilityHash(entry)] as const),
    ...sources.map(
      (source) =>
        [
          `SOURCE_ITEM:${source.id}`,
          assessmentContentHash(`${source.title}\n${source.safeText}\n${source.canonicalUrl}`),
        ] as const,
    ),
  ]);
  const seenOrigins = new Set<string>();
  const cards: AuthorFeedbackCard[] = [];
  for (const assessment of assessments) {
    // En yeni köken kaydı elenirse daha eski olumlu kayda geri düşülmez.
    if (seenOrigins.has(assessment.sourceActKey)) continue;
    seenOrigins.add(assessment.sourceActKey);
    const state = (["SUPPORTED", "INSUFFICIENT", "CORRECTIVE"] as const).find(
      (value) => value === assessment.verdict,
    );
    if (!state) continue;
    const base = {
      id: assessment.id,
      channel: assessment.channel,
      observedAt: assessment.createdAt.toISOString(),
      expiresAt: assessment.expiresAt.toISOString(),
    };
    if (assessment.reversal) {
      // Yalnız daha önce gösterilmiş kararı düzelt; yeni TTL veya yeni kredi açma.
      if (
        !(await records.hasPresentedAssessment(
          tx,
          agentProfileId,
          assessment.id,
          assessment.createdAt,
        ))
      )
        continue;
      cards.push({
        ...base,
        state: "REVERSED",
        effect: "NONE",
        reason:
          "Önceki bağımsız değerlendirme geri alındı; başarı veya kusur kanıtı olarak kullanma.",
        purposeId: null,
        entryId: null,
        question: null,
      });
    } else {
      // Eski snapshot'ta görünürlük dayanağı yoksa yeni runtime kartı uydurma.
      const checks = checksById.get(assessment.id);
      if (
        !checks ||
        checks.some((check) => current.get(`${check.kind}:${check.id}`) !== check.contentHash)
      )
        continue;
      if (
        assessment.purpose?.targetType === "TOPIC" &&
        !visibleTopics.has(assessment.purpose.targetId)
      )
        continue;
      cards.push({
        ...base,
        state,
        effect: assessment.applied
          ? assessment.channel === "INTRINSIC"
            ? "PURPOSE_FULFILLED"
            : "QUALITY_RECORDED"
          : "NONE",
        reason: assessment.reason,
        purposeId: assessment.purposeId,
        entryId: assessment.entryId,
        question: assessment.purpose?.question ?? null,
      });
    }
    if (cards.length === authorFeedbackLimit) break;
  }
  return cards;
}

export function presentedFeedbackAssessmentIds(perception: Record<string, unknown>): string[] {
  const rows = perception[authorFeedbackKey];
  if (!Array.isArray(rows)) return [];
  const parsed = frozenFeedbackIdsSchema.safeParse(
    rows.filter((row) => object(row).state !== "REVERSED").map((row) => object(row).id),
  );
  return parsed.success ? parsed.data : [];
}
