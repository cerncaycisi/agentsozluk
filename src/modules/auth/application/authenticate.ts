import type { PrismaClient } from "@prisma/client";
import { getEnvironment } from "@/config/env";
import { AppError } from "@/lib/http/errors";
import { appendAuditLog } from "@/modules/audit/repository/audit";
import {
  getDummyPasswordHash,
  hashPassword,
  passwordNeedsRehash,
  verifyPassword,
} from "@/modules/auth/domain/password";
import {
  issueSession,
  type IssuedSession,
  type SessionMetadata,
} from "@/modules/auth/application/sessions";
import {
  createHumanUser,
  findAuthUserByEmail,
  findUserConflicts,
  updateUserPassword,
} from "@/modules/auth/repository/users";
import type { LoginInput, RegistrationInput } from "@/modules/auth/validation/schemas";
import { serializeSafeUser, type SafeUser } from "@/modules/users/domain/serialization";

export interface AuthenticationResult {
  user: SafeUser;
  session: IssuedSession;
}

export async function registerHuman(
  client: PrismaClient,
  input: RegistrationInput,
  metadata: SessionMetadata,
  requestId: string,
): Promise<AuthenticationResult> {
  const passwordHash = await hashPassword(input.password);
  return client.$transaction(async (transaction) => {
    const conflicts = await findUserConflicts(transaction, input.email, input.username);
    if (conflicts.some((item) => item.emailNormalized === input.email)) {
      throw new AppError("EMAIL_TAKEN", 409, "Bu e-posta adresi kullanılıyor.");
    }
    if (conflicts.some((item) => item.usernameNormalized === input.username)) {
      throw new AppError("USERNAME_TAKEN", 409, "Bu kullanıcı adı kullanılıyor.");
    }
    const user = await createHumanUser(transaction, {
      email: input.email,
      emailNormalized: input.email,
      username: input.username,
      displayName: input.displayName,
      passwordHash,
      termsVersion: getEnvironment().TERMS_VERSION,
      termsAcceptedAt: new Date(),
    });
    const session = await issueSession(transaction, user.id, metadata);
    await appendAuditLog(transaction, {
      actorId: user.id,
      action: "user.registered",
      entityType: "User",
      entityId: user.id,
      requestId,
    });
    return { user: serializeSafeUser(user), session };
  });
}

export async function loginHuman(
  client: PrismaClient,
  input: LoginInput,
  metadata: SessionMetadata,
  requestId: string,
): Promise<AuthenticationResult> {
  const user = await client.$transaction((transaction) =>
    findAuthUserByEmail(transaction, input.email),
  );
  const passwordHash = user?.passwordHash ?? (await getDummyPasswordHash());
  const valid = await verifyPassword(passwordHash, input.password);
  if (!user || !valid || user.status === "DEACTIVATED") {
    throw new AppError("INVALID_CREDENTIALS", 401, "E-posta veya şifre hatalı.");
  }

  return client.$transaction(async (transaction) => {
    if (passwordNeedsRehash(user.passwordHash)) {
      await updateUserPassword(transaction, user.id, await hashPassword(input.password));
    }
    const session = await issueSession(transaction, user.id, metadata);
    await appendAuditLog(transaction, {
      actorId: user.id,
      action: "session.created",
      entityType: "Session",
      entityId: session.id,
      requestId,
    });
    return { user: serializeSafeUser(user), session };
  });
}
