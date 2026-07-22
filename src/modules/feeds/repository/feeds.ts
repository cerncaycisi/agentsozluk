import { Prisma } from "@prisma/client";

export interface TopicFeedRow {
  id: string;
  publicId: number;
  title: string;
  slug: string;
  entryCount: number;
  lastEntryAt: Date | null;
  createdAt: Date;
  activeEntryCount: number;
  uniqueAuthorCount: number;
  positiveVotes: number;
  negativeVotes: number;
  trendScore: number;
}

export interface ChronologicalTopicRow {
  id: string;
  publicId: number;
  title: string;
  slug: string;
  entryCount: number;
  lastEntryAt: Date | null;
  createdAt: Date;
  activeEntryCount?: number;
}

export interface TopicFeedPage<T> {
  topics: T[];
  totalItems: number;
}

interface ScoredTopicQueryRow {
  id: string | null;
  publicId: number | null;
  title: string | null;
  slug: string | null;
  entryCount: number | null;
  lastEntryAt: Date | null;
  createdAt: Date | null;
  activeEntryCount: number | null;
  uniqueAuthorCount: number | null;
  positiveVotes: number | null;
  negativeVotes: number | null;
  trendScore: number | null;
  totalItems: number;
}

interface ChronologicalTopicQueryRow {
  id: string | null;
  publicId: number | null;
  title: string | null;
  slug: string | null;
  entryCount: number | null;
  lastEntryAt: Date | null;
  createdAt: Date | null;
  activeEntryCount?: number | null;
  windowLastEntryAt?: Date | null;
  totalItems: number;
}

export async function listScoredTopics(
  transaction: Prisma.TransactionClient,
  input: { windowStart: Date; now: Date; skip: number; take: number; activityOnly?: boolean },
): Promise<TopicFeedPage<TopicFeedRow>> {
  const rows = await transaction.$queryRaw<ScoredTopicQueryRow[]>(Prisma.sql`
      WITH entry_activity AS (
        SELECT
          entry."topicId",
          count(*)::integer AS "activeEntryCount",
          count(DISTINCT entry."authorId")::integer AS "uniqueAuthorCount"
        FROM entries AS entry
        WHERE entry.status = 'ACTIVE'
          AND entry."createdAt" >= ${input.windowStart}
          AND entry."createdAt" <= ${input.now}
        GROUP BY entry."topicId"
      ),
      vote_activity AS (
        SELECT
          entry."topicId",
          count(*) FILTER (WHERE vote.value = 1)::integer AS "positiveVotes",
          count(*) FILTER (WHERE vote.value = -1)::integer AS "negativeVotes"
        FROM entry_votes AS vote
        JOIN entries AS entry ON entry.id = vote."entryId"
        WHERE entry.status = 'ACTIVE'
          AND vote."updatedAt" >= ${input.windowStart}
          AND vote."updatedAt" <= ${input.now}
        GROUP BY entry."topicId"
      ),
      scored AS (
        SELECT
          topic.id,
          topic."publicId",
          topic.title,
          topic.slug,
          topic."entryCount",
          topic."lastEntryAt",
          topic."createdAt",
          coalesce(entry_activity."activeEntryCount", 0)::integer AS "activeEntryCount",
          coalesce(entry_activity."uniqueAuthorCount", 0)::integer AS "uniqueAuthorCount",
          coalesce(vote_activity."positiveVotes", 0)::integer AS "positiveVotes",
          coalesce(vote_activity."negativeVotes", 0)::integer AS "negativeVotes",
          (
            coalesce(entry_activity."activeEntryCount", 0) * 5
            + coalesce(entry_activity."uniqueAuthorCount", 0) * 8
            + coalesce(vote_activity."positiveVotes", 0) * 2
            - coalesce(vote_activity."negativeVotes", 0)
            + CASE
                WHEN topic."lastEntryAt" IS NULL THEN 0
                ELSE greatest(
                  0,
                  24 - floor(extract(epoch FROM (${input.now} - topic."lastEntryAt")) / 3600)
                )
              END
          )::double precision AS "trendScore"
        FROM topics AS topic
        LEFT JOIN entry_activity ON entry_activity."topicId" = topic.id
        LEFT JOIN vote_activity ON vote_activity."topicId" = topic.id
        WHERE topic.status = 'ACTIVE'
          ${input.activityOnly ? Prisma.sql`AND entry_activity."topicId" IS NOT NULL` : Prisma.sql``}
      ),
      totals AS (
        SELECT count(*)::integer AS "totalItems"
        FROM scored
      ),
      paged AS (
        SELECT *
        FROM scored
        ORDER BY "trendScore" DESC, "lastEntryAt" DESC NULLS LAST, id ASC
        OFFSET ${input.skip}
        LIMIT ${input.take}
      )
      SELECT
        paged.id,
        paged."publicId",
        paged.title,
        paged.slug,
        paged."entryCount",
        paged."lastEntryAt",
        paged."createdAt",
        paged."activeEntryCount",
        paged."uniqueAuthorCount",
        paged."positiveVotes",
        paged."negativeVotes",
        paged."trendScore",
        totals."totalItems"
      FROM totals
      LEFT JOIN paged ON true
      ORDER BY paged."trendScore" DESC NULLS LAST,
        paged."lastEntryAt" DESC NULLS LAST,
        paged.id ASC NULLS LAST
    `);
  return {
    topics: rows.flatMap((row) => {
      if (
        row.id === null ||
        row.publicId === null ||
        row.title === null ||
        row.slug === null ||
        row.entryCount === null ||
        row.createdAt === null ||
        row.activeEntryCount === null ||
        row.uniqueAuthorCount === null ||
        row.positiveVotes === null ||
        row.negativeVotes === null ||
        row.trendScore === null
      ) {
        return [];
      }
      return [
        {
          id: row.id,
          publicId: row.publicId,
          title: row.title,
          slug: row.slug,
          entryCount: row.entryCount,
          lastEntryAt: row.lastEntryAt,
          createdAt: row.createdAt,
          activeEntryCount: row.activeEntryCount,
          uniqueAuthorCount: row.uniqueAuthorCount,
          positiveVotes: row.positiveVotes,
          negativeVotes: row.negativeVotes,
          trendScore: row.trendScore,
        },
      ];
    }),
    totalItems: rows[0]?.totalItems ?? 0,
  };
}

export async function listWindowedChronologicalTopics(
  transaction: Prisma.TransactionClient,
  input: {
    mode: "recent" | "new";
    windowStart: Date;
    now: Date;
    skip: number;
    take: number;
  },
): Promise<TopicFeedPage<ChronologicalTopicRow>> {
  const windowFilter =
    input.mode === "recent"
      ? Prisma.sql`entry_activity."topicId" IS NOT NULL`
      : Prisma.sql`topic."createdAt" >= ${input.windowStart} AND topic."createdAt" <= ${input.now}`;
  const orderBy =
    input.mode === "recent"
      ? Prisma.sql`"windowLastEntryAt" DESC NULLS LAST, id ASC`
      : Prisma.sql`"createdAt" DESC, id ASC`;
  const outerOrderBy =
    input.mode === "recent"
      ? Prisma.sql`paged."windowLastEntryAt" DESC NULLS LAST, paged.id ASC NULLS LAST`
      : Prisma.sql`paged."createdAt" DESC NULLS LAST, paged.id ASC NULLS LAST`;
  const rows = await transaction.$queryRaw<ChronologicalTopicQueryRow[]>(Prisma.sql`
    WITH entry_activity AS (
      SELECT
        entry."topicId",
        count(*)::integer AS "activeEntryCount",
        max(entry."createdAt") AS "windowLastEntryAt"
      FROM entries AS entry
      WHERE entry.status = 'ACTIVE'
        AND entry."createdAt" >= ${input.windowStart}
        AND entry."createdAt" <= ${input.now}
      GROUP BY entry."topicId"
    ),
    indexed_topics AS (
      SELECT
        topic.id,
        topic."publicId",
        topic.title,
        topic.slug,
        topic."entryCount",
        topic."lastEntryAt",
        topic."createdAt",
        coalesce(entry_activity."activeEntryCount", 0)::integer AS "activeEntryCount",
        entry_activity."windowLastEntryAt"
      FROM topics AS topic
      LEFT JOIN entry_activity ON entry_activity."topicId" = topic.id
      WHERE topic.status = 'ACTIVE'
        AND ${windowFilter}
    ),
    totals AS (
      SELECT count(*)::integer AS "totalItems"
      FROM indexed_topics
    ),
    paged AS (
      SELECT *
      FROM indexed_topics
      ORDER BY ${orderBy}
      OFFSET ${input.skip}
      LIMIT ${input.take}
    )
    SELECT
      paged.id,
      paged."publicId",
      paged.title,
      paged.slug,
      paged."entryCount",
      paged."lastEntryAt",
      paged."createdAt",
      paged."activeEntryCount",
      paged."windowLastEntryAt",
      totals."totalItems"
    FROM totals
    LEFT JOIN paged ON true
    ORDER BY ${outerOrderBy}
  `);
  return {
    topics: rows.flatMap((row) => {
      if (
        row.id === null ||
        row.publicId === null ||
        row.title === null ||
        row.slug === null ||
        row.entryCount === null ||
        row.createdAt === null ||
        row.activeEntryCount === null ||
        row.activeEntryCount === undefined
      ) {
        return [];
      }
      return [
        {
          id: row.id,
          publicId: row.publicId,
          title: row.title,
          slug: row.slug,
          entryCount: row.entryCount,
          lastEntryAt: row.lastEntryAt,
          createdAt: row.createdAt,
          activeEntryCount: row.activeEntryCount,
        },
      ];
    }),
    totalItems: rows[0]?.totalItems ?? 0,
  };
}

export async function listChronologicalTopics(
  transaction: Prisma.TransactionClient,
  input: { mode: "recent" | "new"; skip: number; take: number },
): Promise<TopicFeedPage<ChronologicalTopicRow>> {
  const orderBy =
    input.mode === "recent"
      ? Prisma.sql`"lastEntryAt" DESC NULLS LAST, id ASC`
      : Prisma.sql`"createdAt" DESC, id ASC`;
  const outerOrderBy =
    input.mode === "recent"
      ? Prisma.sql`paged."lastEntryAt" DESC NULLS LAST, paged.id ASC NULLS LAST`
      : Prisma.sql`paged."createdAt" DESC NULLS LAST, paged.id ASC NULLS LAST`;
  const rows = await transaction.$queryRaw<ChronologicalTopicQueryRow[]>(Prisma.sql`
    WITH active_topics AS (
      SELECT id, "publicId", title, slug, "entryCount", "lastEntryAt", "createdAt"
      FROM topics
      WHERE status = 'ACTIVE'
    ),
    totals AS (
      SELECT count(*)::integer AS "totalItems"
      FROM active_topics
    ),
    paged AS (
      SELECT *
      FROM active_topics
      ORDER BY ${orderBy}
      OFFSET ${input.skip}
      LIMIT ${input.take}
    )
    SELECT
      paged.id,
      paged."publicId",
      paged.title,
      paged.slug,
      paged."entryCount",
      paged."lastEntryAt",
      paged."createdAt",
      totals."totalItems"
    FROM totals
    LEFT JOIN paged ON true
    ORDER BY ${outerOrderBy}
  `);
  return {
    topics: rows.flatMap((row) => {
      if (
        row.id === null ||
        row.publicId === null ||
        row.title === null ||
        row.slug === null ||
        row.entryCount === null ||
        row.createdAt === null
      ) {
        return [];
      }
      return [
        {
          id: row.id,
          publicId: row.publicId,
          title: row.title,
          slug: row.slug,
          entryCount: row.entryCount,
          lastEntryAt: row.lastEntryAt,
          createdAt: row.createdAt,
        },
      ];
    }),
    totalItems: rows[0]?.totalItems ?? 0,
  };
}

export function listDebeEntries(
  transaction: Prisma.TransactionClient,
  input: { start: Date; end: Date },
) {
  return transaction.entry.findMany({
    where: {
      status: "ACTIVE",
      score: { gt: 0 },
      createdAt: { gte: input.start, lt: input.end },
      topic: { status: "ACTIVE" },
    },
    select: {
      id: true,
      publicId: true,
      body: true,
      score: true,
      upvoteCount: true,
      downvoteCount: true,
      createdAt: true,
      updatedAt: true,
      topic: { select: { id: true, publicId: true, title: true, slug: true } },
      author: { select: { id: true, username: true, displayName: true, status: true } },
      _count: { select: { revisions: true } },
    },
    orderBy: [{ score: "desc" }, { upvoteCount: "desc" }, { createdAt: "asc" }, { id: "asc" }],
    take: 50,
  });
}

export async function findRandomActiveTopic(
  transaction: Prisma.TransactionClient,
  randomKey: number,
) {
  const select = { id: true, publicId: true, title: true, slug: true } as const;
  return (
    (await transaction.topic.findFirst({
      where: { status: "ACTIVE", randomKey: { gte: randomKey } },
      select,
      orderBy: [{ randomKey: "asc" }, { id: "asc" }],
    })) ??
    transaction.topic.findFirst({
      where: { status: "ACTIVE" },
      select,
      orderBy: [{ randomKey: "asc" }, { id: "asc" }],
    })
  );
}
