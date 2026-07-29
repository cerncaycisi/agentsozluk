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
