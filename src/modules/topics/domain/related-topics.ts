/*
  İLGİLİ BAŞLIKLAR — Gökhan kararı, 17 Ekim 2026: "Yalnız emin olunanlar".

  Başlık sayfasının altında en çok üç ilgili başlık bağlantısı gösterilir; yalnız yüksek
  güvenli olanlar. Hiçbiri yoksa blok hiç çizilmez.

  Üretimde ölçüm (20 dolu başlık, 109 aday çift, iki kör hakem):
  - A, başlık trigram benzerliği tek başına: %30–33 ilgili.
  - C, Türkçe tam metin içerik benzerliği tek başına: %45–52 ilgili.
  - İkisinin birlikte önerdiği çiftler: %91–100 ilgili (dolu başlıkların ~%40'ı en az birini alır).

  Bağlantı = (yazarın kendi bkz'si, uygun bir başlığa) ∪ (A ilk 3 ∩ C ilk 3). Önce bkz'ler yazıldığı
  sırayla, sonra kesişim C sırasıyla; tekrar atılır, en çok üç. Kaynağın kendisi ve uygun olmayan
  (aktif değil, birleşmiş ya da ince) başlık hiçbir yoldan girmez.
*/

export const RELATED_TOPIC_LIMIT = 3;
/** A ve C'nin her biri en çok bu kadar aday önerir; kesişim bunların arasından alınır. */
export const RELATED_TOPIC_SIGNAL_TOP = 3;

export type RelatedTopicLinkSource = "BKZ" | "SIGNAL";

export interface RelatedTopicCandidates {
  topicId: string;
  /** Yazarların bkz bağlarının çözüldüğü başlıklar, entry'lerde ilk geçiş sırasıyla. */
  bkzTargetIds: readonly string[];
  /** A: başlık trigram benzerliği sırasıyla en benzer başlıklar. */
  titleSignalIds: readonly string[];
  /** C: içerik benzerliği (`ts_rank_cd`) sırasıyla en benzer başlıklar. */
  contentSignalIds: readonly string[];
}

export interface PlannedRelatedTopicLink {
  relatedTopicId: string;
  /** 1'den başlar; sayfa bu sırayla gösterir. */
  rank: number;
  source: RelatedTopicLinkSource;
}

export function planRelatedTopicLinks(
  candidates: RelatedTopicCandidates,
  isEligible: (topicId: string) => boolean,
): PlannedRelatedTopicLink[] {
  const seen = new Set<string>([candidates.topicId]);
  const links: PlannedRelatedTopicLink[] = [];
  const add = (relatedTopicId: string, source: RelatedTopicLinkSource) => {
    if (links.length >= RELATED_TOPIC_LIMIT) return;
    if (seen.has(relatedTopicId) || !isEligible(relatedTopicId)) return;
    seen.add(relatedTopicId);
    links.push({ relatedTopicId, rank: links.length + 1, source });
  };
  for (const id of candidates.bkzTargetIds) add(id, "BKZ");
  const titleTop = new Set(candidates.titleSignalIds.slice(0, RELATED_TOPIC_SIGNAL_TOP));
  for (const id of candidates.contentSignalIds.slice(0, RELATED_TOPIC_SIGNAL_TOP)) {
    if (titleTop.has(id)) add(id, "SIGNAL");
  }
  return links;
}

export interface RelatedTopicPlanSummary {
  sourceTopics: number;
  topicsWithLinks: number;
  bkzLinks: number;
  signalLinks: number;
  totalLinks: number;
}

export function summarizeRelatedTopicPlan(
  sourceTopics: number,
  plans: ReadonlyMap<string, readonly PlannedRelatedTopicLink[]>,
): RelatedTopicPlanSummary {
  let topicsWithLinks = 0;
  let bkzLinks = 0;
  let signalLinks = 0;
  for (const links of plans.values()) {
    if (links.length > 0) topicsWithLinks += 1;
    for (const link of links) {
      if (link.source === "BKZ") bkzLinks += 1;
      else signalLinks += 1;
    }
  }
  return {
    sourceTopics,
    topicsWithLinks,
    bkzLinks,
    signalLinks,
    totalLinks: bkzLinks + signalLinks,
  };
}
