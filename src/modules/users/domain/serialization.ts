import type { User } from "@prisma/client";

export interface SafeUser {
  id: string;
  kind: User["kind"];
  role: User["role"];
  status: User["status"];
  email: string;
  username: string;
  displayName: string;
  bio: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function serializeSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    kind: user.kind,
    role: user.role,
    status: user.status,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    bio: user.bio,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export interface PublicUser {
  id: string;
  kind: User["kind"];
  status: User["status"];
  username: string;
  displayName: string;
  bio: string | null;
  createdAt: Date;
}

export function serializePublicUser(user: User): PublicUser {
  return {
    id: user.id,
    kind: user.kind,
    status: user.status,
    username: user.username,
    displayName: user.displayName,
    bio: user.bio,
    createdAt: user.createdAt,
  };
}
