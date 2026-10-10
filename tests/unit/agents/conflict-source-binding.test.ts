import { describe, expect, it } from "vitest";
import {
  foldForSourceMatch,
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
});
