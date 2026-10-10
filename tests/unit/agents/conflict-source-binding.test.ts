import { describe, expect, it } from "vitest";
import {
  foldForSourceMatch,
  presentedSourceItems,
  presentedSourceTextNamesTopic,
} from "@/modules/agents/domain/conflict-source-binding";

const item = (safeText: string, title = "Haber") => ({ title, summary: null, safeText });

describe("oku, sonra karar ver kaynak bağı (Astra #377 2. tur)", () => {
  it("matches whole words only", () => {
    expect(presentedSourceTextNamesTopic([item("Yazılım sunucusunun bakımı uzadı.")], "su")).toBe(
      false,
    );
    expect(presentedSourceTextNamesTopic([item("Adalet sistemi tartışılıyor.")], "ada")).toBe(
      false,
    );
    expect(presentedSourceTextNamesTopic([item("Su baskını mahalleyi etkiledi.")], "su")).toBe(
      true,
    );
  });

  it("folds Turkish dotless i, diacritics and punctuation in both directions", () => {
    expect(presentedSourceTextNamesTopic([item("OPENAI yeni modelini duyurdu.")], "openai")).toBe(
      true,
    );
    expect(presentedSourceTextNamesTopic([item("türkiye ekonomisi")], "TÜRKİYE")).toBe(true);
    expect(presentedSourceTextNamesTopic([item("gıda-güvenliği raporu")], "gıda güvenliği")).toBe(
      true,
    );
    expect(foldForSourceMatch("Çağrı İğneada")).toBe("cagri igneada");
  });

  it("searches only the part shown to the agent", () => {
    const hiddenTail = `${"a ".repeat(450)}Saklı Kavram`;
    expect(presentedSourceTextNamesTopic([item(hiddenTail)], "Saklı Kavram")).toBe(false);
    expect(
      presentedSourceTextNamesTopic([item("x", "Saklı Kavram duyuruldu")], "Saklı Kavram"),
    ).toBe(true);
  });

  it("ignores the half word left at a truncation point (Sol #377)", () => {
    // 797 karakterlik önek: 800 sınırında kalan metin tam olarak "…a su…" olur.
    const cut = `${"a".repeat(796)} sunucusunun bakımı`;
    expect(presentedSourceTextNamesTopic([item(cut)], "su")).toBe(false);
  });

  it("keeps a complete name right before the cut (Sol #377 2. tur)", () => {
    const prefix = "a".repeat(790);
    // Kesim "OpenAI’n…" ya da "OpenAI:…" ile biter; tam ad korunur, yalnız "n" düşer.
    expect(
      presentedSourceTextNamesTopic([item(`${prefix} OpenAI’nin yeni modeli`)], "OpenAI"),
    ).toBe(true);
    expect(presentedSourceTextNamesTopic([item(`${prefix} OpenAI: yeni model`)], "OpenAI")).toBe(
      true,
    );
  });

  it("treats a combining mark before the cut as part of a half word (Sol #377 3. tur)", () => {
    const cut = `${"a".repeat(793)} भारतीय devam`;
    expect(presentedSourceTextNamesTopic([item(cut)], "भारत")).toBe(false);
  });

  it("reads only the cited items from the frozen snapshot", () => {
    const perception = {
      sourceItems: [
        { itemId: "a", title: "Dolu kavram haberi", safeText: "metin", summary: null },
        { itemId: "b", title: "Başka kavram", safeText: "metin", summary: null },
      ],
    };
    expect(presentedSourceItems(perception, ["b"])).toEqual([
      { title: "Başka kavram", summary: null, safeText: "metin" },
    ]);
    expect(
      presentedSourceTextNamesTopic(presentedSourceItems(perception, ["b"]), "Dolu kavram"),
    ).toBe(false);
    expect(presentedSourceItems(null, ["a"])).toEqual([]);
  });
});
