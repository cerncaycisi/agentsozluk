import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inTransaction } from "@/lib/db/transaction";
import type { ActorContext } from "@/modules/auth/domain/actor";
import {
  authenticateRuntimeRequest,
  changeAgentLifecycle,
  bulkAgentRunPreviewSchema,
  bulkAgentRunSchema,
  cancelAgentRun,
  circuitBreakerConfigSchema,
  createAgent,
  createBulkAgentRuns,
  createAgentSchema,
  createManualAgentRun,
  evaluateCircuitBreakers,
  generateAgentDailyPlans,
  getAgentRunDetail,
  lifecycleChangeSchema,
  leaseRuntimeRun,
  listAgentRuns,
  manualAgentRunSchema,
  previewBulkAgentRun,
  regenerateRemainingAgentDailyPlans,
  retryAgentRun,
  updateGlobalSettings,
} from "@/modules/agents";
import { getRuntimeOperationalMetrics } from "@/modules/agents/repository/capacity";
import {
  claimNextRuntimeRun,
  finishRuntimeRunRecord,
  getRuntimeGlobalSettings,
} from "@/modules/agents/repository/runtime";
import {
  dispatchDueScheduleSlots,
  planRuntimeMaintenanceAndCatchUp,
} from "@/modules/agents/repository/scheduler";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import { RUNTIME_PROMPT_PROFILE_HASH } from "@/runtime/prompt-profile";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

async function createAdmin() {
  const suffix = randomUUID().replaceAll("-", "");
  return integrationDatabase.user.create({
    data: {
      kind: "HUMAN",
      role: "ADMIN",
      status: "ACTIVE",
      email: `scheduler-admin-${suffix}@integration.test`,
      emailNormalized: `scheduler-admin-${suffix}@integration.test`,
      username: `scheduler_${suffix.slice(0, 16)}`,
      usernameNormalized: `scheduler_${suffix.slice(0, 16)}`,
      displayName: "Scheduler admin",
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

async function createCapacityBenchmark(
  now: Date,
  input: {
    p75DurationMs?: number;
    codexVersion?: string;
    observedCodexVersion?: string;
    promptProfileHash?: string;
    dualConcurrencySupported?: boolean;
    availableMemoryMb?: number;
  } = {},
) {
  const p75DurationMs = input.p75DurationMs ?? 180_000;
  const capability = await integrationDatabase.agentRuntimeCapability.create({
    data: {
      codexVersion: input.codexVersion ?? "codex-cli 2.4.0",
      promptProfileHash: input.promptProfileHash ?? RUNTIME_PROMPT_PROFILE_HASH,
      benchmarkRunCount: 10,
      p50DurationMs: Math.min(120_000, p75DurationMs),
      p75DurationMs,
      p95DurationMs: Math.max(p75DurationMs, 240_000),
      maxDurationMs: Math.max(p75DurationMs, 300_000),
      singleProcessPeakRssMb: 400,
      dualProcessPeakRssMb: 700,
      dualConcurrencySupported: input.dualConcurrencySupported ?? false,
      appLatencyImpact: { baselineP95Ms: 50, measuredP95Ms: 55, stable: true },
      databaseLatencyImpact: { baselineP95Ms: 10, measuredP95Ms: 12, stable: true },
      availableMemoryMb: input.availableMemoryMb ?? 900,
      capacityStatus: "HEALTHY",
      measuredAt: now,
      staleAt: new Date(now.getTime() + 14 * 24 * 60 * 60_000),
    },
  });
  await integrationDatabase.agentRuntimeEvent.create({
    data: {
      eventType: "agent.capacity.measured",
      safeMessage: "Integration benchmark fingerprint observed.",
      metadata: {
        codexVersion: input.observedCodexVersion ?? capability.codexVersion,
        promptProfileHash: capability.promptProfileHash,
      },
      createdAt: now,
    },
  });
  return capability;
}

async function createActiveAgents(
  adminId: string,
  count: number,
  settings: { degradedMode?: boolean; codexConcurrency?: 1 | 2 } = {},
) {
  const agents = [];
  for (const persona of originalPersonaPack.personas.slice(0, count)) {
    agents.push(
      await createAgent(integrationDatabase, actor(adminId), createAgentSchema.parse({ persona })),
    );
  }
  await updateGlobalSettings(integrationDatabase, actor(adminId), {
    defaultDailyEntryMin: 20,
    defaultDailyEntryMax: 20,
    globalDailyEntryMin: count * 20,
    globalDailyEntryMax: count * 20,
    ...(settings.degradedMode !== undefined ? { degradedMode: settings.degradedMode } : {}),
    ...(settings.codexConcurrency !== undefined
      ? { codexConcurrency: settings.codexConcurrency }
      : {}),
  });
  for (const created of agents) {
    await changeAgentLifecycle(
      integrationDatabase,
      actor(adminId),
      created.agent.profile.id,
      lifecycleChangeSchema.parse({
        status: "ACTIVE",
        reason: "Activate capacity-aware scheduler integration fixture.",
      }),
    );
  }
  return agents;
}

beforeEach(resetIntegrationDatabase);
afterAll(closeIntegrationDatabase);

describe("agent daily scheduler with PostgreSQL", () => {
  it("creates deterministic idempotent plans after capacity evaluation", async () => {
    const admin = await createAdmin();
    const planningNow = new Date("2026-07-18T00:05:00.000Z");
    await createCapacityBenchmark(planningNow);
    const agents = await Promise.all(
      originalPersonaPack.personas
        .slice(0, 2)
        .map((persona) =>
          createAgent(integrationDatabase, actor(admin.id), createAgentSchema.parse({ persona })),
        ),
    );
    await updateGlobalSettings(integrationDatabase, actor(admin.id), {
      globalDailyEntryMin: 30,
      globalDailyEntryMax: 40,
      indexingMode: "NOINDEX_ALL_DYNAMIC",
    });
    for (const created of agents) {
      await changeAgentLifecycle(
        integrationDatabase,
        actor(admin.id),
        created.agent.profile.id,
        lifecycleChangeSchema.parse({
          status: "ACTIVE",
          reason: "Activate deterministic scheduler integration fixture.",
        }),
      );
    }
    const localDate = new Date("2026-07-18T00:00:00.000Z");
    const schedulingActor = actor(admin.id);
    const [first, replay] = await Promise.all([
      generateAgentDailyPlans(integrationDatabase, schedulingActor, { localDate }, planningNow),
      generateAgentDailyPlans(integrationDatabase, schedulingActor, { localDate }, planningNow),
    ]);
    expect(first.createdPlans + replay.createdPlans).toBe(2);
    expect(await integrationDatabase.agentDailyPlan.count({ where: { localDate } })).toBe(2);
    expect(await integrationDatabase.agentCapacitySnapshot.count({ where: { localDate } })).toBe(1);
    const plans = await integrationDatabase.agentDailyPlan.findMany({
      where: { localDate },
      include: { slots: { orderBy: { scheduledAt: "asc" } } },
    });
    for (const plan of plans) {
      expect(plan.entryTarget).toBeGreaterThanOrEqual(15);
      expect(plan.entryTarget).toBeLessThanOrEqual(20);
      expect(plan.slots.length).toBeGreaterThanOrEqual(6);
      expect(plan.slots.length).toBeLessThanOrEqual(8);
      expect(
        plan.slots.every(
          (slot, index) =>
            index === 0 ||
            slot.scheduledAt.getTime() - plan.slots[index - 1]!.scheduledAt.getTime() >=
              20 * 60_000,
        ),
      ).toBe(true);
    }
    expect(
      await integrationDatabase.agentRuntimeState.count({
        where: { todayDate: localDate, todayEntryTarget: { gte: 15, lte: 20 } },
      }),
    ).toBe(2);
    expect(
      await integrationDatabase.auditLog.count({ where: { action: "agent.schedule.generated" } }),
    ).toBe(1);
    const generationAudit = await integrationDatabase.auditLog.findFirstOrThrow({
      where: { action: "agent.schedule.generated" },
    });
    expect(generationAudit).toMatchObject({
      actorId: schedulingActor.actorId,
      requestId: schedulingActor.requestId,
      createdAt: expect.any(Date),
    });
    expect(generationAudit.metadata).toMatchObject({
      actorKind: "HUMAN",
      before: { existingPlans: 0, plannedRuns: 0 },
      after: { createdPlans: 2 },
      reason: "Daily schedule generation requested by human administrator.",
    });
  });

  it("keeps NEXT_DAY quotas inactive today, uses them for tomorrow planning and promotes once due", async () => {
    const admin = await createAdmin();
    const planningNow = new Date("2026-07-18T00:05:00.000Z");
    await createCapacityBenchmark(planningNow);
    const [created] = await createActiveAgents(admin.id, 1);
    const today = new Date("2026-07-18T00:00:00.000Z");
    const tomorrow = new Date("2026-07-19T00:00:00.000Z");
    await generateAgentDailyPlans(
      integrationDatabase,
      actor(admin.id),
      { localDate: today },
      planningNow,
    );
    const todayPlan = await integrationDatabase.agentDailyPlan.findFirstOrThrow({
      where: { agentProfileId: created!.agent.profile.id, localDate: today },
    });
    expect(todayPlan.entryTarget).toBe(20);

    const changeNow = new Date("2026-07-18T09:00:00.000Z");
    await updateGlobalSettings(
      integrationDatabase,
      actor(admin.id),
      {
        quotaApplyMode: "NEXT_DAY",
        defaultDailyEntryMin: 10,
        defaultDailyEntryMax: 10,
        globalDailyEntryMin: 10,
      },
      changeNow,
    );
    const changed = await updateGlobalSettings(
      integrationDatabase,
      actor(admin.id),
      {
        quotaApplyMode: "NEXT_DAY",
        globalDailyEntryMax: 10,
      },
      changeNow,
    );
    expect(changed.quotaApplication).toMatchObject({
      mode: "NEXT_DAY",
      effectiveLocalDate: "2026-07-19",
      regeneration: null,
    });
    await expect(
      integrationDatabase.agentGlobalSettings.findUniqueOrThrow({ where: { id: "global" } }),
    ).resolves.toMatchObject({
      defaultDailyEntryMax: 20,
      globalDailyEntryMax: 20,
      pendingQuotaEffectiveDate: tomorrow,
      pendingQuotaSettings: {
        defaultDailyEntryMin: 10,
        defaultDailyEntryMax: 10,
        globalDailyEntryMin: 10,
        globalDailyEntryMax: 10,
      },
    });
    await expect(
      inTransaction(integrationDatabase, (transaction) =>
        getRuntimeGlobalSettings(transaction, changeNow),
      ),
    ).resolves.toMatchObject({ defaultDailyEntryMax: 20, globalDailyEntryMax: 20 });
    await expect(
      inTransaction(integrationDatabase, (transaction) =>
        getRuntimeGlobalSettings(transaction, new Date("2026-07-19T00:01:00.000Z")),
      ),
    ).resolves.toMatchObject({ defaultDailyEntryMax: 10, globalDailyEntryMax: 10 });

    await generateAgentDailyPlans(
      integrationDatabase,
      actor(admin.id),
      { localDate: tomorrow },
      changeNow,
    );
    await expect(
      integrationDatabase.agentDailyPlan.findFirstOrThrow({
        where: { agentProfileId: created!.agent.profile.id, localDate: tomorrow },
      }),
    ).resolves.toMatchObject({ entryTarget: 10 });
    await expect(
      integrationDatabase.agentGlobalSettings.findUniqueOrThrow({ where: { id: "global" } }),
    ).resolves.toMatchObject({ defaultDailyEntryMax: 20, pendingQuotaEffectiveDate: tomorrow });

    await generateAgentDailyPlans(
      integrationDatabase,
      actor(admin.id),
      { localDate: tomorrow },
      new Date("2026-07-19T00:05:00.000Z"),
    );
    await expect(
      integrationDatabase.agentGlobalSettings.findUniqueOrThrow({ where: { id: "global" } }),
    ).resolves.toMatchObject({
      defaultDailyEntryMax: 10,
      globalDailyEntryMax: 10,
      pendingQuotaSettings: null,
      pendingQuotaEffectiveDate: null,
    });
    expect(
      await integrationDatabase.agentRuntimeEvent.count({
        where: {
          eventType: "runtime.global.changed",
          metadata: { path: ["quotaApplyMode"], equals: "NEXT_DAY" },
        },
      }),
    ).toBe(2);
  });

  it("regenerates only the remaining plan from authoritative ACTIVE publications and pending reservations", async () => {
    const admin = await createAdmin();
    const planningNow = new Date("2026-07-18T00:05:00.000Z");
    await createCapacityBenchmark(planningNow);
    const [created] = await createActiveAgents(admin.id, 1);
    const agent = created!;
    const localDate = new Date("2026-07-18T00:00:00.000Z");
    await generateAgentDailyPlans(integrationDatabase, actor(admin.id), { localDate }, planningNow);
    const planBefore = await integrationDatabase.agentDailyPlan.findFirstOrThrow({
      where: { agentProfileId: agent.agent.profile.id, localDate },
      include: { slots: { orderBy: { scheduledAt: "asc" } } },
    });
    const now = new Date("2026-07-18T09:00:00.000Z");
    for (const [index, slot] of planBefore.slots.entries())
      await integrationDatabase.agentScheduleSlot.update({
        where: { id: slot.id },
        data: { scheduledAt: new Date(now.getTime() + (index + 1) * 35 * 60_000 + 17_000) },
      });
    const topic = await integrationDatabase.topic.create({
      data: {
        title: "Remaining quota regeneration fixture",
        normalizedTitle: `remaining quota ${randomUUID()}`,
        slug: `remaining-quota-${randomUUID()}`,
        createdById: agent.agent.user.id,
      },
    });
    const publishedRun = await integrationDatabase.agentRun.create({
      data: {
        agentProfileId: agent.agent.profile.id,
        runType: "SCHEDULED_WAKE",
        runStatus: "SUCCEEDED",
        queuePriority: "SCHEDULED_CONTENT",
        trigger: "REGENERATION_PUBLISHED_FIXTURE",
        personaVersionId: agent.agent.personaVersion.id,
        idempotencyKey: randomUUID(),
        availableAt: new Date("2026-07-18T06:00:00.000Z"),
        startedAt: new Date("2026-07-18T06:00:00.000Z"),
        finishedAt: new Date("2026-07-18T06:05:00.000Z"),
        timeoutSeconds: 360,
        desiredEntryMin: 2,
        desiredEntryMax: 3,
      },
    });
    for (const [index, status] of (["ACTIVE", "ACTIVE", "HIDDEN"] as const).entries()) {
      const sequence = index + 1;
      const createdAt = new Date(`2026-07-18T06:0${sequence}:00.000Z`);
      const action = await integrationDatabase.agentAction.create({
        data: {
          runId: publishedRun.id,
          agentProfileId: agent.agent.profile.id,
          sequence,
          actionType: "CREATE_ENTRY",
          actionStatus: "SUCCEEDED",
          input: { body: `Remaining quota publication ${sequence}` },
          result: {},
          createdAt,
        },
      });
      const entry = await integrationDatabase.entry.create({
        data: {
          topicId: topic.id,
          authorId: agent.agent.user.id,
          body: `Remaining quota publication ${sequence}`,
          normalizedBody: `remaining quota publication ${sequence}`,
          status,
          origin: "AGENT",
          ...(status === "HIDDEN" ? { hiddenAt: now } : {}),
          createdAt,
        },
      });
      await integrationDatabase.agentContentRecord.create({
        data: {
          entryId: entry.id,
          agentProfileId: agent.agent.profile.id,
          runId: publishedRun.id,
          actionId: action.id,
          createdAt,
        },
      });
    }
    const pendingRun = await integrationDatabase.agentRun.create({
      data: {
        agentProfileId: agent.agent.profile.id,
        runType: "NORMAL_WAKE",
        runStatus: "QUEUED",
        queuePriority: "MANUAL_SINGLE",
        trigger: "REGENERATION_PENDING_FIXTURE",
        personaVersionId: agent.agent.personaVersion.id,
        idempotencyKey: randomUUID(),
        availableAt: now,
        timeoutSeconds: 600,
        desiredEntryMin: 2,
        desiredEntryMax: 3,
      },
    });
    await integrationDatabase.agentRuntimeState.update({
      where: { agentProfileId: agent.agent.profile.id },
      data: { todayPublishedEntries: 99 },
    });

    const settingsActor = actor(admin.id);
    const changed = await updateGlobalSettings(
      integrationDatabase,
      settingsActor,
      {
        changeReason: "Regenerate remaining schedule after quota increase.",
        quotaApplyMode: "REGENERATE_REMAINING_TODAY",
        defaultDailyEntryMin: 15,
        defaultDailyEntryMax: 15,
        globalDailyEntryMin: 15,
        globalDailyEntryMax: 15,
      },
      now,
    );
    expect(changed.quotaApplication?.regeneration).toMatchObject({
      regeneratedPlans: 1,
      activePublishedEntries: 2,
      remainingEntries: 10,
      idempotent: false,
    });
    const planAfter = await integrationDatabase.agentDailyPlan.findFirstOrThrow({
      where: { id: planBefore.id },
      include: { slots: { orderBy: { scheduledAt: "asc" } } },
    });
    expect(planAfter.entryTarget).toBe(15);
    expect(
      planAfter.slots
        .filter(({ status }) => status === "PLANNED")
        .reduce((sum, slot) => sum + slot.desiredEntryMax, 0),
    ).toBe(10);
    expect(
      planAfter.slots
        .filter(({ status }) => status === "PLANNED")
        .every(({ scheduledAt }) => scheduledAt > now),
    ).toBe(true);
    const originalSlots = planAfter.slots.filter(({ id }) =>
      planBefore.slots.some((before) => before.id === id),
    );
    expect(originalSlots).toHaveLength(planBefore.slots.length);
    expect(originalSlots.every(({ status }) => status === "CANCELLED")).toBe(true);
    await expect(
      integrationDatabase.agentRuntimeState.findUniqueOrThrow({
        where: { agentProfileId: agent.agent.profile.id },
      }),
    ).resolves.toMatchObject({ todayEntryTarget: 15, todayPublishedEntries: 2 });
    await expect(
      integrationDatabase.agentRun.findUniqueOrThrow({ where: { id: pendingRun.id } }),
    ).resolves.toMatchObject({ runStatus: "QUEUED", desiredEntryMax: 3 });
    expect(await integrationDatabase.agentContentRecord.count()).toBe(3);
    const event = await integrationDatabase.agentRuntimeEvent.findFirstOrThrow({
      where: { eventType: "schedule.regenerated" },
    });
    expect(event.metadata).toMatchObject({
      actorKind: "HUMAN",
      before: { existingPlans: 1 },
      after: { regeneratedPlans: 1 },
      reason: "Regenerate remaining schedule after quota increase.",
      activePublishedEntries: 2,
      pendingReservedEntries: 3,
      remainingEntries: 10,
      perAgent: [
        {
          agentProfileId: agent.agent.profile.id,
          activePublishedEntries: 2,
          pendingReservedEntries: 3,
          remainingToSchedule: 10,
        },
      ],
    });
    const regenerationAudit = await integrationDatabase.auditLog.findFirstOrThrow({
      where: { action: "agent.schedule.regenerated" },
    });
    expect(regenerationAudit).toMatchObject({
      actorId: settingsActor.actorId,
      requestId: settingsActor.requestId,
      createdAt: expect.any(Date),
    });
    expect(regenerationAudit.metadata).toMatchObject({
      actorKind: "HUMAN",
      before: { existingPlans: 1 },
      after: { regeneratedPlans: 1 },
      reason: "Regenerate remaining schedule after quota increase.",
    });

    const replay = await regenerateRemainingAgentDailyPlans(
      integrationDatabase,
      actor(admin.id),
      { localDate },
      now,
    );
    expect(replay).toMatchObject({ regeneratedPlans: 0, idempotent: true });
    expect(
      await integrationDatabase.auditLog.count({ where: { action: "agent.schedule.regenerated" } }),
    ).toBe(1);
    expect(
      await integrationDatabase.agentRuntimeEvent.count({
        where: { eventType: "schedule.regenerated" },
      }),
    ).toBe(1);
  });

  it("rolls back a same-day quota update when remaining-plan capability evidence is stale", async () => {
    const admin = await createAdmin();
    const planningNow = new Date("2026-07-18T00:05:00.000Z");
    const capability = await createCapacityBenchmark(planningNow);
    await createActiveAgents(admin.id, 1);
    const localDate = new Date("2026-07-18T00:00:00.000Z");
    await generateAgentDailyPlans(integrationDatabase, actor(admin.id), { localDate }, planningNow);
    const before = await integrationDatabase.agentGlobalSettings.findUniqueOrThrow({
      where: { id: "global" },
    });
    const now = new Date("2026-07-18T09:00:00.000Z");
    await integrationDatabase.agentRuntimeCapability.update({
      where: { id: capability.id },
      data: { staleAt: new Date(now.getTime() - 1) },
    });
    await expect(
      updateGlobalSettings(
        integrationDatabase,
        actor(admin.id),
        {
          quotaApplyMode: "REGENERATE_REMAINING_TODAY",
          defaultDailyEntryMin: 15,
          defaultDailyEntryMax: 15,
          globalDailyEntryMin: 15,
          globalDailyEntryMax: 15,
        },
        now,
      ),
    ).rejects.toMatchObject({ code: "AGENT_CAPABILITY_REQUIRED" });
    await expect(
      integrationDatabase.agentGlobalSettings.findUniqueOrThrow({ where: { id: "global" } }),
    ).resolves.toMatchObject({
      settingsVersion: before.settingsVersion,
      defaultDailyEntryMin: before.defaultDailyEntryMin,
      defaultDailyEntryMax: before.defaultDailyEntryMax,
      globalDailyEntryMin: before.globalDailyEntryMin,
      globalDailyEntryMax: before.globalDailyEntryMax,
    });
    expect(
      await integrationDatabase.auditLog.count({ where: { action: "agent.schedule.regenerated" } }),
    ).toBe(0);
  });

  it("blocks planning when the benchmark prompt profile is stale", async () => {
    const admin = await createAdmin();
    const planningNow = new Date("2026-07-18T00:05:00.000Z");
    await createCapacityBenchmark(planningNow, { promptProfileHash: "a".repeat(64) });
    await createActiveAgents(admin.id, 1);
    const localDate = new Date("2026-07-18T00:00:00.000Z");

    await expect(
      generateAgentDailyPlans(integrationDatabase, actor(admin.id), { localDate }, planningNow),
    ).resolves.toMatchObject({
      createdPlans: 0,
      blocked: true,
      blockedReason: "CAPABILITY_STALE",
      capacity: {
        capacityStatus: "UNKNOWN",
        benchmark: { stale: true, staleReasons: ["PROMPT_PROFILE"] },
      },
    });
    expect(await integrationDatabase.agentDailyPlan.count({ where: { localDate } })).toBe(0);
    expect(
      await integrationDatabase.agentRuntimeEvent.count({
        where: { eventType: "capacity.planning_blocked" },
      }),
    ).toBe(1);
  });

  it("blocks planning when the observed Codex major differs from the benchmark", async () => {
    const admin = await createAdmin();
    const planningNow = new Date("2026-07-18T00:05:00.000Z");
    await createCapacityBenchmark(planningNow, {
      codexVersion: "codex-cli 2.4.0",
      observedCodexVersion: "codex-cli 3.0.0",
    });
    await createActiveAgents(admin.id, 1);
    const localDate = new Date("2026-07-18T00:00:00.000Z");

    const result = await generateAgentDailyPlans(
      integrationDatabase,
      actor(admin.id),
      { localDate },
      planningNow,
    );
    expect(result).toMatchObject({
      createdPlans: 0,
      blocked: true,
      blockedReason: "CAPABILITY_STALE",
      capacity: { benchmark: { stale: true, staleReasons: ["CODEX_MAJOR"] } },
    });
    expect(await integrationDatabase.agentDailyPlan.count({ where: { localDate } })).toBe(0);
  });

  it("preserves targets, compacts to six runs and persists an explicit projected SLO miss", async () => {
    const admin = await createAdmin();
    const planningNow = new Date("2026-07-18T00:05:00.000Z");
    await createCapacityBenchmark(planningNow, { p75DurationMs: 3_600_000 });
    await createActiveAgents(admin.id, 3);
    const localDate = new Date("2026-07-18T00:00:00.000Z");

    const result = await generateAgentDailyPlans(
      integrationDatabase,
      actor(admin.id),
      { localDate },
      planningNow,
    );
    expect(result).toMatchObject({
      createdPlans: 3,
      capacity: {
        capacityStatus: "OVERLOADED",
        plannedRuns: 18,
        targetPublishedEntries: 60,
        estimatedPublishedMax: 60,
        projectedPublishedMax: 40,
        projectedShortfallEntries: 20,
        projectedTargetMiss: true,
        warnings: ["OVERLOADED", "PROJECTED_TARGET_MISS"],
      },
    });
    const plans = await integrationDatabase.agentDailyPlan.findMany({
      where: { localDate },
      include: { slots: true },
    });
    expect(plans.every((plan) => plan.entryTarget === 20 && plan.slots.length === 6)).toBe(true);
    expect(
      plans.every(
        (plan) =>
          plan.slots.reduce((sum, slot) => sum + slot.desiredEntryMax, 0) === plan.entryTarget &&
          plan.slots.every((slot) => slot.desiredEntryMax <= 4),
      ),
    ).toBe(true);
    const event = await integrationDatabase.agentRuntimeEvent.findFirstOrThrow({
      where: { eventType: "capacity.slo_miss.projected" },
    });
    expect(event.metadata).toMatchObject({
      targetPublishedEntries: 60,
      projectedPublishedMax: 40,
      projectedShortfallEntries: 20,
      adaptationStages: ["SIX_RUNS_PER_AGENT", "MAX_FOUR_ENTRIES_PER_RUN"],
    });
    const nextLocalDate = new Date("2026-07-19T00:00:00.000Z");
    const nextPlanningNow = new Date("2026-07-19T00:05:00.000Z");
    await generateAgentDailyPlans(
      integrationDatabase,
      actor(admin.id),
      { localDate: nextLocalDate },
      nextPlanningNow,
    );
    await generateAgentDailyPlans(
      integrationDatabase,
      actor(admin.id),
      { localDate: nextLocalDate },
      nextPlanningNow,
    );
    const actualMisses = await integrationDatabase.agentRuntimeEvent.findMany({
      where: { eventType: "capacity.slo_miss.actual" },
    });
    expect(actualMisses).toHaveLength(1);
    expect(actualMisses[0]!.metadata).toMatchObject({
      localDate: "2026-07-18",
      targetPublishedEntries: 60,
      publishedEntries: 0,
      shortfallEntries: 60,
    });
  });

  it("shrinks targets only in degraded mode and records before/after evidence", async () => {
    const admin = await createAdmin();
    const planningNow = new Date("2026-07-18T00:05:00.000Z");
    await createCapacityBenchmark(planningNow, { p75DurationMs: 3_600_000 });
    await createActiveAgents(admin.id, 3, { degradedMode: true });
    const localDate = new Date("2026-07-18T00:00:00.000Z");

    const result = await generateAgentDailyPlans(
      integrationDatabase,
      actor(admin.id),
      { localDate },
      planningNow,
    );
    expect(result).toMatchObject({
      createdPlans: 3,
      capacity: {
        capacityStatus: "DEGRADED",
        plannedRuns: 12,
        targetPublishedEntries: 48,
        estimatedPublishedMax: 48,
        projectedShortfallEntries: 0,
        projectedTargetMiss: false,
      },
    });
    expect(
      await integrationDatabase.agentRuntimeEvent.count({
        where: { eventType: "capacity.slo_miss.projected" },
      }),
    ).toBe(0);
    const event = await integrationDatabase.agentRuntimeEvent.findFirstOrThrow({
      where: { eventType: "capacity.degraded_plan" },
    });
    expect(event.metadata).toMatchObject({
      before: { plannedRuns: 18, targetPublishedEntries: 60 },
      after: { plannedRuns: 12, targetPublishedEntries: 48 },
    });
    await generateAgentDailyPlans(
      integrationDatabase,
      actor(admin.id),
      { localDate: new Date("2026-07-19T00:00:00.000Z") },
      new Date("2026-07-19T00:05:00.000Z"),
    );
    expect(
      await integrationDatabase.agentRuntimeEvent.count({
        where: { eventType: "capacity.slo_miss.actual" },
      }),
    ).toBe(0);
  });

  it("uses concurrency two only after a fresh measured dual-RAM capability", async () => {
    const admin = await createAdmin();
    const planningNow = new Date("2026-07-18T00:05:00.000Z");
    await createCapacityBenchmark(planningNow, {
      p75DurationMs: 3_600_000,
      dualConcurrencySupported: true,
      availableMemoryMb: 900,
    });
    await createActiveAgents(admin.id, 3, { codexConcurrency: 2 });
    const localDate = new Date("2026-07-18T00:00:00.000Z");

    const result = await generateAgentDailyPlans(
      integrationDatabase,
      actor(admin.id),
      { localDate },
      planningNow,
    );
    expect(result.capacity).toMatchObject({
      capacityStatus: "HEALTHY",
      configuredConcurrency: 2,
      effectiveConcurrency: 2,
      plannedRuns: 18,
      targetPublishedEntries: 60,
      projectedShortfallEntries: 0,
    });
    const generatedEvent = await integrationDatabase.agentRuntimeEvent.findFirstOrThrow({
      where: { eventType: "schedule.generated" },
    });
    expect(generatedEvent.metadata).toMatchObject({
      adaptationStages: [
        "SIX_RUNS_PER_AGENT",
        "MAX_FOUR_ENTRIES_PER_RUN",
        "MEASURED_DUAL_CONCURRENCY",
      ],
    });
  });

  it("uses recent agent success rate and entries-per-run yield in the measured run envelope", async () => {
    const admin = await createAdmin();
    const planningNow = new Date("2026-07-21T00:05:00.000Z");
    await createCapacityBenchmark(planningNow);
    const created = await createAgent(
      integrationDatabase,
      actor(admin.id),
      createAgentSchema.parse({ persona: originalPersonaPack.personas[0] }),
    );
    await updateGlobalSettings(integrationDatabase, actor(admin.id), {
      defaultDailyEntryMin: 20,
      defaultDailyEntryMax: 20,
      globalDailyEntryMin: 20,
      globalDailyEntryMax: 20,
    });
    await changeAgentLifecycle(
      integrationDatabase,
      actor(admin.id),
      created.agent.profile.id,
      lifecycleChangeSchema.parse({
        status: "ACTIVE",
        reason: "Activate adaptive scheduler history fixture.",
      }),
    );
    for (let index = 0; index < 4; index += 1) {
      const startedAt = new Date(planningNow.getTime() - (index + 2) * 60 * 60_000);
      await integrationDatabase.agentRun.create({
        data: {
          agentProfileId: created.agent.profile.id,
          personaVersionId: created.agent.personaVersion.id,
          runType: "SCHEDULED_WAKE",
          runStatus: index < 2 ? "SUCCEEDED" : "FAILED",
          queuePriority: "SCHEDULED_CONTENT",
          trigger: "ADAPTIVE_HISTORY_FIXTURE",
          idempotencyKey: `adaptive-history:${index}:${created.agent.profile.id}`,
          timeoutSeconds: 360,
          desiredEntryMin: 2,
          desiredEntryMax: 3,
          startedAt,
          finishedAt: new Date(startedAt.getTime() + 60_000),
          ...(index < 2 ? {} : { errorCode: "HISTORY_FAILURE" }),
        },
      });
    }

    const localDate = new Date("2026-07-21T00:00:00.000Z");
    await generateAgentDailyPlans(integrationDatabase, actor(admin.id), { localDate }, planningNow);
    const plan = await integrationDatabase.agentDailyPlan.findFirstOrThrow({
      where: { agentProfileId: created.agent.profile.id, localDate },
      include: { slots: true },
    });
    expect(plan.entryTarget).toBe(20);
    expect(plan.slots).toHaveLength(8);
    const event = await integrationDatabase.agentRuntimeEvent.findFirstOrThrow({
      where: { eventType: "schedule.generated" },
      orderBy: { id: "desc" },
    });
    expect(event.metadata).toMatchObject({
      adaptivePlanning: [
        {
          agentProfileId: created.agent.profile.id,
          contentRunCount: 8,
          historicalSuccessRate: 0.5,
          historicalTerminalRuns: 4,
        },
      ],
    });
  });

  it("queues idempotent nightly, weekly and bounded evening catch-up work", async () => {
    const admin = await createAdmin();
    const planningNow = new Date("2026-07-19T00:05:00.000Z");
    await createCapacityBenchmark(planningNow);
    const created = await createAgent(
      integrationDatabase,
      actor(admin.id),
      createAgentSchema.parse({ persona: originalPersonaPack.personas[0] }),
    );
    await updateGlobalSettings(integrationDatabase, actor(admin.id), {
      globalDailyEntryMin: 15,
      globalDailyEntryMax: 20,
    });
    await changeAgentLifecycle(
      integrationDatabase,
      actor(admin.id),
      created.agent.profile.id,
      lifecycleChangeSchema.parse({
        status: "ACTIVE",
        reason: "Activate maintenance scheduler integration fixture.",
      }),
    );
    const localDate = new Date("2026-07-19T00:00:00.000Z");
    await generateAgentDailyPlans(integrationDatabase, actor(admin.id), { localDate }, planningNow);
    await integrationDatabase.agentScheduleSlot.updateMany({
      where: { agentProfileId: created.agent.profile.id, dailyPlan: { localDate } },
      data: { status: "COMPLETED" },
    });
    const now = new Date("2026-07-19T18:10:00.000Z");
    const first = await inTransaction(integrationDatabase, (transaction) =>
      planRuntimeMaintenanceAndCatchUp(transaction, {
        agentProfileId: created.agent.profile.id,
        localDate,
        now,
        catchUpFrozen: false,
        concurrency: 1,
        scheduledTimeoutSeconds: 360,
        reflectionTimeoutSeconds: 720,
        sourceRefreshTimeoutSeconds: 240,
        personaEvolutionEnabled: true,
        sourceEvolutionEnabled: true,
      }),
    );
    expect(first).toMatchObject({ maintenanceQueued: 3, catchUpQueued: 1 });
    const runs = await integrationDatabase.agentRun.findMany({
      where: { agentProfileId: created.agent.profile.id },
      orderBy: { trigger: "asc" },
    });
    expect(runs.filter(({ trigger }) => trigger === "NIGHTLY_MEMORY_CONSOLIDATION")).toHaveLength(
      1,
    );
    expect(runs.filter(({ trigger }) => trigger === "WEEKLY_PERSONA_REFLECTION")).toHaveLength(1);
    expect(runs.filter(({ trigger }) => trigger === "DAILY_SOURCE_REFRESH")).toHaveLength(1);
    const catchUp = runs.find(
      ({ trigger, runStatus }) => trigger === "AUTO_CATCH_UP" && runStatus === "QUEUED",
    );
    expect(catchUp).toMatchObject({
      runType: "DAILY_CATCH_UP",
      queuePriority: "DAILY_CATCH_UP",
      desiredEntryMin: 1,
    });
    expect(catchUp!.desiredEntryMax).toBeLessThanOrEqual(4);
    const replay = await inTransaction(integrationDatabase, (transaction) =>
      planRuntimeMaintenanceAndCatchUp(transaction, {
        agentProfileId: created.agent.profile.id,
        localDate,
        now,
        catchUpFrozen: false,
        concurrency: 1,
        scheduledTimeoutSeconds: 360,
        reflectionTimeoutSeconds: 720,
        sourceRefreshTimeoutSeconds: 240,
        personaEvolutionEnabled: true,
        sourceEvolutionEnabled: true,
      }),
    );
    expect(replay).toMatchObject({ maintenanceQueued: 0, catchUpQueued: 0 });
  });

  it("terminalizes a prior-day queued catch-up once with canonical lifecycle evidence", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const now = new Date("2026-07-19T18:10:00.000Z");
    vi.setSystemTime(now);
    try {
      const admin = await createAdmin();
      await createCapacityBenchmark(now, {
        dualConcurrencySupported: true,
        availableMemoryMb: 900,
      });
      const [created] = await createActiveAgents(admin.id, 1, { codexConcurrency: 2 });
      const stale = await integrationDatabase.agentRun.create({
        data: {
          agentProfileId: created!.agent.profile.id,
          runType: "DAILY_CATCH_UP",
          queuePriority: "DAILY_CATCH_UP",
          trigger: "AUTO_CATCH_UP",
          personaVersionId: created!.agent.personaVersion.id,
          idempotencyKey: randomUUID(),
          availableAt: new Date("2026-07-18T10:00:00.000Z"),
          timeoutSeconds: 360,
          desiredEntryMin: 1,
          desiredEntryMax: 4,
          createdAt: new Date("2026-07-18T10:00:00.000Z"),
        },
      });
      const queuedRequestId = randomUUID();
      await integrationDatabase.outboxEvent.create({
        data: {
          eventType: "agent.run.queued",
          aggregateType: "AgentRun",
          aggregateId: stale.id,
          actorId: null,
          actorKind: null,
          requestId: queuedRequestId,
          payload: {
            agentProfileId: stale.agentProfileId,
            runId: stale.id,
            runType: stale.runType,
            queuePriority: stale.queuePriority,
            runStatus: "QUEUED",
            trigger: stale.trigger,
            availableAt: stale.availableAt.toISOString(),
            desiredEntryMin: stale.desiredEntryMin,
            desiredEntryMax: stale.desiredEntryMax,
          },
        },
      });

      const firstPrincipal = await authenticateRuntimeRequest(integrationDatabase, {
        authorization: `Bearer ${created!.credential}`,
        hasBrowserSession: false,
        requiredScope: "runtime:lease",
        requestId: randomUUID(),
      });
      await leaseRuntimeRun(integrationDatabase, firstPrincipal, {
        workerId: "expired-catch-up-terminal-one",
        leaseSeconds: 60,
      });
      const secondPrincipal = await authenticateRuntimeRequest(integrationDatabase, {
        authorization: `Bearer ${created!.credential}`,
        hasBrowserSession: false,
        requiredScope: "runtime:lease",
        requestId: randomUUID(),
      });
      await leaseRuntimeRun(integrationDatabase, secondPrincipal, {
        workerId: "expired-catch-up-terminal-two",
        leaseSeconds: 60,
      });

      await expect(
        integrationDatabase.agentRun.findUniqueOrThrow({ where: { id: stale.id } }),
      ).resolves.toMatchObject({
        runStatus: "CANCELLED",
        errorCode: "CATCH_UP_DAY_EXPIRED",
        finishedAt: now,
      });
      const terminalOutbox = await integrationDatabase.outboxEvent.findMany({
        where: { eventType: "agent.run.failed", aggregateId: stale.id },
      });
      expect(terminalOutbox).toHaveLength(1);
      expect(terminalOutbox[0]).toMatchObject({
        aggregateType: "AgentRun",
        actorId: null,
        actorKind: null,
        requestId: firstPrincipal.actor.requestId,
        payload: {
          agentProfileId: stale.agentProfileId,
          runId: stale.id,
          outcome: "CANCELLED",
          requestedOutcome: "CANCELLED",
          errorCode: "CATCH_UP_DAY_EXPIRED",
          reasonCode: "CATCH_UP_DAY_EXPIRED",
          trigger: "AUTO_CATCH_UP",
          expiredLocalDate: "2026-07-19",
          before: { runStatus: "QUEUED" },
          after: { runStatus: "CANCELLED" },
          measured: {
            publishedEntries: 0,
            createdTopics: 0,
            votes: 0,
            sourceReads: 0,
            proposedActions: 0,
            succeededActions: 0,
            rejectedActions: 0,
            committedMemoryEpisodes: 0,
          },
        },
      });
      expect(
        await integrationDatabase.outboxEvent.count({
          where: { eventType: "agent.run.queued", aggregateId: stale.id },
        }),
      ).toBe(1);
      expect(
        await integrationDatabase.auditLog.count({
          where: { action: "agent.run.failed", entityId: stale.id, actorId: null },
        }),
      ).toBe(1);
      expect(
        await integrationDatabase.agentRunEvent.count({
          where: { runId: stale.id, eventType: "run.failed" },
        }),
      ).toBe(1);
      expect(
        await integrationDatabase.agentRuntimeEvent.count({
          where: { runId: stale.id, eventType: "run.failed" },
        }),
      ).toBe(1);
      expect(JSON.stringify(terminalOutbox)).not.toContain(created!.credential);
    } finally {
      vi.useRealTimers();
    }
  });

  it("emits one canonical queued event per run created by an idempotent runtime scheduler poll", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const activationNow = new Date("2026-07-18T18:10:00.000Z");
    const now = new Date("2026-07-19T18:10:00.000Z");
    vi.setSystemTime(activationNow);
    try {
      const admin = await createAdmin();
      await createCapacityBenchmark(activationNow, {
        dualConcurrencySupported: true,
        availableMemoryMb: 900,
      });
      const [workerAgent, dueSlotAgent] = await createActiveAgents(admin.id, 2, {
        codexConcurrency: 2,
      });
      vi.setSystemTime(now);
      const localDate = new Date("2026-07-19T00:00:00.000Z");
      await integrationDatabase.agentRuntimeState.update({
        where: { agentProfileId: workerAgent!.agent.profile.id },
        data: {
          todayDate: localDate,
          todayEntryTarget: 20,
          todayPublishedEntries: 0,
        },
      });
      const duePlan = await integrationDatabase.agentDailyPlan.create({
        data: {
          agentProfileId: dueSlotAgent!.agent.profile.id,
          localDate,
          entryTarget: 2,
          topicTarget: 0,
          voteTarget: 0,
          generatedFromSettingsVersion: 1,
          randomSeed: "runtime-queued-outbox-due-slot",
        },
      });
      const dueSlot = await integrationDatabase.agentScheduleSlot.create({
        data: {
          dailyPlanId: duePlan.id,
          agentProfileId: dueSlotAgent!.agent.profile.id,
          scheduledAt: new Date(now.getTime() - 60_000),
          runType: "SCHEDULED_WAKE",
          queuePriority: "SCHEDULED_CONTENT",
          desiredEntryMin: 2,
          desiredEntryMax: 2,
        },
      });
      const firstPrincipal = await authenticateRuntimeRequest(integrationDatabase, {
        authorization: `Bearer ${workerAgent!.credential}`,
        hasBrowserSession: false,
        requiredScope: "runtime:lease",
        requestId: randomUUID(),
      });
      const firstLease = await leaseRuntimeRun(integrationDatabase, firstPrincipal, {
        workerId: "scheduler-outbox-poll-one",
        leaseSeconds: 60,
      });
      expect(firstLease).toMatchObject({
        run: expect.objectContaining({ runStatus: "RUNNING", trigger: "AUTO_CATCH_UP" }),
      });

      const expectedTriggers = [
        "SCHEDULER_SLOT",
        "NIGHTLY_MEMORY_CONSOLIDATION",
        "WEEKLY_PERSONA_REFLECTION",
        "DAILY_SOURCE_REFRESH",
        "AUTO_CATCH_UP",
      ];
      const queuedRuns = await integrationDatabase.agentRun.findMany({
        where: {
          OR: [
            { scheduleSlotId: dueSlot.id },
            {
              agentProfileId: workerAgent!.agent.profile.id,
              trigger: { in: expectedTriggers.slice(1) },
            },
          ],
        },
        orderBy: { trigger: "asc" },
      });
      expect(queuedRuns.map(({ trigger }) => trigger).sort()).toEqual([...expectedTriggers].sort());
      const queuedRunIds = queuedRuns.map(({ id }) => id).sort();
      const firstEvents = await integrationDatabase.outboxEvent.findMany({
        where: { eventType: "agent.run.queued", aggregateId: { in: queuedRunIds } },
        orderBy: [{ aggregateId: "asc" }, { id: "asc" }],
      });
      expect(firstEvents).toHaveLength(queuedRuns.length);
      for (const run of queuedRuns) {
        const events = firstEvents.filter(({ aggregateId }) => aggregateId === run.id);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          aggregateType: "AgentRun",
          aggregateId: run.id,
          actorId: null,
          actorKind: null,
          requestId: firstPrincipal.actor.requestId,
          payload: expect.objectContaining({
            agentProfileId: run.agentProfileId,
            runId: run.id,
            runType: run.runType,
            queuePriority: run.queuePriority,
            runStatus: "QUEUED",
            trigger: run.trigger,
          }),
        });
      }

      const secondPrincipal = await authenticateRuntimeRequest(integrationDatabase, {
        authorization: `Bearer ${workerAgent!.credential}`,
        hasBrowserSession: false,
        requiredScope: "runtime:lease",
        requestId: randomUUID(),
      });
      await leaseRuntimeRun(integrationDatabase, secondPrincipal, {
        workerId: "scheduler-outbox-poll-two",
        leaseSeconds: 60,
      });
      const replayRuns = await integrationDatabase.agentRun.findMany({
        where: {
          OR: [
            { scheduleSlotId: dueSlot.id },
            {
              agentProfileId: workerAgent!.agent.profile.id,
              trigger: { in: expectedTriggers.slice(1) },
            },
          ],
        },
        select: { id: true },
        orderBy: { id: "asc" },
      });
      expect(replayRuns.map(({ id }) => id)).toEqual(queuedRunIds);
      const replayEvents = await integrationDatabase.outboxEvent.findMany({
        where: { eventType: "agent.run.queued", aggregateId: { in: queuedRunIds } },
        orderBy: [{ aggregateId: "asc" }, { id: "asc" }],
      });
      expect(replayEvents.map(({ id }) => id)).toEqual(firstEvents.map(({ id }) => id));
      expect(new Set(replayEvents.map(({ aggregateId }) => aggregateId)).size).toBe(
        queuedRunIds.length,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("freezes catch-up planning and lease eligibility on the activation Istanbul day only", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const now = new Date("2026-07-19T18:10:00.000Z");
    vi.setSystemTime(now);
    try {
      const admin = await createAdmin();
      await createCapacityBenchmark(now);
      const [workerAgent, dueSlotAgent] = await createActiveAgents(admin.id, 2);
      const localDate = new Date("2026-07-19T00:00:00.000Z");
      await integrationDatabase.agentRuntimeState.update({
        where: { agentProfileId: workerAgent!.agent.profile.id },
        data: {
          todayDate: localDate,
          todayEntryTarget: 20,
          todayPublishedEntries: 0,
        },
      });
      const duePlan = await integrationDatabase.agentDailyPlan.create({
        data: {
          agentProfileId: dueSlotAgent!.agent.profile.id,
          localDate,
          entryTarget: 2,
          topicTarget: 0,
          voteTarget: 0,
          generatedFromSettingsVersion: 1,
          randomSeed: "activation-day-due-slot",
        },
      });
      const dueSlot = await integrationDatabase.agentScheduleSlot.create({
        data: {
          dailyPlanId: duePlan.id,
          agentProfileId: dueSlotAgent!.agent.profile.id,
          scheduledAt: new Date(now.getTime() - 60_000),
          runType: "SCHEDULED_WAKE",
          queuePriority: "SCHEDULED_CONTENT",
          desiredEntryMin: 2,
          desiredEntryMax: 2,
        },
      });
      const existingCatchUp = await integrationDatabase.agentRun.create({
        data: {
          agentProfileId: workerAgent!.agent.profile.id,
          runType: "DAILY_CATCH_UP",
          queuePriority: "DAILY_CATCH_UP",
          trigger: "AUTO_CATCH_UP",
          personaVersionId: workerAgent!.agent.personaVersion.id,
          idempotencyKey: `activation-day-catch-up:${workerAgent!.agent.profile.id}`,
          availableAt: new Date(now.getTime() - 60_000),
          timeoutSeconds: 360,
          desiredEntryMin: 1,
          desiredEntryMax: 4,
          createdAt: now,
        },
      });
      const principal = await authenticateRuntimeRequest(integrationDatabase, {
        authorization: `Bearer ${workerAgent!.credential}`,
        hasBrowserSession: false,
        requiredScope: "runtime:lease",
        requestId: randomUUID(),
      });

      const leased = await leaseRuntimeRun(integrationDatabase, principal, {
        workerId: "activation-day-maintenance-worker",
        leaseSeconds: 60,
      });
      expect(leased.run).toMatchObject({ runStatus: "RUNNING", runType: "REFLECTION" });
      expect(["NIGHTLY_MEMORY_CONSOLIDATION", "WEEKLY_PERSONA_REFLECTION"]).toContain(
        leased.run!.trigger,
      );
      await expect(
        integrationDatabase.agentScheduleSlot.findUniqueOrThrow({ where: { id: dueSlot.id } }),
      ).resolves.toMatchObject({ status: "QUEUED", runId: expect.any(String) });
      await expect(
        integrationDatabase.agentRun.findUniqueOrThrow({ where: { id: existingCatchUp.id } }),
      ).resolves.toMatchObject({ runStatus: "QUEUED", attempts: 0 });
      expect(
        await integrationDatabase.agentRun.count({
          where: {
            agentProfileId: workerAgent!.agent.profile.id,
            trigger: "AUTO_CATCH_UP",
          },
        }),
      ).toBe(1);
      const maintenanceRuns = await integrationDatabase.agentRun.findMany({
        where: {
          agentProfileId: workerAgent!.agent.profile.id,
          trigger: {
            in: [
              "NIGHTLY_MEMORY_CONSOLIDATION",
              "WEEKLY_PERSONA_REFLECTION",
              "DAILY_SOURCE_REFRESH",
            ],
          },
        },
      });
      expect(maintenanceRuns).toHaveLength(3);
      expect(
        await integrationDatabase.outboxEvent.count({
          where: {
            eventType: "agent.run.queued",
            aggregateId: { in: maintenanceRuns.map(({ id }) => id) },
            actorId: null,
            actorKind: null,
            requestId: principal.actor.requestId,
          },
        }),
      ).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("queues bounded early catch-up without waiting for all later planned slots", async () => {
    const admin = await createAdmin();
    const planningNow = new Date("2026-07-20T00:05:00.000Z");
    await createCapacityBenchmark(planningNow);
    const created = await createAgent(
      integrationDatabase,
      actor(admin.id),
      createAgentSchema.parse({ persona: originalPersonaPack.personas[0] }),
    );
    await updateGlobalSettings(integrationDatabase, actor(admin.id), {
      defaultDailyEntryMin: 15,
      defaultDailyEntryMax: 20,
      globalDailyEntryMin: 15,
      globalDailyEntryMax: 20,
    });
    await changeAgentLifecycle(
      integrationDatabase,
      actor(admin.id),
      created.agent.profile.id,
      lifecycleChangeSchema.parse({
        status: "ACTIVE",
        reason: "Activate early catch-up scheduler integration fixture.",
      }),
    );
    const localDate = new Date("2026-07-20T00:00:00.000Z");
    await generateAgentDailyPlans(integrationDatabase, actor(admin.id), { localDate }, planningNow);
    const firstNow = new Date("2026-07-20T08:00:00.000Z"); // 11:00 Europe/Istanbul
    const laterSlot = await integrationDatabase.agentScheduleSlot.findFirstOrThrow({
      where: { agentProfileId: created.agent.profile.id, dailyPlan: { localDate } },
      orderBy: { scheduledAt: "desc" },
    });
    await integrationDatabase.agentScheduleSlot.updateMany({
      where: {
        agentProfileId: created.agent.profile.id,
        dailyPlan: { localDate },
        id: { not: laterSlot.id },
      },
      data: { status: "COMPLETED" },
    });
    await integrationDatabase.agentScheduleSlot.update({
      where: { id: laterSlot.id },
      data: { scheduledAt: new Date("2026-07-20T11:00:00.000Z") },
    });

    const planAt = (now: Date) =>
      inTransaction(integrationDatabase, (transaction) =>
        planRuntimeMaintenanceAndCatchUp(transaction, {
          agentProfileId: created.agent.profile.id,
          localDate,
          now,
          catchUpFrozen: false,
          concurrency: 1,
          scheduledTimeoutSeconds: 360,
          reflectionTimeoutSeconds: 720,
          sourceRefreshTimeoutSeconds: 240,
          personaEvolutionEnabled: true,
          sourceEvolutionEnabled: true,
        }),
      );

    await expect(planAt(firstNow)).resolves.toMatchObject({
      maintenanceQueued: 2,
      catchUpQueued: 1,
    });
    const firstCatchUp = await integrationDatabase.agentRun.findFirstOrThrow({
      where: { agentProfileId: created.agent.profile.id, trigger: "AUTO_CATCH_UP" },
      orderBy: { createdAt: "asc" },
    });
    expect(firstCatchUp.idempotencyKey).toContain(":EARLY:");
    await integrationDatabase.agentRun.update({
      where: { id: firstCatchUp.id },
      data: {
        runStatus: "SUCCEEDED",
        startedAt: firstNow,
        finishedAt: new Date(firstNow.getTime() + 60_000),
      },
    });

    const secondNow = new Date(firstNow.getTime() + 30 * 60_000);
    await expect(planAt(secondNow)).resolves.toMatchObject({
      maintenanceQueued: 0,
      catchUpQueued: 1,
    });
    const secondCatchUp = await integrationDatabase.agentRun.findFirstOrThrow({
      where: {
        agentProfileId: created.agent.profile.id,
        trigger: "AUTO_CATCH_UP",
        id: { not: firstCatchUp.id },
      },
    });
    await integrationDatabase.agentRun.update({
      where: { id: secondCatchUp.id },
      data: {
        runStatus: "SUCCEEDED",
        startedAt: secondNow,
        finishedAt: new Date(secondNow.getTime() + 60_000),
      },
    });
    await expect(planAt(new Date(secondNow.getTime() + 30 * 60_000))).resolves.toMatchObject({
      maintenanceQueued: 0,
      catchUpQueued: 0,
    });
    expect(
      await integrationDatabase.agentRun.count({
        where: { agentProfileId: created.agent.profile.id, trigger: "AUTO_CATCH_UP" },
      }),
    ).toBe(2);
  });

  it("does not double-reserve an automatic catch-up after a manual catch-up", async () => {
    const admin = await createAdmin();
    const planningNow = new Date("2026-07-20T00:05:00.000Z");
    await createCapacityBenchmark(planningNow);
    const created = await createAgent(
      integrationDatabase,
      actor(admin.id),
      createAgentSchema.parse({ persona: originalPersonaPack.personas[0] }),
    );
    await updateGlobalSettings(integrationDatabase, actor(admin.id), {
      defaultDailyEntryMin: 4,
      defaultDailyEntryMax: 4,
      globalDailyEntryMin: 4,
      globalDailyEntryMax: 4,
    });
    await changeAgentLifecycle(
      integrationDatabase,
      actor(admin.id),
      created.agent.profile.id,
      lifecycleChangeSchema.parse({
        status: "ACTIVE",
        reason: "Activate manual-to-auto catch-up reservation fixture.",
      }),
    );
    const localDate = new Date("2026-07-20T00:00:00.000Z");
    await generateAgentDailyPlans(integrationDatabase, actor(admin.id), { localDate }, planningNow);
    await integrationDatabase.agentScheduleSlot.updateMany({
      where: { agentProfileId: created.agent.profile.id, dailyPlan: { localDate } },
      data: { status: "COMPLETED" },
    });
    const now = new Date("2026-07-20T08:00:00.000Z");
    const manual = await createManualAgentRun(
      integrationDatabase,
      actor(admin.id),
      created.agent.profile.id,
      manualAgentRunSchema.parse({ runType: "DAILY_CATCH_UP", entryTarget: 4 }),
      now,
    );
    expect(manual).toMatchObject({
      count: 1,
      catchUp: { pendingReservedEntries: 0, newlyReservedEntries: 4 },
    });

    const planned = await inTransaction(integrationDatabase, (transaction) =>
      planRuntimeMaintenanceAndCatchUp(transaction, {
        agentProfileId: created.agent.profile.id,
        localDate,
        now,
        catchUpFrozen: false,
        concurrency: 1,
        scheduledTimeoutSeconds: 360,
        reflectionTimeoutSeconds: 720,
        sourceRefreshTimeoutSeconds: 240,
        personaEvolutionEnabled: true,
        sourceEvolutionEnabled: true,
      }),
    );
    expect(planned.catchUpQueued).toBe(0);
    expect(
      await integrationDatabase.agentRun.count({
        where: { agentProfileId: created.agent.profile.id, trigger: "AUTO_CATCH_UP" },
      }),
    ).toBe(0);
  });

  it("creates and leases zero catch-up work above 90 percent two-hour utilization", async () => {
    const admin = await createAdmin();
    const [created] = await createActiveAgents(admin.id, 1);
    const persistedSettings = await integrationDatabase.agentGlobalSettings.findUniqueOrThrow({
      where: { id: "global" },
    });
    const persistedBreakerConfig = circuitBreakerConfigSchema.parse(
      persistedSettings.circuitBreakerConfig,
    );
    await updateGlobalSettings(integrationDatabase, actor(admin.id), {
      circuitBreakerConfig: {
        ...persistedBreakerConfig,
        utilizationWindowMinutes: 30,
        utilizationThreshold: 1,
      },
    });
    const now = new Date("2026-07-18T13:00:00.000Z");
    const localDate = new Date("2026-07-18T00:00:00.000Z");
    const codexStartedAt = new Date(now.getTime() - 110 * 60_000);

    await integrationDatabase.agentRuntimeState.update({
      where: { agentProfileId: created!.agent.profile.id },
      data: {
        todayDate: localDate,
        todayEntryTarget: 20,
        todayPublishedEntries: 0,
      },
    });
    await integrationDatabase.agentRun.create({
      data: {
        agentProfileId: created!.agent.profile.id,
        personaVersionId: created!.agent.personaVersion.id,
        runType: "NORMAL_WAKE",
        runStatus: "SUCCEEDED",
        queuePriority: "SCHEDULED_CONTENT",
        trigger: "HIGH_UTILIZATION_FIXTURE",
        idempotencyKey: randomUUID(),
        timeoutSeconds: 900,
        desiredEntryMin: 1,
        desiredEntryMax: 2,
        startedAt: codexStartedAt,
        finishedAt: now,
        usageMetadata: {
          durationMs: 110 * 60_000,
          provider: "codex-cli",
          codexIntervals: [
            {
              startedAt: codexStartedAt.toISOString(),
              finishedAt: now.toISOString(),
              durationMs: 110 * 60_000,
            },
          ],
        },
      },
    });

    const result = await inTransaction(integrationDatabase, async (transaction) => {
      const settings = await getRuntimeGlobalSettings(transaction);
      const config = circuitBreakerConfigSchema.parse(settings.circuitBreakerConfig);
      const operational = await getRuntimeOperationalMetrics(transaction, {
        now,
        concurrency: 1,
        config,
      });
      const breakers = evaluateCircuitBreakers(config, operational);
      const planned = await planRuntimeMaintenanceAndCatchUp(transaction, {
        agentProfileId: created!.agent.profile.id,
        localDate,
        now,
        catchUpFrozen: breakers.catchUpFrozen,
        concurrency: 1,
        scheduledTimeoutSeconds: settings.scheduledTimeoutSeconds,
        reflectionTimeoutSeconds: settings.reflectionTimeoutSeconds,
        sourceRefreshTimeoutSeconds: settings.sourceRefreshTimeoutSeconds,
        personaEvolutionEnabled: settings.personaEvolutionEnabled,
        sourceEvolutionEnabled: settings.sourceEvolutionEnabled,
      });
      const automaticallyCreated = await transaction.agentRun.count({
        where: { agentProfileId: created!.agent.profile.id, trigger: "AUTO_CATCH_UP" },
      });

      await transaction.agentRun.updateMany({
        where: { agentProfileId: created!.agent.profile.id, runStatus: "QUEUED" },
        data: { runStatus: "CANCELLED", finishedAt: now },
      });
      const queuedCatchUp = await transaction.agentRun.create({
        data: {
          agentProfileId: created!.agent.profile.id,
          personaVersionId: created!.agent.personaVersion.id,
          runType: "DAILY_CATCH_UP",
          queuePriority: "DAILY_CATCH_UP",
          trigger: "HIGH_UTILIZATION_LEASE_FIXTURE",
          idempotencyKey: randomUUID(),
          timeoutSeconds: 360,
          desiredEntryMin: 1,
          desiredEntryMax: 4,
          createdAt: new Date(now.getTime() - 60_000),
          availableAt: new Date(now.getTime() - 60_000),
        },
      });
      const claimed = await claimNextRuntimeRun(transaction, {
        agentProfileId: created!.agent.profile.id,
        workerId: "high-utilization-worker",
        leaseSeconds: 60,
        maxRetryCount: settings.maxRetryCount,
        writeRunsPaused: breakers.writeRunsPaused,
        catchUpFrozen: breakers.catchUpFrozen,
        contentSlowdownMinutes: 0,
        now,
      });
      return { operational, breakers, planned, automaticallyCreated, queuedCatchUp, claimed };
    });

    expect(result.operational.utilization2h).toBeCloseTo(110 / 120, 5);
    expect(result.operational.configuredWindowUtilization).toBeCloseTo(1, 5);
    expect(result.breakers).toMatchObject({
      capacityAtRisk: true,
      catchUpFrozen: true,
      breakers: expect.arrayContaining([
        expect.objectContaining({
          code: "WORKER_UTILIZATION_2H",
          active: true,
          threshold: 0.9,
          windowMinutes: 120,
        }),
        expect.objectContaining({
          code: "WORKER_UTILIZATION_WINDOW",
          active: false,
          measured: 1,
          threshold: 1,
          windowMinutes: 30,
        }),
      ]),
    });
    expect(result.planned.catchUpQueued).toBe(0);
    expect(result.automaticallyCreated).toBe(0);
    expect(result.claimed).toBeNull();
    expect(
      await integrationDatabase.agentRun.findUniqueOrThrow({
        where: { id: result.queuedCatchUp.id },
      }),
    ).toMatchObject({ runStatus: "QUEUED", leaseOwner: null });
  });

  it("recounts only successfully published ACTIVE entries before planning catch-up", async () => {
    const admin = await createAdmin();
    const planningNow = new Date("2026-07-21T00:05:00.000Z");
    await createCapacityBenchmark(planningNow);
    const created = await createAgent(
      integrationDatabase,
      actor(admin.id),
      createAgentSchema.parse({ persona: originalPersonaPack.personas[0] }),
    );
    await updateGlobalSettings(integrationDatabase, actor(admin.id), {
      defaultDailyEntryMin: 15,
      defaultDailyEntryMax: 15,
      globalDailyEntryMin: 15,
      globalDailyEntryMax: 15,
    });
    await changeAgentLifecycle(
      integrationDatabase,
      actor(admin.id),
      created.agent.profile.id,
      lifecycleChangeSchema.parse({
        status: "ACTIVE",
        reason: "Activate ACTIVE-entry recount scheduler fixture.",
      }),
    );
    const localDate = new Date("2026-07-21T00:00:00.000Z");
    await generateAgentDailyPlans(integrationDatabase, actor(admin.id), { localDate }, planningNow);
    await integrationDatabase.agentScheduleSlot.updateMany({
      where: { agentProfileId: created.agent.profile.id, dailyPlan: { localDate } },
      data: { status: "COMPLETED" },
    });
    const topic = await integrationDatabase.topic.create({
      data: {
        title: "ACTIVE entry recount fixture",
        normalizedTitle: `active entry recount ${randomUUID()}`,
        slug: `active-entry-recount-${randomUUID()}`,
        createdById: created.agent.user.id,
      },
    });
    const publishedRun = await integrationDatabase.agentRun.create({
      data: {
        agentProfileId: created.agent.profile.id,
        runType: "SCHEDULED_WAKE",
        runStatus: "SUCCEEDED",
        queuePriority: "SCHEDULED_CONTENT",
        trigger: "SCHEDULER_SLOT",
        personaVersionId: created.agent.personaVersion.id,
        idempotencyKey: randomUUID(),
        availableAt: new Date("2026-07-21T06:00:00.000Z"),
        startedAt: new Date("2026-07-21T06:00:00.000Z"),
        finishedAt: new Date("2026-07-21T06:01:00.000Z"),
        timeoutSeconds: 360,
        desiredEntryMin: 1,
        desiredEntryMax: 2,
      },
    });
    for (const [index, status] of (["ACTIVE", "HIDDEN"] as const).entries()) {
      const sequence = index + 1;
      const action = await integrationDatabase.agentAction.create({
        data: {
          runId: publishedRun.id,
          agentProfileId: created.agent.profile.id,
          sequence,
          actionType: "CREATE_ENTRY",
          actionStatus: "SUCCEEDED",
          input: { body: `ACTIVE recount fixture ${sequence}` },
          result: {},
          createdAt: new Date(`2026-07-21T06:0${sequence}:00.000Z`),
        },
      });
      const entry = await integrationDatabase.entry.create({
        data: {
          topicId: topic.id,
          authorId: created.agent.user.id,
          body: `ACTIVE recount fixture ${sequence}`,
          normalizedBody: `active recount fixture ${sequence}`,
          status,
          origin: "AGENT",
          ...(status === "HIDDEN" ? { hiddenAt: new Date("2026-07-21T07:00:00.000Z") } : {}),
          createdAt: new Date(`2026-07-21T06:0${sequence}:00.000Z`),
        },
      });
      await integrationDatabase.agentContentRecord.create({
        data: {
          entryId: entry.id,
          agentProfileId: created.agent.profile.id,
          runId: publishedRun.id,
          actionId: action.id,
          createdAt: entry.createdAt,
        },
      });
    }
    await integrationDatabase.agentRuntimeState.update({
      where: { agentProfileId: created.agent.profile.id },
      data: { todayPublishedEntries: 15 },
    });

    const now = new Date("2026-07-21T08:00:00.000Z"); // 11:00 Europe/Istanbul
    await expect(
      inTransaction(integrationDatabase, (transaction) =>
        planRuntimeMaintenanceAndCatchUp(transaction, {
          agentProfileId: created.agent.profile.id,
          localDate,
          now,
          catchUpFrozen: false,
          concurrency: 1,
          scheduledTimeoutSeconds: 360,
          reflectionTimeoutSeconds: 720,
          sourceRefreshTimeoutSeconds: 240,
          personaEvolutionEnabled: true,
          sourceEvolutionEnabled: true,
        }),
      ),
    ).resolves.toMatchObject({ maintenanceQueued: 2, catchUpQueued: 1 });
    await expect(
      integrationDatabase.agentRuntimeState.findUniqueOrThrow({
        where: { agentProfileId: created.agent.profile.id },
        select: { todayPublishedEntries: true },
      }),
    ).resolves.toEqual({ todayPublishedEntries: 1 });
    await expect(
      integrationDatabase.agentRun.findFirstOrThrow({
        where: { agentProfileId: created.agent.profile.id, trigger: "AUTO_CATCH_UP" },
        select: { desiredEntryMax: true },
      }),
    ).resolves.toEqual({ desiredEntryMax: 2 });
  });

  it("keeps nightly memory consolidation independent while global and profile evolution are frozen", async () => {
    const admin = await createAdmin();
    const created = await createAgent(
      integrationDatabase,
      actor(admin.id),
      createAgentSchema.parse({ persona: originalPersonaPack.personas[0] }),
    );
    await updateGlobalSettings(integrationDatabase, actor(admin.id), {
      globalDailyEntryMin: 15,
      globalDailyEntryMax: 20,
      personaEvolutionEnabled: false,
      sourceEvolutionEnabled: false,
    });
    await integrationDatabase.agentProfile.update({
      where: { id: created.agent.profile.id },
      data: { personaEvolutionEnabled: false, sourceEvolutionEnabled: false },
    });
    await changeAgentLifecycle(
      integrationDatabase,
      actor(admin.id),
      created.agent.profile.id,
      lifecycleChangeSchema.parse({
        status: "ACTIVE",
        reason: "Activate frozen evolution maintenance fixture.",
      }),
    );
    const now = new Date("2026-07-19T02:05:00.000Z");
    const result = await inTransaction(integrationDatabase, (transaction) =>
      planRuntimeMaintenanceAndCatchUp(transaction, {
        agentProfileId: created.agent.profile.id,
        localDate: new Date("2026-07-19T00:00:00.000Z"),
        now,
        catchUpFrozen: false,
        concurrency: 1,
        scheduledTimeoutSeconds: 360,
        reflectionTimeoutSeconds: 600,
        sourceRefreshTimeoutSeconds: 300,
        personaEvolutionEnabled: false,
        sourceEvolutionEnabled: false,
      }),
    );
    expect(result).toMatchObject({ maintenanceQueued: 1, catchUpQueued: 0 });
    expect(
      await integrationDatabase.agentRun.findMany({
        where: { agentProfileId: created.agent.profile.id },
        select: { trigger: true },
      }),
    ).toEqual([{ trigger: "NIGHTLY_MEMORY_CONSOLIDATION" }]);
  });

  it("queues admin manual runs with safe mode-specific write boundaries", async () => {
    const admin = await createAdmin();
    const created = await createAgent(
      integrationDatabase,
      actor(admin.id),
      createAgentSchema.parse({ persona: originalPersonaPack.personas[0] }),
    );
    await updateGlobalSettings(integrationDatabase, actor(admin.id), {
      globalDailyEntryMin: 15,
      globalDailyEntryMax: 20,
    });
    await changeAgentLifecycle(
      integrationDatabase,
      actor(admin.id),
      created.agent.profile.id,
      lifecycleChangeSchema.parse({
        status: "ACTIVE",
        reason: "Activate manual run integration fixture.",
      }),
    );
    const normal = await createManualAgentRun(
      integrationDatabase,
      actor(admin.id),
      created.agent.profile.id,
      manualAgentRunSchema.parse({
        runType: "NORMAL_WAKE",
        entryTarget: 3,
        priority: "EMERGENCY",
        dailyMaximumOverride: true,
        adminInstruction: "Focus on current public platform context only.",
      }),
    );
    expect(normal.run).toMatchObject({
      runStatus: "QUEUED",
      queuePriority: "EMERGENCY_ADMIN",
      desiredEntryMin: 3,
      desiredEntryMax: 3,
      dailyMaximumOverride: true,
    });
    const entryBurst = await createManualAgentRun(
      integrationDatabase,
      actor(admin.id),
      created.agent.profile.id,
      manualAgentRunSchema.parse({
        runType: "ENTRY_BURST",
        entryTarget: 3,
        priority: "NORMAL",
      }),
    );
    expect(entryBurst.run).toMatchObject({
      runType: "ENTRY_BURST",
      runStatus: "QUEUED",
      queuePriority: "MANUAL_SINGLE",
      desiredEntryMin: 3,
      desiredEntryMax: 3,
    });
    const readOnly = await createManualAgentRun(
      integrationDatabase,
      actor(admin.id),
      created.agent.profile.id,
      manualAgentRunSchema.parse({
        runType: "READ_ONLY",
        entryTarget: 0,
        allowTopicCreation: true,
        allowVoting: true,
        allowFollowing: true,
      }),
    );
    expect(readOnly.run).toMatchObject({
      desiredEntryMin: 0,
      desiredEntryMax: 0,
      allowTopicCreation: false,
      allowVoting: false,
      allowFollowing: false,
      allowSourceReading: true,
    });
    expect(
      await listAgentRuns(integrationDatabase, actor(admin.id), created.agent.profile.id),
    ).toHaveLength(3);
    expect(
      await integrationDatabase.auditLog.count({ where: { action: "agent.run.queued" } }),
    ).toBe(3);
  });

  it("derives manual DAILY_CATCH_UP jobs from ACTIVE publications and pending reservations", async () => {
    const admin = await createAdmin();
    const planningNow = new Date("2026-07-18T00:05:00.000Z");
    await createCapacityBenchmark(planningNow);
    const created = await createAgent(
      integrationDatabase,
      actor(admin.id),
      createAgentSchema.parse({ persona: originalPersonaPack.personas[0] }),
    );
    await updateGlobalSettings(integrationDatabase, actor(admin.id), {
      defaultDailyEntryMin: 12,
      defaultDailyEntryMax: 12,
      globalDailyEntryMin: 12,
      globalDailyEntryMax: 12,
    });
    await changeAgentLifecycle(
      integrationDatabase,
      actor(admin.id),
      created.agent.profile.id,
      lifecycleChangeSchema.parse({
        status: "ACTIVE",
        reason: "Activate manual catch-up integration fixture.",
      }),
    );
    const localDate = new Date("2026-07-18T00:00:00.000Z");
    await generateAgentDailyPlans(integrationDatabase, actor(admin.id), { localDate }, planningNow);
    await integrationDatabase.agentScheduleSlot.updateMany({
      where: { agentProfileId: created.agent.profile.id, dailyPlan: { localDate } },
      data: { status: "COMPLETED" },
    });
    const now = new Date("2026-07-18T09:00:00.000Z");
    const topic = await integrationDatabase.topic.create({
      data: {
        title: "Manual catch-up fixture",
        normalizedTitle: `manual catch up ${randomUUID()}`,
        slug: `manual-catch-up-${randomUUID()}`,
        createdById: created.agent.user.id,
      },
    });
    const publishedRun = await integrationDatabase.agentRun.create({
      data: {
        agentProfileId: created.agent.profile.id,
        personaVersionId: created.agent.personaVersion.id,
        runType: "NORMAL_WAKE",
        runStatus: "SUCCEEDED",
        queuePriority: "SCHEDULED_CONTENT",
        trigger: "MANUAL_CATCH_UP_PUBLISHED_FIXTURE",
        idempotencyKey: randomUUID(),
        availableAt: new Date("2026-07-18T06:00:00.000Z"),
        startedAt: new Date("2026-07-18T06:00:00.000Z"),
        finishedAt: new Date("2026-07-18T06:05:00.000Z"),
        timeoutSeconds: 360,
        desiredEntryMin: 2,
        desiredEntryMax: 3,
      },
    });
    for (const [index, status] of (["ACTIVE", "ACTIVE", "HIDDEN"] as const).entries()) {
      const sequence = index + 1;
      const createdAt = new Date(`2026-07-18T06:0${sequence}:00.000Z`);
      const action = await integrationDatabase.agentAction.create({
        data: {
          runId: publishedRun.id,
          agentProfileId: created.agent.profile.id,
          sequence,
          actionType: "CREATE_ENTRY",
          actionStatus: "SUCCEEDED",
          input: { body: `Manual catch-up publication ${sequence}` },
          result: {},
          createdAt,
        },
      });
      const entry = await integrationDatabase.entry.create({
        data: {
          topicId: topic.id,
          authorId: created.agent.user.id,
          body: `Manual catch-up publication ${sequence}`,
          normalizedBody: `manual catch-up publication ${sequence}`,
          status,
          origin: "AGENT",
          ...(status === "HIDDEN" ? { hiddenAt: now } : {}),
          createdAt,
        },
      });
      await integrationDatabase.agentContentRecord.create({
        data: {
          entryId: entry.id,
          agentProfileId: created.agent.profile.id,
          runId: publishedRun.id,
          actionId: action.id,
          createdAt,
        },
      });
    }
    await integrationDatabase.agentRun.create({
      data: {
        agentProfileId: created.agent.profile.id,
        personaVersionId: created.agent.personaVersion.id,
        runType: "NORMAL_WAKE",
        queuePriority: "MANUAL_SINGLE",
        trigger: "MANUAL_CATCH_UP_PENDING_FIXTURE",
        idempotencyKey: randomUUID(),
        availableAt: now,
        timeoutSeconds: 600,
        desiredEntryMin: 2,
        desiredEntryMax: 3,
      },
    });
    await integrationDatabase.agentRuntimeState.update({
      where: { agentProfileId: created.agent.profile.id },
      data: { todayPublishedEntries: 99 },
    });

    const first = await createManualAgentRun(
      integrationDatabase,
      actor(admin.id),
      created.agent.profile.id,
      manualAgentRunSchema.parse({ runType: "DAILY_CATCH_UP", entryTarget: 10 }),
      now,
    );
    expect(first).toMatchObject({
      count: 2,
      catchUp: {
        targetEntries: 12,
        activePublishedEntries: 2,
        pendingReservedEntries: 3,
        newlyReservedEntries: 7,
        desiredEntryTargets: [4, 3],
      },
    });
    expect(first.runs.map(({ desiredEntryMax }) => desiredEntryMax)).toEqual([4, 3]);
    expect(first.runs.every(({ desiredEntryMax }) => desiredEntryMax <= 4)).toBe(true);
    await expect(
      integrationDatabase.agentRuntimeState.findUniqueOrThrow({
        where: { agentProfileId: created.agent.profile.id },
        select: { todayPublishedEntries: true },
      }),
    ).resolves.toEqual({ todayPublishedEntries: 2 });

    const replayFromNewRequest = await createManualAgentRun(
      integrationDatabase,
      actor(admin.id),
      created.agent.profile.id,
      manualAgentRunSchema.parse({ runType: "DAILY_CATCH_UP", entryTarget: 1 }),
      now,
    );
    expect(replayFromNewRequest).toMatchObject({ count: 0, run: null, runs: [] });
    expect(
      await integrationDatabase.agentRun.count({
        where: { agentProfileId: created.agent.profile.id, trigger: "ADMIN_MANUAL" },
      }),
    ).toBe(2);
  });

  it("previews measured utilization and the estimated target-miss change without certainty claims", async () => {
    const admin = await createAdmin();
    const now = new Date("2026-07-18T12:00:00.000Z");
    await createCapacityBenchmark(now, { p75DurationMs: 32_400_000 });
    const created = await createAgent(
      integrationDatabase,
      actor(admin.id),
      createAgentSchema.parse({ persona: originalPersonaPack.personas[0] }),
    );
    await updateGlobalSettings(integrationDatabase, actor(admin.id), {
      defaultDailyEntryMin: 4,
      defaultDailyEntryMax: 4,
      globalDailyEntryMin: 4,
      globalDailyEntryMax: 4,
    });
    await changeAgentLifecycle(
      integrationDatabase,
      actor(admin.id),
      created.agent.profile.id,
      lifecycleChangeSchema.parse({
        status: "ACTIVE",
        reason: "Activate capacity preview integration fixture.",
      }),
    );
    const localDate = new Date("2026-07-18T00:00:00.000Z");
    const plan = await integrationDatabase.agentDailyPlan.create({
      data: {
        agentProfileId: created.agent.profile.id,
        localDate,
        entryTarget: 4,
        topicTarget: 0,
        voteTarget: 0,
        generatedFromSettingsVersion: 1,
        randomSeed: "capacity-preview-integration",
      },
    });
    await integrationDatabase.agentScheduleSlot.create({
      data: {
        dailyPlanId: plan.id,
        agentProfileId: created.agent.profile.id,
        scheduledAt: new Date(now.getTime() + 60 * 60_000),
        runType: "SCHEDULED_WAKE",
        queuePriority: "SCHEDULED_CONTENT",
        desiredEntryMin: 4,
        desiredEntryMax: 4,
      },
    });
    const intervalStartedAt = new Date(now.getTime() - 30 * 60_000);
    await integrationDatabase.agentRun.create({
      data: {
        agentProfileId: created.agent.profile.id,
        personaVersionId: created.agent.personaVersion.id,
        runType: "READ_ONLY",
        runStatus: "SUCCEEDED",
        queuePriority: "MANUAL_SINGLE",
        trigger: "CAPACITY_PREVIEW_UTILIZATION_FIXTURE",
        idempotencyKey: randomUUID(),
        availableAt: intervalStartedAt,
        startedAt: intervalStartedAt,
        finishedAt: now,
        timeoutSeconds: 600,
        desiredEntryMin: 0,
        desiredEntryMax: 0,
        usageMetadata: {
          model: "codex-cli 2.4.0",
          promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
          codexIntervals: [
            { startedAt: intervalStartedAt.toISOString(), finishedAt: now.toISOString() },
          ],
        },
      },
    });

    const preview = await previewBulkAgentRun(
      integrationDatabase,
      actor(admin.id),
      bulkAgentRunPreviewSchema.parse({
        agentIds: [created.agent.profile.id],
        run: { runType: "READ_ONLY", entryTarget: 0 },
      }),
      now,
    );
    expect(preview).toMatchObject({
      runCount: 1,
      measuredP75DurationMs: 32_400_000,
      estimateStatus: "ESTIMATED",
      estimateBasis: "MEASURED_P75",
      estimateDisclaimer: "Ölçüme dayalı tahmindir; tamamlanma garantisi değildir.",
      workerUtilizationWindowMinutes: 120,
      concurrency: 1,
      capacityStatusBefore: "HEALTHY",
      capacityStatusAfter: "OVERLOADED",
      targetMissRiskChange: {
        estimateStatus: "ESTIMATED",
        beforeProjectedShortfallEntries: 0,
        afterProjectedShortfallEntries: 2,
        deltaProjectedShortfallEntries: 2,
        direction: "INCREASED",
      },
    });
    expect(preview.workerUtilization).toBeCloseTo(0.25, 5);
    expect(preview.estimatedStartAt).toEqual(now);
    expect(preview.estimatedCompleteAt).toEqual(new Date(now.getTime() + 32_400_000));
  });

  it("previews and queues explicitly confirmed bulk runs without bypassing concurrency", async () => {
    const admin = await createAdmin();
    const agents = await Promise.all(
      originalPersonaPack.personas
        .slice(0, 2)
        .map((persona) =>
          createAgent(integrationDatabase, actor(admin.id), createAgentSchema.parse({ persona })),
        ),
    );
    await updateGlobalSettings(integrationDatabase, actor(admin.id), {
      globalDailyEntryMin: 30,
      globalDailyEntryMax: 40,
    });
    for (const created of agents) {
      await changeAgentLifecycle(
        integrationDatabase,
        actor(admin.id),
        created.agent.profile.id,
        lifecycleChangeSchema.parse({
          status: "ACTIVE",
          reason: "Activate bulk run integration fixture.",
        }),
      );
    }
    const run = {
      runType: "NORMAL_WAKE" as const,
      entryTarget: 2,
      allowTopicCreation: true,
      allowVoting: true,
      allowFollowing: true,
      allowSourceReading: true,
      saturationOverride: false,
      dailyMaximumOverride: false,
      priority: "NORMAL" as const,
    };
    const preview = await previewBulkAgentRun(
      integrationDatabase,
      actor(admin.id),
      bulkAgentRunPreviewSchema.parse({ allActive: true, run }),
    );
    expect(preview).toMatchObject({
      runCount: 2,
      existingQueueLength: 0,
      measuredP75DurationMs: null,
      estimateStatus: "UNKNOWN",
      estimatedStartAt: null,
      estimatedCompleteAt: null,
      concurrency: 1,
    });
    expect(() =>
      bulkAgentRunSchema.parse({
        allActive: true,
        run,
        confirmation: "RUN_SELECTED_AGENTS",
      }),
    ).toThrow();
    const queued = await createBulkAgentRuns(
      integrationDatabase,
      actor(admin.id),
      bulkAgentRunSchema.parse({
        allActive: true,
        run,
        confirmation: "RUN_ALL_ACTIVE_AGENTS",
      }),
    );
    expect(queued.count).toBe(2);
    expect(
      queued.runs.every(
        (item) =>
          item.runStatus === "QUEUED" &&
          item.queuePriority === "SCHEDULED_CONTENT" &&
          item.trigger === "ADMIN_BULK",
      ),
    ).toBe(true);
    expect(
      await integrationDatabase.auditLog.count({ where: { action: "agent.run.bulk_queued" } }),
    ).toBe(1);

    const emergencyActor = actor(admin.id);
    const emergency = await createBulkAgentRuns(
      integrationDatabase,
      emergencyActor,
      bulkAgentRunSchema.parse({
        allActive: false,
        agentIds: [agents[0]!.agent.profile.id],
        run: { ...run, priority: "EMERGENCY" },
        confirmation: "RUN_SELECTED_AGENTS",
      }),
    );
    expect(emergency.runs).toHaveLength(1);
    expect(emergency.runs[0]).toMatchObject({
      trigger: "ADMIN_BULK",
      queuePriority: "EMERGENCY_ADMIN",
    });
    await expect(
      integrationDatabase.auditLog.findFirstOrThrow({
        where: { action: "agent.run.bulk_queued", requestId: emergencyActor.requestId },
      }),
    ).resolves.toMatchObject({ metadata: { queuePriority: "EMERGENCY_ADMIN" } });
    const queuedIds = [...queued.runs, ...emergency.runs].map(({ id }) => id).sort();
    const queuedOutbox = await integrationDatabase.outboxEvent.findMany({
      where: { eventType: "agent.run.queued", aggregateId: { in: queuedIds } },
      orderBy: { aggregateId: "asc" },
    });
    expect(queuedOutbox.map(({ aggregateId }) => aggregateId)).toEqual(queuedIds);
    expect(queuedOutbox).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          aggregateType: "AgentRun",
          payload: expect.objectContaining({ runStatus: "QUEUED", trigger: "ADMIN_BULK" }),
        }),
      ]),
    );
  });

  it("cancels queued and running runs gracefully and retries terminal runs with lineage", async () => {
    const admin = await createAdmin();
    const created = await createAgent(
      integrationDatabase,
      actor(admin.id),
      createAgentSchema.parse({ persona: originalPersonaPack.personas[0] }),
    );
    await updateGlobalSettings(integrationDatabase, actor(admin.id), {
      globalDailyEntryMin: 15,
      globalDailyEntryMax: 20,
    });
    await changeAgentLifecycle(
      integrationDatabase,
      actor(admin.id),
      created.agent.profile.id,
      lifecycleChangeSchema.parse({
        status: "ACTIVE",
        reason: "Activate queue command integration fixture.",
      }),
    );
    const first = await createManualAgentRun(
      integrationDatabase,
      actor(admin.id),
      created.agent.profile.id,
      manualAgentRunSchema.parse({ runType: "NORMAL_WAKE", entryTarget: 2 }),
    );
    const cancelled = await cancelAgentRun(integrationDatabase, actor(admin.id), first.run!.id, {
      reason: "Cancel queued run during integration verification.",
    });
    expect(cancelled).toMatchObject({ runStatus: "CANCELLED", leaseOwner: null });
    expect(cancelled.finishedAt).not.toBeNull();

    const second = await createManualAgentRun(
      integrationDatabase,
      actor(admin.id),
      created.agent.profile.id,
      manualAgentRunSchema.parse({ runType: "NORMAL_WAKE", entryTarget: 2 }),
    );
    await integrationDatabase.agentRun.update({
      where: { id: second.run!.id },
      data: {
        runStatus: "RUNNING",
        leaseOwner: "integration-worker",
        leaseExpiresAt: new Date(Date.now() + 60_000),
        startedAt: new Date(),
      },
    });
    const cancelling = await cancelAgentRun(integrationDatabase, actor(admin.id), second.run!.id, {
      reason: "Request graceful running cancellation in integration verification.",
    });
    expect(cancelling).toMatchObject({
      runStatus: "CANCEL_REQUESTED",
      leaseOwner: "integration-worker",
    });
    expect(cancelling.finishedAt).toBeNull();

    await integrationDatabase.agentRun.update({
      where: { id: second.run!.id },
      data: {
        runStatus: "FAILED",
        leaseOwner: null,
        leaseExpiresAt: null,
        finishedAt: new Date(),
        errorCode: "INTEGRATION_FAILURE",
        errorSummary: "Synthetic terminal state for retry verification.",
      },
    });
    const retry = await retryAgentRun(integrationDatabase, actor(admin.id), second.run!.id, {
      reason: "Retry failed run after synthetic integration failure.",
    });
    expect(retry.id).not.toBe(second.run!.id);
    expect(retry).toMatchObject({
      parentRunId: second.run!.id,
      runStatus: "QUEUED",
      trigger: "ADMIN_RETRY",
      queuePriority: "MANUAL_SINGLE",
    });
    const detail = await getAgentRunDetail(integrationDatabase, actor(admin.id), retry.id);
    expect(detail.parentRunId).toBe(second.run!.id);
    await expect(
      integrationDatabase.outboxEvent.findFirstOrThrow({
        where: { eventType: "agent.run.queued", aggregateId: retry.id },
      }),
    ).resolves.toMatchObject({
      aggregateType: "AgentRun",
      payload: expect.objectContaining({
        runId: retry.id,
        parentRunId: second.run!.id,
        trigger: "ADMIN_RETRY",
      }),
    });
  });

  it("dispatches each due schedule slot once and advances slot lifecycle with the run", async () => {
    const admin = await createAdmin();
    const created = await createAgent(
      integrationDatabase,
      actor(admin.id),
      createAgentSchema.parse({ persona: originalPersonaPack.personas[0] }),
    );
    await updateGlobalSettings(integrationDatabase, actor(admin.id), {
      globalDailyEntryMin: 15,
      globalDailyEntryMax: 20,
    });
    await changeAgentLifecycle(
      integrationDatabase,
      actor(admin.id),
      created.agent.profile.id,
      lifecycleChangeSchema.parse({
        status: "ACTIVE",
        reason: "Activate due slot dispatch integration fixture.",
      }),
    );
    const now = new Date("2026-07-18T12:00:00.000Z");
    const localDate = new Date("2026-07-18T00:00:00.000Z");
    const oldPlan = await integrationDatabase.agentDailyPlan.create({
      data: {
        agentProfileId: created.agent.profile.id,
        localDate: new Date("2026-07-17T00:00:00.000Z"),
        entryTarget: 2,
        topicTarget: 0,
        voteTarget: 0,
        generatedFromSettingsVersion: 1,
        randomSeed: "old-slot-dispatch-test",
      },
    });
    const currentPlan = await integrationDatabase.agentDailyPlan.create({
      data: {
        agentProfileId: created.agent.profile.id,
        localDate,
        entryTarget: 6,
        topicTarget: 0,
        voteTarget: 0,
        generatedFromSettingsVersion: 1,
        randomSeed: "current-slot-dispatch-test",
      },
    });
    const [staleSlot, dueCancelSlot, dueCompleteSlot, futureSlot] = await Promise.all([
      integrationDatabase.agentScheduleSlot.create({
        data: {
          dailyPlanId: oldPlan.id,
          agentProfileId: created.agent.profile.id,
          scheduledAt: new Date("2026-07-17T12:00:00.000Z"),
          runType: "SCHEDULED_WAKE",
          queuePriority: "SCHEDULED_CONTENT",
          desiredEntryMin: 2,
          desiredEntryMax: 2,
        },
      }),
      integrationDatabase.agentScheduleSlot.create({
        data: {
          dailyPlanId: currentPlan.id,
          agentProfileId: created.agent.profile.id,
          scheduledAt: new Date(now.getTime() - 120_000),
          runType: "SCHEDULED_WAKE",
          queuePriority: "SCHEDULED_CONTENT",
          desiredEntryMin: 2,
          desiredEntryMax: 2,
        },
      }),
      integrationDatabase.agentScheduleSlot.create({
        data: {
          dailyPlanId: currentPlan.id,
          agentProfileId: created.agent.profile.id,
          scheduledAt: new Date(now.getTime() - 60_000),
          runType: "SCHEDULED_WAKE",
          queuePriority: "SCHEDULED_CONTENT",
          desiredEntryMin: 2,
          desiredEntryMax: 2,
        },
      }),
      integrationDatabase.agentScheduleSlot.create({
        data: {
          dailyPlanId: currentPlan.id,
          agentProfileId: created.agent.profile.id,
          scheduledAt: new Date(now.getTime() + 60_000),
          runType: "SCHEDULED_WAKE",
          queuePriority: "SCHEDULED_CONTENT",
          desiredEntryMin: 2,
          desiredEntryMax: 2,
        },
      }),
    ]);
    const dispatched = await inTransaction(integrationDatabase, (transaction) =>
      dispatchDueScheduleSlots(transaction, { now, localDate, timeoutSeconds: 360 }),
    );
    expect(dispatched).toMatchObject({ queued: 2, missed: 1 });
    await expect(
      inTransaction(integrationDatabase, (transaction) =>
        dispatchDueScheduleSlots(transaction, { now, localDate, timeoutSeconds: 360 }),
      ),
    ).resolves.toMatchObject({ queued: 0, missed: 0 });
    expect(
      await integrationDatabase.agentScheduleSlot.findUniqueOrThrow({
        where: { id: staleSlot.id },
      }),
    ).toMatchObject({ status: "MISSED", runId: null });

    const cancelRun = dispatched.runs.find(
      ({ scheduleSlotId }) => scheduleSlotId === dueCancelSlot.id,
    )!;
    await cancelAgentRun(integrationDatabase, actor(admin.id), cancelRun.id, {
      reason: "Cancel dispatched schedule slot before lease verification.",
    });
    expect(
      await integrationDatabase.agentScheduleSlot.findUniqueOrThrow({
        where: { id: dueCancelSlot.id },
      }),
    ).toMatchObject({ status: "CANCELLED", runId: cancelRun.id });

    const claimed = await inTransaction(integrationDatabase, (transaction) =>
      claimNextRuntimeRun(transaction, {
        agentProfileId: created.agent.profile.id,
        workerId: "scheduler-integration-worker",
        leaseSeconds: 60,
        maxRetryCount: 2,
        writeRunsPaused: false,
        catchUpFrozen: false,
        contentSlowdownMinutes: 0,
        now,
      }),
    );
    expect(claimed?.scheduleSlotId).toBe(dueCompleteSlot.id);
    expect(
      await integrationDatabase.agentScheduleSlot.findUniqueOrThrow({
        where: { id: dueCompleteSlot.id },
      }),
    ).toMatchObject({ status: "RUNNING", runId: claimed?.id });
    await inTransaction(integrationDatabase, (transaction) =>
      finishRuntimeRunRecord(transaction, {
        runId: claimed!.id,
        agentProfileId: created.agent.profile.id,
        outcome: "SUCCEEDED",
        now: new Date(now.getTime() + 30_000),
      }),
    );
    expect(
      await integrationDatabase.agentScheduleSlot.findUniqueOrThrow({
        where: { id: dueCompleteSlot.id },
      }),
    ).toMatchObject({ status: "COMPLETED", runId: claimed?.id });
    expect(
      await integrationDatabase.agentRuntimeState.findUniqueOrThrow({
        where: { agentProfileId: created.agent.profile.id },
      }),
    ).toMatchObject({ nextScheduledAt: futureSlot.scheduledAt });
  });
});
