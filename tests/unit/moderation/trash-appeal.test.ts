import { describe, expect, it } from "vitest";
import {
  APPEAL_CONSTITUTIONAL_ARTICLES,
  containsModerationDiscussion,
  REVIVAL_CONSTITUTIONAL_ARTICLES,
} from "@/modules/moderation/domain/trash-appeal";

describe("trash, revival and appeal domain", () => {
  it("pins revival and appeal decisions to the constitutional article sets", () => {
    expect(REVIVAL_CONSTITUTIONAL_ARTICLES).toEqual([37, 38, 41]);
    expect(APPEAL_CONSTITUTIONAL_ARTICLES).toEqual([39, 40, 41, 42]);
  });

  it("keeps moderation arguments out of a revised public entry", () => {
    expect(
      containsModerationDiscussion(
        "Bu entry moderatör haksız yere sildiği için geri açılmalıdır; gerekçeyi kabul etmiyorum.",
      ),
    ).toBe(true);
    expect(
      containsModerationDiscussion(
        "Entry silindi, neden gizlendiği de moderatör tarafından açıklanmadı.",
      ),
    ).toBe(true);
    expect(
      containsModerationDiscussion(
        "Canlandırma talebi reddedildiği için bu notu entry içine ekliyorum.",
      ),
    ).toBe(true);
  });

  /*
    Kapsam KALIP değil DAL düzeyinde.

    İki tur sürdü. Önce dört kalıbın her birine yalnız kendisini tetikleyen bir
    örnek verdim; bu, kalıbın tamamen silinmesini yakalıyor. Ama Astra
    (17 Eylül 2026) `moderasyon`, `gammaz`, `reddetti`, `itiraz` ve `kabul`
    alternatiflerini TEK TEK `(?!)` ile kapattı ve on yedi assertion'ın hepsi
    geçmeye devam etti — kalıp saklanamıyordu ama dal saklanabiliyordu.

    Aşağıda her grubun her alternatifi en az bir kez geçer. Bir alternatifi
    kapatmak en az bir satırı düşürür.
  */
  it("exercises every alternative of every moderation pattern", () => {
    for (const [body, covers] of [
      ["moderatör sildi", "1: moderatör × sildi"],
      ["moderasyon gizledi", "1: moderasyon × gizledi"],
      ["gammaz reddetti", "1: gammaz × reddetti"],
      ["moderatör haksız", "1: haksız"],
      ["gammaz neden", "1: neden"],
      ["entry silindi ama neden belli değil", "2: entry × silindi × neden"],
      ["yazı gizlendi, haksız bir karar", "2: yazı × gizlendi × haksız"],
      ["yazı silindi, moderatör açıklamadı", "2: moderatör"],
      ["bu entry silinsin", "3: silin"],
      ["bu entry gizlensin", "3: gizlen"],
      ["bu entry geri açılsın", "3: geri aç"],
      ["itiraz talep ediyorum", "4: itiraz × talep"],
      ["canlandırma kararı bekliyorum", "4: canlandırma × karar"],
      ["itiraz reddedildi", "4: redded"],
      ["canlandırma kabul edildi", "4: kabul"],
    ] as const)
      expect(containsModerationDiscussion(body), covers).toBe(true);
  });

  /*
    `yazı` dalı `\b` yüzünden ölüydü: `ı` kelime karakteri sayılmadığı için
    sondaki sınır düşüyor ve aynı cümle "entry" ile yakalanırken "yazı" ile
    kapıdan geçiyordu (ölçüm, 17 Eylül 2026).
  */
  it("catches the Turkish-final branch as well as its ASCII twin", () => {
    for (const body of [
      "entry silindi ama neden belli değil",
      "yazı silindi ama neden belli değil",
      "yazı gizlendi, haksız bir karar",
    ])
      expect(containsModerationDiscussion(body)).toBe(true);

    // Sınır kelime ortasında tetiklenmemeli.
    expect(containsModerationDiscussion("kağıtyazı silindi ama neden belli değil")).toBe(false);
  });

  it("does not reject an ordinary dictionary entry merely for mentioning moderation", () => {
    expect(
      containsModerationDiscussion(
        "İçerik moderasyonu, çevrimiçi topluluklarda görünürlük ve davranış kurallarını uygulama pratiğidir.",
      ),
    ).toBe(false);
    expect(
      containsModerationDiscussion(
        "Gammaz, sözlüklerde biçimsel veya hukuki bir sorunu yetkili kuyruğa bildiren kullanıcıdır.",
      ),
    ).toBe(false);
  });
});
