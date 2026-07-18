import { z } from "zod";
import { AppError } from "@/lib/http/errors";
import type { JsonValue } from "@/modules/idempotency/domain/idempotency";

type EntryStatus = "ACTIVE" | "DELETED" | "HIDDEN";
type TopicStatus = "ACTIVE" | "HIDDEN" | "MERGED";
type UserStatus = "ACTIVE" | "SUSPENDED" | "DEACTIVATED";

export interface PublicEntryInput {
  id: string;
  topicId: string;
  authorId: string;
  body: string;
  status: EntryStatus;
  score: number;
  upvoteCount: number;
  downvoteCount: number;
  createdAt: Date;
  updatedAt: Date;
  topic: {
    id: string;
    title: string;
    slug: string;
    status: TopicStatus;
  };
  author: {
    id: string;
    username: string;
    displayName: string;
    status: UserStatus;
  };
  edited: boolean;
  blockedByViewer?: boolean;
  canonicalTopicId?: string;
}

export interface PublicEntry {
  id: string;
  topicId: string;
  authorId: string;
  body: string;
  status: EntryStatus;
  score: number;
  upvoteCount: number;
  downvoteCount: number;
  createdAt: Date;
  updatedAt: Date;
  topic: {
    id: string;
    title: string;
    slug: string;
    status: TopicStatus;
  };
  author: {
    id: string;
    username: string;
    displayName: string;
    status: UserStatus;
  };
  edited: boolean;
  blockedByViewer?: boolean;
  canonicalTopicId?: string;
}

/**
 * Public entry responses are built from an explicit allowlist. Callers may pass richer repository
 * records, but classification, search and moderation fields never cross this serialization edge.
 */
export function serializePublicEntry(entry: PublicEntryInput): PublicEntry {
  return {
    id: entry.id,
    topicId: entry.topicId,
    authorId: entry.authorId,
    body: entry.body,
    status: entry.status,
    score: entry.score,
    upvoteCount: entry.upvoteCount,
    downvoteCount: entry.downvoteCount,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    topic: {
      id: entry.topic.id,
      title: entry.topic.title,
      slug: entry.topic.slug,
      status: entry.topic.status,
    },
    author: {
      id: entry.author.id,
      username: entry.author.username,
      displayName: entry.author.displayName,
      status: entry.author.status,
    },
    edited: entry.edited,
    ...(entry.blockedByViewer === undefined ? {} : { blockedByViewer: entry.blockedByViewer }),
    ...(entry.canonicalTopicId === undefined ? {} : { canonicalTopicId: entry.canonicalTopicId }),
  };
}

const replayedPublicEntrySchema = z
  .object({
    id: z.string(),
    topicId: z.string(),
    authorId: z.string(),
    body: z.string(),
    status: z.enum(["ACTIVE", "DELETED", "HIDDEN"]),
    score: z.number(),
    upvoteCount: z.number(),
    downvoteCount: z.number(),
    createdAt: z.string(),
    updatedAt: z.string(),
    topic: z.object({
      id: z.string(),
      title: z.string(),
      slug: z.string(),
      status: z.enum(["ACTIVE", "HIDDEN", "MERGED"]),
    }),
    author: z.object({
      id: z.string(),
      username: z.string(),
      displayName: z.string(),
      status: z.enum(["ACTIVE", "SUSPENDED", "DEACTIVATED"]),
    }),
    edited: z.boolean(),
    blockedByViewer: z.boolean().optional(),
    canonicalTopicId: z.string().optional(),
  })
  .strip();

/** Rebuild legacy idempotency replays through the current public allowlist. */
export function serializeReplayedPublicEntryResponse(
  body: JsonValue,
  requestId: string,
): JsonValue {
  if (!body || typeof body !== "object" || Array.isArray(body) || !("data" in body)) {
    throw new AppError("INTERNAL_ERROR", 500, "Idempotent entry cevabı güvenle okunamadı.");
  }
  const parsed = replayedPublicEntrySchema.safeParse(body.data);
  if (!parsed.success) {
    throw new AppError("INTERNAL_ERROR", 500, "Idempotent entry cevabı güvenle okunamadı.");
  }
  const { blockedByViewer, canonicalTopicId, ...required } = parsed.data;
  return {
    data: {
      ...required,
      ...(blockedByViewer === undefined ? {} : { blockedByViewer }),
      ...(canonicalTopicId === undefined ? {} : { canonicalTopicId }),
    },
    requestId,
  };
}
