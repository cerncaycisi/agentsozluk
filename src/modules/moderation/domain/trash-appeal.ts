import { wordBounded, wordEnd, wordStart } from "@/lib/text/word-boundary";
export const REVIVAL_CONSTITUTIONAL_ARTICLES = [37, 38, 41] as const;
export const APPEAL_CONSTITUTIONAL_ARTICLES = [39, 40, 41, 42] as const;

/*
  `\b` yerine Unicode sınırı: gerekçesi `@/lib/text/word-boundary`'de.
  Burada ölü olan dal `yazı` idi — `ı` kelime karakteri sayılmadığı için
  sondaki `\b` düşüyor ve "yazı silindi ama neden belli değil" bu kapıdan
  geçiyordu; aynı cümle "entry" ile yazıldığında yakalanıyordu
  (ölçüm, 17 Eylül 2026).
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
    `${wordStart}bu entry${wordEnd}.{0,48}${wordStart}(?:silin|gizlen|geri aç)[\\p{L}\\p{N}_]*`,
    "iu",
  ),
  new RegExp(
    `${wordBounded("itiraz|canlandırma")}.{0,40}${wordStart}(?:talep|karar|redded|kabul)[\\p{L}\\p{N}_]*`,
    "iu",
  ),
] as const;

export function containsModerationDiscussion(body: string): boolean {
  return moderationDiscussionPatterns.some((pattern) => pattern.test(body));
}
