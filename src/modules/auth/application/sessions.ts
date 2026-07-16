import type { PrismaClient } from "@prisma/client";
import { getEnvironment } from "@/config/env";
import { AppError } from "@/lib/http/errors";
import { createOpaqueToken, hmacIdentifier, sha256 } from "@/lib/security/crypto";
import { createSessionSecrets, sessionUpdate } from "@/modules/auth/domain/session";
import {
  createSessionRecord,
  findSessionByTokenHash,
  listUserSessions,
  revokeAllUserSessions,
  revokeOwnedSession,
  revokeSession,
  touchSession,
  updateSessionCsrf,
  type SessionWithUser,
} from "@/modules/auth/repository/sessions";

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

export async function issueSession(
  transaction: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
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
  client: PrismaClient,
  rawToken: string | undefined,
): Promise<SessionWithUser | null> {
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
    const update = sessionUpdate(
      session.lastUsedAt,
      session.expiresAt,
      now,
      getEnvironment().SESSION_TTL_DAYS,
    );
    if (Object.keys(update).length > 0) await touchSession(transaction, session.id, update);
    return { ...session, ...update };
  });
}

export async function requireSession(
  client: PrismaClient,
  rawToken: string | undefined,
): Promise<SessionWithUser> {
  const session = await authenticateSession(client, rawToken);
  if (!session) throw new AppError("AUTH_REQUIRED", 401, "Bu işlem için giriş yapmalısınız.");
  return session;
}

export function endSession(client: PrismaClient, sessionId: string): Promise<unknown> {
  return client.$transaction((transaction) => revokeSession(transaction, sessionId));
}

export function activeSessions(client: PrismaClient, userId: string, currentSessionId: string) {
  return client.$transaction(async (transaction) => {
    const sessions = await listUserSessions(transaction, userId);
    return sessions.map((session) => ({ ...session, current: session.id === currentSessionId }));
  });
}

export async function endOwnedSession(
  client: PrismaClient,
  userId: string,
  sessionId: string,
): Promise<void> {
  const result = await client.$transaction((transaction) =>
    revokeOwnedSession(transaction, userId, sessionId),
  );
  if (result.count === 0) throw new AppError("FORBIDDEN", 403, "Bu oturumu kapatma yetkiniz yok.");
}

export function endOtherSessions(
  client: PrismaClient,
  userId: string,
  currentSessionId: string,
): Promise<unknown> {
  return client.$transaction((transaction) =>
    revokeAllUserSessions(transaction, userId, currentSessionId),
  );
}

export async function rotateCsrfToken(client: PrismaClient, sessionId: string): Promise<string> {
  const token = createOpaqueToken();
  await client.$transaction((transaction) =>
    updateSessionCsrf(transaction, sessionId, sha256(token)),
  );
  return token;
}
