import { describe, expect, it } from "vitest";
import {
  applyRuntimeFinalRead,
  runtimeFinalReadCandidates,
  runtimeFinalReadUnits,
} from "@/runtime/final-read";
import type { RuntimeDecision } from "@/runtime/output";

/*
  Son okuma için saklı olumsuz küme (Astra DD-03 ve DD-P2, Fable 7.1; 10 Ekim 2026).

  Her durumda model 2. parçanın (ya da belirtilen parçanın) silinmesini istemiş sayılır. "Korunur"
  durumlarında silme reddedilmeli; "silinebilir" durumları son okumanın asıl hedefi olan dolgu ve
  özdeyiş kapanışlarıdır ve aşırı kilitlemeyi yakalar. Metinler sentetiktir; gerçek entry metni
  depoya girmez.
*/

const head =
  "eski fabrika binasının kütüphaneye dönüşmesi, makine dairesinin okuma salonu olarak kullanılması ve tavan vinçlerinin yerinde bırakılmasıyla birlikte mahallenin hafızasını da taşıyor";

function trimmed(body: string, remove: number[] = [2]) {
  return applyRuntimeFinalRead(body, runtimeFinalReadUnits(body), remove);
}

function candidateFor(body: string, evidenceType = "MODEL_KNOWLEDGE") {
  const decision = {
    actions: [
      {
        sequence: 1,
        actionType: "CREATE_ENTRY",
        input: { topicId: "t1", body },
        provenance: { evidenceType, evidenceIds: [], shortRationale: "x" },
      },
    ],
  } as unknown as RuntimeDecision;
  return runtimeFinalReadCandidates(decision, {});
}

describe("son okuma saklı olumsuz küme: anlam taşıyan parça silinmez", () => {
  const protectedTails: Array<[string, string]> = [
    ["atıf: görüşün sahibi", "bunu savunan kişi koruma uzmanı ayşe demir."],
    ["atıf: göre", "mimarlar odasına göre bu tür dönüşümler bakım bütçesini ikiye katlıyor."],
    ["kapsam sınırı", "bu değerlendirme bütün müzeler için geçerli değil."],
    ["kapsam sınırı: genelleme", "tek bir örnekten bütün şehir için genelleme yapılamaz."],
    ["nedensellik", "bu ilişki tek başına nedensellik kanıtı değil."],
    ["korelasyon", "ikisinin birlikte artması korelasyon gösterir, sebebi değil."],
    ["doğruluk çekincesi", "açılış tarihi henüz kesinleşmedi."],
    ["doğruluk çekincesi: iddia", "bu iddia şimdilik başka bir kaynakla doğrulanmadı."],
    ["istisna", "kış aylarında kapanan salon bunun istisnası."],
    ["soru", "peki vinçler bir gün sökülürse bina neyi hatırlatacak?"],
    ["bağlantı", "(bkz: endüstriyel miras) bu konuyu daha geniş anlatıyor."],
    ["atıf: geçmiş zaman", "bunu koruma uzmanı ayşe demir söyledi."],
    ["kapsam: yalnızca … sınırlı", "bu yorum yalnızca hafta içi açık olan salonla sınırlı."],
  ];
  for (const [name, tail] of protectedTails)
    it(name, () => {
      expect(trimmed(`${head}. ${tail}`)).toBeNull();
    });

  it("sağlık, finans ve hukuk gövdesi hiç aday olmaz", () => {
    for (const body of [
      "Düzenli kahve tüketimi kalp hastalığına bağlı ölüm riskini azaltıyor ve bu etki uzun vadeli beslenme alışkanlıklarıyla birlikte görülüyor. Bu ilişki tek başına kanıt değil.",
      "yeni kredi kampanyası faiz oranını düşük gösteriyor ama vade uzadıkça toplam geri ödeme artıyor ve dosya masrafı ayrıca ekleniyor. kampanya biraz da reklam metnidir.",
      "aşının koruyuculuğu, vücudun mikrobu önceden tanımasını sağlayarak sonraki karşılaşmada daha hızlı yanıt vermesine yardımcı olur ve ağır seyretme olasılığını düşürür. bu anlatım yetişkinler için.",
      "altın birikimi uzun vadede değer koruyor gibi görünse de anaparanın bir kısmı alım satım farkında ve saklama masrafında eriyor, bu yüzden hesap kısa vadede tutmuyor. iş biraz da sabır meselesi.",
      "kira artışına itiraz eden kiracının mahkemeye başvurma süresi sözleşmenin yenilendiği tarihten itibaren işliyor ve bu süre kaçırılırsa hak kayboluyor. süreç biraz da sabır işidir.",
    ])
      expect(candidateFor(body)).toEqual([]);
  });

  it("başlığı hassas alanda olan entry aday olmaz", () => {
    const decision = {
      actions: [
        {
          sequence: 1,
          actionType: "CREATE_TOPIC_WITH_ENTRY",
          input: { title: "ilaç fiyatları", body: `${head}. kütüphane biraz da hafıza odasıdır.` },
          provenance: { evidenceType: "MODEL_KNOWLEDGE", evidenceIds: [], shortRationale: "x" },
        },
      ],
    } as unknown as RuntimeDecision;
    expect(runtimeFinalReadCandidates(decision, {})).toEqual([]);
  });

  it("kaynaklı entry hiç aday olmaz", () => {
    expect(
      candidateFor(
        `${head}. kütüphane biraz da mahallenin ortak çalışma odasıdır.`,
        "TRUSTED_SOURCE",
      ),
    ).toEqual([]);
  });

  it("kısaltmadan sonraki nokta parçayı bölmez", () => {
    const units = runtimeFinalReadUnits(
      `${head}, örn. tavan vinçleri ve makine yağı izleri vb. ayrıntılar korunmuş. Prof. Demir bunu anlatıyor.`,
    ).map(({ text }) => text);
    expect(units).toHaveLength(2);
    expect(units[1]).toBe("Prof. Demir bunu anlatıyor.");
    expect(units.some((text) => /(?:örn|vb|Prof)\.$/u.test(text))).toBe(false);
  });
});

describe("son okuma saklı olumsuz küme: asıl hedef hâlâ silinebilir", () => {
  it("hassas alan sözcüklerine benzeyen sıradan sözcükler gövdeyi dışlamaz", () => {
    for (const word of ["hissettiriyor", "aşırı", "tanıdık"])
      expect(
        candidateFor(`${head.replace("taşıyor", word)}. kütüphane biraz da hafıza odasıdır.`),
      ).toHaveLength(1);
  });

  it("kısaltmadan sonra gelen paragraf sınırı yine böler", () => {
    const units = runtimeFinalReadUnits(
      `${head}, eski presler vb.\n\nbina biraz da kendi okurudur.`,
    );
    expect(units).toHaveLength(2);
  });

  const removableTails: Array<[string, string]> = [
    ["özdeyiş kapanışı", "bina biraz da kendi geçmişinin okurudur."],
    [
      "özdeyiş: dönüşüm kalıbı",
      "kütüphane böylece raf olmaktan çıkıp bir hafıza odasına dönüşüyor.",
    ],
    [
      "genel dolgu çekincesi",
      "yalnız bunun tek başına başarı ölçüsü olmadığını da eklemek gerekir.",
    ],
    ["kendini yorumlayan cümle", "burada anlatmak istediğim de tam olarak bu."],
  ];
  for (const [name, tail] of removableTails)
    it(name, () => {
      expect(trimmed(`${head}. ${tail}`)?.body).toBe(`${head}.`);
    });

  it("tekrar eden kapanışı silen, yani düzelten silme kabul edilir", () => {
    const body = `${head}. mekân tek başına kültür yaratmaz.`;
    const result = applyRuntimeFinalRead(body, runtimeFinalReadUnits(body), [2], {
      ownRecentBodies: ["konser salonu açmak, tek başına kültür yaratmaz."],
    });
    expect(result?.body).toBe(`${head}.`);
  });
});
