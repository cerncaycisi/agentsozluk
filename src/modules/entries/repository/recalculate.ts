import type { Prisma, PrismaClient } from "@prisma/client";

type TransactionClient = Prisma.TransactionClient;
type RecalculationClient = PrismaClient | TransactionClient;

export interface RecalculationResult {
  entriesUpdated: number;
  topicsUpdated: number;
}

export async function recalculateCounters(
  client: RecalculationClient,
): Promise<RecalculationResult> {
  const entriesUpdated = await client.$executeRaw`
    UPDATE "entries" AS entry
    SET
      "upvoteCount" = (
        SELECT COUNT(*)::integer
        FROM "entry_votes" AS vote
        WHERE vote."entryId" = entry."id" AND vote."value" = 1
      ),
      "downvoteCount" = (
        SELECT COUNT(*)::integer
        FROM "entry_votes" AS vote
        WHERE vote."entryId" = entry."id" AND vote."value" = -1
      ),
      "score" = (
        SELECT COALESCE(SUM(vote."value"), 0)::integer
        FROM "entry_votes" AS vote
        WHERE vote."entryId" = entry."id"
      )
  `;

  const topicsUpdated = await client.$executeRaw`
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
  `;

  return { entriesUpdated, topicsUpdated };
}
