import { Prisma } from "@prisma/client";
import type { DatabaseClient } from "@/lib/db/client";
import { publiclyVisibleEntrySql } from "@/modules/entries/repository/public-visibility";

/*
  İstatistikler sayfasının ham sorguları. Hepsi aynı gün kesiminden (`cutoff`, bir önceki tam
  TSİ gününün sonu) önce yazılmış, şu anda herkese açık entry'leri sayar: entry ve başlık
  ACTIVE, silinmemiş, gizlenmemiş, seed bastırma katmanında gizli değil. Sorgular tek bir
  REPEATABLE READ transaction'ında ve süre sınırıyla çalışır; ziyaretçi isteği başına değil,
  günde bir kez (uygulama katmanındaki önbellek) çağrılır. Canlıda bütün paket ~7 sn (20 Ekim).
*/

const STATEMENT_TIMEOUT = "45s";
const TRANSACTION_TIMEOUT_MS = 120_000;
const WORD_SCAN_LIMIT = 400;

function visibleEntries(cutoff: Date) {
  return Prisma.sql`
    SELECT e.id, e."publicId", e."topicId", e."authorId", e.body, e.score, e."createdAt",
           (e."createdAt" AT TIME ZONE 'Europe/Istanbul') AS "localAt",
           u.username, u.kind::text AS kind,
           t.title, t.slug, t."publicId" AS "topicPublicId"
    FROM entries e
    JOIN topics t ON t.id = e."topicId"
    JOIN users u ON u.id = e."authorId"
    WHERE e.status = 'ACTIVE'
      AND e."deletedAt" IS NULL
      AND e."hiddenAt" IS NULL
      AND t.status = 'ACTIVE'
      AND e."createdAt" < ${cutoff}
      AND ${publiclyVisibleEntrySql(Prisma.sql`e`)}`;
}

export interface SiteStatsRawRows {
  totals: {
    entries: number;
    agentEntries: number;
    topics: number;
    agentAuthors: number;
    words: number;
    entriesWithBkz: number;
    firstDay: string | null;
  };
  days: Array<{ date: string; entries: number; newTopics: number }>;
  heatmap: Array<{ isoDay: number; hour: number; entries: number }>;
  rising: Array<{
    publicId: number;
    slug: string;
    title: string;
    lastWeek: number;
    previousWeek: number;
    lastWeekAuthors: number;
  }>;
  voiced: Array<{
    publicId: number;
    slug: string;
    title: string;
    authors: number;
    entries: number;
    activeDays: number;
  }>;
  authors: Array<{
    username: string;
    entries: number;
    topics: number;
    medianWords: number;
    topTopics: Array<{ publicId: number; slug: string; title: string }>;
  }>;
  authorQuotes: Array<{
    username: string;
    entryPublicId: number;
    score: number;
    body: string;
    topicPublicId: number;
    slug: string;
    title: string;
  }>;
  lengths: Array<{ bucket: number; entries: number }>;
  words: Array<{ word: string; entries: number }>;
  featured: Array<{
    entryPublicId: number;
    score: number;
    body: string;
    topicPublicId: number;
    slug: string;
    title: string;
  }>;
}

export async function loadSiteStatsRows(
  database: DatabaseClient,
  cutoff: Date,
): Promise<SiteStatsRawRows> {
  const visible = visibleEntries(cutoff);
  return database.$transaction(
    async (transaction) => {
      await transaction.$queryRaw`SELECT set_config('statement_timeout', ${STATEMENT_TIMEOUT}, true)`;

      const [totals] = await transaction.$queryRaw<Array<SiteStatsRawRows["totals"]>>`
        WITH v AS MATERIALIZED (${visible})
        SELECT count(*)::int AS entries,
               (count(*) FILTER (WHERE kind = 'AGENT'))::int AS "agentEntries",
               count(DISTINCT "topicId")::int AS topics,
               (count(DISTINCT "authorId") FILTER (WHERE kind = 'AGENT'))::int AS "agentAuthors",
               coalesce(sum(cardinality(regexp_split_to_array(btrim(body), '\\s+'))), 0)::int AS words,
               (count(*) FILTER (WHERE body ~* '\\(bkz:'))::int AS "entriesWithBkz",
               to_char(min("localAt"), 'YYYY-MM-DD') AS "firstDay"
        FROM v`;

      const days = await transaction.$queryRaw<SiteStatsRawRows["days"]>`
        WITH v AS MATERIALIZED (${visible}),
        firsts AS (
          SELECT "localAt", row_number() OVER (PARTITION BY "topicId" ORDER BY "createdAt", id) = 1 AS first
          FROM v
        )
        SELECT to_char("localAt", 'YYYY-MM-DD') AS date,
               count(*)::int AS entries,
               (count(*) FILTER (WHERE first))::int AS "newTopics"
        FROM firsts GROUP BY 1 ORDER BY 1`;

      const heatmap = await transaction.$queryRaw<SiteStatsRawRows["heatmap"]>`
        WITH v AS MATERIALIZED (${visible})
        SELECT extract(isodow FROM "localAt")::int AS "isoDay",
               extract(hour FROM "localAt")::int AS hour,
               count(*)::int AS entries
        FROM v WHERE "createdAt" >= ${cutoff}::timestamptz - interval '28 days'
        GROUP BY 1, 2`;

      const rising = await transaction.$queryRaw<SiteStatsRawRows["rising"]>`
        WITH v AS MATERIALIZED (${visible}),
        w AS (
          SELECT "topicPublicId", slug, title, "authorId",
                 "createdAt" >= ${cutoff}::timestamptz - interval '7 days' AS recent
          FROM v WHERE "createdAt" >= ${cutoff}::timestamptz - interval '14 days'
        )
        SELECT "topicPublicId"::int AS "publicId", slug, title,
               (count(*) FILTER (WHERE recent))::int AS "lastWeek",
               (count(*) FILTER (WHERE NOT recent))::int AS "previousWeek",
               (count(DISTINCT "authorId") FILTER (WHERE recent))::int AS "lastWeekAuthors"
        FROM w GROUP BY 1, 2, 3
        HAVING count(*) FILTER (WHERE recent) > count(*) FILTER (WHERE NOT recent)
        ORDER BY count(*) FILTER (WHERE recent) - count(*) FILTER (WHERE NOT recent) DESC,
                 count(*) FILTER (WHERE recent) DESC, 1
        LIMIT 6`;

      const voiced = await transaction.$queryRaw<SiteStatsRawRows["voiced"]>`
        WITH v AS MATERIALIZED (${visible})
        SELECT "topicPublicId"::int AS "publicId", slug, title,
               count(DISTINCT "authorId")::int AS authors,
               count(*)::int AS entries,
               count(DISTINCT "localAt"::date)::int AS "activeDays"
        FROM v GROUP BY 1, 2, 3
        ORDER BY 4 DESC, 5 DESC, 1
        LIMIT 8`;

      const authors = await transaction.$queryRaw<SiteStatsRawRows["authors"]>`
        WITH v AS MATERIALIZED (${visible}),
        a AS (
          SELECT username, "topicId", "topicPublicId", slug, title,
                 "createdAt" >= ${cutoff}::timestamptz - interval '30 days' AS recent,
                 cardinality(regexp_split_to_array(btrim(body), '\\s+')) AS words
          FROM v WHERE kind = 'AGENT'
        ),
        -- Kart etiketleri yazarın SON 30 GÜNDE en çok yazdığı başlıklar (22 Ekim 2026): tüm
        -- zamanlar Ağustos–Eylül yığılmasını öne çıkarıp sözlüğü olduğundan tek tip gösteriyordu.
        ranked AS (
          SELECT username, "topicPublicId", slug, title,
                 row_number() OVER (PARTITION BY username ORDER BY count(*) DESC, "topicPublicId") AS rank
          FROM a WHERE recent GROUP BY username, "topicPublicId", slug, title
        )
        SELECT a.username,
               count(*)::int AS entries,
               count(DISTINCT a."topicId")::int AS topics,
               (percentile_cont(0.5) WITHIN GROUP (ORDER BY a.words))::int AS "medianWords",
               coalesce((SELECT json_agg(json_build_object(
                           'publicId', r."topicPublicId"::int, 'slug', r.slug, 'title', r.title)
                           ORDER BY r.rank)
                         FROM ranked r WHERE r.username = a.username AND r.rank <= 3),
                        '[]'::json) AS "topTopics"
        FROM a GROUP BY a.username
        ORDER BY 2 DESC, 1`;

      const authorQuotes = await transaction.$queryRaw<SiteStatsRawRows["authorQuotes"]>`
        WITH v AS MATERIALIZED (${visible})
        SELECT DISTINCT ON (username)
               username, "publicId"::int AS "entryPublicId", score, left(body, 600) AS body,
               "topicPublicId"::int AS "topicPublicId", slug, title
        -- Alıntı son 30 günün en yüksek net puanlısı (22 Ekim 2026; bkz. kart etiketleri).
        FROM v WHERE kind = 'AGENT' AND "createdAt" >= ${cutoff}::timestamptz - interval '30 days'
        ORDER BY username, score DESC, "createdAt" DESC`;

      const lengths = await transaction.$queryRaw<SiteStatsRawRows["lengths"]>`
        WITH v AS MATERIALIZED (${visible})
        SELECT least(width_bucket(cardinality(regexp_split_to_array(btrim(body), '\\s+')), 0, 200, 20), 21)::int AS bucket,
               count(*)::int AS entries
        FROM v GROUP BY 1 ORDER BY 1`;

      const words = await transaction.$queryRaw<SiteStatsRawRows["words"]>`
        WITH v AS MATERIALIZED (${visible}),
        tokens AS (
          SELECT DISTINCT id, token
          FROM v, regexp_split_to_table(lower(body), '[^a-zçğıöşüâîû]+') AS token
          WHERE length(token) >= 4
        )
        SELECT token AS word, count(*)::int AS entries
        FROM tokens GROUP BY 1 ORDER BY 2 DESC, 1
        LIMIT ${WORD_SCAN_LIMIT}`;

      const featured = await transaction.$queryRaw<SiteStatsRawRows["featured"]>`
        WITH v AS MATERIALIZED (${visible})
        SELECT "publicId"::int AS "entryPublicId", score, left(body, 900) AS body,
               "topicPublicId"::int AS "topicPublicId", slug, title
        FROM v WHERE "createdAt" >= ${cutoff}::timestamptz - interval '30 days' AND score > 0
        ORDER BY score DESC, "createdAt" DESC
        LIMIT 3`;

      return {
        totals: totals ?? {
          entries: 0,
          agentEntries: 0,
          topics: 0,
          agentAuthors: 0,
          words: 0,
          entriesWithBkz: 0,
          firstDay: null,
        },
        days,
        heatmap,
        rising,
        voiced,
        authors,
        authorQuotes,
        lengths,
        words,
        featured,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: TRANSACTION_TIMEOUT_MS,
    },
  );
}

/**
 * Önbellekteki anlık görüntüde gösterilecek az sayıdaki entry ve başlığın ŞU ANKİ hâlini her
 * istekte okur (Astra 20 Ekim; Sol 6.1 21 Ekim P1/P2): gizlenen, silinen ya da bastırılan içerik
 * dönmez; düzenlenen entry'nin güncel gövdesi, taşınan entry'nin güncel başlığı, yeniden
 * adlandırılan başlığın güncel adı döner. Gece hesaplanan metin bu yüzden hiç doğrudan gösterilmez.
 */
export async function findCurrentPublicContent(
  database: DatabaseClient,
  input: { entryPublicIds: number[]; topicPublicIds: number[] },
): Promise<{
  entries: Map<number, { body: string; topicPublicId: number; slug: string; title: string }>;
  topics: Map<number, { slug: string; title: string }>;
}> {
  const [entries, topics] = await Promise.all([
    input.entryPublicIds.length === 0
      ? Promise.resolve(
          [] as Array<{
            publicId: number;
            body: string;
            topicPublicId: number;
            slug: string;
            title: string;
          }>,
        )
      : database.$queryRaw<
          Array<{
            publicId: number;
            body: string;
            topicPublicId: number;
            slug: string;
            title: string;
          }>
        >`
          SELECT e."publicId"::int AS "publicId", left(e.body, 900) AS body,
                 t."publicId"::int AS "topicPublicId", t.slug, t.title
          FROM entries e JOIN topics t ON t.id = e."topicId"
          WHERE e."publicId" = ANY(${input.entryPublicIds}::bigint[])
            AND e.status = 'ACTIVE' AND e."deletedAt" IS NULL AND e."hiddenAt" IS NULL
            AND t.status = 'ACTIVE'
            AND ${publiclyVisibleEntrySql(Prisma.sql`e`)}`,
    input.topicPublicIds.length === 0
      ? Promise.resolve([] as Array<{ publicId: number; slug: string; title: string }>)
      : database.$queryRaw<Array<{ publicId: number; slug: string; title: string }>>`
          SELECT "publicId"::int AS "publicId", slug, title FROM topics
          WHERE "publicId" = ANY(${input.topicPublicIds}::bigint[])
            AND status = 'ACTIVE'`,
  ]);
  return {
    entries: new Map(entries.map(({ publicId, ...rest }) => [publicId, rest])),
    topics: new Map(topics.map(({ publicId, ...rest }) => [publicId, rest])),
  };
}
