import { wordBounded, wordEnd, wordStart } from "@/lib/text/word-boundary";

export const REVIVAL_CONSTITUTIONAL_ARTICLES = [37, 38, 41] as const;
export const APPEAL_CONSTITUTIONAL_ARTICLES = [39, 40, 41, 42] as const;

/*
  `\b` yerine Unicode sınırı: gerekçesi `@/lib/text/word-boundary`'de.
  Burada ölü olan dal `yazı` idi — `ı` kelime karakteri sayılmadığı için
  sondaki `\b` düşüyor ve "yazı silindi ama neden belli değil" bu kapıdan
  geçiyordu; aynı cümle "entry" ile yazıldığında yakalanıyordu
  (ölçüm, 17 Eylül 2026).

  BU DÜZELTMENİN KAPSAMINDA OLMAYAN, ÖNCEDEN VAR OLAN İKİ AÇIK
  (Astra, 17 Eylül 2026 — ikisi de bu değişiklikten önce ve sonra aynı):

  1. Girdi normalize edilmiyor. `"moderatör haksız".normalize("NFD")` eşleşmiyor,
     çünkü ayrışık aksan ayrı bir işaret karakteri oluyor. `action-policy.ts`
     `normalizedGroundingText` ile NFKC uyguluyor; burada karşılığı yok.
  2. `iu` bayrağı Türkçe yerel harf katlaması yapmıyor: `"YAZI silindi ama neden
     belli değil"` yakalanmıyor. Yani kapı yalnız büyük harfle yazılarak
     aşılabiliyor.

  İkisi de ayrı bir değişiklik ve ayrı bir ölçüm ister; buraya iliştirilmedi.
  Çözüm yolu belli: `ontology-linter.ts` girdiyi NFKD + `tr-TR` küçük harf +
  ASCII katlamasıyla normalize ediyor ve bu yüzden aynı hataların hiçbirine
  sahip değil.
*/
const moderationDiscussionPatterns = [
  new RegExp(
    `${wordBounded("moderatör|moderasyon|gammaz")}.{0,48}${wordBounded("sildi|gizledi|reddetti|haksız|neden")}`,
    "iu",
  ),
  new RegExp(
    `${wordBounded("entry|yazı")}.{0,36}${wordBounded("silindi|gizlendi")}.{0,36}${wordBounded("haksız|neden|moderatör")}`,
    "iu",
  ),
  new RegExp(
    `${wordStart}bu entry${wordEnd}.{0,48}${wordStart}(?:silin|gizlen|geri aç)[\\p{L}0-9_]*`,
    "iu",
  ),
  new RegExp(
    `${wordBounded("itiraz|canlandırma")}.{0,40}${wordStart}(?:talep|karar|redded|kabul)[\\p{L}0-9_]*`,
    "iu",
  ),
] as const;

export function containsModerationDiscussion(body: string): boolean {
  return moderationDiscussionPatterns.some((pattern) => pattern.test(body));
}
