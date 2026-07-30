import type { SeedPersona } from "@/modules/agents/personas/schema";
import type { SourceReadItem } from "@/runtime/source-reader";

const DEFAULT_SOURCE_ITEM_LIMIT = 10;
const EXPLORATION_ITEM_LIMIT = 2;

const GENERIC_TOKENS = new Set([
  "aciklama",
  "alan",
  "bakis",
  "bilgi",
  "genel",
  "guncel",
  "gundem",
  "haber",
  "hakkinda",
  "icin",
  "ile",
  "olay",
  "olaylar",
  "olan",
  "olarak",
  "uzerine",
  "ve",
  "veya",
]);

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replaceAll(/\p{Mark}+/gu, "")
    .toLocaleLowerCase("tr-TR")
    .replaceAll(/[^a-z0-9]+/gu, " ")
    .replaceAll(/\s+/gu, " ")
    .trim();
}

function meaningfulTokens(value: string): string[] {
  return normalize(value)
    .split(" ")
    .filter((token) => token.length >= 4 && !GENERIC_TOKENS.has(token));
}

interface WeightedAffinity {
  phrase: string;
  tokens: string[];
  weight: number;
}

function affinityVocabulary(
  persona: SeedPersona | null,
  sourceTopics: readonly string[],
  recentTopicTitles: readonly string[],
): WeightedAffinity[] {
  const weights = new Map<string, number>();
  for (const interest of persona?.interests ?? []) {
    const phrase = normalize(interest.key);
    if (phrase) weights.set(phrase, Math.max(weights.get(phrase) ?? 0, interest.weight));
  }
  for (const topic of sourceTopics) {
    const phrase = normalize(topic);
    if (phrase) weights.set(phrase, Math.max(weights.get(phrase) ?? 0, 0.35));
  }
  for (const topic of recentTopicTitles) {
    const phrase = normalize(topic);
    if (phrase) weights.set(phrase, Math.max(weights.get(phrase) ?? 0, 0.45));
  }
  return [...weights.entries()]
    .map(([phrase, weight]) => ({
      phrase,
      tokens: meaningfulTokens(phrase),
      weight,
    }))
    .filter(({ tokens }) => tokens.length > 0);
}

function itemAffinity(item: SourceReadItem, vocabulary: readonly WeightedAffinity[]): number {
  const title = normalize(item.title);
  const text = normalize(`${item.title} ${item.safeText}`);
  return vocabulary.reduce((score, affinity) => {
    const phraseInTitle = affinity.phrase.length >= 4 && title.includes(affinity.phrase);
    const phraseInText = affinity.phrase.length >= 4 && text.includes(affinity.phrase);
    const titleMatches = affinity.tokens.filter((token) => title.includes(token)).length;
    const textMatches = affinity.tokens.filter((token) => text.includes(token)).length;
    return (
      score +
      (phraseInTitle ? affinity.weight * 4 : 0) +
      (phraseInText ? affinity.weight * 2 : 0) +
      titleMatches * affinity.weight * 1.5 +
      textMatches * affinity.weight * 0.5
    );
  }, 0);
}

/**
 * A broad feed remains useful for discovery, but it must not turn every unrelated
 * headline into writer memory. Keep the strongest writer-local matches and at
 * most two recent out-of-affinity items for serendipity.
 */
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

  const ranked = items
    .map((item, index) => ({ item, index, affinity: itemAffinity(item, vocabulary) }))
    .filter(({ affinity }) => affinity > 0)
    .sort((left, right) => right.affinity - left.affinity || left.index - right.index);
  const relevantLimit = Math.max(1, limit - Math.min(EXPLORATION_ITEM_LIMIT, limit - 1));
  const relevant = ranked.slice(0, relevantLimit);
  const selectedIndexes = new Set(relevant.map(({ index }) => index));
  const exploration = items
    .map((item, index) => ({ item, index }))
    .filter(({ index }) => !selectedIndexes.has(index))
    .slice(0, Math.min(EXPLORATION_ITEM_LIMIT, limit - relevant.length));

  return [...relevant, ...exploration]
    .sort((left, right) => left.index - right.index)
    .map(({ item }) => item);
}
