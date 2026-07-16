import { Prisma } from "@prisma/client";

export interface SearchRow {
  type: "topic" | "entry" | "user";
  id: string;
  title: string;
  snippet: string;
  url: string;
  rank: number;
  totalItems: number;
}

export function searchRecords(
  transaction: Prisma.TransactionClient,
  input: {
    query: string;
    type: "all" | "topics" | "entries" | "users";
    skip: number;
    take: number;
  },
): Promise<SearchRow[]> {
  const queryTokens = input.query.split(/\s+/).filter(Boolean);
  const entryTokenMatch = Prisma.join(
    queryTokens.map(
      (token) => Prisma.sql`unaccent(entry."normalizedBody") ILIKE unaccent(${`%${token}%`})`,
    ),
    " AND ",
  );
  const resultType =
    input.type === "topics" ? "topic" : input.type === "entries" ? "entry" : "user";
  const typeFilter =
    input.type === "all" ? Prisma.empty : Prisma.sql`WHERE "resultType" = ${resultType}`;

  return transaction.$queryRaw<SearchRow[]>(Prisma.sql`
    WITH topic_matches AS (
      SELECT
        'topic'::text AS "resultType",
        topic.id,
        topic.title,
        topic.title AS snippet,
        '/baslik/' || topic.id::text || '-' || topic.slug AS url,
        (topic."normalizedTitle" = ${input.query}) AS exact,
        (topic."normalizedTitle" LIKE ${`${input.query}%`}) AS prefix,
        similarity(unaccent(topic."normalizedTitle"), unaccent(${input.query})) AS similarity,
        topic."updatedAt" AS recency
      FROM topics AS topic
      WHERE topic.status = 'ACTIVE'
        AND (
          topic."normalizedTitle" = ${input.query}
          OR topic."normalizedTitle" LIKE ${`${input.query}%`}
          OR unaccent(topic."normalizedTitle") ILIKE unaccent(${`%${input.query}%`})
          OR similarity(unaccent(topic."normalizedTitle"), unaccent(${input.query})) >= 0.15
        )
      UNION ALL
      SELECT
        'topic'::text,
        topic.id,
        topic.title,
        alias.title,
        '/baslik/' || topic.id::text || '-' || topic.slug,
        (alias."normalizedTitle" = ${input.query}),
        (alias."normalizedTitle" LIKE ${`${input.query}%`}),
        similarity(unaccent(alias."normalizedTitle"), unaccent(${input.query})),
        alias."createdAt"
      FROM topic_aliases AS alias
      JOIN topics AS topic ON topic.id = alias."topicId"
      WHERE topic.status = 'ACTIVE'
        AND (
          alias."normalizedTitle" = ${input.query}
          OR alias."normalizedTitle" LIKE ${`${input.query}%`}
          OR unaccent(alias."normalizedTitle") ILIKE unaccent(${`%${input.query}%`})
          OR similarity(unaccent(alias."normalizedTitle"), unaccent(${input.query})) >= 0.15
        )
    ),
    user_matches AS (
      SELECT
        'user'::text AS "resultType",
        users.id,
        users."displayName" AS title,
        '@' || users.username AS snippet,
        '/yazar/' || users.username AS url,
        (users."usernameNormalized" = ${input.query}) AS exact,
        (users."usernameNormalized" LIKE ${`${input.query}%`}) AS prefix,
        GREATEST(
          similarity(unaccent(users."usernameNormalized"), unaccent(${input.query})),
          similarity(unaccent(lower(users."displayName")), unaccent(${input.query}))
        ) AS similarity,
        users."updatedAt" AS recency
      FROM users
      WHERE users.status <> 'DEACTIVATED'
        AND (
          users."usernameNormalized" = ${input.query}
          OR users."usernameNormalized" LIKE ${`${input.query}%`}
          OR unaccent(users."usernameNormalized") ILIKE unaccent(${`%${input.query}%`})
          OR unaccent(lower(users."displayName")) ILIKE unaccent(${`%${input.query}%`})
          OR similarity(unaccent(users."usernameNormalized"), unaccent(${input.query})) >= 0.15
          OR similarity(unaccent(lower(users."displayName")), unaccent(${input.query})) >= 0.15
        )
    ),
    entry_matches AS (
      SELECT
        'entry'::text AS "resultType",
        entry.id,
        topic.title,
        left(entry.body, 180) AS snippet,
        '/entry/' || entry.id::text AS url,
        (entry."normalizedBody" = ${input.query}) AS exact,
        (entry."normalizedBody" LIKE ${`${input.query}%`}) AS prefix,
        similarity(unaccent(entry."normalizedBody"), unaccent(${input.query})) AS similarity,
        entry."createdAt" AS recency
      FROM entries AS entry
      JOIN topics AS topic ON topic.id = entry."topicId"
      WHERE entry.status = 'ACTIVE'
        AND topic.status = 'ACTIVE'
        AND (
          unaccent(entry."normalizedBody") ILIKE unaccent(${`%${input.query}%`})
          OR (${entryTokenMatch})
          OR similarity(unaccent(entry."normalizedBody"), unaccent(${input.query})) >= 0.15
        )
    ),
    combined AS (
      SELECT * FROM topic_matches
      UNION ALL
      SELECT * FROM user_matches
      UNION ALL
      SELECT * FROM entry_matches
    ),
    deduplicated AS (
      SELECT DISTINCT ON ("resultType", id)
        "resultType",
        id,
        title,
        snippet,
        url,
        exact,
        prefix,
        similarity,
        recency
      FROM combined
      ORDER BY "resultType", id, exact DESC, prefix DESC, similarity DESC, recency DESC
    ),
    filtered AS (
      SELECT * FROM deduplicated
      ${typeFilter}
    )
    SELECT
      "resultType" AS type,
      id,
      title,
      snippet,
      url,
      ((CASE WHEN exact THEN 3 WHEN prefix THEN 2 ELSE 1 END) * 1000 + similarity)::double precision AS rank,
      (count(*) OVER())::integer AS "totalItems"
    FROM filtered
    ORDER BY exact DESC, prefix DESC, similarity DESC, recency DESC, id ASC
    OFFSET ${input.skip}
    LIMIT ${input.take}
  `);
}
