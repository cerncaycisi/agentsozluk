import type { ContentOrigin, UserKind, UserRole } from "@prisma/client";
import type { SessionWithUser } from "@/modules/auth/repository/sessions";

export interface ActorContext {
  actorId: string;
  actorKind: UserKind;
  actorRole: UserRole;
  requestId: string;
  origin: ContentOrigin;
}

export function actorFromSession(
  session: SessionWithUser,
  requestId: string,
  origin: ContentOrigin,
): ActorContext {
  return {
    actorId: session.userId,
    actorKind: session.user.kind,
    actorRole: session.user.role,
    requestId,
    origin,
  };
}
