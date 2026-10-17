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
  Yalnız `Lu`: başlık harfi (`Lt`, örn. "ᾈ") sayılmaz. Günlük sayım da başlıkları çekip bu
  fonksiyonla sınıflar; SQL `[[:upper:]]` libc'ye göre `Lt`'yi de sayabildiği için kullanılmaz
  (Astra tavan 1. tur P3).
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

/*
  Ret kodu `TOPIC_CREATION_DISABLED` genel ayar kapatmasıyla ortak kalır (güvenli kod sözleşmesi);
  tavanı ayıran alt neden ve kota günü eylemin `validationResult.rejectionDetail` alanında saklanır.
  Sonraki koşunun sonuç kartı bunu yalnız kota günü bugünün İstanbul günüyse gösterir (Astra
  tavan 1. tur P2): dünkü tavan bugün geçerli değildir.
*/
export const PROPER_NOUN_DAILY_CAP_SUB_REASON = "PROPER_NOUN_DAILY_CAP";

export interface ProperNounCapRejectionDetail {
  subReason: typeof PROPER_NOUN_DAILY_CAP_SUB_REASON;
  /** İstanbul takvim günü, `YYYY-MM-DD`. */
  quotaDay: string;
}

/** Kota anının İstanbul takvim günü (`YYYY-MM-DD`). */
export function istanbulQuotaDay(at: Date): string {
  return istanbulLocalDate(at).toISOString().slice(0, 10);
}

export function properNounCapRejectionDetail(quotaAt: Date): ProperNounCapRejectionDetail {
  return { subReason: PROPER_NOUN_DAILY_CAP_SUB_REASON, quotaDay: istanbulQuotaDay(quotaAt) };
}

const quotaDayPattern = /^\d{4}-\d{2}-\d{2}$/u;

/** Saklanmış doğrulama sonucundan tavan ayrıntısını okur; biçim tutmazsa `null`. */
export function readProperNounCapRejectionDetail(
  validationResult: unknown,
): ProperNounCapRejectionDetail | null {
  if (typeof validationResult !== "object" || validationResult === null) return null;
  const detail = (validationResult as { rejectionDetail?: unknown }).rejectionDetail;
  if (typeof detail !== "object" || detail === null) return null;
  const { subReason, quotaDay } = detail as { subReason?: unknown; quotaDay?: unknown };
  if (subReason !== PROPER_NOUN_DAILY_CAP_SUB_REASON) return null;
  if (typeof quotaDay !== "string" || !quotaDayPattern.test(quotaDay)) return null;
  return { subReason, quotaDay };
}
