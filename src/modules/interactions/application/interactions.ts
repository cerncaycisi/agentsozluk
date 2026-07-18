import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseClient, DatabaseExecutor, TransactionClient } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { appendAuditLog } from "@/modules/audit";
import { requireActiveActor } from "@/modules/auth/application/guards";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { lockUserStates } from "@/modules/auth/repository/users";
import { findEntryById, lockEntryState } from "@/modules/entries/repository/entries";
import { withEditedIndicator } from "@/modules/entries/domain/entry";
import { transitionVote, type VoteValue } from "@/modules/interactions/domain/vote";
import {
  findBlockTarget,
  findUserFollowTarget,
  findUserFollowTargetByUsername,
  findUserFollow,
  findUserBlock,
  findVote,
  listBlocks,
  listBookmarks,
  listFollows,
  listUserFollows,
  listViewerEntryStates,
  listVotes,
  lockEntryVoteCounter,
  putBlockRecord,
  putBookmarkRecord,
  putFollowRecord,
  putUserFollowRecord,
  removeBlockRecord,
  removeBookmarkRecord,
  removeFollowRecord,
  removeUserFollowRecord,
  removeVoteRecord,
  updateEntryVoteCounters,
  upsertVote,
} from "@/modules/interactions/repository/interactions";
import { appendOutboxEvent } from "@/modules/outbox";
import { findTopicById, lockTopicState } from "@/modules/topics/repository/topics";
import { normalizeProfileUsername } from "@/modules/users/domain/profile";

async function appendVoteOutbox(
  transaction: TransactionClient,
  actor: ActorContext,
  entryId: string,
  previous: VoteValue | null,
  next: VoteValue | null,
): Promise<void> {
  await appendOutboxEvent(transaction, {
    eventType: "entry.voted",
    aggregateType: "Entry",
    aggregateId: entryId,
    actorId: actor.actorId,
    actorKind: actor.actorKind,
    requestId: actor.requestId,
    payload: { previous, value: next },
  });
}

export async function setVote(
  client: DatabaseExecutor,
  actor: ActorContext,
  entryId: string,
  value: VoteValue,
) {
  return inTransaction(client, async (transaction) => {
    await requireActiveActor(transaction, actor.actorId);
    const initialEntry = await findEntryById(transaction, entryId);
    if (!initialEntry) throw new AppError("ENTRY_NOT_FOUND", 404, "Entry bulunamadı.");
    await lockTopicState(transaction, initialEntry.topicId);
    await lockEntryVoteCounter(transaction, entryId);
    await lockEntryState(transaction, entryId);
    const entry = await findEntryById(transaction, entryId);
    if (!entry) throw new AppError("ENTRY_NOT_FOUND", 404, "Entry bulunamadı.");
    if (entry.topicId !== initialEntry.topicId)
      throw new AppError(
        "ENTRY_NOT_EDITABLE",
        409,
        "Entry durumu eşzamanlı olarak değişti; işlemi yeniden deneyin.",
      );
    if (entry.topic.status !== "ACTIVE")
      throw new AppError("TOPIC_HIDDEN", 409, "Aktif olmayan başlıktaki entry oylanamaz.");
    if (entry.status !== "ACTIVE")
      throw new AppError("ENTRY_NOT_EDITABLE", 409, "Bu entry oylanamaz.");
    if (entry.authorId === actor.actorId)
      throw new AppError("CANNOT_VOTE_OWN_ENTRY", 403, "Kendi entry'nize oy veremezsiniz.");
    const existing = await findVote(transaction, entryId, actor.actorId);
    const previous = existing?.value as VoteValue | undefined;
    if (previous === value)
      return {
        value,
        score: entry.score,
        upvoteCount: entry.upvoteCount,
        downvoteCount: entry.downvoteCount,
      };
    await upsertVote(transaction, entryId, actor.actorId, value);
    const counters = transitionVote(
      {
        score: entry.score,
        upvoteCount: entry.upvoteCount,
        downvoteCount: entry.downvoteCount,
      },
      previous ?? null,
      value,
    );
    const updated = await updateEntryVoteCounters(transaction, entryId, counters);
    await appendVoteOutbox(transaction, actor, entryId, previous ?? null, value);
    return { value, ...updated };
  });
}

export async function removeVote(client: DatabaseExecutor, actor: ActorContext, entryId: string) {
  return inTransaction(client, async (transaction) => {
    await requireActiveActor(transaction, actor.actorId);
    await lockEntryVoteCounter(transaction, entryId);
    const entry = await findEntryById(transaction, entryId);
    if (!entry) throw new AppError("ENTRY_NOT_FOUND", 404, "Entry bulunamadı.");
    const existing = await findVote(transaction, entryId, actor.actorId);
    if (!existing)
      return {
        value: null,
        score: entry.score,
        upvoteCount: entry.upvoteCount,
        downvoteCount: entry.downvoteCount,
      };
    const previous = existing.value as VoteValue;
    await removeVoteRecord(transaction, entryId, actor.actorId);
    const counters = transitionVote(
      {
        score: entry.score,
        upvoteCount: entry.upvoteCount,
        downvoteCount: entry.downvoteCount,
      },
      previous,
      null,
    );
    const updated = await updateEntryVoteCounters(transaction, entryId, counters);
    await appendVoteOutbox(transaction, actor, entryId, previous, null);
    return { value: null, ...updated };
  });
}

export async function putBookmark(client: DatabaseExecutor, actor: ActorContext, entryId: string) {
  return inTransaction(client, async (transaction) => {
    await requireActiveActor(transaction, actor.actorId);
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
    if (entry.topic.status !== "ACTIVE")
      throw new AppError(
        "TOPIC_HIDDEN",
        409,
        "Aktif olmayan başlıktaki entry favorilere eklenemez.",
      );
    if (entry.status !== "ACTIVE")
      throw new AppError("ENTRY_NOT_EDITABLE", 409, "Bu entry favorilere eklenemez.");
    await putBookmarkRecord(transaction, entryId, actor.actorId);
    return { bookmarked: true };
  });
}

export async function deleteBookmark(
  client: DatabaseExecutor,
  actor: ActorContext,
  entryId: string,
) {
  await inTransaction(client, async (transaction) => {
    await requireActiveActor(transaction, actor.actorId);
    await removeBookmarkRecord(transaction, entryId, actor.actorId);
  });
  return { bookmarked: false };
}

export async function putFollow(client: DatabaseExecutor, actor: ActorContext, topicId: string) {
  return inTransaction(client, async (transaction) => {
    await requireActiveActor(transaction, actor.actorId);
    await lockTopicState(transaction, topicId);
    const topic = await findTopicById(transaction, topicId);
    if (!topic) throw new AppError("TOPIC_NOT_FOUND", 404, "Başlık bulunamadı.");
    if (topic.status === "MERGED") {
      return {
        followed: false,
        canonicalTopic: topic.mergedInto
          ? {
              id: topic.mergedInto.id,
              title: topic.mergedInto.title,
              url: `/baslik/${topic.mergedInto.id}-${topic.mergedInto.slug}`,
            }
          : null,
      };
    }
    if (topic.status !== "ACTIVE")
      throw new AppError("TOPIC_HIDDEN", 409, "Gizlenmiş başlık takip edilemez.");
    await putFollowRecord(transaction, topicId, actor.actorId);
    return { followed: true, canonicalTopic: null };
  });
}

export async function deleteFollow(client: DatabaseExecutor, actor: ActorContext, topicId: string) {
  await inTransaction(client, async (transaction) => {
    await requireActiveActor(transaction, actor.actorId);
    await lockTopicState(transaction, topicId);
    await removeFollowRecord(transaction, topicId, actor.actorId);
  });
  return { followed: false };
}

export async function putUserFollow(
  client: DatabaseExecutor,
  actor: ActorContext,
  followedId: string,
) {
  if (actor.actorId === followedId)
    throw new AppError("VALIDATION_ERROR", 422, "Kendinizi takip edemezsiniz.", {
      userId: ["Kendinizi takip edemezsiniz."],
    });
  return inTransaction(client, async (transaction) => {
    await lockUserStates(transaction, [
      { userId: actor.actorId, mode: "shared" },
      { userId: followedId, mode: "shared" },
    ]);
    await requireActiveActor(transaction, actor.actorId);
    const target = await findUserFollowTarget(transaction, followedId);
    if (!target || target.status !== "ACTIVE")
      throw new AppError("USER_NOT_FOUND", 404, "Kullanıcı bulunamadı.");
    await putUserFollowRecord(transaction, actor.actorId, followedId);
    await appendAuditLog(transaction, {
      actorId: actor.actorId,
      action: "user.followed",
      entityType: "User",
      entityId: followedId,
      requestId: actor.requestId,
    });
    return { followed: true, user: target };
  });
}

export async function deleteUserFollow(
  client: DatabaseExecutor,
  actor: ActorContext,
  followedId: string,
) {
  return inTransaction(client, async (transaction) => {
    await requireActiveActor(transaction, actor.actorId);
    await removeUserFollowRecord(transaction, actor.actorId, followedId);
    await appendAuditLog(transaction, {
      actorId: actor.actorId,
      action: "user.unfollowed",
      entityType: "User",
      entityId: followedId,
      requestId: actor.requestId,
    });
    return { followed: false };
  });
}

export async function putUserFollowByUsername(
  client: DatabaseExecutor,
  actor: ActorContext,
  username: string,
) {
  const normalized = normalizeProfileUsername(username);
  const target = await inTransaction(client, (transaction) =>
    findUserFollowTargetByUsername(transaction, normalized),
  );
  if (!target) throw new AppError("USER_NOT_FOUND", 404, "Kullanıcı bulunamadı.");
  return putUserFollow(client, actor, target.id);
}

export async function deleteUserFollowByUsername(
  client: DatabaseExecutor,
  actor: ActorContext,
  username: string,
) {
  const normalized = normalizeProfileUsername(username);
  const target = await inTransaction(client, (transaction) =>
    findUserFollowTargetByUsername(transaction, normalized),
  );
  if (!target) throw new AppError("USER_NOT_FOUND", 404, "Kullanıcı bulunamadı.");
  return deleteUserFollow(client, actor, target.id);
}

export function getUserFollowState(
  client: DatabaseExecutor,
  followerId: string,
  followedId: string,
) {
  return inTransaction(client, async (transaction) => ({
    followed: Boolean(await findUserFollow(transaction, followerId, followedId)),
  }));
}

export function getFollowedUsers(
  client: DatabaseExecutor,
  followerId: string,
  skip: number,
  take: number,
) {
  return inTransaction(client, (transaction) =>
    listUserFollows(transaction, followerId, skip, take),
  );
}

export async function putBlock(client: DatabaseClient, actor: ActorContext, blockedId: string) {
  if (actor.actorId === blockedId)
    throw new AppError("VALIDATION_ERROR", 422, "Kendinizi engelleyemezsiniz.", {
      userId: ["Kendinizi engelleyemezsiniz."],
    });
  return client.$transaction(async (transaction) => {
    await lockUserStates(transaction, [
      { userId: actor.actorId, mode: "shared" },
      { userId: blockedId, mode: "shared" },
    ]);
    await requireActiveActor(transaction, actor.actorId);
    const target = await findBlockTarget(transaction, blockedId);
    if (!target || target.status === "DEACTIVATED")
      throw new AppError("USER_NOT_FOUND", 404, "Kullanıcı bulunamadı.");
    await putBlockRecord(transaction, actor.actorId, blockedId);
    await appendAuditLog(transaction, {
      actorId: actor.actorId,
      action: "user.blocked",
      entityType: "User",
      entityId: blockedId,
      requestId: actor.requestId,
    });
    return { blocked: true, user: target };
  });
}

export async function deleteBlock(client: DatabaseClient, actor: ActorContext, blockedId: string) {
  await client.$transaction(async (transaction) => {
    await requireActiveActor(transaction, actor.actorId);
    await removeBlockRecord(transaction, actor.actorId, blockedId);
    await appendAuditLog(transaction, {
      actorId: actor.actorId,
      action: "user.unblocked",
      entityType: "User",
      entityId: blockedId,
      requestId: actor.requestId,
    });
  });
  return { blocked: false };
}

export async function getBookmarks(
  client: DatabaseClient,
  userId: string,
  skip: number,
  take: number,
) {
  const [items, totalItems] = await client.$transaction((transaction) =>
    listBookmarks(transaction, userId, skip, take),
  );
  return [
    items.map((item) => ({ ...item, entry: withEditedIndicator(item.entry) })),
    totalItems,
  ] as const;
}

export function getFollows(client: DatabaseClient, userId: string, skip: number, take: number) {
  return client.$transaction((transaction) => listFollows(transaction, userId, skip, take));
}

export async function getVotes(client: DatabaseClient, userId: string, skip: number, take: number) {
  const [items, totalItems] = await client.$transaction((transaction) =>
    listVotes(transaction, userId, skip, take),
  );
  return [
    items.map((item) => ({ ...item, entry: withEditedIndicator(item.entry) })),
    totalItems,
  ] as const;
}

export function getBlocks(client: DatabaseClient, userId: string, skip: number, take: number) {
  return client.$transaction((transaction) => listBlocks(transaction, userId, skip, take));
}

export function getViewerEntryStates(client: DatabaseClient, userId: string, entryIds: string[]) {
  return client.$transaction((transaction) => listViewerEntryStates(transaction, userId, entryIds));
}

export async function getBlockState(
  client: DatabaseClient,
  blockerId: string,
  blockedId: string,
): Promise<boolean> {
  return Boolean(
    await client.$transaction((transaction) => findUserBlock(transaction, blockerId, blockedId)),
  );
}
