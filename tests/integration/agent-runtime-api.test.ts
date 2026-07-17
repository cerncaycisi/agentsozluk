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
  updateGlobalSettings,
} from "@/modules/agents";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
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
});
