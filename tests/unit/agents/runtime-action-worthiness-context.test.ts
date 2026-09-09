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

  it.each(["readTopics", "linkedTopics"])(
    "yalnız %s içinde bulunan oy hedefinin metnini ve başlığını taşır",
    (pool) => {
      const entry = {
        id: targetEntryId,
        body: "oyun değerlendirileceği gerçek metin",
        mine: false,
      };
      const other = { id: unrelatedId, body: "alakasız entry metni" };
      const topic = { id: targetTopicId, title: "okunan gerçek başlık" };
      const context =
        pool === "readTopics"
          ? { readTopics: [{ ...topic, entries: [entry, other] }] }
          : { linkedTopics: [{ topic, recentEntries: [entry, other] }] };
      const result = projectActionWorthinessPerception(context, [
        { actionType: "VOTE_DOWN", input: { entryId: targetEntryId }, evidenceIds: [] },
      ]);
      expect(result.relatedEntries).toEqual([{ ...entry, topic }]);
      expect(JSON.stringify(result)).not.toContain("alakasız entry metni");
    },
  );

  it("ayrı başlıktaki USER_ENTRY kanıtını da taşır, tüm havuzu açmaz", () => {
    const entry = { id: targetEntryId, body: "kanıt entrysi", topic: { id: unrelatedId } };
    const result = projectActionWorthinessPerception(
      { recentEntries: [entry, { id: unrelatedId, body: "kanıt gösterilmeyen metin" }] },
      [
        {
          actionType: "CREATE_ENTRY",
          input: { topicId: targetTopicId },
          evidenceType: "USER_ENTRY",
          evidenceIds: [targetEntryId],
        },
      ],
    );
    expect(result.relatedEntries).toEqual([entry]);
    expect(JSON.stringify(result)).not.toContain("kanıt gösterilmeyen metin");
  });

  it.each(["author", "authorId"])(
    "takip hedefinin sunulmuş yazısını %s kimliğiyle bulur",
    (shape) => {
      const entry = {
        id: targetEntryId,
        body: "yazarı takip etme gerekçesinin kanıtı",
        ...(shape === "author" ? { author: { id: targetUserId } } : { authorId: targetUserId }),
      };
      const result = projectActionWorthinessPerception(
        {
          followedWriterEntries: [
            entry,
            { id: unrelatedId, authorId: unrelatedId, body: "başka yazar" },
          ],
        },
        [{ actionType: "FOLLOW_USER", input: { userId: targetUserId }, evidenceIds: [] }],
      );
      expect(result.relatedEntries).toEqual([entry]);
      expect(JSON.stringify(result)).not.toContain("başka yazar");
    },
  );

  it("followedWriterEntries üst düzey topicId alanıyla hedef başlığı eşler", () => {
    const entry = { id: targetEntryId, topicId: targetTopicId, body: "başlıktaki son yazı" };
    expect(
      projectActionWorthinessPerception({ followedWriterEntries: [entry] }, [
        { actionType: "CREATE_ENTRY", input: { topicId: targetTopicId }, evidenceIds: [] },
      ]).relatedEntries,
    ).toEqual([entry]);
  });

  it("başka kanıt türünün kimliğini USER_ENTRY kanıtı gibi yorumlamaz", () => {
    expect(
      projectActionWorthinessPerception(
        { recentEntries: [{ id: targetEntryId, body: "yanlış türle seçilmemeli" }] },
        [
          {
            actionType: "CREATE_ENTRY",
            input: { topicId: targetTopicId },
            evidenceType: "MODEL_KNOWLEDGE",
            evidenceIds: [targetEntryId],
          },
        ],
      ),
    ).not.toHaveProperty("relatedEntries");
  });

  it("okunan hedef başlığın zaten taşınan metnini ikinci kez eklemez", () => {
    const topic = {
      id: targetTopicId,
      title: "hedef başlık",
      entries: [{ id: targetEntryId, body: "tam metin" }],
    };
    const result = projectActionWorthinessPerception({ readTopics: [topic] }, [
      {
        actionType: "CREATE_ENTRY",
        input: { topicId: targetTopicId },
        evidenceType: "USER_ENTRY",
        evidenceIds: [targetEntryId],
      },
    ]);
    expect(result.relatedTopics).toEqual([topic]);
    expect(result).not.toHaveProperty("relatedEntries");
  });

  it("kendi geçmişi ve readTopics içindeki aynı oy hedefini bir kez taşır", () => {
    const entry = {
      id: targetEntryId,
      body: "önceki kendi hükmüm",
      mine: true,
      topic: { id: targetTopicId },
    };
    const result = projectActionWorthinessPerception(
      {
        ownRecentEntries: [entry],
        readTopics: [{ id: targetTopicId, title: "başlık", entries: [entry] }],
      },
      [{ actionType: "EDIT_OWN_ENTRY", input: { entryId: targetEntryId }, evidenceIds: [] }],
    );
    expect(result.relatedEntries).toEqual([entry]);
  });

  it("tekilleştirme tam okunan gövdeyi önizlemeyle ezmez ve yazar bilgisini korur", () => {
    const preview = {
      id: targetEntryId,
      body: "kısa önizleme",
      author: { id: targetUserId, username: "yazar" },
      topic: { id: targetTopicId, title: "başlık" },
    };
    const full = { id: targetEntryId, body: "tam okunan ve daha güncel gövde", mine: false };
    const result = projectActionWorthinessPerception(
      {
        recentEntries: [preview],
        linkedTopics: [{ topic: { id: targetTopicId }, recentEntries: [preview] }],
        readTopics: [{ id: targetTopicId, title: "başlık", entries: [full] }],
      },
      [{ actionType: "VOTE_DOWN", input: { entryId: targetEntryId }, evidenceIds: [] }],
    );
    expect(result.relatedEntries).toEqual([{ ...preview, body: full.body, mine: false }]);
    expect(preview.body).toBe("kısa önizleme");
    expect(full).not.toHaveProperty("author");
  });

  it("daha kısa bir güncel okuma da eski uzun gövdenin önüne geçer", () => {
    const result = projectActionWorthinessPerception(
      {
        recentEntries: [{ id: targetEntryId, body: "artık geçersiz uzun eski gövde" }],
        readTopics: [{ id: targetTopicId, entries: [{ id: targetEntryId, body: "düzeltildi" }] }],
      },
      [{ actionType: "VOTE_UP", input: { entryId: targetEntryId }, evidenceIds: [] }],
    );
    expect(result.relatedEntries).toEqual([
      { id: targetEntryId, body: "düzeltildi", topic: { id: targetTopicId, title: undefined } },
    ]);
  });

  it.each([{}, { id: undefined, title: undefined }, { id: 42, title: [] }, { id: "", title: "" }])(
    "bozuk parent metadatası önceki gerçek başlık bilgisini ezmez: %j",
    (parent) => {
      const topic = { id: targetTopicId, title: "gerçek başlık" };
      const result = projectActionWorthinessPerception(
        {
          recentEntries: [{ id: targetEntryId, body: "önizleme", topic }],
          readTopics: [{ ...parent, entries: [{ id: targetEntryId, body: "tam gövde" }] }],
        },
        [{ actionType: "VOTE_UP", input: { entryId: targetEntryId }, evidenceIds: [] }],
      );
      expect(result.relatedEntries).toStrictEqual([
        { id: targetEntryId, body: "tam gövde", topic },
      ]);
      expect(JSON.parse(JSON.stringify(result)).relatedEntries[0].topic).toStrictEqual(topic);
    },
  );

  it("parent yalnız id taşıyorsa bilinen başlığın title alanını korur", () => {
    const topic = { id: targetTopicId, title: "gerçek başlık" };
    const result = projectActionWorthinessPerception(
      {
        recentEntries: [{ id: targetEntryId, body: "önizleme", topic }],
        readTopics: [{ id: targetTopicId, entries: [{ id: targetEntryId, body: "tam gövde" }] }],
      },
      [{ actionType: "VOTE_UP", input: { entryId: targetEntryId }, evidenceIds: [] }],
    );
    expect(result.relatedEntries).toStrictEqual([{ id: targetEntryId, body: "tam gövde", topic }]);
  });

  it("linked başlık hedeflendiğinde yalnız o başlığın sunulmuş entrylerini taşır", () => {
    const entries = [
      { id: targetEntryId, body: "birinci metin" },
      { id: citedItemId, body: "ikinci metin" },
    ];
    const topic = { id: targetTopicId, title: "hedef bağlantı" };
    const result = projectActionWorthinessPerception(
      {
        linkedTopics: [
          { topic, recentEntries: entries },
          {
            topic: { id: unrelatedId },
            recentEntries: [{ id: unrelatedId, body: "ilgisiz bağlantı" }],
          },
        ],
      },
      [{ actionType: "BOOKMARK_TOPIC", input: { topicId: targetTopicId }, evidenceIds: [] }],
    );
    expect(result.relatedEntries).toEqual(entries.map((entry) => ({ ...entry, topic })));
    expect(JSON.stringify(result)).not.toContain("ilgisiz bağlantı");
  });

  it("kimliği olmayan iki ilgili kaydı tek kayıt saymaz", () => {
    const entries = [
      { body: "ilk", authorId: targetUserId },
      { body: "ikinci", authorId: targetUserId },
    ];
    expect(
      projectActionWorthinessPerception({ recentEntries: entries }, [
        { actionType: "FOLLOW_USER", input: { userId: targetUserId }, evidenceIds: [] },
      ]).relatedEntries,
    ).toEqual(entries);
  });
});
