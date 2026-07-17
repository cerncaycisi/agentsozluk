import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/config/app";
import { GET as getCsrf } from "@/app/api/v1/auth/csrf/route";
import { POST as logout } from "@/app/api/v1/auth/logout/route";
import { GET as getSession } from "@/app/api/v1/auth/session/route";
import { sha256 } from "@/lib/security/crypto";
import { isValidCsrfToken } from "@/lib/security/csrf";

const databaseMock = vi.hoisted(() => ({ getDatabase: vi.fn() }));

vi.mock("@/lib/db/client", () => ({ getDatabase: databaseMock.getDatabase }));

interface MutableSession {
  id: string;
  userId: string;
  tokenHash: string;
  csrfTokenHash: string;
  csrfPreviousTokenHash: string | null;
  csrfPreviousTokenExpiresAt: Date | null;
  userAgent: string | null;
  ipHash: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  user: {
    id: string;
    kind: "HUMAN";
    role: "USER";
    status: "ACTIVE";
    email: string;
    emailNormalized: string;
    username: string;
    usernameNormalized: string;
    displayName: string;
    bio: null;
    passwordHash: string;
    termsVersion: string;
    termsAcceptedAt: Date;
    createdAt: Date;
    updatedAt: Date;
    lastSeenAt: null;
    deactivatedAt: null;
  };
}

function persistedSession(rawSessionToken: string, rawCsrfToken: string): MutableSession {
  const now = new Date();
  const userId = randomUUID();
  return {
    id: randomUUID(),
    userId,
    tokenHash: sha256(rawSessionToken),
    csrfTokenHash: sha256(rawCsrfToken),
    csrfPreviousTokenHash: null,
    csrfPreviousTokenExpiresAt: null,
    userAgent: null,
    ipHash: null,
    createdAt: now,
    lastUsedAt: now,
    expiresAt: new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    user: {
      id: userId,
      kind: "HUMAN",
      role: "USER",
      status: "ACTIVE",
      email: "route-user@example.test",
      emailNormalized: "route-user@example.test",
      username: "route_user",
      usernameNormalized: "route_user",
      displayName: "Route User",
      bio: null,
      passwordHash: "not-serialized",
      termsVersion: "1.0",
      termsAcceptedAt: now,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: null,
      deactivatedAt: null,
    },
  };
}

function fakeDatabase(
  session: MutableSession,
  onFirstRecoveryAttempt?: (session: MutableSession) => void,
) {
  let recoveryAttemptIntercepted = false;
  const updateMany = vi.fn(
    async (input: {
      where: { id: string; csrfTokenHash: string };
      data: {
        csrfTokenHash: string;
        csrfPreviousTokenHash: string;
        csrfPreviousTokenExpiresAt: Date;
      };
    }) => {
      if (onFirstRecoveryAttempt && !recoveryAttemptIntercepted) {
        recoveryAttemptIntercepted = true;
        onFirstRecoveryAttempt(session);
        return { count: 0 };
      }
      if (
        input.where.id !== session.id ||
        input.where.csrfTokenHash !== session.csrfTokenHash ||
        session.revokedAt ||
        session.expiresAt <= new Date()
      ) {
        return { count: 0 };
      }
      Object.assign(session, input.data);
      return { count: 1 };
    },
  );
  const transaction = {
    session: {
      findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) =>
        where.tokenHash === session.tokenHash ? { ...session, user: { ...session.user } } : null,
      ),
      findFirst: vi.fn(async () => ({
        csrfTokenHash: session.csrfTokenHash,
        csrfPreviousTokenHash: session.csrfPreviousTokenHash,
        csrfPreviousTokenExpiresAt: session.csrfPreviousTokenExpiresAt,
      })),
      update: vi.fn(async ({ data }: { data: Partial<MutableSession> }) => {
        Object.assign(session, data);
        return session;
      }),
      updateMany,
    },
  };
  return {
    updateMany,
    client: {
      $transaction: vi.fn(async (work: (client: typeof transaction) => unknown) =>
        work(transaction),
      ),
    },
  };
}

function request(path: string, rawSessionToken: string, rawCsrfToken?: string): NextRequest {
  const cookies = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(rawSessionToken)}`,
    ...(rawCsrfToken ? [`${CSRF_COOKIE_NAME}=${encodeURIComponent(rawCsrfToken)}`] : []),
  ].join("; ");
  return new NextRequest(`http://localhost:3000${path}`, { headers: { cookie: cookies } });
}

describe("session and CSRF route cookie lifecycle", () => {
  beforeEach(() => {
    databaseMock.getDatabase.mockReset();
  });

  it("renews both browser-cookie expirations only when the database expiry slides", async () => {
    const rawSessionToken = "raw-session-token-for-sliding-expiry";
    const rawCsrfToken = "raw-csrf-token-for-sliding-expiry";
    const stored = persistedSession(rawSessionToken, rawCsrfToken);
    const database = fakeDatabase(stored);
    databaseMock.getDatabase.mockReturnValue(database.client);

    const response = await getSession(
      request("/api/v1/auth/session", rawSessionToken, rawCsrfToken),
    );
    const body = await response.text();
    const setCookies = response.headers.getSetCookie();

    expect(response.status).toBe(200);
    expect(setCookies).toHaveLength(2);
    expect(setCookies.find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`))).toContain(
      "HttpOnly",
    );
    expect(setCookies.find((cookie) => cookie.startsWith(`${CSRF_COOKIE_NAME}=`))).not.toContain(
      "HttpOnly",
    );
    expect(setCookies.every((cookie) => cookie.includes("SameSite=lax"))).toBe(true);
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);
    expect(body).not.toContain(rawSessionToken);
    expect(body).not.toContain(rawCsrfToken);

    stored.expiresAt = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    stored.lastUsedAt = new Date();
    const unchanged = await getSession(
      request("/api/v1/auth/session", rawSessionToken, rawCsrfToken),
    );
    expect(unchanged.headers.getSetCookie()).toHaveLength(0);
  });

  it("does not overwrite explicit logout cookie clearing with a sliding renewal", async () => {
    const rawSessionToken = "raw-session-token-for-logout";
    const rawCsrfToken = "raw-csrf-token-for-logout";
    const stored = persistedSession(rawSessionToken, rawCsrfToken);
    const database = fakeDatabase(stored);
    databaseMock.getDatabase.mockReturnValue(database.client);
    const origin = new URL(process.env.APP_URL ?? "http://localhost:3000").origin;

    const response = await logout(
      new NextRequest(`${origin}/api/v1/auth/logout`, {
        method: "POST",
        headers: {
          cookie: [
            `${SESSION_COOKIE_NAME}=${encodeURIComponent(rawSessionToken)}`,
            `${CSRF_COOKIE_NAME}=${encodeURIComponent(rawCsrfToken)}`,
          ].join("; "),
          origin,
          "x-csrf-token": rawCsrfToken,
        },
      }),
    );
    const setCookies = response.headers.getSetCookie();

    expect(response.status).toBe(200);
    expect(setCookies).toHaveLength(2);
    expect(setCookies.every((cookie) => cookie.includes("Expires=Thu, 01 Jan 1970"))).toBe(true);
    expect(setCookies.join("\n")).not.toContain(rawSessionToken);
    expect(setCookies.join("\n")).not.toContain(rawCsrfToken);
  });

  it("reuses a valid CSRF cookie across concurrent GETs without rotating it", async () => {
    const rawSessionToken = "raw-session-token-for-valid-csrf";
    const rawCsrfToken = "shared-valid-csrf-token";
    const stored = persistedSession(rawSessionToken, rawCsrfToken);
    stored.expiresAt = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    const database = fakeDatabase(stored);
    databaseMock.getDatabase.mockReturnValue(database.client);

    const responses = await Promise.all([
      getCsrf(request("/api/v1/auth/csrf", rawSessionToken, rawCsrfToken)),
      getCsrf(request("/api/v1/auth/csrf", rawSessionToken, rawCsrfToken)),
    ]);
    const payloads = await Promise.all(responses.map((response) => response.json()));

    expect(payloads.map((payload) => payload.data.csrfToken)).toEqual([rawCsrfToken, rawCsrfToken]);
    expect(database.updateMany).not.toHaveBeenCalled();
    expect(stored.csrfTokenHash).toBe(sha256(rawCsrfToken));
  });

  it("gives concurrent missing-cookie recovery calls one HMAC token and preserves the old hash", async () => {
    const rawSessionToken = "raw-session-token-for-csrf-recovery";
    const oldCsrfToken = "previous-in-flight-csrf-token";
    const stored = persistedSession(rawSessionToken, oldCsrfToken);
    stored.expiresAt = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    const database = fakeDatabase(stored);
    databaseMock.getDatabase.mockReturnValue(database.client);

    const responses = await Promise.all([
      getCsrf(request("/api/v1/auth/csrf", rawSessionToken)),
      getCsrf(request("/api/v1/auth/csrf", rawSessionToken)),
    ]);
    const payloads = await Promise.all(responses.map((response) => response.json()));
    const recoveredTokens = payloads.map((payload) => payload.data.csrfToken as string);
    const recoveredToken = recoveredTokens[0];
    if (!recoveredToken) throw new Error("CSRF recovery response did not contain a token.");

    expect(recoveredToken).toBe(recoveredTokens[1]);
    expect(recoveredToken).not.toBe(rawSessionToken);
    expect(stored.csrfTokenHash).toBe(sha256(recoveredToken));
    expect(stored.csrfPreviousTokenHash).toBe(sha256(oldCsrfToken));
    expect(database.updateMany).toHaveBeenCalledTimes(2);
    expect(
      isValidCsrfToken(oldCsrfToken, {
        currentTokenHash: stored.csrfTokenHash,
        previousTokenHash: stored.csrfPreviousTokenHash,
        previousTokenExpiresAt: stored.csrfPreviousTokenExpiresAt,
      }),
    ).toBe(true);
  });

  it("does not overwrite a different recovery winner during an APP_SECRET transition", async () => {
    const rawSessionToken = "raw-session-token-during-secret-transition";
    const oldCsrfToken = "old-token-during-secret-transition";
    const competingToken = "token-issued-by-the-competing-runtime";
    const stored = persistedSession(rawSessionToken, oldCsrfToken);
    stored.expiresAt = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    const database = fakeDatabase(stored, (session) => {
      session.csrfPreviousTokenHash = session.csrfTokenHash;
      session.csrfPreviousTokenExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
      session.csrfTokenHash = sha256(competingToken);
    });
    databaseMock.getDatabase.mockReturnValue(database.client);

    const response = await getCsrf(request("/api/v1/auth/csrf", rawSessionToken));
    const responseText = await response.text();

    expect(response.status).toBe(409);
    expect(stored.csrfTokenHash).toBe(sha256(competingToken));
    expect(responseText).not.toContain(rawSessionToken);
    expect(responseText).not.toContain(competingToken);
  });
});
