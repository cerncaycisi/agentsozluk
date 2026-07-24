import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ActorContext } from "@/modules/auth/domain/actor";
import {
  bulkAgentRunPreviewSchema,
  bulkAgentRunSchema,
  cancelAgentRun,
  changeAgentLifecycle,
  createAgent,
  createAgentSchema,
  createBulkAgentRuns,
  createManualAgentRun,
  getAgentRunDetail,
  lifecycleChangeSchema,
  listAgentRuns,
  manualAgentRunSchema,
  previewBulkAgentRun,
  retryAgentRun,
} from "@/modules/agents";
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
      email: `manual-admin-${suffix}@integration.test`,
      emailNormalized: `manual-admin-${suffix}@integration.test`,
      username: `manual_${suffix.slice(0, 16)}`,
      usernameNormalized: `manual_${suffix.slice(0, 16)}`,
      displayName: "Manual run admin",
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

async function createActiveAgent(adminId: string, personaIndex: number) {
  const created = await createAgent(
    integrationDatabase,
    actor(adminId),
    createAgentSchema.parse({ persona: originalPersonaPack.personas[personaIndex] }),
  );
  await changeAgentLifecycle(
    integrationDatabase,
    actor(adminId),
    created.agent.profile.id,
    lifecycleChangeSchema.parse({
      status: "ACTIVE",
      reason: "Activate the manual-run integration fixture.",
    }),
  );
  return created;
}

beforeEach(resetIntegrationDatabase);
afterAll(closeIntegrationDatabase);

describe("continuous-flow manual runs with PostgreSQL", () => {
  it("queues normal, burst and read-only work with mode-specific boundaries", async () => {
    const admin = await createAdmin();
    const created = await createActiveAgent(admin.id, 0);

    const normal = await createManualAgentRun(
      integrationDatabase,
      actor(admin.id),
      created.agent.profile.id,
      manualAgentRunSchema.parse({
        runType: "NORMAL_WAKE",
        entryTarget: 3,
        priority: "EMERGENCY",
        adminInstruction: "Focus on current public platform context only.",
      }),
    );
    expect(normal.run).toMatchObject({
      runStatus: "QUEUED",
      queuePriority: "EMERGENCY_ADMIN",
      desiredEntryMin: 3,
      desiredEntryMax: 3,
      saturationOverride: false,
      dailyMaximumOverride: false,
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

  it("previews and queues confirmed bulk work without daily projections", async () => {
    const admin = await createAdmin();
    const agents = await Promise.all([0, 1].map((index) => createActiveAgent(admin.id, index)));
    const run = {
      runType: "NORMAL_WAKE" as const,
      entryTarget: 2,
      allowTopicCreation: true,
      allowVoting: true,
      allowFollowing: true,
      allowSourceReading: true,
      provocationOverride: false,
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
    expect(preview).not.toHaveProperty("targetMissRiskChange");
    expect(preview).not.toHaveProperty("saturationOverride");
    expect(preview).not.toHaveProperty("dailyMaximumOverride");
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
    expect(emergency.runs[0]).toMatchObject({
      trigger: "ADMIN_BULK",
      queuePriority: "EMERGENCY_ADMIN",
    });
    await expect(
      integrationDatabase.auditLog.findFirstOrThrow({
        where: { action: "agent.run.bulk_queued", requestId: emergencyActor.requestId },
      }),
    ).resolves.toMatchObject({ metadata: { queuePriority: "EMERGENCY_ADMIN" } });
  });

  it("cancels queued/running work and retries terminal work with immutable lineage", async () => {
    const admin = await createAdmin();
    const created = await createActiveAgent(admin.id, 0);
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
});
