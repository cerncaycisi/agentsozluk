import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActorContext } from "@/modules/auth/domain/actor";
import {
  bulkAgentRunSchema,
  cancelAgentRun,
  changeAgentLifecycle,
  createAgent,
  createAgentSchema,
  createBulkAgentRuns,
  createManualAgentRun,
  generateAgentDailyPlans,
  lifecycleChangeSchema,
  manualAgentRunSchema,
  updateGlobalSettings,
} from "@/modules/agents";
import { calculateRuntimeCapacity } from "@/modules/agents/domain/capacity";
import { evaluateCircuitBreakers } from "@/modules/agents/domain/circuit-breaker";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import { createTopicWithFirstEntry } from "@/modules/topics";
import { AgentRuntimeWorker } from "@/runtime/worker";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "../integration/database";
import { FakeCodexProvider, InProcessRuntimeControlPlane } from "./runtime-harness";

const localDate = new Date("2026-07-16T00:00:00.000Z");

async function createAdmin() {
  const suffix = randomUUID().replaceAll("-", "");
  return integrationDatabase.user.create({
    data: {
      kind: "HUMAN",
      role: "ADMIN",
      status: "ACTIVE",
      email: `simulation-admin-${suffix}@integration.test`,
      emailNormalized: `simulation-admin-${suffix}@integration.test`,
      username: `simulation_${suffix.slice(0, 16)}`,
      usernameNormalized: `simulation_${suffix.slice(0, 16)}`,
      displayName: "Simulation admin",
      passwordHash: "not-used",
      termsVersion: "1.0",
      termsAcceptedAt: new Date(),
    },
  });
}

function actor(adminId: string): ActorContext {
  return {
    actorId: adminId,
    actorKind: "HUMAN",
    actorRole: "ADMIN",
    requestId: randomUUID(),
    origin: "API",
  };
}

function rollingCount(instants: Date[], end: Date, windowMs: number): number {
  return instants.filter(
    (instant) => instant.getTime() <= end.getTime() && instant.getTime() > end.getTime() - windowMs,
  ).length;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-07-15T20:00:00.000Z"));
  await resetIntegrationDatabase();
});

afterAll(async () => {
  vi.useRealTimers();
  await closeIntegrationDatabase();
});

describe("accelerated 24-hour agent society simulation", () => {
  it("publishes 150-200 safe entries through the production scheduler and runtime services", async () => {
    const admin = await createAdmin();
    const topics = [];
    for (let index = 0; index < 30; index += 1)
      topics.push(
        await createTopicWithFirstEntry(integrationDatabase, actor(admin.id), {
          title: `Simülasyon topic ${index + 1} ${randomUUID().slice(0, 8)}`,
          entryBody: `Simülasyon perception girdisi ${index + 1} için yeterince uzun insan entry metni.`,
        }),
      );

    const createdAgents = [];
    for (const persona of originalPersonaPack.personas) {
      const created = await createAgent(
        integrationDatabase,
        actor(admin.id),
        createAgentSchema.parse({ persona, lifecycleStatus: "PAUSED" }),
      );
      createdAgents.push(created);
    }
    await updateGlobalSettings(integrationDatabase, actor(admin.id), {
      defaultDailyEntryMin: 15,
      defaultDailyEntryMax: 20,
      globalDailyEntryMin: 150,
      globalDailyEntryMax: 200,
      codexConcurrency: 1,
    });
    for (const created of createdAgents)
      await changeAgentLifecycle(
        integrationDatabase,
        actor(admin.id),
        created.agent.profile.id,
        lifecycleChangeSchema.parse({
          status: "ACTIVE",
          reason: "Accelerated full-day simulation activation.",
        }),
      );

    const firstPlan = await generateAgentDailyPlans(integrationDatabase, actor(admin.id), {
      localDate,
    });
    expect(firstPlan.createdPlans).toBe(10);
    const initialSlotCount = await integrationDatabase.agentScheduleSlot.count();
    const replay = await generateAgentDailyPlans(integrationDatabase, actor(admin.id), {
      localDate,
    });
    expect(replay).toMatchObject({ createdPlans: 0, existingPlans: 10 });
    expect(await integrationDatabase.agentScheduleSlot.count()).toBe(initialSlotCount);

    const bulk = await createBulkAgentRuns(
      integrationDatabase,
      actor(admin.id),
      bulkAgentRunSchema.parse({
        allActive: true,
        run: { runType: "DRY_RUN", entryTarget: 0, priority: "NORMAL" },
        confirmation: "RUN_ALL_ACTIVE_AGENTS",
      }),
    );
    expect(bulk.count).toBe(10);
    expect(await integrationDatabase.agentScheduleSlot.count()).toBe(initialSlotCount);
    for (const run of bulk.runs)
      await cancelAgentRun(integrationDatabase, actor(admin.id), run.id, {
        reason: "Simulation bulk isolation assertion completed.",
      });

    const plans = await integrationDatabase.agentDailyPlan.findMany({
      where: { localDate },
      include: { slots: { orderBy: { scheduledAt: "asc" } } },
      orderBy: { agentProfileId: "asc" },
    });
    expect(plans).toHaveLength(10);
    expect(plans.every(({ slots }) => slots.length >= 6 && slots.length <= 8)).toBe(true);
    expect(plans.reduce((sum, plan) => sum + plan.entryTarget, 0)).toBeGreaterThanOrEqual(150);
    expect(plans.reduce((sum, plan) => sum + plan.entryTarget, 0)).toBeLessThanOrEqual(200);

    const provider = new FakeCodexProvider();
    const worker = new AgentRuntimeWorker({
      workerId: "simulation-worker",
      credentials: createdAgents.map(({ credential }) => credential),
      controlPlane: new InProcessRuntimeControlPlane(integrationDatabase),
      provider,
      heartbeatIntervalMs: 60_000,
      pollIntervalMs: 1000,
    });
    const scheduledInstants = [
      ...new Set(
        plans.flatMap(({ slots }) => slots.map(({ scheduledAt }) => scheduledAt.getTime())),
      ),
    ].sort((left, right) => left - right);
    for (const instant of scheduledInstants) {
      const simulatedAt = new Date(instant + 60_000);
      vi.setSystemTime(simulatedAt);
      await worker.runOnce();
      const completedRuns = await integrationDatabase.agentRun.findMany({
        where: {
          runType: "SCHEDULED_WAKE",
          runStatus: { in: ["SUCCEEDED", "PARTIAL"] },
          scheduleSlot: { scheduledAt: { lte: simulatedAt } },
        },
        select: { id: true, scheduleSlot: { select: { scheduledAt: true } } },
      });
      for (const run of completedRuns) {
        const timestamp = run.scheduleSlot!.scheduledAt;
        const content = await integrationDatabase.agentContentRecord.findMany({
          where: { runId: run.id },
          select: { id: true, entryId: true },
        });
        await integrationDatabase.agentContentRecord.updateMany({
          where: { id: { in: content.map(({ id }) => id) } },
          data: { createdAt: timestamp },
        });
        await integrationDatabase.entry.updateMany({
          where: { id: { in: content.map(({ entryId }) => entryId) } },
          data: { createdAt: timestamp },
        });
      }
    }

    const content = await integrationDatabase.agentContentRecord.findMany({
      include: { entry: { select: { normalizedBody: true, createdAt: true, topicId: true } } },
      orderBy: { createdAt: "asc" },
    });
    const byAgent = new Map<string, typeof content>();
    for (const record of content)
      byAgent.set(record.agentProfileId, [...(byAgent.get(record.agentProfileId) ?? []), record]);
    expect(byAgent.size).toBe(10);
    for (const records of byAgent.values()) {
      expect(records.length).toBeGreaterThanOrEqual(15);
      expect(records.length).toBeLessThanOrEqual(20);
      const instants = records.map(({ entry }) => entry.createdAt);
      for (const instant of instants) {
        expect(rollingCount(instants, instant, 60 * 60_000)).toBeLessThanOrEqual(4);
        expect(rollingCount(instants, instant, 3 * 60 * 60_000)).toBeLessThanOrEqual(9);
      }
    }
    expect(content.length).toBeGreaterThanOrEqual(150);
    expect(content.length).toBeLessThanOrEqual(200);
    expect(new Set(content.map(({ entry }) => entry.normalizedBody)).size).toBe(content.length);
    expect(
      content.filter(({ entry }) => {
        const hour = (entry.createdAt.getUTCHours() + 3) % 24;
        return hour >= 7 && hour < 23;
      }).length,
    ).toBeGreaterThan(content.length / 2);

    vi.setSystemTime(new Date("2026-07-17T09:00:00.000Z"));
    const saturatedTopicId = topics[0]!.topic.id;
    await integrationDatabase.entry.createMany({
      data: Array.from({ length: 15 }, (_, index) => ({
        topicId: saturatedTopicId,
        authorId: admin.id,
        body: `Saturation fixture ${index + 1} için benzersiz insan entry içeriği.`,
        normalizedBody: `saturation fixture ${index + 1} için benzersiz insan entry içeriği.`,
        status: "ACTIVE",
        origin: "WEB",
        createdAt: new Date(Date.now() - index * 1000),
      })),
    });
    provider.forceNextTopic(saturatedTopicId);
    const saturationRun = await createManualAgentRun(
      integrationDatabase,
      actor(admin.id),
      createdAgents[0]!.agent.profile.id,
      manualAgentRunSchema.parse({
        runType: "NORMAL_WAKE",
        entryTarget: 1,
        priority: "EMERGENCY",
        dailyMaximumOverride: true,
      }),
    );
    await worker.runOnce();
    expect(
      await integrationDatabase.agentAction.findFirstOrThrow({
        where: { runId: saturationRun.id },
      }),
    ).toMatchObject({ actionStatus: "REJECTED", rejectionCode: "TOPIC_SATURATED" });

    const longRunCapacity = calculateRuntimeCapacity({
      capability: {
        codexVersion: "fake-codex-simulation-1",
        promptProfileHash: "simulation-v1",
        benchmarkRunCount: 10,
        p50DurationMs: 600_000,
        p75DurationMs: 900_000,
        p95DurationMs: 1_200_000,
        maxDurationMs: 1_500_000,
        dualConcurrencySupported: false,
        availableMemoryMb: 1024,
        capacityStatus: "AT_RISK",
        measuredAt: new Date(),
        staleAt: new Date(Date.now() + 86_400_000),
      },
      plannedRuns: initialSlotCount,
      completedRuns: 0,
      estimatedPublishedMin: 150,
      estimatedPublishedMax: 200,
      configuredConcurrency: 1,
      degradedMode: false,
      now: new Date(),
    });
    expect(["AT_RISK", "OVERLOADED"]).toContain(longRunCapacity.capacityStatus);
    expect(
      evaluateCircuitBreakers(
        {
          errorRateWindowMinutes: 15,
          errorRateThreshold: 0.5,
          consecutiveCodexFailures: 5,
          duplicateWindowSize: 50,
          duplicateThreshold: 0.4,
          duplicateCooldownMinutes: 60,
          utilizationWindowMinutes: 120,
          utilizationThreshold: 0.9,
        },
        {
          terminalRunsInErrorWindow: 10,
          failedRunsInErrorWindow: 0,
          consecutiveCodexFailures: 0,
          duplicateCandidateCount: 50,
          duplicateRejectionCount: 0,
          utilization15m: 0.95,
          utilization1h: 0.95,
          utilization2h: 0.95,
          oldestQueuedAt: new Date(),
          longestActiveStartedAt: null,
        },
      ).catchUpFrozen,
    ).toBe(true);
  }, 180_000);
});
