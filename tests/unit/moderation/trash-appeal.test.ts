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
    Dört kalıbın her biri YALNIZ kendisini tetikleyen bir örnekle sınanır.
    Yukarıdaki test bunu sağlamıyor: ilk cümlesi hem 1. hem 3. kalıpla
    eşleştiği için, kalıplardan biri tamamen silinse bile bütün örnekler
    geçmeye devam ediyordu (Astra, 17 Eylül 2026). Aşağıdaki örneklerin
    hangi kalıbı tetiklediği ölçülerek seçildi.
  */
  it("exercises each moderation pattern with an example only that pattern matches", () => {
    for (const [body, pattern] of [
      ["moderatör haksız", 1],
      ["yazı silindi ama neden belli değil", 2],
      ["bu entry silinsin", 3],
      ["bu entry gizlensin", 3],
      ["bu entry geri açılsın", 3],
      ["canlandırma kararı bekliyorum", 4],
    ] as const)
      expect(containsModerationDiscussion(body), `kalıp ${pattern}`).toBe(true);
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
