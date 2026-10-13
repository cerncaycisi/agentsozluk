import { describe, expect, it } from "vitest";
import { differsOnlyByVariantToken } from "@/modules/moderation/domain/karagoz";

// 13 Ekim: sürüm, baskı ve model farkı kopya değildir (ilk canlı tarama ve 12 Ekim etiketli set).
describe("karagöz sürüm/model farkı", () => {
  it("rakamlı ya da tek harfli sözcük farkını kopya saymaz", () => {
    for (const [left, right] of [
      ["CMF Speaker M", "CMF Speaker S"],
      ["Samsung Galaxy S23", "Samsung Galaxy S27"],
      ["10. Çanakkale Bienali", "Çanakkale Bienali"],
      ["2026 Yaşayan Gezegen Raporu", "Yaşayan Gezegen Raporu"],
      ["iOS 26.6.2", "iOS 26.6.1"],
      ["The Witcher 3", "The Witcher 4"],
    ])
      expect(differsOnlyByVariantToken(left!, right!)).toBe(true);
  });

  it("yazım, ek ya da kurum adı farkını kopya adayı olarak bırakır", () => {
    for (const [left, right] of [
      ["devir-teslim tutanağı", "devir teslim tutanağı"],
      ["biyoturbasyon", "biyotürbasyon"],
      ["WWF 2026 Yaşayan Gezegen Raporu", "2026 Yaşayan Gezegen Raporu"],
      ["yılanlar", "yılan"],
    ])
      expect(differsOnlyByVariantToken(left!, right!)).toBe(false);
  });
});
