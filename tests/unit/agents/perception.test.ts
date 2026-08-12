import { describe, expect, it } from "vitest";
import {
  buildTopicChoiceSignals,
  selectDiverseSourceItems,
  selectPerceptionEntries,
  truncateUntrustedText,
} from "@/modules/agents";

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

  it("interleaves source items instead of exhausting the first source", () => {
    expect(selectDiverseSourceItems([["a1", "a2", "a3"], ["b1", "b2"], ["c1"]], 5)).toEqual([
      "a1",
      "b1",
      "c1",
      "a2",
      "b2",
    ]);
  });

  it("surfaces repeated own-topic pressure and diverse exploration candidates", () => {
    const repeatedTopic = { id: "own-topic", title: "aynı başlık" };
    const writerOpenedTopic = { id: "writer-opened-topic", title: "başkasının sonradan yazdığı" };
    const otherTopic = { id: "other-topic", title: "başka yazarın başlığı" };
    const linkedTopic = { id: "linked-topic", title: "sözlük bağlantısı" };
    const signals = buildTopicChoiceSignals(
      [
        { topic: repeatedTopic, createdAt: "2026-07-17T11:50:00.000Z" },
        { topic: repeatedTopic, createdAt: "2026-07-17T11:40:00.000Z" },
        { topic: { id: "older-own", title: "eski başlık" }, createdAt: now },
      ],
      [
        { topic: repeatedTopic, createdAt: now, topicOpenedByCurrentWriter: true },
        { topic: writerOpenedTopic, createdAt: now, topicOpenedByCurrentWriter: true },
        { topic: otherTopic, createdAt: now },
      ],
      [
        { topic: linkedTopic, thin: true },
        { topic: otherTopic, thin: false },
      ],
      8,
    );

    expect(signals.consecutiveOwnTopic).toEqual({
      topic: repeatedTopic,
      consecutiveOwnEntryCount: 2,
    });
    expect(signals.explorationTopics).toEqual([
      { topic: otherTopic, signal: "OTHER_WRITER" },
      { topic: linkedTopic, signal: "DICTIONARY_LINK", thin: true },
    ]);
    expect(signals.recentOwnTopics).toEqual([
      {
        topic: repeatedTopic,
        recentEntryCount: 2,
        lastWrittenAt: "2026-07-17T11:50:00.000Z",
      },
      {
        topic: { id: "older-own", title: "eski başlık" },
        recentEntryCount: 1,
        lastWrittenAt: now.toISOString(),
      },
    ]);
  });
});
