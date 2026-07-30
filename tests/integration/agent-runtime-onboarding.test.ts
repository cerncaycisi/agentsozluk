import { generateKeyPairSync, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActorContext } from "@/modules/auth/domain/actor";
import {
  acknowledgeRuntimeCredentialRoster,
  bulkAgentRunPreviewSchema,
  bulkAgentRunSchema,
  changeAgentLifecycle,
  createAgent,
  createAgentSchema,
  createBulkAgentRuns,
  getRuntimeCapacity,
  getRuntimeCredentialRoster,
  lifecycleChangeSchema,
  previewBulkAgentRun,
  runRuntimeStochasticTick,
} from "@/modules/agents";
import type { RuntimePrincipal } from "@/modules/agents/application/runtime-auth";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import { getStochasticSchedulerSnapshot } from "@/modules/agents/repository/stochastic-scheduler";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

function adminActor(actorId: string): ActorContext {
  return {
    actorId,
    actorKind: "HUMAN",
    actorRole: "ADMIN",
    requestId: randomUUID(),
    origin: "API",
  };
}

async function createAdmin() {
  const suffix = randomUUID().replaceAll("-", "");
  return integrationDatabase.user.create({
    data: {
      kind: "HUMAN",
      role: "ADMIN",
      status: "ACTIVE",
      email: `onboarding-${suffix}@integration.test`,
      emailNormalized: `onboarding-${suffix}@integration.test`,
      username: `onboarding_${suffix.slice(0, 16)}`,
      usernameNormalized: `onboarding_${suffix.slice(0, 16)}`,
      displayName: "Runtime onboarding admin",
      passwordHash: "not-used",
      termsVersion: "1.0",
      termsAcceptedAt: new Date(),
    },
  });
}

beforeEach(resetIntegrationDatabase);
afterEach(() => {
  delete process.env.AGENT_RUNTIME_ENROLLMENT_PUBLIC_KEY_B64;
  vi.unstubAllEnvs();
});
afterAll(closeIntegrationDatabase);

describe("runtime onboarding and orphan queue recovery with PostgreSQL", () => {
  it("tracks worker boot, restart and safe lane telemetry through roster acknowledgements", async () => {
    const admin = await createAdmin();
    const created = await createAgent(
      integrationDatabase,
      adminActor(admin.id),
      createAgentSchema.parse({
        persona: originalPersonaPack.personas[0],
        lifecycleStatus: "PAUSED",
      }),
    );
    const credential = await integrationDatabase.agentCredential.findFirstOrThrow({
      where: { agentProfileId: created.agent.profile.id, revokedAt: null },
    });
    const principal: RuntimePrincipal = {
      credentialId: credential.id,
      agentProfileId: created.agent.profile.id,
      lifecycleStatus: "PAUSED",
      actor: {
        actorId: created.agent.user.id,
        actorKind: "AGENT",
        actorRole: "USER",
        requestId: randomUUID(),
        origin: "AGENT",
      },
    };
    const firstSeenAt = new Date("2026-07-29T12:00:00.000Z");
    const firstBootId = randomUUID();
    const roster = await getRuntimeCredentialRoster(
      integrationDatabase,
      principal,
      "production-worker",
      firstSeenAt,
    );
    const baseInput = {
      workerId: "production-worker",
      desiredFingerprint: roster.desiredFingerprint,
      loadedCredentialIds: [credential.id],
      workerTelemetry: {
        bootId: firstBootId,
        processingLanes: 2,
        codexVersion: "codex-cli 0.150.0",
        promptProfileHash: "a".repeat(64),
        startedAt: firstSeenAt.toISOString(),
      },
    };

    await expect(
      acknowledgeRuntimeCredentialRoster(integrationDatabase, principal, baseInput, firstSeenAt),
    ).resolves.toMatchObject({
      workerTelemetry: {
        bootId: firstBootId,
        processingLanes: 2,
        restartCount: 0,
      },
    });

    const sameBootAt = new Date(firstSeenAt.getTime() + 30_000);
    await acknowledgeRuntimeCredentialRoster(
      integrationDatabase,
      principal,
      {
        ...baseInput,
        workerTelemetry: {
          ...baseInput.workerTelemetry,
          startedAt: sameBootAt.toISOString(),
        },
      },
      sameBootAt,
    );
    await expect(
      integrationDatabase.agentRuntimeCredentialSync.findUniqueOrThrow({
        where: { id: "global" },
      }),
    ).resolves.toMatchObject({
      workerBootId: firstBootId,
      workerStartedAt: firstSeenAt,
      workerRestartCount: 0,
    });

    const restartedAt = new Date(firstSeenAt.getTime() + 60_000);
    const secondBootId = randomUUID();
    await acknowledgeRuntimeCredentialRoster(
      integrationDatabase,
      principal,
      {
        ...baseInput,
        workerTelemetry: {
          ...baseInput.workerTelemetry,
          bootId: secondBootId,
          startedAt: restartedAt.toISOString(),
        },
      },
      restartedAt,
    );
    const observedAt = new Date(restartedAt.getTime() + 10_000);
    const activeStartedAt = new Date(observedAt.getTime() - 5_000);
    const activeRun = await integrationDatabase.agentRun.create({
      data: {
        agentProfileId: created.agent.profile.id,
        personaVersionId: created.agent.personaVersion.id,
        runType: "NORMAL_WAKE",
        runStatus: "RUNNING",
        queuePriority: "SCHEDULED_CONTENT",
        trigger: "WORKER_TELEMETRY_ACTIVE_FIXTURE",
        idempotencyKey: `worker-telemetry-active:${randomUUID()}`,
        timeoutSeconds: 600,
        desiredEntryMin: 0,
        desiredEntryMax: 1,
        createdAt: new Date(activeStartedAt.getTime() - 2_000),
        startedAt: activeStartedAt,
        heartbeatAt: new Date(observedAt.getTime() - 1_000),
        leaseOwner: "production-worker",
        leaseToken: "a".repeat(43),
        leaseExpiresAt: new Date(observedAt.getTime() + 50_000),
      },
    });
    await integrationDatabase.agentRuntimeEvent.create({
      data: {
        agentProfileId: created.agent.profile.id,
        runId: activeRun.id,
        eventType: "agent.heartbeat",
        safeMessage: "Worker telemetry integration heartbeat.",
        metadata: { runtimeStatus: "THINKING" },
        occurredAt: new Date(observedAt.getTime() - 1_000),
        createdAt: new Date(observedAt.getTime() - 1_000),
      },
    });
    const terminalStartedAt = new Date(observedAt.getTime() - 20_000);
    const terminalRun = await integrationDatabase.agentRun.create({
      data: {
        agentProfileId: created.agent.profile.id,
        personaVersionId: created.agent.personaVersion.id,
        runType: "NORMAL_WAKE",
        runStatus: "TIMED_OUT",
        queuePriority: "SCHEDULED_CONTENT",
        trigger: "WORKER_TELEMETRY_TERMINAL_FIXTURE",
        idempotencyKey: `worker-telemetry-terminal:${randomUUID()}`,
        timeoutSeconds: 120,
        desiredEntryMin: 0,
        desiredEntryMax: 1,
        createdAt: new Date(terminalStartedAt.getTime() - 3_000),
        startedAt: terminalStartedAt,
        finishedAt: new Date(observedAt.getTime() - 2_000),
        leaseOwner: "production-worker",
        leaseExpiresAt: new Date(observedAt.getTime() - 2_000),
        usageMetadata: { durationMs: 12_000, provider: "codex-cli" },
        errorCode: "CODEX_TIMEOUT",
        errorSummary: "Codex CLI integration fixture timeout.",
      },
    });
    await expect(
      getRuntimeCapacity(integrationDatabase, adminActor(admin.id), observedAt),
    ).resolves.toMatchObject({
      operational: {
        worker: {
          workerId: "production-worker",
          online: true,
          bootId: secondBootId,
          processingLanes: 2,
          restartCount: 1,
          startedAt: restartedAt,
        },
        executionSlots: [
          {
            slot: 1,
            status: "ACTIVE",
            runId: activeRun.id,
            phase: "THINKING",
            username: created.agent.user.username,
            leaseAgeMs: 5_000,
            heartbeatAgeMs: 1_000,
            leaseRemainingMs: 50_000,
          },
          { slot: 2, status: "IDLE" },
        ],
        timeoutCount1h: 1,
        recentExecutions: [
          {
            runId: terminalRun.id,
            runStatus: "TIMED_OUT",
            queueWaitMs: 3_000,
            codexDurationMs: 12_000,
            errorCode: "CODEX_TIMEOUT",
          },
        ],
      },
    });
  });

  it("fails closed instead of creating a production credential outside managed enrollment", async () => {
    const admin = await createAdmin();
    vi.stubEnv("NODE_ENV", "production");
    await expect(
      createAgent(
        integrationDatabase,
        adminActor(admin.id),
        createAgentSchema.parse({
          persona: originalPersonaPack.personas[0],
          lifecycleStatus: "PAUSED",
        }),
      ),
    ).rejects.toMatchObject({
      code: "AGENT_RUNTIME_ENROLLMENT_UNAVAILABLE",
      status: 503,
    });
    await expect(integrationDatabase.agentProfile.count()).resolves.toBe(0);
  });

  it("marks a legacy writer unready until the worker explicitly acknowledges its loaded credential", async () => {
    const admin = await createAdmin();
    const actor = adminActor(admin.id);
    const legacy = await createAgent(
      integrationDatabase,
      actor,
      createAgentSchema.parse({
        persona: originalPersonaPack.personas[0],
        lifecycleStatus: "PAUSED",
      }),
    );
    const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    process.env.AGENT_RUNTIME_ENROLLMENT_PUBLIC_KEY_B64 = publicKey
      .export({ format: "der", type: "spki" })
      .toString("base64");
    const managed = await createAgent(
      integrationDatabase,
      { ...actor, requestId: randomUUID() },
      createAgentSchema.parse({
        persona: originalPersonaPack.personas[1],
        lifecycleStatus: "PAUSED",
      }),
    );
    const legacyCredential = await integrationDatabase.agentCredential.findFirstOrThrow({
      where: { agentProfileId: legacy.agent.profile.id, revokedAt: null },
    });
    const managedCredential = await integrationDatabase.agentCredential.findFirstOrThrow({
      where: { agentProfileId: managed.agent.profile.id, revokedAt: null },
    });
    const principal: RuntimePrincipal = {
      credentialId: legacyCredential.id,
      agentProfileId: legacy.agent.profile.id,
      lifecycleStatus: "PAUSED",
      actor: {
        actorId: legacy.agent.user.id,
        actorKind: "AGENT",
        actorRole: "USER",
        requestId: randomUUID(),
        origin: "AGENT",
      },
    };
    const now = new Date("2026-07-21T08:00:00.000Z");
    const roster = await getRuntimeCredentialRoster(
      integrationDatabase,
      principal,
      "mixed-roster-worker",
      now,
    );
    expect(roster.activeCredentialIds).toEqual(
      expect.arrayContaining([legacyCredential.id, managedCredential.id]),
    );
    expect(roster.entries.map(({ credentialId }) => credentialId)).toEqual([managedCredential.id]);
    await acknowledgeRuntimeCredentialRoster(
      integrationDatabase,
      principal,
      {
        workerId: "mixed-roster-worker",
        desiredFingerprint: roster.desiredFingerprint,
        loadedCredentialIds: [managedCredential.id],
      },
      now,
    );
    await expect(
      changeAgentLifecycle(
        integrationDatabase,
        { ...actor, requestId: randomUUID() },
        legacy.agent.profile.id,
        lifecycleChangeSchema.parse({
          status: "ACTIVE",
          reason: "Legacy writer must wait for explicit worker acknowledgement.",
        }),
        now,
      ),
    ).rejects.toMatchObject({ code: "AGENT_RUNTIME_NOT_READY", status: 409 });
    await integrationDatabase.agentProfile.update({
      where: { id: legacy.agent.profile.id },
      data: { lifecycleStatus: "ACTIVE" },
    });
    const orphan = await integrationDatabase.agentRun.create({
      data: {
        agentProfileId: legacy.agent.profile.id,
        runType: "NORMAL_WAKE",
        queuePriority: "MANUAL_SINGLE",
        trigger: "PRE_UPGRADE_ADMIN_MANUAL",
        personaVersionId: legacy.agent.personaVersion.id,
        idempotencyKey: `pre-upgrade-orphan:${legacy.agent.profile.id}`,
        availableAt: now,
        timeoutSeconds: 600,
        desiredEntryMin: 0,
        desiredEntryMax: 1,
      },
    });
    await integrationDatabase.agentGlobalSettings.update({
      where: { id: "global" },
      data: {
        runtimeEnabled: true,
        schedulerEnabled: true,
        publishEnabled: true,
        publicWriteEnabled: true,
      },
    });
    await expect(
      getRuntimeCapacity(integrationDatabase, { ...actor, requestId: randomUUID() }, now),
    ).resolves.toMatchObject({
      operational: { eligibleQueuedRunCount: 0 },
    });
    await runRuntimeStochasticTick(
      integrationDatabase,
      principal,
      { workerId: "mixed-roster-worker" },
      now,
    );
    await expect(
      integrationDatabase.agentRun.findUniqueOrThrow({ where: { id: orphan.id } }),
    ).resolves.toMatchObject({
      runStatus: "CANCELLED",
      errorCode: "AGENT_RUNTIME_NOT_READY",
    });
    await integrationDatabase.agentProfile.update({
      where: { id: legacy.agent.profile.id },
      data: { lifecycleStatus: "PAUSED" },
    });
    await acknowledgeRuntimeCredentialRoster(
      integrationDatabase,
      principal,
      {
        workerId: "mixed-roster-worker",
        desiredFingerprint: roster.desiredFingerprint,
        loadedCredentialIds: [legacyCredential.id, managedCredential.id],
      },
      now,
    );
    await expect(
      changeAgentLifecycle(
        integrationDatabase,
        { ...actor, requestId: randomUUID() },
        legacy.agent.profile.id,
        lifecycleChangeSchema.parse({
          status: "ACTIVE",
          reason: "Legacy writer is now explicitly loaded by the worker.",
        }),
        now,
      ),
    ).resolves.toMatchObject({ lifecycleStatus: "ACTIVE" });
  });

  it("enrolls three paused writers before activation and keeps their paused queue from blocking society", async () => {
    const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    process.env.AGENT_RUNTIME_ENROLLMENT_PUBLIC_KEY_B64 = publicKey
      .export({ format: "der", type: "spki" })
      .toString("base64");
    const admin = await createAdmin();
    const actor = adminActor(admin.id);
    const agents = [];
    for (const persona of originalPersonaPack.personas.slice(0, 3))
      agents.push(
        await createAgent(
          integrationDatabase,
          { ...actor, requestId: randomUUID() },
          createAgentSchema.parse({ persona, lifecycleStatus: "PAUSED" }),
        ),
      );

    const first = agents[0]!;
    const credentialRecord = await integrationDatabase.agentCredential.findFirstOrThrow({
      where: { agentProfileId: first.agent.profile.id, revokedAt: null },
    });
    const runtimePrincipal: RuntimePrincipal = {
      credentialId: credentialRecord.id,
      agentProfileId: first.agent.profile.id,
      lifecycleStatus: "PAUSED",
      actor: {
        actorId: first.agent.user.id,
        actorKind: "AGENT",
        actorRole: "USER",
        requestId: randomUUID(),
        origin: "AGENT",
      },
    };
    const now = new Date("2026-07-21T08:00:00.000Z");

    await expect(
      changeAgentLifecycle(
        integrationDatabase,
        { ...actor, requestId: randomUUID() },
        first.agent.profile.id,
        lifecycleChangeSchema.parse({
          status: "ACTIVE",
          reason: "Activation must wait for the managed worker roster.",
        }),
        now,
      ),
    ).rejects.toMatchObject({ code: "AGENT_RUNTIME_NOT_READY", status: 409 });
    const roster = await getRuntimeCredentialRoster(
      integrationDatabase,
      runtimePrincipal,
      "onboarding-worker",
      now,
    );
    expect(roster.entries).toHaveLength(3);
    await acknowledgeRuntimeCredentialRoster(
      integrationDatabase,
      runtimePrincipal,
      {
        workerId: "onboarding-worker",
        desiredFingerprint: roster.desiredFingerprint,
        loadedCredentialIds: roster.entries.map(({ credentialId }) => credentialId),
      },
      now,
    );

    for (const agent of agents)
      await changeAgentLifecycle(
        integrationDatabase,
        { ...actor, requestId: randomUUID() },
        agent.agent.profile.id,
        lifecycleChangeSchema.parse({
          status: "ACTIVE",
          reason: "Activate after exact managed roster acknowledgement.",
        }),
        now,
      );
    await integrationDatabase.agentRuntimeCredentialSync.update({
      where: { id: "global" },
      data: { syncedAt: new Date(now.getTime() - 121_000) },
    });
    await expect(
      previewBulkAgentRun(
        integrationDatabase,
        { ...actor, requestId: randomUUID() },
        bulkAgentRunPreviewSchema.parse({
          allActive: false,
          agentIds: agents.map(({ agent }) => agent.profile.id),
          run: { runType: "NORMAL_WAKE", priority: "NORMAL" },
        }),
        now,
      ),
    ).rejects.toMatchObject({ code: "AGENT_RUNTIME_NOT_READY", status: 409 });
    await acknowledgeRuntimeCredentialRoster(
      integrationDatabase,
      runtimePrincipal,
      {
        workerId: "onboarding-worker",
        desiredFingerprint: roster.desiredFingerprint,
        loadedCredentialIds: roster.entries.map(({ credentialId }) => credentialId),
      },
      now,
    );
    await expect(
      previewBulkAgentRun(
        integrationDatabase,
        { ...actor, requestId: randomUUID() },
        bulkAgentRunPreviewSchema.parse({
          allActive: false,
          agentIds: agents.map(({ agent }) => agent.profile.id),
          run: { runType: "NORMAL_WAKE", priority: "NORMAL" },
        }),
        now,
      ),
    ).resolves.toMatchObject({ runCount: 3 });

    const queued = await createBulkAgentRuns(
      integrationDatabase,
      { ...actor, requestId: randomUUID() },
      bulkAgentRunSchema.parse({
        agentIds: agents.map(({ agent }) => agent.profile.id),
        run: { runType: "NORMAL_WAKE", priority: "NORMAL" },
        confirmation: "RUN_SELECTED_AGENTS",
      }),
      now,
    );
    expect(queued.count).toBe(3);

    await changeAgentLifecycle(
      integrationDatabase,
      { ...actor, requestId: randomUUID() },
      first.agent.profile.id,
      lifecycleChangeSchema.parse({
        status: "PAUSED",
        reason: "Pause one queued writer to verify bounded orphan recovery.",
      }),
      now,
    );
    await runRuntimeStochasticTick(
      integrationDatabase,
      runtimePrincipal,
      { workerId: "onboarding-worker" },
      now,
    );

    await expect(
      integrationDatabase.agentRun.findFirstOrThrow({
        where: { agentProfileId: first.agent.profile.id },
      }),
    ).resolves.toMatchObject({
      runStatus: "CANCELLED",
      errorCode: "AGENT_RUNTIME_NOT_READY",
    });
    const snapshot = await integrationDatabase.$transaction((transaction) =>
      getStochasticSchedulerSnapshot(transaction, now),
    );
    expect(snapshot.queuedCount).toBe(2);
    expect(
      await integrationDatabase.agentRuntimeEvent.count({
        where: { eventType: "runtime.queue.orphans_recovered" },
      }),
    ).toBe(1);
  });
});
