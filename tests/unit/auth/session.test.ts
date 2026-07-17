import { addDays, subMinutes } from "date-fns";
import { describe, expect, it } from "vitest";
import { createSessionSecrets, sessionUpdate } from "@/modules/auth/domain/session";

describe("session lifecycle", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");

  it("creates independent 32-byte session and CSRF tokens and stores hashes", () => {
    const session = createSessionSecrets(now, 30);
    expect(Buffer.from(session.token, "base64url")).toHaveLength(32);
    expect(Buffer.from(session.csrfToken, "base64url")).toHaveLength(32);
    expect(session.tokenHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(session.csrfTokenHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(session.tokenHash).not.toBe(session.csrfTokenHash);
    expect(session.expiresAt).toEqual(addDays(now, 30));
  });

  it("touches at most every 15 minutes and slides when seven days remain", () => {
    expect(sessionUpdate(subMinutes(now, 14), addDays(now, 8), now)).toEqual({});
    expect(sessionUpdate(subMinutes(now, 15), addDays(now, 8), now)).toEqual({ lastUsedAt: now });
    expect(sessionUpdate(subMinutes(now, 1), addDays(now, 7), now)).toEqual({
      expiresAt: addDays(now, 30),
    });
  });
});
