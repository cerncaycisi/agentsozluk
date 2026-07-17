import type { DatabaseClient } from "@/lib/db/types";
import { getEnvironment } from "@/config/env";
import { getDatabaseErrorTargets, isDatabaseError } from "@/lib/db/errors";
import { AppError } from "@/lib/http/errors";
import { appendAuditLog } from "@/modules/audit";
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
  findAuthUserById,
  findAuthUserCandidateByEmail,
  findUserConflicts,
  lockUserStateForMutation,
  updateUserPassword,
} from "@/modules/auth/repository/users";
import type { LoginInput, RegistrationInput } from "@/modules/auth/validation/schemas";
import { serializeSafeUser, type SafeUser } from "@/modules/users/domain/serialization";

export interface AuthenticationResult {
  user: SafeUser;
  session: IssuedSession;
}

type RegistrationConflict = "email" | "username";

function registrationConflictFromTarget(error: unknown): RegistrationConflict | null {
  const targets = new Set(getDatabaseErrorTargets(error, "P2002"));
  const emailConflict = targets.has("emailNormalized") || targets.has("users_emailNormalized_key");
  const usernameConflict =
    targets.has("usernameNormalized") || targets.has("users_usernameNormalized_key");
  if (emailConflict === usernameConflict) return null;
  return emailConflict ? "email" : "username";
}

function throwRegistrationConflict(conflict: RegistrationConflict): never {
  if (conflict === "email") {
    throw new AppError("EMAIL_TAKEN", 409, "Bu e-posta adresi kullanılıyor.");
  }
  throw new AppError("USERNAME_TAKEN", 409, "Bu kullanıcı adı kullanılıyor.");
}

async function translateRegistrationUniqueViolation(
  client: DatabaseClient,
  error: unknown,
  input: RegistrationInput,
): Promise<never> {
  if (!isDatabaseError(error, "P2002")) throw error;

  const targetConflict = registrationConflictFromTarget(error);
  if (targetConflict) throwRegistrationConflict(targetConflict);

  // The failed transaction is already rolled back here, so this fresh query
  // can safely identify an ambiguous connector/constraint error.
  const conflicts = await client.$transaction((transaction) =>
    findUserConflicts(transaction, input.email, input.username),
  );
  if (conflicts.some((item) => item.emailNormalized === input.email)) {
    throwRegistrationConflict("email");
  }
  if (conflicts.some((item) => item.usernameNormalized === input.username)) {
    throwRegistrationConflict("username");
  }
  throw error;
}

export async function registerHuman(
  client: DatabaseClient,
  input: RegistrationInput,
  metadata: SessionMetadata,
  requestId: string,
): Promise<AuthenticationResult> {
  const passwordHash = await hashPassword(input.password);
  try {
    return await client.$transaction(async (transaction) => {
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
  } catch (error) {
    return translateRegistrationUniqueViolation(client, error, input);
  }
}

export async function loginHuman(
  client: DatabaseClient,
  input: LoginInput,
  metadata: SessionMetadata,
  requestId: string,
): Promise<AuthenticationResult> {
  const candidate = await client.$transaction((transaction) =>
    findAuthUserCandidateByEmail(transaction, input.email),
  );
  if (!candidate) {
    await verifyPassword(await getDummyPasswordHash(), input.password);
    throw new AppError("INVALID_CREDENTIALS", 401, "E-posta veya şifre hatalı.");
  }

  return client.$transaction(async (transaction) => {
    await lockUserStateForMutation(transaction, candidate.id);
    const user = await findAuthUserById(transaction, candidate.id);
    const currentCredential =
      user?.emailNormalized === input.email ? user.passwordHash : await getDummyPasswordHash();
    const valid = await verifyPassword(currentCredential, input.password);
    if (!user || user.emailNormalized !== input.email || !valid || user.status === "DEACTIVATED") {
      throw new AppError("INVALID_CREDENTIALS", 401, "E-posta veya şifre hatalı.");
    }
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
