import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@/lib/db/types";
import type * as FeedsRepository from "@/modules/feeds/repository/feeds";
import { homeSamplerTopicCandidateCount } from "@/modules/feeds/domain/feed";

const mocks = vi.hoisted(() => ({
  listScoredTopics: vi.fn(),
  listTopEntryPerTopic: vi.fn(),
}));

vi.mock("@/modules/feeds/repository/feeds", async (importOriginal) => {
  const actual = await importOriginal<typeof FeedsRepository>();
  return {
    ...actual,
    listScoredTopics: mocks.listScoredTopics,
    listTopEntryPerTopic: mocks.listTopEntryPerTopic,
  };
});

const { getHomeSampler } = await import("@/modules/feeds/application/feeds");
// `vi.mock` yukarıda depoyu casusla değiştiriyor; ham SQL'i doğrulamak için
// gerçek uygulamaya ayrıca erişiliyor.
const { listTopEntryPerTopic } = await vi.importActual<typeof FeedsRepository>(
  "@/modules/feeds/repository/feeds",
);

function topicRow(index: number, overrides: { entryCount?: number } = {}) {
  return {
    id: `00000000-0000-4000-8000-00000000t${index}`.replace("t", "1"),
    publicId: 100 + index,
    title: `başlık ${index}`,
    slug: `baslik-${index}`,
    entryCount: overrides.entryCount ?? 3,
    lastEntryAt: new Date("2026-08-19T12:00:00.000Z"),
    createdAt: new Date("2026-08-01T12:00:00.000Z"),
    activeEntryCount: 1,
    uniqueAuthorCount: 1,
    positiveVotes: 0,
    negativeVotes: 0,
    trendScore: 50 - index,
  };
}

function entryRow(topicId: string, index: number) {
  return {
    id: `00000000-0000-4000-8000-00000000e${index}`.replace("e", "2"),
    publicId: 900 + index,
    topicId,
    body: `entry gövdesi ${index}`,
    score: 7,
    createdAt: new Date("2026-08-19T11:00:00.000Z"),
    authorId: `00000000-0000-4000-8000-00000000a${index}`.replace("a", "3"),
    authorUsername: `yazar${index}`,
    authorDisplayName: `Yazar ${index}`,
    revisionCount: index === 0 ? 2 : 0,
    bookmarkCount: index,
  };
}

function transactionClient() {
  const client = {
    $transaction: vi.fn((callback: (transaction: unknown) => unknown) => callback({})),
  };
  return client as unknown as DatabaseClient;
}

describe("getHomeSampler", () => {
  it("başlık başına ayrı sorgu açmadan iki depo çağrısıyla blokları kurar", async () => {
    const topics = Array.from({ length: 12 }, (_, index) => topicRow(index));
    mocks.listScoredTopics.mockResolvedValue({ topics, totalItems: 30 });
    mocks.listTopEntryPerTopic.mockImplementation(
      (_transaction: unknown, input: { topicIds: readonly string[] }) =>
        Promise.resolve(input.topicIds.map((topicId, index) => entryRow(topicId, index))),
    );

    const blocks = await getHomeSampler(transactionClient());

    expect(blocks).toHaveLength(10);
    expect(mocks.listScoredTopics).toHaveBeenCalledTimes(1);
    expect(mocks.listTopEntryPerTopic).toHaveBeenCalledTimes(1);
    expect(mocks.listTopEntryPerTopic.mock.calls[0]?.[1].topicIds).toHaveLength(10);
  });

  it("gündem sırasını korur ve entry alanlarını sunum biçimine çevirir", async () => {
    const topics = [topicRow(0), topicRow(1)];
    mocks.listScoredTopics.mockResolvedValue({ topics, totalItems: 2 });
    // Depo `DISTINCT ON` sırasıyla döner; blok sırası başlık sırasından gelmeli.
    mocks.listTopEntryPerTopic.mockResolvedValue([
      entryRow(topics[1]!.id, 1),
      entryRow(topics[0]!.id, 0),
    ]);

    const blocks = await getHomeSampler(transactionClient(), { limit: 2 });

    expect(blocks.map((block) => block.topic.title)).toEqual(["başlık 0", "başlık 1"]);
    expect(blocks[0]?.entry).toMatchObject({
      publicId: 900,
      edited: true,
      bookmarkCount: 0,
      author: { username: "yazar0", displayName: "Yazar 0" },
      topic: { title: "başlık 0", slug: "baslik-0" },
    });
    expect(blocks[1]?.entry.edited).toBe(false);
  });

  it("görüntülenebilir entry'si olmayan başlıkları eler ve yerine sıradakini alır", async () => {
    const topics = [
      topicRow(0, { entryCount: 0 }),
      topicRow(1),
      topicRow(2, { entryCount: 0 }),
      topicRow(3),
    ];
    mocks.listScoredTopics.mockResolvedValue({ topics, totalItems: 4 });
    mocks.listTopEntryPerTopic.mockImplementation(
      (_transaction: unknown, input: { topicIds: readonly string[] }) =>
        Promise.resolve(input.topicIds.map((topicId, index) => entryRow(topicId, index))),
    );

    const blocks = await getHomeSampler(transactionClient(), { limit: 2 });

    expect(blocks.map((block) => block.topic.title)).toEqual(["başlık 1", "başlık 3"]);
    expect(mocks.listTopEntryPerTopic.mock.calls.at(-1)?.[1].topicIds).toEqual([
      topics[1]!.id,
      topics[3]!.id,
    ]);
  });

  it("aday havuzu istenen blok sayısından geniş ama gündem üst sınırını aşmıyor", () => {
    expect(homeSamplerTopicCandidateCount(10)).toBe(30);
    expect(homeSamplerTopicCandidateCount(2)).toBe(6);
    expect(homeSamplerTopicCandidateCount(20)).toBe(30);
  });
});

describe("listTopEntryPerTopic", () => {
  it("başlık listesi boşken hiç sorgu çalıştırmaz", async () => {
    const transaction = { $queryRaw: vi.fn() };

    await expect(
      listTopEntryPerTopic(transaction as unknown as Prisma.TransactionClient, { topicIds: [] }),
    ).resolves.toEqual([]);
    expect(transaction.$queryRaw).not.toHaveBeenCalled();
  });

  it("tek sorguda başlık başına en yüksek puanlı, eşitlikte en yeni entry'yi ister", async () => {
    const transaction = { $queryRaw: vi.fn().mockResolvedValue([]) };

    await listTopEntryPerTopic(transaction as unknown as Prisma.TransactionClient, {
      topicIds: ["00000000-0000-4000-8000-000000000101", "00000000-0000-4000-8000-000000000102"],
    });

    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    const statement = transaction.$queryRaw.mock.calls[0]?.[0] as { strings: string[] };
    const sql = statement.strings.join(" ").replaceAll(/\s+/gu, " ");
    expect(sql).toContain('DISTINCT ON (entry."topicId")');
    expect(sql).toContain(
      'ORDER BY entry."topicId", entry.score DESC, entry."createdAt" DESC, entry.id ASC',
    );
    // `uuid` sütununu metin parametreyle karşılaştırmak Postgres'te hata verir.
    expect(sql).toContain("::uuid[]");
  });
});
