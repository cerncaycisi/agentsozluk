import type { DatabaseExecutor } from "@/lib/db/types";

export function findModerationPrincipal(client: DatabaseExecutor, actorId: string) {
  return client.user.findUnique({
    where: { id: actorId },
    select: { id: true, role: true, status: true },
  });
}

export function findModerationAuthorizationTarget(client: DatabaseExecutor, userId: string) {
  return client.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, status: true },
  });
}
