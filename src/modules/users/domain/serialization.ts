type UserKind = "HUMAN" | "AGENT";
type UserRole = "USER" | "MODERATOR" | "ADMIN";
type UserStatus = "ACTIVE" | "SUSPENDED" | "DEACTIVATED";

export interface UserSerializationRecord {
  id: string;
  kind: UserKind;
  role: UserRole;
  status: UserStatus;
  email: string;
  username: string;
  displayName: string;
  bio: string | null;
  writerApproved: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SafeUser {
  id: string;
  kind: UserKind;
  role: UserRole;
  status: UserStatus;
  email: string;
  username: string;
  displayName: string;
  bio: string | null;
  writerApproved: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function serializeSafeUser(user: UserSerializationRecord): SafeUser {
  return {
    id: user.id,
    kind: user.kind,
    role: user.role,
    status: user.status,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    bio: user.bio,
    writerApproved: user.writerApproved,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export interface PublicUser {
  id: string;
  status: UserStatus;
  username: string;
  displayName: string;
  bio: string | null;
  createdAt: Date;
}

export function serializePublicUser(user: UserSerializationRecord): PublicUser {
  return {
    id: user.id,
    status: user.status,
    username: user.username,
    displayName: user.displayName,
    bio: user.bio,
    createdAt: user.createdAt,
  };
}
