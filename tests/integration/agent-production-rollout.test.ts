import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ActorContext } from "@/modules/auth/domain/actor";
import {
  abortProductionRolloutAttempt,
  completeProductionRolloutAttempt,
  createManualAgentRun,
  manualAgentRunSchema,
  productionRolloutCheckpointSchema,
  recordProductionRolloutCheckpoint,
  startProductionRolloutAttempt,
} from "@/modules/agents";
import { productionRolloutEventTypes } from "@/modules/agents/repository/production-rollout";
import { RUNTIME_PROMPT_PROFILE_HASH } from "@/runtime/prompt-profile";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

const activeTimeProfile = {
  "07:00-10:00": 0.15,
  "10:00-14:00": 0.3,
  "14:00-19:00": 0.35,
  "19:00-23:00": 0.17,
  "23:00-07:00": 0.03,
};

interface RolloutAgentFixture {
  profileId: string;
  userId: string;
  personaVersionId: string;
}

let fixtureUuidSequence = 0;

function randomUUID(): string {
  fixtureUuidSequence += 1;
  const suffix = fixtureUuidSequence.toString(16).padStart(11, "a");
  return `aaaaaaaa-aaaa-4aaa-8aaa-a${suffix}`;
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

function plusMinutes(value: Date, minutes: number): Date {
  return new Date(value.getTime() + minutes * 60_000);
}

async function createAdmin() {
  const suffix = randomUUID().replaceAll("-", "");
  return integrationDatabase.user.create({
    data: {
      id: randomUUID(),
      kind: "HUMAN",
      role: "ADMIN",
      status: "ACTIVE",
      email: `rollout-admin-${suffix}@integration.test`,
      emailNormalized: `rollout-admin-${suffix}@integration.test`,
      username: `rollout_admin_${suffix.slice(0, 12)}`,
      usernameNormalized: `rollout_admin_${suffix.slice(0, 12)}`,
      displayName: "Rollout integration admin",
      passwordHash: "not-used",
      termsVersion: "1.0",
      termsAcceptedAt: new Date("2026-07-19T00:00:00.000Z"),
    },
  });
}

async function createTenPausedAgents(adminId: string): Promise<RolloutAgentFixture[]> {
  return integrationDatabase.$transaction(async (transaction) => {
    const agents: RolloutAgentFixture[] = [];
    for (let index = 0; index < 10; index += 1) {
      const suffix = randomUUID().replaceAll("-", "");
      const user = await transaction.user.create({
        data: {
          id: randomUUID(),
          kind: "AGENT",
          role: "USER",
          status: "ACTIVE",
          email: `rollout-agent-${suffix}@invalid.local`,
          emailNormalized: `rollout-agent-${suffix}@invalid.local`,
          username: `rollout_agent_${index}_${suffix.slice(0, 8)}`,
          usernameNormalized: `rollout_agent_${index}_${suffix.slice(0, 8)}`,
          displayName: `Rollout agent ${index + 1}`,
          bio: "Controlled production rollout integration fixture agent.",
          passwordHash: "not-used",
          loginDisabled: true,
          termsVersion: "1.0",
          termsAcceptedAt: new Date("2026-07-19T00:00:00.000Z"),
        },
      });
      const profile = await transaction.agentProfile.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          lifecycleStatus: "PAUSED",
          activeTimeProfile,
          createdById: adminId,
          updatedById: adminId,
        },
      });
      const personaVersion = await transaction.agentPersonaVersion.create({
        data: {
          id: randomUUID(),
          agentProfileId: profile.id,
          version: 1,
          persona: { fixture: true, index },
          renderedPrompt: `Controlled rollout persona ${index + 1}`,
          changeOrigin: "INITIAL",
          changeSummary: "Production rollout integration fixture persona.",
          createdById: adminId,
          validationReport: { valid: true },
        },
      });
      await transaction.agentProfile.update({
        where: { id: profile.id },
        data: { currentPersonaVersionId: personaVersion.id },
      });
      agents.push({
        profileId: profile.id,
        userId: user.id,
        personaVersionId: personaVersion.id,
      });
    }
    return agents;
  });
}

async function setRolloutState(activeAgentIds: readonly string[], runtimeEnabled: boolean) {
  await integrationDatabase.$transaction([
    integrationDatabase.agentProfile.updateMany({
      data: { lifecycleStatus: "PAUSED" },
    }),
    integrationDatabase.agentProfile.updateMany({
      where: { id: { in: [...activeAgentIds] } },
      data: { lifecycleStatus: "ACTIVE" },
    }),
    integrationDatabase.agentGlobalSettings.update({
      where: { id: "global" },
      data: {
        runtimeEnabled,
        schedulerEnabled: true,
        publicWriteEnabled: true,
        runtimeOperatingMode: "NORMAL",
      },
    }),
  ]);
}

async function beginAttempt(adminId: string, attemptId: string, commandId: string, now: Date) {
  await setRolloutState([], false);
  return startProductionRolloutAttempt(
    integrationDatabase,
    actor(adminId),
    { attemptId, commandId, reasonCode: "DAY0_START" },
    now,
  );
}

async function createManualRun(input: {
  agent: RolloutAgentFixture;
  adminId: string;
  runType: "READ_ONLY" | "DRY_RUN" | "NORMAL_WAKE";
  runStatus: "SUCCEEDED" | "CANCELLED";
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date;
  attempts: number;
}) {
  return integrationDatabase.agentRun.create({
    data: {
      id: randomUUID(),
      agentProfileId: input.agent.profileId,
      runType: input.runType,
      runStatus: input.runStatus,
      queuePriority: "MANUAL_SINGLE",
      trigger: "ADMIN_MANUAL",
      requestedById: input.adminId,
      personaVersionId: input.agent.personaVersionId,
      idempotencyKey: randomUUID(),
      availableAt: input.createdAt,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      timeoutSeconds: 600,
      desiredEntryMin: input.runType === "NORMAL_WAKE" ? 1 : 0,
      desiredEntryMax: input.runType === "NORMAL_WAKE" ? 1 : 0,
      allowTopicCreation: input.runType === "NORMAL_WAKE",
      allowVoting: input.runType === "NORMAL_WAKE",
      allowFollowing: input.runType === "NORMAL_WAKE",
      attempts: input.attempts,
      createdAt: input.createdAt,
    },
  });
}

async function createCanonicalRunOutbox(runId: string, actorId: string, createdAt: Date) {
  await integrationDatabase.outboxEvent.createMany({
    data: ["agent.run.queued", "agent.run.started", "agent.run.completed"].map(
      (eventType, index) => ({
        id: randomUUID(),
        eventType,
        aggregateType: "AgentRun",
        aggregateId: runId,
        actorId,
        actorKind: "AGENT" as const,
        requestId: randomUUID(),
        payload: { runId },
        createdAt: new Date(createdAt.getTime() + index * 1000),
      }),
    ),
  });
}

async function createGate9Evidence(
  adminId: string,
  smokeAgent: RolloutAgentFixture,
  startedAt: Date,
) {
  const readOnlyRun = await createManualRun({
    agent: smokeAgent,
    adminId,
    runType: "READ_ONLY",
    runStatus: "SUCCEEDED",
    createdAt: plusMinutes(startedAt, 1),
    startedAt: plusMinutes(startedAt, 1.1),
    finishedAt: plusMinutes(startedAt, 2),
    attempts: 1,
  });
  const dryRun = await createManualRun({
    agent: smokeAgent,
    adminId,
    runType: "DRY_RUN",
    runStatus: "SUCCEEDED",
    createdAt: plusMinutes(startedAt, 3),
    startedAt: plusMinutes(startedAt, 3.1),
    finishedAt: plusMinutes(startedAt, 4),
    attempts: 1,
  });
  await integrationDatabase.agentAction.create({
    data: {
      id: randomUUID(),
      runId: dryRun.id,
      agentProfileId: smokeAgent.profileId,
      sequence: 1,
      actionType: "CREATE_ENTRY",
      actionStatus: "REJECTED",
      input: { fixture: "dry-run-proposal" },
      provenance: { evidenceIds: [randomUUID()] },
      rejectionCode: "RUN_PUBLIC_WRITE_DISABLED",
      rejectionReason: "Dry-run integration fixture rejected the public write.",
      createdAt: plusMinutes(startedAt, 3.5),
      updatedAt: plusMinutes(startedAt, 3.5),
    },
  });

  const normalWakeRun = await createManualRun({
    agent: smokeAgent,
    adminId,
    runType: "NORMAL_WAKE",
    runStatus: "SUCCEEDED",
    createdAt: plusMinutes(startedAt, 5),
    startedAt: plusMinutes(startedAt, 5.1),
    finishedAt: plusMinutes(startedAt, 6),
    attempts: 1,
  });
  const topic = await integrationDatabase.topic.create({
    data: {
      id: randomUUID(),
      title: `Rollout topic ${randomUUID()}`,
      normalizedTitle: `rollout-topic-${randomUUID()}`,
      slug: `rollout-topic-${randomUUID()}`,
      createdById: smokeAgent.userId,
      entryCount: 1,
      lastEntryAt: plusMinutes(startedAt, 5.5),
      createdAt: plusMinutes(startedAt, 5.4),
    },
  });
  const entry = await integrationDatabase.entry.create({
    data: {
      id: randomUUID(),
      topicId: topic.id,
      authorId: smokeAgent.userId,
      body: "Controlled rollout provenance entry.",
      normalizedBody: "controlled rollout provenance entry",
      origin: "AGENT",
      status: "ACTIVE",
      createdAt: plusMinutes(startedAt, 5.5),
    },
  });
  const action = await integrationDatabase.agentAction.create({
    data: {
      id: randomUUID(),
      runId: normalWakeRun.id,
      agentProfileId: smokeAgent.profileId,
      sequence: 1,
      actionType: "CREATE_ENTRY",
      actionStatus: "SUCCEEDED",
      targetType: "ENTRY",
      targetId: entry.id,
      input: { entryId: entry.id },
      provenance: { evidenceIds: [randomUUID()], evidenceType: "PLATFORM_EVENT" },
      result: { entryId: entry.id },
      createdAt: plusMinutes(startedAt, 5.5),
      updatedAt: plusMinutes(startedAt, 5.5),
    },
  });
  await integrationDatabase.agentContentRecord.create({
    data: {
      id: randomUUID(),
      entryId: entry.id,
      agentProfileId: smokeAgent.profileId,
      runId: normalWakeRun.id,
      actionId: action.id,
      createdAt: plusMinutes(startedAt, 5.5),
    },
  });
  await integrationDatabase.auditLog.create({
    data: {
      actorId: smokeAgent.userId,
      action: "agent.run.completed",
      entityType: "AgentRun",
      entityId: normalWakeRun.id,
      requestId: randomUUID(),
      metadata: { runId: normalWakeRun.id },
      createdAt: plusMinutes(startedAt, 6),
    },
  });
  await integrationDatabase.agentRuntimeEvent.create({
    data: {
      agentProfileId: smokeAgent.profileId,
      runId: normalWakeRun.id,
      eventType: "run.succeeded",
      safeMessage: "Controlled rollout normal wake completed.",
      metadata: { runId: normalWakeRun.id },
      occurredAt: plusMinutes(startedAt, 6),
      createdAt: plusMinutes(startedAt, 6),
    },
  });
  await createCanonicalRunOutbox(normalWakeRun.id, smokeAgent.userId, normalWakeRun.createdAt);

  const gracefulStoppedRun = await createManualRun({
    agent: smokeAgent,
    adminId,
    runType: "NORMAL_WAKE",
    runStatus: "CANCELLED",
    createdAt: plusMinutes(startedAt, 7),
    startedAt: plusMinutes(startedAt, 7.1),
    finishedAt: plusMinutes(startedAt, 8),
    attempts: 1,
  });
  const pendingCancelledRun = await createManualRun({
    agent: smokeAgent,
    adminId,
    runType: "NORMAL_WAKE",
    runStatus: "CANCELLED",
    createdAt: plusMinutes(startedAt, 9),
    startedAt: null,
    finishedAt: plusMinutes(startedAt, 10),
    attempts: 0,
  });

  const report = await integrationDatabase.report.create({
    data: {
      id: randomUUID(),
      reporterId: adminId,
      targetType: "ENTRY",
      targetId: entry.id,
      reason: "OTHER",
      details: "Controlled rollout moderation proof report.",
      status: "REJECTED",
      handledById: adminId,
      handledAt: plusMinutes(startedAt, 12),
      resolutionNote: "Controlled takedown and restore proof completed.",
      createdAt: plusMinutes(startedAt, 10.5),
      updatedAt: plusMinutes(startedAt, 12),
    },
  });
  await integrationDatabase.moderationAction.createMany({
    data: [
      {
        id: randomUUID(),
        moderatorId: adminId,
        actionType: "ENTRY_HIDDEN",
        targetType: "ENTRY",
        targetId: entry.id,
        reason: "Controlled rollout takedown proof.",
        metadata: { before: { status: "ACTIVE" }, after: { status: "HIDDEN" } },
        createdAt: plusMinutes(startedAt, 11),
      },
      {
        id: randomUUID(),
        moderatorId: adminId,
        actionType: "ENTRY_RESTORED",
        targetType: "ENTRY",
        targetId: entry.id,
        reason: "Controlled rollout restore proof.",
        metadata: { before: { status: "HIDDEN" }, after: { status: "ACTIVE" } },
        createdAt: plusMinutes(startedAt, 12),
      },
    ],
  });
  await integrationDatabase.auditLog.createMany({
    data: [
      {
        id: randomUUID(),
        actorId: adminId,
        action: "entry.hidden",
        entityType: "Entry",
        entityId: entry.id,
        requestId: randomUUID(),
        metadata: { status: "HIDDEN" },
        createdAt: plusMinutes(startedAt, 11),
      },
      {
        id: randomUUID(),
        actorId: adminId,
        action: "entry.restored",
        entityType: "Entry",
        entityId: entry.id,
        requestId: randomUUID(),
        metadata: { status: "ACTIVE" },
        createdAt: plusMinutes(startedAt, 12),
      },
    ],
  });
  return {
    readOnlyRunId: readOnlyRun.id,
    dryRunId: dryRun.id,
    normalWakeRunId: normalWakeRun.id,
    normalWakeEntryId: entry.id,
    reportId: report.id,
    pendingCancelledRunId: pendingCancelledRun.id,
    gracefulStoppedRunId: gracefulStoppedRun.id,
  };
}

async function createCapacityPlans(
  agents: readonly RolloutAgentFixture[],
  localDate: Date,
  createdAt: Date,
) {
  const settings = await integrationDatabase.agentGlobalSettings.findUniqueOrThrow({
    where: { id: "global" },
    select: { settingsVersion: true },
  });
  const snapshot = await integrationDatabase.agentCapacitySnapshot.create({
    data: {
      id: randomUUID(),
      localDate,
      concurrency: 1,
      availableMinutes: 720,
      reserveFactor: 0.75,
      plannedRuns: agents.length,
      p75DurationMs: 60_000,
      estimatedUtilization: 0.1,
      estimatedPublishedMin: agents.length,
      estimatedPublishedMax: agents.length,
      capacityStatus: "HEALTHY",
      createdAt,
    },
  });
  const planIds = new Map<string, string>();
  for (const [index, agent] of agents.entries()) {
    const plan = await integrationDatabase.agentDailyPlan.create({
      data: {
        id: randomUUID(),
        agentProfileId: agent.profileId,
        localDate,
        entryTarget: 1,
        topicTarget: 0,
        voteTarget: 0,
        generatedFromSettingsVersion: settings.settingsVersion,
        randomSeed: `rollout-${index}-${randomUUID()}`,
        capacitySnapshotId: snapshot.id,
        status: "ACTIVE",
        createdAt,
      },
    });
    planIds.set(agent.profileId, plan.id);
  }
  return { snapshot, planIds };
}

async function createScheduledRun(input: {
  agent: RolloutAgentFixture;
  dailyPlanId: string;
  createdAt: Date;
  usageMetadata?: { model: string; promptProfileHash: string };
}) {
  const slot = await integrationDatabase.agentScheduleSlot.create({
    data: {
      id: randomUUID(),
      dailyPlanId: input.dailyPlanId,
      agentProfileId: input.agent.profileId,
      scheduledAt: input.createdAt,
      runType: "SCHEDULED_WAKE",
      queuePriority: "SCHEDULED_CONTENT",
      desiredEntryMin: 0,
      desiredEntryMax: 1,
      status: "PLANNED",
      attempts: 1,
      createdAt: input.createdAt,
    },
  });
  const run = await integrationDatabase.agentRun.create({
    data: {
      id: randomUUID(),
      agentProfileId: input.agent.profileId,
      runType: "SCHEDULED_WAKE",
      runStatus: "SUCCEEDED",
      queuePriority: "SCHEDULED_CONTENT",
      trigger: "SCHEDULER_SLOT",
      scheduleSlotId: slot.id,
      personaVersionId: input.agent.personaVersionId,
      idempotencyKey: `schedule-slot:${slot.id}`,
      availableAt: input.createdAt,
      startedAt: new Date(input.createdAt.getTime() + 1000),
      finishedAt: new Date(input.createdAt.getTime() + 61_000),
      timeoutSeconds: 360,
      desiredEntryMin: 0,
      desiredEntryMax: 1,
      attempts: 1,
      createdAt: input.createdAt,
      ...(input.usageMetadata ? { usageMetadata: input.usageMetadata } : {}),
    },
  });
  await integrationDatabase.agentScheduleSlot.update({
    where: { id: slot.id },
    data: { runId: run.id, status: "COMPLETED" },
  });
  await createCanonicalRunOutbox(run.id, input.agent.userId, input.createdAt);
  return run;
}

beforeEach(resetIntegrationDatabase);
afterAll(closeIntegrationDatabase);

describe("production rollout application contract with PostgreSQL", () => {
  it("uses the real admin manual trigger accepted by Gate 9", async () => {
    const admin = await createAdmin();
    const agents = await createTenPausedAgents(admin.id);
    const now = new Date("2026-07-19T01:00:00.000Z");
    await setRolloutState([agents[0]!.profileId], false);

    const queued = await createManualAgentRun(
      integrationDatabase,
      actor(admin.id),
      agents[0]!.profileId,
      manualAgentRunSchema.parse({
        runType: "READ_ONLY",
        entryTarget: 0,
        allowTopicCreation: false,
        allowVoting: false,
        allowFollowing: false,
        allowSourceReading: true,
        saturationOverride: false,
        dailyMaximumOverride: false,
        provocationOverride: false,
        availableAt: now,
        priority: "NORMAL",
      }),
      now,
    );

    expect(queued).toMatchObject({
      runType: "READ_ONLY",
      queuePriority: "MANUAL_SINGLE",
      trigger: "ADMIN_MANUAL",
    });
  });

  it("rejects completion when mandatory checkpoint evidence is missing", async () => {
    const admin = await createAdmin();
    const agents = await createTenPausedAgents(admin.id);
    const now = new Date("2026-07-19T01:00:00.000Z");
    const attemptId = randomUUID();
    await beginAttempt(admin.id, attemptId, randomUUID(), now);
    await setRolloutState(
      agents.map(({ profileId }) => profileId),
      true,
    );

    await expect(
      completeProductionRolloutAttempt(
        integrationDatabase,
        actor(admin.id),
        { attemptId, commandId: randomUUID(), reasonCode: "DAY0_COMPLETE" },
        plusMinutes(now, 1),
      ),
    ).rejects.toMatchObject({ code: "AGENT_LIFECYCLE_INVALID", status: 409 });
    expect(
      await integrationDatabase.agentRuntimeEvent.count({
        where: { eventType: productionRolloutEventTypes.attemptCompleted },
      }),
    ).toBe(0);
  }, 60_000);

  it("rejects wrong/stale attempts and conflicting commands while replaying one checkpoint exactly", async () => {
    const admin = await createAdmin();
    const agents = await createTenPausedAgents(admin.id);
    const now = new Date("2026-07-19T01:00:00.000Z");
    const attemptId = randomUUID();
    const startCommandId = randomUUID();
    const started = await beginAttempt(admin.id, attemptId, startCommandId, now);
    await expect(
      startProductionRolloutAttempt(
        integrationDatabase,
        actor(admin.id),
        { attemptId, commandId: startCommandId, reasonCode: "DAY0_START" },
        now,
      ),
    ).resolves.toMatchObject({ eventId: started.eventId, replayed: true });
    await expect(
      startProductionRolloutAttempt(
        integrationDatabase,
        actor(admin.id),
        { attemptId: randomUUID(), commandId: startCommandId, reasonCode: "DAY0_START" },
        now,
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    await expect(
      startProductionRolloutAttempt(
        integrationDatabase,
        actor(admin.id),
        { attemptId, commandId: randomUUID(), reasonCode: "DAY0_START" },
        now,
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });

    await integrationDatabase.agentRuntimeEvent.create({
      data: {
        eventType: productionRolloutEventTypes.gate9Completed,
        safeMessage: "Gate 9 prerequisite fixture.",
        metadata: { attemptId, localDate: "2026-07-19" },
        occurredAt: plusMinutes(now, 1),
        createdAt: plusMinutes(now, 1),
      },
    });
    await setRolloutState(
      agents.slice(0, 5).map(({ profileId }) => profileId),
      true,
    );
    const checkpointCommandId = randomUUID();
    const checkpointInput = productionRolloutCheckpointSchema.parse({
      kind: "GATE10_STARTED",
      attemptId,
      commandId: checkpointCommandId,
    });
    const checkpoint = await recordProductionRolloutCheckpoint(
      integrationDatabase,
      actor(admin.id),
      checkpointInput,
      plusMinutes(now, 2),
    );
    await expect(
      recordProductionRolloutCheckpoint(
        integrationDatabase,
        actor(admin.id),
        checkpointInput,
        plusMinutes(now, 2),
      ),
    ).resolves.toMatchObject({ eventId: checkpoint.eventId, replayed: true });
    await expect(
      recordProductionRolloutCheckpoint(
        integrationDatabase,
        actor(admin.id),
        { ...checkpointInput, attemptId: randomUUID() },
        plusMinutes(now, 2),
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    await expect(
      recordProductionRolloutCheckpoint(
        integrationDatabase,
        actor(admin.id),
        {
          kind: "GATE11_STARTED",
          attemptId,
          commandId: checkpointCommandId,
        },
        plusMinutes(now, 2),
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    await expect(
      recordProductionRolloutCheckpoint(
        integrationDatabase,
        actor(admin.id),
        { ...checkpointInput, commandId: randomUUID() },
        plusMinutes(now, 2),
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    await expect(
      recordProductionRolloutCheckpoint(
        integrationDatabase,
        actor(admin.id),
        {
          kind: "GATE10_STARTED",
          attemptId: randomUUID(),
          commandId: randomUUID(),
        },
        plusMinutes(now, 2),
      ),
    ).rejects.toMatchObject({ code: "AGENT_LIFECYCLE_INVALID", status: 409 });

    expect(
      await integrationDatabase.agentRuntimeEvent.count({
        where: {
          eventType: productionRolloutEventTypes.gate10Started,
          metadata: { path: ["attemptId"], equals: attemptId },
        },
      }),
    ).toBe(1);
    expect(
      await integrationDatabase.auditLog.count({
        where: {
          action: "agent.rollout_checkpoint.recorded",
          metadata: { path: ["commandId"], equals: checkpointCommandId },
        },
      }),
    ).toBe(1);
    expect(
      await integrationDatabase.outboxEvent.count({
        where: {
          eventType: "agent.rollout_checkpoint.recorded",
          payload: { path: ["commandId"], equals: checkpointCommandId },
        },
      }),
    ).toBe(1);
  }, 60_000);

  it("accepts Gate 9 through Gate 12 and completes exactly once from relational evidence", async () => {
    const admin = await createAdmin();
    const agents = await createTenPausedAgents(admin.id);
    const attemptStartedAt = new Date("2026-07-19T01:00:00.000Z");
    const attemptId = randomUUID();
    await beginAttempt(admin.id, attemptId, randomUUID(), attemptStartedAt);

    const gate9Evidence = await createGate9Evidence(admin.id, agents[0]!, attemptStartedAt);
    const gate9At = plusMinutes(attemptStartedAt, 15);
    await recordProductionRolloutCheckpoint(
      integrationDatabase,
      actor(admin.id),
      productionRolloutCheckpointSchema.parse({
        kind: "GATE9_ACCEPTED",
        attemptId,
        commandId: randomUUID(),
        smokeProfileId: agents[0]!.profileId,
        ...gate9Evidence,
        healthStatus: 200,
        readinessStatus: 200,
        publicSurfacesPassed: true,
        humanV1FlowPassed: true,
        roleDenialPassed: true,
        metadataLeakCount: 0,
        takedownRestorePassed: true,
      }),
      gate9At,
    );

    const cohort = agents.slice(0, 5);
    await setRolloutState(
      cohort.map(({ profileId }) => profileId),
      true,
    );
    const gate10StartedAt = plusMinutes(attemptStartedAt, 20);
    await recordProductionRolloutCheckpoint(
      integrationDatabase,
      actor(admin.id),
      productionRolloutCheckpointSchema.parse({
        kind: "GATE10_STARTED",
        attemptId,
        commandId: randomUUID(),
      }),
      gate10StartedAt,
    );
    const localDate = new Date("2026-07-19T00:00:00.000Z");
    const { planIds } = await createCapacityPlans(
      cohort,
      localDate,
      new Date(gate10StartedAt.getTime() + 30_000),
    );
    for (const [index, agent] of cohort.entries())
      await createScheduledRun({
        agent,
        dailyPlanId: planIds.get(agent.profileId)!,
        createdAt: plusMinutes(gate10StartedAt, 2 + index * 2),
      });

    const sampleMinutes = [0, 30, 60, 90, 120] as const;
    for (const [sampleIndex, minute] of sampleMinutes.entries())
      await recordProductionRolloutCheckpoint(
        integrationDatabase,
        actor(admin.id),
        productionRolloutCheckpointSchema.parse({
          kind: "GATE10_SAMPLED",
          attemptId,
          commandId: randomUUID(),
          sampleIndex,
          workerProcessCount: 1,
          workerRestartCount: 0,
          workerRssMb: 256,
          healthStatus: 200,
          readinessStatus: 200,
          metadataLeakCount: 0,
          takedownPassed: true,
        }),
        plusMinutes(gate10StartedAt, minute),
      );
    const gate10CompletedAt = plusMinutes(gate10StartedAt, 120);
    await recordProductionRolloutCheckpoint(
      integrationDatabase,
      actor(admin.id),
      productionRolloutCheckpointSchema.parse({
        kind: "GATE10_ACCEPTED",
        attemptId,
        commandId: randomUUID(),
      }),
      gate10CompletedAt,
    );

    await setRolloutState(
      agents.map(({ profileId }) => profileId),
      true,
    );
    const gate11StartedAt = plusMinutes(gate10CompletedAt, 5);
    await recordProductionRolloutCheckpoint(
      integrationDatabase,
      actor(admin.id),
      productionRolloutCheckpointSchema.parse({
        kind: "GATE11_STARTED",
        attemptId,
        commandId: randomUUID(),
      }),
      gate11StartedAt,
    );
    for (const [index, agent] of cohort.slice(0, 3).entries())
      await createScheduledRun({
        agent,
        dailyPlanId: planIds.get(agent.profileId)!,
        createdAt: plusMinutes(gate11StartedAt, 1 + index * 2),
      });
    const gate11CompletedAt = plusMinutes(gate11StartedAt, 8);
    await recordProductionRolloutCheckpoint(
      integrationDatabase,
      actor(admin.id),
      productionRolloutCheckpointSchema.parse({
        kind: "GATE11_ACCEPTED",
        attemptId,
        commandId: randomUUID(),
      }),
      gate11CompletedAt,
    );

    await setRolloutState(
      agents.map(({ profileId }) => profileId),
      false,
    );
    const gitSha = "a".repeat(40);
    const ledgerHash = "b".repeat(64);
    const gate12PreAt = plusMinutes(gate11CompletedAt, 2);
    await recordProductionRolloutCheckpoint(
      integrationDatabase,
      actor(admin.id),
      productionRolloutCheckpointSchema.parse({
        kind: "GATE12_PRE_REBOOT",
        attemptId,
        commandId: randomUUID(),
        bootIdHash: "c".repeat(64),
        ledgerIntegrityHash: ledgerHash,
        ledgerRowCount: 100,
        workerProcessCount: 1,
        runtimeServiceActive: true,
        productionGitSha: gitSha,
        mainGitSha: gitSha,
        backupChecksum: "d".repeat(64),
        restoreFingerprint: "e".repeat(64),
      }),
      gate12PreAt,
    );
    const gate12PostAt = plusMinutes(gate12PreAt, 2);
    await recordProductionRolloutCheckpoint(
      integrationDatabase,
      actor(admin.id),
      productionRolloutCheckpointSchema.parse({
        kind: "GATE12_POST_REBOOT",
        attemptId,
        commandId: randomUUID(),
        bootIdHash: "f".repeat(64),
        ledgerIntegrityHash: ledgerHash,
        ledgerRowCount: 100,
        workerProcessCount: 1,
        runtimeServiceActive: true,
        appContainerRunning: true,
        databaseContainerRunning: true,
        healthStatus: 200,
        readinessStatus: 200,
        productionGitSha: gitSha,
        mainGitSha: gitSha,
        ciRunId: "12345",
        ciPassed: true,
      }),
      gate12PostAt,
    );

    await setRolloutState(
      agents.map(({ profileId }) => profileId),
      true,
    );
    const postResumeRun = await createScheduledRun({
      agent: cohort[3]!,
      dailyPlanId: planIds.get(cohort[3]!.profileId)!,
      createdAt: plusMinutes(gate12PostAt, 1),
      usageMetadata: {
        model: "codex-cli 0.144.6",
        promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
      },
    });
    const gate12CompletedAt = plusMinutes(gate12PostAt, 4);
    await recordProductionRolloutCheckpoint(
      integrationDatabase,
      actor(admin.id),
      productionRolloutCheckpointSchema.parse({
        kind: "GATE12_ACCEPTED",
        attemptId,
        commandId: randomUUID(),
        postResumeScheduledRunId: postResumeRun.id,
        repeatedHumanSmokePassed: true,
        repeatedRoleDenialPassed: true,
        repeatedMetadataScanPassed: true,
        repeatedTakedownRestorePassed: true,
        noDuplicateLeaseOrCatchUpBurst: true,
      }),
      gate12CompletedAt,
    );

    await integrationDatabase.agentRuntimeCapability.create({
      data: {
        id: randomUUID(),
        codexVersion: "codex-cli 0.144.6",
        promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
        benchmarkRunCount: 10,
        p50DurationMs: 45_000,
        p75DurationMs: 60_000,
        p95DurationMs: 90_000,
        maxDurationMs: 120_000,
        singleProcessPeakRssMb: 180,
        dualProcessPeakRssMb: 340,
        dualConcurrencySupported: true,
        appLatencyImpact: { stable: true },
        databaseLatencyImpact: { stable: true },
        availableMemoryMb: 1024,
        capacityStatus: "HEALTHY",
        measuredAt: plusMinutes(gate12CompletedAt, -1),
        staleAt: plusMinutes(gate12CompletedAt, 24 * 60),
      },
    });

    const completeCommandId = randomUUID();
    const completedAt = plusMinutes(gate12CompletedAt, 1);
    const completed = await completeProductionRolloutAttempt(
      integrationDatabase,
      actor(admin.id),
      { attemptId, commandId: completeCommandId, reasonCode: "DAY0_COMPLETE" },
      completedAt,
    );
    expect(completed).toMatchObject({ status: "COMPLETED", replayed: false });
    await expect(
      completeProductionRolloutAttempt(
        integrationDatabase,
        actor(admin.id),
        { attemptId, commandId: completeCommandId, reasonCode: "DAY0_COMPLETE" },
        completedAt,
      ),
    ).resolves.toMatchObject({ eventId: completed.eventId, status: "COMPLETED", replayed: true });

    expect(
      await integrationDatabase.agentRuntimeEvent.count({
        where: {
          eventType: productionRolloutEventTypes.attemptCompleted,
          metadata: { path: ["attemptId"], equals: attemptId },
        },
      }),
    ).toBe(1);
    expect(
      await integrationDatabase.agentRuntimeEvent.count({
        where: {
          eventType: productionRolloutEventTypes.gate10Checkpoint,
          metadata: { path: ["attemptId"], equals: attemptId },
        },
      }),
    ).toBe(5);
    expect(
      await integrationDatabase.auditLog.count({
        where: {
          action: "agent.rollout_checkpoint.recorded",
          metadata: { path: ["attemptId"], equals: attemptId },
        },
      }),
    ).toBe(13);
    expect(
      await integrationDatabase.outboxEvent.count({
        where: {
          eventType: "agent.rollout_checkpoint.recorded",
          payload: { path: ["attemptId"], equals: attemptId },
        },
      }),
    ).toBe(13);
  }, 120_000);

  it("rejects replaying a same-day aborted attempt's Gate 9 evidence in a new attempt", async () => {
    const admin = await createAdmin();
    const agents = await createTenPausedAgents(admin.id);
    const firstStartedAt = new Date("2026-07-19T01:00:00.000Z");
    const firstAttemptId = randomUUID();
    await beginAttempt(admin.id, firstAttemptId, randomUUID(), firstStartedAt);
    const gate9Evidence = await createGate9Evidence(admin.id, agents[0]!, firstStartedAt);
    const gate9Receipt = {
      smokeProfileId: agents[0]!.profileId,
      ...gate9Evidence,
      healthStatus: 200 as const,
      readinessStatus: 200 as const,
      publicSurfacesPassed: true as const,
      humanV1FlowPassed: true as const,
      roleDenialPassed: true as const,
      metadataLeakCount: 0 as const,
      takedownRestorePassed: true as const,
    };

    await recordProductionRolloutCheckpoint(
      integrationDatabase,
      actor(admin.id),
      productionRolloutCheckpointSchema.parse({
        kind: "GATE9_ACCEPTED",
        attemptId: firstAttemptId,
        commandId: randomUUID(),
        ...gate9Receipt,
      }),
      plusMinutes(firstStartedAt, 15),
    );
    await abortProductionRolloutAttempt(
      integrationDatabase,
      actor(admin.id),
      { attemptId: firstAttemptId, commandId: randomUUID(), reasonCode: "DAY0_ABORT" },
      plusMinutes(firstStartedAt, 16),
    );

    const secondAttemptId = randomUUID();
    const secondStartedAt = plusMinutes(firstStartedAt, 20);
    await beginAttempt(admin.id, secondAttemptId, randomUUID(), secondStartedAt);
    await expect(
      recordProductionRolloutCheckpoint(
        integrationDatabase,
        actor(admin.id),
        productionRolloutCheckpointSchema.parse({
          kind: "GATE9_ACCEPTED",
          attemptId: secondAttemptId,
          commandId: randomUUID(),
          ...gate9Receipt,
        }),
        plusMinutes(secondStartedAt, 1),
      ),
    ).rejects.toMatchObject({
      code: "AGENT_LIFECYCLE_INVALID",
      status: 409,
      details: {
        failures: expect.arrayContaining(["SMOKE_RUN_OUTSIDE_ATTEMPT_WINDOW"]),
      },
    });
    expect(
      await integrationDatabase.agentRuntimeEvent.count({
        where: {
          eventType: productionRolloutEventTypes.gate9Completed,
          metadata: { path: ["attemptId"], equals: secondAttemptId },
        },
      }),
    ).toBe(0);
  }, 60_000);
});
