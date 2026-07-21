import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ActorContext } from "@/modules/auth/domain/actor";
import {
  changeAgentLifecycle,
  createAgent,
  createAgentSchema,
  lifecycleChangeSchema,
  leaseRuntimeRun,
  runRuntimeStochasticTick,
  runtimeLeaseSchema,
  updateGlobalSettings,
} from "@/modules/agents";
import type { RuntimePrincipal } from "@/modules/agents/application/runtime-auth";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
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
      email: `stochastic-${suffix}@integration.test`,
      emailNormalized: `stochastic-${suffix}@integration.test`,
      username: `stochastic_${suffix.slice(0, 16)}`,
      usernameNormalized: `stochastic_${suffix.slice(0, 16)}`,
      displayName: "Stochastic scheduler admin",
      passwordHash: "not-used",
      termsVersion: "1.0",
      termsAcceptedAt: new Date(),
    },
  });
}

beforeEach(resetIntegrationDatabase);
afterAll(closeIntegrationDatabase);

describe("stochastic society scheduler with PostgreSQL", () => {
  it("queues only available capacity once without a daily plan or benchmark", async () => {
    const admin = await createAdmin();
    const actor = adminActor(admin.id);
    const agents: Awaited<ReturnType<typeof createAgent>>[] = [];
    for (const persona of originalPersonaPack.personas.slice(0, 3))
      agents.push(
        await createAgent(
          integrationDatabase,
          { ...actor, requestId: randomUUID() },
          createAgentSchema.parse({ persona }),
        ),
      );
    await updateGlobalSettings(
      integrationDatabase,
      { ...actor, requestId: randomUUID() },
      {
        defaultDailyEntryMin: 0,
        defaultDailyEntryMax: 20,
        globalDailyEntryMin: 0,
        globalDailyEntryMax: 60,
        codexConcurrency: 1,
      },
    );
    for (const agent of agents)
      await changeAgentLifecycle(
        integrationDatabase,
        { ...actor, requestId: randomUUID() },
        agent.agent.profile.id,
        lifecycleChangeSchema.parse({
          status: "ACTIVE",
          reason: "Activate stochastic scheduler integration fixture.",
        }),
      );

    const credential = await integrationDatabase.agentCredential.findFirstOrThrow({
      where: { agentProfileId: agents[0]!.agent.profile.id },
    });
    const principal = (requestId: string): RuntimePrincipal => ({
      credentialId: credential.id,
      agentProfileId: agents[0]!.agent.profile.id,
      lifecycleStatus: "ACTIVE",
      actor: {
        actorId: agents[0]!.agent.user.id,
        actorKind: "AGENT",
        actorRole: "USER",
        requestId,
        origin: "AGENT",
      },
    });
    const now = new Date("2026-07-21T08:00:00.000Z");
    const [left, right] = await Promise.all([
      runRuntimeStochasticTick(
        integrationDatabase,
        principal(randomUUID()),
        { workerId: "integration-society" },
        now,
      ),
      runRuntimeStochasticTick(
        integrationDatabase,
        principal(randomUUID()),
        { workerId: "integration-society" },
        now,
      ),
    ]);

    if (!("createdRuns" in left) || !("createdRuns" in right))
      throw new Error("Integration tick rollout guard tarafından beklenmedik biçimde durduruldu.");

    expect([left, right].map((result) => result.createdRuns).sort()).toEqual([0, 1]);
    expect(await integrationDatabase.agentRun.count()).toBe(1);
    expect(await integrationDatabase.agentDailyPlan.count()).toBe(0);
    expect(await integrationDatabase.agentRuntimeCapability.count()).toBe(0);
    expect(
      await integrationDatabase.agentRun.findFirstOrThrow({
        select: {
          runType: true,
          trigger: true,
          desiredEntryMin: true,
          desiredEntryMax: true,
          saturationOverride: true,
          dailyMaximumOverride: true,
        },
      }),
    ).toEqual({
      runType: "NORMAL_WAKE",
      trigger: "STOCHASTIC_TICK",
      desiredEntryMin: 0,
      desiredEntryMax: 1,
      saturationOverride: false,
      dailyMaximumOverride: false,
    });
    expect(
      await integrationDatabase.agentRuntimeEvent.count({
        where: { eventType: "scheduler.stochastic_tick" },
      }),
    ).toBe(1);
    expect(
      await integrationDatabase.outboxEvent.count({ where: { eventType: "agent.run.queued" } }),
    ).toBe(1);

    const queuedRun = await integrationDatabase.agentRun.findFirstOrThrow({
      include: {
        agentProfile: {
          include: {
            user: true,
            credentials: { where: { revokedAt: null }, take: 1 },
          },
        },
      },
    });
    const selectedCredential = queuedRun.agentProfile.credentials[0];
    if (!selectedCredential) throw new Error("Seçilen integration agent credential'ı bulunamadı.");
    const lease = await leaseRuntimeRun(
      integrationDatabase,
      {
        credentialId: selectedCredential.id,
        agentProfileId: queuedRun.agentProfileId,
        lifecycleStatus: "ACTIVE",
        actor: {
          actorId: queuedRun.agentProfile.user.id,
          actorKind: "AGENT",
          actorRole: "USER",
          requestId: randomUUID(),
          origin: "AGENT",
        },
      },
      runtimeLeaseSchema.parse({ workerId: "integration-society", leaseSeconds: 60 }),
    );
    expect(lease.run?.id).toBe(queuedRun.id);

    await integrationDatabase.$transaction([
      integrationDatabase.agentRun.update({
        where: { id: queuedRun.id },
        data: {
          runStatus: "SUCCEEDED",
          finishedAt: now,
          leaseOwner: null,
          leaseToken: null,
          leaseExpiresAt: null,
        },
      }),
      integrationDatabase.agentRuntimeState.update({
        where: { agentProfileId: queuedRun.agentProfileId },
        data: { currentRunId: null, runtimeStatus: "SUCCEEDED" },
      }),
    ]);
    const replayedTick = await runRuntimeStochasticTick(
      integrationDatabase,
      principal(randomUUID()),
      { workerId: "second-integration-society" },
      now,
    );
    if (!("createdRuns" in replayedTick))
      throw new Error("Replayed integration tick rollout guard tarafından durduruldu.");
    expect(replayedTick).toMatchObject({
      createdRuns: 0,
      skipReason: "TICK_ALREADY_PROCESSED",
    });
    expect(
      await integrationDatabase.agentRun.count({ where: { trigger: "STOCHASTIC_TICK" } }),
    ).toBe(1);
  });
});
