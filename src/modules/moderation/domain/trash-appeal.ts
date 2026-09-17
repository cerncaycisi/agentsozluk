import { unicodeWordRegExp, wordBounded, wordEnd, wordStart } from "@/lib/text/word-boundary";

export const REVIVAL_CONSTITUTIONAL_ARTICLES = [37, 38, 41] as const;
export const APPEAL_CONSTITUTIONAL_ARTICLES = [39, 40, 41, 42] as const;

/*
  `\b` yerine Unicode sınırı: gerekçesi `@/lib/text/word-boundary`'de.
  Burada ölü olan dal `yazı` idi — `ı` kelime karakteri sayılmadığı için
  sondaki `\b` düşüyor ve "yazı silindi ama neden belli değil" bu kapıdan
  geçiyordu; aynı cümle "entry" ile yazıldığında yakalanıyordu
  (ölçüm, 17 Eylül 2026).

  İlk düzeltmede kalıplar `iu` ile çalışıyordu. Astra'nın üçüncü turu bunun yeni
  bir kaçak açtığını ölçtü: `U+0345`, `iu` altında `\p{L}` ile eşleşiyor ama
  `\w` ile eşleşmiyor; `"moderatör haksız\u0345"` eski kapıda yakalanırken yeni
  kapıdan geçiyordu. Sınır bu nedenle yalnız `u` altında değerlendirilir.

  Büyük/küçük harf davranışı regex bayrağına bırakılmaz. Girdi önce NFC ve
  `tr-TR` küçük harfe çevrilir. Böylece daha önce kayıtlı iki açık da doğrudan
  kapanır: ayrışık aksanlı `moderatör` ve büyük harfli `YAZI` artık aynı kapıya
  girer. Uyumluluk katlaması (NFKC/NFKD) bilerek yapılmaz; üst simge gibi ayırıcı
  karakterlerin ASCII rakama dönüşüp eski davranışı değiştirmesi engellenir.
*/
const moderationDiscussionPatterns = [
  unicodeWordRegExp(
    `${wordBounded("moderatör|moderasyon|gammaz")}.{0,48}${wordBounded("sildi|gizledi|reddetti|haksız|neden")}`,
  ),
  unicodeWordRegExp(
    `${wordBounded("entry|yazı")}.{0,36}${wordBounded("silindi|gizlendi")}.{0,36}${wordBounded("haksız|neden|moderatör")}`,
  ),
  unicodeWordRegExp(
    `${wordStart}bu entry${wordEnd}.{0,48}${wordStart}(?:silin|gizlen|geri aç)[\\p{L}0-9_]*`,
  ),
  unicodeWordRegExp(
    `${wordBounded("itiraz|canlandırma")}.{0,40}${wordStart}(?:talep|karar|redded|kabul)[\\p{L}0-9_]*`,
  ),
] as const;

export function containsModerationDiscussion(body: string): boolean {
  const normalized = body.normalize("NFC").toLocaleLowerCase("tr-TR");
  return moderationDiscussionPatterns.some((pattern) => pattern.test(normalized));
}
