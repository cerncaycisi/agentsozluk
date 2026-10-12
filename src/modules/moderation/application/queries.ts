import type { DatabaseClient } from "@/lib/db/types";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { canViewAgentControlPlaneAudit } from "@/modules/moderation/domain/audit-visibility";
import { requireModerator } from "@/modules/moderation/domain/authorization";
import { findModerationActor } from "@/modules/moderation/repository/actions";
import { searchAll } from "@/modules/search/application/search";
import { normalizeSuggestQuery } from "@/modules/search/application/suggest";
import { shouldSearchDatabase } from "@/modules/search/domain/normalization";
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

/*
  Taşıma ve birleştirme hedefi için başlık araması (tek tık, 12 Ekim 2026). Moderatör UUID
  yazmaz; başlık adıyla arar ve listeden seçer. Arama `/ara` ile aynı motoru kullanır.
*/
export async function getModerationTopicTargets(
  client: DatabaseClient,
  actor: ActorContext,
  input: { query: string },
) {
  const query = normalizeSuggestQuery(input.query);
  await client.$transaction(async (transaction) =>
    requireModerator(await findModerationActor(transaction, actor.actorId), actor),
  );
  if (!shouldSearchDatabase(query)) return [];
  const found = await searchAll(client, {
    query,
    type: "topics",
    page: 1,
    pageSize: 8,
    skip: 0,
    suggest: true,
  });
  return found.results
    .filter((row) => row.type === "topic")
    .map((row) => ({ id: row.id, title: row.title, url: row.url }));
}
