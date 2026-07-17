import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

const passwordHash = "agent-data-model-test-hash";

async function createAdmin() {
  const suffix = randomUUID();
  return integrationDatabase.user.create({
    data: {
      kind: "HUMAN",
      role: "ADMIN",
      status: "ACTIVE",
      email: `admin-${suffix}@integration.test`,
      emailNormalized: `admin-${suffix}@integration.test`,
      username: `admin_${suffix.replaceAll("-", "").slice(0, 16)}`,
      usernameNormalized: `admin_${suffix.replaceAll("-", "").slice(0, 16)}`,
      displayName: "Agent model admin",
      passwordHash,
      termsVersion: "1.0",
      termsAcceptedAt: new Date(),
    },
  });
}

async function createAgentFixture() {
  const admin = await createAdmin();
  const suffix = randomUUID();
  const user = await integrationDatabase.user.create({
    data: {
      kind: "AGENT",
      role: "USER",
      status: "ACTIVE",
      email: `agent+${suffix}@invalid.local`,
      emailNormalized: `agent+${suffix}@invalid.local`,
      username: `agent_${suffix.replaceAll("-", "").slice(0, 16)}`,
      usernameNormalized: `agent_${suffix.replaceAll("-", "").slice(0, 16)}`,
      displayName: "Runtime account",
      passwordHash,
      loginDisabled: true,
      termsVersion: "1.0",
      termsAcceptedAt: new Date(),
    },
  });
  const profile = await integrationDatabase.agentProfile.create({
    data: {
      userId: user.id,
      lifecycleStatus: "PAUSED",
      activeTimeProfile: { timezone: "Europe/Istanbul", profile: "daytime" },
      createdById: admin.id,
      updatedById: admin.id,
    },
  });
  const persona = await integrationDatabase.agentPersonaVersion.create({
    data: {
      agentProfileId: profile.id,
      version: 1,
      persona: { displayName: "Runtime account", pinned: ["ontology-neutral"] },
      renderedPrompt: "Bu oturumda Runtime account kullanıcı adıyla akışı değerlendiriyorsun.",
      changeOrigin: "INITIAL",
      changeSummary: "Initial integration persona",
      createdById: admin.id,
      validationReport: { passed: true },
    },
  });
  await integrationDatabase.agentProfile.update({
    where: { id: profile.id },
    data: { currentPersonaVersionId: persona.id },
  });

  return { admin, user, profile, persona };
}

beforeEach(resetIntegrationDatabase);
afterAll(closeIntegrationDatabase);

describe("agent runtime data model with PostgreSQL", () => {
  it("rejects elevated or web-login-enabled AGENT accounts", async () => {
    const suffix = randomUUID();
    const base = {
      status: "ACTIVE" as const,
      email: `agent+${suffix}@invalid.local`,
      emailNormalized: `agent+${suffix}@invalid.local`,
      username: `agent_${suffix.replaceAll("-", "").slice(0, 16)}`,
      usernameNormalized: `agent_${suffix.replaceAll("-", "").slice(0, 16)}`,
      displayName: "Invalid runtime account",
      passwordHash,
      termsVersion: "1.0",
      termsAcceptedAt: new Date(),
    };

    await expect(
      integrationDatabase.user.create({
        data: { ...base, kind: "AGENT", role: "ADMIN", loginDisabled: true },
      }),
    ).rejects.toThrow();
    await expect(
      integrationDatabase.user.create({
        data: { ...base, kind: "AGENT", role: "USER", loginDisabled: false },
      }),
    ).rejects.toThrow();
  });

  it("persists a versioned persona and prevents history mutation", async () => {
    const { profile, persona } = await createAgentFixture();
    const current = await integrationDatabase.agentProfile.findUniqueOrThrow({
      where: { id: profile.id },
      include: { currentPersonaVersion: true },
    });

    expect(current.currentPersonaVersion?.id).toBe(persona.id);
    await expect(
      integrationDatabase.agentPersonaVersion.update({
        where: { id: persona.id },
        data: { changeSummary: "Attempted overwrite" },
      }),
    ).rejects.toThrow(/append-only/iu);
  });

  it("enforces a single active run per agent while allowing queued work", async () => {
    const { profile, persona } = await createAgentFixture();
    const runData = {
      agentProfileId: profile.id,
      runType: "NORMAL_WAKE" as const,
      runStatus: "RUNNING" as const,
      queuePriority: "MANUAL_SINGLE" as const,
      trigger: "INTEGRATION_TEST",
      personaVersionId: persona.id,
      timeoutSeconds: 600,
      desiredEntryMin: 2,
      desiredEntryMax: 3,
    };

    await integrationDatabase.agentRun.create({
      data: { ...runData, idempotencyKey: randomUUID() },
    });
    await expect(
      integrationDatabase.agentRun.create({
        data: { ...runData, idempotencyKey: randomUUID() },
      }),
    ).rejects.toThrow();
    await expect(
      integrationDatabase.agentRun.create({
        data: {
          ...runData,
          runStatus: "QUEUED",
          idempotencyKey: randomUUID(),
        },
      }),
    ).resolves.toMatchObject({ runStatus: "QUEUED" });
  });

  it("rejects self-follow at the database boundary", async () => {
    const { user } = await createAgentFixture();

    await expect(
      integrationDatabase.userFollow.create({
        data: { followerId: user.id, followedId: user.id },
      }),
    ).rejects.toThrow();
  });

  it("keeps action proposal fields immutable while recording lifecycle status", async () => {
    const { profile, persona } = await createAgentFixture();
    const run = await integrationDatabase.agentRun.create({
      data: {
        agentProfileId: profile.id,
        runType: "DRY_RUN",
        queuePriority: "MANUAL_SINGLE",
        trigger: "INTEGRATION_TEST",
        personaVersionId: persona.id,
        idempotencyKey: randomUUID(),
        timeoutSeconds: 600,
        desiredEntryMin: 0,
        desiredEntryMax: 0,
      },
    });
    const action = await integrationDatabase.agentAction.create({
      data: {
        runId: run.id,
        agentProfileId: profile.id,
        sequence: 1,
        actionType: "NO_ACTION",
        input: { safeReason: "No suitable action" },
      },
    });

    await expect(
      integrationDatabase.agentAction.update({
        where: { id: action.id },
        data: { input: { safeReason: "Rewritten proposal" } },
      }),
    ).rejects.toThrow(/immutable/iu);
    await expect(
      integrationDatabase.agentAction.update({
        where: { id: action.id },
        data: { actionStatus: "SUCCEEDED", result: { executed: true } },
      }),
    ).resolves.toMatchObject({ actionStatus: "SUCCEEDED" });
  });
});
