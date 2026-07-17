export interface SearchRankFactors {
  exact: boolean;
  prefix: boolean;
  similarity: number;
  recency: Date;
  id: string;
}

export function compareSearchRank(left: SearchRankFactors, right: SearchRankFactors): number {
  if (left.exact !== right.exact) return left.exact ? -1 : 1;
  if (left.prefix !== right.prefix) return left.prefix ? -1 : 1;
  if (left.similarity !== right.similarity) return right.similarity - left.similarity;
  const recency = right.recency.getTime() - left.recency.getTime();
  return recency === 0 ? left.id.localeCompare(right.id, "en") : recency;
}
