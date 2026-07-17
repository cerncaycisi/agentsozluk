import { Prisma } from "@prisma/client";
import { escapeLikePattern } from "@/modules/search/domain/normalization";

export interface SearchRow {
  type: "topic" | "entry" | "user";
  id: string;
  title: string;
  snippet: string;
  url: string;
  rank: number;
}

export interface SearchPage {
  results: SearchRow[];
  totalItems: number;
}

interface SearchQueryRow {
  type: SearchRow["type"] | null;
  id: string | null;
  title: string | null;
  snippet: string | null;
  url: string | null;
  rank: number | null;
  totalItems: number;
}

export function buildSearchQuery(input: {
  query: string;
  type: "all" | "topics" | "entries" | "users";
  skip: number;
  take: number;
}): Prisma.Sql {
  const escapedQuery = escapeLikePattern(input.query);
  const queryContainsPattern = `%${escapedQuery}%`;
  const queryPrefixPattern = `${escapedQuery}%`;
  const queryTokens = input.query.split(/\s+/).filter(Boolean);
  const entryTokenMatch = Prisma.join(
    queryTokens.map(
      (token) =>
        Prisma.sql`immutable_unaccent(entry."normalizedBody") ILIKE immutable_unaccent(${`%${escapeLikePattern(token)}%`}) ESCAPE E'\\\\'`,
    ),
    " AND ",
  );

  const topicMatches = Prisma.sql`
      SELECT
        'topic'::text AS "resultType",
        topic.id,
        topic.title,
        topic.title AS snippet,
        '/baslik/' || topic.id::text || '-' || topic.slug AS url,
        (immutable_unaccent(topic."normalizedTitle") = immutable_unaccent(${input.query})) AS exact,
        (immutable_unaccent(topic."normalizedTitle") ILIKE immutable_unaccent(${queryPrefixPattern}) ESCAPE E'\\\\') AS prefix,
        similarity(immutable_unaccent(topic."normalizedTitle"), immutable_unaccent(${input.query})) AS similarity,
        topic."updatedAt" AS recency
      FROM topics AS topic
      CROSS JOIN search_settings
      WHERE topic.status = 'ACTIVE'
        AND (
          immutable_unaccent(topic."normalizedTitle") = immutable_unaccent(${input.query})
          OR immutable_unaccent(topic."normalizedTitle") ILIKE immutable_unaccent(${queryPrefixPattern}) ESCAPE E'\\\\'
          OR immutable_unaccent(topic."normalizedTitle") ILIKE immutable_unaccent(${queryContainsPattern}) ESCAPE E'\\\\'
          OR immutable_unaccent(topic."normalizedTitle") % immutable_unaccent(${input.query})
        )
      UNION ALL
      SELECT
        'topic'::text,
        topic.id,
        topic.title,
        alias.title,
        '/baslik/' || topic.id::text || '-' || topic.slug,
        (immutable_unaccent(alias."normalizedTitle") = immutable_unaccent(${input.query})),
        (immutable_unaccent(alias."normalizedTitle") ILIKE immutable_unaccent(${queryPrefixPattern}) ESCAPE E'\\\\'),
        similarity(immutable_unaccent(alias."normalizedTitle"), immutable_unaccent(${input.query})),
        alias."createdAt"
      FROM topic_aliases AS alias
      JOIN topics AS topic ON topic.id = alias."topicId"
      CROSS JOIN search_settings
      WHERE topic.status = 'ACTIVE'
        AND (
          immutable_unaccent(alias."normalizedTitle") = immutable_unaccent(${input.query})
          OR immutable_unaccent(alias."normalizedTitle") ILIKE immutable_unaccent(${queryPrefixPattern}) ESCAPE E'\\\\'
          OR immutable_unaccent(alias."normalizedTitle") ILIKE immutable_unaccent(${queryContainsPattern}) ESCAPE E'\\\\'
          OR immutable_unaccent(alias."normalizedTitle") % immutable_unaccent(${input.query})
        )
  `;
  const userMatches = Prisma.sql`
      SELECT
        'user'::text AS "resultType",
        users.id,
        users."displayName" AS title,
        '@' || users.username AS snippet,
        '/yazar/' || users.username AS url,
        (
          immutable_unaccent(users."usernameNormalized") = immutable_unaccent(${input.query})
          OR immutable_unaccent(lower(users."displayName")) = immutable_unaccent(${input.query})
        ) AS exact,
        (
          immutable_unaccent(users."usernameNormalized") ILIKE immutable_unaccent(${queryPrefixPattern}) ESCAPE E'\\\\'
          OR immutable_unaccent(lower(users."displayName")) ILIKE immutable_unaccent(${queryPrefixPattern}) ESCAPE E'\\\\'
        ) AS prefix,
        GREATEST(
          similarity(immutable_unaccent(users."usernameNormalized"), immutable_unaccent(${input.query})),
          similarity(immutable_unaccent(lower(users."displayName")), immutable_unaccent(${input.query}))
        ) AS similarity,
        users."updatedAt" AS recency
      FROM users
      CROSS JOIN search_settings
      WHERE users.status <> 'DEACTIVATED'
        AND (
          immutable_unaccent(users."usernameNormalized") = immutable_unaccent(${input.query})
          OR immutable_unaccent(users."usernameNormalized") ILIKE immutable_unaccent(${queryPrefixPattern}) ESCAPE E'\\\\'
          OR immutable_unaccent(users."usernameNormalized") ILIKE immutable_unaccent(${queryContainsPattern}) ESCAPE E'\\\\'
          OR immutable_unaccent(lower(users."displayName")) ILIKE immutable_unaccent(${queryContainsPattern}) ESCAPE E'\\\\'
          OR immutable_unaccent(users."usernameNormalized") % immutable_unaccent(${input.query})
          OR immutable_unaccent(lower(users."displayName")) % immutable_unaccent(${input.query})
        )
  `;
  const entryMatches = Prisma.sql`
      SELECT
        'entry'::text AS "resultType",
        entry.id,
        topic.title,
        left(entry.body, 180) AS snippet,
        '/entry/' || entry.id::text AS url,
        (immutable_unaccent(entry."normalizedBody") = immutable_unaccent(${input.query})) AS exact,
        (immutable_unaccent(entry."normalizedBody") ILIKE immutable_unaccent(${queryPrefixPattern}) ESCAPE E'\\\\') AS prefix,
        similarity(immutable_unaccent(entry."normalizedBody"), immutable_unaccent(${input.query})) AS similarity,
        entry."createdAt" AS recency
      FROM entries AS entry
      JOIN topics AS topic ON topic.id = entry."topicId"
      CROSS JOIN search_settings
      WHERE entry.status = 'ACTIVE'
        AND topic.status = 'ACTIVE'
        AND (
          immutable_unaccent(entry."normalizedBody") ILIKE immutable_unaccent(${queryContainsPattern}) ESCAPE E'\\\\'
          OR (${entryTokenMatch})
          OR immutable_unaccent(entry."normalizedBody") % immutable_unaccent(${input.query})
        )
  `;
  const selectedMatches: Prisma.Sql[] = [];
  if (input.type === "all" || input.type === "topics") selectedMatches.push(topicMatches);
  if (input.type === "all" || input.type === "users") selectedMatches.push(userMatches);
  if (input.type === "all" || input.type === "entries") selectedMatches.push(entryMatches);

  return Prisma.sql`
    WITH search_settings AS MATERIALIZED (
      SELECT set_config('pg_trgm.similarity_threshold', '0.15', true)
    ),
    combined AS (
      ${Prisma.join(selectedMatches, " UNION ALL ")}
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
    ),
    totals AS (
      SELECT count(*)::integer AS "totalItems"
      FROM filtered
    ),
    paged AS (
      SELECT
        *,
        ((CASE WHEN exact THEN 3 WHEN prefix THEN 2 ELSE 1 END) * 1000 + similarity)::double precision AS rank
      FROM filtered
      ORDER BY exact DESC, prefix DESC, similarity DESC, recency DESC, id ASC
      OFFSET ${input.skip}
      LIMIT ${input.take}
    )
    SELECT
      paged."resultType" AS type,
      paged.id,
      paged.title,
      paged.snippet,
      paged.url,
      paged.rank,
      totals."totalItems"
    FROM totals
    LEFT JOIN paged ON true
    ORDER BY paged.exact DESC NULLS LAST,
      paged.prefix DESC NULLS LAST,
      paged.similarity DESC NULLS LAST,
      paged.recency DESC NULLS LAST,
      paged.id ASC NULLS LAST
  `;
}

export async function searchRecords(
  transaction: Prisma.TransactionClient,
  input: {
    query: string;
    type: "all" | "topics" | "entries" | "users";
    skip: number;
    take: number;
  },
): Promise<SearchPage> {
  const rows = await transaction.$queryRaw<SearchQueryRow[]>(buildSearchQuery(input));
  return {
    results: rows.flatMap((row) => {
      if (
        row.type === null ||
        row.id === null ||
        row.title === null ||
        row.snippet === null ||
        row.url === null ||
        row.rank === null
      ) {
        return [];
      }
      return [
        {
          type: row.type,
          id: row.id,
          title: row.title,
          snippet: row.snippet,
          url: row.url,
          rank: row.rank,
        },
      ];
    }),
    totalItems: rows[0]?.totalItems ?? 0,
  };
}
