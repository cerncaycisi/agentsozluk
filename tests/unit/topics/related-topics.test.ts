import { describe, expect, it } from "vitest";
import {
  planRelatedTopicLinks,
  summarizeRelatedTopicPlan,
} from "@/modules/topics/domain/related-topics";

/*
  İlgili başlıklar (Gökhan kararı, 17 Ekim 2026: "Yalnız emin olunanlar"): bkz ∪ (A ilk 3 ∩ C ilk 3),
  önce bkz, tekrar yok, en çok üç; kaynağın kendisi ve uygun olmayan başlık hiçbir yoldan girmez.
*/

const eligible = (ids: string[]) => {
  const set = new Set(ids);
  return (id: string) => set.has(id);
};
const all = eligible(["k", "a", "b", "c", "d", "e", "f", "g"]);

describe("planRelatedTopicLinks", () => {
  it("yalnız iki sinyalin kesişimini C sırasıyla alır", () => {
    expect(
      planRelatedTopicLinks(
        {
          topicId: "k",
          bkzTargetIds: [],
          titleSignalIds: ["a", "b", "c"],
          contentSignalIds: ["c", "d", "a"],
        },
        all,
      ),
    ).toEqual([
      { relatedTopicId: "c", rank: 1, source: "SIGNAL" },
      { relatedTopicId: "a", rank: 2, source: "SIGNAL" },
    ]);
  });

  it("tek sinyalin önerdiği başlık girmez; kesişim boşsa liste boştur", () => {
    expect(
      planRelatedTopicLinks(
        {
          topicId: "k",
          bkzTargetIds: [],
          titleSignalIds: ["a", "b"],
          contentSignalIds: ["c", "d"],
        },
        all,
      ),
    ).toEqual([]);
  });

  it("ilk üçün dışındaki A ya da C adayı kesişime girmez", () => {
    expect(
      planRelatedTopicLinks(
        {
          topicId: "k",
          bkzTargetIds: [],
          titleSignalIds: ["a", "b", "c", "d"],
          contentSignalIds: ["e", "f", "g", "d"],
        },
        all,
      ),
    ).toEqual([]);
  });

  it("önce bkz'ler yazılış sırasıyla, sonra sinyal; tekrar atılır, en çok üç", () => {
    expect(
      planRelatedTopicLinks(
        {
          topicId: "k",
          bkzTargetIds: ["d", "a", "d"],
          titleSignalIds: ["a", "b", "c"],
          contentSignalIds: ["a", "b", "c"],
        },
        all,
      ),
    ).toEqual([
      { relatedTopicId: "d", rank: 1, source: "BKZ" },
      { relatedTopicId: "a", rank: 2, source: "BKZ" },
      { relatedTopicId: "b", rank: 3, source: "SIGNAL" },
    ]);
  });

  it("dörtten fazla bkz de üçte kesilir", () => {
    const links = planRelatedTopicLinks(
      {
        topicId: "k",
        bkzTargetIds: ["a", "b", "c", "d", "e"],
        titleSignalIds: ["f"],
        contentSignalIds: ["f"],
      },
      all,
    );
    expect(links.map((link) => link.relatedTopicId)).toEqual(["a", "b", "c"]);
    expect(links.every((link) => link.source === "BKZ")).toBe(true);
  });

  it("kaynağın kendisi ve uygun olmayan başlık hiçbir yoldan girmez", () => {
    expect(
      planRelatedTopicLinks(
        {
          topicId: "k",
          bkzTargetIds: ["k", "ince", "a"],
          titleSignalIds: ["k", "birlesmis", "b"],
          contentSignalIds: ["birlesmis", "k", "b"],
        },
        eligible(["k", "a", "b"]),
      ),
    ).toEqual([
      { relatedTopicId: "a", rank: 1, source: "BKZ" },
      { relatedTopicId: "b", rank: 2, source: "SIGNAL" },
    ]);
  });
});

describe("summarizeRelatedTopicPlan", () => {
  it("bağlantı sayılarını kaynağa göre ayırır", () => {
    const plans = new Map([
      [
        "k",
        planRelatedTopicLinks(
          { topicId: "k", bkzTargetIds: ["a"], titleSignalIds: ["b"], contentSignalIds: ["b"] },
          all,
        ),
      ],
      ["bos", []],
      [
        "a",
        planRelatedTopicLinks(
          { topicId: "a", bkzTargetIds: [], titleSignalIds: ["c"], contentSignalIds: ["c"] },
          all,
        ),
      ],
    ]);
    expect(summarizeRelatedTopicPlan(10, plans)).toEqual({
      sourceTopics: 10,
      topicsWithLinks: 2,
      bkzLinks: 1,
      signalLinks: 2,
      totalLinks: 3,
    });
  });
});
