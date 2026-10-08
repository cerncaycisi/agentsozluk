import {
  createInterestScorer,
  interestTokens,
  type WeightedInterest,
} from "@/modules/agents/domain/interest-matching";
import type { SeedPersona } from "@/modules/agents/personas/schema";
import type { SourceReadItem } from "@/runtime/source-reader";

const DEFAULT_SOURCE_ITEM_LIMIT = 10;
const EXPLORATION_ITEM_LIMIT = 2;

function affinityVocabulary(
  persona: SeedPersona | null,
  sourceTopics: readonly string[],
  recentTopicTitles: readonly string[],
): WeightedInterest[] {
  const weights = new Map<string, number>();
  for (const interest of persona?.interests ?? []) {
    const phrase = interest.key.normalize("NFKC").toLocaleLowerCase("tr-TR");
    if (phrase) weights.set(phrase, Math.max(weights.get(phrase) ?? 0, interest.weight));
  }
  for (const topic of sourceTopics) {
    const phrase = topic.normalize("NFKC").toLocaleLowerCase("tr-TR");
    if (phrase) weights.set(phrase, Math.max(weights.get(phrase) ?? 0, 0.35));
  }
  for (const topic of recentTopicTitles) {
    const phrase = topic.normalize("NFKC").toLocaleLowerCase("tr-TR");
    if (phrase) weights.set(phrase, Math.max(weights.get(phrase) ?? 0, 0.45));
  }
  return [...weights.entries()]
    .map(([key, weight]) => ({ key, weight }))
    .filter(({ key }) => interestTokens(key).length > 0);
}

/** İlgili öğeler öne gelir; mevcut sınırlı tesadüfi keşif payı korunur. */
export function selectSourceReadItemsForPersona(
  items: readonly SourceReadItem[],
  input: {
    persona: SeedPersona | null;
    sourceTopics: readonly string[];
    recentTopicTitles?: readonly string[];
    limit?: number;
  },
): SourceReadItem[] {
  const limit = input.limit ?? DEFAULT_SOURCE_ITEM_LIMIT;
  if (!Number.isInteger(limit) || limit < 1)
    throw new RangeError("Source item limiti pozitif olmalı.");
  if (items.length === 0) return [];
  const vocabulary = affinityVocabulary(
    input.persona,
    input.sourceTopics,
    input.recentTopicTitles ?? [],
  );
  if (vocabulary.length === 0) return items.slice(0, limit);

  const score = createInterestScorer(vocabulary);
  const personaScore = createInterestScorer(input.persona?.interests ?? []);
  const ranked = items
    .map((item, index) => ({
      item,
      index,
      interest: personaScore(item.title) * 2 + personaScore(`${item.title} ${item.safeText}`),
      affinity: score(item.title) * 2 + score(`${item.title} ${item.safeText}`),
    }))
    .filter(({ affinity }) => affinity > 0)
    .sort(
      (left, right) =>
        right.interest - left.interest ||
        right.affinity - left.affinity ||
        left.index - right.index,
    );
  const relevantLimit = Math.max(1, limit - Math.min(EXPLORATION_ITEM_LIMIT, limit - 1));
  const relevant = ranked.slice(0, relevantLimit);
  const selectedIndexes = new Set(relevant.map(({ index }) => index));
  const exploration = items
    .map((item, index) => ({ item, index }))
    .filter(({ index }) => !selectedIndexes.has(index))
    .slice(0, Math.min(EXPLORATION_ITEM_LIMIT, limit - relevant.length));

  return [...relevant, ...exploration].map(({ item }) => item);
}
