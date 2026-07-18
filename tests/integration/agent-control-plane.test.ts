import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loginHuman } from "@/modules/auth/application/authenticate";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { hashPassword } from "@/modules/auth/domain/password";
import { inTransaction } from "@/lib/db/transaction";
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
import { circuitBreakerConfigSchema } from "@/modules/agents/domain/circuit-breaker";
import {
  createRuntimeCapabilityRecord,
  getRuntimeOperationalMetrics,
} from "@/modules/agents/repository/capacity";
import { executeIdempotently } from "@/modules/idempotency/application/idempotency";
import { RUNTIME_PROMPT_PROFILE_HASH } from "@/runtime/prompt-profile";
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
  it("promotes a due pending quota as a versioned audited change before rejecting a stale command", async () => {
    const admin = await createPrincipal();
    const initial = await integrationDatabase.agentGlobalSettings.findUniqueOrThrow({
      where: { id: "global" },
    });
    const staged = await updateGlobalSettings(
      integrationDatabase,
      actor(admin.id),
      {
        quotaApplyMode: "NEXT_DAY",
        defaultDailyEntryMin: 16,
        expectedSettingsVersion: initial.settingsVersion,
        changeReason: "Raise the default minimum starting with the next Istanbul day.",
      },
      new Date("2026-07-18T09:00:00.000Z"),
    );
    const staleActor = actor(admin.id);

    await expect(
      updateGlobalSettings(
        integrationDatabase,
        staleActor,
        {
          sourceFetchLimit: 9,
          expectedSettingsVersion: staged.settingsVersion,
          changeReason: "Attempt another settings change from the pre-promotion version.",
        },
        new Date("2026-07-19T09:00:00.000Z"),
      ),
    ).rejects.toMatchObject({ code: "AGENT_SETTINGS_VERSION_CONFLICT", status: 409 });

    await expect(
      integrationDatabase.agentGlobalSettings.findUniqueOrThrow({ where: { id: "global" } }),
    ).resolves.toMatchObject({
      defaultDailyEntryMin: 16,
      sourceFetchLimit: initial.sourceFetchLimit,
      pendingQuotaSettings: null,
      pendingQuotaEffectiveDate: null,
      settingsVersion: staged.settingsVersion + 1,
    });
    await expect(
      integrationDatabase.auditLog.findFirstOrThrow({
        where: {
          action: "agent.settings.changed",
          requestId: staleActor.requestId,
          metadata: { path: ["quotaApplyMode"], equals: "PROMOTE_PENDING" },
        },
      }),
    ).resolves.toMatchObject({
      actorId: admin.id,
      metadata: {
        actorKind: "HUMAN",
        before: { defaultDailyEntryMin: 15 },
        after: { defaultDailyEntryMin: 16 },
        reason: "Pending quota settings reached their effective Europe/Istanbul date.",
        quotaApplyMode: "PROMOTE_PENDING",
        effectiveLocalDate: "2026-07-19",
        previousSettingsVersion: staged.settingsVersion,
        settingsVersion: staged.settingsVersion + 1,
      },
    });
    expect(
      await integrationDatabase.outboxEvent.count({
        where: {
          eventType: "agent.settings.changed",
          requestId: staleActor.requestId,
          payload: { path: ["quotaApplyMode"], equals: "PROMOTE_PENDING" },
        },
      }),
    ).toBe(1);
  });

  it("rejects stale critical runtime settings commands with optimistic version control", async () => {
    const admin = await createPrincipal();
    const commandActor = actor(admin.id);
    const changeReason = "Pause public writes for optimistic concurrency coverage.";
    const before = await integrationDatabase.agentGlobalSettings.findUniqueOrThrow({
      where: { id: "global" },
    });
    const updated = await updateGlobalSettings(integrationDatabase, commandActor, {
      publicWriteEnabled: false,
      expectedSettingsVersion: before.settingsVersion,
      changeReason,
    });
    expect(updated).toMatchObject({
      publicWriteEnabled: false,
      runtimeOperatingMode: "NORMAL",
      settingsVersion: before.settingsVersion + 1,
    });
    await expect(
      integrationDatabase.auditLog.findFirstOrThrow({
        where: {
          action: "agent.settings.changed",
          actorId: admin.id,
          requestId: commandActor.requestId,
        },
      }),
    ).resolves.toMatchObject({
      actorId: admin.id,
      requestId: commandActor.requestId,
      createdAt: expect.any(Date),
      metadata: {
        actorKind: "HUMAN",
        before: { publicWriteEnabled: true },
        after: { publicWriteEnabled: false },
        reason: changeReason,
        settingsKey: "global",
        changedFields: ["publicWriteEnabled"],
        settingsVersion: before.settingsVersion + 1,
        criticalRuntimeChanges: {
          publicWriteEnabled: { from: true, to: false },
        },
      },
    });

    await expect(
      updateGlobalSettings(integrationDatabase, actor(admin.id), {
        runtimeOperatingMode: "MAINTENANCE",
        expectedSettingsVersion: before.settingsVersion,
        changeReason: "Enter maintenance mode with an intentionally stale version.",
      }),
    ).rejects.toMatchObject({ code: "AGENT_SETTINGS_VERSION_CONFLICT", status: 409 });
    await expect(
      integrationDatabase.agentGlobalSettings.findUniqueOrThrow({ where: { id: "global" } }),
    ).resolves.toMatchObject({
      publicWriteEnabled: false,
      runtimeOperatingMode: "NORMAL",
      settingsVersion: before.settingsVersion + 1,
    });
  });

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
        where: { agentProfileId: profileId, eventType: "PERSONA_CHANGED" },
      }),
    ).toBe(1);
    expect(
      await integrationDatabase.agentRuntimeEvent.count({
        where: { agentProfileId: profileId, eventType: "LIFE_GENESIS_SNAPSHOT" },
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
      (
        await integrationDatabase.agentProfile.findUniqueOrThrow({
          where: { id: profileId },
          include: { user: true },
        })
      ).user.bio,
    ).toBe(initial.publicBio);
    expect(
      await integrationDatabase.agentPersonaVersion.count({ where: { agentProfileId: profileId } }),
    ).toBe(3);
    expect(
      await integrationDatabase.auditLog.count({
        where: { action: "agent.persona.versioned", entityId: profileId },
      }),
    ).toBe(2);
    expect(
      await integrationDatabase.outboxEvent.count({
        where: { eventType: "agent.persona.versioned", aggregateId: profileId },
      }),
    ).toBe(2);
    const personaLife = await integrationDatabase.agentRuntimeEvent.findMany({
      where: { agentProfileId: profileId, eventType: "PERSONA_CHANGED" },
      orderBy: { agentSequence: "asc" },
    });
    expect(personaLife).toHaveLength(3);
    expect(
      personaLife.slice(1).map(({ beforeState, afterState, changedFields, metadata }) => ({
        beforeState,
        afterState,
        changedFields,
        metadata,
      })),
    ).toEqual([
      {
        beforeState: { personaVersionId: initialVersionId, version: 1 },
        afterState: {
          personaVersionId: afterEdit.currentPersonaVersion!.id,
          version: 2,
        },
        changedFields: ["personaVersionId", "version"],
        metadata: { origin: "ADMIN", changeSummary: "Public bio netleştirildi." },
      },
      {
        beforeState: {
          personaVersionId: afterEdit.currentPersonaVersion!.id,
          version: 2,
        },
        afterState: { personaVersionId: rollback.id, version: 3 },
        changedFields: ["personaVersionId", "version"],
        metadata: { origin: "ROLLBACK", rollbackFromVersion: 1 },
      },
    ]);
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

  it("routes standalone public identity edits through immutable persona validation", async () => {
    const admin = await createPrincipal();
    const created = await createFirstAgent(admin.id);
    const profileId = created.agent.profile.id;
    const publicBio =
      "Dijital altyapının görünmeyen varsayımlarını, bakım yükünü ve kullanıcı etkisini birlikte inceler.";
    const displayName = "Katman İzci Güncel";

    await expect(
      updateAgent(
        integrationDatabase,
        actor(admin.id),
        profileId,
        updateAgentSchema.parse({
          publicBio,
          changeSummary: "Halka açık biyografi kontrollü olarak netleştirildi.",
        }),
      ),
    ).resolves.toMatchObject({ user: { bio: publicBio } });
    await expect(
      updateAgent(
        integrationDatabase,
        actor(admin.id),
        profileId,
        updateAgentSchema.parse({
          displayName,
          changeSummary: "Halka açık görünen ad kontrollü olarak netleştirildi.",
        }),
      ),
    ).resolves.toMatchObject({ user: { displayName } });

    const versions = await integrationDatabase.agentPersonaVersion.findMany({
      where: { agentProfileId: profileId },
      orderBy: { version: "asc" },
    });
    expect(versions).toHaveLength(3);
    expect(versions.at(-1)).toMatchObject({ version: 3, changeOrigin: "ADMIN" });
    expect(versions.at(-1)?.persona).toMatchObject({ publicBio, displayName });

    await expect(
      updateAgent(
        integrationDatabase,
        actor(admin.id),
        profileId,
        updateAgentSchema.parse({
          publicBio: "Ben bir insanım ve dijital kültür üzerine düşünüyorum.",
          changeSummary: "Unsafe standalone ontology delta test.",
        }),
      ),
    ).rejects.toMatchObject({ code: "PERSONA_ONTOLOGY_REJECTED" });
    expect(
      await integrationDatabase.agentPersonaVersion.count({ where: { agentProfileId: profileId } }),
    ).toBe(3);
  });

  it("rejects rollback when it would change a currently pinned persona field", async () => {
    const admin = await createPrincipal();
    const created = await createFirstAgent(admin.id);
    const profileId = created.agent.profile.id;
    const pinned = structuredClone(originalPersonaPack.personas[0]!);
    pinned.temperament.warmth = 0.45;
    pinned.evolution.pinnedFields.push("temperament.warmth");
    await updateAgent(
      integrationDatabase,
      actor(admin.id),
      profileId,
      updateAgentSchema.parse({
        persona: pinned,
        changeSummary: "Warmth alanı değiştirilip sonraki rollbackler için sabitlendi.",
      }),
    );

    await expect(
      updateAgent(
        integrationDatabase,
        actor(admin.id),
        profileId,
        updateAgentSchema.parse({
          persona: {
            ...pinned,
            temperament: { ...pinned.temperament, warmth: 0.46 },
          },
          changeSummary: "Admin edit ile pinned warmth alanını değiştirme denemesi.",
        }),
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      details: { reasonCode: "PERSONA_PINNED_FIELD_CHANGED" },
    });

    await expect(
      rollbackPersona(
        integrationDatabase,
        actor(admin.id),
        profileId,
        personaRollbackSchema.parse({
          version: 1,
          reason: "Pinned alanı bozacak eski sürüme dönme denemesi.",
        }),
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      details: { reasonCode: "PERSONA_PINNED_FIELD_CHANGED" },
    });
    expect(
      await integrationDatabase.agentPersonaVersion.count({ where: { agentProfileId: profileId } }),
    ).toBe(2);
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
    expect(
      await integrationDatabase.agentRuntimeEvent.count({
        where: { eventType: "runtime.production.activated" },
      }),
    ).toBe(0);

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
    expect(
      await integrationDatabase.agentRuntimeEvent.findFirstOrThrow({
        where: { eventType: "runtime.production.activated" },
      }),
    ).toMatchObject({
      agentProfileId: profileId,
      metadata: { trigger: "FIRST_AGENT_ACTIVE", timeZone: "Europe/Istanbul" },
    });
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
    expect(
      await integrationDatabase.agentRuntimeEvent.count({
        where: { eventType: "runtime.production.activated" },
      }),
    ).toBe(1);
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
    await expect(
      integrationDatabase.auditLog.groupBy({
        by: ["action"],
        where: {
          entityId: profileId,
          action: { in: ["agent.resumed", "agent.paused", "agent.retired"] },
        },
        _count: { _all: true },
        orderBy: { action: "asc" },
      }),
    ).resolves.toEqual([
      { action: "agent.paused", _count: { _all: 1 } },
      { action: "agent.resumed", _count: { _all: 2 } },
      { action: "agent.retired", _count: { _all: 1 } },
    ]);
    expect(
      await integrationDatabase.outboxEvent.count({
        where: {
          aggregateId: profileId,
          eventType: { in: ["agent.resumed", "agent.paused", "agent.retired"] },
        },
      }),
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
      promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
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
    await integrationDatabase.$transaction((transaction) =>
      createRuntimeCapabilityRecord(transaction, {
        ...capability,
        dualConcurrencySupported: true,
        measuredAt,
        staleAt: new Date(measuredAt.getTime() + 14 * 24 * 60 * 60 * 1000),
      }),
    );
    await expect(
      updateGlobalSettings(integrationDatabase, actor(admin.id), { codexConcurrency: 2 }),
    ).rejects.toMatchObject({ code: "AGENT_CAPABILITY_REQUIRED" });
    await expect(
      recordRuntimeCapability(
        integrationDatabase,
        actor(admin.id),
        capability,
        new Date(measuredAt.getTime() + 1),
      ),
    ).resolves.toMatchObject({
      capability: { dualConcurrencySupported: true },
      concurrencyDowngraded: false,
    });
    const liveFingerprintEvent = await integrationDatabase.agentRuntimeEvent.findFirstOrThrow({
      where: { eventType: "agent.capacity.measured" },
      orderBy: { id: "desc" },
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
        startedAt: liveFingerprintEvent.createdAt,
        finishedAt: new Date(liveFingerprintEvent.createdAt.getTime() + 500),
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
        promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
      },
      observedRuntimeFingerprint: {
        codexVersion: "codex-cli 3.0.0",
        promptProfileHash: "b".repeat(64),
      },
      benchmark: { stale: true, staleReasons: ["CODEX_MAJOR"] },
    });
    await expect(
      updateGlobalSettings(integrationDatabase, actor(admin.id), { codexConcurrency: 2 }),
    ).rejects.toMatchObject({ code: "AGENT_CAPABILITY_REQUIRED" });

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
    await integrationDatabase.$transaction(async (transaction) => {
      await createRuntimeCapabilityRecord(transaction, {
        codexVersion: "codex-cli 2.4.0",
        promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
        benchmarkRunCount: 10,
        p50DurationMs: 120_000,
        p75DurationMs: 180_000,
        p95DurationMs: 240_000,
        maxDurationMs: 300_000,
        successfulActionCount: 20,
        proposedEntryActionCount: 18,
        publishedEntries: 18,
        failureRate: 0,
        duplicateRetryRate: 0,
        singleProcessPeakRssMb: 400,
        dualProcessPeakRssMb: null,
        systemPeakMemoryMb: 3000,
        availableMemoryMb: 900,
        swapInMb: 0,
        swapOutMb: 0,
        loadAverage1m: 1,
        dualRunSuccessCount: 0,
        oomDetected: false,
        swapThrashingDetected: false,
        healthStable: true,
        readinessStable: true,
        appLatencyImpact: { baselineP95Ms: 50, measuredP95Ms: 50, stable: true },
        databaseLatencyImpact: { baselineP95Ms: 10, measuredP95Ms: 10, stable: true },
        capacityStatus: "HEALTHY",
        dualConcurrencySupported: false,
        measuredAt: new Date(now.getTime() - 60 * 60_000),
        staleAt: new Date(now.getTime() + 14 * 24 * 60 * 60_000),
      });
      await transaction.agentRuntimeEvent.create({
        data: {
          eventType: "agent.capacity.measured",
          safeMessage: "Capacity integration fingerprint fixture.",
          metadata: {
            codexVersion: "codex-cli 2.4.0",
            promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
          },
          createdAt: new Date(now.getTime() - 60 * 60_000),
        },
      });
    });
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
      const codexStartedAt = index === 0 ? new Date(now.getTime() - 60 * 60_000) : run.startedAt;
      const codexDurationMs = run.finishedAt.getTime() - codexStartedAt.getTime();
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
          usageMetadata: {
            durationMs: codexDurationMs,
            provider: "codex-cli",
            model: "codex-cli 2.4.0",
            promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
            codexIntervals: [
              {
                startedAt: codexStartedAt.toISOString(),
                finishedAt: run.finishedAt.toISOString(),
                durationMs: codexDurationMs,
              },
            ],
          },
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
        availableAt: oldestQueuedAt,
      },
    });
    await integrationDatabase.agentRun.create({
      data: {
        agentProfileId: created.agent.profile.id,
        personaVersionId: profile.currentPersonaVersionId!,
        runType: "NORMAL_WAKE",
        queuePriority: "SCHEDULED_CONTENT",
        trigger: "INTEGRATION_METRIC_FUTURE",
        idempotencyKey: "integration-metric-future-queued",
        timeoutSeconds: 600,
        desiredEntryMin: 2,
        desiredEntryMax: 3,
        createdAt: new Date(now.getTime() - 30 * 60_000),
        availableAt: new Date(now.getTime() + 60 * 60_000),
      },
    });
    const capacity = await getRuntimeCapacity(integrationDatabase, actor(admin.id), now);
    expect(capacity).toMatchObject({
      capacityStatus: "HEALTHY",
      queueLagMs: 20 * 60_000,
      estimatedCompletionDurationMs: 180_000,
      estimatedCompletionAt: new Date(now.getTime() + 180_000),
      estimationBasis: "P75",
      operational: {
        terminalRunsInErrorWindow: 3,
        failedRunsInErrorWindow: 2,
        eligibleQueuedRunCount: 1,
        oldestQueuedAt,
      },
      circuitBreakers: {
        runtimeErrorRate: 2 / 3,
        writeRunsPaused: true,
        runtimePaused: false,
        catchUpFrozen: false,
      },
    });
    expect(capacity.operational.utilization15m).toBeCloseTo(1, 5);
    expect(capacity.operational.utilization1h).toBeCloseTo(1, 5);
    expect(capacity.operational.utilization2h).toBeCloseTo(0.5, 4);
  });

  it("merges busy intervals per run while preserving parallel configured-window capacity", async () => {
    const admin = await createPrincipal();
    const first = await createFirstAgent(admin.id);
    const second = await createAgent(
      integrationDatabase,
      actor(admin.id),
      createAgentSchema.parse({
        persona: originalPersonaPack.personas[1],
        creation: {
          method: "TEMPLATE",
          templateUsername: originalPersonaPack.personas[1]!.username,
        },
      }),
    );
    const now = new Date("2026-07-18T12:00:00.000Z");
    const startedAt = new Date(now.getTime() - 30 * 60_000);
    for (const [index, created] of [first, second].entries())
      await integrationDatabase.agentRun.create({
        data: {
          agentProfileId: created.agent.profile.id,
          personaVersionId: created.agent.personaVersion.id,
          runType: "NORMAL_WAKE",
          runStatus: "SUCCEEDED",
          queuePriority: "SCHEDULED_CONTENT",
          trigger: "CONFIGURED_UTILIZATION_WINDOW_TEST",
          idempotencyKey: `configured-utilization:${index}:${randomUUID()}`,
          timeoutSeconds: 600,
          desiredEntryMin: 0,
          desiredEntryMax: 0,
          startedAt,
          finishedAt: now,
          usageMetadata: {
            provider: "codex-cli",
            durationMs: 30 * 60_000,
            codexIntervals: [
              {
                startedAt: startedAt.toISOString(),
                finishedAt: now.toISOString(),
                durationMs: 30 * 60_000,
              },
            ],
          },
        },
      });

    const operational = await inTransaction(integrationDatabase, async (transaction) => {
      const settings = await transaction.agentGlobalSettings.findUniqueOrThrow({
        where: { id: "global" },
        select: { circuitBreakerConfig: true },
      });
      const config = circuitBreakerConfigSchema.parse({
        ...(settings.circuitBreakerConfig as Record<string, unknown>),
        utilizationWindowMinutes: 30,
      });
      return getRuntimeOperationalMetrics(transaction, { now, concurrency: 2, config });
    });

    expect(operational.configuredWindowUtilization).toBeCloseTo(1, 5);
    expect(operational.utilization15m).toBeCloseTo(1, 5);
    expect(operational.utilization1h).toBeCloseTo(0.5, 5);
    expect(operational.utilization2h).toBeCloseTo(0.25, 5);
  });

  it("includes the current Codex phase but excludes non-Codex active run time", async () => {
    const admin = await createPrincipal();
    const created = await createFirstAgent(admin.id);
    const now = new Date("2026-07-18T12:00:00.000Z");
    const runStartedAt = new Date(now.getTime() - 10 * 60_000);
    const codexStartedAt = new Date(now.getTime() - 2 * 60_000);
    const run = await integrationDatabase.agentRun.create({
      data: {
        agentProfileId: created.agent.profile.id,
        personaVersionId: created.agent.personaVersion.id,
        runType: "NORMAL_WAKE",
        runStatus: "RUNNING",
        queuePriority: "SCHEDULED_CONTENT",
        trigger: "ACTIVE_CODEX_UTILIZATION_FIXTURE",
        idempotencyKey: "active-codex-utilization-fixture",
        timeoutSeconds: 900,
        desiredEntryMin: 2,
        desiredEntryMax: 3,
        startedAt: runStartedAt,
        leaseOwner: "capacity-metric-worker",
        leaseExpiresAt: new Date(now.getTime() + 60_000),
        heartbeatAt: codexStartedAt,
      },
    });
    await integrationDatabase.agentRuntimeState.update({
      where: { agentProfileId: created.agent.profile.id },
      data: {
        currentRunId: run.id,
        runtimeStatus: "THINKING",
        lastRunAt: runStartedAt,
        lastHeartbeatAt: codexStartedAt,
      },
    });
    await integrationDatabase.agentRuntimeEvent.create({
      data: {
        agentProfileId: created.agent.profile.id,
        runId: run.id,
        eventType: "agent.heartbeat",
        safeMessage: "Active Codex utilization fixture.",
        metadata: { runtimeStatus: "THINKING", cancelRequested: false },
        createdAt: codexStartedAt,
      },
    });

    const capacity = await getRuntimeCapacity(integrationDatabase, actor(admin.id), now);
    expect(capacity.operational.utilization15m).toBeCloseTo(2 / 15, 5);
    expect(capacity.operational.utilization1h).toBeCloseTo(2 / 60, 5);
    expect(capacity.operational.utilization2h).toBeCloseTo(2 / 120, 5);
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
    const trustAudit = await integrationDatabase.auditLog.findFirstOrThrow({
      where: {
        action: "agent.source.changed",
        entityType: "AgentSource",
        entityId: source.id,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(trustAudit.metadata).toMatchObject({
      changeOrigin: "ADMIN",
      scoreChanges: { trustScore: { from: 0.5, to: 0.56 } },
      before: { trustScore: 0.5 },
      after: { trustScore: 0.56 },
      weeklyScoreBudget: {
        timeZone: "Europe/Istanbul",
        fields: {
          trustScore: { usedBefore: 0, requested: 0.06, usedAfter: 0.06, bound: 0.1 },
        },
      },
    });
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
        where: { action: "agent.source.changed", entityId: source.id },
      }),
    ).toBe(2);
    expect(
      await integrationDatabase.outboxEvent.count({
        where: { eventType: "agent.source.changed", aggregateId: source.id },
      }),
    ).toBe(2);
    const sourceLife = (
      await integrationDatabase.agentRuntimeEvent.findMany({
        where: { agentProfileId: created.agent.profile.id, eventType: "SOURCE_STATE_CHANGED" },
        orderBy: { agentSequence: "asc" },
      })
    ).filter((event) => (event.subject as { id?: unknown } | null)?.id === source.id);
    expect(sourceLife).toHaveLength(2);
    expect(sourceLife[0]).toMatchObject({
      beforeState: {
        status: "PROBATION",
        adminPinned: false,
        adminBlocked: false,
        trustScore: 0.5,
      },
      afterState: {
        status: "TRUSTED",
        adminPinned: true,
        adminBlocked: false,
        trustScore: 0.56,
      },
      changedFields: ["adminPinned", "status", "trustScore"],
      metadata: {
        origin: "ADMIN",
        reason: "Admin source içeriğini inceleyip açık trusted onayı vermektedir.",
      },
    });
    expect(sourceLife[1]).toMatchObject({
      beforeState: {
        status: "TRUSTED",
        adminPinned: true,
        adminBlocked: false,
      },
      afterState: {
        status: "BLOCKED",
        adminPinned: false,
        adminBlocked: true,
      },
      changedFields: ["adminBlocked", "adminPinned", "status"],
      metadata: {
        origin: "ADMIN",
        reason: "Source güvenli fetch havuzundan çıkarılmak üzere admin tarafından block edilir.",
      },
    });
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
