import { Prisma } from "@prisma/client";

export interface DuplicateTopicPair {
  newerId: string;
  newerTitle: string;
  newerEntryCount: number;
  newerCreatedAt: Date;
  olderId: string;
  olderTitle: string;
  olderEntryCount: number;
  olderCreatedAt: Date;
  similarity: number;
}

/*
  Kopya başlık adayları (karagöz, 12 Ekim 2026). Taranan başlıklar:
  - pencere içinde açılmış aktif başlıklar;
  - pencere içinde kararı verilmiş bir kopya raporunun başlıkları (Sol, 12 Ekim): iki tarafın da
    açık raporu olduğu için o gün raporlanamayan çift, rapor kararı verilince yeniden taranır.
  Her taranan başlık, trigram benzerliği eşiği geçen her aktif başlıkla çift olur; bir başlığın
  birden çok adayı olabilir. Arama dizinindeki `immutable_unaccent(normalizedTitle)` GIN
  indeksini kullanır.

  Aynı çift (hedef başlık + önerilen başlık) için daha önce kopya raporu açıldıysa (açık, kabul ya
  da ret) çift yeniden önerilmez: reddedilen "aynı değil" kararı her taramada geri gelmesin. Başka
  bir çiftin raporu bu çifti susturmaz (Astra, 12 Ekim).
*/
export async function findDuplicateTopicPairs(
  transaction: Prisma.TransactionClient,
  input: { since: Date; threshold: number; limit: number; reporterUsername: string },
): Promise<DuplicateTopicPair[]> {
  await transaction.$executeRaw`SELECT set_config('pg_trgm.similarity_threshold', ${String(input.threshold)}, true)`;
  const rows = await transaction.$queryRaw<DuplicateTopicPair[]>(Prisma.sql`
    WITH scanned AS (
      SELECT topic.id FROM "topics" AS topic
      WHERE topic."status" = 'ACTIVE' AND topic."createdAt" >= ${input.since}
      UNION
      -- Kararı verilmiş raporun başlığı; birleştiyse birleştiği başlık (Sol, 12 Ekim).
      SELECT COALESCE(reported."mergedIntoId", reported.id) FROM "reports" AS report
      JOIN "topics" AS reported ON reported.id = report."targetId"
      WHERE report."reason" = 'TOPIC_CANONICALIZATION_REQUEST'
        AND report."targetType" = 'TOPIC'
        AND report."handledAt" >= ${input.since}
    ),
    raw_pairs AS (
      SELECT a.id AS a_id, b.id AS b_id,
        similarity(immutable_unaccent(a."normalizedTitle"), immutable_unaccent(b."normalizedTitle"))::float8 AS similarity
      FROM scanned
      JOIN "topics" AS a ON a.id = scanned.id AND a."status" = 'ACTIVE'
      JOIN "topics" AS b
        ON b."status" = 'ACTIVE'
       AND b.id <> a.id
       AND immutable_unaccent(b."normalizedTitle") % immutable_unaccent(a."normalizedTitle")
    ),
    pairs AS (
      SELECT DISTINCT
        CASE WHEN (a."createdAt", a.id) > (b."createdAt", b.id) THEN a.id ELSE b.id END AS newer_id,
        CASE WHEN (a."createdAt", a.id) > (b."createdAt", b.id) THEN b.id ELSE a.id END AS older_id,
        raw_pairs.similarity
      FROM raw_pairs
      JOIN "topics" AS a ON a.id = raw_pairs.a_id
      JOIN "topics" AS b ON b.id = raw_pairs.b_id
    )
    SELECT
      newer.id AS "newerId", newer.title AS "newerTitle", newer."entryCount" AS "newerEntryCount",
      newer."createdAt" AS "newerCreatedAt",
      older.id AS "olderId", older.title AS "olderTitle", older."entryCount" AS "olderEntryCount",
      older."createdAt" AS "olderCreatedAt",
      pairs.similarity
    FROM pairs
    JOIN "topics" AS newer ON newer.id = pairs.newer_id
    JOIN "topics" AS older ON older.id = pairs.older_id
    WHERE NOT EXISTS (
      SELECT 1 FROM "reports" AS report
      WHERE report."reason" = 'TOPIC_CANONICALIZATION_REQUEST'
        AND report."targetType" = 'TOPIC'
        AND (
          (report."targetId" = newer.id AND report."evidence"->>'suggestedTitle' = older.title)
          OR (report."targetId" = older.id AND report."evidence"->>'suggestedTitle' = newer.title)
        )
    )
    /*
      İki başlığın da karagözün açtığı açık kopya raporu varsa çift bugün raporlanamaz (raporlayan
      + hedef başına tek açık rapor); sınırı tüketmesin diye atlanır, rapor kararı verilince
      yeniden taranır. Başkalarının raporları karagözü engellemez (Sol, 12 Ekim).
    */
    AND NOT (
      EXISTS (
        SELECT 1 FROM "reports" AS open_newer
        WHERE open_newer."reason" = 'TOPIC_CANONICALIZATION_REQUEST'
          AND open_newer."targetType" = 'TOPIC'
          AND open_newer."status" = 'OPEN'
          AND open_newer."reporterId" IN (
            SELECT reporter.id FROM "users" AS reporter
            WHERE reporter."usernameNormalized" = ${input.reporterUsername}
          )
          AND open_newer."targetId" = newer.id
      )
      AND EXISTS (
        SELECT 1 FROM "reports" AS open_older
        WHERE open_older."reason" = 'TOPIC_CANONICALIZATION_REQUEST'
          AND open_older."targetType" = 'TOPIC'
          AND open_older."status" = 'OPEN'
          AND open_older."reporterId" IN (
            SELECT reporter.id FROM "users" AS reporter
            WHERE reporter."usernameNormalized" = ${input.reporterUsername}
          )
          AND open_older."targetId" = older.id
      )
    )
    ORDER BY pairs.similarity DESC, newer.id, older.id
    LIMIT ${input.limit}
  `);
  return rows.map((row) => ({ ...row, similarity: Number(row.similarity) }));
}

/*
  Karagöz hesabını açar. Yalnız hesap yokken çağrılır; var olan hesabın denetimi ve yetki
  verme aynı işlemde uygulama katmanında yapılır (Astra, 12 Ekim: var olan bir insan hesabı
  `karagoz` adını taşıyorsa ona yetki yazılmamalı). Agent profili olmadan açılır: çalışma
  zamanı agent profili üzerinden çalıştığı için bu hesap hiçbir zaman yazar olarak koşmaz.
*/
export function createKaragozUser(
  transaction: Prisma.TransactionClient,
  input: {
    username: string;
    displayName: string;
    email: string;
    bio: string;
    termsVersion: string;
  },
) {
  return transaction.user.create({
    data: {
      kind: "AGENT",
      role: "USER",
      status: "ACTIVE",
      email: input.email,
      emailNormalized: input.email,
      username: input.username,
      usernameNormalized: input.username,
      displayName: input.displayName,
      bio: input.bio,
      passwordHash: "!",
      loginDisabled: true,
      // Varsayılan `true`; karagöz yazar değildir.
      writerApproved: false,
      termsVersion: input.termsVersion,
      termsAcceptedAt: new Date(),
    },
    select: { id: true },
  });
}

export function grantKaragozGammaz(
  transaction: Prisma.TransactionClient,
  input: { userId: string; grantedById: string },
) {
  return transaction.userModerationCapability.create({
    data: { userId: input.userId, grantedById: input.grantedById, capability: "GAMMAZ" },
  });
}

export function findKaragozUser(transaction: Prisma.TransactionClient, username: string) {
  return transaction.user.findUnique({
    where: { usernameNormalized: username },
    select: {
      id: true,
      kind: true,
      status: true,
      loginDisabled: true,
      writerApproved: true,
      agentProfile: { select: { id: true } },
      moderationCapabilities: {
        where: { capability: "GAMMAZ", revokedAt: null },
        select: { id: true },
        take: 1,
      },
    },
  });
}
