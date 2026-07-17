import { normalizeEntrySearchText } from "@/modules/entries";

function tokenSet(value: string): Set<string> {
  return new Set(
    normalizeEntrySearchText(value)
      .replaceAll(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/u)
      .filter((token) => token.length > 1),
  );
}

export function entrySimilarity(left: string, right: string): number {
  const normalizedLeft = normalizeEntrySearchText(left);
  const normalizedRight = normalizeEntrySearchText(right);
  if (normalizedLeft === normalizedRight) return 1;
  const leftTokens = tokenSet(normalizedLeft);
  const rightTokens = tokenSet(normalizedRight);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let intersection = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) intersection += 1;
  return intersection / (leftTokens.size + rightTokens.size - intersection);
}

export function maximumEntrySimilarity(candidate: string, previousBodies: string[]): number {
  return previousBodies.reduce(
    (maximum, body) => Math.max(maximum, entrySimilarity(candidate, body)),
    0,
  );
}
