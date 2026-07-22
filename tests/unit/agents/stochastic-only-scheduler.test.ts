import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  planRuntimeMaintenance,
  retireLegacyDailyPlanningRecords,
} from "@/modules/agents/repository/scheduler";

describe("stochastic-only scheduler", () => {
  it("queues only maintenance work and never creates daily catch-up", async () => {
    const created: Array<Record<string, unknown>> = [];
    const transaction = {
      agentProfile: {
        findFirst: vi.fn().mockResolvedValue({
          currentPersonaVersionId: "00000000-0000-4000-8000-000000000001",
          personaEvolutionEnabled: true,
          sourceEvolutionEnabled: true,
        }),
      },
      agentRun: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return {
            id: `00000000-0000-4000-8000-00000000000${created.length}`,
            agentProfileId: data.agentProfileId,
            runType: data.runType,
            queuePriority: data.queuePriority,
            runStatus: "QUEUED",
            trigger: data.trigger,
            availableAt: data.availableAt,
            desiredEntryMin: 0,
            desiredEntryMax: 0,
            parentRunId: null,
          };
        }),
      },
    } as unknown as Prisma.TransactionClient;

    const result = await planRuntimeMaintenance(transaction, {
      agentProfileId: "00000000-0000-4000-8000-000000000101",
      localDate: new Date("2026-07-19T00:00:00.000Z"),
      now: new Date("2026-07-19T02:05:00.000Z"),
      reflectionTimeoutSeconds: 600,
      sourceRefreshTimeoutSeconds: 300,
      personaEvolutionEnabled: true,
      sourceEvolutionEnabled: true,
    });

    expect(result.maintenanceQueued).toBe(3);
    expect(created.map(({ trigger }) => trigger)).toEqual([
      "NIGHTLY_MEMORY_CONSOLIDATION",
      "WEEKLY_PERSONA_REFLECTION",
      "DAILY_SOURCE_REFRESH",
    ]);
    expect(created).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ trigger: "AUTO_CATCH_UP" })]),
    );
  });

  it("cancels legacy plans and clears targets without touching actual production counters", async () => {
    const slotUpdate = vi.fn().mockResolvedValue({ count: 95 });
    const planUpdate = vi.fn().mockResolvedValue({ count: 12 });
    const runtimeUpdate = vi.fn().mockResolvedValue({ count: 12 });
    const transaction = {
      agentScheduleSlot: { updateMany: slotUpdate },
      agentDailyPlan: { updateMany: planUpdate },
      agentRuntimeState: { updateMany: runtimeUpdate },
    } as unknown as Prisma.TransactionClient;

    await expect(retireLegacyDailyPlanningRecords(transaction)).resolves.toEqual({
      cancelledSlots: 95,
      cancelledPlans: 12,
      clearedRuntimeStates: 12,
    });
    expect(slotUpdate).toHaveBeenCalledWith({
      where: { status: "PLANNED" },
      data: { status: "CANCELLED" },
    });
    expect(runtimeUpdate).toHaveBeenCalledWith({
      data: {
        todayEntryTarget: 0,
        todayTopicTarget: 0,
        todayVoteTarget: 0,
        nextScheduledAt: null,
      },
    });
  });
});
