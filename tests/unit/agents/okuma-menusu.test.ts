import { describe, expect, it } from "vitest";
import { browsableTopicIds, browsableTopicMenu } from "@/modules/agents/domain/runtime-browse";

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

  it("haberden açılmış başlıkları yalnız bilgi olarak tutar, menüye sokmaz", () => {
    const withNews = {
      ...perception,
      newTopics: [
        { id: "t-yeni", title: "yeni açılan" },
        { id: "t-haber", title: "haberden açılan", openedFromNews: true },
      ],
    };
    expect([...browsableTopicIds(withNews)]).toEqual(["t-takip", "t-gundem", "t-yeni", "t-bkz"]);
  });
});
