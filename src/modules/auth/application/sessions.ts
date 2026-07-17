import type { DatabaseClient, TransactionClient } from "@/lib/db/types";
import { getEnvironment } from "@/config/env";
import { AppError } from "@/lib/http/errors";
import { createOpaqueToken, hmacIdentifier, hmacToken, sha256 } from "@/lib/security/crypto";
import { isValidCsrfToken } from "@/lib/security/csrf";
import { createSessionSecrets, sessionUpdate } from "@/modules/auth/domain/session";
import {
  createSessionRecord,
  findSessionCsrfState,
  findSessionByTokenHash,
  listUserSessions,
  recoverSessionCsrf,
  revokeAllUserSessions,
  revokeOwnedSession,
  revokeSession,
  touchSession,
  updateSessionCsrf,
  type SessionWithUser,
} from "@/modules/auth/repository/sessions";

const csrfPreviousTokenGraceMs = 5 * 60 * 1000;

export interface SessionMetadata {
  userAgent: string | null;
  ip: string | null;
}

export interface IssuedSession {
  id: string;
  token: string;
  csrfToken: string;
  expiresAt: Date;
}

export type AuthenticatedSession = SessionWithUser & { expiryExtended: boolean };

export async function issueSession(
  transaction: TransactionClient,
  userId: string,
  metadata: SessionMetadata,
): Promise<IssuedSession> {
  const environment = getEnvironment();
  const secrets = createSessionSecrets(new Date(), environment.SESSION_TTL_DAYS);
  const session = await createSessionRecord(transaction, {
    userId,
    tokenHash: secrets.tokenHash,
    csrfTokenHash: secrets.csrfTokenHash,
    userAgent: metadata.userAgent?.slice(0, 500) ?? null,
    ipHash: metadata.ip ? hmacIdentifier(environment.APP_SECRET, metadata.ip) : null,
    expiresAt: secrets.expiresAt,
  });
  return {
    id: session.id,
    token: secrets.token,
    csrfToken: secrets.csrfToken,
    expiresAt: secrets.expiresAt,
  };
}

export async function authenticateSession(
  client: DatabaseClient,
  rawToken: string | undefined,
  options: { extendExpiration?: boolean } = {},
): Promise<AuthenticatedSession | null> {
  if (!rawToken) return null;
  return client.$transaction(async (transaction) => {
    const session = await findSessionByTokenHash(transaction, sha256(rawToken));
    const now = new Date();
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.user.status === "DEACTIVATED"
    )
      return null;
    const proposedUpdate = sessionUpdate(
      session.lastUsedAt,
      session.expiresAt,
      now,
      getEnvironment().SESSION_TTL_DAYS,
    );
    const update =
      options.extendExpiration === false
        ? { ...(proposedUpdate.lastUsedAt ? { lastUsedAt: proposedUpdate.lastUsedAt } : {}) }
        : proposedUpdate;
    if (Object.keys(update).length > 0) await touchSession(transaction, session.id, update);
    return { ...session, ...update, expiryExtended: Boolean(update.expiresAt) };
  });
}

export async function requireSession(
  client: DatabaseClient,
  rawToken: string | undefined,
  options: { extendExpiration?: boolean } = {},
): Promise<AuthenticatedSession> {
  const session = await authenticateSession(client, rawToken, options);
  if (!session) throw new AppError("AUTH_REQUIRED", 401, "Bu işlem için giriş yapmalısınız.");
  return session;
}

export async function getOrRecoverCsrfToken(
  client: DatabaseClient,
  input: {
    session: SessionWithUser;
    rawSessionToken: string;
    presentedCsrfToken: string | undefined;
    now?: Date;
  },
): Promise<string> {
  const now = input.now ?? new Date();
  const hashes = {
    currentTokenHash: input.session.csrfTokenHash,
    previousTokenHash: input.session.csrfPreviousTokenHash,
    previousTokenExpiresAt: input.session.csrfPreviousTokenExpiresAt,
  };
  if (isValidCsrfToken(input.presentedCsrfToken, hashes, now)) {
    return input.presentedCsrfToken;
  }

  const recoveredToken = hmacToken(
    getEnvironment().APP_SECRET,
    `agent-sozluk:csrf:v1:${input.rawSessionToken}`,
  );
  const recoveredTokenHash = sha256(recoveredToken);
  if (recoveredTokenHash === input.session.csrfTokenHash) return recoveredToken;

  const previousTokenExpiresAt = new Date(
    Math.min(input.session.expiresAt.getTime(), now.getTime() + csrfPreviousTokenGraceMs),
  );
  return client.$transaction(async (transaction) => {
    const recovered = await recoverSessionCsrf(transaction, {
      sessionId: input.session.id,
      expectedTokenHash: input.session.csrfTokenHash,
      recoveredTokenHash,
      previousTokenExpiresAt,
      now,
    });
    if (recovered.count === 1) return recoveredToken;

    const current = await findSessionCsrfState(transaction, input.session.id, now);
    if (current?.csrfTokenHash === recoveredTokenHash) return recoveredToken;
    if (
      current &&
      isValidCsrfToken(
        input.presentedCsrfToken,
        {
          currentTokenHash: current.csrfTokenHash,
          previousTokenHash: current.csrfPreviousTokenHash,
          previousTokenExpiresAt: current.csrfPreviousTokenExpiresAt,
        },
        now,
      )
    ) {
      return input.presentedCsrfToken;
    }
    throw new AppError(
      "CSRF_INVALID",
      409,
      "Güvenlik anahtarı eşzamanlı olarak yenilendi. Lütfen tekrar deneyin.",
    );
  });
}

export function endSession(client: DatabaseClient, sessionId: string): Promise<unknown> {
  return client.$transaction((transaction) => revokeSession(transaction, sessionId));
}

export function activeSessions(client: DatabaseClient, userId: string, currentSessionId: string) {
  return client.$transaction(async (transaction) => {
    const sessions = await listUserSessions(transaction, userId);
    return sessions.map((session) => ({ ...session, current: session.id === currentSessionId }));
  });
}

export async function endOwnedSession(
  client: DatabaseClient,
  userId: string,
  sessionId: string,
): Promise<void> {
  const result = await client.$transaction((transaction) =>
    revokeOwnedSession(transaction, userId, sessionId),
  );
  if (result.count === 0) throw new AppError("FORBIDDEN", 403, "Bu oturumu kapatma yetkiniz yok.");
}

export function endOtherSessions(
  client: DatabaseClient,
  userId: string,
  currentSessionId: string,
): Promise<unknown> {
  return client.$transaction((transaction) =>
    revokeAllUserSessions(transaction, userId, currentSessionId),
  );
}

export async function rotateCsrfToken(client: DatabaseClient, sessionId: string): Promise<string> {
  const token = createOpaqueToken();
  await client.$transaction((transaction) =>
    updateSessionCsrf(transaction, sessionId, sha256(token)),
  );
  return token;
}
