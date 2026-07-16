import type { Prisma, PrismaClient } from "@prisma/client";
import { AppError } from "@/lib/http/errors";
import { appendAuditLog } from "@/modules/audit/repository/audit";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { recalculateTopicCounter } from "@/modules/topics/repository/topics";
import { createTopicSlug, normalizeTopicTitle } from "@/modules/topics/domain/normalization";
import { assertCanActOnUser, requireModerator } from "@/modules/moderation/domain/authorization";
import { appendModerationAction } from "@/modules/moderation/repository/history";
import type {
  EntryMoveInput,
  ModerationReasonInput,
  TopicMergeInput,
  TopicRenameInput,
} from "@/modules/moderation/validation/schemas";
import { appendOutboxEvent, type OutboxEventType } from "@/modules/outbox/repository/outbox";

async function recordAction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: {
    actionType: string;
    eventType: OutboxEventType;
    targetType: string;
    targetId: string;
    reason: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await appendModerationAction(transaction, {
    moderatorId: actor.actorId,
    actionType: input.actionType,
    targetType: input.targetType.toUpperCase(),
    targetId: input.targetId,
    reason: input.reason,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
  await appendAuditLog(transaction, {
    actorId: actor.actorId,
    action: input.eventType,
    entityType: input.targetType,
    entityId: input.targetId,
    requestId: actor.requestId,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
  await appendOutboxEvent(transaction, {
    eventType: input.eventType,
    aggregateType: input.targetType,
    aggregateId: input.targetId,
    actorId: actor.actorId,
    actorKind: actor.actorKind,
    requestId: actor.requestId,
    ...(input.metadata ? { payload: input.metadata } : {}),
  });
}

export async function setEntryVisibility(
  client: PrismaClient,
  actor: ActorContext,
  entryId: string,
  hidden: boolean,
  input: ModerationReasonInput,
) {
  return client.$transaction(async (transaction) => {
    await requireModerator(transaction, actor);
    const entry = await transaction.entry.findUnique({
      where: { id: entryId },
      select: { id: true, topicId: true, status: true },
    });
    if (!entry) throw new AppError("ENTRY_NOT_FOUND", 404, "Entry bulunamadı.");
    if (hidden && entry.status !== "ACTIVE")
      throw new AppError("ENTRY_NOT_EDITABLE", 409, "Yalnızca aktif entry gizlenebilir.");
    if (!hidden && entry.status !== "HIDDEN")
      throw new AppError("ENTRY_NOT_EDITABLE", 409, "Yalnızca gizli entry geri açılabilir.");
    const updated = await transaction.entry.update({
      where: { id: entryId },
      data: hidden
        ? { status: "HIDDEN", hiddenAt: new Date() }
        : { status: "ACTIVE", hiddenAt: null },
    });
    await recalculateTopicCounter(transaction, entry.topicId);
    await recordAction(transaction, actor, {
      actionType: hidden ? "ENTRY_HIDDEN" : "ENTRY_RESTORED",
      eventType: hidden ? "entry.hidden" : "entry.restored",
      targetType: "Entry",
      targetId: entryId,
      reason: input.reason,
      metadata: { topicId: entry.topicId },
    });
    return updated;
  });
}

export async function setTopicVisibility(
  client: PrismaClient,
  actor: ActorContext,
  topicId: string,
  hidden: boolean,
  input: ModerationReasonInput,
) {
  return client.$transaction(async (transaction) => {
    await requireModerator(transaction, actor);
    const topic = await transaction.topic.findUnique({ where: { id: topicId } });
    if (!topic) throw new AppError("TOPIC_NOT_FOUND", 404, "Başlık bulunamadı.");
    const expected = hidden ? "ACTIVE" : "HIDDEN";
    if (topic.status !== expected)
      throw new AppError("TOPIC_HIDDEN", 409, "Başlığın durumu bu işlem için uygun değil.");
    const updated = await transaction.topic.update({
      where: { id: topicId },
      data: { status: hidden ? "HIDDEN" : "ACTIVE" },
    });
    await recordAction(transaction, actor, {
      actionType: hidden ? "TOPIC_HIDDEN" : "TOPIC_RESTORED",
      eventType: hidden ? "topic.hidden" : "topic.restored",
      targetType: "Topic",
      targetId: topicId,
      reason: input.reason,
    });
    return updated;
  });
}

export async function renameTopic(
  client: PrismaClient,
  actor: ActorContext,
  topicId: string,
  input: TopicRenameInput,
) {
  const title = input.title.normalize("NFKC").trim().replaceAll(/\s+/gu, " ");
  const normalizedTitle = normalizeTopicTitle(title);
  return client.$transaction(async (transaction) => {
    await requireModerator(transaction, actor);
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${normalizedTitle}, 0))`;
    const topic = await transaction.topic.findUnique({ where: { id: topicId } });
    if (!topic) throw new AppError("TOPIC_NOT_FOUND", 404, "Başlık bulunamadı.");
    const conflict = await transaction.topic.findFirst({
      where: {
        id: { not: topicId },
        OR: [{ normalizedTitle }, { aliases: { some: { normalizedTitle } } }],
      },
      select: { id: true },
    });
    const aliasConflict = await transaction.topicAlias.findFirst({
      where: { normalizedTitle, topicId: { not: topicId } },
      select: { id: true },
    });
    if (conflict || aliasConflict)
      throw new AppError("TOPIC_EXISTS", 409, "Bu başlık veya alias zaten mevcut.");
    if (normalizedTitle === topic.normalizedTitle) return topic;
    await transaction.topicAlias.upsert({
      where: { normalizedTitle: topic.normalizedTitle },
      create: {
        topicId,
        title: topic.title,
        normalizedTitle: topic.normalizedTitle,
        slug: topic.slug,
      },
      update: {},
    });
    const updated = await transaction.topic.update({
      where: { id: topicId },
      data: { title, normalizedTitle, slug: createTopicSlug(title) },
    });
    await recordAction(transaction, actor, {
      actionType: "TOPIC_RENAMED",
      eventType: "topic.renamed",
      targetType: "Topic",
      targetId: topicId,
      reason: input.reason,
      metadata: { previousTitle: topic.title, title },
    });
    return updated;
  });
}

export async function mergeTopic(
  client: PrismaClient,
  actor: ActorContext,
  sourceTopicId: string,
  input: TopicMergeInput,
) {
  if (sourceTopicId === input.targetTopicId)
    throw new AppError("VALIDATION_ERROR", 422, "Başlık kendisiyle birleştirilemez.");
  return client.$transaction(async (transaction) => {
    await requireModerator(transaction, actor);
    const lockKey = [sourceTopicId, input.targetTopicId].sort().join(":");
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
    const [source, target] = await Promise.all([
      transaction.topic.findUnique({ where: { id: sourceTopicId } }),
      transaction.topic.findUnique({ where: { id: input.targetTopicId } }),
    ]);
    if (!source || !target) throw new AppError("TOPIC_NOT_FOUND", 404, "Başlık bulunamadı.");
    if (source.status !== "ACTIVE" || target.status !== "ACTIVE")
      throw new AppError("TOPIC_HIDDEN", 409, "Yalnızca aktif başlıklar birleştirilebilir.");
    await transaction.topicAlias.upsert({
      where: { normalizedTitle: source.normalizedTitle },
      create: {
        topicId: target.id,
        title: source.title,
        normalizedTitle: source.normalizedTitle,
        slug: source.slug,
      },
      update: { topicId: target.id },
    });
    await transaction.topicAlias.updateMany({
      where: { topicId: source.id },
      data: { topicId: target.id },
    });
    await transaction.entry.updateMany({
      where: { topicId: source.id },
      data: { topicId: target.id },
    });
    await transaction.topicFollow.deleteMany({ where: { topicId: source.id } });
    await transaction.topic.update({
      where: { id: source.id },
      data: { status: "MERGED", mergedIntoId: target.id, entryCount: 0, lastEntryAt: null },
    });
    await recalculateTopicCounter(transaction, target.id);
    await recordAction(transaction, actor, {
      actionType: "TOPIC_MERGED",
      eventType: "topic.merged",
      targetType: "Topic",
      targetId: source.id,
      reason: input.reason,
      metadata: { targetTopicId: target.id },
    });
    return { sourceTopicId: source.id, targetTopicId: target.id };
  });
}

export async function moveEntry(
  client: PrismaClient,
  actor: ActorContext,
  entryId: string,
  input: EntryMoveInput,
) {
  return client.$transaction(async (transaction) => {
    await requireModerator(transaction, actor);
    const [entry, target] = await Promise.all([
      transaction.entry.findUnique({ where: { id: entryId } }),
      transaction.topic.findUnique({ where: { id: input.targetTopicId } }),
    ]);
    if (!entry) throw new AppError("ENTRY_NOT_FOUND", 404, "Entry bulunamadı.");
    if (!target) throw new AppError("TOPIC_NOT_FOUND", 404, "Hedef başlık bulunamadı.");
    if (target.status !== "ACTIVE")
      throw new AppError("TOPIC_HIDDEN", 409, "Entry yalnızca aktif başlığa taşınabilir.");
    if (entry.topicId === target.id) return entry;
    const updated = await transaction.entry.update({
      where: { id: entryId },
      data: { topicId: target.id },
    });
    await recalculateTopicCounter(transaction, entry.topicId);
    await recalculateTopicCounter(transaction, target.id);
    await recordAction(transaction, actor, {
      actionType: "ENTRY_MOVED",
      eventType: "entry.moved",
      targetType: "Entry",
      targetId: entryId,
      reason: input.reason,
      metadata: { sourceTopicId: entry.topicId, targetTopicId: target.id },
    });
    return updated;
  });
}

export async function setUserSuspension(
  client: PrismaClient,
  actor: ActorContext,
  userId: string,
  suspended: boolean,
  input: ModerationReasonInput,
) {
  return client.$transaction(async (transaction) => {
    const moderator = await requireModerator(transaction, actor);
    const target = await transaction.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });
    if (!target) throw new AppError("USER_NOT_FOUND", 404, "Kullanıcı bulunamadı.");
    assertCanActOnUser(moderator, target);
    const expected = suspended ? "ACTIVE" : "SUSPENDED";
    if (target.status !== expected)
      throw new AppError("FORBIDDEN", 409, "Kullanıcının durumu bu işlem için uygun değil.");
    const updated = await transaction.user.update({
      where: { id: userId },
      data: { status: suspended ? "SUSPENDED" : "ACTIVE" },
      select: { id: true, username: true, displayName: true, role: true, status: true },
    });
    if (suspended) {
      await transaction.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await recordAction(transaction, actor, {
      actionType: suspended ? "USER_SUSPENDED" : "USER_UNSUSPENDED",
      eventType: suspended ? "user.suspended" : "user.unsuspended",
      targetType: "User",
      targetId: userId,
      reason: input.reason,
      metadata: { role: target.role },
    });
    return updated;
  });
}

export async function setModeratorRole(
  client: PrismaClient,
  actor: ActorContext,
  userId: string,
  moderatorRole: boolean,
  input: ModerationReasonInput,
) {
  return client.$transaction(async (transaction) => {
    const admin = await requireModerator(transaction, actor, { adminOnly: true });
    const target = await transaction.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });
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
    const updated = await transaction.user.update({
      where: { id: userId },
      data: { role: moderatorRole ? "MODERATOR" : "USER" },
      select: { id: true, username: true, displayName: true, role: true, status: true },
    });
    await recordAction(transaction, actor, {
      actionType: moderatorRole ? "MODERATOR_GRANTED" : "MODERATOR_REVOKED",
      eventType: "user.role_changed",
      targetType: "User",
      targetId: userId,
      reason: input.reason,
      metadata: { previousRole: target.role, role: updated.role },
    });
    return updated;
  });
}
