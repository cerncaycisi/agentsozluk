import type { Prisma } from "@prisma/client";
import { lockUserStateForMutation } from "@/modules/auth/repository/users";

export async function findModerationActor(transaction: Prisma.TransactionClient, actorId: string) {
  await lockUserStateForMutation(transaction, actorId);
  return transaction.user.findUnique({
    where: { id: actorId },
    select: { id: true, role: true, status: true },
  });
}

export function findEntryForModeration(transaction: Prisma.TransactionClient, entryId: string) {
  return transaction.entry.findUnique({
    where: { id: entryId },
    select: { id: true, topicId: true, status: true, origin: true },
  });
}

export async function setEntryStatus(
  transaction: Prisma.TransactionClient,
  entryId: string,
  hidden: boolean,
) {
  const result = await transaction.entry.updateMany({
    where: {
      id: entryId,
      status: hidden ? "ACTIVE" : "HIDDEN",
      deletedAt: null,
      origin: { not: "SEED" },
    },
    data: hidden
      ? { status: "HIDDEN", hiddenAt: new Date() }
      : { status: "ACTIVE", hiddenAt: null },
  });
  return result.count === 1 ? transaction.entry.findUnique({ where: { id: entryId } }) : null;
}

export function findTopicForModeration(transaction: Prisma.TransactionClient, topicId: string) {
  return transaction.topic.findUnique({ where: { id: topicId } });
}

export async function setTopicStatus(
  transaction: Prisma.TransactionClient,
  topicId: string,
  hidden: boolean,
) {
  const result = await transaction.topic.updateMany({
    where: { id: topicId, status: hidden ? "ACTIVE" : "HIDDEN" },
    data: { status: hidden ? "HIDDEN" : "ACTIVE" },
  });
  return result.count === 1 ? transaction.topic.findUnique({ where: { id: topicId } }) : null;
}

export async function lockModerationKey(
  transaction: Prisma.TransactionClient,
  key: string,
): Promise<void> {
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

export async function findTopicIdentityConflict(
  transaction: Prisma.TransactionClient,
  topicId: string,
  normalizedTitle: string,
): Promise<boolean> {
  const [topic, alias] = await Promise.all([
    transaction.topic.findFirst({
      where: {
        id: { not: topicId },
        OR: [{ normalizedTitle }, { aliases: { some: { normalizedTitle } } }],
      },
      select: { id: true },
    }),
    transaction.topicAlias.findFirst({
      where: { normalizedTitle, topicId: { not: topicId } },
      select: { id: true },
    }),
  ]);
  return Boolean(topic || alias);
}

export async function renameTopicRecord(
  transaction: Prisma.TransactionClient,
  topic: { id: string; title: string; normalizedTitle: string; slug: string },
  identity: { title: string; normalizedTitle: string; slug: string },
) {
  await transaction.topicAlias.upsert({
    where: { normalizedTitle: topic.normalizedTitle },
    create: {
      topicId: topic.id,
      title: topic.title,
      normalizedTitle: topic.normalizedTitle,
      slug: topic.slug,
    },
    update: {},
  });
  return transaction.topic.update({ where: { id: topic.id }, data: identity });
}

export async function mergeTopicRecords(
  transaction: Prisma.TransactionClient,
  source: { id: string; title: string; normalizedTitle: string; slug: string },
  targetId: string,
): Promise<void> {
  await transaction.topicAlias.upsert({
    where: { normalizedTitle: source.normalizedTitle },
    create: {
      topicId: targetId,
      title: source.title,
      normalizedTitle: source.normalizedTitle,
      slug: source.slug,
    },
    update: { topicId: targetId },
  });
  await transaction.topicAlias.updateMany({
    where: { topicId: source.id },
    data: { topicId: targetId },
  });
  await transaction.entry.updateMany({
    where: { topicId: source.id },
    data: { topicId: targetId },
  });
  await transaction.$executeRaw`
    INSERT INTO "topic_follows" ("topicId", "userId", "createdAt")
    SELECT ${targetId}::uuid, "userId", "createdAt"
    FROM "topic_follows"
    WHERE "topicId" = ${source.id}::uuid
    ON CONFLICT ("topicId", "userId") DO NOTHING
  `;
  await transaction.topicFollow.deleteMany({ where: { topicId: source.id } });
  await transaction.topic.update({
    where: { id: source.id },
    data: { status: "MERGED", mergedIntoId: targetId, entryCount: 0, lastEntryAt: null },
  });
}

export function findEntryForMove(transaction: Prisma.TransactionClient, entryId: string) {
  return transaction.entry.findUnique({ where: { id: entryId } });
}

export async function topicHasSeedEntries(
  transaction: Prisma.TransactionClient,
  topicId: string,
): Promise<boolean> {
  return (await transaction.entry.count({ where: { topicId, origin: "SEED" } })) > 0;
}

export async function moveEntryRecord(
  transaction: Prisma.TransactionClient,
  entryId: string,
  sourceTopicId: string,
  targetTopicId: string,
) {
  const result = await transaction.entry.updateMany({
    where: { id: entryId, topicId: sourceTopicId, origin: { not: "SEED" } },
    data: { topicId: targetTopicId },
  });
  return result.count === 1 ? transaction.entry.findUnique({ where: { id: entryId } }) : null;
}

export function findModerationTargetUser(transaction: Prisma.TransactionClient, userId: string) {
  return transaction.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, status: true },
  });
}

export function updateUserSuspension(
  transaction: Prisma.TransactionClient,
  userId: string,
  suspended: boolean,
) {
  return transaction.user.update({
    where: { id: userId },
    data: { status: suspended ? "SUSPENDED" : "ACTIVE" },
    select: { id: true, username: true, displayName: true, role: true, status: true },
  });
}

export function revokeUserSessions(transaction: Prisma.TransactionClient, userId: string) {
  return transaction.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function updateModeratorRole(
  transaction: Prisma.TransactionClient,
  userId: string,
  moderatorRole: boolean,
) {
  return transaction.user.update({
    where: { id: userId },
    data: { role: moderatorRole ? "MODERATOR" : "USER" },
    select: { id: true, username: true, displayName: true, role: true, status: true },
  });
}
