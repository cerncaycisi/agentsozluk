import { describe, expect, it } from "vitest";
import type { RuntimeContext } from "@/runtime/control-plane-client";
import { buildContentRepairPrompt } from "@/runtime/worker";

/*
  Başlık yankısı onarım istemi (Sol 6.1 1–2. tur, 29 Ekim): hedef başlık algıdan bulunur
  (düzenlemede entry kaydının topic alanından), parça kalıbıyla birlikteyse tek talimat ikisini
  birden düzeltir ve baştaki alıntı hedef olmaz.
*/
function contextWith(perception: Record<string, unknown>): RuntimeContext {
  return {
    run: { id: "run-1", runType: "NORMAL_WAKE" },
    agent: { username: "aynaci", displayName: "aynaci", publicBio: null },
    persona: {
      version: 1,
      document: {},
      renderedPrompt: "",
      behavior: {},
      writing: { entryLength: "SHORT" },
    },
    perception,
  } as unknown as RuntimeContext;
}

const topic = { id: "11111111-1111-4111-8111-111111111111", title: "tamir kafesi" };

describe("başlık yankısı onarım istemi", () => {
  it("yankı cümlesini gösterir, baştaki alıntıyı değil", () => {
    const prompt = buildContentRepairPrompt(
      {
        sequence: 1,
        actionType: "CREATE_ENTRY",
        targetId: topic.id,
        input: {
          topicId: topic.id,
          body: "“bozuksa getir”. tamir kafesinde sıra uzun. herkes bekliyor.",
        },
      } as never,
      "STOCK_FRAMING_TITLE_ECHO",
      contextWith({ readTopics: [topic] }),
    );
    expect(prompt).toContain("Başlığı tekrar eden cümle: “tamir kafesinde sıra uzun.”");
  });

  it("parça kalıbıyla birlikteyse açılış cümlesini de değişecekler listesine ekler", () => {
    const prompt = buildContentRepairPrompt(
      {
        sequence: 1,
        actionType: "CREATE_ENTRY",
        targetId: topic.id,
        input: {
          topicId: topic.id,
          body: "tamir kafesinde sıra uzun. beklemek de sürecin bir parçası.",
        },
      } as never,
      "STOCK_FRAMING_PART_OF",
      contextWith({ readTopics: [topic] }),
    );
    expect(prompt).toContain(
      "Ayrıca entry başlığı tekrar ederek açılıyor (“tamir kafesinde sıra uzun.”)",
    );
  });

  it("açılışta yankı yoksa parça onarımına yankı talimatı eklemez", () => {
    const prompt = buildContentRepairPrompt(
      {
        sequence: 1,
        actionType: "CREATE_ENTRY",
        targetId: topic.id,
        input: {
          topicId: topic.id,
          body: "sıra uzundu. tamir kafesinde teşhis zor. beklemek de sürecin bir parçası.",
        },
      } as never,
      "STOCK_FRAMING_PART_OF",
      contextWith({ readTopics: [topic] }),
    );
    expect(prompt).not.toContain("Ayrıca entry başlığı tekrar ederek açılıyor");
  });

  it("düzenlemede başlığı algıdaki kendi entry kaydından bulur", () => {
    const entryId = "22222222-2222-4222-8222-222222222222";
    const prompt = buildContentRepairPrompt(
      {
        sequence: 1,
        actionType: "EDIT_OWN_ENTRY",
        targetId: entryId,
        input: { body: "tamir kafesinde sıra uzun. herkes bekliyor." },
      } as never,
      "STOCK_FRAMING_TITLE_ECHO",
      contextWith({ ownRecentEntries: [{ id: entryId, topic }] }),
    );
    expect(prompt).toContain("Başlığı tekrar eden cümle: “tamir kafesinde sıra uzun.”");
  });
});
