import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inTransaction } from "@/lib/db/transaction";
import type { ActorContext } from "@/modules/auth/domain/actor";
import {
  bulkAgentRunSchema,
  cancelAgentRun,
  changeAgentLifecycle,
  circuitBreakerConfigSchema,
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
import { getRuntimeOperationalMetrics } from "@/modules/agents/repository/capacity";
import { claimNextRuntimeRun, getRuntimeGlobalSettings } from "@/modules/agents/repository/runtime";
import { planRuntimeMaintenanceAndCatchUp } from "@/modules/agents/repository/scheduler";
import { createTopicWithFirstEntry } from "@/modules/topics";
import { AgentRuntimeWorker } from "@/runtime/worker";
import { RUNTIME_PROMPT_PROFILE_HASH } from "@/runtime/prompt-profile";
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
    const benchmarkObservedAt = new Date();
    await integrationDatabase.agentRuntimeCapability.create({
      data: {
        codexVersion: "fake-codex-simulation-1.0.0",
        promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
        benchmarkRunCount: 10,
        p50DurationMs: 120_000,
        p75DurationMs: 180_000,
        p95DurationMs: 240_000,
        maxDurationMs: 300_000,
        singleProcessPeakRssMb: 400,
        dualProcessPeakRssMb: null,
        dualConcurrencySupported: false,
        appLatencyImpact: { baselineP95Ms: 50, measuredP95Ms: 55, stable: true },
        databaseLatencyImpact: { baselineP95Ms: 10, measuredP95Ms: 12, stable: true },
        availableMemoryMb: 900,
        capacityStatus: "HEALTHY",
        measuredAt: benchmarkObservedAt,
        staleAt: new Date(benchmarkObservedAt.getTime() + 14 * 24 * 60 * 60_000),
      },
    });
    await integrationDatabase.agentRuntimeEvent.create({
      data: {
        eventType: "agent.capacity.measured",
        safeMessage: "Simulation benchmark fingerprint observed.",
        metadata: {
          codexVersion: "fake-codex-simulation-1.0.0",
          promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
        },
        createdAt: benchmarkObservedAt,
      },
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
    const alignedRunIds = new Set<string>();
    const alignCompletedContentTimestamps = async (simulatedAt: Date) => {
      const completedRuns = await integrationDatabase.agentRun.findMany({
        where: {
          runStatus: { in: ["SUCCEEDED", "PARTIAL"] },
          availableAt: { lte: simulatedAt },
        },
        select: {
          id: true,
          availableAt: true,
          scheduleSlot: { select: { scheduledAt: true } },
        },
      });
      for (const run of completedRuns) {
        if (alignedRunIds.has(run.id)) continue;
        const timestamp = run.scheduleSlot?.scheduledAt ?? run.availableAt;
        const records = await integrationDatabase.agentContentRecord.findMany({
          where: { runId: run.id },
          select: { id: true, entryId: true },
        });
        await integrationDatabase.agentContentRecord.updateMany({
          where: { id: { in: records.map(({ id }) => id) } },
          data: { createdAt: timestamp },
        });
        await integrationDatabase.entry.updateMany({
          where: { id: { in: records.map(({ entryId }) => entryId) } },
          data: { createdAt: timestamp },
        });
        alignedRunIds.add(run.id);
      }
    };
    for (const instant of scheduledInstants) {
      const simulatedAt = new Date(instant + 60_000);
      vi.setSystemTime(simulatedAt);
      // Production polls again immediately after productive work. Drain every
      // leaseable run at this simulated instant so coincident slots still obey
      // the database-authoritative global concurrency cap without starving a
      // later credential in the accelerated clock.
      for (;;) {
        const processed = await worker.runOnce();
        await alignCompletedContentTimestamps(simulatedAt);
        if (processed === 0) break;
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
    provider.forceTopicForRun(saturationRun.run!.id, saturatedTopicId);
    let saturationAction = await integrationDatabase.agentAction.findFirst({
      where: { runId: saturationRun.run!.id },
    });
    for (let attempt = 0; attempt < 25 && !saturationAction; attempt += 1) {
      await worker.runOnce();
      saturationAction = await integrationDatabase.agentAction.findFirst({
        where: { runId: saturationRun.run!.id },
      });
    }
    expect(saturationAction).toMatchObject({
      actionStatus: "REJECTED",
      targetId: saturatedTopicId,
    });
    expect(["TOPIC_SATURATED", "TOPIC_SATURATED_60M"]).toContain(saturationAction?.rejectionCode);

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
          configuredWindowUtilization: 0.95,
          oldestQueuedAt: new Date(),
          longestActiveStartedAt: null,
        },
      ).catchUpFrozen,
    ).toBe(true);

    const fullQueueNow = new Date("2026-07-18T09:00:00.000Z");
    const fullQueueLocalDate = new Date("2026-07-18T00:00:00.000Z");
    vi.setSystemTime(fullQueueNow);
    const fullQueueAgent = createdAgents[0]!;
    await integrationDatabase.agentRuntimeState.update({
      where: { agentProfileId: fullQueueAgent.agent.profile.id },
      data: {
        todayDate: fullQueueLocalDate,
        todayEntryTarget: 20,
        todayPublishedEntries: 0,
      },
    });
    const highUtilizationStartedAt = new Date(fullQueueNow.getTime() - 110 * 60_000);
    await integrationDatabase.agentRun.create({
      data: {
        agentProfileId: fullQueueAgent.agent.profile.id,
        personaVersionId: fullQueueAgent.agent.personaVersion.id,
        runType: "NORMAL_WAKE",
        runStatus: "SUCCEEDED",
        queuePriority: "SCHEDULED_CONTENT",
        trigger: "SIMULATION_FULL_QUEUE_UTILIZATION",
        idempotencyKey: randomUUID(),
        timeoutSeconds: 900,
        desiredEntryMin: 1,
        desiredEntryMax: 2,
        startedAt: highUtilizationStartedAt,
        finishedAt: fullQueueNow,
        usageMetadata: {
          durationMs: 110 * 60_000,
          provider: "codex-cli",
          codexIntervals: [
            {
              startedAt: highUtilizationStartedAt.toISOString(),
              finishedAt: fullQueueNow.toISOString(),
              durationMs: 110 * 60_000,
            },
          ],
        },
      },
    });
    const fullQueueRuns = await Promise.all(
      ["AUTO_CATCH_UP", "SIMULATION_QUEUE_FILL_A", "SIMULATION_QUEUE_FILL_B"].map(
        (trigger, index) =>
          integrationDatabase.agentRun.create({
            data: {
              agentProfileId: fullQueueAgent.agent.profile.id,
              personaVersionId: fullQueueAgent.agent.personaVersion.id,
              runType: index === 0 ? "DAILY_CATCH_UP" : "NORMAL_WAKE",
              queuePriority: index === 0 ? "DAILY_CATCH_UP" : "SCHEDULED_CONTENT",
              trigger,
              idempotencyKey: randomUUID(),
              timeoutSeconds: 360,
              desiredEntryMin: 1,
              desiredEntryMax: index === 0 ? 4 : 2,
              availableAt: fullQueueNow,
              createdAt: fullQueueNow,
            },
          }),
      ),
    );
    const queuedCatchUp = fullQueueRuns[0]!;
    const fullQueueResult = await inTransaction(integrationDatabase, async (transaction) => {
      const settings = await getRuntimeGlobalSettings(transaction);
      const config = circuitBreakerConfigSchema.parse(settings.circuitBreakerConfig);
      const operational = await getRuntimeOperationalMetrics(transaction, {
        now: fullQueueNow,
        concurrency: 1,
        config,
      });
      const breakers = evaluateCircuitBreakers(config, operational);
      const eligibleQueueBefore = await transaction.agentRun.count({
        where: {
          runStatus: "QUEUED",
          runType: { notIn: ["READ_ONLY", "DRY_RUN", "REFLECTION", "SOURCE_REFRESH"] },
        },
      });
      const autoCatchUpBefore = await transaction.agentRun.count({
        where: { agentProfileId: fullQueueAgent.agent.profile.id, trigger: "AUTO_CATCH_UP" },
      });
      const planned = await planRuntimeMaintenanceAndCatchUp(transaction, {
        agentProfileId: fullQueueAgent.agent.profile.id,
        localDate: fullQueueLocalDate,
        now: fullQueueNow,
        catchUpFrozen: breakers.catchUpFrozen,
        concurrency: 1,
        scheduledTimeoutSeconds: settings.scheduledTimeoutSeconds,
        reflectionTimeoutSeconds: settings.reflectionTimeoutSeconds,
        sourceRefreshTimeoutSeconds: settings.sourceRefreshTimeoutSeconds,
        personaEvolutionEnabled: settings.personaEvolutionEnabled,
        sourceEvolutionEnabled: settings.sourceEvolutionEnabled,
      });
      const autoCatchUpAfter = await transaction.agentRun.count({
        where: { agentProfileId: fullQueueAgent.agent.profile.id, trigger: "AUTO_CATCH_UP" },
      });
      await transaction.agentRun.updateMany({
        where: {
          agentProfileId: fullQueueAgent.agent.profile.id,
          trigger: { not: "AUTO_CATCH_UP" },
          runStatus: "QUEUED",
        },
        data: { runStatus: "CANCELLED", finishedAt: fullQueueNow },
      });
      const claimed = await claimNextRuntimeRun(transaction, {
        agentProfileId: fullQueueAgent.agent.profile.id,
        workerId: "simulation-full-queue-worker",
        leaseSeconds: 60,
        maxRetryCount: settings.maxRetryCount,
        writeRunsPaused: breakers.writeRunsPaused,
        catchUpFrozen: breakers.catchUpFrozen,
        contentSlowdownMinutes: 0,
        now: fullQueueNow,
      });
      return {
        operational,
        breakers,
        eligibleQueueBefore,
        autoCatchUpBefore,
        planned,
        autoCatchUpAfter,
        claimed,
      };
    });
    expect(fullQueueResult.operational.utilization2h).toBeGreaterThan(0.9);
    expect(fullQueueResult.breakers.catchUpFrozen).toBe(true);
    expect(fullQueueResult.eligibleQueueBefore).toBeGreaterThanOrEqual(3);
    expect(fullQueueResult.planned.catchUpQueued).toBe(0);
    expect(fullQueueResult.autoCatchUpAfter).toBe(fullQueueResult.autoCatchUpBefore);
    expect(fullQueueResult.claimed).toBeNull();
    await expect(
      integrationDatabase.agentRun.findUniqueOrThrow({ where: { id: queuedCatchUp.id } }),
    ).resolves.toMatchObject({ runStatus: "QUEUED", leaseOwner: null });
  }, 180_000);
});
