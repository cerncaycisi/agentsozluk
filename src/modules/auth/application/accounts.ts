import { randomBytes } from "node:crypto";
import { getDatabaseErrorTargets, isDatabaseError } from "@/lib/db/errors";
import type { DatabaseClient, TransactionClient } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { appendAuditLog } from "@/modules/audit";
import { isLastActiveAdmin } from "@/modules/auth/domain/permissions";
import { hashPassword, verifyPassword } from "@/modules/auth/domain/password";
import { revokeAllUserSessions } from "@/modules/auth/repository/sessions";
import {
  anonymizeUserRecord,
  countActiveAdmins,
  deletePrivateUserInteractionsExceptVotes,
  findAuthUserByEmail,
  findAuthUserById,
  findUserConflicts,
  lockAdminGuard,
  lockUserStateForMutation,
  lockUserStateForTransition,
  updateEmailRecord,
  updateProfileRecord,
  updateUserPassword,
} from "@/modules/auth/repository/users";
import type {
  DeactivationInput,
  EmailChangeInput,
  PasswordChangeInput,
  ProfileUpdateInput,
} from "@/modules/auth/validation/schemas";
import {
  findUserVoteEntryIds,
  lockEntryVoteCounters,
  recalculateEntryVoteCounters,
  removeUserVoteRecords,
} from "@/modules/interactions/repository/interactions";
import { appendOutboxEvent } from "@/modules/outbox";
import { serializeSafeUser, type SafeUser } from "@/modules/users/domain/serialization";

function isEmailUniqueTarget(error: unknown): boolean {
  const targets = new Set(getDatabaseErrorTargets(error, "P2002"));
  return targets.has("emailNormalized") || targets.has("users_emailNormalized_key");
}

function emailTaken(): AppError {
  return new AppError("EMAIL_TAKEN", 409, "Bu e-posta adresi kullanılıyor.");
}

async function requireSensitiveOperationUser(
  transaction: TransactionClient,
  userId: string,
  currentPassword: string,
) {
  await lockUserStateForTransition(transaction, userId);
  const user = await findAuthUserById(transaction, userId);
  if (!user) {
    throw new AppError("AUTH_REQUIRED", 401, "Bu işlem için giriş yapmalısınız.");
  }
  if (user.status === "DEACTIVATED") {
    throw new AppError("AUTH_REQUIRED", 401, "Bu işlem için giriş yapmalısınız.");
  }
  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw new AppError("INVALID_CREDENTIALS", 401, "Mevcut şifre hatalı.");
  }
  return user;
}

export async function updateProfile(
  client: DatabaseClient,
  userId: string,
  input: ProfileUpdateInput,
  requestId: string,
): Promise<SafeUser> {
  return client.$transaction(async (transaction) => {
    await lockUserStateForMutation(transaction, userId);
    const current = await findAuthUserById(transaction, userId);
    if (!current || current.status === "DEACTIVATED") {
      throw new AppError("AUTH_REQUIRED", 401, "Bu işlem için giriş yapmalısınız.");
    }
    const user = await updateProfileRecord(transaction, userId, input);
    await appendAuditLog(transaction, {
      actorId: userId,
      action: "user.profile_updated",
      entityType: "User",
      entityId: userId,
      requestId,
    });
    return serializeSafeUser(user);
  });
}

export async function changeEmail(
  client: DatabaseClient,
  userId: string,
  input: EmailChangeInput,
  requestId: string,
): Promise<SafeUser> {
  try {
    return await client.$transaction(async (transaction) => {
      const user = await requireSensitiveOperationUser(transaction, userId, input.currentPassword);
      const conflicts = await findUserConflicts(transaction, input.email, user.usernameNormalized);
      if (conflicts.some((item) => item.emailNormalized === input.email)) {
        throw emailTaken();
      }
      const updated = await updateEmailRecord(transaction, userId, input.email);
      await appendAuditLog(transaction, {
        actorId: userId,
        action: "user.email_changed",
        entityType: "User",
        entityId: userId,
        requestId,
        metadata: { changed: true },
      });
      return serializeSafeUser(updated);
    });
  } catch (error) {
    if (!isDatabaseError(error, "P2002")) throw error;
    if (isEmailUniqueTarget(error)) throw emailTaken();

    // Query only after the failed transaction has rolled back. Do not expose
    // raw constraint metadata or a database error through the account API.
    const conflict = await client.$transaction((transaction) =>
      findAuthUserByEmail(transaction, input.email),
    );
    if (conflict && conflict.id !== userId) {
      throw emailTaken();
    }
    throw error;
  }
}

export async function changePassword(
  client: DatabaseClient,
  userId: string,
  currentSessionId: string,
  input: PasswordChangeInput,
  requestId: string,
): Promise<void> {
  const passwordHash = await hashPassword(input.newPassword);
  await client.$transaction(async (transaction) => {
    await requireSensitiveOperationUser(transaction, userId, input.currentPassword);
    await updateUserPassword(transaction, userId, passwordHash);
    await revokeAllUserSessions(transaction, userId, currentSessionId);
    await appendAuditLog(transaction, {
      actorId: userId,
      action: "user.password_changed",
      entityType: "User",
      entityId: userId,
      requestId,
      metadata: { otherSessionsRevoked: true },
    });
  });
}

export async function deactivateAccount(
  client: DatabaseClient,
  userId: string,
  input: DeactivationInput,
  requestId: string,
): Promise<void> {
  const anonymousSuffix = userId.replaceAll("-", "").slice(0, 12);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await client.$transaction(
        async (transaction) => {
          const user = await requireSensitiveOperationUser(
            transaction,
            userId,
            input.currentPassword,
          );
          if (input.usernameConfirmation.trim().toLowerCase() !== user.username) {
            throw new AppError("VALIDATION_ERROR", 422, "Kullanıcı adı doğrulaması eşleşmiyor.", {
              usernameConfirmation: ["Kullanıcı adınızı eksiksiz yazın."],
            });
          }
          const passwordHash = await hashPassword(randomBytes(48).toString("base64url"));
          if (user.role === "ADMIN") {
            await lockAdminGuard(transaction);
            if (isLastActiveAdmin(user.role, await countActiveAdmins(transaction))) {
              throw new AppError("LAST_ADMIN_GUARD", 409, "Son aktif yönetici hesabı kapatılamaz.");
            }
          }
          await revokeAllUserSessions(transaction, userId);
          const affectedEntryIds = await findUserVoteEntryIds(transaction, userId);
          await lockEntryVoteCounters(transaction, affectedEntryIds);
          await removeUserVoteRecords(transaction, userId);
          await recalculateEntryVoteCounters(transaction, affectedEntryIds);
          await deletePrivateUserInteractionsExceptVotes(transaction, userId);
          await anonymizeUserRecord(transaction, userId, {
            email: `deleted+${user.id}@invalid.local`,
            username: `deleted_${anonymousSuffix}`,
            passwordHash,
            deactivatedAt: new Date(),
          });
          await appendOutboxEvent(transaction, {
            eventType: "user.deactivated",
            aggregateType: "User",
            aggregateId: userId,
            actorId: userId,
            actorKind: user.kind,
            requestId,
            payload: { status: "DEACTIVATED" },
          });
          await appendAuditLog(transaction, {
            actorId: userId,
            action: "user.deactivated",
            entityType: "User",
            entityId: userId,
            requestId,
          });
        },
        { isolationLevel: "Serializable" },
      );
      return;
    } catch (error) {
      const retryable = isDatabaseError(error, "P2034");
      if (!retryable || attempt === 3) throw error;
    }
  }
}
