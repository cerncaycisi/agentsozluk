import { createHash } from "node:crypto";

export interface PerceptionEntryCandidate {
  id: string;
  body: string;
  createdAt: Date;
  score: number;
  topic: { id: string; title: string };
  author: { id: string; username: string; displayName: string };
  followedTopic: boolean;
  followedAuthor: boolean;
}

function deterministicTieBreak(seed: string, id: string): number {
  return Number.parseInt(
    createHash("sha256").update(`${seed}:${id}`).digest("hex").slice(0, 8),
    16,
  );
}

export function selectPerceptionEntries(
  candidates: PerceptionEntryCandidate[],
  input: {
    seed: string;
    interests: Array<{ key: string; weight: number }>;
    limit: number;
    now: Date;
  },
): PerceptionEntryCandidate[] {
  const interestWeights = input.interests.map(({ key, weight }) => ({
    tokens: key.toLocaleLowerCase("tr-TR").split(/\s+/u),
    weight,
  }));
  return [...candidates]
    .map((candidate) => {
      const text = `${candidate.topic.title} ${candidate.body}`.toLocaleLowerCase("tr-TR");
      const interest = interestWeights.reduce(
        (sum, item) => sum + (item.tokens.some((token) => text.includes(token)) ? item.weight : 0),
        0,
      );
      const ageHours = Math.max(0, input.now.getTime() - candidate.createdAt.getTime()) / 3_600_000;
      const recency = 1 / (1 + ageHours / 12);
      const rank =
        interest * 4 +
        recency * 2 +
        (candidate.followedTopic ? 1.5 : 0) +
        (candidate.followedAuthor ? 1.5 : 0) +
        Math.min(1, Math.max(-1, candidate.score / 10)) * 0.25;
      return { candidate, rank, tie: deterministicTieBreak(input.seed, candidate.id) };
    })
    .sort((left, right) => right.rank - left.rank || left.tie - right.tie)
    .slice(0, input.limit)
    .map(({ candidate }) => candidate);
}

export function truncateUntrustedText(value: string, maximum = 1200): string {
  const normalized = value.normalize("NFKC").replaceAll(/\s+/gu, " ").trim();
  return normalized.length <= maximum ? normalized : `${normalized.slice(0, maximum - 1)}…`;
}
