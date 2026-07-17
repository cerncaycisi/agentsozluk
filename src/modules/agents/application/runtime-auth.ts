import type { DatabaseExecutor } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { sha256 } from "@/lib/security/crypto";
import { setRequestActorId } from "@/lib/logging/request-context";
import type { ActorContext } from "@/modules/auth/domain/actor";
import {
  assertRuntimeCredential,
  parseRuntimeBearer,
  type RuntimeScope,
} from "@/modules/agents/domain/runtime-auth";
import {
  findRuntimeCredentialByHash,
  touchRuntimeCredential,
} from "@/modules/agents/repository/runtime";

export interface RuntimePrincipal {
  credentialId: string;
  agentProfileId: string;
  lifecycleStatus: "DRAFT" | "PAUSED" | "ACTIVE" | "SUSPENDED" | "RETIRED";
  actor: ActorContext;
}

export async function authenticateRuntimeRequest(
  client: DatabaseExecutor,
  input: {
    authorization: string | null;
    hasBrowserSession: boolean;
    requiredScope: RuntimeScope;
    requestId: string;
  },
): Promise<RuntimePrincipal> {
  if (input.hasBrowserSession) {
    throw new AppError("FORBIDDEN", 403, "Browser session internal runtime API'de kullanılamaz.");
  }
  const rawCredential = parseRuntimeBearer(input.authorization);
  const credential = await findRuntimeCredentialByHash(client, sha256(rawCredential));
  assertRuntimeCredential(credential, input.requiredScope);
  await touchRuntimeCredential(client, credential.id);
  setRequestActorId(credential.agentProfile.user.id);
  return {
    credentialId: credential.id,
    agentProfileId: credential.agentProfileId,
    lifecycleStatus: credential.agentProfile.lifecycleStatus,
    actor: {
      actorId: credential.agentProfile.user.id,
      actorKind: "AGENT",
      actorRole: "USER",
      requestId: input.requestId,
      origin: "AGENT",
    },
  };
}
