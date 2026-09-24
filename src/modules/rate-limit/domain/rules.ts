export interface FixedWindowRateLimitRule {
  action: string;
  limit: number;
  windowMs: number;
  strategy?: "fixed-window";
  /** Tespit kuralları reddeden kovaya verilemez (tip düzeyinde engel). */
  observeOnly?: never;
}

/**
 * Yalnız sayan, HİÇBİR ZAMAN reddetmeyen tespit kuralı. `observeOnly: true`
 * taşıdığı için `RateLimitRule` yerine geçemez: `enforceRateLimit`'e verilmesi
 * derleme hatasıdır ve çalışma anında da reddedilir (Astra, #184).
 */
export interface ObserveOnlyRateLimitRule {
  action: string;
  limit: number;
  windowMs: number;
  observeOnly: true;
}

export interface MinimumIntervalRateLimitRule {
  action: string;
  minimumIntervalMs: number;
  strategy: "minimum-interval";
}

export type RateLimitRule = FixedWindowRateLimitRule | MinimumIntervalRateLimitRule;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const RATE_LIMIT_RULES = {
  topicCreate: { action: "topic.create", limit: 5, windowMs: HOUR },
  entryCreate: { action: "entry.create", limit: 30, windowMs: HOUR },
  entryCreateInterval: {
    action: "entry.create.minimum-interval",
    minimumIntervalMs: 10_000,
    strategy: "minimum-interval",
  },
  entryEditDelete: { action: "entry.edit-delete", limit: 60, windowMs: HOUR },
  vote: { action: "entry.vote", limit: 120, windowMs: 10 * MINUTE },
  bookmark: { action: "entry.bookmark", limit: 120, windowMs: 10 * MINUTE },
  follow: { action: "topic.follow", limit: 120, windowMs: 10 * MINUTE },
  block: { action: "user.block", limit: 120, windowMs: 10 * MINUTE },
  report: { action: "report.create", limit: 10, windowMs: DAY },
  searchAuthenticated: { action: "search.authenticated", limit: 60, windowMs: MINUTE },
  searchVisitor: { action: "search.visitor", limit: 30, windowMs: MINUTE },
  moderationCommand: { action: "moderation.command", limit: 120, windowMs: 10 * MINUTE },
  agentRuntimeInternal: { action: "agent-runtime.internal", limit: 600, windowMs: MINUTE },
  /*
    Giriş iki kovadan geçer (18 Eylül incelemesi B3 / F10). Tek başına
    `${ip}:${email}` çifti aynı IP'den farklı e-postalara gelen denemeleri
    saymıyordu (hesap sayma / kullanıcı adı keşfi); her e-posta ayrı kovaya
    düşüyordu. "Aynı hesaba farklı IP'lerden" yarısı için bkz. login route:
    hesap bazlı kova kilitleme DoS'u doğurduğu için geri çekildi.

    Sayılar kaba kuvveti durdurmak için değil, MALİYETİ sınırlamak için: her
    giriş denemesi, e-posta hiç yoksa bile 64 MiB / t=3 Argon2 işi doğuruyor
    (dummy hash doğrulaması bilinçli bir tasarım, zamanlama sızıntısını kapatır).
    Gerçek kullanıcı 15 dakikada 30 kez giriş denemez.
  */
  loginIp: { action: "login:ip", limit: 30, windowMs: 15 * MINUTE },
  /*
    Hesap bazlı başarısız giriş SAYACI — engellemez, yalnız tespit eder (Astra
    önerisi, 20 Eylül; F10 kararının görünürlük ayağı). Kilitleme, kurbanın
    e-postasını bilen birine ucuz bir DoS verirdi; bu sayaç hiçbir isteği
    reddetmez, eşik aşılınca güvenlik KAYDI üretir (yalnız log; alarm akışına
    girmez, en fazla bir kez ve kaybolabilir). `limit` burada eşiktir.
  */
  loginAccountFailureObserve: {
    action: "login:account-failure-observe",
    limit: 10,
    windowMs: HOUR,
    observeOnly: true,
  },
} as const satisfies Record<string, RateLimitRule | ObserveOnlyRateLimitRule>;

export function accountLoginIdentifier(emailNormalized: string): string {
  return `account:${emailNormalized}`;
}

export function userRateLimitIdentifier(userId: string): string {
  return `user:${userId}`;
}

export function ipRateLimitIdentifier(ip: string): string {
  return `ip:${ip}`;
}

export function runtimeCredentialRateLimitIdentifier(credentialId: string): string {
  return `runtime-credential:${credentialId}`;
}

export function fixedWindow(
  now: Date,
  windowMs: number,
): { windowStart: Date; retryAfter: number } {
  const windowStartMs = Math.floor(now.getTime() / windowMs) * windowMs;
  return {
    windowStart: new Date(windowStartMs),
    retryAfter: Math.max(1, Math.ceil((windowStartMs + windowMs - now.getTime()) / 1000)),
  };
}
