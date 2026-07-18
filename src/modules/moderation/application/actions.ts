import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor, TransactionClient } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { appendAuditLog } from "@/modules/audit";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { lockUserActorAndTargetTransition } from "@/modules/auth/repository/users";
import { isCanonicalSeedEntry } from "@/modules/entries/domain/entry";
import { lockEntryState } from "@/modules/entries/repository/entries";
import { lockTopicState, recalculateTopicCounter } from "@/modules/topics/repository/topics";
import { createTopicSlug, normalizeTopicTitle } from "@/modules/topics/domain/normalization";
import { assertCanActOnUser, requireModerator } from "@/modules/moderation/domain/authorization";
import {
  findEntryForModeration,
  findEntryForMove,
  findModerationActor,
  findModerationTargetUser,
  findTopicForModeration,
  findTopicIdentityConflict,
  lockModerationKey,
  mergeTopicRecords,
  moveEntryRecord,
  renameTopicRecord,
  revokeUserSessions,
  setEntryStatus,
  setTopicStatus,
  topicHasSeedEntries,
  updateModeratorRole,
  updateUserSuspension,
} from "@/modules/moderation/repository/actions";
import { appendModerationAction } from "@/modules/moderation/repository/history";
import type {
  EntryMoveInput,
  ModerationReasonInput,
  TopicMergeInput,
  TopicRenameInput,
} from "@/modules/moderation/validation/schemas";
import { appendOutboxEvent, type OutboxEventType } from "@/modules/outbox";

async function recordAction(
  transaction: TransactionClient,
  actor: ActorContext,
  input: {
    actionType: string;
    eventType: OutboxEventType;
    targetType: string;
    targetId: string;
    reason: string;
    before: unknown;
    after: unknown;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const metadata = {
    ...(input.metadata ?? {}),
    actorKind: actor.actorKind,
    before: input.before,
    after: input.after,
    reason: input.reason,
  };
  await appendModerationAction(transaction, {
    moderatorId: actor.actorId,
    actionType: input.actionType,
    targetType: input.targetType.toUpperCase(),
    targetId: input.targetId,
    reason: input.reason,
    metadata,
  });
  await appendAuditLog(transaction, {
    actorId: actor.actorId,
    action: input.eventType,
    entityType: input.targetType,
    entityId: input.targetId,
    requestId: actor.requestId,
    metadata,
  });
  await appendOutboxEvent(transaction, {
    eventType: input.eventType,
    aggregateType: input.targetType,
    aggregateId: input.targetId,
    actorId: actor.actorId,
    actorKind: actor.actorKind,
    requestId: actor.requestId,
    payload: metadata,
  });
}

export async function setEntryVisibility(
  client: DatabaseExecutor,
  actor: ActorContext,
  entryId: string,
  hidden: boolean,
  input: ModerationReasonInput,
) {
  return inTransaction(client, async (transaction) => {
    requireModerator(await findModerationActor(transaction, actor.actorId), actor);
    const initialEntry = await findEntryForModeration(transaction, entryId);
    if (!initialEntry) throw new AppError("ENTRY_NOT_FOUND", 404, "Entry bulunamadı.");
    await lockTopicState(transaction, initialEntry.topicId);
    await lockEntryState(transaction, entryId);
    const entry = await findEntryForModeration(transaction, entryId);
    if (!entry) throw new AppError("ENTRY_NOT_FOUND", 404, "Entry bulunamadı.");
    if (entry.topicId !== initialEntry.topicId)
      throw new AppError(
        "ENTRY_NOT_EDITABLE",
        409,
        "Entry durumu eşzamanlı olarak değişti; işlemi yeniden deneyin.",
      );
    if (hidden && isCanonicalSeedEntry(entry))
      throw new AppError("ENTRY_NOT_EDITABLE", 409, "Korunan seed entry gizlenemez.");
    if (hidden && entry.status !== "ACTIVE")
      throw new AppError("ENTRY_NOT_EDITABLE", 409, "Yalnızca aktif entry gizlenebilir.");
    if (!hidden && entry.status !== "HIDDEN")
      throw new AppError("ENTRY_NOT_EDITABLE", 409, "Yalnızca gizli entry geri açılabilir.");
    const updated = await setEntryStatus(transaction, entryId, hidden);
    if (!updated)
      throw new AppError(
        "ENTRY_NOT_EDITABLE",
        409,
        "Entry durumu eşzamanlı olarak değişti; işlemi yeniden deneyin.",
      );
    await recalculateTopicCounter(transaction, entry.topicId);
    await recordAction(transaction, actor, {
      actionType: hidden ? "ENTRY_HIDDEN" : "ENTRY_RESTORED",
      eventType: hidden ? "entry.hidden" : "entry.restored",
      targetType: "Entry",
      targetId: entryId,
      reason: input.reason,
      before: { status: entry.status },
      after: { status: updated.status },
      metadata: { topicId: entry.topicId },
    });
    return updated;
  });
}

export async function setTopicVisibility(
  client: DatabaseExecutor,
  actor: ActorContext,
  topicId: string,
  hidden: boolean,
  input: ModerationReasonInput,
) {
  return inTransaction(client, async (transaction) => {
    requireModerator(await findModerationActor(transaction, actor.actorId), actor);
    await lockTopicState(transaction, topicId);
    const topic = await findTopicForModeration(transaction, topicId);
    if (!topic) throw new AppError("TOPIC_NOT_FOUND", 404, "Başlık bulunamadı.");
    const expected = hidden ? "ACTIVE" : "HIDDEN";
    if (topic.status !== expected)
      throw new AppError("TOPIC_HIDDEN", 409, "Başlığın durumu bu işlem için uygun değil.");
    const updated = await setTopicStatus(transaction, topicId, hidden);
    if (!updated)
      throw new AppError("TOPIC_HIDDEN", 409, "Başlığın durumu eşzamanlı olarak değişti.");
    await recordAction(transaction, actor, {
      actionType: hidden ? "TOPIC_HIDDEN" : "TOPIC_RESTORED",
      eventType: hidden ? "topic.hidden" : "topic.restored",
      targetType: "Topic",
      targetId: topicId,
      reason: input.reason,
      before: { status: topic.status },
      after: { status: updated.status },
    });
    return updated;
  });
}

export async function renameTopic(
  client: DatabaseExecutor,
  actor: ActorContext,
  topicId: string,
  input: TopicRenameInput,
) {
  const title = input.title.normalize("NFKC").trim().replaceAll(/\s+/gu, " ");
  const normalizedTitle = normalizeTopicTitle(title);
  return inTransaction(client, async (transaction) => {
    requireModerator(await findModerationActor(transaction, actor.actorId), actor);
    await lockTopicState(transaction, topicId);
    await lockModerationKey(transaction, normalizedTitle);
    const topic = await findTopicForModeration(transaction, topicId);
    if (!topic) throw new AppError("TOPIC_NOT_FOUND", 404, "Başlık bulunamadı.");
    if (await findTopicIdentityConflict(transaction, topicId, normalizedTitle))
      throw new AppError("TOPIC_EXISTS", 409, "Bu başlık veya alias zaten mevcut.");
    if (normalizedTitle === topic.normalizedTitle) return topic;
    const updated = await renameTopicRecord(transaction, topic, {
      title,
      normalizedTitle,
      slug: createTopicSlug(title),
    });
    await recordAction(transaction, actor, {
      actionType: "TOPIC_RENAMED",
      eventType: "topic.renamed",
      targetType: "Topic",
      targetId: topicId,
      reason: input.reason,
      before: {
        title: topic.title,
        normalizedTitle: topic.normalizedTitle,
        slug: topic.slug,
      },
      after: {
        title: updated.title,
        normalizedTitle: updated.normalizedTitle,
        slug: updated.slug,
      },
      metadata: { previousTitle: topic.title, title },
    });
    return updated;
  });
}

export async function mergeTopic(
  client: DatabaseExecutor,
  actor: ActorContext,
  sourceTopicId: string,
  input: TopicMergeInput,
) {
  if (sourceTopicId === input.targetTopicId)
    throw new AppError("VALIDATION_ERROR", 422, "Başlık kendisiyle birleştirilemez.");
  return inTransaction(client, async (transaction) => {
    requireModerator(await findModerationActor(transaction, actor.actorId), actor);
    await lockTopicState(transaction, [sourceTopicId, input.targetTopicId]);
    const [source, target] = await Promise.all([
      findTopicForModeration(transaction, sourceTopicId),
      findTopicForModeration(transaction, input.targetTopicId),
    ]);
    if (!source || !target) throw new AppError("TOPIC_NOT_FOUND", 404, "Başlık bulunamadı.");
    if (source.status !== "ACTIVE" || target.status !== "ACTIVE")
      throw new AppError("TOPIC_HIDDEN", 409, "Yalnızca aktif başlıklar birleştirilebilir.");
    if (await topicHasSeedEntries(transaction, source.id))
      throw new AppError(
        "ENTRY_NOT_EDITABLE",
        409,
        "Korunan seed entry içeren başlık birleştirilemez.",
      );
    await mergeTopicRecords(transaction, source, target.id);
    await recalculateTopicCounter(transaction, target.id);
    await recordAction(transaction, actor, {
      actionType: "TOPIC_MERGED",
      eventType: "topic.merged",
      targetType: "Topic",
      targetId: source.id,
      reason: input.reason,
      before: { status: source.status, mergedIntoId: source.mergedIntoId },
      after: { status: "MERGED", mergedIntoId: target.id },
      metadata: { targetTopicId: target.id },
    });
    return { sourceTopicId: source.id, targetTopicId: target.id };
  });
}

export async function moveEntry(
  client: DatabaseExecutor,
  actor: ActorContext,
  entryId: string,
  input: EntryMoveInput,
) {
  return inTransaction(client, async (transaction) => {
    requireModerator(await findModerationActor(transaction, actor.actorId), actor);
    const initialEntry = await findEntryForMove(transaction, entryId);
    if (!initialEntry) throw new AppError("ENTRY_NOT_FOUND", 404, "Entry bulunamadı.");
    await lockTopicState(transaction, [initialEntry.topicId, input.targetTopicId]);
    await lockEntryState(transaction, entryId);
    const [entry, target] = await Promise.all([
      findEntryForMove(transaction, entryId),
      findTopicForModeration(transaction, input.targetTopicId),
    ]);
    if (!entry) throw new AppError("ENTRY_NOT_FOUND", 404, "Entry bulunamadı.");
    if (entry.topicId !== initialEntry.topicId)
      throw new AppError(
        "ENTRY_NOT_EDITABLE",
        409,
        "Entry durumu eşzamanlı olarak değişti; işlemi yeniden deneyin.",
      );
    if (!target) throw new AppError("TOPIC_NOT_FOUND", 404, "Hedef başlık bulunamadı.");
    if (isCanonicalSeedEntry(entry))
      throw new AppError("ENTRY_NOT_EDITABLE", 409, "Korunan seed entry taşınamaz.");
    if (target.status !== "ACTIVE")
      throw new AppError("TOPIC_HIDDEN", 409, "Entry yalnızca aktif başlığa taşınabilir.");
    if (entry.topicId === target.id) return entry;
    const updated = await moveEntryRecord(transaction, entryId, entry.topicId, target.id);
    if (!updated)
      throw new AppError(
        "ENTRY_NOT_EDITABLE",
        409,
        "Entry durumu eşzamanlı olarak değişti; işlemi yeniden deneyin.",
      );
    await recalculateTopicCounter(transaction, entry.topicId);
    await recalculateTopicCounter(transaction, target.id);
    await recordAction(transaction, actor, {
      actionType: "ENTRY_MOVED",
      eventType: "entry.moved",
      targetType: "Entry",
      targetId: entryId,
      reason: input.reason,
      before: { topicId: entry.topicId },
      after: { topicId: updated.topicId },
      metadata: { sourceTopicId: entry.topicId, targetTopicId: target.id },
    });
    return updated;
  });
}

export async function setUserSuspension(
  client: DatabaseExecutor,
  actor: ActorContext,
  userId: string,
  suspended: boolean,
  input: ModerationReasonInput,
) {
  return inTransaction(client, async (transaction) => {
    await lockUserActorAndTargetTransition(transaction, actor.actorId, userId);
    const moderator = requireModerator(
      await findModerationActor(transaction, actor.actorId),
      actor,
    );
    const target = await findModerationTargetUser(transaction, userId);
    if (!target) throw new AppError("USER_NOT_FOUND", 404, "Kullanıcı bulunamadı.");
    assertCanActOnUser(moderator, target);
    const expected = suspended ? "ACTIVE" : "SUSPENDED";
    if (target.status !== expected)
      throw new AppError("FORBIDDEN", 409, "Kullanıcının durumu bu işlem için uygun değil.");
    const updated = await updateUserSuspension(transaction, userId, suspended);
    if (suspended) await revokeUserSessions(transaction, userId);
    await recordAction(transaction, actor, {
      actionType: suspended ? "USER_SUSPENDED" : "USER_UNSUSPENDED",
      eventType: suspended ? "user.suspended" : "user.unsuspended",
      targetType: "User",
      targetId: userId,
      reason: input.reason,
      before: { status: target.status },
      after: { status: updated.status },
      metadata: { role: target.role },
    });
    return updated;
  });
}

export async function setModeratorRole(
  client: DatabaseExecutor,
  actor: ActorContext,
  userId: string,
  moderatorRole: boolean,
  input: ModerationReasonInput,
) {
  return inTransaction(client, async (transaction) => {
    await lockUserActorAndTargetTransition(transaction, actor.actorId, userId);
    const admin = requireModerator(await findModerationActor(transaction, actor.actorId), actor, {
      adminOnly: true,
    });
    const target = await findModerationTargetUser(transaction, userId);
    if (!target) throw new AppError("USER_NOT_FOUND", 404, "Kullanıcı bulunamadı.");
    if (admin.id === target.id || target.role === "ADMIN")
      throw new AppError(
        "FORBIDDEN",
        403,
        "Admin kendi rolünü veya başka bir admini değiştiremez.",
      );
    const expected = moderatorRole ? "USER" : "MODERATOR";
    if (target.role !== expected)
      throw new AppError("FORBIDDEN", 409, "Kullanıcının rolü bu işlem için uygun değil.");
    const updated = await updateModeratorRole(transaction, userId, moderatorRole);
    await recordAction(transaction, actor, {
      actionType: moderatorRole ? "MODERATOR_GRANTED" : "MODERATOR_REVOKED",
      eventType: "user.role_changed",
      targetType: "User",
      targetId: userId,
      reason: input.reason,
      before: { role: target.role },
      after: { role: updated.role },
      metadata: { previousRole: target.role, role: updated.role },
    });
    return updated;
  });
}
