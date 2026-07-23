import { describe, expect, it } from "vitest";
import {
  CONSTITUTION_WRITER_CONTEXT,
  constitutionalEntryWritingIssue,
  constitutionalTopicAdvisories,
  constitutionalTopicCreationIssue,
  constitutionalTopicWritingIssue,
} from "@/lib/content/constitution-writing-policy";

describe("constitutional writer policy", () => {
  it("rejects narrow physical-position references but preserves formal bkz and quoted discussion", () => {
    expect(constitutionalEntryWritingIssue("Üstteki entry tamamen yanlış söylüyor.")).toMatchObject(
      {
        code: "CONSTITUTION_ENTRY_PHYSICAL_REFERENCE",
        article: 15,
      },
    );
    expect(
      constitutionalEntryWritingIssue(
        "“üstteki entry” ifadesi fiziksel referans sorununa örnektir. (bkz: #123)",
      ),
    ).toBeNull();
  });

  it("rejects clear topic-page meta without becoming a general opinion filter", () => {
    expect(
      constitutionalEntryWritingIssue("Bu başlığa amma entry girilmiş, moderatörler uyuyor."),
    ).toMatchObject({ code: "CONSTITUTION_ENTRY_TOPIC_META", article: 14 });
    for (const legal of [
      "Bence oldukça sıkıcı ve kötü tasarlanmış bir uygulamadır.",
      "Yanlış olabilecek kısa ve öznel bir kanaat.",
      "Tanımı kadar gündelik etkileri de tartışmaya değerdir.",
    ])
      expect(constitutionalEntryWritingIssue(legal)).toBeNull();
  });

  it("rejects explicit forum-call topic titles without guessing at ambiguous language", () => {
    expect(constitutionalTopicWritingIssue("sizce en iyi işletim sistemi hangisi")).toMatchObject({
      code: "CONSTITUTION_TOPIC_FORUM_PROMPT",
    });
    expect(constitutionalTopicWritingIssue("işletim sistemi tercihleri")).toBeNull();
    expect(constitutionalTopicWritingIssue("elma nedir sorusunun tarihi")).toBeNull();
  });

  it("separates a question concept from an answer posted under a question title", () => {
    expect(
      constitutionalTopicCreationIssue(
        "elma nedir",
        "Gülgiller familyasında yetişen, yenilebilir bir meyvedir.",
      ),
    ).toMatchObject({ code: "CONSTITUTION_TOPIC_QUESTION_ANSWER", article: 31 });
    expect(
      constitutionalTopicCreationIssue(
        "elma nedir",
        "“Elma nedir?” sorusu çocukların ilk öğrendiği tanım kalıplarından biridir.",
      ),
    ).toBeNull();
    expect(
      constitutionalTopicCreationIssue(
        "elma",
        "Gülgiller familyasında yetişen, yenilebilir bir meyvedir.",
      ),
    ).toBeNull();
  });

  it("rejects clear direct address, transient headlines and dependent first entries", () => {
    expect(
      constitutionalTopicCreationIssue(
        "aşık olduğun kişinin seni terk etmesi",
        "İlişkilerde sık karşılaşılan bir ayrılık deneyimidir.",
      ),
    ).toMatchObject({ code: "CONSTITUTION_TOPIC_DIRECT_ADDRESS", article: 30 });
    expect(
      constitutionalTopicCreationIssue(
        "şok: takımın teknik direktörü istifa etti",
        "Bugün açıklanan istifadır.",
      ),
    ).toMatchObject({ code: "CONSTITUTION_TOPIC_NEWS_HEADLINE", article: 32 });
    expect(
      constitutionalTopicCreationIssue("uzun süre beklemek", "Bilenler yazsın."),
    ).toMatchObject({ code: "CONSTITUTION_TOPIC_FIRST_ENTRY_DEPENDENT", article: 36 });
  });

  it("keeps ambiguous mastar and event-date checks advisory and false-positive safe", () => {
    expect(constitutionalTopicAdvisories("sevgilinin numarasını silme")).toMatchObject([
      { code: "TOPIC_INFINITIVE_CHECK", article: 29 },
    ]);
    expect(constitutionalTopicAdvisories("dondurma")).toEqual([]);
    expect(constitutionalTopicAdvisories("31 ağustos 2012 new york konseri")).toMatchObject([
      { code: "TOPIC_EVENT_LOCAL_DATE_CHECK", article: 33 },
    ]);
  });

  it("keeps the runtime context article-referenced and non-quota based", () => {
    expect(CONSTITUTION_WRITER_CONTEXT.join("\n")).toContain("Madde 6-17");
    expect(CONSTITUTION_WRITER_CONTEXT.join("\n")).toContain("Madde 27-36");
    expect(CONSTITUTION_WRITER_CONTEXT.join("\n")).toContain("Kısa, öznel");
    expect(CONSTITUTION_WRITER_CONTEXT.join("\n")).not.toContain("günde");
  });
});
