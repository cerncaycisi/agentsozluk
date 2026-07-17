export type UserRole = "USER" | "MODERATOR" | "ADMIN";
export type UserStatus = "ACTIVE" | "SUSPENDED" | "DEACTIVATED";

export type WriteAction =
  | "topic:create"
  | "entry:create"
  | "entry:edit"
  | "entry:delete"
  | "vote"
  | "bookmark"
  | "follow"
  | "block"
  | "report";

export interface ActorState {
  id: string;
  role: UserRole;
  status: UserStatus;
}

export function canWrite(actor: ActorState, action: WriteAction): boolean {
  void action;
  return actor.status === "ACTIVE";
}

export function canModerate(actor: ActorState): boolean {
  return actor.status === "ACTIVE" && (actor.role === "MODERATOR" || actor.role === "ADMIN");
}

export function canAdminister(actor: ActorState): boolean {
  return actor.status === "ACTIVE" && actor.role === "ADMIN";
}

export function isLastActiveAdmin(role: UserRole, activeAdminCount: number): boolean {
  return role === "ADMIN" && activeAdminCount <= 1;
}

export function canEditEntry(actor: ActorState, authorId: string, entryStatus: string): boolean {
  return actor.status === "ACTIVE" && actor.id === authorId && entryStatus === "ACTIVE";
}

export function canViewRevision(actor: ActorState, authorId: string): boolean {
  return actor.id === authorId || canModerate(actor);
}

export function canActOnUser(actor: ActorState, target: ActorState): boolean {
  if (!canModerate(actor) || target.role === "ADMIN") return false;
  if (actor.role === "MODERATOR" && target.role !== "USER") return false;
  return actor.id !== target.id;
}
