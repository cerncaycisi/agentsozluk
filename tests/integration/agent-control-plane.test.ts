import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loginHuman } from "@/modules/auth/application/authenticate";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { hashPassword } from "@/modules/auth/domain/password";
import {
  changeAgentLifecycle,
  createAgent,
  createAgentSchema,
  agentSourceAdminUpdateSchema,
  getRuntimeCapacity,
  lifecycleChangeSchema,
  listAgentSources,
  personaRollbackSchema,
  recordRuntimeCapability,
  rollbackPersona,
  runtimeCapabilityMeasurementSchema,
  updateAgent,
  updateAgentSourceAdmin,
  updateAgentSchema,
  updateGlobalSettings,
} from "@/modules/agents";
import { findRuntimeSourceForWrite } from "@/modules/agents/repository/runtime";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import { sha256 } from "@/lib/security/crypto";
import { redactCreationCredential } from "@/modules/agents/domain/credential";
import { executeIdempotently } from "@/modules/idempotency/application/idempotency";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

async function createPrincipal(role: "ADMIN" | "MODERATOR" = "ADMIN") {
  const suffix = randomUUID().replaceAll("-", "");
  return integrationDatabase.user.create({
    data: {
      kind: "HUMAN",
      role,
      status: "ACTIVE",
      email: `${role.toLowerCase()}-${suffix}@integration.test`,
      emailNormalized: `${role.toLowerCase()}-${suffix}@integration.test`,
      username: `${role.toLowerCase()}_${suffix.slice(0, 16)}`,
      usernameNormalized: `${role.toLowerCase()}_${suffix.slice(0, 16)}`,
      displayName: `${role} principal`,
      passwordHash: "not-used",
      termsVersion: "1.0",
      termsAcceptedAt: new Date(),
    },
  });
}

function actor(id: string, role: "ADMIN" | "MODERATOR" = "ADMIN"): ActorContext {
  return {
    actorId: id,
    actorKind: "HUMAN",
    actorRole: role,
    requestId: randomUUID(),
    origin: "API",
  };
}

async function createFirstAgent(adminId: string) {
  return createAgent(
    integrationDatabase,
    actor(adminId),
    createAgentSchema.parse({
      persona: originalPersonaPack.personas[0],
      creation: { method: "TEMPLATE", templateUsername: originalPersonaPack.personas[0]!.username },
    }),
  );
}

beforeEach(resetIntegrationDatabase);
afterAll(closeIntegrationDatabase);

describe("agent control plane with PostgreSQL", () => {
  it("creates every required record atomically and returns the credential only once", async () => {
    const admin = await createPrincipal();
    const result = await createFirstAgent(admin.id);
    const profileId = result.agent.profile.id;
    const stored = await integrationDatabase.agentProfile.findUniqueOrThrow({
      where: { id: profileId },
      include: {
        user: true,
        currentPersonaVersion: true,
        runtimeState: true,
        sources: true,
        credentials: true,
      },
    });

    expect(stored.lifecycleStatus).toBe("PAUSED");
    expect(stored.user).toMatchObject({
      kind: "AGENT",
      role: "USER",
      status: "ACTIVE",
      loginDisabled: true,
    });
    expect(stored.user.email).toMatch(/^agent\+[0-9a-f-]+@invalid\.local$/u);
    expect(stored.currentPersonaVersion).toMatchObject({ version: 1, changeOrigin: "INITIAL" });
    expect(stored.runtimeState?.runtimeStatus).toBe("IDLE");
    expect(stored.sources).toHaveLength(originalPersonaPack.personas[0]!.sources.length);
    expect(stored.credentials).toHaveLength(1);
    expect(stored.credentials[0]!.tokenHash).toBe(sha256(result.credential));
    expect(stored.credentials[0]!.tokenHash).not.toBe(result.credential);
    expect(await integrationDatabase.auditLog.count({ where: { action: "agent.created" } })).toBe(
      1,
    );
    expect(
      await integrationDatabase.outboxEvent.count({ where: { eventType: "agent.created" } }),
    ).toBe(1);
    expect(
      await integrationDatabase.agentRuntimeEvent.count({
        where: { agentProfileId: profileId, eventType: "persona.version.created" },
      }),
    ).toBe(1);
  });

  it("stores only a redacted idempotency response and replays no credential", async () => {
    const admin = await createPrincipal();
    const adminActor = actor(admin.id);
    const input = createAgentSchema.parse({ persona: originalPersonaPack.personas[0] });
    const scope = {
      actorId: admin.id,
      route: "/api/v1/admin/agents",
      key: "create-agent-once",
      requestBody: input,
    };
    const first = await executeIdempotently(integrationDatabase, scope, async (transaction) => {
      const result = await createAgent(transaction, adminActor, input);
      const body = {
        data: {
          agentId: result.agent.profile.id,
          credential: result.credential,
          credentialShownOnce: true,
        },
      };
      return { status: 201, body, storedBody: redactCreationCredential(body) };
    });
    expect(first.replayed).toBe(false);
    const credential = (first.body as { data: { credential: string } }).data.credential;
    const stored = await integrationDatabase.idempotencyRecord.findFirstOrThrow({
      where: { actorId: admin.id, key: scope.key },
    });
    expect(JSON.stringify(stored.responseBody)).not.toContain(credential);

    const replay = await executeIdempotently(integrationDatabase, scope, async () => {
      throw new Error("Replay must not execute the create callback.");
    });
    expect(replay).toMatchObject({
      replayed: true,
      body: { data: { credential: null, credentialShownOnce: false } },
    });
    expect(await integrationDatabase.agentProfile.count()).toBe(1);
  });

  it("denies moderators and AGENT principals from the control plane", async () => {
    const moderator = await createPrincipal("MODERATOR");
    const input = createAgentSchema.parse({ persona: originalPersonaPack.personas[0] });
    await expect(
      createAgent(integrationDatabase, actor(moderator.id, "MODERATOR"), input),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      createAgent(
        integrationDatabase,
        { ...actor(moderator.id, "ADMIN"), actorKind: "AGENT" },
        input,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await integrationDatabase.agentProfile.count()).toBe(0);
  });

  it("blocks web login for an AGENT account even with the correct password", async () => {
    const suffix = randomUUID();
    const password = "known-agent-password-123";
    const email = `agent+${suffix}@invalid.local`;
    await integrationDatabase.user.create({
      data: {
        kind: "AGENT",
        role: "USER",
        status: "ACTIVE",
        email,
        emailNormalized: email,
        username: `agent_${suffix.replaceAll("-", "").slice(0, 16)}`,
        usernameNormalized: `agent_${suffix.replaceAll("-", "").slice(0, 16)}`,
        displayName: "Login disabled agent",
        passwordHash: await hashPassword(password),
        loginDisabled: true,
        termsVersion: "1.0",
        termsAcceptedAt: new Date(),
      },
    });
    await expect(
      loginHuman(
        integrationDatabase,
        { email, password },
        { userAgent: null, ip: null },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(await integrationDatabase.session.count()).toBe(0);
  });

  it("appends persona edits and rollback as immutable new versions", async () => {
    const admin = await createPrincipal();
    const created = await createFirstAgent(admin.id);
    const profileId = created.agent.profile.id;
    const initial = originalPersonaPack.personas[0]!;
    const initialVersionId = created.agent.personaVersion.id;
    const pinnedRun = await integrationDatabase.agentRun.create({
      data: {
        agentProfileId: profileId,
        runType: "DRY_RUN",
        queuePriority: "MANUAL_SINGLE",
        trigger: "INTEGRATION_TEST",
        personaVersionId: initialVersionId,
        idempotencyKey: randomUUID(),
        timeoutSeconds: 600,
        desiredEntryMin: 0,
        desiredEntryMax: 0,
      },
    });
    const edited = {
      ...initial,
      publicBio:
        "Dijital sistemlerin görünmeyen varsayımlarını, bakım maliyetini ve kullanıcı etkisini birlikte tartar.",
    };
    await updateAgent(
      integrationDatabase,
      actor(admin.id),
      profileId,
      updateAgentSchema.parse({ persona: edited, changeSummary: "Public bio netleştirildi." }),
    );
    const afterEdit = await integrationDatabase.agentProfile.findUniqueOrThrow({
      where: { id: profileId },
      include: { currentPersonaVersion: true, user: true },
    });
    expect(afterEdit.currentPersonaVersion).toMatchObject({ version: 2, changeOrigin: "ADMIN" });
    expect(afterEdit.user.bio).toBe(edited.publicBio);
    expect(
      (await integrationDatabase.agentRun.findUniqueOrThrow({ where: { id: pinnedRun.id } }))
        .personaVersionId,
    ).toBe(initialVersionId);

    const rollback = await rollbackPersona(
      integrationDatabase,
      actor(admin.id),
      profileId,
      personaRollbackSchema.parse({ version: 1, reason: "İlk persona sürümüne kontrollü dönüş." }),
    );
    expect(rollback).toMatchObject({ version: 3, changeOrigin: "ROLLBACK" });
    expect(
      await integrationDatabase.agentPersonaVersion.count({ where: { agentProfileId: profileId } }),
    ).toBe(3);
    await expect(
      integrationDatabase.agentPersonaVersion.update({
        where: { id: rollback.id },
        data: { changeSummary: "Overwrite attempt" },
      }),
    ).rejects.toThrow(/append-only/iu);
  });

  it("rejects an unsafe admin persona delta without creating a version", async () => {
    const admin = await createPrincipal();
    const created = await createFirstAgent(admin.id);
    const unsafe = {
      ...originalPersonaPack.personas[0]!,
      publicBio: "Ben bir insanım ve dijital kültür üzerine düşünüyorum.",
    };
    await expect(
      updateAgent(
        integrationDatabase,
        actor(admin.id),
        created.agent.profile.id,
        updateAgentSchema.parse({
          persona: unsafe,
          changeSummary: "Unsafe ontology delta test.",
        }),
      ),
    ).rejects.toMatchObject({ code: "PERSONA_ONTOLOGY_REJECTED" });
    expect(
      await integrationDatabase.agentPersonaVersion.count({
        where: { agentProfileId: created.agent.profile.id },
      }),
    ).toBe(1);
  });

  it("rechecks quota consistency on activation and retires without deleting", async () => {
    const admin = await createPrincipal();
    const created = await createFirstAgent(admin.id);
    const profileId = created.agent.profile.id;
    await expect(
      changeAgentLifecycle(
        integrationDatabase,
        actor(admin.id),
        profileId,
        lifecycleChangeSchema.parse({ status: "ACTIVE", reason: "Day zero activation attempt." }),
      ),
    ).rejects.toMatchObject({ code: "QUOTA_INVALID" });

    await updateGlobalSettings(integrationDatabase, actor(admin.id), {
      globalDailyEntryMin: 15,
      globalDailyEntryMax: 20,
    });
    await expect(
      changeAgentLifecycle(
        integrationDatabase,
        actor(admin.id),
        profileId,
        lifecycleChangeSchema.parse({
          status: "ACTIVE",
          reason: "Quota artık matematiksel olarak tutarlı.",
        }),
      ),
    ).resolves.toMatchObject({ lifecycleStatus: "ACTIVE" });
    await expect(
      changeAgentLifecycle(
        integrationDatabase,
        actor(admin.id),
        profileId,
        lifecycleChangeSchema.parse({
          status: "PAUSED",
          reason: "Runtime kontrollü olarak duraklatıldı.",
        }),
      ),
    ).resolves.toMatchObject({ lifecycleStatus: "PAUSED" });
    await changeAgentLifecycle(
      integrationDatabase,
      actor(admin.id),
      profileId,
      lifecycleChangeSchema.parse({
        status: "ACTIVE",
        reason: "Runtime kontrollü olarak devam ettirildi.",
      }),
    );
    await changeAgentLifecycle(
      integrationDatabase,
      actor(admin.id),
      profileId,
      lifecycleChangeSchema.parse({
        status: "RETIRED",
        reason: "Agent kalıcı olarak emekliye ayrıldı.",
      }),
    );
    expect(await integrationDatabase.agentProfile.count({ where: { id: profileId } })).toBe(1);
    await expect(
      changeAgentLifecycle(
        integrationDatabase,
        actor(admin.id),
        profileId,
        lifecycleChangeSchema.parse({ status: "ACTIVE", reason: "Emekli agent yeniden açılamaz." }),
      ),
    ).rejects.toMatchObject({ code: "AGENT_LIFECYCLE_INVALID" });
    expect(
      await integrationDatabase.auditLog.count({ where: { action: "agent.lifecycle_changed" } }),
    ).toBe(4);
  });

  it("rechecks every non-retired profile before accepting an agent quota edit", async () => {
    const admin = await createPrincipal();
    const created = await createFirstAgent(admin.id);
    const profileId = created.agent.profile.id;
    await updateGlobalSettings(integrationDatabase, actor(admin.id), {
      globalDailyEntryMin: 15,
      globalDailyEntryMax: 20,
    });

    await expect(
      updateAgent(
        integrationDatabase,
        actor(admin.id),
        profileId,
        updateAgentSchema.parse({
          useGlobalEntryQuota: false,
          dailyEntry: { min: 0, max: 0 },
        }),
      ),
    ).rejects.toMatchObject({ code: "QUOTA_INVALID" });
    expect(
      await integrationDatabase.agentProfile.findUniqueOrThrow({ where: { id: profileId } }),
    ).toMatchObject({
      useGlobalEntryQuota: true,
      dailyEntryMin: null,
      dailyEntryMax: null,
    });

    await expect(
      updateAgent(
        integrationDatabase,
        actor(admin.id),
        profileId,
        updateAgentSchema.parse({
          useGlobalEntryQuota: false,
          dailyEntry: { min: 15, max: 20 },
        }),
      ),
    ).resolves.toMatchObject({
      useGlobalEntryQuota: false,
      dailyEntryMin: 15,
      dailyEntryMax: 20,
    });
  });

  it("allows concurrency 2 only with the latest fresh successful capability measurement", async () => {
    const admin = await createPrincipal();
    await expect(
      updateGlobalSettings(integrationDatabase, actor(admin.id), { codexConcurrency: 2 }),
    ).rejects.toMatchObject({ code: "AGENT_CAPABILITY_REQUIRED" });

    const measuredAt = new Date();
    const capability = runtimeCapabilityMeasurementSchema.parse({
      codexVersion: "codex-cli 2.4.0",
      promptProfileHash: "a".repeat(64),
      benchmarkRunCount: 10,
      p50DurationMs: 120_000,
      p75DurationMs: 180_000,
      p95DurationMs: 240_000,
      maxDurationMs: 300_000,
      successfulActionCount: 20,
      proposedEntryActionCount: 18,
      publishedEntries: 18,
      failureRate: 0,
      duplicateRetryRate: 0.05,
      singleProcessPeakRssMb: 400,
      dualProcessPeakRssMb: 700,
      systemPeakMemoryMb: 3000,
      availableMemoryMb: 900,
      swapInMb: 0,
      swapOutMb: 0,
      loadAverage1m: 1.2,
      dualRunSuccessCount: 2,
      oomDetected: false,
      swapThrashingDetected: false,
      healthStable: true,
      readinessStable: true,
      appLatencyImpact: { baselineP95Ms: 50, measuredP95Ms: 55, stable: true },
      databaseLatencyImpact: { baselineP95Ms: 10, measuredP95Ms: 12, stable: true },
      capacityStatus: "HEALTHY",
    });
    await expect(
      recordRuntimeCapability(integrationDatabase, actor(admin.id), capability, measuredAt),
    ).resolves.toMatchObject({
      capability: { dualConcurrencySupported: true },
      concurrencyDowngraded: false,
    });
    await expect(
      updateGlobalSettings(integrationDatabase, actor(admin.id), { codexConcurrency: 2 }),
    ).resolves.toMatchObject({ codexConcurrency: 2 });

    const created = await createFirstAgent(admin.id);
    const initialCapacity = await getRuntimeCapacity(integrationDatabase, actor(admin.id));
    const dailyPlan = await integrationDatabase.agentDailyPlan.create({
      data: {
        agentProfileId: created.agent.profile.id,
        localDate: initialCapacity.localDate,
        entryTarget: 7,
        topicTarget: 0,
        voteTarget: 0,
        generatedFromSettingsVersion: 2,
        randomSeed: "capacity-integration-seed",
      },
    });
    await integrationDatabase.agentScheduleSlot.createMany({
      data: [
        {
          dailyPlanId: dailyPlan.id,
          agentProfileId: created.agent.profile.id,
          scheduledAt: measuredAt,
          runType: "SCHEDULED_WAKE",
          queuePriority: "SCHEDULED_CONTENT",
          desiredEntryMin: 2,
          desiredEntryMax: 3,
          status: "COMPLETED",
        },
        {
          dailyPlanId: dailyPlan.id,
          agentProfileId: created.agent.profile.id,
          scheduledAt: new Date(measuredAt.getTime() + 60_000),
          runType: "SCHEDULED_WAKE",
          queuePriority: "SCHEDULED_CONTENT",
          desiredEntryMin: 3,
          desiredEntryMax: 4,
        },
      ],
    });
    await expect(getRuntimeCapacity(integrationDatabase, actor(admin.id))).resolves.toMatchObject({
      capacityStatus: "HEALTHY",
      configuredConcurrency: 2,
      effectiveConcurrency: 2,
      plannedRuns: 2,
      completedRuns: 1,
      estimatedPublishedMin: 5,
      estimatedPublishedMax: 7,
      requiredContentMinutes: 6,
    });

    await integrationDatabase.agentRun.create({
      data: {
        agentProfileId: created.agent.profile.id,
        personaVersionId: created.agent.profile.currentPersonaVersionId!,
        runType: "READ_ONLY",
        runStatus: "SUCCEEDED",
        queuePriority: "MANUAL_SINGLE",
        trigger: "INTEGRATION_FINGERPRINT",
        idempotencyKey: "integration-runtime-fingerprint",
        timeoutSeconds: 600,
        desiredEntryMin: 0,
        desiredEntryMax: 0,
        startedAt: measuredAt,
        finishedAt: new Date(measuredAt.getTime() + 500),
        usageMetadata: {
          durationMs: 500,
          provider: "codex-cli",
          model: "codex-cli 3.0.0",
          promptProfileHash: "b".repeat(64),
        },
      },
    });
    await expect(getRuntimeCapacity(integrationDatabase, actor(admin.id))).resolves.toMatchObject({
      capacityStatus: "UNKNOWN",
      configuredConcurrency: 2,
      effectiveConcurrency: 1,
      dualConcurrencyAvailable: false,
      runtimeFingerprint: {
        codexVersion: "codex-cli 3.0.0",
        promptProfileHash: "b".repeat(64),
      },
      benchmark: { stale: true, staleReasons: ["CODEX_MAJOR", "PROMPT_PROFILE"] },
    });

    await expect(
      recordRuntimeCapability(
        integrationDatabase,
        actor(admin.id),
        runtimeCapabilityMeasurementSchema.parse({
          ...capability,
          benchmarkRunCount: 2,
          dualProcessPeakRssMb: 1500,
          availableMemoryMb: 700,
          dualRunSuccessCount: 1,
          capacityStatus: "AT_RISK",
        }),
        new Date(measuredAt.getTime() + 1000),
      ),
    ).resolves.toMatchObject({
      capability: { dualConcurrencySupported: false },
      concurrencyDowngraded: true,
    });
    expect(
      await integrationDatabase.agentGlobalSettings.findUniqueOrThrow({ where: { id: "global" } }),
    ).toMatchObject({ codexConcurrency: 1 });
    await expect(
      updateGlobalSettings(integrationDatabase, actor(admin.id), { codexConcurrency: 2 }),
    ).rejects.toMatchObject({ code: "AGENT_CAPABILITY_REQUIRED" });
  });

  it("measures real utilization, head-of-line blocking and runtime breaker signals", async () => {
    const admin = await createPrincipal();
    const created = await createFirstAgent(admin.id);
    const profile = await integrationDatabase.agentProfile.findUniqueOrThrow({
      where: { id: created.agent.profile.id },
      select: { currentPersonaVersionId: true },
    });
    const now = new Date("2026-07-18T12:00:00.000Z");
    const terminal = [
      {
        status: "SUCCEEDED" as const,
        startedAt: new Date(now.getTime() - 111 * 60_000),
        finishedAt: new Date(now.getTime() - 15 * 60_000 - 1),
        errorCode: null,
      },
      {
        status: "SUCCEEDED" as const,
        startedAt: new Date(now.getTime() - 15 * 60_000),
        finishedAt: new Date(now.getTime() - 10 * 60_000),
        errorCode: null,
      },
      {
        status: "FAILED" as const,
        startedAt: new Date(now.getTime() - 10 * 60_000),
        finishedAt: new Date(now.getTime() - 5 * 60_000),
        errorCode: "CODEX_TIMEOUT",
      },
      {
        status: "TIMED_OUT" as const,
        startedAt: new Date(now.getTime() - 5 * 60_000),
        finishedAt: now,
        errorCode: "CODEX_TIMEOUT",
      },
    ];
    for (const [index, run] of terminal.entries()) {
      await integrationDatabase.agentRun.create({
        data: {
          agentProfileId: created.agent.profile.id,
          personaVersionId: profile.currentPersonaVersionId!,
          runType: "NORMAL_WAKE",
          runStatus: run.status,
          queuePriority: "SCHEDULED_CONTENT",
          trigger: "INTEGRATION_METRIC",
          idempotencyKey: `integration-metric-terminal:${index}`,
          timeoutSeconds: 600,
          desiredEntryMin: 2,
          desiredEntryMax: 3,
          startedAt: run.startedAt,
          finishedAt: run.finishedAt,
          errorCode: run.errorCode,
        },
      });
    }
    const oldestQueuedAt = new Date(now.getTime() - 20 * 60_000);
    await integrationDatabase.agentRun.create({
      data: {
        agentProfileId: created.agent.profile.id,
        personaVersionId: profile.currentPersonaVersionId!,
        runType: "NORMAL_WAKE",
        queuePriority: "SCHEDULED_CONTENT",
        trigger: "INTEGRATION_METRIC",
        idempotencyKey: "integration-metric-queued",
        timeoutSeconds: 600,
        desiredEntryMin: 2,
        desiredEntryMax: 3,
        createdAt: oldestQueuedAt,
      },
    });
    const capacity = await getRuntimeCapacity(integrationDatabase, actor(admin.id), now);
    expect(capacity).toMatchObject({
      capacityStatus: "AT_RISK",
      operational: {
        terminalRunsInErrorWindow: 3,
        failedRunsInErrorWindow: 2,
        oldestQueuedAt,
      },
      circuitBreakers: {
        runtimeErrorRate: 2 / 3,
        writeRunsPaused: true,
        runtimePaused: false,
        catchUpFrozen: true,
      },
    });
    expect(capacity.operational.utilization15m).toBeCloseTo(1, 5);
    expect(capacity.operational.utilization1h).toBeCloseTo(1, 5);
    expect(capacity.operational.utilization2h).toBeCloseTo(0.925, 4);
  });

  it("administers source evolution with pin, block, approval and weekly score limits", async () => {
    const admin = await createPrincipal();
    const created = await createFirstAgent(admin.id);
    const source = await integrationDatabase.agentSource.create({
      data: {
        agentProfileId: created.agent.profile.id,
        url: "https://source-admin.integration.test/feed",
        normalizedDomain: "source-admin.integration.test",
        sourceType: "RSS",
        status: "PROBATION",
        topics: ["integration"],
        trustScore: 0.5,
        interestScore: 0.5,
        noveltyScore: 0.5,
        usefulnessScore: 0.5,
        addedByOrigin: "INTEGRATION_TEST",
      },
    });
    const [listed, total] = await listAgentSources(integrationDatabase, actor(admin.id), {
      agentProfileId: created.agent.profile.id,
      status: "PROBATION",
      domain: "source-admin",
      skip: 0,
      take: 20,
    });
    expect(total).toBe(1);
    expect(listed[0]).toMatchObject({ id: source.id, _count: { items: 0 } });

    const trusted = await updateAgentSourceAdmin(
      integrationDatabase,
      actor(admin.id),
      source.id,
      agentSourceAdminUpdateSchema.parse({
        status: "TRUSTED",
        adminPinned: true,
        trustScore: 0.56,
        reason: "Admin source içeriğini inceleyip açık trusted onayı vermektedir.",
      }),
      new Date("2026-07-18T08:00:00.000Z"),
    );
    expect(trusted).toMatchObject({ status: "TRUSTED", adminPinned: true, trustScore: 0.56 });
    await expect(
      updateAgentSourceAdmin(
        integrationDatabase,
        actor(admin.id),
        source.id,
        agentSourceAdminUpdateSchema.parse({
          status: "DORMANT",
          reason: "Pinned source doğrudan kaldırılmaya çalışıldığında işlem reddedilmelidir.",
        }),
        new Date("2026-07-18T09:00:00.000Z"),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 422 });
    await expect(
      updateAgentSourceAdmin(
        integrationDatabase,
        actor(admin.id),
        source.id,
        agentSourceAdminUpdateSchema.parse({
          trustScore: 0.61,
          reason: "İkinci skor artışı haftalık toplam sınırını aşmamalıdır.",
        }),
        new Date("2026-07-18T10:00:00.000Z"),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 422 });

    const blocked = await updateAgentSourceAdmin(
      integrationDatabase,
      actor(admin.id),
      source.id,
      agentSourceAdminUpdateSchema.parse({
        adminPinned: false,
        adminBlocked: true,
        reason: "Source güvenli fetch havuzundan çıkarılmak üzere admin tarafından block edilir.",
      }),
      new Date("2026-07-18T11:00:00.000Z"),
    );
    expect(blocked).toMatchObject({ status: "BLOCKED", adminPinned: false, adminBlocked: true });
    await expect(
      integrationDatabase.$transaction((transaction) =>
        findRuntimeSourceForWrite(transaction, {
          agentProfileId: created.agent.profile.id,
          sourceId: source.id,
        }),
      ),
    ).resolves.toBeNull();
    expect(
      await integrationDatabase.auditLog.count({
        where: { action: "agent.source.updated", entityId: source.id },
      }),
    ).toBe(2);
    expect(
      await integrationDatabase.outboxEvent.count({
        where: { eventType: "agent.source_updated", aggregateId: source.id },
      }),
    ).toBe(2);
  });

  it("denies source administration to moderators", async () => {
    const admin = await createPrincipal();
    const moderator = await createPrincipal("MODERATOR");
    const created = await createFirstAgent(admin.id);
    const source = await integrationDatabase.agentSource.findFirstOrThrow({
      where: { agentProfileId: created.agent.profile.id },
    });
    await expect(
      listAgentSources(integrationDatabase, actor(moderator.id, "MODERATOR"), {
        skip: 0,
        take: 20,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      updateAgentSourceAdmin(
        integrationDatabase,
        actor(moderator.id, "MODERATOR"),
        source.id,
        agentSourceAdminUpdateSchema.parse({
          adminPinned: true,
          reason: "Moderator agent source yönetimi yapamamalıdır.",
        }),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
