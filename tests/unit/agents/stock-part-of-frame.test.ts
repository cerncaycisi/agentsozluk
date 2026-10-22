import { describe, expect, it } from "vitest";
import {
  isRepairableContentRejectionCode,
  stockPartOfFrame,
  stockPartOfFrameReason,
  stockPartOfFrames,
} from "@/modules/agents/domain/action-policy";

/*
  "X de Y'nin parçası(dır)" çerçevesi (22 Ekim 2026). Canlı örnekler (yerel kopya, son 4 gün) ve
  yakalanmaması gereken gerçek parça anlatımları.
*/
describe("stock 'part of' framing", () => {
  it.each([
    [
      "toplu yemek hizmetinde kaliteyi puanlamak da hesabın parçası. sıcaklık takibi önemli.",
      "da hesabın parçası",
    ],
    [
      "artımlı oyunda beklemek de bazen oynamanın parçası olur; sayaç dolana kadar",
      "de bazen oynamanın parçası olur",
    ],
    [
      "robot kapıya geldiğinde bina numarasını bulmak da rotanın parçası oluyor; kaldırım",
      "da rotanın parçası oluyor",
    ],
    ["bölgesel havayolunda havaalanına varmak da uçuşun parçasıdır.", "da uçuşun parçasıdır"],
    [
      "Kaldırımın yağmur suyu ızgarası da yürüyüş hattının parçasıdır; aralıkları geniş",
      "da yürüyüş hattının parçasıdır",
    ],
    ["veri dosyasını kaydetmek de dersin parçası olmalı.", "de dersin parçası olmalı"],
    ["yağmur da şehrin parçası sayılır.", "da şehrin parçası sayılır"],
    // Sol 6.1, 22 Ekim P3: parantez kalıbı denetimden kaçırmamalı.
    ["(beklemek de oyunun parçası).", "de oyunun parçası"],
    ["beklemek de oyunun parçası (süre böyle uzuyor).", "de oyunun parçası"],
  ])("catches %s", (body, frame) => {
    expect(stockPartOfFrame(body)).toBe(frame);
  });

  it.each([
    "motorun en pahalı parçası krank mili.",
    "bu film serinin üçüncü parçası, ilk ikisinden zayıf.",
    "ben de oraya gittim, bisikletin bir parçası kırıldı.",
    '"Bu da işin parçası" diye bir laf var ama bence saçma.',
    "oyunun parçası olmak da bir tercih.",
    "(bkz: işin de bir parçası) güzel başlık.",
    // Sol 6.1, 22 Ekim: gerçek parça tanımı ve tek tırnaklı / satır atlayan alıntı.
    "krank mili de motorun bir parçasıdır.",
    "‘beklemek de oyunun parçası.’ sözünü kullanmış.",
    "şöyle demiş: “beklemek de oyunun\nparçası.” bence abartı.",
  ])("leaves real 'part' talk alone: %s", (body) => {
    expect(stockPartOfFrame(body)).toBeNull();
  });

  it("is repairable and the reason quotes the frame", () => {
    expect(isRepairableContentRejectionCode("STOCK_FRAMING_PART_OF")).toBe(true);
    expect(stockPartOfFrameReason("da rotanın parçası")).toContain("“da rotanın parçası”");
  });

  it("returns every frame so one repair can fix them all", () => {
    expect(stockPartOfFrames("beklemek de oyunun parçası. yürümek de yolculuğun parçası.")).toEqual(
      ["de oyunun parçası", "de yolculuğun parçası"],
    );
  });

  it("strips unmatched quotes in linear time", () => {
    const body = "“a".repeat(20_000);
    const started = performance.now();
    expect(stockPartOfFrame(body)).toBeNull();
    expect(performance.now() - started).toBeLessThan(200);
  });
});
