import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseClient, DatabaseExecutor } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { appendAuditLog } from "@/modules/audit";
import { requireApprovedWriter } from "@/modules/auth/application/guards";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { canEditEntry, canViewRevision } from "@/modules/auth/domain/permissions";
import {
  hasMeaningfulEntryChange,
  isCanonicalSeedEntry,
  withEditedIndicator,
} from "@/modules/entries/domain/entry";
import {
  createEntryRecord,
  createEntryRevision,
  findEntryById,
  findEntryByPublicId,
  listBlockedAuthorIds,
  listEntryRevisions,
  listTopicEntries,
  lockEntryState,
  softDeleteEntryRecord,
  updateEntryRecord,
} from "@/modules/entries/repository/entries";
import { appendOutboxEvent } from "@/modules/outbox";
import {
  findTopicById,
  lockTopicState,
  recalculateTopicCounter,
  updateTopicAfterEntryCreate,
} from "@/modules/topics/repository/topics";
import type { EntryCreateInput, EntryUpdateInput } from "@/modules/entries/validation/schemas";
import { topicPublicUrl } from "@/lib/routing/public-urls";

export interface EntryViewer {
  userId: string;
  role: "USER" | "MODERATOR" | "ADMIN";
  status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
}

function mergedTopicError(topic: {
  mergedInto: { id: string; publicId: number; title: string; slug: string } | null;
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
            url: topicPublicUrl(topic.mergedInto),
          }
        : null,
    },
  );
}

export async function createEntry(
  client: DatabaseExecutor,
  actor: ActorContext,
  topicId: string,
  input: EntryCreateInput,
) {
  return inTransaction(client, async (transaction) => {
    await requireApprovedWriter(transaction, actor.actorId);
    await lockTopicState(transaction, topicId);
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
    return withEditedIndicator(entry);
  });
}

export async function editEntry(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: EntryUpdateInput,
  entryId: string,
) {
  return inTransaction(client, async (transaction) => {
    await requireApprovedWriter(transaction, actor.actorId);
    const initialEntry = await findEntryById(transaction, entryId);
    if (!initialEntry) throw new AppError("ENTRY_NOT_FOUND", 404, "Entry bulunamadı.");
    await lockTopicState(transaction, initialEntry.topicId);
    await lockEntryState(transaction, entryId);
    const entry = await findEntryById(transaction, entryId);
    if (!entry) throw new AppError("ENTRY_NOT_FOUND", 404, "Entry bulunamadı.");
    if (entry.topicId !== initialEntry.topicId)
      throw new AppError(
        "ENTRY_NOT_EDITABLE",
        409,
        "Entry durumu eşzamanlı olarak değişti; işlemi yeniden deneyin.",
      );
    if (isCanonicalSeedEntry(entry))
      throw new AppError("ENTRY_NOT_EDITABLE", 409, "Korunan seed entry düzenlenemez.");
    if (
      !canEditEntry(
        { id: actor.actorId, role: actor.actorRole, status: "ACTIVE" },
        entry.authorId,
        entry.status,
      )
    )
      throw new AppError("ENTRY_NOT_EDITABLE", 403, "Bu entry düzenlenemez.");
    if (!hasMeaningfulEntryChange(entry.body, input.body)) return withEditedIndicator(entry);

    await createEntryRevision(transaction, {
      entryId,
      body: entry.body,
      editedById: actor.actorId,
    });
    const updated = await updateEntryRecord(transaction, entryId, input.body);
    if (!updated)
      throw new AppError(
        "ENTRY_NOT_EDITABLE",
        409,
        "Entry durumu eşzamanlı olarak değişti; işlemi yeniden deneyin.",
      );
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
    return withEditedIndicator(updated);
  });
}

export async function deleteEntry(client: DatabaseClient, actor: ActorContext, entryId: string) {
  return client.$transaction(async (transaction) => {
    await requireApprovedWriter(transaction, actor.actorId);
    const initialEntry = await findEntryById(transaction, entryId);
    if (!initialEntry) throw new AppError("ENTRY_NOT_FOUND", 404, "Entry bulunamadı.");
    await lockTopicState(transaction, initialEntry.topicId);
    await lockEntryState(transaction, entryId);
    const entry = await findEntryById(transaction, entryId);
    if (!entry) throw new AppError("ENTRY_NOT_FOUND", 404, "Entry bulunamadı.");
    if (entry.topicId !== initialEntry.topicId)
      throw new AppError(
        "ENTRY_NOT_EDITABLE",
        409,
        "Entry durumu eşzamanlı olarak değişti; işlemi yeniden deneyin.",
      );
    if (isCanonicalSeedEntry(entry))
      throw new AppError("ENTRY_NOT_EDITABLE", 409, "Korunan seed entry silinemez.");
    if (
      !canEditEntry(
        { id: actor.actorId, role: actor.actorRole, status: "ACTIVE" },
        entry.authorId,
        entry.status,
      )
    )
      throw new AppError("ENTRY_NOT_EDITABLE", 403, "Bu entry silinemez.");
    const deleted = await softDeleteEntryRecord(transaction, entryId, new Date());
    if (!deleted)
      throw new AppError(
        "ENTRY_NOT_EDITABLE",
        409,
        "Entry durumu eşzamanlı olarak değişti; işlemi yeniden deneyin.",
      );
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
    return withEditedIndicator(deleted);
  });
}

function canInspectEntry(viewer: EntryViewer | null, entry: { authorId: string }): boolean {
  return Boolean(
    viewer &&
    (viewer.userId === entry.authorId ||
      (viewer.status === "ACTIVE" && (viewer.role === "MODERATOR" || viewer.role === "ADMIN"))),
  );
}

async function getEntryRecord(
  client: DatabaseClient,
  reference: { id: string } | { publicId: number },
  viewer: EntryViewer | null,
) {
  return client.$transaction(async (transaction) => {
    const entry =
      "id" in reference
        ? await findEntryById(transaction, reference.id)
        : await findEntryByPublicId(transaction, reference.publicId);
    if (!entry) throw new AppError("ENTRY_NOT_FOUND", 404, "Entry bulunamadı.");
    const canInspectTopic = Boolean(
      viewer &&
      (viewer.userId === entry.authorId ||
        viewer.userId === entry.topic.createdById ||
        (viewer.status === "ACTIVE" && (viewer.role === "MODERATOR" || viewer.role === "ADMIN"))),
    );
    if (entry.topic.status === "HIDDEN" && !canInspectTopic)
      throw new AppError("ENTRY_NOT_FOUND", 404, "Entry bulunamadı.");
    const visibleEntry = withEditedIndicator(entry);
    if (entry.status === "HIDDEN" && !canInspectEntry(viewer, entry))
      throw new AppError("ENTRY_NOT_FOUND", 404, "Entry bulunamadı.");
    const presentedEntry =
      entry.status === "DELETED" && !canInspectEntry(viewer, entry)
        ? { ...visibleEntry, body: "bu entry yazar tarafından silindi", normalizedBody: "" }
        : visibleEntry;
    const canonicalTopic =
      entry.topic.status === "MERGED" && entry.topic.mergedInto ? entry.topic.mergedInto : null;
    return {
      ...presentedEntry,
      ...(entry.topic.status === "MERGED" && entry.topic.mergedIntoId
        ? { canonicalTopicId: entry.topic.mergedIntoId }
        : {}),
      canonicalTopic,
    };
  });
}

export function getEntry(client: DatabaseClient, entryId: string, viewer: EntryViewer | null) {
  return getEntryRecord(client, { id: entryId }, viewer);
}

export function getEntryByPublicId(
  client: DatabaseClient,
  publicId: number,
  viewer: EntryViewer | null,
) {
  return getEntryRecord(client, { publicId }, viewer);
}

export async function getEntryRevisions(
  client: DatabaseClient,
  entryId: string,
  viewer: EntryViewer,
  pagination: { skip: number; take: number },
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
    const [revisions, totalItems] = await listEntryRevisions(
      transaction,
      entryId,
      pagination.skip,
      pagination.take,
    );
    return { revisions, totalItems };
  });
}

export async function getTopicEntries(
  client: DatabaseClient,
  input: {
    topicId: string;
    viewer: EntryViewer | null;
    page: number;
    pageSize: number;
    skip: number;
    sort: "oldest" | "newest" | "top";
    query?: string;
    createdAtWindow?: { start: Date; end: Date };
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
      ...(input.createdAtWindow ? { createdAtWindow: input.createdAtWindow } : {}),
      ...(input.query ? { query: input.query, includeAllHidden: false } : {}),
    };
    const [entries, totalItems] = await listTopicEntries(transaction, listInput);
    const blockedAuthorIds = input.viewer
      ? await listBlockedAuthorIds(
          transaction,
          input.viewer.userId,
          entries.map((entry) => entry.authorId),
        )
      : new Set<string>();
    return {
      entries: entries.map((entry) => {
        const visibleEntry = withEditedIndicator(entry);
        return entry.status === "DELETED" && !canInspectEntry(input.viewer, entry)
          ? {
              ...visibleEntry,
              body: "bu entry yazar tarafından silindi",
              normalizedBody: "",
              blockedByViewer: blockedAuthorIds.has(entry.authorId),
            }
          : { ...visibleEntry, blockedByViewer: blockedAuthorIds.has(entry.authorId) };
      }),
      totalItems,
    };
  });
}
