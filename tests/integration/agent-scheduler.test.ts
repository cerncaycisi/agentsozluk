import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { inTransaction } from "@/lib/db/transaction";
import type { ActorContext } from "@/modules/auth/domain/actor";
import {
  changeAgentLifecycle,
  bulkAgentRunPreviewSchema,
  bulkAgentRunSchema,
  cancelAgentRun,
  createAgent,
  createBulkAgentRuns,
  createAgentSchema,
  createManualAgentRun,
  generateAgentDailyPlans,
  getAgentRunDetail,
  lifecycleChangeSchema,
  listAgentRuns,
  manualAgentRunSchema,
  previewBulkAgentRun,
  retryAgentRun,
  updateGlobalSettings,
} from "@/modules/agents";
import { claimNextRuntimeRun, finishRuntimeRunRecord } from "@/modules/agents/repository/runtime";
import {
  dispatchDueScheduleSlots,
  planRuntimeMaintenanceAndCatchUp,
} from "@/modules/agents/repository/scheduler";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
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

beforeEach(resetIntegrationDatabase);
afterAll(closeIntegrationDatabase);

describe("agent daily scheduler with PostgreSQL", () => {
  it("creates deterministic idempotent plans after capacity evaluation", async () => {
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
          reason: "Activate deterministic scheduler integration fixture.",
        }),
      );
    }
    const localDate = new Date("2026-07-18T00:00:00.000Z");
    const [first, replay] = await Promise.all([
      generateAgentDailyPlans(integrationDatabase, actor(admin.id), { localDate }),
      generateAgentDailyPlans(integrationDatabase, actor(admin.id), { localDate }),
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
  });

  it("queues idempotent nightly, weekly and bounded evening catch-up work", async () => {
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
        reason: "Activate maintenance scheduler integration fixture.",
      }),
    );
    const localDate = new Date("2026-07-19T00:00:00.000Z");
    await generateAgentDailyPlans(integrationDatabase, actor(admin.id), { localDate });
    await integrationDatabase.agentScheduleSlot.updateMany({
      where: { agentProfileId: created.agent.profile.id, dailyPlan: { localDate } },
      data: { status: "COMPLETED" },
    });
    const stale = await integrationDatabase.agentRun.create({
      data: {
        agentProfileId: created.agent.profile.id,
        runType: "DAILY_CATCH_UP",
        queuePriority: "DAILY_CATCH_UP",
        trigger: "AUTO_CATCH_UP",
        personaVersionId: created.agent.personaVersion.id,
        idempotencyKey: randomUUID(),
        timeoutSeconds: 360,
        desiredEntryMin: 1,
        desiredEntryMax: 4,
        createdAt: new Date("2026-07-18T10:00:00.000Z"),
      },
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
      }),
    );
    expect(first).toEqual({ maintenanceQueued: 3, catchUpQueued: 1 });
    expect(
      await integrationDatabase.agentRun.findUniqueOrThrow({ where: { id: stale.id } }),
    ).toMatchObject({ runStatus: "CANCELLED", errorCode: "CATCH_UP_DAY_EXPIRED" });
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
      }),
    );
    expect(replay).toEqual({ maintenanceQueued: 0, catchUpQueued: 0 });
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
    expect(normal).toMatchObject({
      runStatus: "QUEUED",
      queuePriority: "EMERGENCY_ADMIN",
      desiredEntryMin: 3,
      desiredEntryMax: 3,
      dailyMaximumOverride: true,
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
    expect(readOnly).toMatchObject({
      desiredEntryMin: 0,
      desiredEntryMax: 0,
      allowTopicCreation: false,
      allowVoting: false,
      allowFollowing: false,
      allowSourceReading: true,
    });
    expect(
      await listAgentRuns(integrationDatabase, actor(admin.id), created.agent.profile.id),
    ).toHaveLength(2);
    expect(
      await integrationDatabase.auditLog.count({ where: { action: "agent.run.queued" } }),
    ).toBe(2);
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
    const cancelled = await cancelAgentRun(integrationDatabase, actor(admin.id), first.id, {
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
      where: { id: second.id },
      data: {
        runStatus: "RUNNING",
        leaseOwner: "integration-worker",
        leaseExpiresAt: new Date(Date.now() + 60_000),
        startedAt: new Date(),
      },
    });
    const cancelling = await cancelAgentRun(integrationDatabase, actor(admin.id), second.id, {
      reason: "Request graceful running cancellation in integration verification.",
    });
    expect(cancelling).toMatchObject({
      runStatus: "CANCEL_REQUESTED",
      leaseOwner: "integration-worker",
    });
    expect(cancelling.finishedAt).toBeNull();

    await integrationDatabase.agentRun.update({
      where: { id: second.id },
      data: {
        runStatus: "FAILED",
        leaseOwner: null,
        leaseExpiresAt: null,
        finishedAt: new Date(),
        errorCode: "INTEGRATION_FAILURE",
        errorSummary: "Synthetic terminal state for retry verification.",
      },
    });
    const retry = await retryAgentRun(integrationDatabase, actor(admin.id), second.id, {
      reason: "Retry failed run after synthetic integration failure.",
    });
    expect(retry.id).not.toBe(second.id);
    expect(retry).toMatchObject({
      parentRunId: second.id,
      runStatus: "QUEUED",
      trigger: "ADMIN_RETRY",
      queuePriority: "MANUAL_SINGLE",
    });
    const detail = await getAgentRunDetail(integrationDatabase, actor(admin.id), retry.id);
    expect(detail.parentRunId).toBe(second.id);
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
