import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as leaseRoute } from "@/app/api/v1/internal/agent-runtime/lease/route";
import type { ActorContext } from "@/modules/auth/domain/actor";
import {
  authenticateRuntimeRequest,
  changeAgentLifecycle,
  completeRuntimeRun,
  createAgent,
  createAgentSchema,
  executeRuntimeAction,
  getAgentDetail,
  getRuntimeRunContext,
  heartbeatRuntimeRun,
  leaseRuntimeRun,
  listRuntimeEvents,
  lifecycleChangeSchema,
  recordRuntimeActions,
  recordRuntimeEvents,
  recordRuntimeMemories,
  recordRuntimeSourceResult,
  rotateAgentCredential,
  runtimeActionsSchema,
  runtimeCompleteSchema,
  runtimeEventsSchema,
  runtimeMemoriesSchema,
  runtimeSourceResultSchema,
  runtimeHeartbeatSchema,
  runtimeCredentialRotationSchema,
  setGlobalRuntimeEnabled,
  updateGlobalSettings,
} from "@/modules/agents";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import {
  bulkSetAgentContentVisibility,
  getAgentContentRecords,
  removeAgentTopicWriteLock,
  setAgentTopicWriteLock,
} from "@/modules/moderation";
import { createTopicWithFirstEntry } from "@/modules/topics";
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

async function createFixture(runCount = 1) {
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
  await changeAgentLifecycle(
    integrationDatabase,
    adminActor(admin.id),
    created.agent.profile.id,
    lifecycleChangeSchema.parse({
      status: "ACTIVE",
      reason: "Runtime integration fixture activation.",
    }),
  );
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
          timeoutSeconds: 600,
          desiredEntryMin: 2,
          desiredEntryMax: 3,
        },
      }),
    ),
  );
  return { admin, created, runs, credential: created.credential };
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

beforeEach(resetIntegrationDatabase);
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
  });

  it("keeps read-only work leaseable while the runtime error breaker pauses new write runs", async () => {
    const fixture = await createFixture();
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
    await setGlobalRuntimeEnabled(integrationDatabase, adminActor(fixture.admin.id), true, {
      reason: "Reset verified Codex breaker after operator review.",
    });
    await expect(
      leaseRuntimeRun(integrationDatabase, principal, {
        workerId: "breaker-reset-worker",
        leaseSeconds: 60,
      }),
    ).resolves.toMatchObject({ run: { id: fixture.runs[0]!.id }, reason: null });
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
    expect(JSON.stringify(context)).toContain("VISIBLE_PERCEPTION_BODY");
    expect(JSON.stringify(context)).not.toContain("HIDDEN_PERCEPTION_BODY");
    expect(JSON.stringify(context)).not.toContain(fixture.admin.email);
    expect(Buffer.byteLength(JSON.stringify(context.perception), "utf8")).toBeLessThanOrEqual(
      65_536,
    );
    expect(context.perception.recentEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ topic: expect.objectContaining({ id: visibleTopic.topic.id }) }),
      ]),
    );
    await recordRuntimeMemories(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeMemoriesSchema.parse({
        workerId: "worker-main",
        memories: [
          {
            subjectType: "ENTRY",
            subjectId: visibleTopic.entry.id,
            summary: "Görünür perception entry'si gerçekten okundu.",
            salience: 0.6,
            provenance: {
              evidenceType: "USER_ENTRY",
              evidenceIds: [visibleTopic.entry.id],
              shortRationale: "Entry bu run snapshot'ında görünür durumdaydı.",
            },
          },
        ],
      }),
    );
    expect(context.persona.version).toBe(1);
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
        where: { runId, eventType: "OBSERVATION_READ" },
      }),
    ).toBe(1);
    expect(await integrationDatabase.auditLog.count({ where: { entityId: runId } })).toBe(4);
  });

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
    expect(first).toMatchObject({ actionStatus: "SUCCEEDED" });
    expect(replay).toMatchObject({ id: first.id, actionStatus: "SUCCEEDED" });
    expect(duplicate).toMatchObject({
      actionStatus: "REJECTED",
      rejectionCode: "DUPLICATE_SIMILARITY",
    });
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
  });

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

  it("rejects public writes from DRY_RUN without creating content", async () => {
    const fixture = await createFixture();
    await integrationDatabase.agentRun.update({
      where: { id: fixture.runs[0]!.id },
      data: { runType: "DRY_RUN", desiredEntryMin: 0, desiredEntryMax: 0 },
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
            input: { title: "dry run topic", body: "Bu içerik yayınlanmamalıdır." },
            provenance: {
              evidenceType: "PLATFORM_EVENT",
              evidenceIds: [runId],
              shortRationale: "Dry run policy doğrulama adayı.",
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
  });

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
    for (const sequence of [1, 2, 3])
      await expect(
        executeRuntimeAction(integrationDatabase, writePrincipal, runId, {
          workerId: "evolution-worker",
          sequence,
        }),
      ).resolves.toMatchObject({ actionStatus: "SUCCEEDED" });
    const proposedSource = await integrationDatabase.agentSource.findFirstOrThrow({
      where: { agentProfileId: fixture.created.agent.profile.id },
    });
    await recordRuntimeSourceResult(
      integrationDatabase,
      writePrincipal,
      runId,
      runtimeSourceResultSchema.parse({
        workerId: "evolution-worker",
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
      await integrationDatabase.agentSource.findFirstOrThrow({
        where: { agentProfileId: fixture.created.agent.profile.id },
      }),
    ).toMatchObject({ status: "TRUSTED", normalizedDomain: "example.com" });
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
    expect(replay.headers.get("Idempotent-Replay")).toBe("true");
    expect(await first.json()).toEqual(await replay.json());
    expect(await integrationDatabase.agentRun.count({ where: { runStatus: "RUNNING" } })).toBe(1);
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

    const sourceResult = (index: number) =>
      runtimeSourceResultSchema.parse({
        workerId,
        sourceId: discovered.id,
        items: Array.from({ length: index === 0 ? 3 : 1 }, (_, itemIndex) => ({
          canonicalUrl: `https://discovered.source-reserve.test/item-${index}-${itemIndex}`,
          title: `Discovery item ${index}-${itemIndex}`,
          contentHash: `${index + 1}${itemIndex}`.padEnd(64, String(index + 1)),
          safeText: `Discovery source güvenli metni ${index}-${itemIndex}.`,
        })),
      });
    await recordRuntimeSourceResult(integrationDatabase, writePrincipal, runId, sourceResult(0));
    await expect(
      integrationDatabase.agentSource.findUniqueOrThrow({ where: { id: discovered.id } }),
    ).resolves.toMatchObject({ status: "PROBATION" });
    await recordRuntimeSourceResult(integrationDatabase, writePrincipal, runId, sourceResult(1));
    await expect(
      integrationDatabase.agentSource.findUniqueOrThrow({ where: { id: discovered.id } }),
    ).resolves.toMatchObject({ status: "TRUSTED" });
  });
});
