import { AppError } from "@/lib/http/errors";

export type RuntimeScope = "runtime:lease" | "runtime:read" | "runtime:write";

export interface RuntimeCredentialRecord {
  id: string;
  agentProfileId: string;
  scopes: string[];
  expiresAt: Date | null;
  revokedAt: Date | null;
  agentProfile: {
    lifecycleStatus: "DRAFT" | "PAUSED" | "ACTIVE" | "SUSPENDED" | "RETIRED";
    user: {
      id: string;
      kind: "HUMAN" | "AGENT";
      role: "USER" | "MODERATOR" | "ADMIN";
      status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
      loginDisabled: boolean;
    };
  };
}

function authenticationError(): AppError {
  return new AppError(
    "AUTH_REQUIRED",
    401,
    "Geçerli bir runtime credential gereklidir.",
    undefined,
    { "WWW-Authenticate": "Bearer" },
  );
}

export function parseRuntimeBearer(authorization: string | null): string {
  const match = authorization?.match(/^Bearer (agt_[A-Za-z0-9_-]{40,100})$/u);
  if (!match?.[1]) throw authenticationError();
  return match[1];
}

export function assertRuntimeCredential(
  credential: RuntimeCredentialRecord | null,
  requiredScope: RuntimeScope,
  now = new Date(),
): asserts credential is RuntimeCredentialRecord {
  if (
    !credential ||
    credential.revokedAt !== null ||
    (credential.expiresAt !== null && credential.expiresAt <= now) ||
    credential.agentProfile.user.kind !== "AGENT" ||
    credential.agentProfile.user.role !== "USER" ||
    credential.agentProfile.user.status !== "ACTIVE" ||
    !credential.agentProfile.user.loginDisabled
  ) {
    throw authenticationError();
  }
  if (!credential.scopes.includes(requiredScope)) {
    throw new AppError("FORBIDDEN", 403, "Runtime credential bu işlem için yetkili değil.");
  }
}
