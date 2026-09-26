import type { ContentOrigin, Prisma } from "@prisma/client";
import { type NumericPublicIds, withNumericPublicIds } from "@/lib/db/public-id";
import { normalizeEntrySearchText } from "@/modules/entries/domain/entry";
import { publiclyVisibleEntryWhere } from "@/modules/entries/repository/public-visibility";

export const entryDetailSelect = {
  id: true,
  publicId: true,
  topicId: true,
  authorId: true,
  body: true,
  normalizedBody: true,
  status: true,
  score: true,
  upvoteCount: true,
  downvoteCount: true,
  origin: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  hiddenAt: true,
  topic: {
    select: {
      id: true,
      publicId: true,
      title: true,
      slug: true,
      status: true,
      mergedIntoId: true,
      mergedInto: {
        select: { id: true, publicId: true, title: true, slug: true },
      },
      createdById: true,
    },
  },
  author: {
    select: {
      id: true,
      username: true,
      displayName: true,
      status: true,
    },
  },
  _count: { select: { revisions: true, bookmarks: true } },
} satisfies Prisma.EntrySelect;

export type EntryDetailRecord = NumericPublicIds<
  Prisma.EntryGetPayload<{ select: typeof entryDetailSelect }>
>;

export async function lockEntryState(
  transaction: Prisma.TransactionClient,
  entryId: string,
): Promise<void> {
  await transaction.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${`entry-state:${entryId}`}, 0))
  `;
}

export function createEntryRecord(
  transaction: Prisma.TransactionClient,
  input: {
    topicId: string;
    authorId: string;
    body: string;
    origin: ContentOrigin;
    createdAt: Date;
  },
) {
  return transaction.entry
    .create({
      data: {
        topicId: input.topicId,
        authorId: input.authorId,
        body: input.body,
        normalizedBody: normalizeEntrySearchText(input.body),
        origin: input.origin,
        createdAt: input.createdAt,
      },
      select: entryDetailSelect,
    })
    .then(withNumericPublicIds);
}

export function findEntryById(transaction: Prisma.TransactionClient, entryId: string) {
  return transaction.entry
    .findUnique({ where: { id: entryId }, select: entryDetailSelect })
    .then(withNumericPublicIds);
}

export function findEntryByPublicId(transaction: Prisma.TransactionClient, publicId: number) {
  return transaction.entry
    .findUnique({ where: { publicId }, select: entryDetailSelect })
    .then(withNumericPublicIds);
}

export function findPublicEntryById(transaction: Prisma.TransactionClient, entryId: string) {
  return transaction.entry
    .findFirst({
      where: { id: entryId, ...publiclyVisibleEntryWhere },
      select: entryDetailSelect,
    })
    .then(withNumericPublicIds);
}

export function findPublicEntryByPublicId(transaction: Prisma.TransactionClient, publicId: number) {
  return transaction.entry
    .findFirst({
      where: { publicId, ...publiclyVisibleEntryWhere },
      select: entryDetailSelect,
    })
    .then(withNumericPublicIds);
}

export async function updateEntryRecord(
  transaction: Prisma.TransactionClient,
  entryId: string,
  body: string,
) {
  const result = await transaction.entry.updateMany({
    where: { id: entryId, status: "ACTIVE", deletedAt: null, origin: { not: "SEED" } },
    data: { body, normalizedBody: normalizeEntrySearchText(body) },
  });
  return result.count === 1 ? findEntryById(transaction, entryId) : null;
}

export async function createEntryRevision(
  transaction: Prisma.TransactionClient,
  input: { entryId: string; body: string; editedById: string },
) {
  return transaction.entryRevision.create({ data: input });
}

export function listEntryRevisions(
  transaction: Prisma.TransactionClient,
  entryId: string,
  skip: number,
  take: number,
) {
  const where: Prisma.EntryRevisionWhereInput = { entryId };
  return Promise.all([
    transaction.entryRevision.findMany({
      where,
      select: {
        id: true,
        body: true,
        createdAt: true,
        editedBy: { select: { id: true, username: true, displayName: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take,
    }),
    transaction.entryRevision.count({ where }),
  ]);
}

export async function softDeleteEntryRecord(
  transaction: Prisma.TransactionClient,
  entryId: string,
  deletedAt: Date,
) {
  const result = await transaction.entry.updateMany({
    where: { id: entryId, status: "ACTIVE", deletedAt: null, origin: { not: "SEED" } },
    data: { status: "DELETED", deletedAt },
  });
  return result.count === 1 ? findEntryById(transaction, entryId) : null;
}

/*
  Bir entry'nin BAŞLIK SAYFASINDAKİ yerini bulur — 18 Eylül 2026.

  Neden: `/entry/N` sayfaları başlık sayfasının kopyasıydı. Canlı örneklemde
  başlıkların %50'sinde tek entry var, yani iki sayfa birebir aynı metni
  taşıyor; ikisi de `index, follow` ve ikisi de kendine canonical veriyordu.
  Sitemap'in %76'sı (18.515 URL) bu kopyalara gidiyordu.

  Entry artık kendi başlık sayfasına canonical veriyor. Doğru sayfayı bulmak
  şart: 20'den sonraki entry'nin metni 1. sayfada YOK ve canonical'ı oraya
  göstermek yanlış olur. Bu ancak başlık sayfalaması indekslenebilir olduğu için
  mümkün (bkz. `robotsForPaginatedView`) — sıralama varsayılan görünümle
  (`createdAt asc, id asc`) aynı olmalı, yoksa hesap tutmaz.
*/
export async function getEntryTopicPageNumber(
  transaction: Prisma.TransactionClient,
  entry: { id: string; topicId: string; createdAt: Date },
  pageSize: number,
): Promise<number> {
  /*
    SAYIM, ANONİM GÖRÜNÜMÜN FİLTRESİYLE AYNI OLMALI.

    İlk yazımda yalnız `status: ACTIVE` sayıyordum. Sol (18 Eylül) ölçtü:
    varsayılan başlık listesi anonim kullanıcıya `ACTIVE` VE `DELETED`
    mezar taşlarını birlikte sayfalıyor (`listTopicEntries`). Hedeften önce
    19 aktif + 1 silinmiş entry varsa hedef gerçekte 21. satır, yani 2. sayfa;
    benim hesabım 19 sayıp 1. sayfayı veriyordu. Sonuç: canonical, entry'yi
    İÇERMEYEN sayfayı gösteriyordu — konsolidasyonun temel iddiası kırık.

    `deletedAt: null` de bu yüzden kaldırıldı: silinmiş entry listede duruyor.
  */
  const before = await transaction.entry.count({
    where: {
      topicId: entry.topicId,
      status: { in: ["ACTIVE", "DELETED"] },
      ...publiclyVisibleEntryWhere,
      OR: [
        { createdAt: { lt: entry.createdAt } },
        { createdAt: entry.createdAt, id: { lt: entry.id } },
      ],
    },
  });
  return Math.floor(before / Math.max(1, pageSize)) + 1;
}

export function listTopicEntries(
  transaction: Prisma.TransactionClient,
  input: {
    topicId: string;
    includeAllHidden: boolean;
    hiddenAuthorId?: string;
    skip: number;
    take: number;
    sort: "oldest" | "newest" | "top";
    query?: string;
    createdAtWindow?: { start: Date; end: Date };
  },
) {
  const orderBy: Prisma.EntryOrderByWithRelationInput[] =
    input.sort === "newest"
      ? [{ createdAt: "desc" }, { id: "desc" }]
      : input.sort === "top"
        ? [{ score: "desc" }, { upvoteCount: "desc" }, { createdAt: "asc" }, { id: "asc" }]
        : [{ createdAt: "asc" }, { id: "asc" }];
  const visibleStatus: Prisma.EntryWhereInput = input.query
    ? { status: "ACTIVE" }
    : input.includeAllHidden
      ? { status: { in: ["ACTIVE", "DELETED", "HIDDEN"] } }
      : input.hiddenAuthorId
        ? {
            OR: [
              { status: { in: ["ACTIVE", "DELETED"] } },
              { status: "HIDDEN", authorId: input.hiddenAuthorId },
            ],
          }
        : { status: { in: ["ACTIVE", "DELETED"] } };
  const where: Prisma.EntryWhereInput = {
    topicId: input.topicId,
    ...publiclyVisibleEntryWhere,
    ...visibleStatus,
    ...(input.createdAtWindow
      ? { createdAt: { gte: input.createdAtWindow.start, lte: input.createdAtWindow.end } }
      : {}),
    ...(input.query ? { normalizedBody: { contains: input.query, mode: "insensitive" } } : {}),
  };
  return Promise.all([
    transaction.entry
      .findMany({
        where,
        select: entryDetailSelect,
        orderBy,
        skip: input.skip,
        take: input.take,
      })
      .then(withNumericPublicIds),
    transaction.entry.count({ where }),
  ]);
}

export async function listBlockedAuthorIds(
  transaction: Prisma.TransactionClient,
  viewerId: string,
  authorIds: string[],
): Promise<Set<string>> {
  const blocks = await transaction.userBlock.findMany({
    where: { blockerId: viewerId, blockedId: { in: authorIds } },
    select: { blockedId: true },
  });
  return new Set(blocks.map((block) => block.blockedId));
}

export async function findVisibleEntryReferences(
  transaction: Prisma.TransactionClient,
  input: {
    normalizedTopicTitles: string[];
    entryPublicIds: number[];
    usernames: string[];
  },
) {
  const topicWhere: Prisma.TopicWhereInput = {
    status: "ACTIVE",
    OR: [
      ...(input.normalizedTopicTitles.length > 0
        ? [
            { normalizedTitle: { in: input.normalizedTopicTitles } },
            {
              aliases: {
                some: { normalizedTitle: { in: input.normalizedTopicTitles } },
              },
            },
          ]
        : []),
    ],
  };
  const [topics, entries, users] = await Promise.all([
    input.normalizedTopicTitles.length > 0
      ? transaction.topic.findMany({
          where: topicWhere,
          select: {
            publicId: true,
            slug: true,
            normalizedTitle: true,
            aliases: {
              where: { normalizedTitle: { in: input.normalizedTopicTitles } },
              select: { normalizedTitle: true },
            },
          },
        })
      : [],
    input.entryPublicIds.length > 0
      ? transaction.entry.findMany({
          where: {
            publicId: { in: input.entryPublicIds },
            status: "ACTIVE",
            topic: { status: "ACTIVE" },
            ...publiclyVisibleEntryWhere,
          },
          select: { publicId: true },
        })
      : [],
    input.usernames.length > 0
      ? transaction.user.findMany({
          where: {
            usernameNormalized: { in: input.usernames },
            status: { in: ["ACTIVE", "SUSPENDED"] },
          },
          select: { username: true, usernameNormalized: true },
        })
      : [],
  ]);
  return withNumericPublicIds({ topics, entries, users });
}
