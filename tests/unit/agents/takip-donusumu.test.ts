import { describe, expect, it } from "vitest";
import {
  followedTopicPerceptionLimit,
  selectFollowedTopicsForPerception,
} from "@/modules/agents/domain/followed-topic-selection";

const topics = Array.from({ length: 30 }, (_, index) => ({
  id: `topic-${String(index).padStart(2, "0")}`,
  entryCount24h: 30 - index,
}));
const runId = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

describe("takip edilen başlıkların dönüşümlü seçimi", () => {
  it("aynı koşuda deterministik, sekizle sınırlı", () => {
    const first = selectFollowedTopicsForPerception(topics, [], runId(1));
    expect(first).toHaveLength(followedTopicPerceptionLimit);
    expect(selectFollowedTopicsForPerception(topics, [], runId(1))).toEqual(first);
  });

  it("en hareketli başlıkları her koşuda başa taşımaz", () => {
    const busiest = topics.slice(0, 8).map(({ id }) => id);
    const hits = Array.from({ length: 200 }, (_, index) =>
      selectFollowedTopicsForPerception(topics, [], runId(index)).filter(({ id }) =>
        busiest.includes(id),
      ),
    ).reduce((sum, picked) => sum + picked.length, 0);
    // Rastgele seçimde beklenen 200 × 8 × 8/30 ≈ 427; eski sıralama 1600 verirdi.
    expect(hits).toBeLessThan(600);
  });

  it("uzun takip listesinin tamamı zamanla görünür", () => {
    const seen = new Set(
      Array.from({ length: 100 }, (_, index) =>
        selectFollowedTopicsForPerception(topics, [], runId(index)).map(({ id }) => id),
      ).flat(),
    );
    expect(seen.size).toBe(topics.length);
  });

  it("yazarın son yazdığı başlıkları sona iter ama yer varsa gösterir", () => {
    const recent = topics.slice(0, 25).map(({ id }) => id);
    for (let index = 0; index < 50; index += 1) {
      const picked = selectFollowedTopicsForPerception(topics, recent, runId(index)).map(
        ({ id }) => id,
      );
      expect(picked.slice(0, 5).sort()).toEqual(topics.slice(25).map(({ id }) => id));
      expect(picked.slice(5).every((id) => recent.includes(id))).toBe(true);
    }
  });

  it("sekizden az takipte hepsini döndürür", () => {
    expect(selectFollowedTopicsForPerception(topics.slice(0, 3), [], runId(7))).toHaveLength(3);
  });
});
