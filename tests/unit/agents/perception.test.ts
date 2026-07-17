import { describe, expect, it } from "vitest";
import { selectPerceptionEntries, truncateUntrustedText } from "@/modules/agents";

const now = new Date("2026-07-17T12:00:00.000Z");

function candidate(id: string, title: string, followedTopic = false) {
  return {
    id,
    body: `${title} hakkında görünür içerik`,
    createdAt: new Date("2026-07-17T11:00:00.000Z"),
    score: 0,
    topic: { id, title },
    author: { id, username: `user_${id}`, displayName: title },
    followedTopic,
    followedAuthor: false,
  };
}

describe("runtime perception selection", () => {
  it("is deterministic and ranks followed or persona-relevant entries", () => {
    const candidates = [
      candidate("00000000-0000-4000-8000-000000000001", "rastgele konu"),
      candidate("00000000-0000-4000-8000-000000000002", "yapay zeka"),
      candidate("00000000-0000-4000-8000-000000000003", "takip edilen", true),
    ];
    const input = {
      seed: "run-seed",
      interests: [{ key: "yapay zeka", weight: 1 }],
      limit: 2,
      now,
    };
    const first = selectPerceptionEntries(candidates, input);
    const replay = selectPerceptionEntries(candidates, input);
    expect(first.map(({ id }) => id)).toEqual(replay.map(({ id }) => id));
    expect(first.map(({ id }) => id)).toEqual([
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
    ]);
  });

  it("normalizes and bounds untrusted text", () => {
    expect(truncateUntrustedText("  talimat\n  gibi   görünen veri  ", 21)).toBe(
      "talimat gibi görünen…",
    );
  });
});
