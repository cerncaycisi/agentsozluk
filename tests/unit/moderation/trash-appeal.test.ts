import { describe, expect, it } from "vitest";
import {
  APPEAL_CONSTITUTIONAL_ARTICLES,
  REVIVAL_CONSTITUTIONAL_ARTICLES,
} from "@/modules/moderation/domain/trash-appeal";

/*
  `containsModerationDiscussion` ve testleri 18 Eylül 2026'da kaldırıldı;
  gerekçe ve ölçümler domain dosyasının başındadır. Regex kapısının yerine
  senkron bir model kapısı konmadı — o yol `docs/BACKLOG.md` kuyruğunda.
*/
describe("trash, revival and appeal domain", () => {
  it("pins revival and appeal decisions to the constitutional article sets", () => {
    expect(REVIVAL_CONSTITUTIONAL_ARTICLES).toEqual([37, 38, 41]);
    expect(APPEAL_CONSTITUTIONAL_ARTICLES).toEqual([39, 40, 41, 42]);
  });
});
