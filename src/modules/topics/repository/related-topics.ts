import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { publicIds } from "@/lib/db/public-ids";
import {
  publiclyVisibleEntrySql,
  publiclyVisibleEntryWhere,
} from "@/modules/entries/repository/public-visibility";
import { substantialTopicSql } from "@/modules/indexing/repository/indexing";
import type {
  PlannedRelatedTopicLink,
  RelatedTopicLinkSource,
} from "@/modules/topics/domain/related-topics";

/*
  İlgili başlık hesabının veri erişimi. Ölçümde kullanılan SQL'in (17 Ekim, iki kör hakem)
  tüm başlıklara genişletilmiş hâli; sinyal tanımları değişmedi:

  - Uygun başlık: aktif, birleşmemiş ve G4'e göre ince olmayan (`substantialTopicSql`). Hem
    kaynak hem hedef aynı kümeden gelir; noindex ince sayfaya bağlantı verilmez.
  - A: `similarity(başlık, öteki başlık)` (pg_trgm), kaynak hariç en benzer 3, benzerlik > 0.
  - C: başlık vektörü = setweight(to_tsvector('turkish', başlık), 'A') || to_tsvector('turkish',
    görünür entry gövdeleri). Kaynağın sorgusu, uzunluğu ≥4, df ≥2 ve df ≤ N'nin %5'i olan
    sözcüklerden tf·ln(N/df)'e göre ilk 12'sinin OR'u. Öteki başlıklar `ts_rank_cd(vec, q, 1)`
    ile sıralanır; en az iki farklı ortak sorgu sözcüğü şartı; ilk 3.

  Hesap tek transaction'da, `ON COMMIT DROP` geçici tablolarla yapılır: belge vektörleri bir
  kez kurulur, kaynaklar partiler hâlinde işlenir. Her ifade `statement_timeout` ile sınırlıdır.
  Kalıcı tabloya yalnız `replaceRelatedTopicLinks` yazar.
*/

/** Çok uzun başlıkta belge vektörü bu kadar karakterle sınırlanır (tsvector 1 MB sınırı). */
export const RELATED_TOPIC_BODY_CHAR_LIMIT = 200_000;

const visibleEntrySql = (alias: Prisma.Sql) => Prisma.sql`${alias}."status" = 'ACTIVE'
  AND ${alias}."deletedAt" IS NULL
  AND ${alias}."hiddenAt" IS NULL
  AND ${publiclyVisibleEntrySql(alias)}`;

export async function limitRelatedTopicStatements(
  transaction: Prisma.TransactionClient,
): Promise<void> {
  // SET parametre almaz; değerler sabit. Toplam süreyi transaction zaman aşımı sınırlar.
  await transaction.$executeRaw`SET LOCAL statement_timeout = '300s'`;
  await transaction.$executeRaw`SET LOCAL lock_timeout = '10s'`;
  // A'nın çift sayımı parti başına yüz binlerce grup üretir; diske taşmadan gruplansın.
  await transaction.$executeRaw`SET LOCAL work_mem = '64MB'`;
}

/**
 * Uygun başlıkları, belge vektörlerini ve sözcük tablolarını geçici tablolara kurar.
 * Geçici tablolar transaction bitince düşer; kalıcı hiçbir şey yazılmaz.
 */
export async function prepareRelatedTopicWorkspace(
  transaction: Prisma.TransactionClient,
): Promise<number> {
  await transaction.$executeRaw`
    CREATE TEMP TABLE ilgili_hedef (
      id uuid PRIMARY KEY,
      title text NOT NULL,
      vec tsvector NOT NULL
    ) ON COMMIT DROP
  `;
  await transaction.$executeRaw(Prisma.sql`
    INSERT INTO ilgili_hedef (id, title, vec)
    SELECT topic.id, topic.title,
      setweight(to_tsvector('turkish', topic.title), 'A')
        || to_tsvector('turkish', coalesce((
          SELECT left(string_agg(entry.body, ' ' ORDER BY entry."createdAt", entry.id), ${RELATED_TOPIC_BODY_CHAR_LIMIT}::integer)
          FROM "entries" AS entry
          WHERE entry."topicId" = topic.id AND ${visibleEntrySql(Prisma.sql`entry`)}
        ), ''))
    FROM "topics" AS topic
    WHERE topic."status" = 'ACTIVE'
      AND topic."mergedIntoId" IS NULL
      AND ${substantialTopicSql(Prisma.sql`topic`)}
  `);
  await transaction.$executeRaw`
    CREATE TEMP TABLE ilgili_sozcuk (
      topic_id uuid NOT NULL,
      lexeme text NOT NULL,
      tf integer NOT NULL,
      PRIMARY KEY (topic_id, lexeme)
    ) ON COMMIT DROP
  `;
  /*
    Ters bölü içeren sözcük sorguya girmez: `quote_literal` onu E'' biçimine çevirir ve tsquery
    girdisi bunu ayrıştıramaz. Ölçüm SQL'i sözcüğü 'simple' ile yeniden ayrıştırıyordu
    (`to_tsquery('simple', …)`); burada sözcük tırnaklı tek sözcük olarak aynen kullanılır.
  */
  await transaction.$executeRaw`
    INSERT INTO ilgili_sozcuk (topic_id, lexeme, tf)
    SELECT hedef.id, u.lexeme, coalesce(array_length(u.positions, 1), 1)
    FROM ilgili_hedef AS hedef, unnest(hedef.vec) AS u
    WHERE length(u.lexeme) >= 4 AND position(chr(92) in u.lexeme) = 0
  `;
  await transaction.$executeRaw`CREATE INDEX ON ilgili_sozcuk (lexeme)`;
  await transaction.$executeRaw`
    CREATE TEMP TABLE ilgili_df (lexeme text PRIMARY KEY, df integer NOT NULL) ON COMMIT DROP
  `;
  await transaction.$executeRaw`
    INSERT INTO ilgili_df (lexeme, df)
    SELECT lexeme, count(*)::integer FROM ilgili_sozcuk GROUP BY lexeme
  `;
  /*
    A için başlık trigramları. `similarity()` her çiftte iki başlığın trigramlarını yeniden üretir;
    7.600 başlıkta ~58 milyon çağrı demek. Aynı değer burada ters indeksle sayılır:
    pg_trgm benzerliği = ortak / (|A| + |B| − ortak), `show_trgm` aynı tekil trigram kümesini verir.
    Ortak trigramı olmayan çiftin benzerliği zaten 0'dır ve aday sayılmaz.
  */
  await transaction.$executeRaw`
    CREATE TEMP TABLE ilgili_trigram (topic_id uuid NOT NULL, trigram text NOT NULL) ON COMMIT DROP
  `;
  await transaction.$executeRaw`
    INSERT INTO ilgili_trigram (topic_id, trigram)
    SELECT hedef.id, t.trigram
    FROM ilgili_hedef AS hedef, unnest(show_trgm(hedef.title)) AS t(trigram)
  `;
  await transaction.$executeRaw`CREATE INDEX ON ilgili_trigram (trigram)`;
  await transaction.$executeRaw`CREATE INDEX ON ilgili_trigram (topic_id)`;
  await transaction.$executeRaw`
    CREATE TEMP TABLE ilgili_trigram_sayi (topic_id uuid PRIMARY KEY, n integer NOT NULL)
    ON COMMIT DROP
  `;
  await transaction.$executeRaw`
    INSERT INTO ilgili_trigram_sayi (topic_id, n)
    SELECT topic_id, count(*)::integer FROM ilgili_trigram GROUP BY topic_id
  `;
  // Geçici tabloları autovacuum görmez; planlayıcı istatistiği burada alınır.
  await transaction.$executeRaw`ANALYZE ilgili_hedef`;
  await transaction.$executeRaw`ANALYZE ilgili_sozcuk`;
  await transaction.$executeRaw`ANALYZE ilgili_df`;
  await transaction.$executeRaw`ANALYZE ilgili_trigram`;
  await transaction.$executeRaw`ANALYZE ilgili_trigram_sayi`;
  const rows = await transaction.$queryRaw<Array<{ count: number }>>`
    SELECT count(*)::integer AS count FROM ilgili_hedef
  `;
  return rows[0]?.count ?? 0;
}

export function listRelatedTopicWorkspaceTopics(
  transaction: Prisma.TransactionClient,
): Promise<Array<{ id: string; title: string }>> {
  return transaction.$queryRaw<Array<{ id: string; title: string }>>`
    SELECT id::text AS id, title FROM ilgili_hedef ORDER BY id
  `;
}

export interface RelatedTopicSignalRow {
  topicId: string;
  relatedTopicId: string;
  score: number;
}

/**
 * A: kaynak başına en benzer 3 başlık; benzerliği sıfır olan aday sayılmaz. Değer
 * `similarity(kaynak.title, hedef.title)` ile birebir aynıdır (pg_trgm de float4 böler); entegrasyon
 * testi bunu doğrudan `similarity()` ile karşılaştırır.
 */
export function findTitleSignalTop(
  transaction: Prisma.TransactionClient,
  sourceIds: readonly string[],
  top: number,
): Promise<RelatedTopicSignalRow[]> {
  return transaction.$queryRaw<RelatedTopicSignalRow[]>(Prisma.sql`
    WITH ortak AS (
      SELECT kaynak.topic_id AS source_id, hedef.topic_id AS target_id, count(*)::integer AS shared
      FROM ilgili_trigram AS kaynak
      JOIN ilgili_trigram AS hedef
        ON hedef.trigram = kaynak.trigram AND hedef.topic_id <> kaynak.topic_id
      WHERE kaynak.topic_id = ANY(${[...sourceIds]}::uuid[])
      GROUP BY kaynak.topic_id, hedef.topic_id
    ),
    puan AS (
      SELECT ortak.source_id, ortak.target_id,
        ortak.shared::float4 / (kaynak.n + hedef.n - ortak.shared)::float4 AS score
      FROM ortak
      JOIN ilgili_trigram_sayi AS kaynak ON kaynak.topic_id = ortak.source_id
      JOIN ilgili_trigram_sayi AS hedef ON hedef.topic_id = ortak.target_id
    ),
    sirali AS (
      SELECT puan.*,
        row_number() OVER (PARTITION BY source_id ORDER BY score DESC, target_id) AS rn
      FROM puan
    )
    SELECT source_id::text AS "topicId", target_id::text AS "relatedTopicId", score::float8 AS score
    FROM sirali
    WHERE rn <= ${top}
    ORDER BY source_id, rn
  `);
}

/** C: kaynak başına içerik benzerliğiyle en yakın 3 başlık. */
export function findContentSignalTop(
  transaction: Prisma.TransactionClient,
  sourceIds: readonly string[],
  input: { topicCount: number; top: number },
): Promise<RelatedTopicSignalRow[]> {
  const n = input.topicCount;
  return transaction.$queryRaw<RelatedTopicSignalRow[]>(Prisma.sql`
    WITH kaynak AS (
      SELECT unnest(${[...sourceIds]}::uuid[]) AS id
    ),
    secilen AS (
      SELECT kaynak.id AS source_id, x.lexeme
      FROM kaynak
      CROSS JOIN LATERAL (
        SELECT sozcuk.lexeme
        FROM ilgili_sozcuk AS sozcuk
        JOIN ilgili_df AS df ON df.lexeme = sozcuk.lexeme
        WHERE sozcuk.topic_id = kaynak.id
          AND df.df >= 2
          AND df.df <= 0.05 * ${n}::float8
        ORDER BY sozcuk.tf * ln(${n}::float8 / df.df) DESC, sozcuk.lexeme
        LIMIT 12
      ) AS x
    ),
    sorgu AS (
      SELECT source_id, string_agg(quote_literal(lexeme), ' | ')::tsquery AS q
      FROM secilen
      GROUP BY source_id
    ),
    aday AS (
      SELECT secilen.source_id, sozcuk.topic_id AS target_id
      FROM secilen
      JOIN ilgili_sozcuk AS sozcuk
        ON sozcuk.lexeme = secilen.lexeme AND sozcuk.topic_id <> secilen.source_id
      GROUP BY secilen.source_id, sozcuk.topic_id
      HAVING count(*) >= 2
    ),
    puan AS (
      SELECT aday.source_id, aday.target_id, ts_rank_cd(hedef.vec, sorgu.q, 1)::float8 AS score
      FROM aday
      JOIN sorgu ON sorgu.source_id = aday.source_id
      JOIN ilgili_hedef AS hedef ON hedef.id = aday.target_id
    ),
    sirali AS (
      SELECT puan.*,
        row_number() OVER (PARTITION BY source_id ORDER BY score DESC, target_id) AS rn
      FROM puan
    )
    SELECT source_id::text AS "topicId", target_id::text AS "relatedTopicId", score
    FROM sirali
    WHERE rn <= ${input.top}
    ORDER BY source_id, rn
  `);
}

/** bkz ya da [[başlık]] içerebilecek görünür entry gövdeleri; başlık içinde yazılış sırasıyla. */
export function listReferenceEntryBodies(
  transaction: Prisma.TransactionClient,
  sourceIds: readonly string[],
): Promise<Array<{ topicId: string; body: string }>> {
  return transaction.entry.findMany({
    where: {
      topicId: { in: [...sourceIds] },
      status: "ACTIVE",
      deletedAt: null,
      hiddenAt: null,
      ...publiclyVisibleEntryWhere,
      OR: [{ body: { contains: "(bkz:", mode: "insensitive" } }, { body: { contains: "[[" } }],
    },
    orderBy: [{ topicId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { topicId: true, body: true },
  });
}

/**
 * bkz hedeflerini entry render'ı (`findVisibleEntryReferences`) ile aynı kuralla çözer: aktif
 * başlığın kendi normalize adı ya da takma adlarından biri.
 */
export function findReferencedTopics(
  transaction: Prisma.TransactionClient,
  normalizedTitles: readonly string[],
): Promise<
  Array<{ id: string; normalizedTitle: string; aliases: Array<{ normalizedTitle: string }> }>
> {
  const titles = [...normalizedTitles];
  return transaction.topic.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { normalizedTitle: { in: titles } },
        { aliases: { some: { normalizedTitle: { in: titles } } } },
      ],
    },
    select: {
      id: true,
      normalizedTitle: true,
      aliases: {
        where: { normalizedTitle: { in: titles } },
        select: { normalizedTitle: true },
      },
    },
  });
}

/** Tablonun tamamını aynı transaction içinde siler ve yeniden yazar. */
export async function replaceRelatedTopicLinks(
  transaction: Prisma.TransactionClient,
  plans: ReadonlyMap<string, readonly PlannedRelatedTopicLink[]>,
  computedAt: Date,
): Promise<number> {
  await transaction.topicRelatedLink.deleteMany({});
  const rows: Prisma.TopicRelatedLinkCreateManyInput[] = [];
  for (const [topicId, links] of plans) {
    for (const link of links) {
      rows.push({
        id: randomUUID(),
        topicId,
        relatedTopicId: link.relatedTopicId,
        rank: link.rank,
        source: link.source,
        computedAt,
      });
    }
  }
  let written = 0;
  for (let index = 0; index < rows.length; index += 5_000) {
    const result = await transaction.topicRelatedLink.createMany({
      data: rows.slice(index, index + 5_000),
    });
    written += result.count;
  }
  return written;
}

export interface RelatedTopicLinkRecord {
  title: string;
  slug: string;
  publicId: number;
  source: RelatedTopicLinkSource;
}

/**
 * Sayfa okuması: sıralı en çok `limit` bağlantı. Hedefin hâlâ aktif ve birleşmemiş olduğu okuma
 * anında yeniden denetlenir; gece hesabından sonra gizlenen ya da birleşen başlık görünmez.
 * `(topicId, rank)` indeksiyle tek sorgu.
 */
export function findRelatedTopicLinks(
  transaction: Prisma.TransactionClient,
  topicId: string,
  limit: number,
): Promise<RelatedTopicLinkRecord[]> {
  return publicIds(
    transaction.topicRelatedLink.findMany({
      where: {
        topicId,
        relatedTopic: { status: "ACTIVE", mergedIntoId: null },
      },
      orderBy: { rank: "asc" },
      take: limit,
      select: {
        source: true,
        relatedTopic: { select: { title: true, slug: true, publicId: true } },
      },
    }),
  ).then((rows) =>
    rows.map((row) => ({
      title: row.relatedTopic.title,
      slug: row.relatedTopic.slug,
      publicId: row.relatedTopic.publicId,
      source: row.source,
    })),
  );
}
