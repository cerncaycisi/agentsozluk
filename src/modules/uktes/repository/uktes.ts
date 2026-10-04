import { Prisma } from "@prisma/client";
import type { DatabaseExecutor, TransactionClient } from "@/lib/db/types";

export const uktePageSize = 25;
export const findUkteActor = (tx: TransactionClient, id: string) =>
  tx.user.findUnique({
    where: { id },
    select: { id: true, kind: true, status: true, role: true, writerApproved: true },
  });
export const findUkte = (tx: DatabaseExecutor, id: string) =>
  tx.ukteRequest.findUnique({ where: { id } });
export const findOpenUkte = (tx: TransactionClient, normalizedTitle: string) =>
  tx.ukteRequest.findFirst({ where: { normalizedTitle, status: "OPEN" } });
export const findHiddenUkte = (tx: TransactionClient, normalizedTitle: string) =>
  tx.ukteRequest.findFirst({ where: { normalizedTitle, status: "HIDDEN" }, select: { id: true } });
export const createUkteRecord = (
  tx: TransactionClient,
  input: {
    title: string;
    normalizedTitle: string;
    targetKeys: string[];
    slug: string;
    requestedById: string;
    now: Date;
  },
) =>
  tx.ukteRequest.create({
    data: {
      title: input.title,
      normalizedTitle: input.normalizedTitle,
      targetKeys: input.targetKeys,
      slug: input.slug,
      requestedById: input.requestedById,
      createdAt: input.now,
    },
  });
export const updateUkteStatus = (
  tx: TransactionClient,
  input: {
    id: string;
    version: number;
    from: "OPEN" | "HIDDEN";
    to: "OPEN" | "HIDDEN" | "WITHDRAWN";
    now: Date;
  },
) =>
  tx.ukteRequest.updateMany({
    where: { id: input.id, version: input.version, status: input.from },
    data: {
      status: input.to,
      version: { increment: 1 },
      closedAt: input.to === "OPEN" ? null : input.now,
    },
  });

// Her durumdaki başlık/alias engeldir. Gizli bir başlığın varlığı yanıtla açıklanmaz.
export async function ukteTargetUnavailable(
  tx: TransactionClient,
  targetKeys: string[],
  slug: string,
) {
  return Boolean(
    await tx.topic.findFirst({
      where: {
        OR: [
          { normalizedTitle: { in: targetKeys } },
          { aliases: { some: { normalizedTitle: { in: targetKeys } } } },
          ...(slug ? [{ slug }] : []),
        ],
      },
      select: { id: true },
    }),
  );
}

// Oluşmuş/gizlenmiş/birleşmiş başlık hiçbir zaman açık ukte diye yeniden yayımlanmaz.
// Kaynak satırları bu liste okunurken değiştirilmez; GET yan etkisizdir.
const openPublicUkte = Prisma.sql`
  u."status" = 'OPEN'
  AND NOT EXISTS (SELECT 1 FROM "topics" t WHERE t."normalizedTitle" = ANY(u."targetKeys"))
  AND NOT EXISTS (SELECT 1 FROM "topic_aliases" a WHERE a."normalizedTitle" = ANY(u."targetKeys"))
  AND NOT EXISTS (SELECT 1 FROM "topics" t WHERE u."slug" <> '' AND t."slug" = u."slug")
`;
export interface UkteListRecord {
  id: string;
  title: string;
  requestedById: string;
  status: "OPEN" | "HIDDEN" | "WITHDRAWN";
  version: number;
  createdAt: Date;
}
export async function listUkteRecords(
  tx: TransactionClient,
  input: {
    before?: string | undefined;
    adminStatus?: "OPEN" | "HIDDEN" | undefined;
  },
) {
  const cursor = input.before
    ? await tx.ukteRequest.findUnique({
        where: { id: input.before },
        select: { id: true, createdAt: true },
      })
    : null;
  if (input.before && !cursor) return [];
  return tx.$queryRaw<UkteListRecord[]>`
    SELECT u."id", u."title", u."requestedById", u."status", u."version", u."createdAt"
    FROM "ukte_requests" u
    WHERE ${input.adminStatus ? Prisma.sql`u."status" = ${input.adminStatus}::"UkteStatus"` : openPublicUkte}
    ${cursor ? Prisma.sql`AND (u."createdAt", u."id") < (${cursor.createdAt}, ${cursor.id}::UUID)` : Prisma.empty}
    ORDER BY u."createdAt" DESC, u."id" DESC LIMIT ${uktePageSize + 1}
  `;
}
