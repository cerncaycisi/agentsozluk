import type { DatabaseClient } from "@/lib/db/types";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { canViewAgentControlPlaneAudit } from "@/modules/moderation/domain/audit-visibility";
import { requireModerator } from "@/modules/moderation/domain/authorization";
import { findModerationActor } from "@/modules/moderation/repository/actions";
import {
  listAuditLogs,
  listModerationTopics,
  listModerationUsers,
  moderationDashboardCounts,
} from "@/modules/moderation/repository/queries";

export async function getModerationDashboard(
  client: DatabaseClient,
  actor: ActorContext,
  now = new Date(),
) {
  return client.$transaction(async (transaction) => {
    requireModerator(await findModerationActor(transaction, actor.actorId), actor);
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return moderationDashboardCounts(transaction, since, now);
  });
}

export async function getModerationUsers(
  client: DatabaseClient,
  actor: ActorContext,
  input: { query?: string; skip: number; take: number },
) {
  return client.$transaction(async (transaction) => {
    requireModerator(await findModerationActor(transaction, actor.actorId), actor);
    return listModerationUsers(transaction, input);
  });
}

export async function getModerationTopics(
  client: DatabaseClient,
  actor: ActorContext,
  input: { query?: string; skip: number; take: number },
) {
  return client.$transaction(async (transaction) => {
    requireModerator(await findModerationActor(transaction, actor.actorId), actor);
    return listModerationTopics(transaction, input);
  });
}

export async function getAuditLogs(
  client: DatabaseClient,
  actor: ActorContext,
  input: {
    actorId?: string;
    action?: string;
    entityType?: string;
    createdFrom?: Date;
    createdTo?: Date;
    requestId?: string;
    skip: number;
    take: number;
  },
) {
  return client.$transaction(async (transaction) => {
    const moderator = requireModerator(
      await findModerationActor(transaction, actor.actorId),
      actor,
    );
    return listAuditLogs(transaction, {
      ...input,
      includeAgentControlPlane: canViewAgentControlPlaneAudit({
        actorKind: actor.actorKind,
        actorRole: moderator.role,
      }),
    });
  });
}
