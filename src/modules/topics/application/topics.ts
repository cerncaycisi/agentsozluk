import type { PrismaClient } from "@prisma/client";
import { AppError } from "@/lib/http/errors";
import { appendAuditLog } from "@/modules/audit/repository/audit";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { appendOutboxEvent } from "@/modules/outbox/repository/outbox";
import {
  canonicalTopicPath,
  createTopicSlug,
  normalizeTopicTitle,
} from "@/modules/topics/domain/normalization";
import {
  createTopicWithFirstEntryRecord,
  findTopicById,
  findTopicConflict,
  isFollowingTopic,
  lockTopicTitle,
  type TopicSummaryRecord,
} from "@/modules/topics/repository/topics";
import type { TopicCreateInput } from "@/modules/topics/validation/schemas";

export interface TopicViewer {
  userId: string;
  role: "USER" | "MODERATOR" | "ADMIN";
  status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
}

function topicUrl(topic: Pick<TopicSummaryRecord, "id" | "slug">): string {
  return canonicalTopicPath(topic.id, topic.slug);
}

function topicExistsError(topic: TopicSummaryRecord): AppError {
  return new AppError("TOPIC_EXISTS", 409, "Bu başlık zaten mevcut.", undefined, undefined, {
    canonicalTopic: { id: topic.id, title: topic.title, url: topicUrl(topic) },
  });
}

export async function createTopicWithFirstEntry(
  client: PrismaClient,
  actor: ActorContext,
  input: TopicCreateInput,
) {
  const normalizedTitle = normalizeTopicTitle(input.title);
  const title = input.title.normalize("NFKC").trim().replaceAll(/\s+/gu, " ");
  return client.$transaction(async (transaction) => {
    await lockTopicTitle(transaction, normalizedTitle);
    const conflict = await findTopicConflict(transaction, normalizedTitle);
    if (conflict) throw topicExistsError(conflict);

    const created = await createTopicWithFirstEntryRecord(transaction, {
      title,
      normalizedTitle,
      slug: createTopicSlug(title),
      createdById: actor.actorId,
      entryBody: input.entryBody,
      origin: actor.origin,
      now: new Date(),
    });
    const entry = created.entries[0];
    if (!entry) throw new Error("TOPIC_FIRST_ENTRY_MISSING");
    await appendOutboxEvent(transaction, {
      eventType: "topic.created",
      aggregateType: "Topic",
      aggregateId: created.id,
      actorId: actor.actorId,
      actorKind: actor.actorKind,
      requestId: actor.requestId,
      payload: { title: created.title, entryId: entry.id, origin: actor.origin },
    });
    await appendAuditLog(transaction, {
      actorId: actor.actorId,
      action: "topic.created",
      entityType: "Topic",
      entityId: created.id,
      requestId: actor.requestId,
      metadata: { entryId: entry.id, origin: actor.origin },
    });
    const topic = {
      id: created.id,
      title: created.title,
      normalizedTitle: created.normalizedTitle,
      slug: created.slug,
      status: created.status,
      mergedIntoId: created.mergedIntoId,
      entryCount: created.entryCount,
      lastEntryAt: created.lastEntryAt,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
    return {
      topic: { ...topic, url: topicUrl(created) },
      entry,
    };
  });
}

export async function getTopic(client: PrismaClient, topicId: string, viewer: TopicViewer | null) {
  return client.$transaction(async (transaction) => {
    const topic = await findTopicById(transaction, topicId);
    if (!topic) throw new AppError("TOPIC_NOT_FOUND", 404, "Başlık bulunamadı.");
    if (topic.status === "MERGED" && topic.mergedInto) {
      throw new AppError(
        "TOPIC_MERGED",
        409,
        "Başlık başka bir başlıkla birleştirildi.",
        undefined,
        undefined,
        {
          canonicalTopic: {
            id: topic.mergedInto.id,
            title: topic.mergedInto.title,
            url: topicUrl(topic.mergedInto),
          },
        },
      );
    }
    const canInspect =
      viewer?.userId === topic.createdById ||
      (viewer?.status === "ACTIVE" && (viewer.role === "MODERATOR" || viewer.role === "ADMIN"));
    if (topic.status === "HIDDEN" && !canInspect)
      throw new AppError("TOPIC_NOT_FOUND", 404, "Başlık bulunamadı.");
    const following = viewer
      ? Boolean(await isFollowingTopic(transaction, topic.id, viewer.userId))
      : false;
    return { ...topic, url: topicUrl(topic), following };
  });
}
