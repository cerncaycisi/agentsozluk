import type { PrismaClient } from "@prisma/client";
import { AppError } from "@/lib/http/errors";
import { appendAuditLog } from "@/modules/audit/repository/audit";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { canEditEntry, canViewRevision } from "@/modules/auth/domain/permissions";
import { hasMeaningfulEntryChange } from "@/modules/entries/domain/entry";
import {
  createEntryRecord,
  createEntryRevision,
  findEntryById,
  listBlockedAuthorIds,
  listEntryRevisions,
  listTopicEntries,
  softDeleteEntryRecord,
  updateEntryRecord,
} from "@/modules/entries/repository/entries";
import { appendOutboxEvent } from "@/modules/outbox/repository/outbox";
import {
  findTopicById,
  recalculateTopicCounter,
  updateTopicAfterEntryCreate,
} from "@/modules/topics/repository/topics";
import type { EntryCreateInput, EntryUpdateInput } from "@/modules/topics/validation/schemas";

export interface EntryViewer {
  userId: string;
  role: "USER" | "MODERATOR" | "ADMIN";
  status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
}

function mergedTopicError(topic: {
  mergedInto: { id: string; title: string; slug: string } | null;
}) {
  return new AppError(
    "TOPIC_MERGED",
    409,
    "Başlık başka bir başlıkla birleştirildi.",
    undefined,
    undefined,
    {
      canonicalTopic: topic.mergedInto
        ? {
            id: topic.mergedInto.id,
            title: topic.mergedInto.title,
            url: `/baslik/${topic.mergedInto.id}-${topic.mergedInto.slug}`,
          }
        : null,
    },
  );
}

export async function createEntry(
  client: PrismaClient,
  actor: ActorContext,
  topicId: string,
  input: EntryCreateInput,
) {
  return client.$transaction(async (transaction) => {
    const topic = await findTopicById(transaction, topicId);
    if (!topic) throw new AppError("TOPIC_NOT_FOUND", 404, "Başlık bulunamadı.");
    if (topic.status === "MERGED") throw mergedTopicError(topic);
    if (topic.status === "HIDDEN")
      throw new AppError("TOPIC_HIDDEN", 409, "Gizlenmiş başlığa entry eklenemez.");

    const createdAt = new Date();
    const entry = await createEntryRecord(transaction, {
      topicId,
      authorId: actor.actorId,
      body: input.body,
      origin: actor.origin,
      createdAt,
    });
    await updateTopicAfterEntryCreate(transaction, topicId, createdAt);
    await appendOutboxEvent(transaction, {
      eventType: "entry.created",
      aggregateType: "Entry",
      aggregateId: entry.id,
      actorId: actor.actorId,
      actorKind: actor.actorKind,
      requestId: actor.requestId,
      payload: { topicId, origin: actor.origin },
    });
    await appendAuditLog(transaction, {
      actorId: actor.actorId,
      action: "entry.created",
      entityType: "Entry",
      entityId: entry.id,
      requestId: actor.requestId,
      metadata: { topicId, origin: actor.origin },
    });
    return entry;
  });
}

export async function editEntry(
  client: PrismaClient,
  actor: ActorContext,
  input: EntryUpdateInput,
  entryId: string,
) {
  return client.$transaction(async (transaction) => {
    const entry = await findEntryById(transaction, entryId);
    if (!entry) throw new AppError("ENTRY_NOT_FOUND", 404, "Entry bulunamadı.");
    if (
      !canEditEntry(
        { id: actor.actorId, role: actor.actorRole, status: "ACTIVE" },
        entry.authorId,
        entry.status,
      )
    )
      throw new AppError("ENTRY_NOT_EDITABLE", 403, "Bu entry düzenlenemez.");
    if (!hasMeaningfulEntryChange(entry.body, input.body)) return entry;

    await createEntryRevision(transaction, {
      entryId,
      body: entry.body,
      editedById: actor.actorId,
    });
    const updated = await updateEntryRecord(transaction, entryId, input.body);
    await appendOutboxEvent(transaction, {
      eventType: "entry.updated",
      aggregateType: "Entry",
      aggregateId: entryId,
      actorId: actor.actorId,
      actorKind: actor.actorKind,
      requestId: actor.requestId,
      payload: { topicId: entry.topicId },
    });
    await appendAuditLog(transaction, {
      actorId: actor.actorId,
      action: "entry.updated",
      entityType: "Entry",
      entityId: entryId,
      requestId: actor.requestId,
      metadata: { topicId: entry.topicId },
    });
    return updated;
  });
}

export async function deleteEntry(client: PrismaClient, actor: ActorContext, entryId: string) {
  return client.$transaction(async (transaction) => {
    const entry = await findEntryById(transaction, entryId);
    if (!entry) throw new AppError("ENTRY_NOT_FOUND", 404, "Entry bulunamadı.");
    if (
      !canEditEntry(
        { id: actor.actorId, role: actor.actorRole, status: "ACTIVE" },
        entry.authorId,
        entry.status,
      )
    )
      throw new AppError("ENTRY_NOT_EDITABLE", 403, "Bu entry silinemez.");
    const deleted = await softDeleteEntryRecord(transaction, entryId, new Date());
    await recalculateTopicCounter(transaction, entry.topicId);
    await appendOutboxEvent(transaction, {
      eventType: "entry.deleted",
      aggregateType: "Entry",
      aggregateId: entryId,
      actorId: actor.actorId,
      actorKind: actor.actorKind,
      requestId: actor.requestId,
      payload: { topicId: entry.topicId },
    });
    await appendAuditLog(transaction, {
      actorId: actor.actorId,
      action: "entry.deleted",
      entityType: "Entry",
      entityId: entryId,
      requestId: actor.requestId,
      metadata: { topicId: entry.topicId },
    });
    return deleted;
  });
}

function canInspectEntry(viewer: EntryViewer | null, entry: { authorId: string }): boolean {
  return Boolean(
    viewer &&
    (viewer.userId === entry.authorId ||
      (viewer.status === "ACTIVE" && (viewer.role === "MODERATOR" || viewer.role === "ADMIN"))),
  );
}

export async function getEntry(client: PrismaClient, entryId: string, viewer: EntryViewer | null) {
  return client.$transaction(async (transaction) => {
    const entry = await findEntryById(transaction, entryId);
    if (!entry) throw new AppError("ENTRY_NOT_FOUND", 404, "Entry bulunamadı.");
    const canInspectTopic = Boolean(
      viewer &&
      (viewer.userId === entry.authorId ||
        viewer.userId === entry.topic.createdById ||
        (viewer.status === "ACTIVE" && (viewer.role === "MODERATOR" || viewer.role === "ADMIN"))),
    );
    if (entry.topic.status === "HIDDEN" && !canInspectTopic)
      throw new AppError("ENTRY_NOT_FOUND", 404, "Entry bulunamadı.");
    if (entry.topic.status === "MERGED" && entry.topic.mergedIntoId)
      return { ...entry, canonicalTopicId: entry.topic.mergedIntoId };
    if (entry.status === "HIDDEN" && !canInspectEntry(viewer, entry))
      throw new AppError("ENTRY_NOT_FOUND", 404, "Entry bulunamadı.");
    if (entry.status === "DELETED" && !canInspectEntry(viewer, entry))
      return { ...entry, body: "bu entry yazar tarafından silindi", normalizedBody: "" };
    return entry;
  });
}

export async function getEntryRevisions(
  client: PrismaClient,
  entryId: string,
  viewer: EntryViewer,
) {
  return client.$transaction(async (transaction) => {
    const entry = await findEntryById(transaction, entryId);
    if (!entry) throw new AppError("ENTRY_NOT_FOUND", 404, "Entry bulunamadı.");
    if (
      !canViewRevision(
        { id: viewer.userId, role: viewer.role, status: viewer.status },
        entry.authorId,
      )
    )
      throw new AppError("FORBIDDEN", 403, "Revision geçmişini görüntüleme yetkiniz yok.");
    return listEntryRevisions(transaction, entryId);
  });
}

export async function getTopicEntries(
  client: PrismaClient,
  input: {
    topicId: string;
    viewer: EntryViewer | null;
    page: number;
    pageSize: number;
    skip: number;
    sort: "oldest" | "newest" | "top";
    query?: string;
  },
) {
  return client.$transaction(async (transaction) => {
    const topic = await findTopicById(transaction, input.topicId);
    if (!topic) throw new AppError("TOPIC_NOT_FOUND", 404, "Başlık bulunamadı.");
    if (topic.status === "MERGED") throw mergedTopicError(topic);
    const canInspect = Boolean(
      input.viewer &&
      (input.viewer.userId === topic.createdById ||
        (input.viewer.status === "ACTIVE" &&
          (input.viewer.role === "MODERATOR" || input.viewer.role === "ADMIN"))),
    );
    if (topic.status === "HIDDEN" && !canInspect)
      throw new AppError("TOPIC_NOT_FOUND", 404, "Başlık bulunamadı.");
    const includeAllHidden =
      input.viewer?.status === "ACTIVE" &&
      (input.viewer.role === "MODERATOR" || input.viewer.role === "ADMIN");
    const listInput = {
      topicId: input.topicId,
      includeAllHidden,
      ...(!includeAllHidden && input.viewer ? { hiddenAuthorId: input.viewer.userId } : {}),
      skip: input.skip,
      take: input.pageSize,
      sort: input.sort,
      ...(input.query ? { query: input.query, includeAllHidden: false } : {}),
    };
    const [entries, totalItems] = await listTopicEntries(transaction, listInput);
    const blockedAuthorIds = input.viewer
      ? await listBlockedAuthorIds(transaction, input.viewer.userId)
      : new Set<string>();
    return {
      entries: entries.map((entry) =>
        entry.status === "DELETED" && !canInspectEntry(input.viewer, entry)
          ? {
              ...entry,
              body: "bu entry yazar tarafından silindi",
              normalizedBody: "",
              blockedByViewer: blockedAuthorIds.has(entry.authorId),
            }
          : { ...entry, blockedByViewer: blockedAuthorIds.has(entry.authorId) },
      ),
      totalItems,
    };
  });
}
