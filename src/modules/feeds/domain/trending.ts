export interface TrendMetrics {
  activeEntryCount: number;
  uniqueAuthorCount: number;
  positiveVotes: number;
  negativeVotes: number;
  hoursSinceLastActiveEntry: number;
}

export function calculateTrendScore(metrics: TrendMetrics): number {
  const recency = Math.max(0, 24 - Math.floor(Math.max(0, metrics.hoursSinceLastActiveEntry)));
  return (
    metrics.activeEntryCount * 5 +
    metrics.uniqueAuthorCount * 8 +
    metrics.positiveVotes * 2 -
    metrics.negativeVotes +
    recency
  );
}
