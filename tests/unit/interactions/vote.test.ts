import { describe, expect, it } from "vitest";
import { assertVoteValue, transitionVote } from "@/modules/interactions/domain/vote";
import { voteSchema } from "@/modules/interactions/validation/schemas";

describe("vote state transitions", () => {
  it("creates, changes and removes a vote while preserving the score invariant", () => {
    const initial = { upvoteCount: 0, downvoteCount: 0, score: 0 };
    const upvoted = transitionVote(initial, null, 1);
    expect(upvoted).toEqual({ upvoteCount: 1, downvoteCount: 0, score: 1 });

    const downvoted = transitionVote(upvoted, 1, -1);
    expect(downvoted).toEqual({ upvoteCount: 0, downvoteCount: 1, score: -1 });

    expect(transitionVote(downvoted, -1, null)).toEqual(initial);
  });

  it("keeps the same vote idempotent", () => {
    const state = { upvoteCount: 3, downvoteCount: 1, score: 2 };
    expect(transitionVote(state, 1, 1)).toEqual(state);
  });

  it("rejects invalid values and negative counters", () => {
    expect(() => assertVoteValue(0)).toThrow("INVALID_VOTE");
    expect(() => transitionVote({ upvoteCount: 0, downvoteCount: 0, score: 0 }, 1, null)).toThrow(
      "NEGATIVE_VOTE_COUNTER",
    );
  });

  it("accepts only the two API vote values", () => {
    expect(voteSchema.parse({ value: 1 })).toEqual({ value: 1 });
    expect(voteSchema.parse({ value: -1 })).toEqual({ value: -1 });
    expect(voteSchema.safeParse({ value: 0 }).success).toBe(false);
  });
});
