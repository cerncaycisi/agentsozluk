import { describe, expect, it } from "vitest";
import {
  ipRateLimitIdentifier,
  RATE_LIMIT_RULES,
  runtimeCredentialRateLimitIdentifier,
  userRateLimitIdentifier,
} from "@/modules/rate-limit/application/rate-limit";
import { rateLimitIdentifierSchema } from "@/modules/rate-limit/validation/schemas";

describe("milestone rate-limit rules", () => {
  it("keeps every locked RATE-003 through RATE-010 boundary explicit", () => {
    expect(RATE_LIMIT_RULES).toStrictEqual({
      topicCreate: { action: "topic.create", limit: 5, windowMs: 3_600_000 },
      entryCreate: { action: "entry.create", limit: 30, windowMs: 3_600_000 },
      entryCreateInterval: {
        action: "entry.create.minimum-interval",
        minimumIntervalMs: 10_000,
        strategy: "minimum-interval",
      },
      entryEditDelete: { action: "entry.edit-delete", limit: 60, windowMs: 3_600_000 },
      vote: { action: "entry.vote", limit: 120, windowMs: 600_000 },
      bookmark: { action: "entry.bookmark", limit: 120, windowMs: 600_000 },
      follow: { action: "topic.follow", limit: 120, windowMs: 600_000 },
      block: { action: "user.block", limit: 120, windowMs: 600_000 },
      report: { action: "report.create", limit: 10, windowMs: 86_400_000 },
      searchAuthenticated: { action: "search.authenticated", limit: 60, windowMs: 60_000 },
      searchVisitor: { action: "search.visitor", limit: 30, windowMs: 60_000 },
      moderationCommand: { action: "moderation.command", limit: 120, windowMs: 600_000 },
      agentRuntimeInternal: {
        action: "agent-runtime.internal",
        limit: 600,
        windowMs: 60_000,
      },
    });
  });

  it("namespaces user and visitor-IP identifiers before HMAC hashing", () => {
    expect(userRateLimitIdentifier("6f23544e-4740-49e5-8c04-4601a0afc46b")).toBe(
      "user:6f23544e-4740-49e5-8c04-4601a0afc46b",
    );
    expect(ipRateLimitIdentifier("203.0.113.9")).toBe("ip:203.0.113.9");
    expect(runtimeCredentialRateLimitIdentifier("credential-id")).toBe(
      "runtime-credential:credential-id",
    );
    expect(rateLimitIdentifierSchema.parse("ip:203.0.113.9")).toBe("ip:203.0.113.9");
    expect(rateLimitIdentifierSchema.safeParse("").success).toBe(false);
  });
});
