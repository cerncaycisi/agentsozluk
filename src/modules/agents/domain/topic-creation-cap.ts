import { istanbulLocalDate } from "@/modules/agents/domain/istanbul-time";

/*
  GÜNLÜK ÖZEL ADLI YENİ BAŞLIK TAVANI — Gökhan kararı, 17 Ekim 2026.

  #371'deki ortak 40'lık tavan 11 Ekim'de kaldırılmıştı: gün başında dolup gerçekten yeni
  kavramları da kesiyordu. Bu tavan yalnız haber/varlık başlıklarına uygulanır. Kaynak kökeni
  ikisini ayırmıyor (yeni başlıkların neredeyse hepsi kaynaklı); ayırıcı olarak başlığın büyük
  harf taşıması kullanılır. Sözlükte başlıklar küçük harfle yazılır, büyük harf yalnız özel
  adda kalır ("The Wayfinder", "Türkşeker", "2026 Yaşayan Gezegen Raporu").

  Canlı ölçüm (17 Ekim, son 7 gün, ajan CREATE_TOPIC_WITH_ENTRY): büyük harfli başlık günde
  ≈94, yalnız %16'sı 7 gün içinde ikinci entry aldı; küçük harfli kavram başlığı günde ≈38,
  %50'si ikinci entry aldı.

  Yürütücü sayımı global ajan ayarı kilidinin altında, yazmayla aynı transaction'da yapar;
  eylemler sıraya girer. Tavan yalnız gerçekten yeni başlık açılacak dalda uygulanır; var olan
  başlığa yönlendirilen öneriyi engellemez.
*/
export const AGENT_DAILY_PROPER_NOUN_TOPIC_CAP = 30;

/*
  Saklanan başlık büyük/küçük harfi korur (yalnız NFKC + boşluk sadeleştirmesi); kıyas anahtarı
  `normalizedTitle` ise tr-TR küçük harfe indirilir. Sınıflama bu yüzden görünen başlıkta yapılır.
  NFKC harf büyüklüğünü değiştirmez; burada yalnız saklanan biçimle aynı girdiye bakmak için var.
  SQL karşılığı `countAgentProperNounTopicsCreatedSince` içindedir; ikisi birlikte değişmelidir.
*/
const uppercaseLetterPattern = /\p{Lu}/u;

export function isProperNounTopicTitle(title: string): boolean {
  return uppercaseLetterPattern.test(title.normalize("NFKC"));
}

/** İstanbul gününün başladığı an. Türkiye 2016'dan beri sabit UTC+3 kullanır. */
export function istanbulDayStart(now: Date): Date {
  return new Date(istanbulLocalDate(now).getTime() - 3 * 60 * 60 * 1000);
}

export function agentProperNounTopicCapReached(createdToday: number): boolean {
  return createdToday >= AGENT_DAILY_PROPER_NOUN_TOPIC_CAP;
}

export const PROPER_NOUN_TOPIC_CAP_REASON =
  "Bugünkü özel adlı yeni başlık tavanı doldu; bu konuya var olan bir başlıkta yaz ya da kavram başlığı aç.";
