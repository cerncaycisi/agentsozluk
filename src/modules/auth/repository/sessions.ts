import type { Prisma } from "@prisma/client";

const sessionUserSelect = {
  id: true,
  kind: true,
  role: true,
  status: true,
  email: true,
  emailNormalized: true,
  username: true,
  usernameNormalized: true,
  displayName: true,
  bio: true,
  passwordHash: true,
  termsVersion: true,
  termsAcceptedAt: true,
  createdAt: true,
  updatedAt: true,
  lastSeenAt: true,
  deactivatedAt: true,
} satisfies Prisma.UserSelect;

const sessionWithUser = {
  id: true,
  userId: true,
  tokenHash: true,
  csrfTokenHash: true,
  csrfPreviousTokenHash: true,
  csrfPreviousTokenExpiresAt: true,
  userAgent: true,
  ipHash: true,
  createdAt: true,
  lastUsedAt: true,
  expiresAt: true,
  revokedAt: true,
  user: { select: sessionUserSelect },
} satisfies Prisma.SessionSelect;

export type SessionWithUser = Prisma.SessionGetPayload<{ select: typeof sessionWithUser }>;

export function createSessionRecord(
  transaction: Prisma.TransactionClient,
  input: {
    userId: string;
    tokenHash: string;
    csrfTokenHash: string;
    userAgent: string | null;
    ipHash: string | null;
    expiresAt: Date;
  },
) {
  return transaction.session.create({ data: input });
}

export function findSessionByTokenHash(transaction: Prisma.TransactionClient, tokenHash: string) {
  return transaction.session.findUnique({ where: { tokenHash }, select: sessionWithUser });
}

export function touchSession(
  transaction: Prisma.TransactionClient,
  sessionId: string,
  data: { lastUsedAt?: Date; expiresAt?: Date },
) {
  return transaction.session.update({ where: { id: sessionId }, data });
}

export function updateSessionCsrf(
  transaction: Prisma.TransactionClient,
  sessionId: string,
  csrfTokenHash: string,
) {
  return transaction.session.update({
    where: { id: sessionId },
    data: {
      csrfTokenHash,
      csrfPreviousTokenHash: null,
      csrfPreviousTokenExpiresAt: null,
    },
  });
}

export function recoverSessionCsrf(
  transaction: Prisma.TransactionClient,
  input: {
    sessionId: string;
    expectedTokenHash: string;
    recoveredTokenHash: string;
    previousTokenExpiresAt: Date;
    now: Date;
  },
) {
  return transaction.session.updateMany({
    where: {
      id: input.sessionId,
      csrfTokenHash: input.expectedTokenHash,
      revokedAt: null,
      expiresAt: { gt: input.now },
    },
    data: {
      csrfTokenHash: input.recoveredTokenHash,
      csrfPreviousTokenHash: input.expectedTokenHash,
      csrfPreviousTokenExpiresAt: input.previousTokenExpiresAt,
    },
  });
}

export function findSessionCsrfState(
  transaction: Prisma.TransactionClient,
  sessionId: string,
  now: Date,
) {
  return transaction.session.findFirst({
    where: { id: sessionId, revokedAt: null, expiresAt: { gt: now } },
    select: {
      csrfTokenHash: true,
      csrfPreviousTokenHash: true,
      csrfPreviousTokenExpiresAt: true,
    },
  });
}

export function revokeSession(
  transaction: Prisma.TransactionClient,
  sessionId: string,
  now = new Date(),
) {
  return transaction.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: now },
  });
}

export function revokeAllUserSessions(
  transaction: Prisma.TransactionClient,
  userId: string,
  exceptSessionId?: string,
  now = new Date(),
) {
  return transaction.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    },
    data: { revokedAt: now },
  });
}

export function listUserSessions(transaction: Prisma.TransactionClient, userId: string) {
  return transaction.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, userAgent: true, createdAt: true, lastUsedAt: true, expiresAt: true },
    orderBy: { lastUsedAt: "desc" },
    take: 100,
  });
}

export function revokeOwnedSession(
  transaction: Prisma.TransactionClient,
  userId: string,
  sessionId: string,
  now = new Date(),
) {
  return transaction.session.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: now },
  });
}
