export type ActorKind = "HUMAN" | "AGENT";
export type ActorRole = "USER" | "MODERATOR" | "ADMIN";
export type ContentOrigin = "WEB" | "API" | "SEED" | "AGENT";

export interface ActorContext {
  actorId: string;
  actorKind: ActorKind;
  actorRole: ActorRole;
  requestId: string;
  origin: ContentOrigin;
}

export interface ActorSession {
  userId: string;
  user: {
    kind: ActorKind;
    role: ActorRole;
  };
}

export function actorFromSession(
  session: ActorSession,
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
