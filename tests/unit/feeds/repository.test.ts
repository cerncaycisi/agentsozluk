import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { getTopicFeed } from "@/modules/feeds/application/feeds";
import { listChronologicalTopics, listScoredTopics } from "@/modules/feeds/repository/feeds";
import type { DatabaseClient } from "@/lib/db/types";

function emptyPageTransaction(total: number) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([
      {
        id: null,
        title: null,
        slug: null,
        entryCount: null,
        lastEntryAt: null,
        createdAt: null,
        activeEntryCount: null,
        uniqueAuthorCount: null,
        positiveVotes: null,
        negativeVotes: null,
        trendScore: null,
        totalItems: total,
      },
    ]),
  };
}

describe("feed repository pagination", () => {
  it("returns scored rows and their count from one snapshot even when LIMIT 0 is empty", async () => {
    const transaction = emptyPageTransaction(7);

    await expect(
      listScoredTopics(transaction as unknown as Prisma.TransactionClient, {
        windowStart: new Date("2026-07-16T12:00:00.000Z"),
        now: new Date("2026-07-17T12:00:00.000Z"),
        skip: 30,
        take: 0,
      }),
    ).resolves.toEqual({ topics: [], totalItems: 7 });
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("returns chronological rows and their count from one snapshot", async () => {
    const transaction = emptyPageTransaction(7);

    await expect(
      listChronologicalTopics(transaction as unknown as Prisma.TransactionClient, {
        mode: "new",
        skip: 30,
        take: 0,
      }),
    ).resolves.toEqual({ topics: [], totalItems: 7 });
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it.each(["trending", "new"] as const)(
    "returns the measured %s total instead of the 30-item cap for an out-of-range page",
    async (feed) => {
      const transaction = emptyPageTransaction(7);
      const client = {
        $transaction: vi.fn((callback: (value: Prisma.TransactionClient) => Promise<unknown>) =>
          callback(transaction as unknown as Prisma.TransactionClient),
        ),
      } as unknown as DatabaseClient;

      await expect(
        getTopicFeed(client, {
          feed,
          page: 3,
          pageSize: 20,
          skip: 40,
          now: new Date("2026-07-17T12:00:00.000Z"),
        }),
      ).resolves.toEqual({ topics: [], totalItems: 7 });
    },
  );
});
