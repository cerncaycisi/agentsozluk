import type { Prisma } from "@prisma/client";

const authUserSelect = {
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
  loginDisabled: true,
  termsVersion: true,
  termsAcceptedAt: true,
  createdAt: true,
  updatedAt: true,
  lastSeenAt: true,
  deactivatedAt: true,
} satisfies Prisma.UserSelect;

export type AuthUser = Prisma.UserGetPayload<{ select: typeof authUserSelect }>;

export function findAuthUserByEmail(
  transaction: Prisma.TransactionClient,
  emailNormalized: string,
) {
  return transaction.user.findUnique({ where: { emailNormalized }, select: authUserSelect });
}

export function findAuthUserCandidateByEmail(
  transaction: Prisma.TransactionClient,
  emailNormalized: string,
) {
  return transaction.user.findUnique({
    where: { emailNormalized },
    select: { id: true },
  });
}

export function findAuthUserById(transaction: Prisma.TransactionClient, id: string) {
  return transaction.user.findUnique({ where: { id }, select: authUserSelect });
}

type UserStateLockMode = "shared" | "exclusive";

/**
 * Serializes account-state transitions against authenticated work for the
 * lifetime of the surrounding transaction. Sorting makes multi-user
 * moderation transitions deadlock-safe; an exclusive request wins when the
 * same user appears more than once.
 */
export async function lockUserStates(
  transaction: Prisma.TransactionClient,
  locks: ReadonlyArray<{ userId: string; mode: UserStateLockMode }>,
): Promise<void> {
  const strongestModeByUser = new Map<string, UserStateLockMode>();
  for (const lock of locks) {
    const current = strongestModeByUser.get(lock.userId);
    if (!current || lock.mode === "exclusive") {
      strongestModeByUser.set(lock.userId, lock.mode);
    }
  }

  const orderedLocks = [...strongestModeByUser.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  for (const [userId, mode] of orderedLocks) {
    const key = `user-state:${userId}`;
    if (mode === "exclusive") {
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))
      `;
    } else {
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock_shared(hashtextextended(${key}, 0))
      `;
    }
  }
}

export function lockUserStateForMutation(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  return lockUserStates(transaction, [{ userId, mode: "shared" }]);
}

export function lockUserStateForTransition(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  return lockUserStates(transaction, [{ userId, mode: "exclusive" }]);
}

export function lockUserActorAndTargetTransition(
  transaction: Prisma.TransactionClient,
  actorId: string,
  targetId: string,
): Promise<void> {
  return lockUserStates(transaction, [
    { userId: actorId, mode: "shared" },
    { userId: targetId, mode: "exclusive" },
  ]);
}

export async function findActiveUserForWrite(transaction: Prisma.TransactionClient, id: string) {
  await lockUserStateForMutation(transaction, id);
  return transaction.user.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
}

export function findUserConflicts(
  transaction: Prisma.TransactionClient,
  emailNormalized: string,
  usernameNormalized: string,
) {
  return transaction.user.findMany({
    where: { OR: [{ emailNormalized }, { usernameNormalized }] },
    select: { emailNormalized: true, usernameNormalized: true },
  });
}

export function createHumanUser(
  transaction: Prisma.TransactionClient,
  input: {
    email: string;
    emailNormalized: string;
    username: string;
    displayName: string;
    passwordHash: string;
    termsVersion: string;
    termsAcceptedAt: Date;
  },
) {
  return transaction.user.create({
    data: {
      kind: "HUMAN",
      role: "USER",
      status: "ACTIVE",
      ...input,
      usernameNormalized: input.username,
    },
    select: authUserSelect,
  });
}

export function updateUserPassword(
  transaction: Prisma.TransactionClient,
  userId: string,
  passwordHash: string,
) {
  return transaction.user.update({ where: { id: userId }, data: { passwordHash } });
}

export function updateProfileRecord(
  transaction: Prisma.TransactionClient,
  userId: string,
  data: { displayName: string; bio: string | null },
) {
  return transaction.user.update({ where: { id: userId }, data, select: authUserSelect });
}

export function updateEmailRecord(
  transaction: Prisma.TransactionClient,
  userId: string,
  email: string,
) {
  return transaction.user.update({
    where: { id: userId },
    data: { email, emailNormalized: email },
    select: authUserSelect,
  });
}

export function anonymizeUserRecord(
  transaction: Prisma.TransactionClient,
  userId: string,
  data: { email: string; username: string; passwordHash: string; deactivatedAt: Date },
) {
  return transaction.user.update({
    where: { id: userId },
    data: {
      email: data.email,
      emailNormalized: data.email,
      username: data.username,
      usernameNormalized: data.username,
      displayName: "silinmiş hesap",
      bio: null,
      passwordHash: data.passwordHash,
      status: "DEACTIVATED",
      deactivatedAt: data.deactivatedAt,
    },
    select: authUserSelect,
  });
}

export async function deletePrivateUserInteractionsExceptVotes(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  await transaction.entryBookmark.deleteMany({ where: { userId } });
  await transaction.topicFollow.deleteMany({ where: { userId } });
  await transaction.userBlock.deleteMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
  });
}

export function countActiveAdmins(transaction: Prisma.TransactionClient): Promise<number> {
  return transaction.user.count({ where: { role: "ADMIN", status: "ACTIVE" } });
}

export async function lockAdminGuard(transaction: Prisma.TransactionClient): Promise<void> {
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(92024001)`;
}
