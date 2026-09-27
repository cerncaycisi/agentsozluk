import { describe, expect, it } from "vitest";
import { runtimePromptScaffold } from "@/runtime/prompt-profile";
import { renderRuntimeWritingVariation } from "@/runtime/writing-variation";

/*
  Üslup turu 3 (28 Eylül 2026, docs/USLUP_LAB_2026-09-27.md). Yerel kopyada gerçek üretim
  bağlamlarıyla ölçüldü. Bu test yalnız bloğun prompt'a girdiğini ve kaldırılan kalıpların geri
  gelmediğini doğrular — DAVRANIŞI DEĞİL. Geri alma bu testi de düşürür: değişikliğin bilinçli
  olduğu görünür.
*/
describe("üslup turu 3", () => {
  const talimatlar = runtimePromptScaffold.dictionaryInstructions as readonly string[];
  const blok = talimatlar.slice(0, talimatlar.indexOf("# Nasıl yazılır") + 8).join("\n");

  it("ürün amacı bloğunun başında duruyor", () => {
    expect(talimatlar[0]).toBe("# Nasıl yazılır");
    expect(blok).toContain("zekice görünmeye çalışma; cilalı metin yapay görünür");
    expect(blok).toContain("'X değil Y' karşıtlığı");
    expect(blok).toContain("Noktalı virgül kullanma");
    expect(blok).toContain("kaynak adıyla ('X'in aktardığına göre') yazma");
  });

  it("güvenlik sınırlarını ve sözlük davranışlarının iznini aynen taşıyor", () => {
    expect(blok).toContain(
      "kişilere hakaret, görünüşüne/kimliğine alay ve kişilik hakkı ihlali yok",
    );
    expect(blok).toContain("yaşamadığın fiziksel bir deneyimi (gittim, yedim, gördüm) uydurma");
    expect(blok).toContain("kanıtın desteklemediği kesin olgu, sayı ya da alıntı yazma");
    expect(blok).toContain("(bkz: başlık) vermek sözlükte çok olağandır");
    expect(blok).toContain("Gövdede soru sormak da serbest");
  });

  it("v43 cümlesi ve deneme iskeleti geri gelmiyor", () => {
    const hepsi = talimatlar.join("\n");
    expect(hepsi).not.toContain("Entry'ni ekşi sözlük tarzında yaz");
    expect(hepsi).not.toContain("Haber ya da kaynak özeti yazma");
    const render = Array.from({ length: 64 }, (_, index) =>
      renderRuntimeWritingVariation(`00000000-0000-4000-8000-${String(index).padStart(12, "0")}`),
    ).join("\n");
    for (const kalip of ["ne gösterdiği", "yargıyla bitir", "- Açılış:", "- Gelişim:", "- Bitiş:"])
      expect(render).not.toContain(kalip);
  });
});
