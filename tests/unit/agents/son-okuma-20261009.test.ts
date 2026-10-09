import { describe, expect, it } from "vitest";
import {
  applyRuntimeFinalRead,
  applyRuntimeFinalReadBodies,
  runtimeFinalReadCandidates,
  runtimeFinalReadTopicTitles,
  runtimeFinalReadUnits,
  runtimeFinalReadVerdictSchema,
} from "@/runtime/final-read";
import { buildFinalReadPrompt } from "@/runtime/worker";
import type { RuntimeDecision } from "@/runtime/output";

// Son okuma: özdeyiş kapanış ve dolgu için yalnız silen çağrı (9 Ekim 2026).
describe("son okuma parçaları", () => {
  it("cümle sonunda ve noktalı virgülde böler, rakamdan sonraki noktada bölmez", () => {
    const units = runtimeFinalReadUnits(
      "bakırköy 7. sulh ceza kararı çıktı; hesaplar kapandı. iş bitti mi? bence bitmedi.",
    );
    expect(units.map(({ text }) => text)).toEqual([
      "bakırköy 7. sulh ceza kararı çıktı;",
      "hesaplar kapandı.",
      "iş bitti mi?",
      "bence bitmedi.",
    ]);
  });

  it("silinmeyen parçaları özgün ayraçlarıyla yeniden kurar", () => {
    const body = "yemek planı hevesle başlar.  artan yemek planı kurtarır. plan biraz da sınavdır.";
    const units = runtimeFinalReadUnits(body);
    expect(applyRuntimeFinalRead(body, units, [3])).toEqual({
      body: "yemek planı hevesle başlar.  artan yemek planı kurtarır.",
      removedUnitCount: 1,
    });
  });

  it("noktalı virgülle biten son parçayı noktayla kapatır", () => {
    const longer =
      "çamaşırları yıkamak kadar katlamak da planın parçası, kimin neyi katlayacağı belli değil. makine bitince evde küçük bir kurul toplanıyor; kurul biraz da aile meclisidir.";
    expect(applyRuntimeFinalRead(longer, runtimeFinalReadUnits(longer), [3])?.body).toBe(
      "çamaşırları yıkamak kadar katlamak da planın parçası, kimin neyi katlayacağı belli değil. makine bitince evde küçük bir kurul toplanıyor.",
    );
  });

  it("ilk parçayı, soruyu, bkz'yi ve aralık dışı numaraları silmez", () => {
    const body = "ilk cümle burada. bu ne demek? ara cümle. (bkz: başka başlık) son cümle.";
    const units = runtimeFinalReadUnits(body);
    expect(applyRuntimeFinalRead(body, units, [1, 2, 99, -1, 0])).toBeNull();
    const bkz = units.findIndex(({ text }) => text.includes("(bkz:")) + 1;
    expect(applyRuntimeFinalRead(body, units, [bkz])).toBeNull();
  });

  it("bütün parçaları ya da gövdenin yarısından fazlasını silmez", () => {
    const body = "kısa. ama bu ikinci cümle çok daha uzun ve gövdenin çoğunu taşıyor.";
    const units = runtimeFinalReadUnits(body);
    expect(applyRuntimeFinalRead(body, units, [2])).toBeNull();
  });

  it("çıktı şeması yalnız sil dizisini kabul eder", () => {
    expect(runtimeFinalReadVerdictSchema.safeParse({ sil: [2] }).success).toBe(true);
    expect(runtimeFinalReadVerdictSchema.safeParse({ sil: [2], body: "x" }).success).toBe(false);
    expect(runtimeFinalReadVerdictSchema.safeParse({ sil: ["2"] }).success).toBe(false);
  });
});

describe("son okuma adayları", () => {
  const decision = {
    actions: [
      { sequence: 1, actionType: "CREATE_ENTRY", input: { topicId: "t1", body: "bir. iki." } },
      {
        sequence: 2,
        actionType: "CREATE_TOPIC_WITH_ENTRY",
        input: { title: "yeni başlık", body: "üç. dört." },
      },
      { sequence: 3, actionType: "CREATE_ENTRY", input: { topicId: "t1", body: "tek cümle." } },
      { sequence: 4, actionType: "VOTE_UP", input: { entryId: "e1", value: 1 } },
    ],
  } as unknown as RuntimeDecision;

  it("iki ya da daha fazla parçalı yeni entry'leri başlığıyla seçer", () => {
    const titles = runtimeFinalReadTopicTitles({
      readTopics: [{ id: "t1", title: "okunan başlık", entries: [] }],
    });
    const candidates = runtimeFinalReadCandidates(decision, titles);
    expect(candidates.map(({ sequence, topicTitle }) => [sequence, topicTitle])).toEqual([
      [1, "okunan başlık"],
      [2, "yeni başlık"],
    ]);
  });

  it("yalnız verilen gövdeleri değiştirir, diğer alanlara dokunmaz", () => {
    const next = applyRuntimeFinalReadBodies(decision, new Map([[1, "bir."]]));
    expect(next.actions[0]?.input).toEqual({ topicId: "t1", body: "bir." });
    expect(next.actions[1]).toBe(decision.actions[1]);
  });

  it("istem parçaları numaralı ve güvenilmeyen içerik sınırında verir", () => {
    const [candidate] = runtimeFinalReadCandidates(decision, new Map([["t1", "okunan başlık"]]));
    const prompt = buildFinalReadPrompt(candidate!);
    expect(prompt).toContain("Yalnız silebilirsin");
    expect(prompt).toContain(
      "<UNTRUSTED_CONTENT>\nBaşlık: okunan başlık\nParçalar:\n1. bir.\n2. iki.",
    );
  });
});
