import { describe, expect, it } from "vitest";
import {
  hasUnrecordedLivedExperienceNarrative,
  hasUnrecordedOfflineFirstPersonClaim,
  isRepairableContentRejectionCode,
} from "@/modules/agents/domain/action-policy";

/*
  Anlatılmış yaşantı kapısı (28 Eylül 2026, docs/USLUP_LAB_2026-09-27.md). Sezgisel olduğu için
  ayrı ve onarılabilir kod; kimlik/biyografi kapısı (`hasUnrecordedOfflineFirstPersonClaim`)
  değişmedi. Serbest listedeki örneklerin çoğu Astra'nın ilk incelemesindeki yanlış redlerdir.
*/
describe("anlatılmış yaşantı", () => {
  it("uydurma anı anlatımlarını yakalar", () => {
    for (const body of [
      "dün pazardan aldım.",
      "geçen kış yağmurda bir araba son anda fren yaptı, sürücü camı açıp beni suçladı.",
      "geçen ay küçük bir tadilat izni için bütün planı sisteme yükledim.",
      "bir ara her sabah aynı bültene para veriyordum.",
      "geçen kış bir arkadaşım iki kez taksiye binmiş.",
      "çocukken bu şarkıyı her yerde dinlerdim.",
      "ilk izlediğimde mutfak dolaplarının rengine takılmıştım.",
      "bir ara gece otobüsünde durağımı kaçırmıştım.",
      "DÜN PAZARDAN ALDIM.",
      "iyi bir albüm.\ngeçen hafta konserine gittim",
    ])
      expect(hasUnrecordedLivedExperienceNarrative(body), body).toBe(true);
  });

  it("dijital etkinliği, kanaati, aktarımı ve isimleri serbest bırakır", () => {
    for (const body of [
      "geçen hafta okudum, bence biraz abartılmış.",
      "dün açıklanan faiz kararına açıkçası şaşırdım.",
      "DÜN YAZDIM.",
      "dün bu entryye oy verdim.",
      "dün yazdığım entrydeki yazım hatasını düzelttim.",
      "bu başlığı takip ediyordum.",
      "geçen hafta bu başlığı açmıştım.",
      "hocam bu yorumun dayanağı ne?",
      "çocukken duyduğun şarkılar kolay unutulmuyor.",
      "küçükken sevdiğimiz çizgi filmler büyüyünce başka görünüyor.",
      "yazar çocukken bu kitabı okumuş.",
      "sevgilim adlı şarkının nakaratı çok akılda kalıcı.",
      "geçen hafta çıkan albüm benim için yılın en iyisi.",
      "bana göre dün açıklanan karar yanlış.",
      "dün ben bu başlıkta yazdım.",
      "bu konuda bir ara vermek benim için daha iyi.",
      "yazar dün gittim, kapalıydı dedi.",
      "yazar gitmiştim diyor ama inandırıcı değil.",
      "gitmiştim sözcüğü duyulan geçmiş zamanın hikâyesidir.",
      "dün çıkan albümdeki tek yenilik ritim.",
      "dün açıklanan ölçü beş santim.",
      "DÜN ÇIKAN ALBÜMDEKİ TEK YENİLİK RİTİM.",
      "dün çıkan albümler\nbenim önerim eski kayıtları dinlemek",
      "dün yayımlanan raporda denetim eksik bulunmuş.",
      "eğitim, üretim ve denetim aynı şey değil.",
      "anahtar sende kalabilir; geri istediğimde teslim edelim.",
      "haber geçen hafta çıktı, bence iyi olmuş.",
      '"geçen yaz oraya gittim" diyen yorumlar çoğalmış.',
    ])
      expect(hasUnrecordedLivedExperienceNarrative(body), body).toBe(false);
  });

  it("onarılabilir ayrı koddur; kimlik kapısını genişletmez", () => {
    expect(isRepairableContentRejectionCode("UNRECORDED_LIVED_EXPERIENCE_NARRATIVE")).toBe(true);
    expect(isRepairableContentRejectionCode("UNRECORDED_OFFLINE_FIRST_PERSON_CLAIM")).toBe(false);
    expect(hasUnrecordedOfflineFirstPersonClaim("dün pazardan aldım.")).toBe(false);
  });
});
