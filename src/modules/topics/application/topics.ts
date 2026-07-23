import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseClient, DatabaseExecutor } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { appendAuditLog } from "@/modules/audit";
import { requireApprovedWriter } from "@/modules/auth/application/guards";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { appendOutboxEvent } from "@/modules/outbox";
import {
  canonicalTopicPath,
  createTopicSlug,
  normalizeTopicTitle,
} from "@/modules/topics/domain/normalization";
import { topicCanonicalSearchCandidates } from "@/modules/topics/domain/canonicalization";
import {
  createTopicWithFirstEntryRecord,
  findActiveTopicConflicts,
  findTopicById,
  findTopicByPublicId,
  findTopicConflict,
  isFollowingTopic,
  lockTopicTitles,
  type TopicSummaryRecord,
} from "@/modules/topics/repository/topics";
import {
  getSitemapTopicCount as getIndexableSitemapTopicCount,
  getSitemapTopics as getIndexableSitemapTopics,
} from "@/modules/indexing";
import type { TopicCreateInput } from "@/modules/topics/validation/schemas";

export interface TopicViewer {
  userId: string;
  role: "USER" | "MODERATOR" | "ADMIN";
  status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
}

export function getSitemapTopicCount(client: DatabaseClient) {
  return getIndexableSitemapTopicCount(client);
}

export function getSitemapTopics(
  client: DatabaseClient,
  input: { page: number; pageSize: number },
) {
  return getIndexableSitemapTopics(client, input);
}

function topicUrl(topic: Pick<TopicSummaryRecord, "publicId" | "slug">): string {
  return canonicalTopicPath(topic.publicId, topic.slug);
}

function topicExistsError(topic: TopicSummaryRecord): AppError {
  return new AppError("TOPIC_EXISTS", 409, "Bu başlık zaten mevcut.", undefined, undefined, {
    canonicalTopic: { id: topic.id, title: topic.title, url: topicUrl(topic) },
  });
}

function topicCanonicalSuggestionError(
  topic: TopicSummaryRecord,
  candidate: ReturnType<typeof topicCanonicalSearchCandidates>[number],
): AppError {
  return new AppError(
    "TOPIC_CANONICAL_SUGGESTION",
    409,
    "Aynı kavram için mevcut kanonik başlık öneriliyor.",
    undefined,
    undefined,
    {
      canonicalTopic: { id: topic.id, title: topic.title, url: topicUrl(topic) },
      canonicalQuery: candidate.query,
      canonicalReason: candidate.reason,
    },
  );
}

export async function createTopicWithFirstEntry(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: TopicCreateInput,
) {
  const normalizedTitle = normalizeTopicTitle(input.title);
  const title = input.title.normalize("NFKC").trim().replaceAll(/\s+/gu, " ");
  const canonicalCandidates = topicCanonicalSearchCandidates(title);
  return inTransaction(client, async (transaction) => {
    await requireApprovedWriter(transaction, actor.actorId);
    await lockTopicTitles(
      transaction,
      input.canonicalOverride
        ? [normalizedTitle]
        : canonicalCandidates.map((candidate) => candidate.normalizedQuery),
    );
    const conflict = await findTopicConflict(transaction, normalizedTitle);
    if (conflict) throw topicExistsError(conflict);
    if (!input.canonicalOverride) {
      const variantCandidates = canonicalCandidates.filter(
        (candidate) => candidate.normalizedQuery !== normalizedTitle,
      );
      if (variantCandidates.length > 0) {
        const variantConflicts = await findActiveTopicConflicts(
          transaction,
          variantCandidates.map((candidate) => candidate.normalizedQuery),
        );
        for (const candidate of variantCandidates) {
          const canonicalTopic = variantConflicts.find(
            (topic) =>
              topic.normalizedTitle === candidate.normalizedQuery ||
              topic.aliases.some((alias) => alias.normalizedTitle === candidate.normalizedQuery),
          );
          if (canonicalTopic) throw topicCanonicalSuggestionError(canonicalTopic, candidate);
        }
      }
    }

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
      publicId: created.publicId,
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

async function getTopicRecord(
  client: DatabaseClient,
  reference: { id: string } | { publicId: number },
  viewer: TopicViewer | null,
) {
  return client.$transaction(async (transaction) => {
    const topic =
      "id" in reference
        ? await findTopicById(transaction, reference.id)
        : await findTopicByPublicId(transaction, reference.publicId);
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

export function getTopic(client: DatabaseClient, topicId: string, viewer: TopicViewer | null) {
  return getTopicRecord(client, { id: topicId }, viewer);
}

export function getTopicByPublicId(
  client: DatabaseClient,
  publicId: number,
  viewer: TopicViewer | null,
) {
  return getTopicRecord(client, { publicId }, viewer);
}
