import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActorContext } from "@/modules/auth/domain/actor";
import {
  changeAgentLifecycle,
  createAgent,
  createAgentSchema,
  lifecycleChangeSchema,
  runRuntimeStochasticTick,
} from "@/modules/agents";
import type { RuntimePrincipal } from "@/modules/agents/application/runtime-auth";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import { createTopicWithFirstEntry } from "@/modules/topics";
import { AgentRuntimeWorker } from "@/runtime/worker";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "../integration/database";
import { FakeCodexProvider, InProcessRuntimeControlPlane } from "./runtime-harness";

async function createAdmin() {
  const suffix = randomUUID().replaceAll("-", "");
  return integrationDatabase.user.create({
    data: {
      kind: "HUMAN",
      role: "ADMIN",
      status: "ACTIVE",
      email: `simulation-admin-${suffix}@integration.test`,
      emailNormalized: `simulation-admin-${suffix}@integration.test`,
      username: `simulation_${suffix.slice(0, 16)}`,
      usernameNormalized: `simulation_${suffix.slice(0, 16)}`,
      displayName: "Simulation admin",
      passwordHash: "not-used",
      termsVersion: "1.0",
      termsAcceptedAt: new Date(),
    },
  });
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

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-07-15T21:00:00.000Z"));
  await resetIntegrationDatabase();
});

afterAll(async () => {
  vi.useRealTimers();
  await closeIntegrationDatabase();
});

describe("accelerated 24-hour stochastic agent society simulation", () => {
  it("keeps ten agents flowing without daily targets, plans, slots or catch-up", async () => {
    const admin = await createAdmin();
    for (let index = 0; index < 30; index += 1)
      await createTopicWithFirstEntry(integrationDatabase, actor(admin.id), {
        title: `Simülasyon topic ${index + 1} ${randomUUID().slice(0, 8)}`,
        entryBody: `Simülasyon perception girdisi ${index + 1} için yeterince uzun insan entry metni.`,
      });

    const createdAgents = [];
    for (const persona of originalPersonaPack.personas) {
      const created = await createAgent(
        integrationDatabase,
        actor(admin.id),
        createAgentSchema.parse({ persona, lifecycleStatus: "PAUSED" }),
      );
      createdAgents.push(created);
      await changeAgentLifecycle(
        integrationDatabase,
        actor(admin.id),
        created.agent.profile.id,
        lifecycleChangeSchema.parse({
          status: "ACTIVE",
          reason: "Accelerated stochastic simulation activation.",
        }),
      );
    }

    const schedulerAgent = createdAgents[0]!;
    const schedulerCredential = await integrationDatabase.agentCredential.findFirstOrThrow({
      where: { agentProfileId: schedulerAgent.agent.profile.id },
      select: { id: true },
    });
    const schedulerPrincipal = (requestId: string): RuntimePrincipal => ({
      credentialId: schedulerCredential.id,
      agentProfileId: schedulerAgent.agent.profile.id,
      lifecycleStatus: "ACTIVE",
      actor: {
        actorId: schedulerAgent.agent.user.id,
        actorKind: "AGENT",
        actorRole: "USER",
        requestId,
        origin: "AGENT",
      },
    });
    const worker = new AgentRuntimeWorker({
      workerId: "simulation-worker",
      credentials: createdAgents.map(({ credential }) => credential),
      controlPlane: new InProcessRuntimeControlPlane(integrationDatabase),
      provider: new FakeCodexProvider(),
      heartbeatIntervalMs: 60_000,
      pollIntervalMs: 1000,
    });

    let createdRunCount = 0;
    const skipReasons = new Map<string, number>();
    const start = new Date("2026-07-15T21:00:00.000Z").getTime();
    for (let minute = 0; minute < 24 * 60; minute += 10) {
      const now = new Date(start + minute * 60_000);
      vi.setSystemTime(now);
      const tick = await runRuntimeStochasticTick(
        integrationDatabase,
        schedulerPrincipal(randomUUID()),
        { workerId: "simulation-society-tick" },
        now,
      );
      if (!("createdRuns" in tick)) throw new Error("SIMULATION_ROLLOUT_GUARD_BLOCKED");
      createdRunCount += tick.createdRuns;
      if (tick.skipReason)
        skipReasons.set(tick.skipReason, (skipReasons.get(tick.skipReason) ?? 0) + 1);

      const openRunCount = await integrationDatabase.agentRun.count({
        where: { runStatus: { in: ["QUEUED", "RUNNING", "CANCEL_REQUESTED"] } },
      });
      if (openRunCount > 0) expect(await worker.runOnce()).toBeGreaterThan(0);
    }

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const openRunCount = await integrationDatabase.agentRun.count({
        where: { runStatus: { in: ["QUEUED", "RUNNING", "CANCEL_REQUESTED"] } },
      });
      if (openRunCount === 0) break;
      expect(await worker.runOnce()).toBeGreaterThan(0);
    }

    const [content, runs, settings] = await Promise.all([
      integrationDatabase.agentContentRecord.findMany({
        include: { entry: { select: { normalizedBody: true } } },
      }),
      integrationDatabase.agentRun.findMany({
        select: { agentProfileId: true, runType: true, runStatus: true, trigger: true },
      }),
      integrationDatabase.agentGlobalSettings.findUniqueOrThrow({ where: { id: "global" } }),
    ]);
    const representedAgents = new Set(content.map(({ agentProfileId }) => agentProfileId));
    const stochasticRuns = runs.filter(({ trigger }) => trigger === "STOCHASTIC_TICK");

    expect(createdRunCount).toBeGreaterThan(0);
    expect(stochasticRuns).toHaveLength(createdRunCount);
    expect(representedAgents.size).toBe(10);
    expect(content.length).toBeGreaterThanOrEqual(10);
    expect(new Set(content.map(({ entry }) => entry.normalizedBody)).size).toBe(content.length);
    expect(
      stochasticRuns.filter(({ runStatus }) =>
        ["QUEUED", "RUNNING", "CANCEL_REQUESTED"].includes(runStatus),
      ),
    ).toHaveLength(0);
    expect(stochasticRuns.every(({ runType }) => runType === "NORMAL_WAKE")).toBe(true);
    expect(
      runs.every(({ runType }) =>
        ["NORMAL_WAKE", "REFLECTION", "SOURCE_REFRESH"].includes(runType),
      ),
    ).toBe(true);
    expect(runs.filter(({ runStatus }) => runStatus === "FAILED")).toHaveLength(0);
    expect(await integrationDatabase.agentDailyPlan.count()).toBe(0);
    expect(await integrationDatabase.agentScheduleSlot.count()).toBe(0);
    expect(await integrationDatabase.agentRun.count({ where: { runType: "DAILY_CATCH_UP" } })).toBe(
      0,
    );
    expect(settings).toMatchObject({ runtimeEnabled: true, schedulerEnabled: true });
    expect(skipReasons.get("QUIET_WINDOW") ?? 0).toBeGreaterThan(0);
  }, 180_000);
});
