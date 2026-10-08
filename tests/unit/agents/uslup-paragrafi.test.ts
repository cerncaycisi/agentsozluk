import { describe, expect, it, vi } from "vitest";
import type * as WritingVariation from "@/runtime/writing-variation";
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
  const blok = talimatlar.slice(0, talimatlar.indexOf("# Nasıl yazılır") + 9).join("\n");

  it("ürün amacı bloğunun başında duruyor", () => {
    expect(talimatlar[0]).toBe("# Nasıl yazılır");
    // 8 Ekim 2026: blok persona önceliğini söyler; herkese "esprisiz, benzetmesiz" yasağı kalktı.
    expect(blok).toContain("Kendi personanın sesiyle yaz.");
    expect(blok).toContain("Mizahın varsa kullan");
    expect(blok).toContain("Hep aynı kalıpla yazma.");
    expect(blok).toContain("Cilalı deneme kurma");
    expect(blok).not.toContain("zekice görünmeye çalışma");
    expect(blok).not.toContain("Benzetme, metafor");
    expect(blok).toContain("Kaynak adını süs ya da giriş kalıbı olarak");
    // Gerekli atıf korunur (anayasa: alıntıda kaynak; persona: iddianın sahibi).
    expect(blok).toContain("kime ait olduğunu sade biçimde söyle");
  });

  it("güvenlik sınırlarını ve sözlük davranışlarının iznini aynen taşıyor", () => {
    expect(blok).toContain(
      "kişilere hakaret, görünüşüne/kimliğine alay ve kişilik hakkı ihlali yok",
    );
    expect(blok).toContain("yaşamadığın fiziksel bir deneyimi (gittim, yedim, gördüm) uydurma");
    expect(blok).toContain("kanıtın desteklemediği kesin olgu, sayı ya da alıntı yazma");
    expect(blok).toContain("(bkz: başlık) vermek sözlükte çok olağandır");
    expect(blok).toContain("Gövdede soru sormak serbest");
    expect(blok).toContain("okuduğun bir hükme katılmıyorsan itiraz et");
    expect(blok).toContain("kişileri, kimlikleri ve savunmasızları hedef almadan");
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

  it("seçim tohumu sürümü değişince profil özeti değişir (Astra f585cca P2, b8eef9d P3)", async () => {
    const { RUNTIME_PROMPT_PROFILE_HASH: asil } = await import("@/runtime/prompt-profile");
    vi.resetModules();
    vi.doMock("@/runtime/writing-variation", async (importOriginal) => ({
      ...(await importOriginal<typeof WritingVariation>()),
      RUNTIME_WRITING_VARIATION_SELECTION_SEED_VERSION: 9,
    }));
    const { RUNTIME_PROMPT_PROFILE_HASH: degisik } = await import("@/runtime/prompt-profile");
    vi.doUnmock("@/runtime/writing-variation");
    vi.resetModules();
    expect(degisik).not.toBe(asil);
  });
});
