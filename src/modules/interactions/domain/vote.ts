export type VoteValue = -1 | 1;

export interface VoteCounters {
  upvoteCount: number;
  downvoteCount: number;
  score: number;
}

export function assertVoteValue(value: number): asserts value is VoteValue {
  if (value !== 1 && value !== -1) throw new Error("INVALID_VOTE");
}

export function transitionVote(
  counters: VoteCounters,
  previous: VoteValue | null,
  next: VoteValue | null,
): VoteCounters {
  const upvoteCount = counters.upvoteCount - (previous === 1 ? 1 : 0) + (next === 1 ? 1 : 0);
  const downvoteCount = counters.downvoteCount - (previous === -1 ? 1 : 0) + (next === -1 ? 1 : 0);

  if (upvoteCount < 0 || downvoteCount < 0) throw new Error("NEGATIVE_VOTE_COUNTER");

  return { upvoteCount, downvoteCount, score: upvoteCount - downvoteCount };
}
