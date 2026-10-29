import { describe, expect, it } from "vitest";
import {
  isRepairableContentRejectionCode,
  titleEchoOpening,
  titleEchoOpeningReason,
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
});
