import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { getRuntimePerceptionRecords } from "@/modules/agents/repository/runtime";

function transactionMock() {
  return {
    userBlock: { findMany: vi.fn().mockResolvedValue([]) },
    topicFollow: { findMany: vi.fn().mockResolvedValue([]) },
    userFollow: { findMany: vi.fn().mockResolvedValue([]) },
    entry: {
      findMany: vi.fn().mockResolvedValue([]),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    agentMemoryEpisode: { findMany: vi.fn().mockResolvedValue([]) },
    agentBelief: { findMany: vi.fn().mockResolvedValue([]) },
    agentRelationship: { findMany: vi.fn().mockResolvedValue([]) },
    agentSource: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    agentRuntimeState: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        todayEntryTarget: 0,
        todayPublishedEntries: 0,
        todayTopicTarget: 0,
        todayCreatedTopics: 0,
        todayVoteTarget: 0,
        todayVotes: 0,
        todaySourceReads: 0,
        nextScheduledAt: null,
      }),
    },
  };
}

const input = {
  agentProfileId: randomUUID(),
  agentUserId: randomUUID(),
  now: new Date("2026-07-18T12:00:00.000Z"),
  includeSources: true,
};

describe("runtime source fetch target selection", () => {
  it("uses the configured maximum instead of the old eight-source repository cap", async () => {
    const transaction = transactionMock();

    await getRuntimePerceptionRecords(transaction as unknown as Prisma.TransactionClient, {
      ...input,
      sourceFetchLimit: 50,
    });

    expect(transaction.agentSource.findMany).toHaveBeenCalledTimes(1);
    expect(transaction.agentSource.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });

  it("reserves the single configured target for the discovery candidate", async () => {
    const transaction = transactionMock();
    const discovery = {
      id: randomUUID(),
      url: "https://discovery.example/feed.xml",
      sourceType: "RSS",
      normalizedDomain: "discovery.example",
      status: "DISCOVERED",
      trustScore: 0.2,
      interestScore: 0.9,
      consecutiveFailures: 0,
      lastFetchedAt: null,
      topics: ["agents"],
      items: [],
    };
    transaction.agentSource.findFirst.mockResolvedValue(discovery);
    transaction.agentSource.findMany.mockResolvedValueOnce([
      {
        normalizedDomain: discovery.normalizedDomain,
        consecutiveFailures: 0,
        lastFetchedAt: null,
      },
    ]);

    const records = await getRuntimePerceptionRecords(
      transaction as unknown as Prisma.TransactionClient,
      { ...input, sourceFetchLimit: 1 },
    );

    expect(records.sources).toHaveLength(1);
    expect(records.sources[0]?.id).toBe(discovery.id);
    expect(transaction.agentSource.findMany).toHaveBeenCalledTimes(1);
    expect(transaction.agentSource.findMany).toHaveBeenCalledWith(
      expect.not.objectContaining({ take: expect.any(Number) }),
    );
  });

  it("threads the setting into perception while retaining the display list cap of eight", () => {
    const source = readFileSync("src/modules/agents/application/runtime.ts", "utf8");

    expect(source).toContain(
      "sourceFetchLimit: sourceFetchTargetLimit(run.runType, settings.sourceFetchLimit)",
    );
    expect(source).toContain("sources: records.sources.slice(0, 8)");
  });
});
