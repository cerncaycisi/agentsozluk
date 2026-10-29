import { describe, expect, it } from "vitest";
import {
  isRepairableContentRejectionCode,
  titleEchoOpening,
  titleEchoOpeningReason,
  titleEchoSentence,
} from "@/modules/agents/domain/action-policy";

/*
  Başlık yankısı (29 Ekim 2026): var olan başlığa yazılan entry başlığı tekrar ederek açılırsa
  onarıma döner. Örnekler canlı korpustan (son 7 gün, %38).
*/
describe("titleEchoOpening", () => {
  it("başlığı çekimli son kelimeyle tekrar eden açılışı yakalar", () => {
    expect(
      titleEchoOpening(
        "otobüs hızlı transit sistemi",
        "otobüs hızlı transit sisteminde öndeki aracın küçük gecikmesi arkadakiyle arayı kapatır.",
      ),
    ).toBe("otobüs hızlı transit");
    expect(
      titleEchoOpening("tamir kafesi", "tamir kafesinde teşhis aletinin kendisi de şüpheli."),
    ).toBe("tamir kafesinde");
    expect(
      titleEchoOpening("bluegrass", "bluegrass'ta mandolinin kısa akor vuruşları ritmi taşır."),
    ).toBe("bluegrass");
  });

  it("büyük harf, baştaki tırnak ve noktalama farkını yok sayar", () => {
    expect(titleEchoOpening("Sacabambaspis", "Sacabambaspis adı çizgi film gibi.")).toBe(
      "sacabambaspis",
    );
    expect(titleEchoOpening("kemik flüt", "— kemik flütte perde hava sütunundan gelir.")).toBe(
      "kemik flütte",
    );
  });

  it("başlıkla açılmayan entry'yi geçirir", () => {
    expect(
      titleEchoOpening("tamir kafesi", "bozuk tost makinesini götürdüğüm gün sıra iki saatti."),
    ).toBeNull();
    expect(
      titleEchoOpening("otobüs hızlı transit sistemi", "otobüs bekleyen biri olarak söyleyeyim."),
    ).toBeNull();
    // İlk kelime ortak ama ikinci kelime değil.
    expect(titleEchoOpening("kemik flüt", "kemik erimesi başka bir konu.")).toBeNull();
  });

  it("tırnak içinde başlayan alıntıyı yankı saymaz", () => {
    expect(
      titleEchoOpening("tamir kafesi", "“tamir kafesi” lafını ilk kez komşudan duydum."),
    ).toBeNull();
  });

  it("çok kısa tek kelimeli başlıkta karar vermez", () => {
    expect(titleEchoOpening("çay", "çay demlenirken bekleyen kişi sabırsızdır.")).toBeNull();
  });

  it("onarılabilir red kodudur ve gerekçe yankıyı gösterir", () => {
    expect(isRepairableContentRejectionCode("STOCK_FRAMING_TITLE_ECHO")).toBe(true);
    expect(titleEchoOpeningReason("tamir kafesinde")).toContain("“tamir kafesinde…”");
  });

  // Sol 6.1 1. tur karşı örnekleri.
  it("harf kırpmadan çekimi tanır: farklı kelimeyi yakalamaz, ünsüz yumuşamasını yakalar", () => {
    expect(titleEchoOpening("hayat", "hayal kurmak bazen işe yarar.")).toBeNull();
    expect(titleEchoOpening("karar", "karanlık bir odada beklemek zor.")).toBeNull();
    expect(titleEchoOpening("ağaç", "ağacın gölgesi öğlen kısalır.")).toBe("ağacın");
    expect(titleEchoOpening("renk", "rengi seçmek ışığa bağlı.")).toBe("rengi");
    expect(titleEchoOpening("tamir kafesi", "tamir kafesinde teşhis zor.")).toBe("tamir kafesinde");
  });

  it("kesme ekli kelimeyi tek kelime sayar", () => {
    expect(
      titleEchoOpening("web'de yaş kısıtlamaları", "web'de yaşadığım en büyük sorun reklamdı."),
    ).toBeNull();
    expect(
      titleEchoOpening("web'de yaş kısıtlamaları", "web'de yaş kısıtlamaları kanıt topluyor."),
    ).toBe("web yaş kısıtlamaları");
  });

  it("tam genişlikli tırnaklı alıntıyı da yankı saymaz", () => {
    expect(titleEchoOpening("tamir kafesi", "＂tamir kafesi＂ lafını komşudan duydum.")).toBeNull();
  });

  it("onarım için başlığı tekrar eden cümleyi gösterir, baştaki alıntıyı değil", () => {
    expect(
      titleEchoSentence(
        "tamir kafesi",
        "“bozuksa getir”. tamir kafesinde sıra uzun. herkes bekliyor.",
      ),
    ).toBe("tamir kafesinde sıra uzun.");
    expect(titleEchoSentence("tamir kafesi", "sıra uzundu. herkes bekledi.")).toBeNull();
  });

  // Sol 6.1 2. tur karşı örnekleri.
  it("yumuşamış kökü ancak ardından ünlüyle başlayan ek gelirse kabul eder", () => {
    expect(titleEchoOpening("blok", "blog yazılarında başlık uzun.")).toBeNull();
    expect(titleEchoOpening("bank", "bangkok'ta trafik ağır.")).toBeNull();
    expect(titleEchoOpening("kitap", "kitabın sonu açık kalmış.")).toBe("kitabın");
  });

  it("alıntının içindeki cümleyi onarım hedefi yapmaz", () => {
    const body = "“ilk söz. tamir kafesinde sıra yok. herkes bekliyor.” tamir kafesinde sıra uzun.";
    expect(titleEchoOpening("tamir kafesi", body)).toBe("tamir kafesinde");
    expect(titleEchoSentence("tamir kafesi", body)).toBe("tamir kafesinde sıra uzun.");
  });

  it("açılışta olmayan yankıyı hedef göstermez", () => {
    expect(
      titleEchoSentence("tamir kafesi", "sıra uzundu. tamir kafesinde teşhis zor."),
    ).toBeNull();
  });

  it("baştaki bkz'yi atlar", () => {
    expect(titleEchoOpening("tamir kafesi", "(bkz: onarım hakkı) tamir kafesinde sıra uzun.")).toBe(
      "tamir kafesinde",
    );
  });

  it("alıntıdaki kesme işaretini kapanış saymaz", () => {
    const body = "‘Ankara’nın yolları taşlı.’ tamir kafesinde sıra uzun.";
    expect(titleEchoOpening("tamir kafesi", body)).toBe("tamir kafesinde");
    expect(titleEchoSentence("tamir kafesi", body)).toBe("tamir kafesinde sıra uzun.");
  });

  it("baştaki emojiden sonra gelen alıntıyı da yankı saymaz", () => {
    expect(
      titleEchoOpening("tamir kafesi", "🙂 “tamir kafesi” lafını komşudan duydum."),
    ).toBeNull();
    expect(titleEchoOpening("tamir kafesi", "🙂 tamir kafesinde sıra uzun.")).toBe(
      "tamir kafesinde",
    );
  });

  it("açılış kelimeleri arasındaki bkz'yi de atlar", () => {
    expect(titleEchoOpening("tamir kafesi", "tamir (bkz: onarım hakkı) kafesinde sıra uzun.")).toBe(
      "tamir kafesinde",
    );
  });

  it("eki alan ya da kapanmayan alıntıda açılışı belirsiz sayar", () => {
    expect(
      titleEchoOpening("tamir kafesi", "‘tamir kafesi’ni ilk kez komşudan duydum."),
    ).toBeNull();
    expect(
      titleEchoOpening("tamir kafesi", "'tamir kafesi'ni ilk kez komşudan duydum."),
    ).toBeNull();
    expect(titleEchoOpening("tamir kafesi", "“tamir kafesinde sıra uzun.")).toBeNull();
  });

  it("birleşik emojileri de atlar", () => {
    expect(
      titleEchoOpening("tamir kafesi", "👩‍🔧 “tamir kafesi” lafını komşudan duydum."),
    ).toBeNull();
    expect(
      titleEchoOpening("tamir kafesi", "🛠️ “tamir kafesi” lafını komşudan duydum."),
    ).toBeNull();
    expect(titleEchoSentence("tamir kafesi", "👩‍🔧 tamir kafesinde sıra uzun. herkes bekler.")).toBe(
      "tamir kafesinde sıra uzun.",
    );
  });

  it("bkz içindeki noktayı cümle sonu saymaz", () => {
    const body = "tamir (bkz: dr. caligari) kafesinde sıra uzun. herkes bekler.";
    expect(titleEchoOpening("tamir kafesi", body)).toBe("tamir kafesinde");
    expect(titleEchoSentence("tamir kafesi", body)).toBe(
      "tamir (bkz: dr. caligari) kafesinde sıra uzun.",
    );
  });

  it("renderer'ın bağlantı saymadığı çok satırlı bkz'yi düz metin sayar", () => {
    expect(
      titleEchoOpening("tamir kafesi", "tamir (bkz: onarım\nhakkı) kafesinde sıra uzun."),
    ).toBeNull();
  });

  it("kapanışsız bkz yığınında doğrusal kalır", () => {
    const body = ("tamir " + "(bkz:".repeat(2000)).slice(0, 10000);
    const started = performance.now();
    expect(titleEchoOpening("tamir kafesi", body)).toBeNull();
    expect(performance.now() - started).toBeLessThan(50);
  });
});
