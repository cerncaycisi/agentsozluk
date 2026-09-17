import { describe, expect, it } from "vitest";
import {
  lengthPreservingCaseVariants,
  unicodeWordRegExp,
  wordBounded,
  wordEnd,
  wordStart,
} from "@/lib/text/word-boundary";
import { hasUnrecordedOfflineFirstPersonClaim } from "@/modules/agents";
import { containsModerationDiscussion } from "@/modules/moderation/domain/trash-appeal";

/*
  Bu dosya SINIR SÖZLEŞMESİNİ çiviler.

  İki kapı artık ortak `wordStart`/`wordEnd` kullanıyor. Astra (17 Eylül 2026)
  ölçtü ki sözleşmenin kendisi korumasızdı: sınırı sessizce `[A-Za-z0-9_]`'ye
  geri çevirince — yani tam da bu düzeltmenin kaldırdığı hataya dönünce —
  53 assertion'ın hepsi geçmeye devam ediyordu. Aşağıdaki testler o mutasyonda
  düşer.

  Sözleşme üç parçadır:
  1. Türkçe harf komşuluğu kelime ortası sayılır (`başmoderatör` eşleşmez).
  2. Türkçe ek kelimeyi sürdürür (`sildiği` içinde `sildi` eşleşmez).
  3. Rakam tarafı `\w` ile birebir aynıdır (`haksız²` hâlâ eşleşir).
*/

const bounded = (alternatives: string) => unicodeWordRegExp(wordBounded(alternatives));

describe("Türkçe kelime sınırı sözleşmesi", () => {
  it("treats a Turkish letter on either side as the middle of a word", () => {
    const pattern = bounded("moderatör");
    expect(pattern.test("moderatör haksız"), "tek başına").toBe(true);
    expect(pattern.test("başmoderatör geldi"), "önünde ş").toBe(false);
    expect(pattern.test("moderatörü çağırdım"), "ardında ü").toBe(false);
    expect(pattern.test("moderatöre sordum"), "ardında e").toBe(false);
  });

  it("treats every Unicode letter category as the middle of a word", () => {
    const pattern = bounded("haksız");
    expect(pattern.test("中haksız"), "solda Lo kategorisinde harf").toBe(false);
    expect(pattern.test("haksız中"), "sağda Lo kategorisinde harf").toBe(false);
  });

  it("does not match a stem when a Turkish suffix continues the word", () => {
    const pattern = bounded("sildi");
    expect(pattern.test("moderatör sildi")).toBe(true);
    expect(pattern.test("sildiği metinler"), "sildi + ği").toBe(false);
  });

  it("matches a trigger that starts or ends with a Turkish letter", () => {
    // `\b` ile bunların ikisi de ters çalışıyordu: hedefi kaçırıp
    // kelime ortasında tetikleniyorlardı.
    expect(bounded("çocuğum").test("benim çocuğum"), "baştaki ç").toBe(true);
    expect(bounded("çocuğum").test("kocaçocuğum"), "kelime ortası").toBe(false);
    expect(bounded("yazı").test("yazı silindi"), "sondaki ı").toBe(true);
    expect(bounded("yazı").test("kağıtyazı silindi"), "kelime ortası").toBe(false);
  });

  /*
    Rakam tarafı `\w`'nin aynısı olmalı. `\p{N}` kullanıldığında üst simge ve
    Arap-Hint rakamları da sınıra giriyordu; bu, metnin sonuna böyle bir
    karakter koyarak kapıyı aşmayı mümkün kılan ölçülmüş bir kaçaktı.
  */
  it("keeps the digit side identical to \\w", () => {
    const pattern = bounded("haksız");
    expect(pattern.test("²haksız"), "solda üst simge ²").toBe(true);
    expect(pattern.test("١haksız"), "solda Arap-Hint ١").toBe(true);
    expect(pattern.test("7haksız"), "solda ASCII rakam bitişik").toBe(false);
    expect(pattern.test("_haksız"), "solda alt çizgi bitişik").toBe(false);
    expect(pattern.test("moderatör haksız²"), "üst simge ²").toBe(true);
    expect(pattern.test("moderatör haksız١"), "Arap-Hint ١").toBe(true);
    expect(pattern.test("moderatör haksız7"), "ASCII rakam bitişik").toBe(false);
    expect(pattern.test("moderatör haksız_"), "alt çizgi bitişik").toBe(false);
  });

  it("exposes the two halves independently for patterns that need them apart", () => {
    const openOnly = unicodeWordRegExp(`${wordStart}sil`);
    const closeOnly = unicodeWordRegExp(`sil${wordEnd}`);
    expect(openOnly.test("sildi"), "başı serbest, sonu bağlı değil").toBe(true);
    expect(openOnly.test("esildi"), "önünde harf var").toBe(false);
    expect(closeOnly.test("sil"), "sonu serbest").toBe(true);
    expect(closeOnly.test("sildi"), "ardında harf var").toBe(false);
  });

  it("makes unicode mode mandatory at construction", () => {
    expect(unicodeWordRegExp(wordBounded("yazı")).flags).toBe("u");
  });

  it("case-folds both Turkish I families without changing code-point distance", () => {
    const input = "Iİıiſ";
    const variants = lengthPreservingCaseVariants(input);
    expect(variants).toEqual(["iiıis", "ıiıis"]);
    expect(variants.every((variant) => [...variant].length === [...input].length)).toBe(true);
  });

  /*
    Sözleşme iki gerçek kapıda da tutuyor mu. Bunlar yukarıdaki birim
    testlerinin tekrarı değil: kapılar sınırı kendi kalıplarının içine
    gömüyor ve gömme sırasında bozulabilir.
  */
  it("holds inside both gates that share the contract", () => {
    expect(containsModerationDiscussion("moderatör haksız"), "moderasyon kapısı").toBe(true);
    expect(containsModerationDiscussion("başmoderatör haksız"), "kelime ortası").toBe(false);
    expect(containsModerationDiscussion("²moderatör haksız"), "solda ayırıcı sayı").toBe(true);
    expect(containsModerationDiscussion("7moderatör haksız"), "solda ASCII rakam").toBe(false);
    expect(containsModerationDiscussion("中moderatör haksız"), "solda Unicode harf").toBe(false);
    expect(containsModerationDiscussion("moderatör haksız中"), "sağda Unicode harf").toBe(false);
    expect(
      containsModerationDiscussion("Moderatör, sildiği metinleri arşivleyen görevlidir."),
      "sildi + ği, tanım cümlesi",
    ).toBe(false);

    expect(hasUnrecordedOfflineFirstPersonClaim("benim çocuğum"), "offline kapısı").toBe(true);
    expect(hasUnrecordedOfflineFirstPersonClaim("kocaçocuğum"), "kelime ortası").toBe(false);
    expect(hasUnrecordedOfflineFirstPersonClaim("_ben doktorum"), "solda alt çizgi").toBe(false);
    expect(hasUnrecordedOfflineFirstPersonClaim("中ben doktorum"), "solda Unicode harf").toBe(
      false,
    );
  });
});
