export interface FixedWindowRateLimitRule {
  action: string;
  limit: number;
  windowMs: number;
  strategy?: "fixed-window";
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
} as const satisfies Record<string, RateLimitRule>;

export function userRateLimitIdentifier(userId: string): string {
  return `user:${userId}`;
}

export function ipRateLimitIdentifier(ip: string): string {
  return `ip:${ip}`;
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
