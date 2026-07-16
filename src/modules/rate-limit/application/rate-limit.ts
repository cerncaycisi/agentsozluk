import { addMilliseconds } from "date-fns";
import type { Prisma, PrismaClient } from "@prisma/client";
import { getEnvironment } from "@/config/env";
import { AppError } from "@/lib/http/errors";
import { hmacIdentifier } from "@/lib/security/crypto";
import { incrementRateLimitBucket } from "@/modules/rate-limit/repository/rate-limit";

type Client = PrismaClient | Prisma.TransactionClient;

export interface RateLimitRule {
  action: string;
  limit: number;
  windowMs: number;
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

export async function enforceRateLimit(
  client: Client,
  identifier: string,
  rule: RateLimitRule,
  now = new Date(),
): Promise<void> {
  const environment = getEnvironment();
  const { windowStart, retryAfter } = fixedWindow(now, rule.windowMs);
  const expiresAt = addMilliseconds(windowStart, rule.windowMs * 2);
  const count = await incrementRateLimitBucket(client, {
    keyHash: hmacIdentifier(environment.APP_SECRET, identifier),
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

export function requestIp(request: Request): string {
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
