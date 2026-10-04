import { topicCanonicalSearchCandidates } from "@/modules/topics/domain/canonicalization";
import { createTopicSlug, normalizeTopicTitle } from "@/modules/topics/domain/normalization";

export function ukteTarget(title: string) {
  return {
    normalizedTitle: normalizeTopicTitle(title),
    targetKeys: topicCanonicalSearchCandidates(title).map((candidate) => candidate.normalizedQuery),
    // Yalnız eşleme anahtarıdır; Latin dışı bütün başlıklar tek "baslik" hedefine bağlanmaz.
    slug: createTopicSlug(title, ""),
  };
}
