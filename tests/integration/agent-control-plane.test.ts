import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loginHuman } from "@/modules/auth/application/authenticate";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { hashPassword } from "@/modules/auth/domain/password";
import {
  changeAgentLifecycle,
  createAgent,
  createAgentSchema,
  lifecycleChangeSchema,
  personaRollbackSchema,
  rollbackPersona,
  updateAgent,
  updateAgentSchema,
  updateGlobalSettings,
} from "@/modules/agents";
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
});
