import { addMilliseconds } from "date-fns";
import type { DatabaseExecutor } from "@/lib/db/types";
import { getEnvironment } from "@/config/env";
import { AppError } from "@/lib/http/errors";
import { hmacIdentifier } from "@/lib/security/crypto";
import {
  claimRateLimitInterval,
  incrementRateLimitBucket,
} from "@/modules/rate-limit/repository/rate-limit";
import { fixedWindow, type RateLimitRule } from "@/modules/rate-limit/domain/rules";
import { rateLimitIdentifierSchema } from "@/modules/rate-limit/validation/schemas";

export {
  fixedWindow,
  ipRateLimitIdentifier,
  RATE_LIMIT_RULES,
  userRateLimitIdentifier,
  type FixedWindowRateLimitRule,
  type MinimumIntervalRateLimitRule,
  type RateLimitRule,
} from "@/modules/rate-limit/domain/rules";

type Client = DatabaseExecutor;

export async function enforceRateLimit(
  client: Client,
  identifier: string,
  rule: RateLimitRule,
  now = new Date(),
): Promise<void> {
  const environment = getEnvironment();
  const keyHash = hmacIdentifier(
    environment.APP_SECRET,
    rateLimitIdentifierSchema.parse(identifier),
  );
  if (rule.strategy === "minimum-interval") {
    const allowed = await claimRateLimitInterval(client, {
      keyHash,
      action: rule.action,
      now,
      minimumIntervalMs: rule.minimumIntervalMs,
    });
    if (!allowed) {
      throw new AppError(
        "RATE_LIMITED",
        429,
        "Çok fazla istek gönderdiniz. Lütfen daha sonra deneyin.",
        undefined,
        {
          "Retry-After": String(Math.max(1, Math.ceil(rule.minimumIntervalMs / 1000))),
        },
      );
    }
    return;
  }
  const { windowStart, retryAfter } = fixedWindow(now, rule.windowMs);
  const expiresAt = addMilliseconds(windowStart, rule.windowMs * 2);
  const count = await incrementRateLimitBucket(client, {
    keyHash,
    action: rule.action,
    windowStart,
    expiresAt,
  });
  if (count > rule.limit) {
    throw new AppError(
      "RATE_LIMITED",
      429,
      "Çok fazla istek gönderdiniz. Lütfen daha sonra deneyin.",
      undefined,
      {
        "Retry-After": String(retryAfter),
      },
    );
  }
}

export function requestIp(request: { headers: { get(name: string): string | null } }): string {
  const environment = getEnvironment();
  if (environment.TRUST_PROXY === "true") {
    const forwarded = request.headers
      .get("x-forwarded-for")
      ?.split(",")
      .map((item) => item.trim());
    const hops = environment.TRUST_PROXY_HOPS;
    return forwarded?.at(-(hops + 1)) ?? "unknown";
  }
  return "unknown";
}
