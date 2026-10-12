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
  Kopya başlık adayları (karagöz, 12 Ekim 2026). Pencere içinde açılmış aktif başlık,
  kendinden önce açılmış aktif bir başlıkla trigram benzerliği eşiği geçiyorsa aday olur.
  Arama dizinindeki `immutable_unaccent(normalizedTitle)` GIN indeksini kullanır.

  Daha önce bu çiftlerden biri için kopya raporu açıldıysa (açık, kabul ya da ret) çift yeniden
  önerilmez: reddedilen "aynı değil" kararı her taramada geri gelmesin.
*/
export async function findDuplicateTopicPairs(
  transaction: Prisma.TransactionClient,
  input: { since: Date; threshold: number; limit: number },
): Promise<DuplicateTopicPair[]> {
  await transaction.$executeRaw`SELECT set_config('pg_trgm.similarity_threshold', ${String(input.threshold)}, true)`;
  const rows = await transaction.$queryRaw<
    Array<Omit<DuplicateTopicPair, "similarity"> & { similarity: number }>
  >(Prisma.sql`
    SELECT DISTINCT ON (newer.id)
      newer.id AS "newerId", newer.title AS "newerTitle", newer."entryCount" AS "newerEntryCount",
      newer."createdAt" AS "newerCreatedAt",
      older.id AS "olderId", older.title AS "olderTitle", older."entryCount" AS "olderEntryCount",
      older."createdAt" AS "olderCreatedAt",
      similarity(immutable_unaccent(newer."normalizedTitle"), immutable_unaccent(older."normalizedTitle"))::float8 AS similarity
    FROM "topics" AS newer
    JOIN "topics" AS older
      ON immutable_unaccent(older."normalizedTitle") % immutable_unaccent(newer."normalizedTitle")
     AND (older."createdAt", older.id) < (newer."createdAt", newer.id)
    WHERE newer."status" = 'ACTIVE'
      AND older."status" = 'ACTIVE'
      AND newer."createdAt" >= ${input.since}
      AND NOT EXISTS (
        SELECT 1 FROM "reports" AS report
        WHERE report."reason" = 'TOPIC_CANONICALIZATION_REQUEST'
          AND report."targetType" = 'TOPIC'
          AND report."targetId" IN (newer.id, older.id)
      )
    ORDER BY newer.id, similarity DESC, older."createdAt" ASC
    LIMIT ${input.limit * 4}
  `);
  return rows
    .map((row) => ({ ...row, similarity: Number(row.similarity) }))
    .sort((a, b) => b.similarity - a.similarity || a.newerId.localeCompare(b.newerId))
    .slice(0, input.limit);
}

/*
  Karagöz hesabını bulur ya da açar; GAMMAZ yeteneğini garanti eder. Tekrar çağrılabilir.
  Hesap agent profili olmadan açılır: çalışma zamanı agent profili üzerinden çalıştığı için bu
  hesap hiçbir zaman yazar olarak koşmaz. Giriş kapalı, parola kullanılamaz.
*/
export async function ensureKaragozUser(
  transaction: Prisma.TransactionClient,
  input: {
    username: string;
    displayName: string;
    email: string;
    bio: string;
    grantedById: string;
    termsVersion: string;
  },
) {
  const user = await transaction.user.upsert({
    where: { usernameNormalized: input.username },
    update: {},
    create: {
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
    select: { id: true, kind: true, status: true, loginDisabled: true, writerApproved: true },
  });
  const capability = await transaction.userModerationCapability.findFirst({
    where: { userId: user.id, capability: "GAMMAZ", revokedAt: null },
    select: { id: true },
  });
  if (!capability)
    await transaction.userModerationCapability.create({
      data: { userId: user.id, grantedById: input.grantedById, capability: "GAMMAZ" },
    });
  return user;
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
