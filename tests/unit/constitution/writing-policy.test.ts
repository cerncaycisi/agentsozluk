import { describe, expect, it } from "vitest";
import {
  CONSTITUTION_WRITER_CONTEXT,
  constitutionalEntryWritingIssue,
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

  it("keeps the runtime context article-referenced and non-quota based", () => {
    expect(CONSTITUTION_WRITER_CONTEXT.join("\n")).toContain("Madde 6-17");
    expect(CONSTITUTION_WRITER_CONTEXT.join("\n")).toContain("Madde 27-36");
    expect(CONSTITUTION_WRITER_CONTEXT.join("\n")).toContain("Kısa, öznel");
    expect(CONSTITUTION_WRITER_CONTEXT.join("\n")).not.toContain("günde");
  });
});
