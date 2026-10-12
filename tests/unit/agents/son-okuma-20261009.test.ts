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

  it("ilke kontrollerinden birinin sonucunu değiştiren silmeyi yapmaz", () => {
    const body =
      "belediyenin yeni ulaşım ihalesinde müdür şirketten rüşvet aldı ve kamu denetimini devre dışı bırakmak için sözleşmenin mali kontrol maddelerini bilerek çıkardı; ancak bu iddia henüz doğrulanmadı.";
    const units = runtimeFinalReadUnits(body);
    expect(units).toHaveLength(2);
    expect(applyRuntimeFinalRead(body, units, [2])).toBeNull();
  });

  it("başka bir ciddi iddia varken yeni açılan çekincesiz iddiayı fark eder", () => {
    const body =
      "Mahkemenin kararı, belediye ihalesindeki rüşvet ilişkisini açığa çıkaran denetim raporunun nasıl işlendiğini ve kamu kaynaklarının kontrolünde hangi kurumsal boşlukların bulunduğunu gösteren bir örnek. Şirket müdürü kamu görevlisine rüşvet verdi; ancak bu iddia henüz doğrulanmadı.";
    const units = runtimeFinalReadUnits(body);
    expect(applyRuntimeFinalRead(body, units, [units.length])).toBeNull();
  });

  it("yeni başlıkta başlık anayasasını ve kapanış tekrarını önce/sonra karşılaştırır", () => {
    const topicBody =
      "Beklenmedik bir haberin okura olağanüstü bir olay gibi sunulması, merakı öne çıkarıp ayrıntıyı geriye iten ve haberin önemini daha okunmadan belirleyen anlatım tercihidir. Magazin dilinde kullanılan bir manşet klişesidir.";
    expect(
      applyRuntimeFinalRead(topicBody, runtimeFinalReadUnits(topicBody), [2], {
        createsTopic: true,
        topicTitle: "şok gelişme",
      }),
    ).toBeNull();
    const framed =
      "Yeni arayüzün menüleri sadeleştirmesi, klavye kullanan okurun seçeneklere daha hızlı ulaşmasını sağlayan bir düzenleme olsa da erişimin herkes için eşit hale geldiğini tek başına göstermiyor. Tasarım bazen küçük bir sabır meselesidir.";
    expect(
      applyRuntimeFinalRead(framed, runtimeFinalReadUnits(framed), [2], {
        ownRecentBodies: [
          "Kütüphanedeki rafların yerini değiştirmek, kitapların daha çok okunduğunu tek başına kanıtlamıyor.",
        ],
      }),
    ).toBeNull();
  });

  it("ciddi suç isnadı taşıyan gövdeyi aday yapmaz, doğruluk çekincesini hiç silmez", () => {
    const crime =
      "Belediyenin ulaşım ihalesinde müdür şirketten rüşvet aldı ve kamu denetimini devre dışı bırakmak için sözleşmenin mali kontrol maddelerini bilerek çıkardı. Ancak bu iddia henüz doğrulanmadı.";
    const decision = {
      actions: [
        {
          sequence: 1,
          actionType: "CREATE_ENTRY",
          input: { topicId: "t1", body: crime },
          provenance: { evidenceType: "TRUSTED_SOURCE", evidenceIds: [], shortRationale: "x" },
        },
      ],
    } as unknown as RuntimeDecision;
    expect(runtimeFinalReadCandidates(decision, {})).toEqual([]);
    const status = {
      actions: [
        {
          ...decision.actions[0]!,
          input: {
            topicId: "t1",
            body: "Kent Hastanesinin başhekimi Deniz Aydın görevinden istifa etti ve yönetim kuruluna ayrılık kararını bildirerek hastanedeki yeni görev dağılımının önünü açtı. Bu bilgi henüz kesinleşmedi.",
          },
        },
      ],
    } as unknown as RuntimeDecision;
    expect(runtimeFinalReadCandidates(status, {})).toEqual([]);
    const statusWithDecoy = {
      actions: [
        {
          ...decision.actions[0]!,
          input: {
            topicId: "t1",
            body: "Kent Hastanesinin başhekimi Deniz Aydın belirsiz görev dağılımı nedeniyle görevinden istifa etti ve yönetim kuruluna ayrılık kararını bildirerek hastanedeki yeni yönetim yapısının önünü açtı. Bu bilgi henüz kesinleşmedi.",
          },
        },
      ],
    } as unknown as RuntimeDecision;
    expect(runtimeFinalReadCandidates(statusWithDecoy, {})).toEqual([]);
    const upper = {
      actions: [
        {
          ...status.actions[0]!,
          input: {
            topicId: "t1",
            body: (status.actions[0]!.input.body as string).replace("istifa etti", "ISTIFA ETTI"),
          },
        },
      ],
    } as unknown as RuntimeDecision;
    expect(runtimeFinalReadCandidates(upper, {})).toEqual([]);
    const plain =
      "yeni kütüphane binasının açılış töreni, kitapların taşınması ve okuma salonlarının düzenlenmesiyle birlikte birkaç haftalık bir hazırlık gerektirdi ve mahalleli bunu merakla izledi. Açılış tarihi HENÜZ KESİNLEŞMEDİ.";
    expect(applyRuntimeFinalRead(plain, runtimeFinalReadUnits(plain), [2])).toBeNull();
    for (const breakChar of ["\n", "\r\n"]) {
      const broken = {
        actions: [
          {
            ...status.actions[0]!,
            input: {
              topicId: "t1",
              body: (status.actions[0]!.input.body as string).replace(
                "istifa etti",
                `istifa${breakChar}etti`,
              ),
            },
          },
        ],
      } as unknown as RuntimeDecision;
      expect(runtimeFinalReadCandidates(broken, {})).toEqual([]);
    }
    const hedged =
      "yeni metro hattının açılış takvimi, ihale sürecindeki gecikmeler ve istasyonların bağlantı planı nedeniyle birkaç kez değişti ve vatandaşlar bunu takip etmekte zorlandı. Açılış tarihi henüz doğrulanmadı.";
    expect(applyRuntimeFinalRead(hedged, runtimeFinalReadUnits(hedged), [2])).toBeNull();
  });

  it("NFKC ile tırnağa dönüşen karakter taşıyan gövdeyi aday yapmaz", () => {
    const body =
      "Bir metnin bellekte bıraktığı iz, kelimelerin sözlükteki anlamından çok aralarındaki ritme ve okurun dikkatine bağlıdır. ＂Güneş her sabah aynı pencereye vurur. Rüzgâr başka sokaklardan gelir.＂";
    const decision = {
      actions: [{ sequence: 1, actionType: "CREATE_ENTRY", input: { topicId: "t1", body } }],
    } as unknown as RuntimeDecision;
    expect(runtimeFinalReadCandidates(decision, {})).toEqual([]);
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
    expect(
      runtimeFinalReadTopicTitles({
        readTopics: [{ id: "t1", title: "okunan başlık", entries: [] }],
      }).get("t1"),
    ).toBe("okunan başlık");
    const candidates = runtimeFinalReadCandidates(decision, {
      readTopics: [{ id: "t1", title: "okunan başlık", entries: [] }],
    });
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
          input: {
            topicId: "t1",
            body: "bankanın yeni finansman programı üretim ve ticaret ekosistemini destekleyecek çözümleri çeşitlendirme çerçevesinde anlatılıyor ve ayrıntı vermiyor. tutar verilmeden etkisini hesaplamak mümkün değil.",
          },
          provenance: { evidenceType: "TRUSTED_SOURCE", evidenceIds: [], shortRationale: "x" },
        },
      ],
    } as unknown as RuntimeDecision;
    expect(runtimeFinalReadCandidates(sourced, {})).toEqual([]);
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
      "giriş cümlesi burada. ”eski sözün sonu. “sistem parayı aldı. geri ödemeyi yapmadı.",
      "giriş cümlesi burada. » ters açılış. « sonra gelen cümle.",
      "giriş cümlesi burada. “dış “iç” alıntı” bitti.",
      '"önsöz “alıntı başladı." giriş cümlesi burada. son alıntı bitti.”',
      'giriş cümlesi burada. “dış "iç" alıntı” bitti.',
    ])
      expect(runtimeFinalReadCandidates(decisionFor(body), {})).toEqual([]);
    const multiline = 'giriş cümlesi burada. "kitapları aldım.\n parayı vermedim." dedi.';
    const [candidate] = runtimeFinalReadCandidates(decisionFor(multiline), {});
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
    const [candidate] = runtimeFinalReadCandidates(decision, {
      readTopics: [{ id: "t1", title: "okunan başlık", entries: [] }],
    });
    const prompt = buildFinalReadPrompt(candidate!);
    expect(prompt).toContain("Yalnız silebilirsin");
    expect(prompt).toContain(
      "<UNTRUSTED_CONTENT>\nBaşlık: okunan başlık\nParçalar:\n1. bir.\n2. iki.",
    );
  });
});
