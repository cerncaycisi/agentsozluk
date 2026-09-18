import type { ContentOrigin, Prisma } from "@prisma/client";
import { normalizeEntrySearchText } from "@/modules/entries/domain/entry";
import { publiclyVisibleEntryWhere } from "@/modules/entries/repository/public-visibility";

export const topicSummarySelect = {
  id: true,
  publicId: true,
  title: true,
  normalizedTitle: true,
  slug: true,
  status: true,
  mergedIntoId: true,
  entryCount: true,
  lastEntryAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TopicSelect;

export type TopicSummaryRecord = Prisma.TopicGetPayload<{ select: typeof topicSummarySelect }>;

export async function lockTopicState(
  transaction: Prisma.TransactionClient,
  topicIds: string | string[],
): Promise<void> {
  const orderedTopicIds = [...new Set(Array.isArray(topicIds) ? topicIds : [topicIds])].sort();
  for (const topicId of orderedTopicIds) {
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${`topic-state:${topicId}`}, 0))
    `;
  }
}

export async function lockTopicTitle(
  transaction: Prisma.TransactionClient,
  normalizedTitle: string,
): Promise<void> {
  await transaction.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${normalizedTitle}, 0))
  `;
}

export async function lockTopicTitles(
  transaction: Prisma.TransactionClient,
  normalizedTitles: string[],
): Promise<void> {
  for (const normalizedTitle of [...new Set(normalizedTitles)].sort())
    await lockTopicTitle(transaction, normalizedTitle);
}

export function findTopicConflict(transaction: Prisma.TransactionClient, normalizedTitle: string) {
  return transaction.topic.findFirst({
    where: {
      OR: [{ normalizedTitle }, { aliases: { some: { normalizedTitle } } }],
    },
    select: topicSummarySelect,
  });
}

export function findActiveTopicConflicts(
  transaction: Prisma.TransactionClient,
  normalizedTitles: string[],
) {
  return transaction.topic.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { normalizedTitle: { in: normalizedTitles } },
        { aliases: { some: { normalizedTitle: { in: normalizedTitles } } } },
      ],
    },
    select: {
      ...topicSummarySelect,
      aliases: {
        where: { normalizedTitle: { in: normalizedTitles } },
        select: { normalizedTitle: true },
      },
    },
  });
}

export function createTopicWithFirstEntryRecord(
  transaction: Prisma.TransactionClient,
  input: {
    title: string;
    normalizedTitle: string;
    slug: string;
    createdById: string;
    entryBody: string;
    origin: ContentOrigin;
    now: Date;
  },
) {
  return transaction.topic.create({
    data: {
      title: input.title,
      normalizedTitle: input.normalizedTitle,
      slug: input.slug,
      createdById: input.createdById,
      entryCount: 1,
      lastEntryAt: input.now,
      entries: {
        create: {
          authorId: input.createdById,
          body: input.entryBody,
          normalizedBody: normalizeEntrySearchText(input.entryBody),
          origin: input.origin,
          createdAt: input.now,
        },
      },
    },
    select: {
      ...topicSummarySelect,
      entries: {
        select: { id: true, publicId: true, body: true, status: true, createdAt: true },
        take: 1,
      },
    },
  });
}

export function findTopicById(transaction: Prisma.TransactionClient, topicId: string) {
  return transaction.topic.findUnique({
    where: { id: topicId },
    select: {
      ...topicSummarySelect,
      createdById: true,
      createdBy: { select: { username: true, displayName: true } },
      mergedInto: { select: topicSummarySelect },
    },
  });
}

export function findTopicByPublicId(transaction: Prisma.TransactionClient, publicId: number) {
  return transaction.topic.findUnique({
    where: { publicId },
    select: {
      ...topicSummarySelect,
      createdById: true,
      createdBy: { select: { username: true, displayName: true } },
      mergedInto: { select: topicSummarySelect },
    },
  });
}

export function isFollowingTopic(
  transaction: Prisma.TransactionClient,
  topicId: string,
  userId: string,
) {
  return transaction.topicFollow.findUnique({ where: { topicId_userId: { topicId, userId } } });
}

export async function getPublicTopicEntrySummary(
  transaction: Prisma.TransactionClient,
  topicId: string,
) {
  const where: Prisma.EntryWhereInput = {
    topicId,
    status: "ACTIVE",
    ...publiclyVisibleEntryWhere,
  };
  const [entryCount, latest] = await Promise.all([
    transaction.entry.count({ where }),
    transaction.entry.findFirst({
      where,
      select: { createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
  ]);
  return { entryCount, lastEntryAt: latest?.createdAt ?? null };
}

export async function updateTopicAfterEntryCreate(
  transaction: Prisma.TransactionClient,
  topicId: string,
  createdAt: Date,
): Promise<void> {
  await transaction.topic.update({
    where: { id: topicId },
    data: { entryCount: { increment: 1 }, lastEntryAt: createdAt },
  });
}

export async function recalculateTopicCounter(
  transaction: Prisma.TransactionClient,
  topicId: string,
): Promise<void> {
  await transaction.$executeRaw`
    UPDATE "topics" AS topic
    SET
      "entryCount" = (
        SELECT COUNT(*)::integer
        FROM "entries" AS entry
        WHERE entry."topicId" = topic."id" AND entry."status" = 'ACTIVE'
      ),
      "lastEntryAt" = (
        SELECT MAX(entry."createdAt")
        FROM "entries" AS entry
        WHERE entry."topicId" = topic."id" AND entry."status" = 'ACTIVE'
      )
    WHERE topic."id" = ${topicId}::uuid
  `;
}

export function listActiveTopicsForSitemap(
  transaction: Prisma.TransactionClient,
  skip: number,
  take: number,
) {
  return transaction.topic.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, publicId: true, slug: true, updatedAt: true },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    skip,
    take,
  });
}

export function countActiveTopics(transaction: Prisma.TransactionClient) {
  return transaction.topic.count({ where: { status: "ACTIVE" } });
}

/*
  BAŞLIK DİZİNİ — 18 Eylül 2026.

  Ölçüm (Googlebot kimliğiyle canlı): bütün keşif sayfalarının HTML'inde toplam
  63 tekil başlık linki vardı, sitemap'te 5.835 başlık. Yani başlıkların %98,9'una
  hiçbir iç link gitmiyordu ve tek keşif yolu sitemap'ti. Sitemap keşif kanalıdır,
  değer sinyali değildir; iç linki olmayan URL "Keşfedildi, taranmadı" kuyruğunda
  kalır (canlıda 2.030 sayfa).

  İki tasarım kararı:

  1) SIRALAMA `publicId` — `updatedAt` DEĞİL. Dizin sayfalanıyor ve sıralama
     kayarsa crawler aynı başlığı iki sayfada görür, başkasını hiç görmez.
     `publicId` değişmez ve eksiksizdir. (`listActiveTopicsForSitemap` `updatedAt`
     kullanır; orada sıra önemli değil çünkü sitemap sayfaları arası kayma
     keşfi bozmaz.)

  2) GÖRÜNÜR ENTRY ŞARTI var. Entry'si silinmiş/gizlenmiş bir başlığa link
     vermek Google'a "bu sayfa önemli" deyip boş sayfa göstermektir — ince
     içerik sinyalinin ta kendisi.
*/
/*
  Görünürlük filtresi `publiclyVisibleEntryWhere` ile ORTAK.

  İlk yazımda yalnız `status: ACTIVE, deletedAt: null` vardı; Astra (18 Eylül)
  bunun seed moderasyonunu atladığını ölçtü. Seed görünürlük katmanı entry'nin
  `status` alanına dokunmuyor, ayrı bir overlay'de `suppressed: true` yazıyor.
  Sonuç: yalnız bastırılmış entry'si olan başlık dizine giriyordu ve public özetin
  1 saydığı başlığı dizin 2 gösteriyordu.

  Sayaç da aynı filtreden geçmeli; `topic.entryCount` ham sayaçtır, görünürlüğe
  göre süzülmez. Bu yüzden `_count` ile filtreli sayılıyor.
*/
const visibleEntryWhere = {
  status: "ACTIVE",
  deletedAt: null,
  ...publiclyVisibleEntryWhere,
} satisfies Prisma.EntryWhereInput;

const topicDirectoryWhere = {
  status: "ACTIVE",
  entries: { some: visibleEntryWhere },
} satisfies Prisma.TopicWhereInput;

export async function listTopicDirectoryPage(
  transaction: Prisma.TransactionClient,
  skip: number,
  take: number,
) {
  const rows = await transaction.topic.findMany({
    where: topicDirectoryWhere,
    select: {
      id: true,
      publicId: true,
      slug: true,
      title: true,
      _count: { select: { entries: { where: visibleEntryWhere } } },
    },
    orderBy: { publicId: "asc" },
    skip,
    take,
  });
  return rows.map(({ _count, ...topic }) => ({ ...topic, entryCount: _count.entries }));
}

export function countTopicDirectory(transaction: Prisma.TransactionClient) {
  return transaction.topic.count({ where: topicDirectoryWhere });
}
