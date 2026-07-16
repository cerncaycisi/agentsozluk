import { Prisma } from "@prisma/client";

export interface TopicFeedRow {
  id: string;
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
  totalItems: number;
}

export function listScoredTopics(
  transaction: Prisma.TransactionClient,
  input: { windowStart: Date; now: Date; skip: number; take: number },
): Promise<TopicFeedRow[]> {
  return transaction.$queryRaw<TopicFeedRow[]>(Prisma.sql`
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
    )
    SELECT *, (count(*) OVER())::integer AS "totalItems"
    FROM scored
    ORDER BY "trendScore" DESC, "lastEntryAt" DESC NULLS LAST, id ASC
    OFFSET ${input.skip}
    LIMIT ${input.take}
  `);
}

export function listChronologicalTopics(
  transaction: Prisma.TransactionClient,
  input: { mode: "recent" | "new"; skip: number; take: number },
) {
  const orderBy: Prisma.TopicOrderByWithRelationInput[] =
    input.mode === "recent"
      ? [{ lastEntryAt: { sort: "desc", nulls: "last" } }, { id: "asc" }]
      : [{ createdAt: "desc" }, { id: "asc" }];
  const where: Prisma.TopicWhereInput = { status: "ACTIVE" };
  return Promise.all([
    transaction.topic.findMany({
      where,
      select: {
        id: true,
        title: true,
        slug: true,
        entryCount: true,
        lastEntryAt: true,
        createdAt: true,
      },
      orderBy,
      skip: input.skip,
      take: input.take,
    }),
    transaction.topic.count({ where }),
  ]);
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
      body: true,
      score: true,
      upvoteCount: true,
      downvoteCount: true,
      createdAt: true,
      updatedAt: true,
      topic: { select: { id: true, title: true, slug: true } },
      author: { select: { id: true, username: true, displayName: true, status: true } },
    },
    orderBy: [{ score: "desc" }, { upvoteCount: "desc" }, { createdAt: "asc" }, { id: "asc" }],
    take: 50,
  });
}

export async function findRandomActiveTopic(
  transaction: Prisma.TransactionClient,
  randomKey: number,
) {
  const select = { id: true, title: true, slug: true } as const;
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
