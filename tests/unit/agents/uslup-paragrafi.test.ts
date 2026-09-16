import { describe, expect, it } from "vitest";
import { runtimePromptScaffold } from "@/runtime/prompt-profile";

/*
  Üslup paragrafı 16 Eylül 2026'da ölçümle eklendi ve SINIRLI CANLI DENEME olarak duruyor.
  Bu test yalnız paragrafın prompt'a girdiğini doğrular — DAVRANIŞI DEĞİL. Ölçüm sonucu
  `docs/SEMA_TARZ_2026-09-16.md` içindedir; üç ölçütün hiçbiri tek başına anlamlılık
  eşiğini geçmemiştir.

  Geri alma bu testi de düşürür: paragraf silinince burası kırmızı yanar ve kaldırmanın
  bilinçli olduğu görünür.
*/
describe("üslup paragrafı", () => {
  const talimatlar = runtimePromptScaffold.dictionaryInstructions as readonly string[];

  it("ürün amacı bloğunun ilk talimatı olarak duruyor", () => {
    expect(talimatlar[0]).toContain("ekşi sözlük tarzında yaz");
    expect(talimatlar[0]).toContain("küçük harfle başla");
    expect(talimatlar[0]).toContain("Başlığı tekrar edip tanım kurma");
  });

  it("kısa kalıyor — uzun kural listesi işe yaramadığı ölçüldü", () => {
    expect(talimatlar[0]!.length).toBeLessThan(220);
  });
});
