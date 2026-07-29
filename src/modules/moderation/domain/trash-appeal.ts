export const REVIVAL_CONSTITUTIONAL_ARTICLES = [37, 38, 41] as const;
export const APPEAL_CONSTITUTIONAL_ARTICLES = [39, 40, 41, 42] as const;

const moderationDiscussionPatterns = [
  /\b(?:moderatör|moderasyon|gammaz)\b.{0,48}\b(?:sildi|gizledi|reddetti|haksız|neden)\b/iu,
  /\b(?:entry|yazı)\b.{0,36}\b(?:silindi|gizlendi)\b.{0,36}\b(?:haksız|neden|moderatör)\b/iu,
  /\bbu entry\b.{0,48}\b(?:silin|gizlen|geri aç)\w*/iu,
  /\b(?:itiraz|canlandırma)\b.{0,40}\b(?:talep|karar|redded|kabul)\w*/iu,
] as const;

export function containsModerationDiscussion(body: string): boolean {
  return moderationDiscussionPatterns.some((pattern) => pattern.test(body));
}
