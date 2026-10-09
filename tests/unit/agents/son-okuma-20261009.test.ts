import { describe, expect, it } from "vitest";
import {
  applyRuntimeFinalRead,
  applyRuntimeFinalReadBodies,
  runtimeFinalReadCandidates,
  runtimeFinalReadMinKeptWords,
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

  const planBody =
    "haftalık yemek planı pazartesi günkü hevesle cuma akşamki yorgunluğu aynı mutfağa sığdırmaya çalışır.  artan yemeği ertesi güne bırakmak planı bozmaz, tersine planı kurtaran tek hamledir. plan biraz da sınavdır.";
  const planKept =
    "haftalık yemek planı pazartesi günkü hevesle cuma akşamki yorgunluğu aynı mutfağa sığdırmaya çalışır.  artan yemeği ertesi güne bırakmak planı bozmaz, tersine planı kurtaran tek hamledir.";

  it("silinmeyen parçaları özgün ayraçlarıyla yeniden kurar", () => {
    expect(applyRuntimeFinalRead(planBody, runtimeFinalReadUnits(planBody), [3])).toEqual({
      body: planKept,
      removedUnitCount: 1,
    });
  });

  it("noktalı virgülle biten son parçayı noktayla kapatır", () => {
    const body = `${planBody.slice(0, -"plan biraz da sınavdır.".length)}evde küçük bir kurul toplanıyor; kurul biraz da aile meclisidir.`;
    expect(applyRuntimeFinalRead(body, runtimeFinalReadUnits(body), [4])?.body).toBe(
      `${planKept} evde küçük bir kurul toplanıyor.`,
    );
  });

  it("silmeden sonra 20 kelimeden az kalıyorsa dokunmaz", () => {
    expect(runtimeFinalReadMinKeptWords).toBe(20);
    const body =
      "bozcaada'da ekoloji belgeselleri gösteren uluslararası bir festival. farklı coğrafyalardan filmleri aynı programa topluyor; ekoloji burada broşür köşesi değil, filmin kendisi.";
    expect(applyRuntimeFinalRead(body, runtimeFinalReadUnits(body), [3])).toBeNull();
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

  it("bağlantı, alıntı ve URL aralıklarında bölmez ve onları taşıyan parçayı silmez", () => {
    expect(
      runtimeFinalReadUnits("ilk. (bkz: dr. strangelove) son. [[dr. no]] bitti.").map(
        ({ text }) => text,
      ),
    ).toEqual(["ilk.", "(bkz: dr. strangelove) son.", "[[dr. no]] bitti."]);
    expect(runtimeFinalReadUnits("“ilk kapı açıldı. son kapı kapandı.” dedi.")[0]?.text).toBe(
      "“ilk kapı açıldı. son kapı kapandı.”",
    );
    const body = `${planBody} (BKZ: eski plan) https://ornek.test/a.b sonra.`;
    const units = runtimeFinalReadUnits(body);
    expect(applyRuntimeFinalRead(body, units, [units.length])).toBeNull();
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

  it("kaynaklı entry'yi son okumaya almaz", () => {
    const sourced = {
      actions: [
        {
          sequence: 1,
          actionType: "CREATE_ENTRY",
          input: { topicId: "t1", body: "bir. iki." },
          provenance: { evidenceType: "TRUSTED_SOURCE", evidenceIds: [], shortRationale: "x" },
        },
      ],
    } as unknown as RuntimeDecision;
    expect(runtimeFinalReadCandidates(sourced, new Map())).toEqual([]);
  });

  it("alıntı sınırı belirsiz gövdeyi son okumaya almaz, çok satırlı alıntıyı bölmez", () => {
    const decisionFor = (body: string) =>
      ({
        actions: [{ sequence: 1, actionType: "CREATE_ENTRY", input: { topicId: "t1", body } }],
      }) as unknown as RuntimeDecision;
    for (const body of [
      "giriş cümlesi burada. “kapanmamış alıntı. sonra gelen cümle.",
      "giriş cümlesi burada. ‘işe giderken kitapları aldım. parayı vermedim.’ dedi.",
      'giriş cümlesi burada. "tek tırnak. ikinci cümle.',
    ])
      expect(runtimeFinalReadCandidates(decisionFor(body), new Map())).toEqual([]);
    const multiline = 'giriş cümlesi burada. "kitapları aldım.\n parayı vermedim." dedi.';
    const [candidate] = runtimeFinalReadCandidates(decisionFor(multiline), new Map());
    expect(candidate?.units.map(({ text }) => text)).toEqual([
      "giriş cümlesi burada.",
      '"kitapları aldım.\n parayı vermedim."',
      "dedi.",
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
