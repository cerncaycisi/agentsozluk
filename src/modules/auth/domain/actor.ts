import type { ContentOrigin, UserKind, UserRole } from "@prisma/client";

export interface ActorContext {
  actorId: string;
  actorKind: UserKind;
  actorRole: UserRole;
  requestId: string;
  origin: ContentOrigin;
}
