export interface WeightedInterest {
  key: string;
  weight: number;
}

const stopWords = new Set([
  "ve",
  "ile",
  "veya",
  "yahut",
  "ya",
  "da",
  "de",
  "için",
  "gibi",
  "bir",
  "bu",
  "şu",
  "o",
  "ki",
  "mi",
  "mı",
  "mu",
  "mü",
  "ama",
  "fakat",
  "ancak",
  "en",
  "çok",
  "daha",
  "az",
  "hem",
  "her",
  "hiç",
  "kadar",
  "göre",
  "diye",
  "ise",
  "bile",
  "sadece",
  "yalnız",
  "olan",
  "olarak",
  "olmak",
  "üzere",
  "üzerine",
  "hakkında",
  "arasında",
  "sonra",
  "önce",
]);

function words(value: string): string[] {
  return (
    value
      .normalize("NFKC")
      .toLocaleLowerCase("tr-TR")
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

export function interestTokens(value: string): string[] {
  return [...new Set(words(value).filter((word) => word.length >= 3 && !stopWords.has(word)))];
}

function matchesInterest(word: string, root: string): boolean {
  if (word === root) return true;
  if (root.length < 4) return false;
  if (word.startsWith(root)) return true;
  // Ünlüyle başlayan ek öncesi yumuşama: müzik → müziği, kitap → kitabı.
  const softened = ({ p: "b", ç: "c", t: "d", k: "ğ" } as Record<string, string>)[root.at(-1)!];
  if (!softened) return false;
  const stem = `${root.slice(0, -1)}${softened}`;
  return word.startsWith(stem) && /^[aeıioöuü]/u.test(word.slice(stem.length));
}

/** Metindeki tekrarlar puanı artırmaz; çok parçalı ilgi eşleştiği oranda ağırlık alır. */
export function createInterestScorer(interests: readonly WeightedInterest[]) {
  const vocabulary = interests.map(({ key, weight }) => ({ tokens: interestTokens(key), weight }));
  return (text: string): number => {
    const textWords = words(text);
    return vocabulary.reduce((score, { tokens, weight }) => {
      if (tokens.length === 0) return score;
      const matches = tokens.filter((root) =>
        textWords.some((word) => matchesInterest(word, root)),
      );
      return score + (weight * matches.length) / tokens.length;
    }, 0);
  };
}

/** İlk yarı ilgili adaylardan, kalan yerler verilen dönüşüm sırasından gelir. */
export function selectWithInterestRotation<T>(
  candidates: readonly T[],
  limit: number,
  score: (candidate: T) => number,
): T[] {
  if (!Number.isInteger(limit) || limit < 0) throw new RangeError("limit negatif olamaz.");
  const ranked = candidates
    .map((candidate, index) => ({ candidate, index, interest: score(candidate) }))
    .filter(({ interest }) => interest > 0)
    .sort((left, right) => right.interest - left.interest || left.index - right.index)
    .slice(0, Math.ceil(limit / 2));
  const chosen = new Set(ranked.map(({ index }) => index));
  return [
    ...ranked.map(({ candidate }) => candidate),
    ...candidates.filter((_, index) => !chosen.has(index)),
  ].slice(0, limit);
}
