import { describe, expect, it } from "vitest";
import {
  projectActionWorthinessPerception,
  runtimeActionWorthinessAlwaysKeptKeys,
} from "@/modules/agents/domain/runtime-action-worthiness-context";

/*
  ACTION_WORTHINESS koşunun son fazı ve 11 timeout'un 10'u tam orada kesiliyor
  (4 Eylül ölçümü). Çözüm fazı ucuzlatmak, ama "perception'ı sil" değil: AW
  adayları elemek için hedefin gerçek metnine, ilişki durumuna ve kanıtına
  ihtiyaç duyuyor; tümden silinirse ikinci bir eleştirmen olmaktan çıkıp ilk
  modelin özetini onaylayan bir self-review'a döner.

  Bu testler iki tarafı birden tutuyor: gereksiz yığın GİTMELİ, karara giren
  bilgi KALMALI.
*/
const targetEntryId = "11111111-1111-4111-8111-111111111111";
const targetTopicId = "22222222-2222-4222-8222-222222222222";
const targetUserId = "33333333-3333-4333-8333-333333333333";
const citedItemId = "44444444-4444-4444-8444-444444444444";
const unrelatedId = "55555555-5555-4555-8555-555555555555";

const perception = {
  observedAt: "2026-09-04T10:00:00.000Z",
  limits: { maxActions: 4 },
  behaviorLessons: [{ lesson: "Aynı başlığa mekanik oy verme." }],
  duplicateCandidate: { title: "benzer başlık" },
  recentEntries: [
    { id: targetEntryId, body: "hedef entry metni", topic: { id: targetTopicId } },
    { id: unrelatedId, body: "alakasız entry", topic: { id: unrelatedId } },
  ],
  trendingTopics: [{ id: targetTopicId, title: "hedef başlık" }, { id: unrelatedId }],
  newTopics: [{ id: unrelatedId }],
  relationships: [{ targetUserId, summary: "önceki tartışma" }, { targetUserId: unrelatedId }],
  sourceItems: [
    { itemId: citedItemId, title: "gösterilen kaynak" },
    { itemId: unrelatedId, title: "gösterilmeyen kaynak" },
  ],
  memories: [{ id: unrelatedId }],
  beliefs: [{ id: unrelatedId }],
  sources: [{ id: unrelatedId }],
  dictionaryLinkCandidates: [{ title: "alakasız aday" }],
};

const candidates = [
  {
    sequence: 1,
    actionType: "CREATE_ENTRY",
    input: { topicId: targetTopicId, replyToEntryId: targetEntryId },
    evidenceIds: [citedItemId],
  },
  { sequence: 2, actionType: "FOLLOW_USER", input: { userId: targetUserId }, evidenceIds: [] },
];

describe("ACTION_WORTHINESS daraltılmış perception", () => {
  const projected = projectActionWorthinessPerception(perception, candidates);

  it("karara giren dar alanları her zaman taşır", () => {
    for (const key of runtimeActionWorthinessAlwaysKeptKeys) expect(projected).toHaveProperty(key);
  });

  it("yalnız adayın KENDİ hedefini taşır", () => {
    expect(projected.relatedEntries).toEqual([
      { id: targetEntryId, body: "hedef entry metni", topic: { id: targetTopicId } },
    ]);
    expect(projected.relatedTopics).toEqual([{ id: targetTopicId, title: "hedef başlık" }]);
    expect(projected.relatedRelationships).toEqual([{ targetUserId, summary: "önceki tartışma" }]);
  });

  it("yalnız adayın kanıt gösterdiği kaynak öğesini taşır", () => {
    /*
      Kanıt kimlikleri taşınmasaydı AW "bu kaynak bu iddiayı destekliyor mu"
      sorusunu semantik tahminle cevaplardı.
    */
    expect(projected.citedSourceItems).toEqual([
      { itemId: citedItemId, title: "gösterilen kaynak" },
    ]);
  });

  it("genel havuzları taşımaz — asıl kazanç burada", () => {
    for (const key of [
      "recentEntries",
      "trendingTopics",
      "newTopics",
      "relationships",
      "sourceItems",
      "memories",
      "beliefs",
      "sources",
      "dictionaryLinkCandidates",
    ])
      expect(projected).not.toHaveProperty(key);
  });

  it("alakasız kimlikleri hiçbir alanda sızdırmaz", () => {
    expect(JSON.stringify(projected)).not.toContain(unrelatedId);
  });

  it("aday yoksa yalnız dar alanlar kalır", () => {
    const empty = projectActionWorthinessPerception(perception, []);
    expect(Object.keys(empty).sort()).toEqual([...runtimeActionWorthinessAlwaysKeptKeys].sort());
  });

  it("bozuk girdide çökmez", () => {
    for (const value of [null, undefined, "metin", 42, []])
      expect(() => projectActionWorthinessPerception(value, candidates)).not.toThrow();
  });
});
