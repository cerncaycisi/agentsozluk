import { describe, expect, it } from "vitest";
import {
  browsableTopicIds,
  browsableTopicMenu,
  selectInterestTopics,
} from "@/modules/agents/domain/runtime-browse";

/*
  linkedTopics algıda başlığı `topic` altında taşır. Menü ve sunucu allowlist'i aynı kaynaktan
  türediği için ikisi birlikte sınanır.
*/
describe("okuma menüsü", () => {
  const perception = {
    followedTopics: [{ id: "t-takip", title: "takip edilen" }],
    trendingTopics: [{ id: "t-gundem", title: "gündemdeki" }],
    newTopics: [{ id: "t-yeni", title: "yeni açılan" }],
    linkedTopics: [
      { topic: { id: "t-bkz", title: "bkz başlığı" }, thin: true, recentEntries: [] },
      { topic: { id: "t-takip", title: "takip edilen" }, thin: false, recentEntries: [] },
    ],
  };

  it("bkz başlıklarını algıdaki gerçek kayıt biçiminden alır", () => {
    expect(browsableTopicMenu(perception)).toEqual([
      { id: "t-takip", title: "takip edilen", hint: "takip" },
      { id: "t-gundem", title: "gündemdeki", hint: "gündem" },
      { id: "t-yeni", title: "yeni açılan", hint: "yeni" },
      { id: "t-bkz", title: "bkz başlığı", hint: "bkz" },
    ]);
  });

  it("sunucu allowlist'i menüyle birebir aynı kalır", () => {
    expect([...browsableTopicIds(perception)]).toEqual(["t-takip", "t-gundem", "t-yeni", "t-bkz"]);
  });

  it("biçimi bozuk bkz kaydını menüye sokmaz", () => {
    expect(
      browsableTopicMenu({ linkedTopics: [{ topic: "t-x" }, { topic: { id: "t-y" } }, null] }),
    ).toEqual([]);
  });

  it("dört aday havuzundan güncel ilgiye göre farklı ve tekrarsız keşif listeleri kurar", () => {
    const candidate = (id: string, title: string) => ({ id, title });
    const pool = {
      recentEntries: [
        { topic: candidate("film", "film ve diziler") },
        { topic: candidate("bağlaç", "masa ve sandalye") },
      ],
      topicChoiceSignals: { explorationTopics: [{ topic: candidate("müzik", "müziği anlamak") }] },
      linkedTopics: [
        { topic: candidate("kısmi", "gündelik işler") },
        { topic: candidate("film", "film ve diziler") },
      ],
      newTopics: [candidate("tam", "gündelik hayat"), candidate("yeni-müzik", "müzikal")],
    };
    expect(
      selectInterestTopics(pool, [
        { key: "gündelik hayat", weight: 0.8 },
        { key: "film ve diziler", weight: 0.2 },
      ]).map(({ id }) => id),
    ).toEqual(["tam", "kısmi", "film"]);
    expect(selectInterestTopics(pool, [{ key: "müzik", weight: 1 }]).map(({ id }) => id)).toEqual([
      "müzik",
      "yeni-müzik",
    ]);
    expect(selectInterestTopics(pool, [])).toEqual([]);
  });

  it("amaç, ilgi, takip, üç gündem, yeni ve bkz sırasını aynı izin listesinde tutar", () => {
    const topic = (id: string) => ({ id, title: id });
    const snapshot = {
      purposeTopics: [topic("amaç")],
      interestTopics: [topic("amaç"), topic("ilgi")],
      followedTopics: [topic("ilgi"), topic("takip")],
      trendingTopics: Array.from({ length: 8 }, (_, i) => topic(`gündem-${i}`)),
      newTopics: [topic("yeni")],
      linkedTopics: [{ topic: topic("bkz") }],
    };
    const menu = browsableTopicMenu(snapshot);
    expect(menu.map(({ hint }) => hint)).toEqual([
      "devam eden amaç",
      "ilgi",
      "takip",
      "gündem",
      "gündem",
      "gündem",
      "yeni",
      "bkz",
    ]);
    expect([...browsableTopicIds(snapshot)]).toEqual(menu.map(({ id }) => id));
    expect(browsableTopicIds(snapshot).has("ilgi")).toBe(true);
    expect(browsableTopicIds(snapshot).has("gündem-3")).toBe(false);
  });

  it("ilgi adayları çoğalsa da menü 24 ve ilgi bölümü 8 başlıkla sınırlı kalır", () => {
    const topics = Array.from({ length: 30 }, (_, i) => ({ id: `ilgi-${i}`, title: `film ${i}` }));
    expect(
      selectInterestTopics(
        {
          recentEntries: [],
          topicChoiceSignals: { explorationTopics: [] },
          linkedTopics: [],
          newTopics: topics,
        },
        [{ key: "film", weight: 1 }],
      ),
    ).toHaveLength(8);
    const menu = browsableTopicMenu({
      interestTopics: topics,
      followedTopics: topics.map(({ id, title }) => ({ id: `takip-${id}`, title })),
    });
    expect(menu).toHaveLength(24);
    expect(menu.filter(({ hint }) => hint === "ilgi")).toHaveLength(8);
  });
});
