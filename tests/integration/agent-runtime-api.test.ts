import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as leaseRoute } from "@/app/api/v1/internal/agent-runtime/lease/route";
import type { ActorContext } from "@/modules/auth/domain/actor";
import {
  authenticateRuntimeRequest,
  bulkAgentRunSchema,
  cancelAllPendingWriteAgentRuns,
  cancelAgentRun,
  cancelPendingAgentRunsSchema,
  cancelPendingGlobalAgentRunsSchema,
  cancelPendingWriteAgentRuns,
  changeAgentLifecycle,
  completeRuntimeRun,
  createAgent,
  createAgentSchema,
  createBulkAgentRuns,
  agentSourceAdminUpdateSchema,
  executeRuntimeAction as executeRuntimeActionApplication,
  failRuntimeRun,
  generateRuntimeDailyPlans,
  getAgentDetail,
  getRuntimeRunContext as getRuntimeRunContextApplication,
  gracefullyStopActiveAgentRuns,
  gracefulStopAgentRunsSchema,
  gracefullyStopAllActiveAgentRuns,
  gracefulStopGlobalAgentRunsSchema,
  heartbeatRuntimeRun as heartbeatRuntimeRunApplication,
  getRuntimeEventHistoryPage,
  leaseRuntimeRun as leaseRuntimeRunApplication,
  listRuntimeEvents,
  lifecycleChangeSchema,
  recordRuntimeActions,
  recordRuntimeEvents,
  recordRuntimeMemories,
  recordRuntimeLifeEventBatch,
  recordRuntimeSourceResult,
  recordRuntimeSourceAttempt,
  rotateAgentCredential,
  runRuntimeStochasticTick,
  runtimeActionsSchema as runtimeActionsSchemaApplication,
  runtimeCompleteSchema as runtimeCompleteSchemaApplication,
  runtimeEventsSchema as runtimeEventsSchemaApplication,
  runtimeFailSchema as runtimeFailSchemaApplication,
  runtimeMemoriesSchema as runtimeMemoriesSchemaApplication,
  runtimeLifeEventBatchSchema,
  runtimeSourceResultSchema as runtimeSourceResultSchemaApplication,
  runtimeSourceAttemptSchema as runtimeSourceAttemptSchemaApplication,
  runtimeHeartbeatSchema as runtimeHeartbeatSchemaApplication,
  runtimeCredentialRotationSchema,
  setGlobalRuntimeEnabled,
  updateAgentSourceAdmin,
  updateGlobalSettings,
} from "@/modules/agents";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import { createEntry, getEntry, getTopicEntries } from "@/modules/entries";
import { getDebe } from "@/modules/feeds";
import { previousIstanbulDayWindow } from "@/modules/feeds/domain/time";
import { getEntryIndexingDecision } from "@/modules/indexing";
import {
  bulkSetAgentContentVisibility,
  getAgentContentRecords,
  removeAgentTopicWriteLock,
  setAgentTopicWriteLock,
} from "@/modules/moderation";
import { searchAll } from "@/modules/search";
import { createTopicWithFirstEntry } from "@/modules/topics";
import { getPublicProfile } from "@/modules/users";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

const leaseTokensByWorker = new Map<string, string>();
const completedRuntimeFastState = {
  curiosity: 0.5,
  confidence: 0.6,
  topicFatigue: {},
};

function leaseTokenForWorker(workerId: string): string {
  const leaseToken = leaseTokensByWorker.get(workerId);
  if (!leaseToken) throw new Error(`TEST_LEASE_TOKEN_MISSING:${workerId}`);
  return leaseToken;
}

async function leaseRuntimeRun(...args: Parameters<typeof leaseRuntimeRunApplication>) {
  const result = await leaseRuntimeRunApplication(...args);
  if (result.run) leaseTokensByWorker.set(args[2].workerId, result.run.leaseToken);
  return result;
}

function getRuntimeRunContext(
  client: Parameters<typeof getRuntimeRunContextApplication>[0],
  principal: Parameters<typeof getRuntimeRunContextApplication>[1],
  runId: string,
  workerId: string,
) {
  return getRuntimeRunContextApplication(
    client,
    principal,
    runId,
    workerId,
    leaseTokenForWorker(workerId),
  );
}

function heartbeatRuntimeRun(
  client: Parameters<typeof heartbeatRuntimeRunApplication>[0],
  principal: Parameters<typeof heartbeatRuntimeRunApplication>[1],
  runId: string,
  input: Omit<Parameters<typeof heartbeatRuntimeRunApplication>[3], "leaseToken"> & {
    leaseToken?: string;
  },
) {
  return heartbeatRuntimeRunApplication(client, principal, runId, {
    ...input,
    leaseToken: input.leaseToken ?? leaseTokenForWorker(input.workerId),
  });
}

function executeRuntimeAction(
  client: Parameters<typeof executeRuntimeActionApplication>[0],
  principal: Parameters<typeof executeRuntimeActionApplication>[1],
  runId: string,
  input: Omit<Parameters<typeof executeRuntimeActionApplication>[3], "leaseToken"> & {
    leaseToken?: string;
  },
  dependencies?: Parameters<typeof executeRuntimeActionApplication>[4],
) {
  return executeRuntimeActionApplication(
    client,
    principal,
    runId,
    { ...input, leaseToken: input.leaseToken ?? leaseTokenForWorker(input.workerId) },
    { ...dependencies, requireLifeLedger: false },
  );
}

function leaseBoundSchema<T>(schema: { parse(input: unknown): T }) {
  return {
    parse(input: unknown): T {
      const record = input as { workerId?: unknown; leaseToken?: unknown };
      if (typeof record.workerId !== "string") return schema.parse(input);
      return schema.parse({
        ...(input as Record<string, unknown>),
        leaseToken:
          typeof record.leaseToken === "string"
            ? record.leaseToken
            : leaseTokenForWorker(record.workerId),
      });
    },
  };
}

const runtimeActionsSchema = leaseBoundSchema(runtimeActionsSchemaApplication);
const runtimeCompleteSchema = leaseBoundSchema(runtimeCompleteSchemaApplication);
const runtimeEventsSchema = leaseBoundSchema(runtimeEventsSchemaApplication);
const runtimeFailSchema = leaseBoundSchema(runtimeFailSchemaApplication);
const runtimeMemoriesSchema = leaseBoundSchema(runtimeMemoriesSchemaApplication);
const runtimeSourceResultSchema = leaseBoundSchema(runtimeSourceResultSchemaApplication);
const runtimeSourceAttemptSchema = leaseBoundSchema(runtimeSourceAttemptSchemaApplication);
const runtimeHeartbeatSchema = leaseBoundSchema(runtimeHeartbeatSchemaApplication);

async function createAdmin() {
  const suffix = randomUUID().replaceAll("-", "");
  return integrationDatabase.user.create({
    data: {
      kind: "HUMAN",
      role: "ADMIN",
      status: "ACTIVE",
      email: `runtime-admin-${suffix}@integration.test`,
      emailNormalized: `runtime-admin-${suffix}@integration.test`,
      username: `runtime_admin_${suffix.slice(0, 14)}`,
      usernameNormalized: `runtime_admin_${suffix.slice(0, 14)}`,
      displayName: "Runtime admin",
      passwordHash: "not-used",
      termsVersion: "1.0",
      termsAcceptedAt: new Date(),
    },
  });
}

function adminActor(adminId: string): ActorContext {
  return {
    actorId: adminId,
    actorKind: "HUMAN",
    actorRole: "ADMIN",
    requestId: randomUUID(),
    origin: "API",
  };
}

async function createFixture(
  runCount = 1,
  activationStartedAt = new Date(),
  createActivationAnchor = true,
) {
  const admin = await createAdmin();
  const created = await createAgent(
    integrationDatabase,
    adminActor(admin.id),
    createAgentSchema.parse({ persona: originalPersonaPack.personas[0] }),
  );
  await updateGlobalSettings(integrationDatabase, adminActor(admin.id), {
    globalDailyEntryMin: 15,
    globalDailyEntryMax: 20,
  });
  if (createActivationAnchor)
    await changeAgentLifecycle(
      integrationDatabase,
      adminActor(admin.id),
      created.agent.profile.id,
      lifecycleChangeSchema.parse({
        status: "ACTIVE",
        reason: "Runtime integration fixture activation.",
      }),
      activationStartedAt,
    );
  else
    await integrationDatabase.agentProfile.update({
      where: { id: created.agent.profile.id },
      data: { lifecycleStatus: "ACTIVE" },
    });
  const runs = await Promise.all(
    Array.from({ length: runCount }, (_, index) =>
      integrationDatabase.agentRun.create({
        data: {
          agentProfileId: created.agent.profile.id,
          runType: "NORMAL_WAKE",
          queuePriority: index === 0 ? "MANUAL_SINGLE" : "SCHEDULED_CONTENT",
          trigger: "INTEGRATION_TEST",
          requestedById: admin.id,
          personaVersionId: created.agent.personaVersion.id,
          idempotencyKey: randomUUID(),
          availableAt: new Date(Date.now() - 1_000),
          timeoutSeconds: 600,
          desiredEntryMin: 2,
          desiredEntryMax: 3,
        },
      }),
    ),
  );
  return { admin, created, runs, credential: created.credential };
}

async function createLeaseCapacityFixture(codexConcurrency: 1 | 2) {
  const admin = await createAdmin();
  const agents = [];
  for (const persona of originalPersonaPack.personas.slice(0, 3)) {
    agents.push(
      await createAgent(
        integrationDatabase,
        adminActor(admin.id),
        createAgentSchema.parse({ persona }),
      ),
    );
  }
  await updateGlobalSettings(integrationDatabase, adminActor(admin.id), {
    schedulerEnabled: false,
    defaultDailyEntryMin: 15,
    defaultDailyEntryMax: 20,
    globalDailyEntryMin: 45,
    globalDailyEntryMax: 60,
  });
  // The concurrency=2 capability gate is covered by capacity integration tests.
  // This fixture isolates the database claim semaphore itself.
  await integrationDatabase.agentGlobalSettings.update({
    where: { id: "global" },
    data: { codexConcurrency },
  });
  for (const created of agents) {
    await changeAgentLifecycle(
      integrationDatabase,
      adminActor(admin.id),
      created.agent.profile.id,
      lifecycleChangeSchema.parse({
        status: "ACTIVE",
        reason: "Activate global lease capacity integration fixture.",
      }),
    );
    await integrationDatabase.agentRun.create({
      data: {
        agentProfileId: created.agent.profile.id,
        runType: "NORMAL_WAKE",
        queuePriority: "MANUAL_SINGLE",
        trigger: "GLOBAL_LEASE_CAP_TEST",
        requestedById: admin.id,
        personaVersionId: created.agent.personaVersion.id,
        idempotencyKey: randomUUID(),
        availableAt: new Date(Date.now() - 1_000),
        timeoutSeconds: 600,
        desiredEntryMin: 1,
        desiredEntryMax: 1,
      },
    });
  }
  const principals = await Promise.all(
    agents.map(({ credential }) => runtimePrincipal(credential, "runtime:lease")),
  );
  return { admin, agents, principals };
}

async function runtimePrincipal(
  rawCredential: string,
  scope: "runtime:lease" | "runtime:read" | "runtime:write" = "runtime:write",
) {
  return authenticateRuntimeRequest(integrationDatabase, {
    authorization: `Bearer ${rawCredential}`,
    hasBrowserSession: false,
    requiredScope: scope,
    requestId: randomUUID(),
  });
}

async function createRuntimeAgentEntries(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  bodies: string[],
  sourceEvidenceIds: Array<string | undefined> = [],
) {
  const topics = await Promise.all(
    bodies.map((_, index) =>
      createTopicWithFirstEntry(integrationDatabase, adminActor(fixture.admin.id), {
        title: `bulk moderation integration ${index} ${randomUUID()}`,
        entryBody: `İnsan tarafından yazılan kontrol entry içeriği ${index}.`,
      }),
    ),
  );
  const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
  const writePrincipal = await runtimePrincipal(fixture.credential);
  const workerId = `bulk-worker-${randomUUID()}`;
  const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
    workerId,
    leaseSeconds: 60,
  });
  const runId = leased.run!.id;
  await recordRuntimeActions(
    integrationDatabase,
    writePrincipal,
    runId,
    runtimeActionsSchema.parse({
      workerId,
      actions: bodies.map((body, index) => ({
        sequence: index + 1,
        actionType: "CREATE_ENTRY",
        safeReason: "Görünür topic bağlamı bulk moderation entry adayını destekliyor.",
        targetType: "TOPIC",
        targetId: topics[index]!.topic.id,
        input: { topicId: topics[index]!.topic.id, body },
        provenance: sourceEvidenceIds[index]
          ? {
              evidenceType: "PROBATION_SOURCE",
              evidenceIds: [sourceEvidenceIds[index]],
              shortRationale: "Bulk moderation integration kaydı source verisine dayanır.",
            }
          : {
              evidenceType: "PLATFORM_EVENT",
              evidenceIds: [runId],
              shortRationale: "Bulk moderation integration kaydı için doğrulanmış eylemdir.",
            },
      })),
    }),
  );
  const actions = [];
  for (let sequence = 1; sequence <= bodies.length; sequence += 1) {
    actions.push(
      await executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
        workerId,
        sequence,
      }),
    );
  }
  const content = await integrationDatabase.agentContentRecord.findMany({
    where: { runId },
    orderBy: { createdAt: "asc" },
  });
  expect(actions).toHaveLength(bodies.length);
  expect(
    actions.map(({ actionStatus, rejectionCode }) => ({ actionStatus, rejectionCode })),
  ).toEqual(bodies.map(() => ({ actionStatus: "SUCCEEDED", rejectionCode: null })));
  expect(content).toHaveLength(bodies.length);
  return { runId, topics, content };
}

beforeEach(async () => {
  leaseTokensByWorker.clear();
  await resetIntegrationDatabase();
});
afterAll(closeIntegrationDatabase);

describe("internal agent runtime API with PostgreSQL", () => {
  it("authenticates only the hashed scoped credential and rejects browser sessions", async () => {
    const fixture = await createFixture();
    const principal = await runtimePrincipal(fixture.credential);
    expect(principal).toMatchObject({
      agentProfileId: fixture.created.agent.profile.id,
      actor: { actorKind: "AGENT", actorRole: "USER", origin: "AGENT" },
    });
    await expect(
      getAgentDetail(integrationDatabase, principal.actor, fixture.created.agent.profile.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      authenticateRuntimeRequest(integrationDatabase, {
        authorization: `Bearer ${fixture.credential}`,
        hasBrowserSession: true,
        requiredScope: "runtime:read",
        requestId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      authenticateRuntimeRequest(integrationDatabase, {
        authorization: `Bearer agt_${"x".repeat(43)}`,
        hasBrowserSession: false,
        requiredScope: "runtime:read",
        requestId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    expect(await integrationDatabase.agentCredential.findFirstOrThrow()).toMatchObject({
      tokenHash: expect.not.stringContaining(fixture.credential),
      lastUsedAt: expect.any(Date),
    });
  });

  it("requires a causal life proposal before direct production action execution", async () => {
    const fixture = await createFixture();
    const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const writePrincipal = await runtimePrincipal(fixture.credential, "runtime:write");
    const workerId = "life-ledger-production-gate";
    const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId,
      leaseSeconds: 60,
    });
    const runId = leased.run!.id;
    const leaseToken = leaseTokenForWorker(workerId);
    await recordRuntimeActions(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeActionsSchema.parse({
        workerId,
        actions: [
          {
            sequence: 1,
            actionType: "UPDATE_BELIEF",
            safeReason: "Görünür run kanıtı ölçülebilir belief güncellemesini destekliyor.",
            input: {
              topicKey: "life-ledger-production-gate",
              statement: "Production action yalnız causal life proposal sonrasında çalışır.",
              confidence: 0.8,
              summary: "Run kaydı action ile journal arasındaki causal bağı doğruluyor.",
            },
            provenance: {
              evidenceType: "PLATFORM_EVENT",
              evidenceIds: [runId],
              shortRationale: "Leased run görünür ve immutable platform kanıtıdır.",
            },
          },
        ],
      }),
    );

    await expect(
      executeRuntimeActionApplication(integrationDatabase, writePrincipal, runId, {
        workerId,
        leaseToken,
        sequence: 1,
      }),
    ).rejects.toMatchObject({ code: "AGENT_LIFE_LEDGER_REQUIRED", status: 409 });

    const batch = runtimeLifeEventBatchSchema.parse({
      workerId,
      leaseToken,
      payload: {
        observations: [],
        memoryCandidates: [],
        decisionJournal: [
          {
            seq: 1,
            kind: "OPTION_CONSIDERED",
            subject: "Belief güncellemesini değerlendirmek",
            summary: "Görünür run kanıtına bağlı belief güncellemesi değerlendirildi.",
            confidence: 0.7,
            evidenceIds: [runId],
            causedBySeqs: [],
          },
          {
            seq: 2,
            kind: "OPTION_SELECTED",
            subject: "Belief güncellemesini seçmek",
            summary: "Sınırlı belief güncellemesi görünür kanıt nedeniyle seçildi.",
            confidence: 0.8,
            evidenceIds: [runId],
            causedBySeqs: [1],
          },
        ],
        actionIntents: [
          {
            sequence: 1,
            desire: 0.8,
            expectedOutcome: "Belief state yeni ve kanıta bağlı sürümle değişecek.",
            selectedOptionSeq: 2,
          },
        ],
      },
    });
    await expect(
      recordRuntimeLifeEventBatch(integrationDatabase, writePrincipal, runId, batch),
    ).resolves.toMatchObject({ inserted: 3, replayed: false });
    await expect(
      recordRuntimeLifeEventBatch(integrationDatabase, writePrincipal, runId, batch),
    ).resolves.toMatchObject({ inserted: 0, replayed: true });
    const proposal = await integrationDatabase.agentRuntimeEvent.findFirstOrThrow({
      where: { runId, eventType: "ACTION_PROPOSED" },
    });
    expect(proposal.causedByEventIds).toHaveLength(1);

    const conflictingBatch = runtimeLifeEventBatchSchema.parse({
      ...batch,
      payload: {
        ...batch.payload,
        decisionJournal: batch.payload.decisionJournal.map((step) =>
          step.seq === 1
            ? { ...step, summary: "Aynı action için farklı ikinci journal kabul edilmemeli." }
            : step,
        ),
      },
    });
    await expect(
      recordRuntimeLifeEventBatch(integrationDatabase, writePrincipal, runId, conflictingBatch),
    ).rejects.toMatchObject({ code: "AGENT_ACTION_LIFE_PROPOSAL_EXISTS", status: 409 });

    await expect(
      executeRuntimeActionApplication(integrationDatabase, writePrincipal, runId, {
        workerId,
        leaseToken,
        sequence: 1,
      }),
    ).resolves.toMatchObject({ actionStatus: "SUCCEEDED" });

    const lateBatch = runtimeLifeEventBatchSchema.parse({
      ...batch,
      payload: {
        ...batch.payload,
        decisionJournal: batch.payload.decisionJournal.map((step) =>
          step.seq === 2
            ? { ...step, summary: "Çalıştırılmış action için yeni journal sonradan eklenemez." }
            : step,
        ),
      },
    });
    await expect(
      recordRuntimeLifeEventBatch(integrationDatabase, writePrincipal, runId, lateBatch),
    ).rejects.toMatchObject({ code: "AGENT_ACTION_STATE_INVALID", status: 409 });
  });

  it("fails closed before claiming a lease when database readiness fails", async () => {
    const fixture = await createFixture();
    const principal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const checkReadiness = async () => {
      throw new Error("injected database readiness failure");
    };

    await expect(
      leaseRuntimeRun(
        integrationDatabase,
        principal,
        { workerId: "database-unready-worker", leaseSeconds: 60 },
        { checkReadiness },
      ),
    ).rejects.toMatchObject({ code: "SERVICE_NOT_READY", status: 503 });
    expect(
      await integrationDatabase.agentRun.findUniqueOrThrow({ where: { id: fixture.runs[0]!.id } }),
    ).toMatchObject({ runStatus: "QUEUED", leaseOwner: null, leaseExpiresAt: null });
    expect(
      await integrationDatabase.agentRuntimeState.findUniqueOrThrow({
        where: { agentProfileId: fixture.created.agent.profile.id },
      }),
    ).toMatchObject({ currentRunId: null });
    expect(
      await integrationDatabase.auditLog.count({
        where: { action: "agent.run.leased", entityId: fixture.runs[0]!.id },
      }),
    ).toBe(0);
  });

  it("rotates credentials atomically and invalidates the previously issued token", async () => {
    const fixture = await createFixture();
    const rotated = await rotateAgentCredential(
      integrationDatabase,
      adminActor(fixture.admin.id),
      fixture.created.agent.profile.id,
      runtimeCredentialRotationSchema.parse({
        reason: "Scheduled integration credential rotation.",
      }),
    );
    expect(rotated.credential).toMatch(/^agt_[A-Za-z0-9_-]{43}$/u);
    expect(rotated.credential).not.toBe(fixture.credential);
    await expect(runtimePrincipal(fixture.credential)).rejects.toMatchObject({
      code: "AUTH_REQUIRED",
    });
    await expect(runtimePrincipal(rotated.credential)).resolves.toMatchObject({
      agentProfileId: fixture.created.agent.profile.id,
    });
    const credentials = await integrationDatabase.agentCredential.findMany({
      where: { agentProfileId: fixture.created.agent.profile.id },
      orderBy: { createdAt: "asc" },
    });
    expect(credentials).toHaveLength(2);
    expect(credentials[0]!.revokedAt).toBeInstanceOf(Date);
    expect(credentials[1]!.revokedAt).toBeNull();
    expect(JSON.stringify(credentials)).not.toContain(rotated.credential);
    expect(
      await integrationDatabase.auditLog.count({ where: { action: "agent.credential_rotated" } }),
    ).toBe(1);
  });

  it("leases only one run per agent under concurrency and reclaims an expired lease", async () => {
    const fixture = await createFixture(2);
    const principal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const [left, right] = await Promise.all([
      leaseRuntimeRun(integrationDatabase, principal, { workerId: "worker-a", leaseSeconds: 60 }),
      leaseRuntimeRun(integrationDatabase, principal, { workerId: "worker-b", leaseSeconds: 60 }),
    ]);
    const leased = [left, right].filter(({ run }) => run !== null);
    expect(leased).toHaveLength(1);
    expect(await integrationDatabase.agentRun.count({ where: { runStatus: "RUNNING" } })).toBe(1);
    const running = await integrationDatabase.agentRun.findFirstOrThrow({
      where: { runStatus: "RUNNING" },
    });
    const originalLeaseOwner = running.leaseOwner!;
    const originalStartedAt = running.startedAt;
    await integrationDatabase.agentRun.update({
      where: { id: running.id },
      data: { leaseExpiresAt: new Date(Date.now() - 1000) },
    });
    const reclaimed = await leaseRuntimeRun(integrationDatabase, principal, {
      workerId: "worker-c",
      leaseSeconds: 60,
    });
    expect(reclaimed.run).toMatchObject({ id: running.id, attempts: 2 });
    expect(
      (await integrationDatabase.agentRun.findUniqueOrThrow({ where: { id: running.id } }))
        .startedAt,
    ).toEqual(originalStartedAt);
    const writePrincipal = await runtimePrincipal(fixture.credential, "runtime:write");
    await expect(
      failRuntimeRun(
        integrationDatabase,
        writePrincipal,
        running.id,
        runtimeFailSchema.parse({
          workerId: originalLeaseOwner,
          outcome: "TIMED_OUT",
          errorCode: "STALE_WORKER_TIMEOUT",
          errorSummary: "Reclaim sonrası eski worker terminal raporu reddedilmelidir.",
        }),
      ),
    ).rejects.toMatchObject({ code: "AGENT_RUN_LEASE_INVALID" });
  });

  it("fences a stale same-worker generation on heartbeat and terminal completion", async () => {
    const fixture = await createFixture(2);
    const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const writePrincipal = await runtimePrincipal(fixture.credential, "runtime:write");
    const workerId = "same-worker-fencing";
    const first = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId,
      leaseSeconds: 60,
    });
    const runId = first.run!.id;
    const staleToken = first.run!.leaseToken;
    await integrationDatabase.agentRun.update({
      where: { id: runId },
      data: { leaseExpiresAt: new Date(Date.now() - 1000) },
    });
    const reclaimed = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId,
      leaseSeconds: 60,
    });
    const currentToken = reclaimed.run!.leaseToken;
    expect(currentToken).not.toBe(staleToken);
    const staleState = {
      curiosity: 0.1,
      confidence: 0.2,
      topicFatigue: { "stale-generation": 1 },
    };
    const currentState = {
      curiosity: 0.7,
      confidence: 0.8,
      topicFatigue: { "current-generation": 0.3 },
    };
    const previousState = {
      curiosity: 0.4,
      confidence: 0.5,
      topicFatigue: { "previous-generation": 0.6 },
    };
    await integrationDatabase.agentRuntimeState.update({
      where: { agentProfileId: fixture.created.agent.profile.id },
      data: { runtimeMetadata: { preservedMarker: "keep", fastState: previousState } },
    });
    await getRuntimeRunContext(integrationDatabase, writePrincipal, runId, workerId);

    await expect(
      heartbeatRuntimeRunApplication(
        integrationDatabase,
        writePrincipal,
        runId,
        runtimeHeartbeatSchemaApplication.parse({
          runId,
          workerId,
          leaseToken: staleToken,
          leaseSeconds: 60,
          runtimeStatus: "READING",
        }),
      ),
    ).rejects.toMatchObject({ code: "AGENT_RUN_LEASE_INVALID" });
    await expect(
      completeRuntimeRun(
        integrationDatabase,
        writePrincipal,
        runId,
        runtimeCompleteSchemaApplication.parse({
          workerId,
          leaseToken: staleToken,
          outcome: "SUCCEEDED",
          state: staleState,
          safeRunSummary: {
            operationSummary: "Stale generation must not close the reclaimed run.",
            observedItemIds: [],
            proposedActionCount: 0,
            completedActionCount: 0,
            rejectedActionCount: 0,
            shortRationale: "Per-lease fencing token changed on reclaim.",
          },
          usageMetadata: { durationMs: 1, provider: "codex-cli" },
          performanceMetrics: {},
          reflectionDelta: null,
        }),
      ),
    ).rejects.toMatchObject({ code: "AGENT_RUN_LEASE_INVALID" });
    await expect(
      integrationDatabase.agentRuntimeState.findUniqueOrThrow({
        where: { agentProfileId: fixture.created.agent.profile.id },
      }),
    ).resolves.toMatchObject({
      runtimeMetadata: { preservedMarker: "keep", fastState: previousState },
    });

    await expect(
      heartbeatRuntimeRunApplication(
        integrationDatabase,
        writePrincipal,
        runId,
        runtimeHeartbeatSchemaApplication.parse({
          runId,
          workerId,
          leaseToken: currentToken,
          leaseSeconds: 60,
          runtimeStatus: "READING",
        }),
      ),
    ).resolves.toMatchObject({ runId });
    await expect(
      completeRuntimeRun(
        integrationDatabase,
        writePrincipal,
        runId,
        runtimeCompleteSchemaApplication.parse({
          workerId,
          leaseToken: currentToken,
          outcome: "SUCCEEDED",
          state: currentState,
          safeRunSummary: {
            operationSummary: "Current generation closes the reclaimed run.",
            observedItemIds: [],
            proposedActionCount: 0,
            completedActionCount: 0,
            rejectedActionCount: 0,
            shortRationale: "Current per-lease fencing token is authoritative.",
          },
          usageMetadata: { durationMs: 1, provider: "codex-cli" },
          performanceMetrics: {},
          reflectionDelta: null,
        }),
      ),
    ).resolves.toMatchObject({ runStatus: "SUCCEEDED" });
    await expect(
      integrationDatabase.agentRun.findUniqueOrThrow({ where: { id: runId } }),
    ).resolves.toMatchObject({ leaseOwner: null, leaseToken: null, leaseExpiresAt: null });
    await expect(
      integrationDatabase.agentRuntimeState.findUniqueOrThrow({
        where: { agentProfileId: fixture.created.agent.profile.id },
      }),
    ).resolves.toMatchObject({
      runtimeMetadata: { preservedMarker: "keep", fastState: currentState },
    });
    const fastStateLife = await integrationDatabase.agentRuntimeEvent.findFirstOrThrow({
      where: {
        agentProfileId: fixture.created.agent.profile.id,
        runId,
        eventType: "FAST_STATE_CHANGED",
      },
      orderBy: { agentSequence: "desc" },
    });
    expect(fastStateLife).toMatchObject({
      subject: { type: "AGENT_RUNTIME_STATE", id: fixture.created.agent.profile.id },
      beforeState: previousState,
      afterState: currentState,
      changedFields: ["confidence", "curiosity", "topicFatigue"],
      metadata: { origin: "RUN_COMPLETION", outcome: "SUCCEEDED" },
    });

    const nextWorkerId = "next-fast-state-context";
    const nextLease = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId: nextWorkerId,
      leaseSeconds: 60,
    });
    expect(nextLease.run?.id).toBe(fixture.runs[1]!.id);
    const readPrincipal = await runtimePrincipal(fixture.credential, "runtime:read");
    const nextContext = await getRuntimeRunContext(
      integrationDatabase,
      readPrincipal,
      nextLease.run!.id,
      nextWorkerId,
    );
    expect(nextContext.perception).toMatchObject({ previousFastState: currentState });
    expect(JSON.stringify(nextContext.perception)).not.toContain("preservedMarker");
  });

  it("blocks maintenance work behind an active normal lease and safely closes it after expiry", async () => {
    const fixture = await createLeaseCapacityFixture(2);
    const firstAgent = fixture.agents[0]!;
    const principal = fixture.principals[0]!;
    const normalLease = await leaseRuntimeRun(integrationDatabase, principal, {
      workerId: "maintenance-active-normal",
      leaseSeconds: 60,
    });
    const normalRunId = normalLease.run!.id;
    const writePrincipal = await runtimePrincipal(firstAgent.credential, "runtime:write");
    const topic = await createTopicWithFirstEntry(
      integrationDatabase,
      adminActor(fixture.admin.id),
      {
        title: `maintenance partial terminal ${randomUUID()}`,
        entryBody: "İnsan entry içeriği maintenance expiry öncesi commit kanıtını sağlar.",
      },
    );
    await recordRuntimeActions(
      integrationDatabase,
      writePrincipal,
      normalRunId,
      runtimeActionsSchema.parse({
        workerId: "maintenance-active-normal",
        actions: [
          {
            sequence: 1,
            actionType: "CREATE_ENTRY",
            safeReason: "Committed public effect must survive later maintenance expiry.",
            targetType: "TOPIC",
            targetId: topic.topic.id,
            input: {
              topicId: topic.topic.id,
              body: `Maintenance expiry öncesi commit edilen agent entry ${randomUUID()}.`,
            },
            provenance: {
              evidenceType: "PLATFORM_EVENT",
              evidenceIds: [normalRunId],
              shortRationale: "Controlled integration run is visible platform evidence.",
            },
          },
        ],
      }),
    );
    await expect(
      executeRuntimeAction(integrationDatabase, writePrincipal, normalRunId, {
        workerId: "maintenance-active-normal",
        sequence: 1,
      }),
    ).resolves.toMatchObject({ actionStatus: "SUCCEEDED" });
    const settings = await integrationDatabase.agentGlobalSettings.findUniqueOrThrow({
      where: { id: "global" },
      select: { settingsVersion: true },
    });
    await updateGlobalSettings(integrationDatabase, adminActor(fixture.admin.id), {
      runtimeOperatingMode: "MAINTENANCE",
      expectedSettingsVersion: settings.settingsVersion,
      changeReason: "Enter maintenance mode for lease fencing verification.",
    });
    const reflection = await integrationDatabase.agentRun.create({
      data: {
        agentProfileId: firstAgent.agent.profile.id,
        runType: "REFLECTION",
        queuePriority: "REFLECTION",
        trigger: "MAINTENANCE_LEASE_FENCE_TEST",
        requestedById: fixture.admin.id,
        personaVersionId: firstAgent.agent.personaVersion.id,
        idempotencyKey: randomUUID(),
        timeoutSeconds: 600,
        desiredEntryMin: 0,
        desiredEntryMax: 0,
        allowTopicCreation: false,
        allowVoting: false,
        allowFollowing: false,
      },
    });

    await expect(
      leaseRuntimeRun(integrationDatabase, principal, {
        workerId: "maintenance-blocked-by-normal",
        leaseSeconds: 60,
      }),
    ).resolves.toEqual({ run: null, reason: "QUEUE_EMPTY" });
    await expect(
      integrationDatabase.agentRun.findUniqueOrThrow({ where: { id: reflection.id } }),
    ).resolves.toMatchObject({ runStatus: "QUEUED", leaseToken: null });

    await integrationDatabase.agentRun.update({
      where: { id: normalRunId },
      data: { leaseExpiresAt: new Date(Date.now() - 1000) },
    });
    const maintenanceLease = await leaseRuntimeRun(integrationDatabase, principal, {
      workerId: "maintenance-after-expired-normal",
      leaseSeconds: 60,
    });
    expect(maintenanceLease).toMatchObject({
      run: { id: reflection.id, runType: "REFLECTION", runStatus: "RUNNING" },
      reason: null,
    });
    await expect(
      integrationDatabase.agentRun.findUniqueOrThrow({ where: { id: normalRunId } }),
    ).resolves.toMatchObject({
      runStatus: "PARTIAL",
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
      errorCode: "MAINTENANCE_MODE_EXPIRED_RUN_PARTIAL",
      safeRunSummary: expect.objectContaining({ completedActionCount: 1 }),
      performanceMetrics: {
        measured: expect.objectContaining({ succeededActions: 1, publishedEntries: 1 }),
      },
    });
    await expect(
      integrationDatabase.auditLog.findFirstOrThrow({
        where: {
          action: "agent.run.expired_finalized",
          entityId: normalRunId,
        },
      }),
    ).resolves.toMatchObject({
      actorId: principal.actor.actorId,
      requestId: principal.actor.requestId,
      entityType: "AgentRun",
      metadata: expect.objectContaining({
        actorKind: "AGENT",
        reasonCode: "MAINTENANCE_MODE_LEASE_EXPIRED",
        runtimeOperatingMode: "MAINTENANCE",
        before: { runStatus: "RUNNING" },
        after: {
          runStatus: "PARTIAL",
          errorCode: "MAINTENANCE_MODE_EXPIRED_RUN_PARTIAL",
        },
      }),
    });
    await expect(
      integrationDatabase.outboxEvent.findFirstOrThrow({
        where: {
          eventType: "agent.run.expired_finalized",
          aggregateId: normalRunId,
        },
      }),
    ).resolves.toMatchObject({
      actorId: principal.actor.actorId,
      actorKind: "AGENT",
      requestId: principal.actor.requestId,
      aggregateType: "AgentRun",
      payload: expect.objectContaining({
        reasonCode: "MAINTENANCE_MODE_LEASE_EXPIRED",
        runType: "NORMAL_WAKE",
      }),
    });
    await expect(
      integrationDatabase.outboxEvent.findFirstOrThrow({
        where: { eventType: "agent.run.completed", aggregateId: normalRunId },
      }),
    ).resolves.toMatchObject({
      aggregateType: "AgentRun",
      actorId: principal.actor.actorId,
      actorKind: "AGENT",
      payload: expect.objectContaining({
        outcome: "PARTIAL",
        requestedOutcome: "CANCELLED",
        reasonCode: "MAINTENANCE_MODE_LEASE_EXPIRED",
        errorCode: "MAINTENANCE_MODE_EXPIRED_RUN_PARTIAL",
      }),
    });
    await expect(
      integrationDatabase.agentRuntimeEvent.findFirstOrThrow({
        where: {
          eventType: "run.expired_finalized",
          runId: normalRunId,
        },
      }),
    ).resolves.toMatchObject({
      agentProfileId: firstAgent.agent.profile.id,
      safeMessage: "Lease süresi dolan run PARTIAL durumuyla kapatıldı.",
      metadata: expect.objectContaining({
        reasonCode: "MAINTENANCE_MODE_LEASE_EXPIRED",
      }),
    });
    await expect(
      integrationDatabase.agentRuntimeState.findUniqueOrThrow({
        where: { agentProfileId: firstAgent.agent.profile.id },
      }),
    ).resolves.toMatchObject({
      currentRunId: reflection.id,
      runtimeStatus: "STARTING",
      todayPublishedEntries: 1,
    });
  });

  it("effect-aware finalizes an expired graceful-stop lease with terminal evidence", async () => {
    const fixture = await createFixture();
    await updateGlobalSettings(integrationDatabase, adminActor(fixture.admin.id), {
      schedulerEnabled: false,
    });
    const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const writePrincipal = await runtimePrincipal(fixture.credential, "runtime:write");
    const workerId = "graceful-expiry-partial";
    const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId,
      leaseSeconds: 60,
    });
    const runId = leased.run!.id;
    const topic = await createTopicWithFirstEntry(
      integrationDatabase,
      adminActor(fixture.admin.id),
      {
        title: `graceful expiry partial ${randomUUID()}`,
        entryBody: "İnsan entry içeriği graceful-stop expiry kanıtını sağlar.",
      },
    );
    await recordRuntimeActions(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeActionsSchema.parse({
        workerId,
        actions: [
          {
            sequence: 1,
            actionType: "CREATE_ENTRY",
            safeReason: "Committed action must remain visible after graceful-stop lease expiry.",
            targetType: "TOPIC",
            targetId: topic.topic.id,
            input: {
              topicId: topic.topic.id,
              body: `Graceful-stop expiry öncesi commit edilen entry ${randomUUID()}.`,
            },
            provenance: {
              evidenceType: "PLATFORM_EVENT",
              evidenceIds: [runId],
              shortRationale: "Controlled integration run is visible platform evidence.",
            },
          },
        ],
      }),
    );
    await expect(
      executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
        workerId,
        sequence: 1,
      }),
    ).resolves.toMatchObject({ actionStatus: "SUCCEEDED" });
    await expect(
      gracefullyStopActiveAgentRuns(
        integrationDatabase,
        adminActor(fixture.admin.id),
        fixture.created.agent.profile.id,
        gracefulStopAgentRunsSchema.parse({
          reason: "Graceful stop expiry must preserve the already committed agent entry.",
          confirmation: "GRACEFULLY_STOP_ACTIVE_RUNS",
        }),
      ),
    ).resolves.toMatchObject({ count: 1, after: { status: "CANCEL_REQUESTED", count: 1 } });
    await integrationDatabase.agentRun.update({
      where: { id: runId },
      data: { leaseExpiresAt: new Date(Date.now() - 1000) },
    });

    await expect(
      leaseRuntimeRun(integrationDatabase, leasePrincipal, {
        workerId: "graceful-expiry-finalizer",
        leaseSeconds: 60,
      }),
    ).resolves.toEqual({ run: null, reason: "QUEUE_EMPTY" });
    await expect(
      integrationDatabase.agentRun.findUniqueOrThrow({ where: { id: runId } }),
    ).resolves.toMatchObject({
      runStatus: "PARTIAL",
      errorCode: "CANCEL_LEASE_EXPIRED_PARTIAL",
      safeRunSummary: expect.objectContaining({ completedActionCount: 1 }),
      performanceMetrics: {
        measured: expect.objectContaining({ succeededActions: 1, publishedEntries: 1 }),
      },
    });
    await expect(
      integrationDatabase.auditLog.findFirstOrThrow({
        where: { action: "agent.run.expired_finalized", entityId: runId },
      }),
    ).resolves.toMatchObject({
      actorId: leasePrincipal.actor.actorId,
      requestId: leasePrincipal.actor.requestId,
      metadata: expect.objectContaining({
        reasonCode: "CANCEL_REQUESTED_LEASE_EXPIRED",
        before: { runStatus: "CANCEL_REQUESTED" },
        after: {
          runStatus: "PARTIAL",
          errorCode: "CANCEL_LEASE_EXPIRED_PARTIAL",
        },
      }),
    });
    await expect(
      integrationDatabase.outboxEvent.findFirstOrThrow({
        where: { eventType: "agent.run.expired_finalized", aggregateId: runId },
      }),
    ).resolves.toMatchObject({
      actorId: leasePrincipal.actor.actorId,
      actorKind: "AGENT",
      requestId: leasePrincipal.actor.requestId,
      payload: expect.objectContaining({
        reasonCode: "CANCEL_REQUESTED_LEASE_EXPIRED",
      }),
    });
    await expect(
      integrationDatabase.agentRuntimeEvent.findFirstOrThrow({
        where: { eventType: "run.expired_finalized", runId },
      }),
    ).resolves.toMatchObject({
      safeMessage: "Lease süresi dolan run PARTIAL durumuyla kapatıldı.",
      metadata: expect.objectContaining({
        reasonCode: "CANCEL_REQUESTED_LEASE_EXPIRED",
      }),
    });
  });

  it("holds the AgentRun row while an atomic action is in flight so reclaim waits", async () => {
    const fixture = await createFixture();
    const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const writePrincipal = await runtimePrincipal(fixture.credential, "runtime:write");
    const workerId = "inflight-row-fence";
    const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId,
      leaseSeconds: 60,
    });
    const runId = leased.run!.id;
    const originalToken = leased.run!.leaseToken;
    const topic = await createTopicWithFirstEntry(
      integrationDatabase,
      adminActor(fixture.admin.id),
      {
        title: `inflight row fence ${randomUUID()}`,
        entryBody: "İnsan entry içeriği action reclaim yarışını doğrular.",
      },
    );
    await recordRuntimeActions(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeActionsSchema.parse({
        workerId,
        actions: [
          {
            sequence: 1,
            actionType: "CREATE_ENTRY",
            safeReason: "Visible topic context supports the controlled row-lock action.",
            targetType: "TOPIC",
            targetId: topic.topic.id,
            input: { topicId: topic.topic.id, body: `Row lock action ${randomUUID()}.` },
            provenance: {
              evidenceType: "PLATFORM_EVENT",
              evidenceIds: [runId],
              shortRationale: "Controlled integration run is visible platform evidence.",
            },
          },
        ],
      }),
    );
    let enterReadiness!: () => void;
    const readinessEntered = new Promise<void>((resolve) => {
      enterReadiness = resolve;
    });
    let releaseReadiness!: () => void;
    const readinessRelease = new Promise<void>((resolve) => {
      releaseReadiness = resolve;
    });
    const execution = executeRuntimeActionApplication(
      integrationDatabase,
      writePrincipal,
      runId,
      { workerId, leaseToken: originalToken, sequence: 1 },
      {
        requireLifeLedger: false,
        checkReadiness: async (executor) => {
          await executor.agentRun.update({
            where: { id: runId },
            data: { leaseExpiresAt: new Date(Date.now() - 1_000) },
          });
          enterReadiness();
          await readinessRelease;
        },
      },
    );
    await readinessEntered;
    const secondClient = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL! });
    try {
      const reclaim = leaseRuntimeRunApplication(secondClient, leasePrincipal, {
        workerId: "reclaim-after-inflight-action",
        leaseSeconds: 60,
      });
      await expect(
        Promise.race([
          reclaim.then(() => "settled"),
          new Promise<string>((resolve) => setTimeout(() => resolve("pending"), 100)),
        ]),
      ).resolves.toBe("pending");
      releaseReadiness();
      await expect(execution).resolves.toMatchObject({ actionStatus: "SUCCEEDED" });
      await expect(reclaim).resolves.toMatchObject({
        run: { id: runId, leaseToken: expect.not.stringMatching(originalToken) },
      });
    } finally {
      releaseReadiness();
      await secondClient.$disconnect();
    }
  });

  it("does not let the public-write kill switch return ahead of an old-snapshot action commit", async () => {
    const fixture = await createFixture();
    const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const writePrincipal = await runtimePrincipal(fixture.credential, "runtime:write");
    const workerId = "public-write-settings-fence";
    const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId,
      leaseSeconds: 60,
    });
    const runId = leased.run!.id;
    const topic = await createTopicWithFirstEntry(
      integrationDatabase,
      adminActor(fixture.admin.id),
      {
        title: `public write settings fence ${randomUUID()}`,
        entryBody: "İnsan entry içeriği global public-write sıralamasını doğrular.",
      },
    );
    await recordRuntimeActions(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeActionsSchema.parse({
        workerId,
        actions: [
          {
            sequence: 1,
            actionType: "CREATE_ENTRY",
            safeReason: "Controlled action holds the settings fence through its public commit.",
            targetType: "TOPIC",
            targetId: topic.topic.id,
            input: {
              topicId: topic.topic.id,
              body: `Public-write settings fence action ${randomUUID()}.`,
            },
            provenance: {
              evidenceType: "PLATFORM_EVENT",
              evidenceIds: [runId],
              shortRationale: "Controlled integration run is visible platform evidence.",
            },
          },
        ],
      }),
    );
    const currentSettings = await integrationDatabase.agentGlobalSettings.findUniqueOrThrow({
      where: { id: "global" },
      select: { settingsVersion: true },
    });
    let enterSettingsFence!: () => void;
    const settingsFenceEntered = new Promise<void>((resolve) => {
      enterSettingsFence = resolve;
    });
    let releaseSettingsFence!: () => void;
    const settingsFenceRelease = new Promise<void>((resolve) => {
      releaseSettingsFence = resolve;
    });
    const secondClient = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL! });
    try {
      const execution = executeRuntimeActionApplication(
        integrationDatabase,
        writePrincipal,
        runId,
        { workerId, leaseToken: leased.run!.leaseToken, sequence: 1 },
        {
          requireLifeLedger: false,
          afterPublicWriteSettingsLocked: async () => {
            enterSettingsFence();
            await settingsFenceRelease;
          },
        },
      );
      await settingsFenceEntered;
      const disablePublicWrites = updateGlobalSettings(secondClient, adminActor(fixture.admin.id), {
        expectedSettingsVersion: currentSettings.settingsVersion,
        publicWriteEnabled: false,
        changeReason: "Pause public writes during the transaction fencing race.",
      });
      await expect(
        Promise.race([
          disablePublicWrites.then(() => "settled"),
          new Promise<string>((resolve) => setTimeout(() => resolve("pending"), 100)),
        ]),
      ).resolves.toBe("pending");
      releaseSettingsFence();
      await expect(execution).resolves.toMatchObject({ actionStatus: "SUCCEEDED" });
      await expect(disablePublicWrites).resolves.toMatchObject({ publicWriteEnabled: false });

      await recordRuntimeActions(
        integrationDatabase,
        writePrincipal,
        runId,
        runtimeActionsSchema.parse({
          workerId,
          actions: [
            {
              sequence: 2,
              actionType: "CREATE_ENTRY",
              safeReason: "A later action must observe the committed public-write kill switch.",
              targetType: "TOPIC",
              targetId: topic.topic.id,
              input: {
                topicId: topic.topic.id,
                body: `Post-disable public-write action ${randomUUID()}.`,
              },
              provenance: {
                evidenceType: "PLATFORM_EVENT",
                evidenceIds: [runId],
                shortRationale: "Controlled integration run is visible platform evidence.",
              },
            },
          ],
        }),
      );
      await expect(
        executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
          workerId,
          sequence: 2,
        }),
      ).resolves.toMatchObject({
        actionStatus: "REJECTED",
        rejectionCode: "GLOBAL_PUBLIC_WRITE_DISABLED",
      });
    } finally {
      releaseSettingsFence();
      await secondClient.$disconnect();
    }
  });

  it("fences public actions across global runtime pause while preserving internal-only actions", async () => {
    const fixture = await createFixture();
    const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const writePrincipal = await runtimePrincipal(fixture.credential, "runtime:write");
    const workerId = "global-runtime-pause-fence";
    const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId,
      leaseSeconds: 60,
    });
    const runId = leased.run!.id;
    const topic = await createTopicWithFirstEntry(
      integrationDatabase,
      adminActor(fixture.admin.id),
      {
        title: `global runtime pause fence ${randomUUID()}`,
        entryBody: "İnsan entry içeriği global runtime pause sıralamasını doğrular.",
      },
    );
    const blockedBody = `Post-pause public action ${randomUUID()}.`;
    await recordRuntimeActions(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeActionsSchema.parse({
        workerId,
        actions: [
          {
            sequence: 1,
            actionType: "CREATE_ENTRY",
            safeReason: "The in-flight action owns the global runtime settings fence.",
            targetType: "TOPIC",
            targetId: topic.topic.id,
            input: { topicId: topic.topic.id, body: `Pre-pause public action ${randomUUID()}.` },
            provenance: {
              evidenceType: "PLATFORM_EVENT",
              evidenceIds: [runId],
              shortRationale: "Controlled integration run is visible platform evidence.",
            },
          },
          {
            sequence: 2,
            actionType: "CREATE_ENTRY",
            safeReason: "A later public action must observe the committed global runtime pause.",
            targetType: "TOPIC",
            targetId: topic.topic.id,
            input: { topicId: topic.topic.id, body: blockedBody },
            provenance: {
              evidenceType: "PLATFORM_EVENT",
              evidenceIds: [runId],
              shortRationale: "Controlled integration run is visible platform evidence.",
            },
          },
          {
            sequence: 3,
            actionType: "UPDATE_BELIEF",
            safeReason: "Internal maintenance state remains available during global runtime pause.",
            input: {
              topicKey: "global-runtime-pause",
              statement: "Global runtime pause public mutationları kapatır.",
              confidence: 0.8,
              summary: "Controlled runtime pause provides visible platform evidence.",
            },
            provenance: {
              evidenceType: "PLATFORM_EVENT",
              evidenceIds: [runId],
              shortRationale: "Controlled runtime pause is visible platform evidence.",
            },
          },
        ],
      }),
    );
    let enterSettingsFence!: () => void;
    const settingsFenceEntered = new Promise<void>((resolve) => {
      enterSettingsFence = resolve;
    });
    let releaseSettingsFence!: () => void;
    const settingsFenceRelease = new Promise<void>((resolve) => {
      releaseSettingsFence = resolve;
    });
    const secondClient = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL! });
    try {
      const execution = executeRuntimeActionApplication(
        integrationDatabase,
        writePrincipal,
        runId,
        { workerId, leaseToken: leased.run!.leaseToken, sequence: 1 },
        {
          requireLifeLedger: false,
          afterPublicWriteSettingsLocked: async () => {
            enterSettingsFence();
            await settingsFenceRelease;
          },
        },
      );
      await settingsFenceEntered;
      const pause = setGlobalRuntimeEnabled(secondClient, adminActor(fixture.admin.id), false, {
        reason: "Pause global runtime after the in-flight public action commits.",
      });
      await expect(
        Promise.race([
          pause.then(() => "settled"),
          new Promise<string>((resolve) => setTimeout(() => resolve("pending"), 100)),
        ]),
      ).resolves.toBe("pending");
      releaseSettingsFence();
      await expect(execution).resolves.toMatchObject({ actionStatus: "SUCCEEDED" });
      await expect(pause).resolves.toMatchObject({ runtimeEnabled: false });

      await expect(
        executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
          workerId,
          sequence: 2,
        }),
      ).resolves.toMatchObject({
        actionStatus: "REJECTED",
        rejectionCode: "GLOBAL_RUNTIME_PAUSED",
      });
      await expect(integrationDatabase.entry.count({ where: { body: blockedBody } })).resolves.toBe(
        0,
      );
      await expect(
        executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
          workerId,
          sequence: 3,
        }),
      ).resolves.toMatchObject({ actionStatus: "SUCCEEDED" });
    } finally {
      releaseSettingsFence();
      await secondClient.$disconnect();
    }
  });

  it("fail-closes an expired rollout before internal effects or later post-lease mutations", async () => {
    const fixture = await createFixture(1, new Date(), false);
    const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const writePrincipal = await runtimePrincipal(fixture.credential, "runtime:write");
    const workerId = "expired-rollout-effect-fence";
    const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId,
      leaseSeconds: 60,
    });
    const runId = leased.run!.id;
    await recordRuntimeActions(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeActionsSchema.parse({
        workerId,
        actions: [
          {
            sequence: 1,
            actionType: "UPDATE_BELIEF",
            safeReason: "Expired rollout must block this internal belief mutation.",
            input: {
              topicKey: "expired-rollout-boundary",
              statement: "Bu belief İstanbul tarih sınırından sonra yazılmamalıdır.",
              confidence: 0.8,
              summary: "Controlled expiry fixture provides visible platform evidence.",
            },
            provenance: {
              evidenceType: "PLATFORM_EVENT",
              evidenceIds: [runId],
              shortRationale: "Controlled integration run is visible platform evidence.",
            },
          },
        ],
      }),
    );
    const attemptId = randomUUID();
    await integrationDatabase.agentRuntimeEvent.create({
      data: {
        eventType: "runtime.production.rollout_attempt.started",
        safeMessage: "Expired rollout integration fixture.",
        metadata: { attemptId, localDate: "2000-01-01" },
      },
    });

    const planningStateBefore = await Promise.all([
      integrationDatabase.agentDailyPlan.count(),
      integrationDatabase.agentScheduleSlot.count(),
      integrationDatabase.agentCapacitySnapshot.count(),
      integrationDatabase.agentRuntimeEvent.count({
        where: {
          eventType: { in: ["schedule.generated", "capacity.planning_blocked"] },
        },
      }),
    ]);
    await expect(
      generateRuntimeDailyPlans(
        integrationDatabase,
        writePrincipal,
        { workerId: "expired-rollout-planner" },
        new Date(),
      ),
    ).resolves.toMatchObject({
      rolloutExpired: true,
      errorCode: "ROLLOUT_LOCAL_DATE_EXPIRED",
      attemptId,
    });
    await expect(
      Promise.all([
        integrationDatabase.agentDailyPlan.count(),
        integrationDatabase.agentScheduleSlot.count(),
        integrationDatabase.agentCapacitySnapshot.count(),
        integrationDatabase.agentRuntimeEvent.count({
          where: {
            eventType: { in: ["schedule.generated", "capacity.planning_blocked"] },
          },
        }),
      ]),
    ).resolves.toEqual(planningStateBefore);

    await expect(
      executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
        workerId,
        sequence: 1,
      }),
    ).resolves.toMatchObject({
      actionStatus: "REJECTED",
      rejectionCode: "ROLLOUT_LOCAL_DATE_EXPIRED",
    });
    await expect(
      integrationDatabase.agentBelief.count({
        where: {
          agentProfileId: fixture.created.agent.profile.id,
          topicKey: "expired-rollout-boundary",
        },
      }),
    ).resolves.toBe(0);

    await expect(
      recordRuntimeActions(
        integrationDatabase,
        writePrincipal,
        runId,
        runtimeActionsSchema.parse({
          workerId,
          actions: [
            {
              sequence: 2,
              actionType: "NO_ACTION",
              safeReason: "No later proposal may cross the expired rollout boundary.",
              input: {},
            },
          ],
        }),
      ),
    ).resolves.toMatchObject({
      rolloutExpired: true,
      errorCode: "ROLLOUT_LOCAL_DATE_EXPIRED",
      attemptId,
    });
    await expect(integrationDatabase.agentAction.count({ where: { runId } })).resolves.toBe(1);
    await expect(
      integrationDatabase.agentGlobalSettings.findUniqueOrThrow({ where: { id: "global" } }),
    ).resolves.toMatchObject({ runtimeEnabled: false });
    await expect(
      integrationDatabase.agentRuntimeEvent.count({
        where: {
          eventType: "runtime.global.paused",
          metadata: { path: ["attemptId"], equals: attemptId },
        },
      }),
    ).resolves.toBe(1);
  });

  it("auto-terminalizes an expired steady-state attempt without pausing the established society", async () => {
    const fixture = await createFixture(0);
    const principal = await runtimePrincipal(fixture.credential);
    const attemptId = randomUUID();
    await integrationDatabase.agentRuntimeEvent.create({
      data: {
        eventType: "runtime.production.rollout_attempt.started",
        safeMessage: "Expired steady-state rollout integration fixture.",
        metadata: { attemptId, localDate: "2000-01-01" },
      },
    });

    const result = await runRuntimeStochasticTick(
      integrationDatabase,
      principal,
      { workerId: "steady-state-expiry-worker" },
      new Date("2026-07-22T12:00:00.000Z"),
    );

    expect(result).not.toHaveProperty("rolloutExpired");
    await expect(
      integrationDatabase.agentGlobalSettings.findUniqueOrThrow({ where: { id: "global" } }),
    ).resolves.toMatchObject({ runtimeEnabled: true });
    await expect(
      integrationDatabase.agentRuntimeEvent.findFirstOrThrow({
        where: {
          eventType: "runtime.production.rollout_attempt.aborted",
          metadata: { path: ["attemptId"], equals: attemptId },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    ).resolves.toMatchObject({
      metadata: expect.objectContaining({
        command: "AUTO_ABORT_EXPIRED_STEADY_STATE_ATTEMPT",
        reasonCode: "STEADY_STATE_ROLLOUT_LOCAL_DATE_EXPIRED",
      }),
    });
  });

  it("serializes lifecycle pause behind an in-flight action and rejects every later action", async () => {
    const fixture = await createFixture();
    const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const writePrincipal = await runtimePrincipal(fixture.credential, "runtime:write");
    const workerId = "agent-lifecycle-action-fence";
    const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId,
      leaseSeconds: 60,
    });
    const runId = leased.run!.id;
    const topic = await createTopicWithFirstEntry(
      integrationDatabase,
      adminActor(fixture.admin.id),
      {
        title: `agent lifecycle action fence ${randomUUID()}`,
        entryBody: "İnsan entry içeriği lifecycle action sıralamasını doğrular.",
      },
    );
    const blockedBody = `Post-lifecycle-pause action ${randomUUID()}.`;
    await recordRuntimeActions(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeActionsSchema.parse({
        workerId,
        actions: [
          {
            sequence: 1,
            actionType: "CREATE_ENTRY",
            safeReason: "The in-flight action owns the agent profile lifecycle fence.",
            targetType: "TOPIC",
            targetId: topic.topic.id,
            input: { topicId: topic.topic.id, body: `Pre-lifecycle-pause action ${randomUUID()}.` },
            provenance: {
              evidenceType: "PLATFORM_EVENT",
              evidenceIds: [runId],
              shortRationale: "Controlled integration run is visible platform evidence.",
            },
          },
          {
            sequence: 2,
            actionType: "CREATE_ENTRY",
            safeReason: "A later action must observe the committed agent lifecycle pause.",
            targetType: "TOPIC",
            targetId: topic.topic.id,
            input: { topicId: topic.topic.id, body: blockedBody },
            provenance: {
              evidenceType: "PLATFORM_EVENT",
              evidenceIds: [runId],
              shortRationale: "Controlled integration run is visible platform evidence.",
            },
          },
          {
            sequence: 3,
            actionType: "UPDATE_BELIEF",
            safeReason: "A paused agent cannot continue internal action mutations either.",
            input: {
              topicKey: "agent-lifecycle-pause",
              statement: "PAUSED agent yeni action mutation çalıştıramaz.",
              confidence: 0.8,
              summary: "Controlled lifecycle transition provides visible platform evidence.",
            },
            provenance: {
              evidenceType: "PLATFORM_EVENT",
              evidenceIds: [runId],
              shortRationale: "Controlled lifecycle transition is visible platform evidence.",
            },
          },
        ],
      }),
    );
    let enterReadiness!: () => void;
    const readinessEntered = new Promise<void>((resolve) => {
      enterReadiness = resolve;
    });
    let releaseReadiness!: () => void;
    const readinessRelease = new Promise<void>((resolve) => {
      releaseReadiness = resolve;
    });
    const secondClient = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL! });
    try {
      const execution = executeRuntimeActionApplication(
        integrationDatabase,
        writePrincipal,
        runId,
        { workerId, leaseToken: leased.run!.leaseToken, sequence: 1 },
        {
          requireLifeLedger: false,
          checkReadiness: async () => {
            enterReadiness();
            await readinessRelease;
          },
        },
      );
      await readinessEntered;
      const pause = changeAgentLifecycle(
        secondClient,
        adminActor(fixture.admin.id),
        fixture.created.agent.profile.id,
        lifecycleChangeSchema.parse({
          status: "PAUSED",
          reason: "Pause this agent after its in-flight public action transaction commits.",
        }),
      );
      await expect(
        Promise.race([
          pause.then(() => "settled"),
          new Promise<string>((resolve) => setTimeout(() => resolve("pending"), 100)),
        ]),
      ).resolves.toBe("pending");
      releaseReadiness();
      await expect(execution).resolves.toMatchObject({ actionStatus: "SUCCEEDED" });
      await expect(pause).resolves.toMatchObject({ lifecycleStatus: "PAUSED" });

      await expect(
        executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
          workerId,
          sequence: 2,
        }),
      ).resolves.toMatchObject({
        actionStatus: "REJECTED",
        rejectionCode: "AGENT_LIFECYCLE_NOT_ACTIVE",
      });
      await expect(integrationDatabase.entry.count({ where: { body: blockedBody } })).resolves.toBe(
        0,
      );
      await expect(
        executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
          workerId,
          sequence: 3,
        }),
      ).resolves.toMatchObject({
        actionStatus: "REJECTED",
        rejectionCode: "AGENT_LIFECYCLE_NOT_ACTIVE",
      });
    } finally {
      releaseReadiness();
      await secondClient.$disconnect();
    }
  });

  it("re-reads a fallback action under lock and cannot downgrade a concurrent success", async () => {
    const fixture = await createFixture();
    const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const writePrincipal = await runtimePrincipal(fixture.credential, "runtime:write");
    const workerId = "fallback-terminal-fence";
    const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId,
      leaseSeconds: 60,
    });
    const runId = leased.run!.id;
    await recordRuntimeActions(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeActionsSchema.parse({
        workerId,
        actions: [
          {
            sequence: 1,
            actionType: "CREATE_TOPIC_WITH_ENTRY",
            safeReason: "Controlled fallback race starts a public action validation path.",
            input: { title: `fallback race ${randomUUID()}`, body: "Fallback race body." },
            provenance: {
              evidenceType: "PLATFORM_EVENT",
              evidenceIds: [runId],
              shortRationale: "Controlled integration run is visible platform evidence.",
            },
          },
        ],
      }),
    );
    const action = await integrationDatabase.agentAction.findFirstOrThrow({
      where: { runId, sequence: 1 },
    });
    const secondClient = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL! });
    try {
      const result = await executeRuntimeActionApplication(
        integrationDatabase,
        writePrincipal,
        runId,
        { workerId, leaseToken: leased.run!.leaseToken, sequence: 1 },
        {
          requireLifeLedger: false,
          checkReadiness: async () => {
            throw new Error("CONTROLLED_EXECUTION_FAILURE");
          },
          beforeFallback: async () => {
            await secondClient.agentAction.update({
              where: { id: action.id },
              data: { actionStatus: "SUCCEEDED", result: { concurrentReplay: true } },
            });
          },
        },
      );
      expect(result).toMatchObject({
        actionStatus: "SUCCEEDED",
        result: { concurrentReplay: true },
      });
      await expect(
        integrationDatabase.agentAction.findUniqueOrThrow({ where: { id: action.id } }),
      ).resolves.toMatchObject({
        actionStatus: "SUCCEEDED",
        rejectionCode: null,
        result: { concurrentReplay: true },
      });
    } finally {
      await secondClient.$disconnect();
    }
  });

  it("serializes queued admin cancellation ahead of a competing lease claim", async () => {
    const fixture = await createFixture();
    await updateGlobalSettings(integrationDatabase, adminActor(fixture.admin.id), {
      schedulerEnabled: false,
    });
    const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const runId = fixture.runs[0]!.id;
    let enterCancellation!: () => void;
    const cancellationEntered = new Promise<void>((resolve) => {
      enterCancellation = resolve;
    });
    let releaseCancellation!: () => void;
    const cancellationRelease = new Promise<void>((resolve) => {
      releaseCancellation = resolve;
    });
    const secondClient = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL! });
    try {
      const cancellation = cancelAgentRun(
        integrationDatabase,
        adminActor(fixture.admin.id),
        runId,
        { reason: "Controlled queued cancellation must fence a competing lease claim." },
        {
          afterRunLocked: async () => {
            enterCancellation();
            await cancellationRelease;
          },
        },
      );
      await cancellationEntered;
      const claim = leaseRuntimeRunApplication(secondClient, leasePrincipal, {
        workerId: "queued-cancel-claim-race",
        leaseSeconds: 60,
      });
      await expect(
        Promise.race([
          claim.then(() => "settled"),
          new Promise<string>((resolve) => setTimeout(() => resolve("pending"), 100)),
        ]),
      ).resolves.toBe("pending");
      releaseCancellation();
      await expect(cancellation).resolves.toMatchObject({
        runStatus: "CANCELLED",
        leaseOwner: null,
        leaseExpiresAt: null,
      });
      await expect(claim).resolves.toMatchObject({ run: null, reason: "QUEUE_EMPTY" });
      await expect(
        integrationDatabase.agentRun.findUniqueOrThrow({ where: { id: runId } }),
      ).resolves.toMatchObject({
        runStatus: "CANCELLED",
        leaseOwner: null,
        leaseToken: null,
        leaseExpiresAt: null,
        attempts: 0,
      });
    } finally {
      releaseCancellation();
      await secondClient.$disconnect();
    }
  });

  it("serializes running admin cancellation behind an in-flight atomic action", async () => {
    const fixture = await createFixture();
    const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const writePrincipal = await runtimePrincipal(fixture.credential, "runtime:write");
    const workerId = "running-cancel-action-race";
    const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId,
      leaseSeconds: 60,
    });
    const runId = leased.run!.id;
    const leaseToken = leased.run!.leaseToken;
    const topic = await createTopicWithFirstEntry(
      integrationDatabase,
      adminActor(fixture.admin.id),
      {
        title: `running cancel action race ${randomUUID()}`,
        entryBody: "İnsan entry içeriği admin cancel ve action sıralamasını doğrular.",
      },
    );
    await recordRuntimeActions(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeActionsSchema.parse({
        workerId,
        actions: [
          {
            sequence: 1,
            actionType: "CREATE_ENTRY",
            safeReason: "Controlled action must commit atomically before cancellation is observed.",
            targetType: "TOPIC",
            targetId: topic.topic.id,
            input: { topicId: topic.topic.id, body: `Cancel race action ${randomUUID()}.` },
            provenance: {
              evidenceType: "PLATFORM_EVENT",
              evidenceIds: [runId],
              shortRationale: "Controlled integration run is visible platform evidence.",
            },
          },
        ],
      }),
    );
    let enterReadiness!: () => void;
    const readinessEntered = new Promise<void>((resolve) => {
      enterReadiness = resolve;
    });
    let releaseReadiness!: () => void;
    const readinessRelease = new Promise<void>((resolve) => {
      releaseReadiness = resolve;
    });
    const secondClient = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL! });
    try {
      const execution = executeRuntimeActionApplication(
        integrationDatabase,
        writePrincipal,
        runId,
        { workerId, leaseToken, sequence: 1 },
        {
          requireLifeLedger: false,
          checkReadiness: async () => {
            enterReadiness();
            await readinessRelease;
          },
        },
      );
      await readinessEntered;
      const cancellation = cancelAgentRun(secondClient, adminActor(fixture.admin.id), runId, {
        reason: "Controlled running cancellation waits for the in-flight action.",
      });
      await expect(
        Promise.race([
          cancellation.then(() => "settled"),
          new Promise<string>((resolve) => setTimeout(() => resolve("pending"), 100)),
        ]),
      ).resolves.toBe("pending");
      releaseReadiness();
      await expect(execution).resolves.toMatchObject({ actionStatus: "SUCCEEDED" });
      await expect(cancellation).resolves.toMatchObject({
        runStatus: "CANCEL_REQUESTED",
        leaseOwner: workerId,
      });
      await expect(
        integrationDatabase.agentRun.findUniqueOrThrow({ where: { id: runId } }),
      ).resolves.toMatchObject({
        runStatus: "CANCEL_REQUESTED",
        leaseOwner: workerId,
        leaseToken,
      });
      await expect(
        integrationDatabase.agentAction.findFirstOrThrow({ where: { runId, sequence: 1 } }),
      ).resolves.toMatchObject({ actionStatus: "SUCCEEDED" });
    } finally {
      releaseReadiness();
      await secondClient.$disconnect();
    }
  });

  it("serializes global pending cancellation behind bulk creation and leaves no queued write run", async () => {
    const fixture = await createFixture();
    const agentProfileId = fixture.created.agent.profile.id;
    await integrationDatabase.agentRun.update({
      where: { id: fixture.runs[0]!.id },
      data: { runStatus: "CANCELLED", cancelRequestedAt: new Date(), finishedAt: new Date() },
    });
    const bulkInput = bulkAgentRunSchema.parse({
      allActive: true,
      run: {
        runType: "NORMAL_WAKE",
        entryTarget: 2,
        allowTopicCreation: true,
        allowVoting: true,
        allowFollowing: true,
        allowSourceReading: true,
        saturationOverride: false,
        dailyMaximumOverride: false,
        provocationOverride: false,
        priority: "NORMAL",
      },
      confirmation: "RUN_ALL_ACTIVE_AGENTS",
    });
    let enterCreation!: () => void;
    const creationEntered = new Promise<void>((resolve) => {
      enterCreation = resolve;
    });
    let releaseCreation!: () => void;
    const creationRelease = new Promise<void>((resolve) => {
      releaseCreation = resolve;
    });
    const secondClient = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL! });
    try {
      const creation = createBulkAgentRuns(
        integrationDatabase,
        adminActor(fixture.admin.id),
        bulkInput,
        new Date(),
        {
          afterProfilesLocked: async () => {
            enterCreation();
            await creationRelease;
          },
        },
      );
      await creationEntered;
      const cancellation = cancelAllPendingWriteAgentRuns(
        secondClient,
        adminActor(fixture.admin.id),
        cancelPendingGlobalAgentRunsSchema.parse({
          reason: "Cancel every pending write run after the competing bulk creation commits.",
          confirmation: "CANCEL_ALL_PENDING_WRITE_RUNS",
        }),
      );
      await expect(
        Promise.race([
          cancellation.then(() => "settled"),
          new Promise<string>((resolve) => setTimeout(() => resolve("pending"), 100)),
        ]),
      ).resolves.toBe("pending");
      releaseCreation();
      await expect(creation).resolves.toMatchObject({ count: 1 });
      await expect(cancellation).resolves.toMatchObject({
        scope: "GLOBAL",
        before: { status: "QUEUED", count: 1 },
        after: { status: "CANCELLED", count: 1 },
        count: 1,
      });
      await expect(
        integrationDatabase.agentRun.count({
          where: {
            agentProfileId,
            runStatus: "QUEUED",
            runType: {
              in: ["SCHEDULED_WAKE", "NORMAL_WAKE", "ENTRY_BURST", "DAILY_CATCH_UP"],
            },
          },
        }),
      ).resolves.toBe(0);
    } finally {
      releaseCreation();
      await secondClient.$disconnect();
    }
  });

  it("re-reads lifecycle after the bulk profile lock and rejects a concurrent pause", async () => {
    const fixture = await createFixture();
    const agentProfileId = fixture.created.agent.profile.id;
    await integrationDatabase.agentRun.update({
      where: { id: fixture.runs[0]!.id },
      data: { runStatus: "CANCELLED", cancelRequestedAt: new Date(), finishedAt: new Date() },
    });
    const bulkInput = bulkAgentRunSchema.parse({
      allActive: false,
      agentIds: [agentProfileId],
      run: {
        runType: "NORMAL_WAKE",
        entryTarget: 2,
        allowTopicCreation: true,
        allowVoting: true,
        allowFollowing: true,
        allowSourceReading: true,
        saturationOverride: false,
        dailyMaximumOverride: false,
        provocationOverride: false,
        priority: "NORMAL",
      },
      confirmation: "RUN_SELECTED_AGENTS",
    });
    let enterPause!: () => void;
    const pauseEntered = new Promise<void>((resolve) => {
      enterPause = resolve;
    });
    let releasePause!: () => void;
    const pauseRelease = new Promise<void>((resolve) => {
      releasePause = resolve;
    });
    const secondClient = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL! });
    try {
      const pause = secondClient.$transaction(async (transaction) => {
        const profileLockKey = `agent-profile:${agentProfileId}`;
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${profileLockKey}, 0))`;
        enterPause();
        await pauseRelease;
        return changeAgentLifecycle(
          transaction,
          adminActor(fixture.admin.id),
          agentProfileId,
          lifecycleChangeSchema.parse({
            status: "PAUSED",
            reason: "Pause the agent while bulk creation is waiting for its profile fence.",
          }),
        );
      });
      await pauseEntered;
      const creation = createBulkAgentRuns(
        integrationDatabase,
        adminActor(fixture.admin.id),
        bulkInput,
      );
      await expect(
        Promise.race([
          creation.then(
            () => "settled",
            () => "rejected",
          ),
          new Promise<string>((resolve) => setTimeout(() => resolve("pending"), 100)),
        ]),
      ).resolves.toBe("pending");
      releasePause();
      await expect(pause).resolves.toMatchObject({ lifecycleStatus: "PAUSED" });
      await expect(creation).rejects.toMatchObject({
        code: "AGENT_LIFECYCLE_INVALID",
        status: 409,
      });
      await expect(
        integrationDatabase.agentRun.count({
          where: { agentProfileId, runStatus: "QUEUED", trigger: "ADMIN_BULK" },
        }),
      ).resolves.toBe(0);
    } finally {
      releasePause();
      await secondClient.$disconnect();
    }
  });

  it("cancels scoped then global pending write runs while preserving read-only work", async () => {
    const fixture = await createLeaseCapacityFixture(2);
    const [firstAgent, secondAgent, thirdAgent] = fixture.agents;
    const queuedWriteRuns = await integrationDatabase.agentRun.findMany({
      where: { runStatus: "QUEUED", runType: "NORMAL_WAKE" },
      orderBy: [{ agentProfileId: "asc" }, { id: "asc" }],
    });
    const firstWriteRun = queuedWriteRuns.find(
      ({ agentProfileId }) => agentProfileId === firstAgent!.agent.profile.id,
    )!;
    const readOnlyRun = await integrationDatabase.agentRun.create({
      data: {
        agentProfileId: firstAgent!.agent.profile.id,
        runType: "READ_ONLY",
        queuePriority: "SOURCE_REFRESH",
        trigger: "BULK_CANCEL_SCOPE_TEST",
        requestedById: fixture.admin.id,
        personaVersionId: firstAgent!.agent.personaVersion.id,
        idempotencyKey: randomUUID(),
        timeoutSeconds: 600,
        desiredEntryMin: 0,
        desiredEntryMax: 0,
        allowTopicCreation: false,
        allowVoting: false,
        allowFollowing: false,
      },
    });
    let enterControl!: () => void;
    const controlEntered = new Promise<void>((resolve) => {
      enterControl = resolve;
    });
    let releaseControl!: () => void;
    const controlRelease = new Promise<void>((resolve) => {
      releaseControl = resolve;
    });
    const secondClient = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL! });
    try {
      const scopedActor = adminActor(fixture.admin.id);
      const scopedCancellation = cancelPendingWriteAgentRuns(
        integrationDatabase,
        scopedActor,
        firstAgent!.agent.profile.id,
        cancelPendingAgentRunsSchema.parse({
          reason: "Cancel only this agent's pending public-write work during controlled testing.",
          confirmation: "CANCEL_PENDING_WRITE_RUNS",
        }),
        {
          afterProfilesLocked: async () => {
            enterControl();
            await controlRelease;
          },
        },
      );
      await controlEntered;
      const competingClaim = leaseRuntimeRunApplication(secondClient, fixture.principals[0]!, {
        workerId: "pending-cancel-competing-claim",
        leaseSeconds: 60,
      });
      await expect(
        Promise.race([
          competingClaim.then(() => "settled"),
          new Promise<string>((resolve) => setTimeout(() => resolve("pending"), 100)),
        ]),
      ).resolves.toBe("pending");
      releaseControl();
      await expect(scopedCancellation).resolves.toMatchObject({
        scope: "AGENT",
        agentProfileId: firstAgent!.agent.profile.id,
        before: { status: "QUEUED", count: 1 },
        after: { status: "CANCELLED", count: 1 },
        count: 1,
        runIds: [firstWriteRun.id],
        omittedRunIdCount: 0,
      });
      await expect(competingClaim).resolves.toMatchObject({
        run: { id: readOnlyRun.id, runType: "READ_ONLY" },
      });

      const globalActor = adminActor(fixture.admin.id);
      await expect(
        cancelAllPendingWriteAgentRuns(
          integrationDatabase,
          globalActor,
          cancelPendingGlobalAgentRunsSchema.parse({
            reason: "Cancel all remaining pending public-write work during controlled testing.",
            confirmation: "CANCEL_ALL_PENDING_WRITE_RUNS",
          }),
        ),
      ).resolves.toMatchObject({
        scope: "GLOBAL",
        before: { status: "QUEUED", count: 2 },
        after: { status: "CANCELLED", count: 2 },
        count: 2,
        omittedRunIdCount: 0,
      });
      await expect(
        integrationDatabase.agentRun.findMany({
          where: {
            agentProfileId: {
              in: [secondAgent!.agent.profile.id, thirdAgent!.agent.profile.id],
            },
          },
          orderBy: { agentProfileId: "asc" },
        }),
      ).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            runStatus: "CANCELLED",
            leaseOwner: null,
            leaseToken: null,
            leaseExpiresAt: null,
          }),
          expect.objectContaining({
            runStatus: "CANCELLED",
            leaseOwner: null,
            leaseToken: null,
            leaseExpiresAt: null,
          }),
        ]),
      );
      expect(
        await integrationDatabase.outboxEvent.count({
          where: { eventType: "agent.run.bulk_pending_cancelled" },
        }),
      ).toBe(2);
      await expect(
        integrationDatabase.auditLog.findFirstOrThrow({
          where: { action: "agent.run.bulk_pending_cancelled", requestId: scopedActor.requestId },
        }),
      ).resolves.toMatchObject({
        actorId: fixture.admin.id,
        requestId: scopedActor.requestId,
        createdAt: expect.any(Date),
        entityType: "AgentProfile",
        entityId: firstAgent!.agent.profile.id,
        metadata: {
          actorKind: "HUMAN",
          before: { status: "QUEUED", count: 1 },
          after: { status: "CANCELLED", count: 1 },
          reason: "Cancel only this agent's pending public-write work during controlled testing.",
          count: 1,
          runIds: [firstWriteRun.id],
        },
      });
    } finally {
      releaseControl();
      await secondClient.$disconnect();
    }
  });

  it("stops scoped then global active runs after an in-flight action commits", async () => {
    const fixture = await createLeaseCapacityFixture(2);
    const [firstAgent, , thirdAgent] = fixture.agents;
    const firstWorkerId = "bulk-stop-first-worker";
    const secondWorkerId = "bulk-stop-second-worker";
    const firstLease = await leaseRuntimeRun(integrationDatabase, fixture.principals[0]!, {
      workerId: firstWorkerId,
      leaseSeconds: 60,
    });
    const secondLease = await leaseRuntimeRun(integrationDatabase, fixture.principals[1]!, {
      workerId: secondWorkerId,
      leaseSeconds: 60,
    });
    const firstRunId = firstLease.run!.id;
    const secondRunId = secondLease.run!.id;
    const firstLeaseToken = firstLease.run!.leaseToken;
    const secondLeaseToken = secondLease.run!.leaseToken;
    const writePrincipal = await runtimePrincipal(firstAgent!.credential, "runtime:write");
    const topic = await createTopicWithFirstEntry(
      integrationDatabase,
      adminActor(fixture.admin.id),
      {
        title: `bulk graceful stop action ${randomUUID()}`,
        entryBody: "İnsan entry içeriği bulk graceful stop sıralamasını doğrular.",
      },
    );
    await recordRuntimeActions(
      integrationDatabase,
      writePrincipal,
      firstRunId,
      runtimeActionsSchema.parse({
        workerId: firstWorkerId,
        actions: [
          {
            sequence: 1,
            actionType: "CREATE_ENTRY",
            safeReason: "The controlled action must commit before graceful stop is recorded.",
            targetType: "TOPIC",
            targetId: topic.topic.id,
            input: { topicId: topic.topic.id, body: `Bulk stop action ${randomUUID()}.` },
            provenance: {
              evidenceType: "PLATFORM_EVENT",
              evidenceIds: [firstRunId],
              shortRationale: "Controlled integration run is visible platform evidence.",
            },
          },
        ],
      }),
    );
    let enterReadiness!: () => void;
    const readinessEntered = new Promise<void>((resolve) => {
      enterReadiness = resolve;
    });
    let releaseReadiness!: () => void;
    const readinessRelease = new Promise<void>((resolve) => {
      releaseReadiness = resolve;
    });
    const secondClient = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL! });
    try {
      const execution = executeRuntimeActionApplication(
        integrationDatabase,
        writePrincipal,
        firstRunId,
        { workerId: firstWorkerId, leaseToken: firstLeaseToken, sequence: 1 },
        {
          requireLifeLedger: false,
          checkReadiness: async () => {
            enterReadiness();
            await readinessRelease;
          },
        },
      );
      await readinessEntered;
      const scopedActor = adminActor(fixture.admin.id);
      const scopedStop = gracefullyStopActiveAgentRuns(
        secondClient,
        scopedActor,
        firstAgent!.agent.profile.id,
        gracefulStopAgentRunsSchema.parse({
          reason: "Gracefully stop this agent after its in-flight action transaction completes.",
          confirmation: "GRACEFULLY_STOP_ACTIVE_RUNS",
        }),
      );
      await expect(
        Promise.race([
          scopedStop.then(() => "settled"),
          new Promise<string>((resolve) => setTimeout(() => resolve("pending"), 100)),
        ]),
      ).resolves.toBe("pending");
      releaseReadiness();
      await expect(execution).resolves.toMatchObject({ actionStatus: "SUCCEEDED" });
      await expect(scopedStop).resolves.toMatchObject({
        scope: "AGENT",
        before: { status: "RUNNING", count: 1 },
        after: { status: "CANCEL_REQUESTED", count: 1 },
        count: 1,
        runIds: [firstRunId],
      });
      await expect(
        integrationDatabase.agentRun.findUniqueOrThrow({ where: { id: firstRunId } }),
      ).resolves.toMatchObject({
        runStatus: "CANCEL_REQUESTED",
        leaseOwner: firstWorkerId,
        leaseToken: firstLeaseToken,
      });
      await expect(
        integrationDatabase.agentRun.findUniqueOrThrow({ where: { id: secondRunId } }),
      ).resolves.toMatchObject({
        runStatus: "RUNNING",
        leaseOwner: secondWorkerId,
        leaseToken: secondLeaseToken,
      });

      const globalActor = adminActor(fixture.admin.id);
      await expect(
        gracefullyStopAllActiveAgentRuns(
          integrationDatabase,
          globalActor,
          gracefulStopGlobalAgentRunsSchema.parse({
            reason: "Gracefully stop every other currently active run after scoped verification.",
            confirmation: "GRACEFULLY_STOP_ALL_ACTIVE_RUNS",
          }),
        ),
      ).resolves.toMatchObject({
        scope: "GLOBAL",
        before: { status: "RUNNING", count: 1 },
        after: { status: "CANCEL_REQUESTED", count: 1 },
        count: 1,
        runIds: [secondRunId],
      });
      await expect(
        integrationDatabase.agentRun.findUniqueOrThrow({ where: { id: secondRunId } }),
      ).resolves.toMatchObject({
        runStatus: "CANCEL_REQUESTED",
        leaseOwner: secondWorkerId,
        leaseToken: secondLeaseToken,
      });
      await expect(
        integrationDatabase.agentRun.findFirstOrThrow({
          where: { agentProfileId: thirdAgent!.agent.profile.id },
        }),
      ).resolves.toMatchObject({ runStatus: "QUEUED", leaseToken: null });
      const outbox = await integrationDatabase.outboxEvent.findMany({
        where: { eventType: "agent.run.bulk_stop_requested" },
      });
      expect(outbox).toHaveLength(2);
      expect(JSON.stringify(outbox)).not.toContain(firstLeaseToken);
      expect(JSON.stringify(outbox)).not.toContain(secondLeaseToken);
      expect(
        await integrationDatabase.agentRuntimeEvent.count({
          where: { eventType: "run.bulk_stop_requested" },
        }),
      ).toBe(2);
    } finally {
      releaseReadiness();
      await secondClient.$disconnect();
    }
  });

  it("lets a bounded five-level priority aging cap rescue an old source refresh", async () => {
    const fixture = await createFixture(2);
    const oldSourceRun = fixture.runs[0]!;
    const newEmergencyRun = fixture.runs[1]!;
    await integrationDatabase.agentRun.update({
      where: { id: oldSourceRun.id },
      data: {
        runType: "SOURCE_REFRESH",
        queuePriority: "SOURCE_REFRESH",
        createdAt: new Date(Date.now() - 7 * 60 * 60_000),
      },
    });
    await integrationDatabase.agentRun.update({
      where: { id: newEmergencyRun.id },
      data: {
        runType: "NORMAL_WAKE",
        queuePriority: "EMERGENCY_ADMIN",
        createdAt: new Date(),
      },
    });
    const principal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const leased = await leaseRuntimeRun(integrationDatabase, principal, {
      workerId: "priority-aging-worker",
      leaseSeconds: 60,
    });
    expect(leased.run).toMatchObject({
      id: oldSourceRun.id,
      runType: "SOURCE_REFRESH",
      queuePriority: "SOURCE_REFRESH",
    });
    expect(
      await integrationDatabase.agentRun.findUniqueOrThrow({ where: { id: newEmergencyRun.id } }),
    ).toMatchObject({ runStatus: "QUEUED" });
  });

  it("enforces the default global lease cap and excludes expired leases from capacity", async () => {
    const fixture = await createLeaseCapacityFixture(1);
    const attempts = await Promise.all(
      fixture.principals.map((principal, index) =>
        leaseRuntimeRun(integrationDatabase, principal, {
          workerId: `global-cap-one-worker-${index}`,
          leaseSeconds: 60,
        }),
      ),
    );
    expect(attempts.filter(({ run }) => run !== null)).toHaveLength(1);
    expect(attempts.filter(({ reason }) => reason === "CAPACITY_FULL")).toHaveLength(2);
    expect(await integrationDatabase.agentRun.count({ where: { runStatus: "RUNNING" } })).toBe(1);

    const firstLease = attempts.find(({ run }) => run !== null)!.run!;
    await integrationDatabase.agentRun.update({
      where: { id: firstLease.id },
      data: { leaseExpiresAt: new Date(Date.now() - 1000) },
    });
    const waitingIndex = attempts.findIndex(({ run }) => run === null);
    const replacement = await leaseRuntimeRun(
      integrationDatabase,
      fixture.principals[waitingIndex]!,
      {
        workerId: "global-cap-expired-replacement",
        leaseSeconds: 60,
      },
    );
    expect(replacement).toMatchObject({
      run: { agentProfileId: expect.any(String) },
      reason: null,
    });
    expect(
      await integrationDatabase.agentRun.count({
        where: {
          runStatus: { in: ["RUNNING", "CANCEL_REQUESTED"] },
          leaseExpiresAt: { gte: new Date() },
        },
      }),
    ).toBe(1);
  });

  it("never oversubscribes concurrency two across three simultaneous agent lease claims", async () => {
    const fixture = await createLeaseCapacityFixture(2);
    const attempts = await Promise.all(
      fixture.principals.map((principal, index) =>
        leaseRuntimeRun(integrationDatabase, principal, {
          workerId: `global-cap-two-worker-${index}`,
          leaseSeconds: 60,
        }),
      ),
    );
    const leased = attempts.flatMap(({ run }) => (run ? [run] : []));
    expect(
      leased,
      JSON.stringify(attempts.map(({ run, reason }) => ({ leased: run !== null, reason }))),
    ).toHaveLength(2);
    expect(new Set(leased.map(({ agentProfileId }) => agentProfileId)).size).toBe(2);
    expect(attempts.filter(({ reason }) => reason === "CAPACITY_FULL")).toHaveLength(1);
    expect(
      await integrationDatabase.agentRun.count({
        where: {
          runStatus: { in: ["RUNNING", "CANCEL_REQUESTED"] },
          leaseExpiresAt: { gte: new Date() },
        },
      }),
    ).toBe(2);
  });

  it("accepts a late terminal report from the unreclaimed lease owner", async () => {
    const fixture = await createFixture();
    const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const writePrincipal = await runtimePrincipal(fixture.credential, "runtime:write");
    const workerId = "late-terminal-worker";
    const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId,
      leaseSeconds: 60,
    });
    await integrationDatabase.agentRun.update({
      where: { id: leased.run!.id },
      data: { leaseExpiresAt: new Date(Date.now() - 1000) },
    });

    await expect(
      failRuntimeRun(
        integrationDatabase,
        writePrincipal,
        leased.run!.id,
        runtimeFailSchema.parse({
          workerId,
          outcome: "TIMED_OUT",
          errorCode: "RUNTIME_TIMEOUT",
          errorSummary: "Mutlak deadline sonrası terminal rapor.",
        }),
      ),
    ).resolves.toMatchObject({ runStatus: "TIMED_OUT" });
    await expect(
      integrationDatabase.outboxEvent.findFirstOrThrow({
        where: { eventType: "agent.run.failed", aggregateId: leased.run!.id },
      }),
    ).resolves.toMatchObject({
      aggregateType: "AgentRun",
      actorId: fixture.created.agent.user.id,
      actorKind: "AGENT",
      payload: expect.objectContaining({
        agentProfileId: fixture.created.agent.profile.id,
        outcome: "TIMED_OUT",
        requestedOutcome: "TIMED_OUT",
        errorCode: "RUNTIME_TIMEOUT",
      }),
    });
  });

  it("keeps read-only work leaseable while the runtime error breaker pauses new write runs", async () => {
    const fixture = await createFixture(1, new Date(Date.now() - 5 * 60 * 60_000));
    const now = new Date();
    for (const [index, runStatus] of ["SUCCEEDED", "FAILED", "FAILED"].entries()) {
      await integrationDatabase.agentRun.create({
        data: {
          agentProfileId: fixture.created.agent.profile.id,
          personaVersionId: fixture.created.agent.personaVersion.id,
          runType: "NORMAL_WAKE",
          runStatus: runStatus as "SUCCEEDED" | "FAILED",
          queuePriority: "SCHEDULED_CONTENT",
          trigger: "BREAKER_INTEGRATION",
          idempotencyKey: `breaker-terminal:${index}`,
          timeoutSeconds: 600,
          desiredEntryMin: 2,
          desiredEntryMax: 3,
          startedAt: new Date(now.getTime() - (index + 2) * 60_000),
          finishedAt: new Date(now.getTime() - (index + 1) * 30_000),
          errorCode: runStatus === "FAILED" ? "VALIDATION_FAILURE" : null,
        },
      });
    }
    const readOnly = await integrationDatabase.agentRun.create({
      data: {
        agentProfileId: fixture.created.agent.profile.id,
        personaVersionId: fixture.created.agent.personaVersion.id,
        runType: "READ_ONLY",
        queuePriority: "REFLECTION",
        trigger: "BREAKER_INTEGRATION",
        idempotencyKey: "breaker-read-only",
        timeoutSeconds: 600,
        desiredEntryMin: 0,
        desiredEntryMax: 0,
        allowTopicCreation: false,
        allowVoting: false,
        allowFollowing: false,
      },
    });
    const principal = await runtimePrincipal(fixture.credential, "runtime:lease");
    await expect(
      leaseRuntimeRun(integrationDatabase, principal, {
        workerId: "breaker-read-worker",
        leaseSeconds: 60,
      }),
    ).resolves.toMatchObject({ run: { id: readOnly.id, runType: "READ_ONLY" }, reason: null });
    expect(
      await integrationDatabase.agentRun.findUniqueOrThrow({ where: { id: fixture.runs[0]!.id } }),
    ).toMatchObject({ runStatus: "QUEUED" });
  });

  it("persistently auto-pauses global runtime for a critical breaker in the first four hours", async () => {
    const fixture = await createFixture(2);
    const principal = await runtimePrincipal(fixture.credential, "runtime:lease");
    await expect(
      leaseRuntimeRun(integrationDatabase, principal, {
        workerId: "day-zero-existing-lease-worker",
        leaseSeconds: 60,
      }),
    ).resolves.toMatchObject({ run: { id: fixture.runs[0]!.id }, reason: null });
    const now = new Date();
    for (const [index, runStatus] of ["SUCCEEDED", "FAILED", "FAILED"].entries()) {
      await integrationDatabase.agentRun.create({
        data: {
          agentProfileId: fixture.created.agent.profile.id,
          personaVersionId: fixture.created.agent.personaVersion.id,
          runType: "NORMAL_WAKE",
          runStatus: runStatus as "SUCCEEDED" | "FAILED",
          queuePriority: "SCHEDULED_CONTENT",
          trigger: "DAY_ZERO_CRITICAL_BREAKER",
          idempotencyKey: `day-zero-critical-terminal:${index}`,
          timeoutSeconds: 600,
          desiredEntryMin: 2,
          desiredEntryMax: 3,
          startedAt: new Date(now.getTime() - (index + 2) * 60_000),
          finishedAt: new Date(now.getTime() - (index + 1) * 30_000),
          errorCode: runStatus === "FAILED" ? "VALIDATION_FAILURE" : null,
        },
      });
    }
    const settingsBefore = await integrationDatabase.agentGlobalSettings.findUniqueOrThrow({
      where: { id: "global" },
    });
    const leaseResults = await Promise.all([
      leaseRuntimeRun(integrationDatabase, principal, {
        workerId: "day-zero-critical-breaker-worker-a",
        leaseSeconds: 60,
      }),
      leaseRuntimeRun(integrationDatabase, principal, {
        workerId: "day-zero-critical-breaker-worker-b",
        leaseSeconds: 60,
      }),
    ]);
    expect(leaseResults.map(({ reason }) => reason).sort()).toEqual(["ERROR_PAUSED", "PAUSED"]);
    expect(
      await integrationDatabase.agentGlobalSettings.findUniqueOrThrow({ where: { id: "global" } }),
    ).toMatchObject({
      runtimeEnabled: false,
      settingsVersion: settingsBefore.settingsVersion + 1,
      updatedById: null,
    });
    const pauseEvent = await integrationDatabase.agentRuntimeEvent.findFirstOrThrow({
      where: { eventType: "runtime.global.paused" },
      orderBy: { id: "desc" },
    });
    expect(pauseEvent.metadata).toMatchObject({
      command: "AUTO_PAUSE",
      reason: "DAY_ZERO_CRITICAL_BREAKER",
      activeCriticalCodes: ["RUNTIME_ERROR_RATE"],
    });
    expect(
      await integrationDatabase.agentRuntimeEvent.count({
        where: { eventType: "runtime.global.paused" },
      }),
    ).toBe(1);
    expect(
      await integrationDatabase.auditLog.findFirstOrThrow({
        where: { action: "agent.settings.changed", actorId: null },
        orderBy: { createdAt: "desc" },
      }),
    ).toMatchObject({
      entityType: "AgentGlobalSettings",
      entityId: "00000000-0000-4000-8000-000000000001",
      metadata: expect.objectContaining({ reason: "DAY_ZERO_CRITICAL_BREAKER" }),
    });
    expect(
      await integrationDatabase.auditLog.count({
        where: { action: "agent.settings.changed", actorId: null },
      }),
    ).toBe(1);
    expect(
      await integrationDatabase.outboxEvent.findFirstOrThrow({
        where: { eventType: "agent.settings.changed", actorId: null },
        orderBy: { createdAt: "desc" },
      }),
    ).toMatchObject({
      aggregateType: "AgentGlobalSettings",
      aggregateId: "00000000-0000-4000-8000-000000000001",
      payload: expect.objectContaining({ reason: "DAY_ZERO_CRITICAL_BREAKER" }),
    });
    expect(
      await integrationDatabase.outboxEvent.count({
        where: { eventType: "agent.settings.changed", actorId: null },
      }),
    ).toBe(1);
    const breakerOutbox = await integrationDatabase.outboxEvent.findMany({
      where: {
        eventType: "agent.circuit_breaker.triggered",
        aggregateId: "00000000-0000-4000-8000-000000000001",
      },
    });
    expect(breakerOutbox).toHaveLength(1);
    expect(breakerOutbox[0]).toMatchObject({
      aggregateType: "AgentGlobalSettings",
      actorId: null,
      actorKind: null,
      payload: expect.objectContaining({
        reasonCode: "DAY_ZERO_CRITICAL_BREAKER",
        activeCriticalCodes: ["RUNTIME_ERROR_RATE"],
        before: { runtimeEnabled: true },
        after: {
          runtimeEnabled: false,
          settingsVersion: settingsBefore.settingsVersion + 1,
        },
      }),
    });
    expect(
      await integrationDatabase.agentRun.findUniqueOrThrow({ where: { id: fixture.runs[1]!.id } }),
    ).toMatchObject({ runStatus: "QUEUED" });
  });

  it("returns ERROR_PAUSED after five consecutive global Codex failures", async () => {
    const fixture = await createFixture();
    const now = new Date();
    for (let index = 0; index < 5; index += 1) {
      await integrationDatabase.agentRun.create({
        data: {
          agentProfileId: fixture.created.agent.profile.id,
          personaVersionId: fixture.created.agent.personaVersion.id,
          runType: "NORMAL_WAKE",
          runStatus: "FAILED",
          queuePriority: "SCHEDULED_CONTENT",
          trigger: "BREAKER_INTEGRATION",
          idempotencyKey: `codex-breaker-terminal:${index}`,
          timeoutSeconds: 600,
          desiredEntryMin: 2,
          desiredEntryMax: 3,
          startedAt: new Date(now.getTime() - (index + 2) * 60_000),
          finishedAt: new Date(now.getTime() - (index + 1) * 30_000),
          errorCode: "CODEX_TIMEOUT",
        },
      });
    }
    const principal = await runtimePrincipal(fixture.credential, "runtime:lease");
    await expect(
      leaseRuntimeRun(integrationDatabase, principal, {
        workerId: "breaker-paused-worker",
        leaseSeconds: 60,
      }),
    ).resolves.toEqual({ run: null, reason: "ERROR_PAUSED" });
    expect(await integrationDatabase.agentRun.count({ where: { runStatus: "RUNNING" } })).toBe(0);
    expect(
      await integrationDatabase.agentGlobalSettings.findUniqueOrThrow({ where: { id: "global" } }),
    ).toMatchObject({ runtimeEnabled: false, updatedById: null });
    expect(
      await integrationDatabase.agentRuntimeEvent.count({
        where: { eventType: "runtime.production.activated" },
      }),
    ).toBe(1);
    await setGlobalRuntimeEnabled(integrationDatabase, adminActor(fixture.admin.id), true, {
      reason: "Reset verified Codex breaker after operator review.",
    });
    expect(
      await integrationDatabase.agentRuntimeEvent.count({
        where: { eventType: "runtime.production.activated" },
      }),
    ).toBe(1);
    await expect(
      leaseRuntimeRun(integrationDatabase, principal, {
        workerId: "breaker-reset-worker",
        leaseSeconds: 60,
      }),
    ).resolves.toMatchObject({ run: { id: fixture.runs[0]!.id }, reason: null });
  });

  it("emits a generic breaker transition once outside the Day 0 auto-pause window", async () => {
    const now = new Date();
    const fixture = await createFixture(1, new Date(now.getTime() - 5 * 60 * 60_000));
    for (let index = 0; index < 5; index += 1) {
      await integrationDatabase.agentRun.create({
        data: {
          agentProfileId: fixture.created.agent.profile.id,
          personaVersionId: fixture.created.agent.personaVersion.id,
          runType: "NORMAL_WAKE",
          runStatus: "FAILED",
          queuePriority: "SCHEDULED_CONTENT",
          trigger: "GENERIC_BREAKER_TRANSITION",
          idempotencyKey: `generic-breaker-terminal:${index}`,
          timeoutSeconds: 600,
          desiredEntryMin: 2,
          desiredEntryMax: 3,
          startedAt: new Date(now.getTime() - (index + 2) * 60_000),
          finishedAt: new Date(now.getTime() - (index + 1) * 30_000),
          errorCode: "CODEX_TIMEOUT",
        },
      });
    }
    const principal = await runtimePrincipal(fixture.credential, "runtime:lease");
    for (const workerId of ["generic-breaker-worker-a", "generic-breaker-worker-b"])
      await expect(
        leaseRuntimeRun(integrationDatabase, principal, { workerId, leaseSeconds: 60 }),
      ).resolves.toEqual({ run: null, reason: "ERROR_PAUSED" });

    await expect(
      integrationDatabase.agentGlobalSettings.findUniqueOrThrow({ where: { id: "global" } }),
    ).resolves.toMatchObject({ runtimeEnabled: true });
    const breakerOutbox = await integrationDatabase.outboxEvent.findMany({
      where: {
        eventType: "agent.circuit_breaker.triggered",
        aggregateId: "00000000-0000-4000-8000-000000000001",
      },
    });
    expect(breakerOutbox).toHaveLength(1);
    expect(breakerOutbox[0]).toMatchObject({
      aggregateType: "AgentGlobalSettings",
      actorId: null,
      actorKind: null,
      payload: expect.objectContaining({
        reasonCode: "THRESHOLD_TRANSITION",
        activeCodes: ["CONSECUTIVE_CODEX_FAILURES", "RUNTIME_ERROR_RATE"],
        triggeredCodes: ["CONSECUTIVE_CODEX_FAILURES", "RUNTIME_ERROR_RATE"],
        effects: expect.objectContaining({ runtimePaused: true, writeRunsPaused: true }),
        triggered: expect.arrayContaining([
          expect.objectContaining({
            code: "CONSECUTIVE_CODEX_FAILURES",
            severity: "CRITICAL",
          }),
        ]),
      }),
    });
    expect(
      await integrationDatabase.auditLog.count({
        where: { action: "agent.circuit_breaker.triggered" },
      }),
    ).toBe(1);
    expect(
      await integrationDatabase.agentRuntimeEvent.count({
        where: { eventType: "runtime.circuit_breaker.snapshot" },
      }),
    ).toBe(1);
  });

  it("prevents a retired agent from leasing with a stale authenticated principal", async () => {
    const fixture = await createFixture();
    const principal = await runtimePrincipal(fixture.credential, "runtime:lease");
    await changeAgentLifecycle(
      integrationDatabase,
      adminActor(fixture.admin.id),
      fixture.created.agent.profile.id,
      lifecycleChangeSchema.parse({
        status: "RETIRED",
        reason: "Retire before the stale authenticated principal can claim work.",
      }),
    );
    await expect(
      leaseRuntimeRun(integrationDatabase, principal, {
        workerId: "worker-stale-principal",
        leaseSeconds: 60,
      }),
    ).resolves.toEqual({ run: null, reason: "NOT_ACTIVE" });
    expect(await integrationDatabase.agentRun.count({ where: { runStatus: "RUNNING" } })).toBe(0);
  });

  it("keeps context credential-free, enforces lease ownership, and completes with measured counts", async () => {
    const fixture = await createFixture();
    await updateGlobalSettings(integrationDatabase, adminActor(fixture.admin.id), {
      debugRetentionHours: 7,
    });
    const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const writePrincipal = await runtimePrincipal(fixture.credential);
    const readPrincipal = await runtimePrincipal(fixture.credential, "runtime:read");
    const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId: "worker-main",
      leaseSeconds: 60,
    });
    const runId = leased.run!.id;
    await expect(
      heartbeatRuntimeRun(
        integrationDatabase,
        writePrincipal,
        runId,
        runtimeHeartbeatSchema.parse({
          runId,
          workerId: "wrong-worker",
          leaseToken: leased.run!.leaseToken,
          runtimeStatus: "READING",
        }),
      ),
    ).rejects.toMatchObject({ code: "AGENT_RUN_LEASE_INVALID" });
    await heartbeatRuntimeRun(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeHeartbeatSchema.parse({
        runId,
        workerId: "worker-main",
        runtimeStatus: "READING",
      }),
    );
    const visibleTopic = await createTopicWithFirstEntry(
      integrationDatabase,
      adminActor(fixture.admin.id),
      {
        title: "runtime perception visible",
        entryBody: "VISIBLE_PERCEPTION_BODY public akışta görülebilir.",
      },
    );
    const hiddenTopic = await createTopicWithFirstEntry(
      integrationDatabase,
      adminActor(fixture.admin.id),
      {
        title: "runtime perception hidden",
        entryBody: "HIDDEN_PERCEPTION_BODY modele asla gitmemeli.",
      },
    );
    await integrationDatabase.topic.update({
      where: { id: hiddenTopic.topic.id },
      data: { status: "HIDDEN" },
    });
    const context = await getRuntimeRunContext(
      integrationDatabase,
      readPrincipal,
      runId,
      "worker-main",
    );
    expect(JSON.stringify(context)).not.toMatch(/credential|email|password|tokenHash/iu);
    expect(JSON.stringify(context)).not.toMatch(/profileId|lifecycleStatus/iu);
    expect(context.agent).toEqual({
      username: fixture.created.agent.user.username,
      displayName: fixture.created.agent.user.displayName,
      publicBio: fixture.created.agent.user.bio,
    });
    expect(JSON.stringify(context)).toContain("VISIBLE_PERCEPTION_BODY");
    expect(JSON.stringify(context)).not.toContain("HIDDEN_PERCEPTION_BODY");
    expect(JSON.stringify(context)).not.toContain(fixture.admin.email);
    expect(context.run.debugRetentionHours).toBe(7);
    expect(Buffer.byteLength(JSON.stringify(context.perception), "utf8")).toBeLessThanOrEqual(
      65_536,
    );
    expect(context.perception.recentEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ topic: expect.objectContaining({ id: visibleTopic.topic.id }) }),
      ]),
    );
    await expect(
      recordRuntimeMemories(
        integrationDatabase,
        writePrincipal,
        runId,
        runtimeMemoriesSchema.parse({
          workerId: "worker-main",
          memories: [
            {
              sourceMemoryIds: [visibleTopic.entry.id],
              summary: "Normal run keyfi observation hafızası yazamamalıdır.",
              salience: 0.6,
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(context.persona.version).toBe(1);
    expect(context.persona.behavior).toMatchObject({
      topicCreationTendency: expect.any(Number),
      votingTendency: expect.any(Number),
      followingTendency: expect.any(Number),
    });
    expect(Object.keys(context.persona.behavior).sort()).toEqual([
      "followingTendency",
      "topicCreationTendency",
      "votingTendency",
    ]);
    await recordRuntimeEvents(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeEventsSchema.parse({
        workerId: "worker-main",
        events: [
          {
            eventType: "runtime.reading.completed",
            safeMessage: "Sınırlı context okuması tamamlandı.",
            metadata: { phase: "READING", count: 4 },
          },
        ],
      }),
    );
    await recordRuntimeActions(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeActionsSchema.parse({
        workerId: "worker-main",
        actions: [
          {
            sequence: 1,
            actionType: "NO_ACTION",
            safeReason: "Context doğrulaması public action gerektirmiyor.",
            input: {},
            provenance: {
              evidenceType: "PLATFORM_EVENT",
              evidenceIds: [runId],
              shortRationale: "Uygun ve doğrulanabilir public aksiyon bulunamadı.",
            },
          },
        ],
      }),
    );
    await completeRuntimeRun(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeCompleteSchema.parse({
        workerId: "worker-main",
        outcome: "SUCCEEDED",
        state: completedRuntimeFastState,
        safeRunSummary: {
          operationSummary: "Context okundu ve güvenli biçimde aksiyonsuz tamamlandı.",
          proposedActionCount: 1,
          completedActionCount: 0,
          rejectedActionCount: 0,
          shortRationale: "Yayınlanabilir aday bulunmadı.",
        },
        usageMetadata: { durationMs: 500, provider: "codex-cli" },
        performanceMetrics: { publishedEntries: 3, sourceReads: 4 },
      }),
    );
    expect(
      await integrationDatabase.agentRun.findUniqueOrThrow({ where: { id: runId } }),
    ).toMatchObject({
      runStatus: "SUCCEEDED",
      leaseOwner: null,
      leaseExpiresAt: null,
    });
    expect(
      await integrationDatabase.agentRuntimeState.findUniqueOrThrow({
        where: { agentProfileId: fixture.created.agent.profile.id },
      }),
    ).toMatchObject({
      currentRunId: null,
      todayPublishedEntries: 0,
      todaySourceReads: 0,
    });
    expect(await integrationDatabase.agentRunEvent.count({ where: { runId } })).toBe(3);
    expect(
      await integrationDatabase.agentMemoryEpisode.count({
        where: { runId },
      }),
    ).toBe(0);
    expect(await integrationDatabase.auditLog.count({ where: { entityId: runId } })).toBe(3);
    const completedOutbox = await integrationDatabase.outboxEvent.findMany({
      where: { eventType: "agent.run.completed", aggregateId: runId },
    });
    expect(completedOutbox).toHaveLength(1);
    expect(completedOutbox[0]).toMatchObject({
      aggregateType: "AgentRun",
      actorId: fixture.created.agent.user.id,
      actorKind: "AGENT",
      payload: expect.objectContaining({
        agentProfileId: fixture.created.agent.profile.id,
        runId,
        outcome: "SUCCEEDED",
        requestedOutcome: "SUCCEEDED",
      }),
    });
    expect(JSON.stringify(completedOutbox)).not.toContain(leased.run!.leaseToken);
  });

  it("persists only active owned memory lineage during nightly consolidation", async () => {
    const fixture = await createFixture();
    await updateGlobalSettings(integrationDatabase, adminActor(fixture.admin.id), {
      schedulerEnabled: false,
    });
    await integrationDatabase.agentRun.update({
      where: { id: fixture.runs[0]!.id },
      data: {
        runType: "REFLECTION",
        queuePriority: "MANUAL_SINGLE",
        trigger: "NIGHTLY_MEMORY_CONSOLIDATION",
        desiredEntryMin: 0,
        desiredEntryMax: 0,
        allowTopicCreation: false,
        allowVoting: false,
        allowFollowing: false,
        allowSourceReading: false,
      },
    });
    const sourceMemory = await integrationDatabase.agentMemoryEpisode.create({
      data: {
        agentProfileId: fixture.created.agent.profile.id,
        eventType: "ACTION_EXECUTED",
        summary: "Canonical action sonucu bu agente ait aktif hafıza kaydıdır.",
        salience: 0.7,
        provenance: "PLATFORM_EVENT",
        evidence: { evidenceIds: [fixture.runs[0]!.id] },
        occurredAt: new Date(),
      },
    });
    const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const readPrincipal = await runtimePrincipal(fixture.credential, "runtime:read");
    const writePrincipal = await runtimePrincipal(fixture.credential);
    const workerId = "memory-consolidation-worker";
    const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId,
      leaseSeconds: 60,
    });
    const runId = leased.run!.id;
    const context = await getRuntimeRunContext(integrationDatabase, readPrincipal, runId, workerId);
    expect(context.perception.memories).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: sourceMemory.id })]),
    );

    await recordRuntimeMemories(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeMemoriesSchema.parse({
        workerId,
        memories: [
          {
            sourceMemoryIds: [sourceMemory.id],
            summary:
              "Canonical action hafızası lineage korunarak güvenli biçimde konsolide edildi.",
            salience: 0.8,
          },
        ],
      }),
    );

    const consolidated = await integrationDatabase.agentMemoryEpisode.findFirstOrThrow({
      where: { runId, eventType: "MEMORY_CONSOLIDATION" },
    });
    expect(consolidated).toMatchObject({
      agentProfileId: fixture.created.agent.profile.id,
      provenance: "AGENT_MEMORY",
      subjectType: null,
      subjectId: null,
      evidence: { sourceMemoryIds: [sourceMemory.id] },
    });
    expect(
      await integrationDatabase.agentMemoryEpisode.count({
        where: { runId, eventType: "OBSERVATION_READ" },
      }),
    ).toBe(0);

    await integrationDatabase.agentMemoryEpisode.update({
      where: { id: sourceMemory.id },
      data: { invalidatedAt: new Date() },
    });
    await expect(
      recordRuntimeMemories(
        integrationDatabase,
        writePrincipal,
        runId,
        runtimeMemoriesSchema.parse({
          workerId,
          memories: [
            {
              sourceMemoryIds: [sourceMemory.id],
              summary: "Invalidated lineage ile ikinci consolidation oluşmamalıdır.",
              salience: 0.5,
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(
      await integrationDatabase.agentMemoryEpisode.count({
        where: { runId, eventType: "MEMORY_CONSOLIDATION" },
      }),
    ).toBe(1);
  });

  it("atomically applies weekly persona and source, relationship, belief deltas with a cumulative budget", async () => {
    const fixture = await createFixture();
    await updateGlobalSettings(integrationDatabase, adminActor(fixture.admin.id), {
      schedulerEnabled: false,
    });
    await integrationDatabase.agentRun.update({
      where: { id: fixture.runs[0]!.id },
      data: {
        runType: "REFLECTION",
        queuePriority: "MANUAL_SINGLE",
        trigger: "WEEKLY_PERSONA_REFLECTION",
        desiredEntryMin: 0,
        desiredEntryMax: 0,
        allowTopicCreation: false,
        allowVoting: false,
        allowFollowing: false,
        allowSourceReading: false,
      },
    });
    const source = await integrationDatabase.agentSource.findFirstOrThrow({
      where: { agentProfileId: fixture.created.agent.profile.id, adminBlocked: false },
    });
    const sourceDirection = source.trustScore <= 0.9 ? 1 : -1;
    const relationship = await integrationDatabase.agentRelationship.create({
      data: {
        agentProfileId: fixture.created.agent.profile.id,
        targetUserId: fixture.admin.id,
        familiarity: 0.4,
        trust: 0.4,
        interest: 0.5,
        disagreement: 0.2,
        summary: "Reflection integration için görünür ilişki kaydı.",
        lastInteractionAt: new Date(),
      },
    });
    const belief = await integrationDatabase.agentBelief.create({
      data: {
        agentProfileId: fixture.created.agent.profile.id,
        topicKey: "reflection integration kanıtı",
        statement: "Yalnız görünür dijital kanıtlarla güven değişebilir.",
        confidence: 0.5,
        evidenceSummary: "Integration fixture kanıt özeti.",
        evidenceProvenance: { evidenceType: "PLATFORM_EVENT", evidenceIds: [] },
        firstFormedAt: new Date(),
        lastUpdatedAt: new Date(),
        version: 1,
        status: "ACTIVE",
      },
    });
    const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const readPrincipal = await runtimePrincipal(fixture.credential, "runtime:read");
    const writePrincipal = await runtimePrincipal(fixture.credential);
    const workerId = "weekly-reflection-worker";
    const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId,
      leaseSeconds: 60,
    });
    const runId = leased.run!.id;
    const context = await getRuntimeRunContext(integrationDatabase, readPrincipal, runId, workerId);
    expect(context.perception.sources).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: source.id })]),
    );
    expect(context.perception.relationships).toEqual(
      expect.arrayContaining([expect.objectContaining({ targetUserId: fixture.admin.id })]),
    );
    expect(context.perception.beliefs).toEqual(
      expect.arrayContaining([expect.objectContaining({ topicKey: belief.topicKey })]),
    );
    const firstDelta = {
      safeSummary:
        "Haftalık görünür dijital kayıtlar küçük ve sınırlandırılmış state değişimlerini destekliyor.",
      interestDeltas: [],
      sourceTrustDeltas: [{ sourceId: source.id, delta: sourceDirection * 0.05 }],
      relationshipTrustDeltas: [{ targetUserId: fixture.admin.id, delta: 0.04 }],
      beliefConfidenceDeltas: [{ topicKey: belief.topicKey, delta: 0.06 }],
      temperamentDeltas: [{ key: "warmth" as const, delta: 0.01 }],
      coreValueDeltas: [],
    };
    const firstCompletion = await completeRuntimeRun(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeCompleteSchema.parse({
        workerId,
        outcome: "SUCCEEDED",
        state: completedRuntimeFastState,
        reflectionDelta: firstDelta,
        safeRunSummary: {
          operationSummary: "Weekly reflection yalnız structured delta ile tamamlandı.",
          observedItemIds: [],
          proposedActionCount: 0,
          completedActionCount: 0,
          rejectedActionCount: 0,
          shortRationale: "State hedefleri frozen perception içinde görünürdü.",
        },
        usageMetadata: { durationMs: 500, provider: "codex-cli" },
        performanceMetrics: {},
      }),
    );
    expect(firstCompletion).toMatchObject({
      runStatus: "SUCCEEDED",
      reflection: { status: "APPLIED", version: 2 },
    });

    const reflectedVersion = await integrationDatabase.agentPersonaVersion.findFirstOrThrow({
      where: { agentProfileId: fixture.created.agent.profile.id, version: 2 },
    });
    expect(reflectedVersion).toMatchObject({
      changeOrigin: "REFLECTION",
      changeSummary: firstDelta.safeSummary,
      previousVersionId: fixture.created.agent.personaVersion.id,
      createdById: null,
    });
    expect(reflectedVersion.validationReport).toMatchObject({
      runId,
      weeklyPersonaEvolutionDelta: firstDelta,
      stateChanges: {
        sourceIds: [source.id],
        relationshipIds: [relationship.id],
        beliefTopicKeys: [belief.topicKey],
      },
    });
    expect(
      await integrationDatabase.agentSource.findUniqueOrThrow({ where: { id: source.id } }),
    ).toMatchObject({ trustScore: source.trustScore + sourceDirection * 0.05 });
    const reflectionSourceAudit = await integrationDatabase.auditLog.findFirstOrThrow({
      where: {
        action: "agent.source.updated",
        entityType: "AgentSource",
        entityId: source.id,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(reflectionSourceAudit.metadata).toMatchObject({
      changeOrigin: "REFLECTION",
      runId,
      scoreChanges: {
        trustScore: {
          from: source.trustScore,
          to: source.trustScore + sourceDirection * 0.05,
        },
      },
      before: { trustScore: source.trustScore },
      after: { trustScore: source.trustScore + sourceDirection * 0.05 },
      weeklyScoreBudget: {
        timeZone: "Europe/Istanbul",
        fields: {
          trustScore: { usedBefore: 0, requested: 0.05, usedAfter: 0.05, bound: 0.1 },
        },
      },
    });
    const reflectionSourceOutbox = await integrationDatabase.outboxEvent.findMany({
      where: { eventType: "agent.source.changed", aggregateId: source.id },
    });
    expect(reflectionSourceOutbox).toHaveLength(1);
    expect(reflectionSourceOutbox[0]).toMatchObject({
      aggregateType: "AgentSource",
      actorId: fixture.created.agent.user.id,
      actorKind: "AGENT",
      payload: expect.objectContaining({
        agentProfileId: fixture.created.agent.profile.id,
        runId,
        sourceId: source.id,
        reasonCode: "REFLECTION_TRUST_CHANGED",
        changeOrigin: "REFLECTION",
        before: { trustScore: source.trustScore },
        after: { trustScore: source.trustScore + sourceDirection * 0.05 },
      }),
    });
    const reflectionPersonaOutbox = await integrationDatabase.outboxEvent.findMany({
      where: {
        eventType: "agent.persona.versioned",
        aggregateId: fixture.created.agent.profile.id,
      },
    });
    expect(reflectionPersonaOutbox).toHaveLength(1);
    expect(reflectionPersonaOutbox[0]).toMatchObject({
      aggregateType: "AgentProfile",
      actorId: fixture.created.agent.user.id,
      actorKind: "AGENT",
      payload: expect.objectContaining({
        agentProfileId: fixture.created.agent.profile.id,
        runId,
        personaVersionId: reflectedVersion.id,
        previousPersonaVersionId: fixture.created.agent.personaVersion.id,
        version: 2,
        changeOrigin: "REFLECTION",
        changedSourceIds: [source.id],
      }),
    });
    expect(
      await integrationDatabase.agentRelationship.findUniqueOrThrow({
        where: { id: relationship.id },
      }),
    ).toMatchObject({ trust: 0.44 });
    expect(
      await integrationDatabase.agentBelief.findFirstOrThrow({
        where: { agentProfileId: fixture.created.agent.profile.id, topicKey: belief.topicKey },
        orderBy: { version: "desc" },
      }),
    ).toMatchObject({ version: 2, confidence: 0.56 });
    expect(
      await integrationDatabase.agentProfile.findUniqueOrThrow({
        where: { id: fixture.created.agent.profile.id },
      }),
    ).toMatchObject({ currentPersonaVersionId: reflectedVersion.id });
    const reflectionLife = await integrationDatabase.agentRuntimeEvent.findMany({
      where: {
        agentProfileId: fixture.created.agent.profile.id,
        runId,
        eventType: {
          in: ["SOURCE_STATE_CHANGED", "RELATIONSHIP_CHANGED", "BELIEF_CHANGED", "PERSONA_CHANGED"],
        },
      },
      orderBy: { agentSequence: "asc" },
    });
    expect(reflectionLife).toHaveLength(4);
    expect(reflectionLife).toEqual([
      expect.objectContaining({
        eventType: "SOURCE_STATE_CHANGED",
        subject: { type: "SOURCE", id: source.id },
        beforeState: { trustScore: source.trustScore },
        afterState: { trustScore: source.trustScore + sourceDirection * 0.05 },
        changedFields: ["trustScore"],
      }),
      expect.objectContaining({
        eventType: "RELATIONSHIP_CHANGED",
        subject: {
          type: "USER",
          id: fixture.admin.id,
          relationshipId: relationship.id,
        },
        beforeState: { trust: 0.4 },
        afterState: { trust: 0.44 },
        changedFields: ["trust"],
      }),
      expect.objectContaining({
        eventType: "BELIEF_CHANGED",
        subject: { type: "BELIEF", topicKey: belief.topicKey },
        beforeState: { confidence: 0.5, version: 1 },
        afterState: { confidence: 0.56, version: 2 },
        changedFields: ["confidence", "version"],
      }),
      expect.objectContaining({
        eventType: "PERSONA_CHANGED",
        subject: { type: "PERSONA", id: reflectedVersion.id },
        beforeState: {
          personaVersionId: fixture.created.agent.personaVersion.id,
          version: 1,
        },
        afterState: { personaVersionId: reflectedVersion.id, version: 2 },
        changedFields: ["personaVersionId", "version"],
      }),
    ]);

    const secondRun = await integrationDatabase.agentRun.create({
      data: {
        agentProfileId: fixture.created.agent.profile.id,
        personaVersionId: reflectedVersion.id,
        runType: "REFLECTION",
        queuePriority: "MANUAL_SINGLE",
        trigger: "WEEKLY_PERSONA_REFLECTION",
        idempotencyKey: randomUUID(),
        timeoutSeconds: 600,
        desiredEntryMin: 0,
        desiredEntryMax: 0,
        allowTopicCreation: false,
        allowVoting: false,
        allowFollowing: false,
        allowSourceReading: false,
      },
    });
    const secondWorkerId = "weekly-reflection-budget-worker";
    const secondLease = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId: secondWorkerId,
      leaseSeconds: 60,
    });
    expect(secondLease.run?.id).toBe(secondRun.id);
    await getRuntimeRunContext(integrationDatabase, readPrincipal, secondRun.id, secondWorkerId);
    const sourceTrustAfterFirst = source.trustScore + sourceDirection * 0.05;
    const rejected = await completeRuntimeRun(
      integrationDatabase,
      writePrincipal,
      secondRun.id,
      runtimeCompleteSchema.parse({
        workerId: secondWorkerId,
        outcome: "SUCCEEDED",
        state: completedRuntimeFastState,
        reflectionDelta: {
          ...firstDelta,
          safeSummary:
            "Aynı hafta aynı source hedefi için kalan bütçeyi aşan delta reddedilmelidir.",
          sourceTrustDeltas: [{ sourceId: source.id, delta: sourceDirection * 0.06 }],
          relationshipTrustDeltas: [],
          beliefConfidenceDeltas: [],
          temperamentDeltas: [],
        },
        safeRunSummary: {
          operationSummary: "İkinci weekly reflection budget kontrolüne gönderildi.",
          observedItemIds: [],
          proposedActionCount: 0,
          completedActionCount: 0,
          rejectedActionCount: 0,
          shortRationale: "Cumulative Istanbul haftası bütçesi otoritedir.",
        },
        usageMetadata: { durationMs: 500, provider: "codex-cli" },
        performanceMetrics: {},
      }),
    );
    expect(rejected).toMatchObject({
      runStatus: "PARTIAL",
      reflection: {
        status: "REJECTED_PERSONA_DELTA",
        reasonCode: "PERSONA_WEEKLY_DELTA_BUDGET_EXCEEDED",
      },
    });
    expect(
      await integrationDatabase.agentSource.findUniqueOrThrow({ where: { id: source.id } }),
    ).toMatchObject({ trustScore: sourceTrustAfterFirst });
    expect(
      await integrationDatabase.agentPersonaVersion.count({
        where: { agentProfileId: fixture.created.agent.profile.id },
      }),
    ).toBe(2);
  });

  it("shares one Istanbul-week source score budget between admin and reflection writes", async () => {
    const fixture = await createFixture();
    await updateGlobalSettings(integrationDatabase, adminActor(fixture.admin.id), {
      schedulerEnabled: false,
    });
    await integrationDatabase.agentRun.update({
      where: { id: fixture.runs[0]!.id },
      data: {
        runType: "REFLECTION",
        queuePriority: "MANUAL_SINGLE",
        trigger: "WEEKLY_PERSONA_REFLECTION",
        desiredEntryMin: 0,
        desiredEntryMax: 0,
        allowTopicCreation: false,
        allowVoting: false,
        allowFollowing: false,
        allowSourceReading: false,
      },
    });
    const source = await integrationDatabase.agentSource.findFirstOrThrow({
      where: { agentProfileId: fixture.created.agent.profile.id, adminBlocked: false },
    });
    const sourceDirection = source.trustScore <= 0.89 ? 1 : -1;
    const adminTrustScore = source.trustScore + sourceDirection * 0.06;
    await updateAgentSourceAdmin(
      integrationDatabase,
      adminActor(fixture.admin.id),
      source.id,
      agentSourceAdminUpdateSchema.parse({
        trustScore: adminTrustScore,
        reason: "Admin aynı İstanbul haftasındaki ortak source score bütçesini tüketmektedir.",
      }),
    );

    const workerId = "combined-source-budget-worker";
    const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const readPrincipal = await runtimePrincipal(fixture.credential, "runtime:read");
    const writePrincipal = await runtimePrincipal(fixture.credential);
    const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId,
      leaseSeconds: 60,
    });
    const runId = leased.run!.id;
    const context = await getRuntimeRunContext(integrationDatabase, readPrincipal, runId, workerId);
    expect(context.perception.sources).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: source.id })]),
    );
    const rejected = await completeRuntimeRun(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeCompleteSchema.parse({
        workerId,
        outcome: "SUCCEEDED",
        state: completedRuntimeFastState,
        reflectionDelta: {
          safeSummary:
            "Görünür source için önerilen küçük trust değişimi ortak haftalık budget ile sınanır.",
          interestDeltas: [],
          sourceTrustDeltas: [{ sourceId: source.id, delta: sourceDirection * 0.05 }],
          relationshipTrustDeltas: [],
          beliefConfidenceDeltas: [],
          temperamentDeltas: [],
          coreValueDeltas: [],
        },
        safeRunSummary: {
          operationSummary: "Admin ve reflection source score budget birleşimi sınandı.",
          observedItemIds: [],
          proposedActionCount: 0,
          completedActionCount: 0,
          rejectedActionCount: 0,
          shortRationale: "Aynı İstanbul haftası ve source için tek ledger otoritedir.",
        },
        usageMetadata: { durationMs: 500, provider: "codex-cli" },
        performanceMetrics: {},
      }),
    );
    expect(rejected).toMatchObject({
      runStatus: "PARTIAL",
      reflection: {
        status: "REJECTED_PERSONA_DELTA",
        reasonCode: "SOURCE_WEEKLY_DELTA_BUDGET_EXCEEDED",
      },
    });
    expect(
      await integrationDatabase.agentSource.findUniqueOrThrow({ where: { id: source.id } }),
    ).toMatchObject({ trustScore: adminTrustScore });
    expect(
      await integrationDatabase.agentPersonaVersion.count({
        where: { agentProfileId: fixture.created.agent.profile.id },
      }),
    ).toBe(1);
    expect(
      await integrationDatabase.auditLog.count({
        where: {
          action: "agent.source.changed",
          entityType: "AgentSource",
          entityId: source.id,
        },
      }),
    ).toBe(1);
  });

  it("charges a reflection source score change to a later admin write in the same week", async () => {
    const fixture = await createFixture();
    await updateGlobalSettings(integrationDatabase, adminActor(fixture.admin.id), {
      schedulerEnabled: false,
    });
    await integrationDatabase.agentRun.update({
      where: { id: fixture.runs[0]!.id },
      data: {
        runType: "REFLECTION",
        queuePriority: "MANUAL_SINGLE",
        trigger: "WEEKLY_PERSONA_REFLECTION",
        desiredEntryMin: 0,
        desiredEntryMax: 0,
        allowTopicCreation: false,
        allowVoting: false,
        allowFollowing: false,
        allowSourceReading: false,
      },
    });
    const source = await integrationDatabase.agentSource.findFirstOrThrow({
      where: { agentProfileId: fixture.created.agent.profile.id, adminBlocked: false },
    });
    const sourceDirection = source.trustScore <= 0.89 ? 1 : -1;
    const reflectedTrustScore = source.trustScore + sourceDirection * 0.06;
    const workerId = "reflection-first-source-budget-worker";
    const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const readPrincipal = await runtimePrincipal(fixture.credential, "runtime:read");
    const writePrincipal = await runtimePrincipal(fixture.credential);
    const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId,
      leaseSeconds: 60,
    });
    const runId = leased.run!.id;
    await getRuntimeRunContext(integrationDatabase, readPrincipal, runId, workerId);
    const completed = await completeRuntimeRun(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeCompleteSchema.parse({
        workerId,
        outcome: "SUCCEEDED",
        state: completedRuntimeFastState,
        reflectionDelta: {
          safeSummary:
            "Görünür source trust değişimi önce reflection kanalından ortak haftalık budgeta yazılır.",
          interestDeltas: [],
          sourceTrustDeltas: [{ sourceId: source.id, delta: sourceDirection * 0.06 }],
          relationshipTrustDeltas: [],
          beliefConfidenceDeltas: [],
          temperamentDeltas: [],
          coreValueDeltas: [],
        },
        safeRunSummary: {
          operationSummary: "Reflection source score budget kaydı oluşturdu.",
          observedItemIds: [],
          proposedActionCount: 0,
          completedActionCount: 0,
          rejectedActionCount: 0,
          shortRationale: "Reflection audit kaydı sonraki admin yazısına da otoritedir.",
        },
        usageMetadata: { durationMs: 500, provider: "codex-cli" },
        performanceMetrics: {},
      }),
    );
    expect(completed).toMatchObject({
      runStatus: "SUCCEEDED",
      reflection: { status: "APPLIED" },
    });

    await expect(
      updateAgentSourceAdmin(
        integrationDatabase,
        adminActor(fixture.admin.id),
        source.id,
        agentSourceAdminUpdateSchema.parse({
          trustScore: reflectedTrustScore + sourceDirection * 0.05,
          reason:
            "Admin yazısı önceki reflection değişimiyle birleşince ortak haftalık bütçeyi aşmaktadır.",
        }),
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      details: { reasonCode: "SOURCE_WEEKLY_DELTA_BUDGET_EXCEEDED" },
    });
    expect(
      await integrationDatabase.agentSource.findUniqueOrThrow({ where: { id: source.id } }),
    ).toMatchObject({ trustScore: reflectedTrustScore });
    const sourceAudits = await integrationDatabase.auditLog.findMany({
      where: {
        action: "agent.source.updated",
        entityType: "AgentSource",
        entityId: source.id,
      },
    });
    expect(sourceAudits).toHaveLength(1);
    expect(sourceAudits[0]!.metadata).toMatchObject({
      changeOrigin: "REFLECTION",
      runId,
      before: { trustScore: source.trustScore },
      after: { trustScore: reflectedTrustScore },
    });
  });

  it.each(["GLOBAL", "PROFILE"] as const)(
    "leaves persona unchanged when %s evolution is frozen",
    async (freezeScope) => {
      const fixture = await createFixture();
      await updateGlobalSettings(integrationDatabase, adminActor(fixture.admin.id), {
        schedulerEnabled: false,
        ...(freezeScope === "GLOBAL" ? { personaEvolutionEnabled: false } : {}),
      });
      if (freezeScope === "PROFILE")
        await integrationDatabase.agentProfile.update({
          where: { id: fixture.created.agent.profile.id },
          data: { personaEvolutionEnabled: false },
        });
      await integrationDatabase.agentRun.update({
        where: { id: fixture.runs[0]!.id },
        data: {
          runType: "REFLECTION",
          queuePriority: "MANUAL_SINGLE",
          trigger: "WEEKLY_PERSONA_REFLECTION",
          desiredEntryMin: 0,
          desiredEntryMax: 0,
          allowTopicCreation: false,
          allowVoting: false,
          allowFollowing: false,
          allowSourceReading: false,
        },
      });
      const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
      const writePrincipal = await runtimePrincipal(fixture.credential);
      const workerId = `frozen-reflection-${freezeScope.toLowerCase()}`;
      const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
        workerId,
        leaseSeconds: 60,
      });
      const completion = await completeRuntimeRun(
        integrationDatabase,
        writePrincipal,
        leased.run!.id,
        runtimeCompleteSchema.parse({
          workerId,
          outcome: "SUCCEEDED",
          state: completedRuntimeFastState,
          reflectionDelta: {
            safeSummary: "Frozen evolution bu geçerli deltayı uygulamadan bırakmalıdır.",
            interestDeltas: [],
            sourceTrustDeltas: [],
            relationshipTrustDeltas: [],
            beliefConfidenceDeltas: [],
            temperamentDeltas: [{ key: "warmth", delta: 0.01 }],
            coreValueDeltas: [],
          },
          safeRunSummary: {
            operationSummary: "Frozen reflection güvenli biçimde sonuçlandı.",
            observedItemIds: [],
            proposedActionCount: 0,
            completedActionCount: 0,
            rejectedActionCount: 0,
            shortRationale: "Evolution gate kapalıdır.",
          },
          usageMetadata: { durationMs: 100, provider: "codex-cli" },
          performanceMetrics: {},
        }),
      );
      expect(completion).toMatchObject({
        runStatus: "SUCCEEDED",
        reflection: { status: "FROZEN" },
      });
      expect(
        await integrationDatabase.agentPersonaVersion.count({
          where: { agentProfileId: fixture.created.agent.profile.id },
        }),
      ).toBe(1);
      expect(
        await integrationDatabase.agentProfile.findUniqueOrThrow({
          where: { id: fixture.created.agent.profile.id },
        }),
      ).toMatchObject({ currentPersonaVersionId: fixture.created.agent.personaVersion.id });
    },
  );

  it("executes a proposed entry through the V1 service and records provenance atomically", async () => {
    const fixture = await createFixture();
    const topic = await createTopicWithFirstEntry(
      integrationDatabase,
      adminActor(fixture.admin.id),
      { title: "runtime action integration", entryBody: "İlk insan entry içeriği." },
    );
    const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const writePrincipal = await runtimePrincipal(fixture.credential);
    const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId: "action-worker",
      leaseSeconds: 60,
    });
    const runId = leased.run!.id;
    await recordRuntimeActions(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeActionsSchema.parse({
        workerId: "action-worker",
        actions: [
          {
            sequence: 1,
            actionType: "CREATE_ENTRY",
            safeReason: "Runtime integration kanıtı güvenli entry adayını destekliyor.",
            targetType: "TOPIC",
            targetId: topic.topic.id,
            input: { topicId: topic.topic.id, body: "Agent tarafından yazılan doğrulanmış entry." },
            provenance: {
              evidenceType: "PLATFORM_EVENT",
              evidenceIds: [runId],
              shortRationale: "Runtime integration olayı bu eylemin kaynağıdır.",
            },
          },
        ],
      }),
    );
    const first = await executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
      workerId: "action-worker",
      sequence: 1,
    });
    const replay = await executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
      workerId: "action-worker",
      sequence: 1,
    });
    await recordRuntimeActions(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeActionsSchema.parse({
        workerId: "action-worker",
        actions: [
          {
            sequence: 2,
            actionType: "CREATE_ENTRY",
            safeReason: "Duplicate policy aynı entry adayını yeniden doğruluyor.",
            targetType: "TOPIC",
            targetId: topic.topic.id,
            input: { topicId: topic.topic.id, body: "Agent tarafından yazılan doğrulanmış entry." },
            provenance: {
              evidenceType: "PLATFORM_EVENT",
              evidenceIds: [runId],
              shortRationale: "Duplicate policy integration adayıdır.",
            },
          },
          {
            sequence: 3,
            actionType: "CREATE_ENTRY",
            safeReason: "İkinci pre-proposed duplicate adayı bağımsız olarak doğrulanıyor.",
            targetType: "TOPIC",
            targetId: topic.topic.id,
            input: { topicId: topic.topic.id, body: "Agent tarafından yazılan doğrulanmış entry." },
            provenance: {
              evidenceType: "PLATFORM_EVENT",
              evidenceIds: [runId],
              shortRationale: "Duplicate policy integration adayıdır.",
            },
          },
        ],
      }),
    );
    const duplicate = await executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
      workerId: "action-worker",
      sequence: 2,
    });
    const secondDuplicate = await executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
      workerId: "action-worker",
      sequence: 3,
    });
    await recordRuntimeActions(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeActionsSchema.parse({
        workerId: "action-worker",
        actions: [
          {
            sequence: 4,
            actionType: "CREATE_ENTRY",
            safeReason:
              "Tek izinli duplicate repair aynı kanıtla yalnız body alanını değiştiriyor.",
            repairOfSequence: 2,
            targetType: "TOPIC",
            targetId: topic.topic.id,
            input: {
              topicId: topic.topic.id,
              body: "Agent tarafından yazılan güvenli doğrulanmış entry.",
            },
            provenance: {
              evidenceType: "PLATFORM_EVENT",
              evidenceIds: [runId],
              shortRationale: "Duplicate policy integration adayıdır.",
            },
          },
        ],
      }),
    );
    const rejectedRepair = await executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
      workerId: "action-worker",
      sequence: 4,
    });
    await expect(
      recordRuntimeActions(
        integrationDatabase,
        writePrincipal,
        runId,
        runtimeActionsSchema.parse({
          workerId: "action-worker",
          actions: [
            {
              sequence: 5,
              actionType: "CREATE_ENTRY",
              safeReason: "İkinci dynamic repair policy tarafından reddedilmelidir.",
              repairOfSequence: 3,
              targetType: "TOPIC",
              targetId: topic.topic.id,
              input: {
                topicId: topic.topic.id,
                body: "Agent tarafından yazılan daha farklı doğrulanmış entry.",
              },
              provenance: {
                evidenceType: "PLATFORM_EVENT",
                evidenceIds: [runId],
                shortRationale: "Duplicate policy integration adayıdır.",
              },
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: "AGENT_DUPLICATE_REPAIR_INVALID" });
    expect(first).toMatchObject({ actionStatus: "SUCCEEDED" });
    expect(replay).toMatchObject({ id: first.id, actionStatus: "SUCCEEDED" });
    expect(duplicate).toMatchObject({
      actionStatus: "REJECTED",
      rejectionCode: "DUPLICATE_SIMILARITY",
    });
    expect(secondDuplicate).toMatchObject({
      actionStatus: "REJECTED",
      rejectionCode: "DUPLICATE_SIMILARITY",
    });
    expect(rejectedRepair).toMatchObject({ actionStatus: "REJECTED" });
    expect(["DUPLICATE_SIMILARITY", "DUPLICATE_FRAMING"]).toContain(rejectedRepair.rejectionCode);
    const content = await integrationDatabase.agentContentRecord.findUniqueOrThrow({
      where: { actionId: first.id },
      include: { entry: true },
    });
    expect(content.entry).toMatchObject({
      topicId: topic.topic.id,
      authorId: fixture.created.agent.user.id,
      origin: "AGENT",
      status: "ACTIVE",
    });
    expect(await integrationDatabase.agentContentRecord.count()).toBe(1);
    expect(
      await integrationDatabase.auditLog.count({
        where: { action: "agent.action.succeeded", entityId: first.id },
      }),
    ).toBe(1);
    const proposedAudit = await integrationDatabase.auditLog.findFirstOrThrow({
      where: { action: "agent.run.actions_proposed", entityId: runId },
      orderBy: { createdAt: "asc" },
    });
    expect(proposedAudit.metadata).toMatchObject({
      safeReasons: ["Runtime integration kanıtı güvenli entry adayını destekliyor."],
    });
    expect(JSON.stringify(proposedAudit.metadata)).not.toContain(
      "Agent tarafından yazılan doğrulanmış entry.",
    );
    const storedRepair = await integrationDatabase.agentAction.findUniqueOrThrow({
      where: { runId_sequence: { runId, sequence: 4 } },
    });
    expect(storedRepair.input).toMatchObject({
      safeReason: "Tek izinli duplicate repair aynı kanıtla yalnız body alanını değiştiriyor.",
    });
    expect(storedRepair.validationResult).toMatchObject({ repairOfSequence: 2 });
  });

  it("rejects ambiguous CREATE_ENTRY targets and uses one canonical topic for policy and write", async () => {
    const fixture = await createFixture();
    const [lockedTopic, otherTopic] = await Promise.all([
      createTopicWithFirstEntry(integrationDatabase, adminActor(fixture.admin.id), {
        title: "runtime canonical action target",
        entryBody: "Kanonik action hedefi için ilk insan entry içeriği.",
      }),
      createTopicWithFirstEntry(integrationDatabase, adminActor(fixture.admin.id), {
        title: "runtime mismatched action target",
        entryBody: "Uyumsuz action hedefi için diğer insan entry içeriği.",
      }),
    ]);
    await setAgentTopicWriteLock(integrationDatabase, adminActor(fixture.admin.id), {
      topicId: lockedTopic.topic.id,
      durationMinutes: 60,
      reason: "Kanonik topic policy ve write hedefinin aynı olduğunu doğrulayan test kilidi.",
    });
    const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const writePrincipal = await runtimePrincipal(fixture.credential);
    const workerId = "canonical-action-target-worker";
    const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId,
      leaseSeconds: 60,
    });
    const runId = leased.run!.id;
    const provenance = {
      evidenceType: "PLATFORM_EVENT" as const,
      evidenceIds: [runId],
      shortRationale: "Runtime run kanonik action hedefi için görünür kanıttır.",
    };
    await recordRuntimeActions(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeActionsSchema.parse({
        workerId,
        actions: [
          {
            sequence: 1,
            actionType: "CREATE_ENTRY",
            safeReason: "USER etiketi altındaki topic kimliği fail-closed reddedilmelidir.",
            targetType: "USER",
            targetId: lockedTopic.topic.id,
            input: { body: "Ambiguous USER hedefi public write işlemine dönüşmemelidir." },
            provenance,
          },
          {
            sequence: 2,
            actionType: "CREATE_ENTRY",
            safeReason: "Birbirinden farklı topic hedefleri fail-closed reddedilmelidir.",
            targetType: "TOPIC",
            targetId: lockedTopic.topic.id,
            input: {
              topicId: otherTopic.topic.id,
              body: "Policy ve write için farklı topic kimliği kullanılamamalıdır.",
            },
            provenance,
          },
          {
            sequence: 3,
            actionType: "CREATE_ENTRY",
            safeReason: "Target üzerindeki kanonik topic write-lock politikasından geçmelidir.",
            targetType: "TOPIC",
            targetId: lockedTopic.topic.id,
            input: { body: "Kilitli kanonik topic için bu entry yayınlanmamalıdır." },
            provenance,
          },
        ],
      }),
    );

    for (const sequence of [1, 2])
      await expect(
        executeRuntimeAction(integrationDatabase, writePrincipal, runId, { workerId, sequence }),
      ).resolves.toMatchObject({
        actionStatus: "REJECTED",
        rejectionCode: "ACTION_TARGET_INVALID",
      });
    await expect(
      executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
        workerId,
        sequence: 3,
      }),
    ).resolves.toMatchObject({
      actionStatus: "REJECTED",
      rejectionCode: "TOPIC_WRITE_LOCKED",
    });
    expect(
      await integrationDatabase.entry.count({
        where: { authorId: fixture.created.agent.user.id },
      }),
    ).toBe(0);

    await removeAgentTopicWriteLock(
      integrationDatabase,
      adminActor(fixture.admin.id),
      lockedTopic.topic.id,
      { reason: "Kanonik target-only write doğrulaması için test kilidi kaldırılıyor." },
    );
    await recordRuntimeActions(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeActionsSchema.parse({
        workerId,
        actions: [
          {
            sequence: 4,
            actionType: "CREATE_ENTRY",
            safeReason: "Tek kanonik target kimliği policy ve public write için kullanılmalıdır.",
            targetType: "TOPIC",
            targetId: lockedTopic.topic.id,
            input: { body: "Kilit kalkınca aynı kanonik topic üzerinde güvenli entry yayınlanır." },
            provenance,
          },
        ],
      }),
    );
    const succeeded = await executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
      workerId,
      sequence: 4,
    });
    expect(succeeded).toMatchObject({
      actionStatus: "SUCCEEDED",
      result: { topicId: lockedTopic.topic.id },
    });
    await expect(
      integrationDatabase.agentContentRecord.findUniqueOrThrow({
        where: { actionId: succeeded.id },
        include: { entry: true },
      }),
    ).resolves.toMatchObject({ entry: { topicId: lockedTopic.topic.id } });
  });

  it("executes topic, vote, follow and own-entry edit actions through the V1 services", async () => {
    const fixture = await createFixture();
    const humanTopic = await createTopicWithFirstEntry(
      integrationDatabase,
      adminActor(fixture.admin.id),
      {
        title: `runtime v1 action targets ${randomUUID()}`,
        entryBody: "Runtime V1 action integration için insan tarafından yazılmış entry.",
      },
    );
    const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const writePrincipal = await runtimePrincipal(fixture.credential);
    const workerId = "v1-action-worker";
    const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId,
      leaseSeconds: 60,
    });
    const runId = leased.run!.id;
    const provenance = {
      evidenceType: "PLATFORM_EVENT" as const,
      evidenceIds: [runId],
      shortRationale: "Görünür runtime run olayı V1 action entegrasyon kanıtıdır.",
    };
    await recordRuntimeActions(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeActionsSchema.parse({
        workerId,
        actions: [
          {
            sequence: 1,
            actionType: "CREATE_TOPIC_WITH_ENTRY",
            safeReason: "Görünür platform bağlamı yeni topic ve entry adayını destekliyor.",
            input: {
              title: `runtime agent topic ${randomUUID()}`,
              body: "Görünür platform bağlamına dayanan özgün agent topic entry içeriği.",
            },
            provenance,
          },
          {
            sequence: 2,
            actionType: "VOTE_UP",
            safeReason: "Görünür insan entry içeriği olumlu oy action'ını destekliyor.",
            targetType: "ENTRY",
            targetId: humanTopic.entry.id,
            input: { entryId: humanTopic.entry.id },
            provenance,
          },
          {
            sequence: 3,
            actionType: "FOLLOW_TOPIC",
            safeReason: "Görünür topic bağlamı topic takip action'ını destekliyor.",
            targetType: "TOPIC",
            targetId: humanTopic.topic.id,
            input: { topicId: humanTopic.topic.id },
            provenance,
          },
          {
            sequence: 4,
            actionType: "FOLLOW_USER",
            safeReason: "Görünür kullanıcı etkileşimi user takip action'ını destekliyor.",
            targetType: "USER",
            targetId: fixture.admin.id,
            input: { userId: fixture.admin.id },
            provenance,
          },
        ],
      }),
    );

    const createdTopicAction = await executeRuntimeAction(
      integrationDatabase,
      writePrincipal,
      runId,
      { workerId, sequence: 1 },
    );
    expect(createdTopicAction).toMatchObject({ actionStatus: "SUCCEEDED", rejectionCode: null });
    const createdContent = await integrationDatabase.agentContentRecord.findUniqueOrThrow({
      where: { actionId: createdTopicAction.id },
      include: { entry: true },
    });
    await recordRuntimeActions(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeActionsSchema.parse({
        workerId,
        actions: [
          {
            sequence: 5,
            actionType: "EDIT_OWN_ENTRY",
            safeReason: "Agent kendi entry'sini aynı görünür kanıtla anlamlı biçimde düzeltiyor.",
            targetType: "ENTRY",
            targetId: createdContent.entryId,
            input: {
              entryId: createdContent.entryId,
              body: "Görünür platform kanıtıyla düzeltilmiş özgün agent entry içeriği.",
            },
            provenance,
          },
        ],
      }),
    );
    const remainingActions = [];
    for (const sequence of [2, 3, 4, 5]) {
      remainingActions.push(
        await executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
          workerId,
          sequence,
        }),
      );
    }
    expect(remainingActions).toEqual(
      remainingActions.map(() =>
        expect.objectContaining({ actionStatus: "SUCCEEDED", rejectionCode: null }),
      ),
    );

    const agentUserId = fixture.created.agent.user.id;
    await expect(
      integrationDatabase.entryVote.findUniqueOrThrow({
        where: { entryId_userId: { entryId: humanTopic.entry.id, userId: agentUserId } },
      }),
    ).resolves.toMatchObject({ value: 1 });
    await expect(
      integrationDatabase.topicFollow.findUniqueOrThrow({
        where: { topicId_userId: { topicId: humanTopic.topic.id, userId: agentUserId } },
      }),
    ).resolves.toBeDefined();
    await expect(
      integrationDatabase.userFollow.findUniqueOrThrow({
        where: { followerId_followedId: { followerId: agentUserId, followedId: fixture.admin.id } },
      }),
    ).resolves.toBeDefined();
    await expect(
      integrationDatabase.entry.findUniqueOrThrow({ where: { id: createdContent.entryId } }),
    ).resolves.toMatchObject({
      authorId: agentUserId,
      body: "Görünür platform kanıtıyla düzeltilmiş özgün agent entry içeriği.",
      origin: "AGENT",
      status: "ACTIVE",
    });
    expect(
      await integrationDatabase.entryRevision.count({
        where: { entryId: createdContent.entryId, editedById: agentUserId },
      }),
    ).toBe(1);
    expect(
      await integrationDatabase.agentMemoryEpisode.count({
        where: { runId, eventType: "ACTION_EXECUTED" },
      }),
    ).toBe(5);
    const actionAudits = await integrationDatabase.auditLog.findMany({
      where: { action: "agent.action.succeeded", entityType: "AgentAction" },
    });
    expect(actionAudits).toHaveLength(5);
    expect(
      actionAudits.every(
        ({ actorId, metadata }) =>
          actorId === agentUserId && (metadata as { origin?: string } | null)?.origin === "AGENT",
      ),
    ).toBe(true);
    expect(
      await integrationDatabase.outboxEvent.count({
        where: {
          actorId: agentUserId,
          eventType: { in: ["topic.created", "entry.updated", "entry.voted"] },
        },
      }),
    ).toBe(3);
  });

  it("rejects unrecorded offline first-person claims and permits recorded digital context", async () => {
    const fixture = await createFixture();
    const visible = await createTopicWithFirstEntry(
      integrationDatabase,
      adminActor(fixture.admin.id),
      {
        title: "ontology first-person provenance integration",
        entryBody: "Görünür dijital interaction için insan tarafından yazılmış kanıt entry'si.",
      },
    );
    const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const writePrincipal = await runtimePrincipal(fixture.credential);
    const workerId = "ontology-first-person-worker";
    const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId,
      leaseSeconds: 60,
    });
    const runId = leased.run!.id;
    await recordRuntimeActions(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeActionsSchema.parse({
        workerId,
        actions: [
          {
            sequence: 1,
            actionType: "CREATE_ENTRY",
            safeReason: "Offline birinci tekil iddia fail-closed policy ile sınanıyor.",
            targetType: "TOPIC",
            targetId: visible.topic.id,
            input: {
              topicId: visible.topic.id,
              body: "Üniversitedeyken işe giderken bunu her gün yaşadım ve sokakta gördüm.",
            },
            provenance: {
              evidenceType: "PLATFORM_EVENT",
              evidenceIds: [runId],
              shortRationale: "Run olayı offline deneyim iddiasını kanıtlayamaz.",
            },
          },
          {
            sequence: 2,
            actionType: "CREATE_ENTRY",
            safeReason: "Gerçekten okunan görünür entry sınırlı dijital deneyimi destekliyor.",
            targetType: "TOPIC",
            targetId: visible.topic.id,
            input: {
              topicId: visible.topic.id,
              body: "Bu akışta okuduğum entry içindeki iddia, kanıt ile yorum sınırını yeniden düşünmemi sağlıyor.",
            },
            provenance: {
              evidenceType: "USER_ENTRY",
              evidenceIds: [visible.entry.id],
              shortRationale:
                "Birinci tekil dijital deneyim gerçekten okunan görünür entry'ye dayanır.",
            },
          },
        ],
      }),
    );

    await expect(
      executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
        workerId,
        sequence: 1,
      }),
    ).resolves.toMatchObject({
      actionStatus: "REJECTED",
      rejectionCode: "UNRECORDED_OFFLINE_FIRST_PERSON_CLAIM",
    });
    await expect(
      executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
        workerId,
        sequence: 2,
      }),
    ).resolves.toMatchObject({ actionStatus: "SUCCEEDED" });
    expect(
      await integrationDatabase.agentContentRecord.findMany({
        where: { runId },
        select: { action: { select: { sequence: true } } },
      }),
    ).toEqual([{ action: { sequence: 2 } }]);
  });

  it("executes FOLLOW_USER end to end as the authenticated AGENT principal", async () => {
    const fixture = await createFixture();
    const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const writePrincipal = await runtimePrincipal(fixture.credential);
    expect(writePrincipal.actor).toMatchObject({ actorKind: "AGENT", actorRole: "USER" });
    const workerId = "agent-user-follow-worker";
    const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId,
      leaseSeconds: 60,
    });
    const runId = leased.run!.id;
    await recordRuntimeActions(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeActionsSchema.parse({
        workerId,
        actions: [
          {
            sequence: 1,
            actionType: "FOLLOW_USER",
            safeReason: "Görünür kullanıcıyı takip etmek bağımsız ve izinli bir public action'dır.",
            targetType: "USER",
            targetId: fixture.admin.id,
            input: { userId: fixture.admin.id },
          },
        ],
      }),
    );

    await expect(
      executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
        workerId,
        sequence: 1,
      }),
    ).resolves.toMatchObject({ actionStatus: "SUCCEEDED", result: { followed: true } });
    await expect(
      integrationDatabase.userFollow.findUniqueOrThrow({
        where: {
          followerId_followedId: {
            followerId: fixture.created.agent.user.id,
            followedId: fixture.admin.id,
          },
        },
      }),
    ).resolves.toMatchObject({
      followerId: fixture.created.agent.user.id,
      followedId: fixture.admin.id,
    });
    expect(
      await integrationDatabase.auditLog.count({
        where: {
          actorId: fixture.created.agent.user.id,
          action: "user.followed",
          entityId: fixture.admin.id,
        },
      }),
    ).toBe(1);
  });

  it("rejects a public write when readiness fails without gating internal-only actions", async () => {
    const fixture = await createFixture();
    const topic = await createTopicWithFirstEntry(
      integrationDatabase,
      adminActor(fixture.admin.id),
      {
        title: "runtime public write readiness integration",
        entryBody: "İlk insan entry içeriği readiness sayımının değişmez tabanıdır.",
      },
    );
    const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const writePrincipal = await runtimePrincipal(fixture.credential);
    const workerId = "readiness-worker";
    const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId,
      leaseSeconds: 60,
    });
    const runId = leased.run!.id;
    await recordRuntimeActions(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeActionsSchema.parse({
        workerId,
        actions: [
          {
            sequence: 1,
            actionType: "CREATE_ENTRY",
            safeReason: "Public write öncesi service readiness doğrulanmalıdır.",
            targetType: "TOPIC",
            targetId: topic.topic.id,
            input: {
              topicId: topic.topic.id,
              body: "Readiness başarısızken hiçbir agent entry transactionı oluşmamalıdır.",
            },
            provenance: {
              evidenceType: "PLATFORM_EVENT",
              evidenceIds: [runId],
              shortRationale: "Readiness integration run olayı görünür kanıttır.",
            },
          },
          {
            sequence: 2,
            actionType: "UPDATE_BELIEF",
            safeReason: "Internal belief güncellemesi public readiness gerektirmez.",
            input: {
              topicKey: "service-readiness",
              statement: "Public write readiness başarısızken public action uygulanmamalıdır.",
              confidence: 0.8,
              summary: "Readiness integration olayı internal belief kanıtıdır.",
            },
            provenance: {
              evidenceType: "PLATFORM_EVENT",
              evidenceIds: [runId],
              shortRationale: "Runtime run internal belief için görünür kanıttır.",
            },
          },
          {
            sequence: 3,
            actionType: "NO_ACTION",
            safeReason: "Yeni action gerektiren güvenli bir neden bulunmadı.",
            input: {},
            provenance: {
              evidenceType: "PLATFORM_EVENT",
              evidenceIds: [randomUUID()],
              shortRationale: "No-op provenance görünür olmasa da abstention güvenli kalmalıdır.",
            },
          },
          {
            sequence: 4,
            actionType: "CREATE_ENTRY",
            safeReason: "Unexpected executor failure terminal FAILED sonucuna dönüşmelidir.",
            targetType: "TOPIC",
            targetId: topic.topic.id,
            input: {
              topicId: topic.topic.id,
              body: "Executor rollback sırasında bu agent entry kalıcılaşmamalıdır.",
            },
            provenance: {
              evidenceType: "PLATFORM_EVENT",
              evidenceIds: [runId],
              shortRationale: "Runtime run controlled executor failure için görünür kanıttır.",
            },
          },
        ],
      }),
    );
    const beforeEntries = await integrationDatabase.entry.count();
    const beforeContentRecords = await integrationDatabase.agentContentRecord.count();
    let readinessCalls = 0;
    const checkReadiness = async () => {
      readinessCalls += 1;
      throw new Error("injected readiness failure");
    };
    await expect(
      executeRuntimeAction(
        integrationDatabase,
        writePrincipal,
        runId,
        { workerId, sequence: 1 },
        { checkReadiness },
      ),
    ).resolves.toMatchObject({
      actionStatus: "REJECTED",
      rejectionCode: "SERVICE_NOT_READY",
    });
    await expect(
      executeRuntimeAction(
        integrationDatabase,
        writePrincipal,
        runId,
        { workerId, sequence: 2 },
        { checkReadiness },
      ),
    ).resolves.toMatchObject({ actionStatus: "SUCCEEDED" });
    await expect(
      executeRuntimeAction(
        integrationDatabase,
        writePrincipal,
        runId,
        { workerId, sequence: 3 },
        { checkReadiness },
      ),
    ).resolves.toMatchObject({ actionStatus: "SKIPPED" });
    await expect(
      executeRuntimeAction(
        integrationDatabase,
        writePrincipal,
        runId,
        { workerId, sequence: 4 },
        {
          afterPublicWriteSettingsLocked: async () => {
            throw new Error("CONTROLLED_ACTION_EXECUTOR_FAILURE");
          },
        },
      ),
    ).resolves.toMatchObject({
      actionStatus: "FAILED",
      rejectionCode: "ACTION_EXECUTION_FAILED",
    });
    await expect(
      executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
        workerId,
        sequence: 4,
      }),
    ).resolves.toMatchObject({ actionStatus: "FAILED" });
    expect(readinessCalls).toBe(1);
    expect(await integrationDatabase.entry.count()).toBe(beforeEntries);
    expect(await integrationDatabase.agentContentRecord.count()).toBe(beforeContentRecords);
    const actions = await integrationDatabase.agentAction.findMany({
      where: { runId },
      orderBy: { sequence: "asc" },
      select: { id: true, actionStatus: true },
    });
    expect(actions.map(({ actionStatus }) => actionStatus)).toEqual([
      "REJECTED",
      "SUCCEEDED",
      "SKIPPED",
      "FAILED",
    ]);
    const actionOutbox = await integrationDatabase.outboxEvent.findMany({
      where: {
        eventType: "agent.action.executed",
        aggregateId: { in: actions.map(({ id }) => id) },
      },
    });
    expect(actionOutbox).toHaveLength(4);
    const actionOutboxById = new Map(
      actionOutbox.map(({ aggregateId, payload }) => [
        aggregateId,
        (payload as { actionStatus: string }).actionStatus,
      ]),
    );
    expect(actions.map(({ id }) => actionOutboxById.get(id))).toEqual([
      "REJECTED",
      "SUCCEEDED",
      "SKIPPED",
      "FAILED",
    ]);
    expect(new Set(actionOutbox.map(({ aggregateId }) => aggregateId)).size).toBe(4);
    expect(JSON.stringify(actionOutbox)).not.toContain(leased.run!.leaseToken);
  });

  it("rejects a repeated long opening across the agent's last entries", async () => {
    const fixture = await createFixture();
    const topics = await Promise.all(
      ["runtime framing one", "runtime framing two"].map((title) =>
        createTopicWithFirstEntry(integrationDatabase, adminActor(fixture.admin.id), {
          title,
          entryBody: `İnsan entry içeriği ${title}.`,
        }),
      ),
    );
    const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const writePrincipal = await runtimePrincipal(fixture.credential);
    const workerId = "framing-worker";
    const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId,
      leaseSeconds: 60,
    });
    const runId = leased.run!.id;
    await recordRuntimeActions(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeActionsSchema.parse({
        workerId,
        actions: topics.map(({ topic }, index) => ({
          sequence: index + 1,
          actionType: "CREATE_ENTRY" as const,
          safeReason: "Farklı topic bağlamı agent entry adayını destekliyor.",
          targetType: "TOPIC" as const,
          targetId: topic.id,
          input: {
            topicId: topic.id,
            body:
              index === 0
                ? "Bu sistemin görünmeyen bakım maliyeti arayüzdeki kolaylığın altında birikir ve geri dönüş planı olmadan büyür."
                : "Bu sistemin görünmeyen bakım maliyeti şehir hatlarında vardiya devrini, yedek parçayı ve kesinti riskini birlikte etkiler.",
          },
          provenance: {
            evidenceType: "PLATFORM_EVENT" as const,
            evidenceIds: [runId],
            shortRationale: "Runtime framing integration bağlamı görünür kanıttır.",
          },
        })),
      }),
    );
    await expect(
      executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
        workerId,
        sequence: 1,
      }),
    ).resolves.toMatchObject({ actionStatus: "SUCCEEDED" });
    await expect(
      executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
        workerId,
        sequence: 2,
      }),
    ).resolves.toMatchObject({
      actionStatus: "REJECTED",
      rejectionCode: "DUPLICATE_FRAMING",
    });
    expect(await integrationDatabase.agentContentRecord.count()).toBe(1);
  });

  it("grounds exact source claims and requires strong independent evidence for serious claims", async () => {
    const fixture = await createFixture();
    const topics = await Promise.all(
      Array.from({ length: 7 }, (_, index) =>
        createTopicWithFirstEntry(integrationDatabase, adminActor(fixture.admin.id), {
          title: `runtime provenance guard ${index}`,
          entryBody:
            index === 4
              ? "Bu insan entry'si 73 sayısını ve kesin olarak suçlu sözünü kanıtsız aktarıyor."
              : `İnsan provenance kontrol entry içeriği ${index}.`,
        }),
      ),
    );
    const createSourceItem = async (input: {
      domain: string;
      status: "TRUSTED" | "PROBATION";
      safeText: string;
    }) => {
      const source = await integrationDatabase.agentSource.create({
        data: {
          agentProfileId: fixture.created.agent.profile.id,
          url: `https://${input.domain}/feed`,
          normalizedDomain: input.domain,
          sourceType: "HTML",
          status: input.status,
          topics: ["kanıt"],
          trustScore: input.status === "TRUSTED" ? 0.9 : 0.5,
          interestScore: 0.8,
          noveltyScore: 0.7,
          usefulnessScore: 0.8,
          addedByOrigin: "INTEGRATION_TEST",
        },
      });
      return integrationDatabase.agentSourceItem.create({
        data: {
          sourceId: source.id,
          canonicalUrl: `https://${input.domain}/article`,
          title: `${input.domain} kanıt metni`,
          fetchedAt: new Date(),
          contentHash: randomUUID().replaceAll("-", "").padEnd(64, "0"),
          safeText: input.safeText,
          topics: ["kanıt"],
        },
      });
    };
    const trustedItem = await createSourceItem({
      domain: "trusted-evidence.test",
      status: "TRUSTED",
      safeText: "Kaynak payı 18 olarak verir ve “geçiş bu yıl başladı” ifadesini kullanır.",
    });
    const probationOne = await createSourceItem({
      domain: "probation-one.test",
      status: "PROBATION",
      safeText: "Kurum hakkında doğrulanması gereken ciddi bir güncel gelişme raporlandı.",
    });
    const probationTwo = await createSourceItem({
      domain: "probation-two.test",
      status: "PROBATION",
      safeText: "Bağımsız ikinci kaynak aynı güncel gelişmeyi ayrıca ele aldı.",
    });
    const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const writePrincipal = await runtimePrincipal(fixture.credential);
    const workerId = "provenance-guard-worker";
    const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId,
      leaseSeconds: 60,
    });
    const runId = leased.run!.id;
    const sourceProvenance = (
      evidenceType: "TRUSTED_SOURCE" | "PROBATION_SOURCE" | "MULTIPLE_SOURCES",
      evidenceIds: string[],
    ) => ({
      evidenceType,
      evidenceIds,
      shortRationale: "Görünür source item kontrollü factual kanıt sağlıyor.",
    });
    await recordRuntimeActions(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeActionsSchema.parse({
        workerId,
        actions: [
          {
            sequence: 1,
            actionType: "CREATE_ENTRY",
            safeReason: "Trusted source kesin sayı adayını denetlemek için seçildi.",
            targetType: "TOPIC",
            targetId: topics[0]!.topic.id,
            input: {
              topicId: topics[0]!.topic.id,
              body: "Kaynak rapor bu payı 42 olarak veriyor; yöntem ayrıntısı ayrıca incelenmeli.",
            },
            provenance: sourceProvenance("TRUSTED_SOURCE", [trustedItem.id]),
          },
          {
            sequence: 2,
            actionType: "CREATE_ENTRY",
            safeReason: "Trusted source doğrudan alıntı adayını denetlemek için seçildi.",
            targetType: "TOPIC",
            targetId: topics[1]!.topic.id,
            input: {
              topicId: topics[1]!.topic.id,
              body: "Kaynak “bambaşka bir kesin ifade” diyor; bağlamı yine de sınırlı.",
            },
            provenance: sourceProvenance("TRUSTED_SOURCE", [trustedItem.id]),
          },
          {
            sequence: 3,
            actionType: "CREATE_ENTRY",
            safeReason: "Tek probation source ciddi iddia eşiğine karşı denetleniyor.",
            targetType: "TOPIC",
            targetId: topics[2]!.topic.id,
            input: {
              topicId: topics[2]!.topic.id,
              body: "Bugün kurum yöneticisinin dolandırıcılık yaptığı kesinleşti.",
            },
            provenance: sourceProvenance("PROBATION_SOURCE", [probationOne.id]),
          },
          {
            sequence: 4,
            actionType: "CREATE_ENTRY",
            safeReason: "İki bağımsız domain ciddi güncel iddia için asgari kanıtı sağlıyor.",
            targetType: "TOPIC",
            targetId: topics[3]!.topic.id,
            input: {
              topicId: topics[3]!.topic.id,
              body: "Bugün kurum yöneticisinin dolandırıcılık yaptığı kesinleşti.",
            },
            provenance: sourceProvenance("MULTIPLE_SOURCES", [probationOne.id, probationTwo.id]),
          },
          {
            sequence: 5,
            actionType: "CREATE_ENTRY",
            safeReason:
              "USER_ENTRY içindeki yüksek riskli iddia yeniden üretim açısından denetleniyor.",
            targetType: "TOPIC",
            targetId: topics[4]!.topic.id,
            input: {
              topicId: topics[4]!.topic.id,
              body: "Bu başlıktaki entry “kesin olarak suçlu” diye bir iddia aktarıyor.",
            },
            provenance: {
              evidenceType: "USER_ENTRY",
              evidenceIds: [topics[4]!.entry.id],
              shortRationale: "Yalnız görünür insan entry iddiası tartışma bağlamıdır.",
            },
          },
          {
            sequence: 6,
            actionType: "CREATE_ENTRY",
            safeReason: "USER_ENTRY içindeki sıradan sayı bağımsız bir yorumda kullanılıyor.",
            targetType: "TOPIC",
            targetId: topics[5]!.topic.id,
            input: {
              topicId: topics[5]!.topic.id,
              body: "Bu görüşün 2026 yılında yaygınlaşması, tek başına doğru olduğu anlamına gelmez.",
            },
            provenance: {
              evidenceType: "USER_ENTRY",
              evidenceIds: [topics[5]!.entry.id],
              shortRationale: "Görünür entry yalnız tartışma bağlamıdır.",
            },
          },
          {
            sequence: 7,
            actionType: "CREATE_ENTRY",
            safeReason: "USER_ENTRY bağımsız ve persona-uyumlu bir görüşü tetikliyor.",
            targetType: "TOPIC",
            targetId: topics[6]!.topic.id,
            input: {
              topicId: topics[6]!.topic.id,
              body: "Bu tasarım seçim yükünü azaltmıyor; kararı yalnızca daha az görünür hale getiriyor.",
            },
            provenance: {
              evidenceType: "USER_ENTRY",
              evidenceIds: [topics[6]!.entry.id],
              shortRationale: "Görünür entry yalnız tartışma bağlamıdır.",
            },
          },
        ],
      }),
    );
    const results = [];
    for (const sequence of [1, 2, 3, 4, 5, 6, 7])
      results.push(
        await executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
          workerId,
          sequence,
        }),
      );
    expect(results.map(({ actionStatus, rejectionCode }) => [actionStatus, rejectionCode])).toEqual(
      [
        ["REJECTED", "SOURCE_EXACT_NUMBER_UNSUPPORTED"],
        ["REJECTED", "SOURCE_DIRECT_QUOTE_UNSUPPORTED"],
        ["REJECTED", "SERIOUS_CLAIM_SOURCE_INSUFFICIENT"],
        ["SUCCEEDED", null],
        ["REJECTED", "USER_ENTRY_HIGH_RISK_REPRODUCTION"],
        ["SUCCEEDED", null],
        ["SUCCEEDED", null],
      ],
    );
  });

  it.each(["TIMED_OUT", "CANCELLED"] as const)(
    "preserves committed atomic actions and closes %s work as PARTIAL without applying the remainder",
    async (requestedOutcome) => {
      const fixture = await createFixture();
      const topic = await createTopicWithFirstEntry(
        integrationDatabase,
        adminActor(fixture.admin.id),
        {
          title: `runtime partial ${requestedOutcome.toLowerCase()}`,
          entryBody: "İlk insan entry içeriği partial kontrolü için hazırlandı.",
        },
      );
      const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
      const writePrincipal = await runtimePrincipal(fixture.credential);
      const workerId = `partial-worker-${requestedOutcome.toLowerCase()}`;
      const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
        workerId,
        leaseSeconds: 60,
      });
      const runId = leased.run!.id;
      await recordRuntimeActions(
        integrationDatabase,
        writePrincipal,
        runId,
        runtimeActionsSchema.parse({
          workerId,
          actions: [
            {
              sequence: 1,
              actionType: "CREATE_ENTRY",
              safeReason: "İlk atomic action deadline öncesinde değerlendiriliyor.",
              targetType: "TOPIC",
              targetId: topic.topic.id,
              input: {
                topicId: topic.topic.id,
                body: `Deadline öncesi tamamlanan ${requestedOutcome} atomic entry.`,
              },
              provenance: {
                evidenceType: "PLATFORM_EVENT",
                evidenceIds: [runId],
                shortRationale: "Partial integration ilk doğrulanmış transaction kaydıdır.",
              },
            },
            {
              sequence: 2,
              actionType: "CREATE_ENTRY",
              safeReason: "İkinci atomic action deadline sınırında değerlendiriliyor.",
              targetType: "TOPIC",
              targetId: topic.topic.id,
              input: {
                topicId: topic.topic.id,
                body: `Deadline sonrası başlamaması gereken ${requestedOutcome} atomic entry.`,
              },
              provenance: {
                evidenceType: "PLATFORM_EVENT",
                evidenceIds: [runId],
                shortRationale: "Partial integration başlamamış transaction kontrolüdür.",
              },
            },
          ],
        }),
      );
      await expect(
        executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
          workerId,
          sequence: 1,
        }),
      ).resolves.toMatchObject({ actionStatus: "SUCCEEDED" });
      await integrationDatabase.agentRun.update({
        where: { id: runId },
        data: {
          ...(requestedOutcome === "TIMED_OUT"
            ? { startedAt: new Date(Date.now() - 601_000) }
            : { runStatus: "CANCEL_REQUESTED" }),
          leaseExpiresAt: new Date(Date.now() + 60_000),
        },
      });

      const heartbeatAttempt = heartbeatRuntimeRun(
        integrationDatabase,
        writePrincipal,
        runId,
        runtimeHeartbeatSchema.parse({
          runId,
          workerId,
          leaseSeconds: 60,
          runtimeStatus: "EXECUTING",
        }),
      );
      if (requestedOutcome === "TIMED_OUT")
        await expect(heartbeatAttempt).rejects.toMatchObject({
          code: "AGENT_RUN_DEADLINE_EXCEEDED",
        });
      else
        await expect(heartbeatAttempt).resolves.toMatchObject({
          cancelRequested: true,
        });

      await expect(
        executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
          workerId,
          sequence: 2,
        }),
      ).rejects.toMatchObject({
        code:
          requestedOutcome === "TIMED_OUT"
            ? "AGENT_RUN_DEADLINE_EXCEEDED"
            : "AGENT_RUN_CANCEL_REQUESTED",
      });
      await expect(
        completeRuntimeRun(
          integrationDatabase,
          writePrincipal,
          runId,
          runtimeCompleteSchema.parse({
            workerId,
            outcome: "SUCCEEDED",
            state: completedRuntimeFastState,
            safeRunSummary: {
              operationSummary: "Deadline sonrası başarı kapanışı reddedilmelidir.",
              observedItemIds: [],
              proposedActionCount: 2,
              completedActionCount: 1,
              rejectedActionCount: 0,
              shortRationale: "Mutlak runtime budget server tarafında da otoritedir.",
            },
            usageMetadata: {
              durationMs: 1,
              provider: "codex-cli",
            },
            performanceMetrics: {
              publishedEntries: 1,
              createdTopics: 0,
              votes: 0,
              sourceReads: 0,
            },
          }),
        ),
      ).rejects.toMatchObject({
        code:
          requestedOutcome === "TIMED_OUT"
            ? "AGENT_RUN_DEADLINE_EXCEEDED"
            : "AGENT_RUN_CANCEL_REQUESTED",
      });
      await expect(
        failRuntimeRun(
          integrationDatabase,
          writePrincipal,
          runId,
          runtimeFailSchema.parse({
            workerId,
            outcome: requestedOutcome,
            errorCode: requestedOutcome === "TIMED_OUT" ? "RUNTIME_TIMEOUT" : "WORKER_CANCELLED",
            errorSummary: "Atomic action sınırında güvenli partial kapanış istendi.",
          }),
        ),
      ).resolves.toMatchObject({ runStatus: "PARTIAL" });

      const actions = await integrationDatabase.agentAction.findMany({
        where: { runId },
        orderBy: { sequence: "asc" },
      });
      expect(actions.map(({ actionStatus }) => actionStatus)).toEqual(["SUCCEEDED", "PROPOSED"]);
      expect(await integrationDatabase.agentContentRecord.count({ where: { runId } })).toBe(1);
      expect(
        await integrationDatabase.agentRun.findUniqueOrThrow({ where: { id: runId } }),
      ).toMatchObject({
        runStatus: "PARTIAL",
        errorCode: requestedOutcome === "TIMED_OUT" ? "RUNTIME_TIMEOUT" : "WORKER_CANCELLED",
        safeRunSummary: expect.objectContaining({ completedActionCount: 1 }),
      });
      expect(
        await integrationDatabase.agentRuntimeState.findUniqueOrThrow({
          where: { agentProfileId: fixture.created.agent.profile.id },
        }),
      ).toMatchObject({ todayPublishedEntries: 1, runtimeStatus: "PARTIAL" });
      const completedOutbox = await integrationDatabase.outboxEvent.findMany({
        where: { eventType: "agent.run.completed", aggregateId: runId },
      });
      expect(completedOutbox).toHaveLength(1);
      expect(completedOutbox[0]).toMatchObject({
        aggregateType: "AgentRun",
        actorId: fixture.created.agent.user.id,
        actorKind: "AGENT",
        payload: expect.objectContaining({
          agentProfileId: fixture.created.agent.profile.id,
          runId,
          outcome: "PARTIAL",
          requestedOutcome,
          errorCode: requestedOutcome === "TIMED_OUT" ? "RUNTIME_TIMEOUT" : "WORKER_CANCELLED",
        }),
      });
    },
  );

  it("enforces direct-response cooldowns and allows only an explicit admin run override", async () => {
    const fixture = await createFixture();
    const topic = await createTopicWithFirstEntry(
      integrationDatabase,
      adminActor(fixture.admin.id),
      { title: "provocation guard integration", entryBody: "Doğrudan tepki hedefi entry." },
    );
    const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const writePrincipal = await runtimePrincipal(fixture.credential);
    const workerId = "provocation-worker";
    const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId,
      leaseSeconds: 60,
    });
    const runId = leased.run!.id;
    await integrationDatabase.agentAction.createMany({
      data: [100, 101].map((sequence) => ({
        runId,
        agentProfileId: fixture.created.agent.profile.id,
        sequence,
        actionType: "CREATE_ENTRY",
        actionStatus: "SUCCEEDED",
        targetType: "USER",
        targetId: fixture.admin.id,
        input: { topicId: topic.topic.id, body: `Önceki doğrudan tepki ${sequence}.` },
      })),
    });
    const propose = (sequence: number, body: string) =>
      recordRuntimeActions(
        integrationDatabase,
        writePrincipal,
        runId,
        runtimeActionsSchema.parse({
          workerId,
          actions: [
            {
              sequence,
              actionType: "CREATE_ENTRY",
              safeReason: "Görünür entry bağlamı kontrollü doğrudan tepkiyi destekliyor.",
              targetType: "USER",
              targetId: fixture.admin.id,
              input: {
                topicId: topic.topic.id,
                replyToEntryId: topic.entry.id,
                provocationSignal: 0.95,
                body,
              },
              provenance: {
                evidenceType: "PLATFORM_EVENT",
                evidenceIds: [runId],
                shortRationale: "Doğrudan tepki cooldown integration adayıdır.",
              },
            },
          ],
        }),
      );
    await propose(1, "Cooldown sınırında bu doğrudan tepki yayınlanmamalıdır.");
    await expect(
      executeRuntimeAction(integrationDatabase, writePrincipal, runId, { workerId, sequence: 1 }),
    ).resolves.toMatchObject({
      actionStatus: "REJECTED",
      rejectionCode: "PROVOCATION_TARGET_COOLDOWN",
    });
    await integrationDatabase.agentRun.update({
      where: { id: runId },
      data: { provocationOverride: true },
    });
    await propose(2, "Açık admin override ile denetlenebilir doğrudan tepki yayınlanabilir.");
    const overridden = await executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
      workerId,
      sequence: 2,
    });
    expect(overridden, JSON.stringify(overridden)).toMatchObject({ actionStatus: "SUCCEEDED" });
    expect(
      await integrationDatabase.agentAction.findUniqueOrThrow({ where: { id: overridden.id } }),
    ).toMatchObject({ targetType: "USER", targetId: fixture.admin.id });
  });

  it("blocks a fourth distinct agent from piling onto one user inside thirty minutes", async () => {
    const fixture = await createFixture();
    const topic = await createTopicWithFirstEntry(
      integrationDatabase,
      adminActor(fixture.admin.id),
      { title: "pile on guard integration", entryBody: "Pile-on hedefi insan entry'si." },
    );
    for (const persona of originalPersonaPack.personas.slice(1, 4)) {
      const created = await createAgent(
        integrationDatabase,
        adminActor(fixture.admin.id),
        createAgentSchema.parse({ persona }),
      );
      const run = await integrationDatabase.agentRun.create({
        data: {
          agentProfileId: created.agent.profile.id,
          runType: "NORMAL_WAKE",
          queuePriority: "SCHEDULED_CONTENT",
          trigger: "PILE_ON_INTEGRATION_HISTORY",
          personaVersionId: created.agent.personaVersion.id,
          idempotencyKey: randomUUID(),
          timeoutSeconds: 360,
          desiredEntryMin: 1,
          desiredEntryMax: 1,
          runStatus: "SUCCEEDED",
          startedAt: new Date(Date.now() - 1_000),
          finishedAt: new Date(),
        },
      });
      await integrationDatabase.agentAction.create({
        data: {
          runId: run.id,
          agentProfileId: created.agent.profile.id,
          sequence: 1,
          actionType: "CREATE_ENTRY",
          actionStatus: "SUCCEEDED",
          targetType: "USER",
          targetId: fixture.admin.id,
          input: { topicId: topic.topic.id, body: `Önceki farklı agent tepkisi ${run.id}.` },
        },
      });
    }
    const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const writePrincipal = await runtimePrincipal(fixture.credential);
    const workerId = "pile-on-worker";
    const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId,
      leaseSeconds: 60,
    });
    const runId = leased.run!.id;
    await recordRuntimeActions(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeActionsSchema.parse({
        workerId,
        actions: [
          {
            sequence: 1,
            actionType: "CREATE_ENTRY",
            safeReason: "Provocation politikası görünür tepki adayını değerlendiriyor.",
            targetType: "USER",
            targetId: fixture.admin.id,
            input: {
              topicId: topic.topic.id,
              replyToEntryId: topic.entry.id,
              provocationSignal: 0.2,
              body: "Dördüncü farklı agent tepkisi pile-on sınırında yayınlanmamalıdır.",
            },
            provenance: {
              evidenceType: "PLATFORM_EVENT",
              evidenceIds: [runId],
              shortRationale: "Pile-on guard integration adayıdır.",
            },
          },
        ],
      }),
    );
    await expect(
      executeRuntimeAction(integrationDatabase, writePrincipal, runId, { workerId, sequence: 1 }),
    ).resolves.toMatchObject({
      actionStatus: "REJECTED",
      rejectionCode: "PROVOCATION_PILE_ON",
    });
  });

  it.each(["DRY_RUN", "READ_ONLY"] as const)(
    "rejects public writes from %s without creating content",
    async (runType) => {
      const fixture = await createFixture();
      await integrationDatabase.agentRun.update({
        where: { id: fixture.runs[0]!.id },
        data: {
          runType,
          desiredEntryMin: 0,
          desiredEntryMax: 0,
          allowTopicCreation: false,
          allowVoting: false,
          allowFollowing: false,
        },
      });
      const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
      const writePrincipal = await runtimePrincipal(fixture.credential);
      const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
        workerId: "dry-worker",
        leaseSeconds: 60,
      });
      const runId = leased.run!.id;
      await recordRuntimeActions(
        integrationDatabase,
        writePrincipal,
        runId,
        runtimeActionsSchema.parse({
          workerId: "dry-worker",
          actions: [
            {
              sequence: 1,
              actionType: "CREATE_TOPIC_WITH_ENTRY",
              safeReason: `${runType} yalnız güvenli policy reddini doğruluyor.`,
              input: {
                title: `${runType.toLocaleLowerCase("tr-TR").replaceAll("_", " ")} topic`,
                body: "Bu içerik yayınlanmamalıdır.",
              },
              provenance: {
                evidenceType: "PLATFORM_EVENT",
                evidenceIds: [runId],
                shortRationale: `${runType} policy doğrulama adayı.`,
              },
            },
          ],
        }),
      );
      const action = await executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
        workerId: "dry-worker",
        sequence: 1,
      });
      expect(action).toMatchObject({
        actionStatus: "REJECTED",
        rejectionCode: "RUN_PUBLIC_WRITE_DISABLED",
      });
      expect(await integrationDatabase.agentContentRecord.count()).toBe(0);
      expect(await integrationDatabase.topic.count()).toBe(0);
    },
  );

  it("persists source, belief and relationship evolution only with visible provenance", async () => {
    const fixture = await createFixture();
    const visible = await createTopicWithFirstEntry(
      integrationDatabase,
      adminActor(fixture.admin.id),
      { title: "visible relationship evidence", entryBody: "Görünür interaction kanıtı." },
    );
    const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const writePrincipal = await runtimePrincipal(fixture.credential);
    const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId: "evolution-worker",
      leaseSeconds: 60,
    });
    const runId = leased.run!.id;
    await recordRuntimeActions(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeActionsSchema.parse({
        workerId: "evolution-worker",
        actions: [
          {
            sequence: 1,
            actionType: "PROPOSE_SOURCE",
            safeReason: "Gözlenen URL kontrollü source önerisini destekliyor.",
            input: {
              url: "https://example.com/feed.xml",
              sourceType: "RSS",
              topics: ["teknoloji"],
            },
            provenance: {
              evidenceType: "PLATFORM_EVENT",
              evidenceIds: [runId],
              shortRationale: "Run sırasında görünür source adayı değerlendirildi.",
            },
          },
          {
            sequence: 2,
            actionType: "UPDATE_BELIEF",
            safeReason: "Görünür platform kanıtı belief güncellemesini destekliyor.",
            input: {
              topicKey: "ölçülebilir-kapasite",
              statement: "Kapasite kararları ölçülmüş p75 ile verilmelidir.",
              confidence: 0.8,
              summary: "Runtime kapasite ölçümü görünür kanıt sağladı.",
            },
            provenance: {
              evidenceType: "PLATFORM_EVENT",
              evidenceIds: [runId],
              shortRationale: "Bu run ölçülebilir kapasite context'i sağladı.",
            },
          },
          {
            sequence: 3,
            actionType: "UPDATE_RELATIONSHIP_NOTE",
            safeReason: "Görünür interaction relationship notunu destekliyor.",
            targetType: "USER",
            targetId: fixture.admin.id,
            input: {
              userId: fixture.admin.id,
              familiarity: 0.3,
              trust: 0.6,
              interest: 0.7,
              disagreement: 0.1,
              summary: "Görünür entry üzerinden sınırlı bir tanışıklık oluştu.",
            },
            provenance: {
              evidenceType: "USER_ENTRY",
              evidenceIds: [visible.entry.id],
              shortRationale: "Relationship yalnız görünür entry interaction'ına dayanır.",
            },
          },
        ],
      }),
    );
    const sourceAction = await executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
      workerId: "evolution-worker",
      sequence: 1,
    });
    expect(sourceAction).toMatchObject({ actionStatus: "SUCCEEDED" });
    await expect(
      executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
        workerId: "evolution-worker",
        sequence: 1,
      }),
    ).resolves.toMatchObject({ actionStatus: "SUCCEEDED" });
    for (const sequence of [2, 3])
      await expect(
        executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
          workerId: "evolution-worker",
          sequence,
        }),
      ).resolves.toMatchObject({ actionStatus: "SUCCEEDED" });
    const proposedSource = await integrationDatabase.agentSource.findFirstOrThrow({
      where: {
        agentProfileId: fixture.created.agent.profile.id,
        url: "https://example.com/feed.xml",
      },
    });
    const sourceChangedOutbox = await integrationDatabase.outboxEvent.findMany({
      where: { eventType: "agent.source.changed", aggregateId: proposedSource.id },
    });
    expect(sourceChangedOutbox).toHaveLength(1);
    expect(sourceChangedOutbox[0]).toMatchObject({
      aggregateType: "AgentSource",
      actorId: fixture.created.agent.user.id,
      actorKind: "AGENT",
      requestId: writePrincipal.actor.requestId,
      payload: {
        agentProfileId: fixture.created.agent.profile.id,
        runId,
        actionId: sourceAction.id,
        sourceId: proposedSource.id,
        status: "PROBATION",
        origin: "AGENT",
        normalizedDomain: "example.com",
      },
    });
    expect(JSON.stringify(sourceChangedOutbox)).not.toContain("https://example.com/feed.xml");
    expect(JSON.stringify(sourceChangedOutbox)).not.toContain(leased.run!.leaseToken);
    const sourceAttemptId = randomUUID();
    await recordRuntimeSourceAttempt(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeSourceAttemptSchema.parse({
        workerId: "evolution-worker",
        attemptId: sourceAttemptId,
        sourceId: proposedSource.id,
      }),
    );
    await recordRuntimeSourceResult(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeSourceResultSchema.parse({
        workerId: "evolution-worker",
        attemptId: sourceAttemptId,
        sourceId: proposedSource.id,
        items: [1, 2, 3].map((index) => ({
          canonicalUrl: `https://example.com/article-${index}`,
          title: `Güvenli source item ${index}`,
          publishedAt: `2026-07-1${index}T10:00:00.000Z`,
          contentHash: index.toString().repeat(64),
          safeText: `Source reader tarafından normalize edilen güvenli metin ${index}.`,
        })),
      }),
    );
    expect(
      await integrationDatabase.agentSource.findUniqueOrThrow({
        where: { id: proposedSource.id },
      }),
    ).toMatchObject({ status: "TRUSTED", normalizedDomain: "example.com" });
    const evolvedSourceOutbox = await integrationDatabase.outboxEvent.findMany({
      where: { eventType: "agent.source.changed", aggregateId: proposedSource.id },
      orderBy: { createdAt: "asc" },
    });
    expect(evolvedSourceOutbox).toHaveLength(2);
    expect(evolvedSourceOutbox).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          aggregateType: "AgentSource",
          actorId: fixture.created.agent.user.id,
          actorKind: "AGENT",
          payload: expect.objectContaining({
            agentProfileId: fixture.created.agent.profile.id,
            runId,
            sourceId: proposedSource.id,
            normalizedDomain: "example.com",
            reasonCode: "STATUS_PROMOTED",
            before: expect.objectContaining({ status: "PROBATION" }),
            after: expect.objectContaining({ status: "TRUSTED" }),
          }),
        }),
      ]),
    );
    expect(JSON.stringify(evolvedSourceOutbox)).not.toContain("https://example.com/article-");
    expect(JSON.stringify(evolvedSourceOutbox)).not.toContain(leased.run!.leaseToken);
    expect(
      await integrationDatabase.agentSourceItem.count({ where: { sourceId: proposedSource.id } }),
    ).toBe(3);
    expect(
      await integrationDatabase.agentBelief.findFirstOrThrow({
        where: { agentProfileId: fixture.created.agent.profile.id },
      }),
    ).toMatchObject({ topicKey: "ölçülebilir-kapasite", confidence: 0.8, version: 1 });
    expect(
      await integrationDatabase.agentRelationship.findUniqueOrThrow({
        where: {
          agentProfileId_targetUserId: {
            agentProfileId: fixture.created.agent.profile.id,
            targetUserId: fixture.admin.id,
          },
        },
      }),
    ).toMatchObject({ trust: 0.6, familiarity: 0.3 });
    expect(
      await integrationDatabase.agentMemoryEpisode.count({
        where: { runId, eventType: "ACTION_EXECUTED" },
      }),
    ).toBe(3);
    expect(
      await integrationDatabase.agentMemoryEpisode.count({
        where: { runId, eventType: "SOURCE_READ" },
      }),
    ).toBe(3);
    const learnedSourceMemory = await integrationDatabase.agentMemoryEpisode.findFirstOrThrow({
      where: {
        runId,
        eventType: "SOURCE_READ",
        evidence: { path: ["contentHash"], equals: "1".repeat(64) },
      },
    });
    expect(learnedSourceMemory.summary).toContain(
      "İçerikten kalan güvenli not: Source reader tarafından normalize edilen güvenli metin 1.",
    );
    expect(learnedSourceMemory.evidence).toEqual(
      expect.objectContaining({
        sourceId: proposedSource.id,
        sourceItemId: expect.any(String),
        contentHash: "1".repeat(64),
      }),
    );
    const repeatedAttemptId = randomUUID();
    await recordRuntimeSourceAttempt(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeSourceAttemptSchema.parse({
        workerId: "evolution-worker",
        attemptId: repeatedAttemptId,
        sourceId: proposedSource.id,
      }),
    );
    await recordRuntimeSourceResult(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeSourceResultSchema.parse({
        workerId: "evolution-worker",
        attemptId: repeatedAttemptId,
        sourceId: proposedSource.id,
        items: [1, 2, 3].map((index) => ({
          canonicalUrl: `https://example.com/article-${index}`,
          title: `Güvenli source item ${index}`,
          publishedAt: `2026-07-1${index}T10:00:00.000Z`,
          contentHash: index.toString().repeat(64),
          safeText: `Source reader tarafından normalize edilen güvenli metin ${index}.`,
        })),
      }),
    );
    expect(
      await integrationDatabase.agentMemoryEpisode.count({
        where: { eventType: "SOURCE_READ", subjectId: proposedSource.id },
      }),
    ).toBe(3);
    const actionLife = await integrationDatabase.agentRuntimeEvent.findMany({
      where: {
        agentProfileId: fixture.created.agent.profile.id,
        runId,
        eventType: "ACTION_STATUS_CHANGED",
      },
      orderBy: { agentSequence: "asc" },
    });
    expect(actionLife).toHaveLength(9);
    for (const actionId of new Set(actionLife.map(({ actionId }) => actionId))) {
      const transitions = actionLife
        .filter((event) => event.actionId === actionId)
        .map(({ beforeState, afterState, changedFields }) => ({
          beforeState,
          afterState,
          changedFields,
        }));
      expect(transitions).toEqual([
        {
          beforeState: { status: "PROPOSED" },
          afterState: { status: "ACCEPTED" },
          changedFields: ["status"],
        },
        {
          beforeState: { status: "ACCEPTED" },
          afterState: { status: "EXECUTING" },
          changedFields: ["status"],
        },
        {
          beforeState: { status: "EXECUTING" },
          afterState: expect.objectContaining({ status: "SUCCEEDED", result: expect.any(Object) }),
          changedFields: ["result", "status"],
        },
      ]);
    }
    const mutationLife = await integrationDatabase.agentRuntimeEvent.findMany({
      where: {
        agentProfileId: fixture.created.agent.profile.id,
        runId,
        eventType: { in: ["SOURCE_STATE_CHANGED", "BELIEF_CHANGED", "RELATIONSHIP_CHANGED"] },
        metadata: { path: ["origin"], equals: "ACTION_EXECUTION" },
      },
      orderBy: { agentSequence: "asc" },
    });
    expect(mutationLife.map(({ eventType }) => eventType)).toEqual([
      "SOURCE_STATE_CHANGED",
      "BELIEF_CHANGED",
      "RELATIONSHIP_CHANGED",
    ]);
    expect(mutationLife.every(({ afterState }) => afterState !== null)).toBe(true);
  });

  it("emits one safe source-changed event per same-domain source after a failed fetch", async () => {
    const fixture = await createFixture();
    const domain = "failure-outbox.integration.test";
    const sources = await Promise.all(
      ["feed-a-private-path", "feed-b-private-path"].map((path) =>
        integrationDatabase.agentSource.create({
          data: {
            agentProfileId: fixture.created.agent.profile.id,
            url: `https://${domain}/${path}`,
            normalizedDomain: domain,
            sourceType: "HTML",
            status: "SEED",
            topics: ["testing"],
            trustScore: 0.8,
            interestScore: 0.8,
            noveltyScore: 0.5,
            usefulnessScore: 0.5,
            addedByOrigin: "INTEGRATION_TEST",
          },
        }),
      ),
    );
    const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const writePrincipal = await runtimePrincipal(fixture.credential);
    const workerId = "source-failure-outbox-worker";
    const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId,
      leaseSeconds: 60,
    });
    const runId = leased.run!.id;

    const sourceAttemptId = randomUUID();
    await recordRuntimeSourceAttempt(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeSourceAttemptSchema.parse({
        workerId,
        attemptId: sourceAttemptId,
        sourceId: sources[0]!.id,
      }),
    );
    const result = await recordRuntimeSourceResult(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeSourceResultSchema.parse({
        workerId,
        attemptId: sourceAttemptId,
        sourceId: sources[0]!.id,
        items: [],
        errorCode: "SOURCE_HTTP_503",
      }),
    );
    expect(result).toMatchObject({
      sourceId: sources[0]!.id,
      itemCount: 0,
      changedSourceCount: 2,
    });

    const sourceIds = sources.map(({ id }) => id);
    const events = await integrationDatabase.outboxEvent.findMany({
      where: {
        eventType: "agent.source.changed",
        aggregateId: { in: sourceIds },
      },
      orderBy: { aggregateId: "asc" },
    });
    expect(events).toHaveLength(2);
    expect(events.map(({ aggregateId }) => aggregateId).sort()).toEqual([...sourceIds].sort());
    expect(events).toEqual(
      expect.arrayContaining(
        sources.map((source, index) =>
          expect.objectContaining({
            eventType: "agent.source.changed",
            aggregateType: "AgentSource",
            aggregateId: source.id,
            actorId: fixture.created.agent.user.id,
            actorKind: "AGENT",
            requestId: writePrincipal.actor.requestId,
            payload: {
              agentProfileId: fixture.created.agent.profile.id,
              runId,
              sourceId: source.id,
              normalizedDomain: domain,
              reasonCode: "FETCH_FAILED",
              errorCode: "SOURCE_HTTP_503",
              before: {
                status: "SEED",
                consecutiveFailures: 0,
                lastFetchedAt: null,
                lastUsefulAt: null,
              },
              after: {
                status: "SEED",
                consecutiveFailures: 1,
                lastFetchedAt: index === 0 ? result.recordedAt.toISOString() : null,
                lastUsefulAt: null,
              },
            },
          }),
        ),
      ),
    );
    const serializedEvents = JSON.stringify(events);
    expect(serializedEvents).not.toContain("feed-a-private-path");
    expect(serializedEvents).not.toContain("feed-b-private-path");
    expect(serializedEvents).not.toContain(leased.run!.leaseToken);
    expect(serializedEvents).not.toContain("canonicalUrl");
    expect(serializedEvents).not.toContain("safeText");
    expect(serializedEvents).not.toContain("rawBody");
  });

  it("requires idempotency and replays lease without creating a second claim", async () => {
    const fixture = await createFixture(2);
    const url = "http://localhost/api/v1/internal/agent-runtime/lease";
    const makeRequest = (key?: string, cookie?: string) =>
      new NextRequest(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${fixture.credential}`,
          "content-type": "application/json",
          ...(key ? { "idempotency-key": key } : {}),
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify({ workerId: "route-worker", leaseSeconds: 60 }),
      });
    expect((await leaseRoute(makeRequest())).status).toBe(422);
    expect((await leaseRoute(makeRequest("browser-key", "ajan_session=fake"))).status).toBe(403);
    const first = await leaseRoute(makeRequest("lease-once"));
    const replay = await leaseRoute(makeRequest("lease-once"));
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.headers.get("Idempotent-Replay")).toBe("true");
    const firstEnvelope = (await first.json()) as {
      data: { run: { id: string; leaseToken: string } };
    };
    const replayEnvelope = (await replay.json()) as typeof firstEnvelope;
    expect(firstEnvelope).toEqual(replayEnvelope);
    expect(firstEnvelope.data.run.leaseToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    const persistedRun = await integrationDatabase.agentRun.findUniqueOrThrow({
      where: { id: firstEnvelope.data.run.id },
    });
    expect(persistedRun).toMatchObject({ leaseToken: firstEnvelope.data.run.leaseToken });
    const startedOutbox = await integrationDatabase.outboxEvent.findMany({
      where: {
        eventType: "agent.run.started",
        aggregateId: persistedRun.id,
      },
    });
    expect(startedOutbox).toHaveLength(1);
    expect(startedOutbox[0]).toMatchObject({
      aggregateType: "AgentRun",
      actorId: fixture.created.agent.user.id,
      actorKind: "AGENT",
      payload: expect.objectContaining({
        agentProfileId: fixture.created.agent.profile.id,
        runId: persistedRun.id,
        runStatus: "RUNNING",
        attempt: 1,
      }),
    });
    expect(JSON.stringify(startedOutbox)).not.toContain(firstEnvelope.data.run.leaseToken);
    const leaseIdempotency = await integrationDatabase.idempotencyRecord.findFirstOrThrow({
      where: {
        key: "lease-once",
        route: "/api/v1/internal/agent-runtime/lease",
      },
    });
    const storedBody = leaseIdempotency.responseBody as {
      data: { run: { leaseToken?: string; leaseTokenFingerprint: string } };
    };
    expect(JSON.stringify(storedBody)).not.toContain(firstEnvelope.data.run.leaseToken);
    expect(storedBody.data.run.leaseToken).toBeUndefined();
    expect(storedBody.data.run.leaseTokenFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(await integrationDatabase.agentRun.count({ where: { runStatus: "RUNNING" } })).toBe(1);

    const writePrincipal = await runtimePrincipal(fixture.credential, "runtime:write");
    await failRuntimeRun(
      integrationDatabase,
      writePrincipal,
      persistedRun.id,
      runtimeFailSchemaApplication.parse({
        workerId: "route-worker",
        leaseToken: firstEnvelope.data.run.leaseToken,
        outcome: "CANCELLED",
        errorCode: "TEST_TERMINAL_REPLAY_FENCE",
        errorSummary: "Terminal geçiş eski lease replay'ini güvenli biçimde kapatmalıdır.",
      }),
    );
    expect(
      await integrationDatabase.idempotencyRecord.count({
        where: {
          key: "lease-once",
          route: "/api/v1/internal/agent-runtime/lease",
        },
      }),
    ).toBe(1);
    const terminalReplay = await leaseRoute(makeRequest("lease-once"));
    expect(terminalReplay.status).toBe(409);
    await expect(terminalReplay.json()).resolves.toMatchObject({
      error: { code: "AGENT_RUN_LEASE_INVALID" },
    });
    const failedOutbox = await integrationDatabase.outboxEvent.findMany({
      where: { eventType: "agent.run.failed", aggregateId: persistedRun.id },
    });
    expect(failedOutbox).toHaveLength(1);
    expect(failedOutbox[0]).toMatchObject({
      aggregateType: "AgentRun",
      actorId: fixture.created.agent.user.id,
      actorKind: "AGENT",
      payload: expect.objectContaining({
        agentProfileId: fixture.created.agent.profile.id,
        runId: persistedRun.id,
        outcome: "CANCELLED",
        requestedOutcome: "CANCELLED",
        errorCode: "TEST_TERMINAL_REPLAY_FENCE",
      }),
    });
    expect(JSON.stringify(failedOutbox)).not.toContain(firstEnvelope.data.run.leaseToken);
    expect(
      await integrationDatabase.agentRun.findUniqueOrThrow({ where: { id: persistedRun.id } }),
    ).toMatchObject({ runStatus: "CANCELLED", attempts: 1 });
    expect(
      await integrationDatabase.agentRun.findUniqueOrThrow({ where: { id: fixture.runs[1]!.id } }),
    ).toMatchObject({ runStatus: "QUEUED", attempts: 0 });
  });

  it("keeps an expired or rotated lease tombstone from claiming another run", async () => {
    const fixture = await createFixture(2);
    const url = "http://localhost/api/v1/internal/agent-runtime/lease";
    const makeRequest = (key: string, workerId: string) =>
      new NextRequest(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${fixture.credential}`,
          "content-type": "application/json",
          "idempotency-key": key,
        },
        body: JSON.stringify({ workerId, leaseSeconds: 60 }),
      });

    const first = await leaseRoute(makeRequest("lease-expiry-generation", "expiry-worker"));
    expect(first.status).toBe(200);
    const firstEnvelope = (await first.json()) as {
      data: { run: { id: string; leaseToken: string } };
    };
    await integrationDatabase.agentRun.update({
      where: { id: firstEnvelope.data.run.id },
      data: { leaseExpiresAt: new Date(Date.now() - 1_000) },
    });

    const expiredReplay = await leaseRoute(makeRequest("lease-expiry-generation", "expiry-worker"));
    expect(expiredReplay.status).toBe(409);
    expect(
      await integrationDatabase.agentRun.findUniqueOrThrow({
        where: { id: firstEnvelope.data.run.id },
      }),
    ).toMatchObject({ runStatus: "RUNNING", attempts: 1 });

    const reclaimed = await leaseRoute(makeRequest("lease-reclaimed-generation", "expiry-worker"));
    expect(reclaimed.status).toBe(200);
    const reclaimedEnvelope = (await reclaimed.json()) as typeof firstEnvelope;
    expect(reclaimedEnvelope.data.run.id).toBe(firstEnvelope.data.run.id);
    expect(reclaimedEnvelope.data.run.leaseToken).not.toBe(firstEnvelope.data.run.leaseToken);

    const rotatedReplay = await leaseRoute(makeRequest("lease-expiry-generation", "expiry-worker"));
    expect(rotatedReplay.status).toBe(409);
    expect(
      await integrationDatabase.agentRun.findUniqueOrThrow({
        where: { id: firstEnvelope.data.run.id },
      }),
    ).toMatchObject({ runStatus: "RUNNING", attempts: 2, leaseOwner: "expiry-worker" });
    expect(
      await integrationDatabase.agentRun.findUniqueOrThrow({ where: { id: fixture.runs[1]!.id } }),
    ).toMatchObject({ runStatus: "QUEUED", attempts: 0 });
  });

  it("bulk hides and restores only provenance-backed agent entries while preserving counters", async () => {
    const fixture = await createFixture();
    const generated = await createRuntimeAgentEntries(fixture, [
      "Kent bostanlarında yağmur suyu biriktirmek yaz kuraklığında verimi koruyor.",
      "Dağıtık sistem gözlemlerinde kuyruk gecikmesini yüzdeliklerle izlemek gerekir.",
    ]);
    const hidden = await bulkSetAgentContentVisibility(
      integrationDatabase,
      adminActor(fixture.admin.id),
      true,
      {
        runId: generated.runId,
        reason: "Bu run içindeki agent içerikleri topluca incelemeye alınmalıdır.",
        confirmation: "HIDE_AGENT_CONTENT",
      },
    );
    expect(hidden).toMatchObject({ status: "SUCCEEDED", selectedCount: 2, failed: [] });
    expect(
      await integrationDatabase.entry.count({
        where: { id: { in: generated.content.map(({ entryId }) => entryId) }, status: "HIDDEN" },
      }),
    ).toBe(2);
    for (const { topic } of generated.topics) {
      expect(
        await integrationDatabase.topic.findUniqueOrThrow({ where: { id: topic.id } }),
      ).toMatchObject({ entryCount: 1 });
    }

    const restored = await bulkSetAgentContentVisibility(
      integrationDatabase,
      adminActor(fixture.admin.id),
      false,
      {
        agentProfileId: fixture.created.agent.profile.id,
        sinceHours: 1,
        reason: "İncelemesi tamamlanan agent içerikleri topluca geri açılmalıdır.",
        confirmation: "RESTORE_AGENT_CONTENT",
      },
    );
    expect(restored).toMatchObject({ status: "SUCCEEDED", selectedCount: 2, failed: [] });
    for (const { topic } of generated.topics) {
      expect(
        await integrationDatabase.topic.findUniqueOrThrow({ where: { id: topic.id } }),
      ).toMatchObject({ entryCount: 2 });
    }
    expect(
      await integrationDatabase.auditLog.count({
        where: { action: { in: ["agent.content.bulk_hidden", "agent.content.bulk_restored"] } },
      }),
    ).toBe(2);
    expect(
      await integrationDatabase.outboxEvent.count({
        where: {
          eventType: { in: ["agent.content.bulk_hidden", "agent.content.bulk_restored"] },
          actorId: fixture.admin.id,
          actorKind: "HUMAN",
        },
      }),
    ).toBe(2);
  });

  it("removes hidden agent entries from every public discovery surface and restores them", async () => {
    const fixture = await createFixture();
    const searchableBody =
      "Tersane yosunu görünürlük matrisi için benzersiz bir agent entry içeriğidir.";
    const generated = await createRuntimeAgentEntries(fixture, [searchableBody]);
    const agentEntryId = generated.content[0]!.entryId;
    const topicId = generated.topics[0]!.topic.id;
    const now = new Date("2026-07-18T12:00:00.000Z");
    const previousDay = previousIstanbulDayWindow(now);
    const debeCreatedAt = new Date((previousDay.start.getTime() + previousDay.end.getTime()) / 2);
    await integrationDatabase.entry.update({
      where: { id: agentEntryId },
      data: { createdAt: debeCreatedAt, updatedAt: debeCreatedAt, score: 1, upvoteCount: 1 },
    });

    const readPublicSurfaceIds = async () => {
      const [topicEntries, profile, search, debe, indexing] = await Promise.all([
        getTopicEntries(integrationDatabase, {
          topicId,
          viewer: null,
          page: 1,
          pageSize: 20,
          skip: 0,
          sort: "oldest",
        }),
        getPublicProfile(integrationDatabase, {
          username: fixture.created.agent.user.username,
          skip: 0,
          take: 20,
        }),
        searchAll(integrationDatabase, {
          query: "tersane yosunu",
          type: "entries",
          page: 1,
          pageSize: 20,
          skip: 0,
        }),
        getDebe(integrationDatabase, now),
        getEntryIndexingDecision(integrationDatabase, agentEntryId),
      ]);
      return {
        topicEntryIds: topicEntries.entries.map(({ id }) => id),
        profileEntryIds: profile.entries.map(({ id }) => id),
        searchEntryIds: search.results.map(({ id }) => id),
        debeEntryIds: debe.map(({ id }) => id),
        indexing,
      };
    };

    await expect(getEntry(integrationDatabase, agentEntryId, null)).resolves.toMatchObject({
      id: agentEntryId,
    });
    const before = await readPublicSurfaceIds();
    expect(before.topicEntryIds).toContain(agentEntryId);
    expect(before.profileEntryIds).toContain(agentEntryId);
    expect(before.searchEntryIds).toContain(agentEntryId);
    expect(before.debeEntryIds).toContain(agentEntryId);
    expect(before.indexing).toMatchObject({ index: true, follow: true });

    await bulkSetAgentContentVisibility(integrationDatabase, adminActor(fixture.admin.id), true, {
      entryIds: [agentEntryId],
      reason: "Public görünürlük matrisi bütün yüzeylerde gizlemeyi doğrulamalıdır.",
      confirmation: "HIDE_AGENT_CONTENT",
    });
    await expect(getEntry(integrationDatabase, agentEntryId, null)).rejects.toMatchObject({
      code: "ENTRY_NOT_FOUND",
      status: 404,
    });
    const hidden = await readPublicSurfaceIds();
    expect(hidden.topicEntryIds).not.toContain(agentEntryId);
    expect(hidden.profileEntryIds).not.toContain(agentEntryId);
    expect(hidden.searchEntryIds).not.toContain(agentEntryId);
    expect(hidden.debeEntryIds).not.toContain(agentEntryId);
    expect(hidden.indexing).toEqual({ index: false, follow: false, includeInSitemap: false });

    await bulkSetAgentContentVisibility(integrationDatabase, adminActor(fixture.admin.id), false, {
      entryIds: [agentEntryId],
      reason: "Public görünürlük matrisi bütün yüzeylerde geri açmayı doğrulamalıdır.",
      confirmation: "RESTORE_AGENT_CONTENT",
    });
    await expect(getEntry(integrationDatabase, agentEntryId, null)).resolves.toMatchObject({
      id: agentEntryId,
    });
    const restored = await readPublicSurfaceIds();
    expect(restored.topicEntryIds).toContain(agentEntryId);
    expect(restored.profileEntryIds).toContain(agentEntryId);
    expect(restored.searchEntryIds).toContain(agentEntryId);
    expect(restored.debeEntryIds).toContain(agentEntryId);
    expect(restored.indexing).toMatchObject({ index: true, follow: true });
  });

  it("reports partial restoration when a selected entry lacks agent provenance", async () => {
    const fixture = await createFixture();
    const generated = await createRuntimeAgentEntries(fixture, [
      "Kısmi bulk geri alma testi için doğrulanmış agent entry içeriği.",
    ]);
    const agentEntryId = generated.content[0]!.entryId;
    const humanEntryId = generated.topics[0]!.entry.id;
    await bulkSetAgentContentVisibility(integrationDatabase, adminActor(fixture.admin.id), true, {
      entryIds: [agentEntryId],
      reason: "Doğrulanmış agent entry önce gizlenerek restore senaryosu hazırlanmalıdır.",
      confirmation: "HIDE_AGENT_CONTENT",
    });
    const outcome = await bulkSetAgentContentVisibility(
      integrationDatabase,
      adminActor(fixture.admin.id),
      false,
      {
        entryIds: [agentEntryId, humanEntryId],
        reason: "Yalnız provenance kaydı bulunan agent entry geri açılmalıdır.",
        confirmation: "RESTORE_AGENT_CONTENT",
      },
    );
    expect(outcome).toMatchObject({
      status: "PARTIAL",
      selectedCount: 2,
      succeeded: [{ entryId: agentEntryId }],
      failed: [{ entryId: humanEntryId, code: "NOT_AGENT_CONTENT" }],
    });
    await expect(
      bulkSetAgentContentVisibility(integrationDatabase, adminActor(fixture.admin.id), true, {
        entryIds: [agentEntryId],
        reason: "Yanlış confirmation değeri ile hiçbir işlem yapılamamalıdır.",
        confirmation: "RESTORE_AGENT_CONTENT",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 422 });
  });

  it("lists agent content with report, visibility, source and identity filters", async () => {
    const fixture = await createFixture();
    const source = await integrationDatabase.agentSource.create({
      data: {
        agentProfileId: fixture.created.agent.profile.id,
        url: "https://moderation-source.example/feed",
        normalizedDomain: "moderation-source.example",
        sourceType: "RSS",
        status: "PROBATION",
        topics: ["integration"],
        trustScore: 0.5,
        interestScore: 0.7,
        noveltyScore: 0.5,
        usefulnessScore: 0.5,
        addedByOrigin: "INTEGRATION_TEST",
      },
    });
    const sourceItem = await integrationDatabase.agentSourceItem.create({
      data: {
        sourceId: source.id,
        canonicalUrl: "https://moderation-source.example/item",
        title: "Moderation source evidence",
        fetchedAt: new Date(),
        contentHash: "a".repeat(64),
        safeText: "Kıyı bitkilerinin tuzluluk toleransı için doğrulanmış kaynak metni.",
        topics: ["integration"],
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });
    const generated = await createRuntimeAgentEntries(
      fixture,
      [
        "Kıyı bitkilerinin tuzluluk toleransı düzenli arazi ölçümleriyle izlenebilir.",
        "Derleyici önbelleği tekrar eden test koşularında belirgin süre tasarrufu sağlar.",
      ],
      [sourceItem.id],
    );
    const [first, second] = generated.content;
    await integrationDatabase.report.create({
      data: {
        reporterId: fixture.admin.id,
        targetType: "ENTRY",
        targetId: first!.entryId,
        reason: "OFF_TOPIC",
        details: "Agent content liste filtresi için açık report kaydıdır.",
      },
    });
    await bulkSetAgentContentVisibility(integrationDatabase, adminActor(fixture.admin.id), true, {
      entryIds: [second!.entryId],
      reason: "Liste görünürlük filtresi için ikinci agent entry gizlenmelidir.",
      confirmation: "HIDE_AGENT_CONTENT",
    });
    const query = (filters: Parameters<typeof getAgentContentRecords>[2]) =>
      getAgentContentRecords(
        integrationDatabase,
        adminActor(fixture.admin.id),
        filters,
        new Date(),
      );
    const [all, total] = await query({
      agentProfileId: fixture.created.agent.profile.id,
      skip: 0,
      take: 20,
    });
    expect(total).toBe(2);
    expect(all).toHaveLength(2);
    expect((await query({ reportStatus: "OPEN", skip: 0, take: 20 }))[0]).toHaveLength(1);
    expect((await query({ reportStatus: "NONE", skip: 0, take: 20 }))[0]).toHaveLength(1);
    expect((await query({ hiddenStatus: "HIDDEN", skip: 0, take: 20 }))[0][0]?.entry.id).toBe(
      second!.entryId,
    );
    expect(
      (await query({ sourceProvenance: "WITH_SOURCE", skip: 0, take: 20 }))[0][0]?.entry.id,
    ).toBe(first!.entryId);
    expect(
      (await query({ sourceProvenance: "WITHOUT_SOURCE", skip: 0, take: 20 }))[0][0]?.entry.id,
    ).toBe(second!.entryId);
    const unauthorized = await createAdmin();
    await integrationDatabase.user.update({
      where: { id: unauthorized.id },
      data: { role: "MODERATOR" },
    });
    await expect(
      getAgentContentRecords(
        integrationDatabase,
        {
          ...adminActor(unauthorized.id),
          actorRole: "MODERATOR",
        },
        { skip: 0, take: 20 },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("does not turn topic activity telemetry into a publication quota", async () => {
    const firstFixture = await createFixture();
    const secondAdmin = await createAdmin();
    const secondCreated = await createAgent(
      integrationDatabase,
      adminActor(secondAdmin.id),
      createAgentSchema.parse({ persona: originalPersonaPack.personas[1] }),
    );
    await integrationDatabase.agentGlobalSettings.update({
      where: { id: "global" },
      data: {
        globalDailyEntryMin: 30,
        globalDailyEntryMax: 40,
        codexConcurrency: 2,
      },
    });
    await changeAgentLifecycle(
      integrationDatabase,
      adminActor(secondAdmin.id),
      secondCreated.agent.profile.id,
      lifecycleChangeSchema.parse({
        status: "ACTIVE",
        reason: "Activate second saturation concurrency fixture.",
      }),
    );
    const secondRun = await integrationDatabase.agentRun.create({
      data: {
        agentProfileId: secondCreated.agent.profile.id,
        runType: "NORMAL_WAKE",
        queuePriority: "MANUAL_SINGLE",
        trigger: "SATURATION_CONCURRENCY_TEST",
        requestedById: secondAdmin.id,
        personaVersionId: secondCreated.agent.personaVersion.id,
        idempotencyKey: randomUUID(),
        timeoutSeconds: 600,
        desiredEntryMin: 1,
        desiredEntryMax: 1,
      },
    });
    const secondFixture = {
      admin: secondAdmin,
      created: secondCreated,
      runs: [secondRun],
      credential: secondCreated.credential,
    };
    const topic = await createTopicWithFirstEntry(
      integrationDatabase,
      adminActor(firstFixture.admin.id),
      {
        title: "runtime topic saturation integration",
        entryBody: "İlk insan entry içeriği topic saturation sayımına dahildir.",
      },
    );
    for (let index = 1; index < 15; index += 1)
      await createEntry(integrationDatabase, adminActor(firstFixture.admin.id), topic.topic.id, {
        body: `Topic saturation için yakın zamanda yazılan aktif insan entry içeriği ${index}.`,
      });

    const workers = ["saturation-worker-one", "saturation-worker-two"] as const;
    const fixtures = [firstFixture, secondFixture] as const;
    const leasedRuns = await Promise.all(
      fixtures.map(async (fixture, index) => {
        const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
        const writePrincipal = await runtimePrincipal(fixture.credential);
        const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
          workerId: workers[index]!,
          leaseSeconds: 60,
        });
        const runId = leased.run!.id;
        const candidateBodies = [
          "Yoğun tartışmalar, farklı örnekler kısa ve açık gerekçelerle sunulduğunda daha okunabilir kalıyor.",
          "Bir başlığın uzunluğu tek başına değerini belirlemiyor; yeni bilgi ekleyen kısa notlar da akışı zenginleştiriyor.",
        ] as const;
        await recordRuntimeActions(
          integrationDatabase,
          writePrincipal,
          runId,
          runtimeActionsSchema.parse({
            workerId: workers[index]!,
            actions: [
              {
                sequence: 1,
                actionType: "CREATE_ENTRY",
                safeReason: "Yoğun topic için agent write saturation politikası değerlendiriliyor.",
                targetType: "TOPIC",
                targetId: topic.topic.id,
                input: {
                  topicId: topic.topic.id,
                  body: candidateBodies[index]!,
                },
                provenance: {
                  evidenceType: "PLATFORM_EVENT",
                  evidenceIds: [runId],
                  shortRationale: "Saturation integration run olayı görünür kanıttır.",
                },
              },
            ],
          }),
        );
        return { fixture, writePrincipal, runId, workerId: workers[index]! };
      }),
    );
    const published = await Promise.all(
      leasedRuns.map(({ writePrincipal, runId, workerId }) =>
        executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
          workerId,
          sequence: 1,
        }),
      ),
    );
    expect(published).toEqual([
      expect.objectContaining({
        actionStatus: "SUCCEEDED",
        rejectionCode: null,
      }),
      expect.objectContaining({
        actionStatus: "SUCCEEDED",
        rejectionCode: null,
      }),
    ]);
    const saturationEvents = await integrationDatabase.agentRuntimeEvent.findMany({
      where: { eventType: "topic.saturation.started" },
    });
    expect(saturationEvents).toHaveLength(0);

    const override = leasedRuns[0]!;
    await integrationDatabase.agentRun.update({
      where: { id: override.runId },
      data: { saturationOverride: true },
    });
    await recordRuntimeActions(
      integrationDatabase,
      override.writePrincipal,
      override.runId,
      runtimeActionsSchema.parse({
        workerId: override.workerId,
        actions: [
          {
            sequence: 2,
            actionType: "CREATE_ENTRY",
            safeReason: "Explicit saturation override yoğun topic write işlemini bilinçli açıyor.",
            targetType: "TOPIC",
            targetId: topic.topic.id,
            input: {
              topicId: topic.topic.id,
              body: "Explicit saturation override ile yayınlanan ayrı ve güvenli agent entry metnidir.",
            },
            provenance: {
              evidenceType: "PLATFORM_EVENT",
              evidenceIds: [override.runId],
              shortRationale: "Explicit admin override taşıyan runtime run görünür kanıttır.",
            },
          },
        ],
      }),
    );
    await expect(
      executeRuntimeAction(integrationDatabase, override.writePrincipal, override.runId, {
        workerId: override.workerId,
        sequence: 2,
      }),
    ).resolves.toMatchObject({ actionStatus: "SUCCEEDED" });
    expect(
      await integrationDatabase.agentRuntimeEvent.count({
        where: { eventType: "topic.saturation.started" },
      }),
    ).toBe(0);
  });

  it("does not reject agent entries because an hourly or daily target was reached", async () => {
    const fixture = await createFixture();
    const topics = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        createTopicWithFirstEntry(integrationDatabase, adminActor(fixture.admin.id), {
          title: `runtime hourly override ${index}`,
          entryBody: `İnsan hourly override kontrol entry içeriği ${index}.`,
        }),
      ),
    );
    const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const writePrincipal = await runtimePrincipal(fixture.credential);
    const workerId = "hourly-override-worker";
    const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId,
      leaseSeconds: 60,
    });
    const runId = leased.run!.id;
    const distinctBodies = [
      "Veritabanı bakım penceresi geri alma planı ve ölçülebilir kesinti bütçesi birlikte düşünülünce anlam kazanır.",
      "Şehir içi otobüs aktarması yalnız güzergâhla değil bekleme süresi ve erişilebilir durak tasarımıyla değerlendirilmelidir.",
      "Bir filmin final sahnesi önceki sessiz ayrıntıları yeniden çerçevelediğinde sürprizden daha kalıcı bir etki bırakır.",
      "Eğitim programındaki hedefler öğretmenin hazırlık zamanı ve öğrencinin erişebildiği kaynaklarla birlikte sınanmalıdır.",
      "Enerji dönüşümündeki büyük hedeflerin maliyeti takvim ve etkilenen çalışan grupları görünür olmadan adil dağıtılamaz.",
      "Gündelik iş mesajlarında cevap beklentisi açık yazılmadığında kolaylık vaadi çevrimdışı zamanı sessiz nöbete dönüştürebilir.",
    ];
    const propose = (sequence: number) =>
      recordRuntimeActions(
        integrationDatabase,
        writePrincipal,
        runId,
        runtimeActionsSchema.parse({
          workerId,
          actions: [
            {
              sequence,
              actionType: "CREATE_ENTRY",
              safeReason:
                "Saatlik yayın hızı explicit override politikasına göre değerlendiriliyor.",
              targetType: "TOPIC",
              targetId: topics[sequence - 1]!.topic.id,
              input: {
                topicId: topics[sequence - 1]!.topic.id,
                body: distinctBodies[sequence - 1]!,
              },
              provenance: {
                evidenceType: "PLATFORM_EVENT",
                evidenceIds: [runId],
                shortRationale: "Hourly override integration run olayı görünür kanıttır.",
              },
            },
          ],
        }),
      );
    for (let sequence = 1; sequence <= 4; sequence += 1) {
      await propose(sequence);
      await expect(
        executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
          workerId,
          sequence,
        }),
      ).resolves.toMatchObject({ actionStatus: "SUCCEEDED", rejectionCode: null });
    }
    await propose(5);
    await expect(
      executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
        workerId,
        sequence: 5,
      }),
    ).resolves.toMatchObject({ actionStatus: "SUCCEEDED", rejectionCode: null });
    await integrationDatabase.agentRun.update({
      where: { id: runId },
      data: { dailyMaximumOverride: true },
    });
    await propose(6);
    await expect(
      executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
        workerId,
        sequence: 6,
      }),
    ).resolves.toMatchObject({ actionStatus: "SUCCEEDED" });
  });

  it("blocks agent topic writes even with saturation override until an admin unlocks it", async () => {
    const fixture = await createFixture();
    await integrationDatabase.agentRun.update({
      where: { id: fixture.runs[0]!.id },
      data: { saturationOverride: true },
    });
    const topic = await createTopicWithFirstEntry(
      integrationDatabase,
      adminActor(fixture.admin.id),
      { title: "agent topic write lock integration", entryBody: "İlk insan entry içeriği." },
    );
    await setAgentTopicWriteLock(integrationDatabase, adminActor(fixture.admin.id), {
      topicId: topic.topic.id,
      durationMinutes: 60,
      reason: "İnceleme süresince bu topic agent yazımına geçici olarak kapatılmalıdır.",
    });
    const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const writePrincipal = await runtimePrincipal(fixture.credential);
    const workerId = "topic-lock-worker";
    const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId,
      leaseSeconds: 60,
    });
    const runId = leased.run!.id;
    const propose = (sequence: number, body: string) =>
      recordRuntimeActions(
        integrationDatabase,
        writePrincipal,
        runId,
        runtimeActionsSchema.parse({
          workerId,
          actions: [
            {
              sequence,
              actionType: "CREATE_ENTRY",
              safeReason: "Topic write-lock testi güvenli entry adayını değerlendiriyor.",
              targetType: "TOPIC",
              targetId: topic.topic.id,
              input: { topicId: topic.topic.id, body },
              provenance: {
                evidenceType: "PLATFORM_EVENT",
                evidenceIds: [runId],
                shortRationale: "Topic lock integration eylem önerisidir.",
              },
            },
          ],
        }),
      );
    await propose(1, "Topic kilitliyken bu agent entry yayınlanmamalıdır.");
    await expect(
      executeRuntimeAction(integrationDatabase, writePrincipal, runId, { workerId, sequence: 1 }),
    ).resolves.toMatchObject({
      actionStatus: "REJECTED",
      rejectionCode: "TOPIC_WRITE_LOCKED",
    });
    await removeAgentTopicWriteLock(
      integrationDatabase,
      adminActor(fixture.admin.id),
      topic.topic.id,
      { reason: "İnceleme tamamlandığı için topic agent yazımına yeniden açılmalıdır." },
    );
    await propose(2, "Topic kilidi kaldırıldıktan sonra agent entry güvenle yayınlanabilir.");
    await expect(
      executeRuntimeAction(integrationDatabase, writePrincipal, runId, { workerId, sequence: 2 }),
    ).resolves.toMatchObject({ actionStatus: "SUCCEEDED" });
    expect(
      await integrationDatabase.auditLog.count({
        where: {
          action: { in: ["agent.topic_write_locked", "agent.topic_write_unlocked"] },
          entityId: topic.topic.id,
        },
      }),
    ).toBe(2);
    expect(
      await integrationDatabase.outboxEvent.count({
        where: {
          eventType: "agent.topic.write_locked",
          aggregateId: topic.topic.id,
          actorId: fixture.admin.id,
          actorKind: "HUMAN",
        },
      }),
    ).toBe(1);
    expect(await integrationDatabase.agentTopicWriteLock.count()).toBe(0);
  });

  it("projects safe runtime events in ordered reconnect pages for the admin live stream", async () => {
    const fixture = await createFixture();
    const initial = await listRuntimeEvents(integrationDatabase, adminActor(fixture.admin.id), {
      take: 100,
    });
    const cursor = initial.at(-1)?.id;
    const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const writePrincipal = await runtimePrincipal(fixture.credential);
    const workerId = "live-event-worker";
    const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId,
      leaseSeconds: 60,
    });
    const runId = leased.run!.id;
    await heartbeatRuntimeRun(integrationDatabase, writePrincipal, runId, {
      runId,
      workerId,
      leaseSeconds: 60,
      runtimeStatus: "READING",
    });
    await recordRuntimeEvents(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeEventsSchema.parse({
        workerId,
        events: [
          {
            eventType: "run.step.changed",
            safeMessage: "Güvenli runtime adımı kaydedildi.",
            metadata: { phase: "READING" },
          },
        ],
      }),
    );
    const events = await listRuntimeEvents(integrationDatabase, adminActor(fixture.admin.id), {
      ...(cursor ? { afterId: BigInt(cursor) } : {}),
      take: 100,
    });
    expect(events.map(({ eventType }) => eventType)).toEqual([
      "run.started",
      "agent.heartbeat",
      "run.step.changed",
    ]);
    expect(
      events.every(
        (event, index) => index === 0 || BigInt(event.id) > BigInt(events[index - 1]!.id),
      ),
    ).toBe(true);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          runId,
          agentProfileId: fixture.created.agent.profile.id,
          safeMessage: "Güvenli runtime adımı kaydedildi.",
        }),
      ]),
    );
    const latestPage = await getRuntimeEventHistoryPage(
      integrationDatabase,
      adminActor(fixture.admin.id),
      { take: 2 },
    );
    expect(latestPage.events).toHaveLength(2);
    expect(latestPage.totalItems).toBeGreaterThanOrEqual(events.length);
    expect(latestPage.nextBeforeId).not.toBeNull();
    const olderPage = await getRuntimeEventHistoryPage(
      integrationDatabase,
      adminActor(fixture.admin.id),
      { beforeId: BigInt(latestPage.events[0]!.id), take: 2 },
    );
    expect(olderPage.events.length).toBeGreaterThan(0);
    expect(
      olderPage.events.every(
        ({ id }, index) =>
          BigInt(id) < BigInt(latestPage.events[0]!.id) &&
          (index === 0 || BigInt(id) > BigInt(olderPage.events[index - 1]!.id)),
      ),
    ).toBe(true);
    const unauthorized = await createAdmin();
    await integrationDatabase.user.update({
      where: { id: unauthorized.id },
      data: { role: "MODERATOR" },
    });
    await expect(
      listRuntimeEvents(
        integrationDatabase,
        { ...adminActor(unauthorized.id), actorRole: "MODERATOR" },
        { take: 10 },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("reserves perception capacity for discovery sources and evolves them through probation", async () => {
    const fixture = await createFixture();
    for (let index = 0; index < 8; index += 1) {
      await integrationDatabase.agentSource.create({
        data: {
          agentProfileId: fixture.created.agent.profile.id,
          url: `https://trusted-${index}.source-reserve.test/feed`,
          normalizedDomain: `trusted-${index}.source-reserve.test`,
          sourceType: "RSS",
          status: "TRUSTED",
          topics: ["reserve"],
          trustScore: 0.9 - index * 0.01,
          interestScore: 0.8,
          noveltyScore: 0.5,
          usefulnessScore: 0.8,
          addedByOrigin: "INTEGRATION_TEST",
        },
      });
    }
    const discovered = await integrationDatabase.agentSource.create({
      data: {
        agentProfileId: fixture.created.agent.profile.id,
        url: "https://discovered.source-reserve.test/feed",
        normalizedDomain: "discovered.source-reserve.test",
        sourceType: "RSS",
        status: "DISCOVERED",
        topics: ["reserve"],
        trustScore: 0.2,
        interestScore: 0.9,
        noveltyScore: 0.9,
        usefulnessScore: 0.5,
        addedByOrigin: "INTEGRATION_TEST",
      },
    });
    const blocked = await integrationDatabase.agentSource.create({
      data: {
        agentProfileId: fixture.created.agent.profile.id,
        url: "https://blocked.source-reserve.test/feed",
        normalizedDomain: "blocked.source-reserve.test",
        sourceType: "RSS",
        status: "BLOCKED",
        topics: ["reserve"],
        trustScore: 1,
        interestScore: 1,
        noveltyScore: 1,
        usefulnessScore: 1,
        adminBlocked: true,
        addedByOrigin: "INTEGRATION_TEST",
      },
    });
    const leasePrincipal = await runtimePrincipal(fixture.credential, "runtime:lease");
    const writePrincipal = await runtimePrincipal(fixture.credential);
    const workerId = "source-reserve-worker";
    const leased = await leaseRuntimeRun(integrationDatabase, leasePrincipal, {
      workerId,
      leaseSeconds: 60,
    });
    const runId = leased.run!.id;
    const context = await getRuntimeRunContext(
      integrationDatabase,
      writePrincipal,
      runId,
      workerId,
    );
    const targets = (
      context.perception as {
        sourceFetchTargets: Array<{ sourceId: string; status: string }>;
      }
    ).sourceFetchTargets;
    expect(targets.length).toBeLessThanOrEqual(8);
    expect(targets.some(({ sourceId }) => sourceId === discovered.id)).toBe(true);
    expect(targets.some(({ sourceId }) => sourceId === blocked.id)).toBe(false);
    expect(
      targets.filter(({ status }) => status === "DISCOVERED" || status === "PROBATION").length /
        targets.length,
    ).toBeGreaterThanOrEqual(0.1);

    const sourceResult = (index: number, attemptId: string) =>
      runtimeSourceResultSchema.parse({
        workerId,
        attemptId,
        sourceId: discovered.id,
        items: Array.from({ length: index === 0 ? 3 : 1 }, (_, itemIndex) => ({
          canonicalUrl: `https://discovered.source-reserve.test/item-${index}-${itemIndex}`,
          title: `Discovery item ${index}-${itemIndex}`,
          contentHash: `${index + 1}${itemIndex}`.padEnd(64, String(index + 1)),
          safeText: `Discovery source güvenli metni ${index}-${itemIndex}.`,
        })),
      });
    const firstAttemptId = randomUUID();
    await recordRuntimeSourceAttempt(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeSourceAttemptSchema.parse({
        workerId,
        attemptId: firstAttemptId,
        sourceId: discovered.id,
      }),
    );
    await recordRuntimeSourceResult(
      integrationDatabase,
      writePrincipal,
      runId,
      sourceResult(0, firstAttemptId),
    );
    await expect(
      integrationDatabase.agentSource.findUniqueOrThrow({ where: { id: discovered.id } }),
    ).resolves.toMatchObject({ status: "PROBATION" });
    const secondAttemptId = randomUUID();
    await recordRuntimeSourceAttempt(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeSourceAttemptSchema.parse({
        workerId,
        attemptId: secondAttemptId,
        sourceId: discovered.id,
      }),
    );
    await recordRuntimeSourceResult(
      integrationDatabase,
      writePrincipal,
      runId,
      sourceResult(1, secondAttemptId),
    );
    await expect(
      integrationDatabase.agentSource.findUniqueOrThrow({ where: { id: discovered.id } }),
    ).resolves.toMatchObject({ status: "TRUSTED" });
  });
});
