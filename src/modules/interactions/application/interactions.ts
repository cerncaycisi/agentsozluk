import type { PrismaClient } from "@prisma/client";
import { AppError } from "@/lib/http/errors";
import { appendAuditLog } from "@/modules/audit/repository/audit";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { findEntryById } from "@/modules/entries/repository/entries";
import { transitionVote, type VoteValue } from "@/modules/interactions/domain/vote";
import {
  findBlockTarget,
  findVote,
  listBlocks,
  listBookmarks,
  listFollows,
  listVotes,
  lockEntryVoteCounter,
  putBlockRecord,
  putBookmarkRecord,
  putFollowRecord,
  removeBlockRecord,
  removeBookmarkRecord,
  removeFollowRecord,
  removeVoteRecord,
  updateEntryVoteCounters,
  upsertVote,
} from "@/modules/interactions/repository/interactions";
import { appendOutboxEvent } from "@/modules/outbox/repository/outbox";
import { findTopicById } from "@/modules/topics/repository/topics";

async function appendVoteOutbox(
  transaction: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
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
  client: PrismaClient,
  actor: ActorContext,
  entryId: string,
  value: VoteValue,
) {
  return client.$transaction(async (transaction) => {
    await lockEntryVoteCounter(transaction, entryId);
    const entry = await findEntryById(transaction, entryId);
    if (!entry) throw new AppError("ENTRY_NOT_FOUND", 404, "Entry bulunamadı.");
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

export async function removeVote(client: PrismaClient, actor: ActorContext, entryId: string) {
  return client.$transaction(async (transaction) => {
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

export async function putBookmark(client: PrismaClient, actor: ActorContext, entryId: string) {
  return client.$transaction(async (transaction) => {
    const entry = await findEntryById(transaction, entryId);
    if (!entry) throw new AppError("ENTRY_NOT_FOUND", 404, "Entry bulunamadı.");
    if (entry.status !== "ACTIVE")
      throw new AppError("ENTRY_NOT_EDITABLE", 409, "Bu entry favorilere eklenemez.");
    await putBookmarkRecord(transaction, entryId, actor.actorId);
    return { bookmarked: true };
  });
}

export async function deleteBookmark(client: PrismaClient, actor: ActorContext, entryId: string) {
  await client.$transaction((transaction) =>
    removeBookmarkRecord(transaction, entryId, actor.actorId),
  );
  return { bookmarked: false };
}

export async function putFollow(client: PrismaClient, actor: ActorContext, topicId: string) {
  return client.$transaction(async (transaction) => {
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

export async function deleteFollow(client: PrismaClient, actor: ActorContext, topicId: string) {
  await client.$transaction((transaction) =>
    removeFollowRecord(transaction, topicId, actor.actorId),
  );
  return { followed: false };
}

export async function putBlock(client: PrismaClient, actor: ActorContext, blockedId: string) {
  if (actor.actorId === blockedId)
    throw new AppError("VALIDATION_ERROR", 422, "Kendinizi engelleyemezsiniz.", {
      userId: ["Kendinizi engelleyemezsiniz."],
    });
  return client.$transaction(async (transaction) => {
    const target = await findBlockTarget(transaction, blockedId);
    if (!target) throw new AppError("USER_NOT_FOUND", 404, "Kullanıcı bulunamadı.");
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

export async function deleteBlock(client: PrismaClient, actor: ActorContext, blockedId: string) {
  await client.$transaction(async (transaction) => {
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

export function getBookmarks(client: PrismaClient, userId: string, skip: number, take: number) {
  return client.$transaction((transaction) => listBookmarks(transaction, userId, skip, take));
}

export function getFollows(client: PrismaClient, userId: string, skip: number, take: number) {
  return client.$transaction((transaction) => listFollows(transaction, userId, skip, take));
}

export function getVotes(client: PrismaClient, userId: string, skip: number, take: number) {
  return client.$transaction((transaction) => listVotes(transaction, userId, skip, take));
}

export function getBlocks(client: PrismaClient, userId: string, skip: number, take: number) {
  return client.$transaction((transaction) => listBlocks(transaction, userId, skip, take));
}
