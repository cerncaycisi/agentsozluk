import { describe, expect, it } from "vitest";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import { seedPersonaSchema } from "@/modules/agents/personas/schema";
import { selectPersonalInterestTopics } from "@/modules/agents/domain/runtime-browse";
import { runtimeReadTopicFullBodiesKey } from "@/modules/agents/domain/perception";
import {
  applyWriterDiversificationD2Target,
  writerDiversificationD2Targets,
} from "@/modules/agents/personas/writer-diversification-d2";
import { runtimeNoveltyCandidates, runtimeNoveltySimilarity } from "@/runtime/novelty-gate";
import type { RuntimeDecision } from "@/runtime/output";

// 8 Ekim 2026 yerel kanıtla bulunan düzeltmeler (docs/YEREL_KANIT_2026-10-08.md).
describe("#6 kişisel ilgi menüsü", () => {
  const interests = [
    { key: "gündelik hayat", weight: 0.6 },
    { key: "müzik", weight: 0.4 },
  ];
  const candidate = (id: string, title: string, interestKey: string, entryCount = 3) => ({
    id,
    title,
    interestKey,
    entryCount,
  });

  it("çok kelimeli ilgide bütün kelimeler eşleşmeli; tek kelime yetmez", () => {
    const picked = selectPersonalInterestTopics(
      [
        candidate("a", "yaban hayatı dostu tarım", "gündelik hayat"),
        candidate("b", "gündelik hayatta küçük ritüeller", "gündelik hayat"),
        candidate("c", "müziğin hafızası", "müzik"),
      ],
      interests,
      "run-1",
    );
    expect(picked.map(({ id }) => id).sort()).toEqual(["b", "c"]);
  });

  it("kalabalık başlık geri plana itilir ve seçim koşuya göre döner", () => {
    const many = Array.from({ length: 30 }, (_, index) =>
      candidate(`m${index}`, `müzik ${index}`, "müzik", index < 10 ? 50 : 2),
    );
    const first = selectPersonalInterestTopics(many, interests, "run-1");
    const second = selectPersonalInterestTopics(many, interests, "run-2");
    expect(first).toHaveLength(8);
    // Kalabalık on başlık (m0–m9) en iyi on altıya girmez.
    expect(first.some(({ id }) => Number(id.slice(1)) < 10)).toBe(false);
    expect(first.map(({ id }) => id)).not.toEqual(second.map(({ id }) => id));
    expect(selectPersonalInterestTopics(many, interests, "run-1")).toEqual(first);
  });
});

describe("#13 yenilik kapısı benzer entry seçimi", () => {
  const draft = "görünmez koordinasyon takvim denkleştirme ve hatırlama yüküdür";
  const entries = [
    { id: "def", username: "a", mine: false, body: "tanım: koordinasyon emeği" },
    ...Array.from({ length: 20 }, (_, index) => ({
      id: `e${index}`,
      username: "b",
      mine: false,
      body: `alakasız bir konuşma halkası ${index}`,
    })),
    { id: "old", username: "c", mine: false, body: "görünmez koordinasyon…" },
  ];
  const decision = {
    actions: [
      {
        sequence: 1,
        actionType: "CREATE_ENTRY",
        input: { topicId: "t1", body: draft },
      },
    ],
  } as unknown as RuntimeDecision;
  const perception = {
    readTopics: [{ id: "t1", title: "görünmez koordinasyon", entries }],
    [runtimeReadTopicFullBodiesKey]: [
      { id: "old", body: "görünmez koordinasyon, takvim denkleştirme ve hatırlama yüküdür." },
    ],
  };

  it("tanımı başta tutar, en benzer altı entry'yi tam metinle verir", () => {
    const [candidate] = runtimeNoveltyCandidates(decision, perception);
    expect(candidate?.previousEntries).toHaveLength(7);
    expect(candidate?.previousEntries[0]?.body).toBe("tanım: koordinasyon emeği");
    expect(candidate?.previousEntries[1]?.body).toBe(
      "görünmez koordinasyon, takvim denkleştirme ve hatırlama yüküdür.",
    );
  });

  it("kısa başlıkta bütün entry'ler aynen gider", () => {
    const [candidate] = runtimeNoveltyCandidates(decision, {
      readTopics: [{ id: "t1", title: "x", entries: entries.slice(0, 5) }],
    });
    expect(candidate?.previousEntries).toHaveLength(5);
  });

  it("benzerlik kelime köküne bakar", () => {
    expect(runtimeNoveltySimilarity("takvimler denkleşiyor", "takvim denkleştirme")).toBe(1);
    expect(runtimeNoveltySimilarity("elma armut", "takvim denkleştirme")).toBe(0);
  });
});

describe("#1/#12 D2 çekince adımı", () => {
  it("15 hedef tekil; uygulama idempotent ve yalnız yazım alanlarını değiştirir", () => {
    expect(new Set(writerDiversificationD2Targets.map(({ username }) => username)).size).toBe(15);
    const base = seedPersonaSchema.parse(originalPersonaPack.personas[0]);
    const target = {
      username: base.username,
      rhythm: "Kısa söyler, gerekirse bir örnek ekler.",
      replaceStructure: [[base.writing.structure[0]!, "yeni içerik adımı"]] as const,
    };
    const once = applyWriterDiversificationD2Target(base, target);
    expect(once.writing.structure[0]).toBe("yeni içerik adımı");
    expect(once.writing.rhythm).toBe("Kısa söyler, gerekirse bir örnek ekler.");
    expect(once.writing.avoidPatterns).toContain(
      "entry'yi çekince ya da sınır cümlesiyle bitirmek",
    );
    expect(applyWriterDiversificationD2Target(once, target)).toEqual(once);
    expect({ ...once, writing: base.writing }).toEqual(base);
  });

  it("beklenen eski adım yoksa durur", () => {
    const base = seedPersonaSchema.parse(originalPersonaPack.personas[0]);
    expect(() =>
      applyWriterDiversificationD2Target(base, {
        username: base.username,
        replaceStructure: [["olmayan adım", "yeni"]],
      }),
    ).toThrow("WRITER_D2_STRUCTURE_MISSING");
  });
});
