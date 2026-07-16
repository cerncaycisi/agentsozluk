import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { AppError } from "@/lib/http/errors";
import { appendAuditLog } from "@/modules/audit/repository/audit";
import { hashPassword, verifyPassword } from "@/modules/auth/domain/password";
import { revokeAllUserSessions } from "@/modules/auth/repository/sessions";
import {
  anonymizeUserRecord,
  countActiveAdmins,
  deletePrivateUserInteractions,
  findAuthUserById,
  findUserConflicts,
  lockAdminGuard,
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
import { recalculateCounters } from "@/modules/entries/repository/recalculate";
import { appendOutboxEvent } from "@/modules/outbox/repository/outbox";
import { serializeSafeUser, type SafeUser } from "@/modules/users/domain/serialization";

async function requireAuthUser(client: PrismaClient, userId: string) {
  const user = await client.$transaction((transaction) => findAuthUserById(transaction, userId));
  if (!user || user.status === "DEACTIVATED") {
    throw new AppError("AUTH_REQUIRED", 401, "Bu işlem için giriş yapmalısınız.");
  }
  return user;
}

export async function updateProfile(
  client: PrismaClient,
  userId: string,
  input: ProfileUpdateInput,
  requestId: string,
): Promise<SafeUser> {
  return client.$transaction(async (transaction) => {
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
  client: PrismaClient,
  userId: string,
  input: EmailChangeInput,
  requestId: string,
): Promise<SafeUser> {
  const user = await requireAuthUser(client, userId);
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw new AppError("INVALID_CREDENTIALS", 401, "Mevcut şifre hatalı.");
  }
  return client.$transaction(async (transaction) => {
    const conflicts = await findUserConflicts(transaction, input.email, user.usernameNormalized);
    if (conflicts.some((item) => item.emailNormalized === input.email)) {
      throw new AppError("EMAIL_TAKEN", 409, "Bu e-posta adresi kullanılıyor.");
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
}

export async function changePassword(
  client: PrismaClient,
  userId: string,
  currentSessionId: string,
  input: PasswordChangeInput,
  requestId: string,
): Promise<void> {
  const user = await requireAuthUser(client, userId);
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw new AppError("INVALID_CREDENTIALS", 401, "Mevcut şifre hatalı.");
  }
  const passwordHash = await hashPassword(input.newPassword);
  await client.$transaction(async (transaction) => {
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
  client: PrismaClient,
  userId: string,
  input: DeactivationInput,
  requestId: string,
): Promise<void> {
  const user = await requireAuthUser(client, userId);
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw new AppError("INVALID_CREDENTIALS", 401, "Mevcut şifre hatalı.");
  }
  if (input.usernameConfirmation.trim().toLowerCase() !== user.username) {
    throw new AppError("VALIDATION_ERROR", 422, "Kullanıcı adı doğrulaması eşleşmiyor.", {
      usernameConfirmation: ["Kullanıcı adınızı eksiksiz yazın."],
    });
  }

  const anonymousSuffix = user.id.replaceAll("-", "").slice(0, 12);
  const passwordHash = await hashPassword(randomBytes(48).toString("base64url"));
  await client.$transaction(
    async (transaction) => {
      if (user.role === "ADMIN") {
        await lockAdminGuard(transaction);
        if ((await countActiveAdmins(transaction)) <= 1) {
          throw new AppError("LAST_ADMIN_GUARD", 409, "Son aktif yönetici hesabı kapatılamaz.");
        }
      }
      await revokeAllUserSessions(transaction, userId);
      await deletePrivateUserInteractions(transaction, userId);
      await recalculateCounters(transaction);
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
}
