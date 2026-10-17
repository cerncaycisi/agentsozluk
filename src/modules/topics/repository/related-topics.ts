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

  Hesap tek REPEATABLE READ transaction'da, `ON COMMIT DROP` geçici tablolarla yapılır: belge
  vektörleri, parmak izleri ve bkz gövdeleri aynı snapshot'tan okunur; belge vektörleri bir
  kez kurulur, kaynaklar partiler hâlinde işlenir. Her ifade `statement_timeout` ile sınırlıdır.
  Kalıcı tabloya yalnız `replaceRelatedTopicLinks` yazar.
*/

/** Çok uzun başlıkta belge vektörü bu kadar karakterle sınırlanır (tsvector 1 MB sınırı). */
export const RELATED_TOPIC_BODY_CHAR_LIMIT = 200_000;

const visibleEntrySql = (alias: Prisma.Sql) => Prisma.sql`${alias}."status" = 'ACTIVE'
  AND ${alias}."deletedAt" IS NULL
  AND ${alias}."hiddenAt" IS NULL
  AND ${publiclyVisibleEntrySql(alias)}`;

/*
  BAŞLIK PARMAK İZİ (Astra, 17 Ekim, 2. tur). Bir başlığın görünür entry kümesinin ve
  gövdelerinin özeti: md5(string_agg(id || ':' || md5(gövde), ',' ORDER BY id)). Hesap bunu
  vektörlerle aynı snapshot'ta (REPEATABLE READ) bağın iki ucu için saklar; okuma aynı ifadeyle
  yeniden hesaplar ve fark varsa bağı göstermez. Zaman damgası karşılaştırması, hesapla çakışan
  ve hesap snapshot'ından sonra commit eden moderasyonu kaçırıyordu; parmak izi commit sırasından
  bağımsızdır.

  YENİ ENTRY BAĞI DÜŞÜRMEZ (koordinatör kararı, 17 Ekim). Okuma izi yalnız `createdAt <=
  computedAt` olan görünür entry'lerden alır (`computedAt` hesap transaction'ının `now()`'ı).
  Ekleme gizli içerik sızdıramaz; hareketli başlık da bloğunu gün boyu kaybetmez. Sonuçlar:
  - Hesaptan önce var olan bir entry'nin silinmesi, gizlenmesi, seed görünürlüğünün bastırılması
    ya da gövdesinin düzenlenmesi izi değiştirir; bağ düşer.
  - `computedAt`'ten önce açılıp hesap snapshot'ından sonra commit eden ya da sonradan yeniden
    görünür olan bir entry yalnız okumada görünür; iz tutmaz ve bağ düşer. Bu tutucu yöndür,
    hiçbir zaman sızıntı değildir. Uygulama ile veritabanı saati arasındaki küçük kayma da yalnız
    bu yönde (bağ düşer) etki eder.
  - `computedAt`'ten sonra eklenen görünür entry'ler okumada sayılmaz; bağ kalır.

  G4 (ince başlık): okuma izi hesaptakine eşitse hesap anındaki görünür küme ve gövdeler aynen
  duruyordur; o küme hesapta inceliği geçmişti (`substantialTopicSql` yalnız bu kümeye ve
  gövdelere bakar; ACTIVE entry'de `hiddenAt` her zaman boş). Sonradan eklenen entry'ler yalnız
  içeriği artırır, inceliği geri getiremez; çıkarma ise izi değiştirir. Okuma bu yüzden inceliği
  ayrıca saymaz.

  Hiç görünür entry'si olmayan başlıkta ifade NULL verir; NULL hiçbir saklı ize eşit olmaz.
*/
const topicFingerprintSql = (topicId: Prisma.Sql, createdNoLaterThan?: Prisma.Sql) => Prisma.sql`(
  SELECT md5(string_agg(fingerprint_entry.id::text || ':' || md5(fingerprint_entry.body), ',' ORDER BY fingerprint_entry.id))
  FROM "entries" AS fingerprint_entry
  WHERE fingerprint_entry."topicId" = ${topicId}
    AND ${visibleEntrySql(Prisma.sql`fingerprint_entry`)}
    ${createdNoLaterThan ? Prisma.sql`AND fingerprint_entry."createdAt" <= ${createdNoLaterThan}` : Prisma.empty}
)`;

export async function limitRelatedTopicStatements(
  transaction: Prisma.TransactionClient,
): Promise<void> {
  // SET parametre almaz; değerler sabit. Toplam süreyi transaction zaman aşımı sınırlar.
  await transaction.$executeRaw`SET LOCAL statement_timeout = '300s'`;
  await transaction.$executeRaw`SET LOCAL lock_timeout = '10s'`;
  // A'nın çift sayımı parti başına yüz binlerce grup üretir; diske taşmadan gruplansın.
  await transaction.$executeRaw`SET LOCAL work_mem = '64MB'`;
}

/** Transaction'ın başlangıç anı (veritabanı saati); hesabın `computedAt` değeri. */
export async function currentTransactionTime(transaction: Prisma.TransactionClient): Promise<Date> {
  const rows = await transaction.$queryRaw<Array<{ now: Date }>>`SELECT now() AS now`;
  const now = rows[0]?.now;
  if (!(now instanceof Date)) throw new Error("RELATED_TOPIC_CLOCK_UNAVAILABLE");
  return now;
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
      vec tsvector NOT NULL,
      fingerprint text NOT NULL
    ) ON COMMIT DROP
  `;
  await transaction.$executeRaw(Prisma.sql`
    INSERT INTO ilgili_hedef (id, title, vec, fingerprint)
    SELECT topic.id, topic.title,
      setweight(to_tsvector('turkish', topic.title), 'A')
        || to_tsvector('turkish', coalesce((
          SELECT left(string_agg(entry.body, ' ' ORDER BY entry."createdAt", entry.id), ${RELATED_TOPIC_BODY_CHAR_LIMIT}::integer)
          FROM "entries" AS entry
          WHERE entry."topicId" = topic.id AND ${visibleEntrySql(Prisma.sql`entry`)}
        ), '')),
      ${topicFingerprintSql(Prisma.sql`topic.id`)}
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
): Promise<Array<{ id: string; title: string; fingerprint: string }>> {
  return transaction.$queryRaw<Array<{ id: string; title: string; fingerprint: string }>>`
    SELECT id::text AS id, title, fingerprint FROM ilgili_hedef ORDER BY id
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
): Promise<Array<{ id: string; topicId: string; body: string }>> {
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
    select: { id: true, topicId: true, body: true },
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
  fingerprints: ReadonlyMap<string, string>,
  computedAt: Date,
): Promise<number> {
  const fingerprint = (topicId: string) => {
    const value = fingerprints.get(topicId);
    if (!value) throw new Error("RELATED_TOPIC_FINGERPRINT_MISSING");
    return value;
  };
  await transaction.topicRelatedLink.deleteMany({});
  const rows: Prisma.TopicRelatedLinkCreateManyInput[] = [];
  for (const [topicId, links] of plans) {
    for (const link of links) {
      rows.push({
        id: randomUUID(),
        topicId,
        relatedTopicId: link.relatedTopicId,
        rank: link.rank,
        sourceEntryId: link.sourceEntryId,
        source: link.source,
        sourceFingerprint: fingerprint(topicId),
        targetFingerprint: fingerprint(link.relatedTopicId),
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
 * Sayfa okuması: sıralı en çok `limit` bağlantı. Gece hesabı bir anlık görüntüdür; okuma anında
 * yeniden denetlenir (Astra, 17 Ekim, 1. ve 2. tur):
 *
 * - Kaynak ve hedef hâlâ aktif ve birleşmemiş.
 * - Kaynak ve hedefin parmak izi hesaptakiyle aynı (bkz. `topicFingerprintSql`): hesaptan önce
 *   var olan görünür entry'lerden biri silindi, gizlendi, bastırıldı ya da düzenlendiyse bağ (BKZ
 *   ya da SIGNAL) gösterilmez; hesaptan sonra eklenen entry'ler sayılmaz. Aynı küme G4 inceliğini
 *   de sabitler.
 * - BKZ bağının kaynak entry'si hâlâ görünür ve kaynak başlıkta; bilinmiyorsa bağ gösterilmez.
 * - Hesap `RELATED_TOPIC_MAX_AGE_HOURS` saatten eski değil (gece işi durursa bayat bağ kalmaz).
 *
 * Tek sorgu: bağlar `(topicId, rank)` indeksinden; her parmak izi `entries(topicId, status, …)`
 * indeksinin `topicId = … AND status = 'ACTIVE'` aralığından okunur. Düşen bağ bir sonraki gece
 * hesabında temiz veriden yeniden kurulur.
 */
export function findRelatedTopicLinks(
  transaction: Prisma.TransactionClient,
  topicId: string,
  limit: number,
): Promise<RelatedTopicLinkRecord[]> {
  return publicIds(
    transaction.$queryRaw<
      Array<{ title: string; slug: string; publicId: bigint; source: RelatedTopicLinkSource }>
    >(relatedTopicLinksReadSql(topicId, limit)),
  );
}

/*
  YAŞ SINIRI (17 Ekim 2026; Astra bulgu 5). Bağlar gece hesabının anlık görüntüsüdür
  ve tablo yalnız bir sonraki başarılı hesapta değişir. Gece işi durursa (birim düşer, zamanlayıcı
  kurulmaz, kilit hep tutulur) eski bağlar süresiz okurun önünde kalırdı. Hesap anı (`computedAt`,
  veritabanı saati) bu süreden eskiyse bağ gösterilmez; blok sessizce kalkar. 72 saat: iki gece
  kaçırılsa da blok durur, üçüncüsünde kalkar; işin düştüğünü `OnFailure=` bildirimi ve alarmın
  26 saatlik son-başarılı-koşu kontrolü ayrıca söyler.
*/
export const RELATED_TOPIC_MAX_AGE_HOURS = 72;

/** Okuma sorgusu; EXPLAIN denetimi için ayrıca dışa açık. */
export function relatedTopicLinksReadSql(topicId: string, limit: number): Prisma.Sql {
  return Prisma.sql`
    SELECT target.title, target.slug, target."publicId", link."source"
    FROM "topic_related_links" AS link
    JOIN "topics" AS source ON source.id = link."topicId"
    JOIN "topics" AS target ON target.id = link."relatedTopicId"
    WHERE link."topicId" = ${topicId}::uuid
      AND link."computedAt" >= now() - make_interval(hours => ${RELATED_TOPIC_MAX_AGE_HOURS}::integer)
      AND source."status" = 'ACTIVE'
      AND source."mergedIntoId" IS NULL
      AND target."status" = 'ACTIVE'
      AND target."mergedIntoId" IS NULL
      AND (
        link."source" = 'SIGNAL'
        OR EXISTS (
          SELECT 1
          FROM "entries" AS bkz_entry
          WHERE bkz_entry.id = link."sourceEntryId"
            AND bkz_entry."topicId" = link."topicId"
            AND ${visibleEntrySql(Prisma.sql`bkz_entry`)}
        )
      )
      AND link."sourceFingerprint" = ${topicFingerprintSql(Prisma.sql`link."topicId"`, Prisma.sql`link."computedAt"`)}
      AND link."targetFingerprint" = ${topicFingerprintSql(Prisma.sql`link."relatedTopicId"`, Prisma.sql`link."computedAt"`)}
    ORDER BY link."rank"
    LIMIT ${limit}
  `;
}

/**
 * Gece hesabının karşılıklı dışlaması (Astra, 17 Ekim, 1. tur): iki hesap aynı anda tabloyu
 * silip yazarsa iki sonucun birleşimi kalabilir. Transaction'a bağlı danışma kilidi; transaction
 * bitince kendiliğinden bırakılır. Anahtar sabit ve yalnız bu iş için.
 */
export const RELATED_TOPIC_ADVISORY_LOCK_KEY = 2_026_101_701n;

export async function tryLockRelatedTopicComputation(
  transaction: Prisma.TransactionClient,
): Promise<boolean> {
  const rows = await transaction.$queryRaw<Array<{ acquired: boolean }>>`
    SELECT pg_try_advisory_xact_lock(${RELATED_TOPIC_ADVISORY_LOCK_KEY}::bigint) AS acquired
  `;
  return rows[0]?.acquired === true;
}
