import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { listAgentContentRecords } from "@/modules/moderation/repository/agent-content";

const createdAt = new Date("2026-07-18T10:00:00.000Z");

function transactionFixture() {
  const findMany = vi.fn().mockResolvedValue([
    {
      id: "record-1",
      createdAt,
      entry: {
        id: "entry-1",
        body: "Override ile üretilmiş agent entry metni.",
        status: "ACTIVE",
        createdAt,
        topic: { id: "topic-1", title: "Override görünürlüğü", slug: "override-gorunurlugu" },
      },
      agentProfile: {
        id: "agent-1",
        user: { username: "override_agent", displayName: "Override Agent" },
      },
      run: {
        id: "run-1",
        runType: "MANUAL",
        runStatus: "SUCCEEDED",
        createdAt,
        dailyMaximumOverride: true,
        saturationOverride: false,
        provocationOverride: true,
      },
      action: { id: "action-1", provenance: { evidenceType: "PLATFORM_EVENT" } },
    },
  ]);
  const count = vi.fn().mockResolvedValue(1);
  const transaction = {
    agentContentRecord: { findMany, count },
    report: { findMany: vi.fn().mockResolvedValue([]) },
    agentTopicWriteLock: { findMany: vi.fn().mockResolvedValue([]) },
  } as unknown as Prisma.TransactionClient;
  return { transaction, findMany, count };
}

describe("agent content override filters", () => {
  it("lists runs using any explicit override and returns all override flags", async () => {
    const { transaction, findMany, count } = transactionFixture();

    const [records, totalItems] = await listAgentContentRecords(
      transaction,
      { overrideStatus: "WITH_OVERRIDE", skip: 0, take: 20 },
      createdAt,
    );

    const overrideFilter = {
      run: {
        OR: [
          { dailyMaximumOverride: true },
          { saturationOverride: true },
          { provocationOverride: true },
        ],
      },
    };
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining(overrideFilter),
        select: expect.objectContaining({
          run: {
            select: expect.objectContaining({
              dailyMaximumOverride: true,
              saturationOverride: true,
              provocationOverride: true,
            }),
          },
        }),
      }),
    );
    expect(count).toHaveBeenCalledWith({ where: expect.objectContaining(overrideFilter) });
    expect(totalItems).toBe(1);
    expect(records[0]?.run).toMatchObject({
      dailyMaximumOverride: true,
      saturationOverride: false,
      provocationOverride: true,
    });
  });

  it("separately lists only runs with every override disabled", async () => {
    const { transaction, findMany, count } = transactionFixture();

    await listAgentContentRecords(
      transaction,
      { overrideStatus: "WITHOUT_OVERRIDE", skip: 0, take: 20 },
      createdAt,
    );

    const withoutOverrideFilter = {
      run: {
        dailyMaximumOverride: false,
        saturationOverride: false,
        provocationOverride: false,
      },
    };
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining(withoutOverrideFilter) }),
    );
    expect(count).toHaveBeenCalledWith({ where: expect.objectContaining(withoutOverrideFilter) });
  });
});
