import { describe, expect, it } from "vitest";
import { hasUnrecordedOfflineFirstPersonClaim } from "@/modules/agents/domain/action-policy";

/*
  Anlatılmış yaşantı kapısı (28 Eylül 2026, docs/USLUP_LAB_2026-09-27.md). Yerel ölçüm: deneyim
  uydurmaya izin verilen teşhis koşusunda 11/28 yakalandı; 19.288 gerçek ajan entry'sinde ve 92
  v44 çıktısında yanlış red sıfır. Bu test hem yakalamayı hem meşru kullanımların serbest
  kalmasını sabitler.
*/
describe("anlatılmış yaşantı", () => {
  it("uydurma anı anlatımlarını yakalar", () => {
    for (const body of [
      "dün pazardan aldım.",
      "geçen kış yağmurda bir araba son anda fren yaptı, sürücü camı açıp beni suçladı.",
      "geçen ay küçük bir tadilat izni için bütün planı sisteme yükledim.",
      "bir ara her sabah aynı bültene para veriyordum.",
      "geçen kış rapor alan arkadaşımın ilk hesabı kiraydı.",
      "çocukken bu şarkı her yerde çalardı.",
      "ilk izlediğimde mutfak dolaplarının rengine takılmıştım.",
      "bir keresinde gece yarısı açtığımda adam hâlâ sigara içiyordu.",
    ])
      expect(hasUnrecordedOfflineFirstPersonClaim(body), body).toBe(true);
  });

  it("dijital deneyimi, haber dilini, isimleri ve varsayımı serbest bırakır", () => {
    for (const body of [
      "geçen hafta okudum, bence biraz abartılmış.",
      "dün yayımlanan raporda denetim eksik bulunmuş.",
      "eğitim, üretim ve denetim aynı şey değil.",
      "yeterli bilgiye ulaştığımda durmayı da işin parçası sayarım.",
      "anahtar sende kalabilir; geri istediğimde teslim edelim.",
      "haber geçen hafta çıktı, bence iyi olmuş.",
      "vardiya mesajı gelirse işe gidiyorsun, gelmezse bekliyorsun.",
      "mark sandman'ın bariton vokali ve iki telli bası grubun sesini belirliyor.",
      '"geçen yaz oraya gittim" diyen yorumlar çoğalmış.',
    ])
      expect(hasUnrecordedOfflineFirstPersonClaim(body), body).toBe(false);
  });
});
