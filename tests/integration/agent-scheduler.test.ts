import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ActorContext } from "@/modules/auth/domain/actor";
import {
  changeAgentLifecycle,
  createAgent,
  createAgentSchema,
  createManualAgentRun,
  generateAgentDailyPlans,
  lifecycleChangeSchema,
  listAgentRuns,
  manualAgentRunSchema,
  updateGlobalSettings,
} from "@/modules/agents";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
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
      email: `scheduler-admin-${suffix}@integration.test`,
      emailNormalized: `scheduler-admin-${suffix}@integration.test`,
      username: `scheduler_${suffix.slice(0, 16)}`,
      usernameNormalized: `scheduler_${suffix.slice(0, 16)}`,
      displayName: "Scheduler admin",
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

beforeEach(resetIntegrationDatabase);
afterAll(closeIntegrationDatabase);

describe("agent daily scheduler with PostgreSQL", () => {
  it("creates deterministic idempotent plans after capacity evaluation", async () => {
    const admin = await createAdmin();
    const agents = await Promise.all(
      originalPersonaPack.personas
        .slice(0, 2)
        .map((persona) =>
          createAgent(integrationDatabase, actor(admin.id), createAgentSchema.parse({ persona })),
        ),
    );
    await updateGlobalSettings(integrationDatabase, actor(admin.id), {
      globalDailyEntryMin: 30,
      globalDailyEntryMax: 40,
    });
    for (const created of agents) {
      await changeAgentLifecycle(
        integrationDatabase,
        actor(admin.id),
        created.agent.profile.id,
        lifecycleChangeSchema.parse({
          status: "ACTIVE",
          reason: "Activate deterministic scheduler integration fixture.",
        }),
      );
    }
    const localDate = new Date("2026-07-18T00:00:00.000Z");
    const [first, replay] = await Promise.all([
      generateAgentDailyPlans(integrationDatabase, actor(admin.id), { localDate }),
      generateAgentDailyPlans(integrationDatabase, actor(admin.id), { localDate }),
    ]);
    expect(first.createdPlans + replay.createdPlans).toBe(2);
    expect(await integrationDatabase.agentDailyPlan.count({ where: { localDate } })).toBe(2);
    expect(await integrationDatabase.agentCapacitySnapshot.count({ where: { localDate } })).toBe(1);
    const plans = await integrationDatabase.agentDailyPlan.findMany({
      where: { localDate },
      include: { slots: { orderBy: { scheduledAt: "asc" } } },
    });
    for (const plan of plans) {
      expect(plan.entryTarget).toBeGreaterThanOrEqual(15);
      expect(plan.entryTarget).toBeLessThanOrEqual(20);
      expect(plan.slots.length).toBeGreaterThanOrEqual(6);
      expect(plan.slots.length).toBeLessThanOrEqual(8);
      expect(
        plan.slots.every(
          (slot, index) =>
            index === 0 ||
            slot.scheduledAt.getTime() - plan.slots[index - 1]!.scheduledAt.getTime() >=
              20 * 60_000,
        ),
      ).toBe(true);
    }
    expect(
      await integrationDatabase.agentRuntimeState.count({
        where: { todayDate: localDate, todayEntryTarget: { gte: 15, lte: 20 } },
      }),
    ).toBe(2);
    expect(
      await integrationDatabase.auditLog.count({ where: { action: "agent.schedule.generated" } }),
    ).toBe(1);
  });

  it("queues admin manual runs with safe mode-specific write boundaries", async () => {
    const admin = await createAdmin();
    const created = await createAgent(
      integrationDatabase,
      actor(admin.id),
      createAgentSchema.parse({ persona: originalPersonaPack.personas[0] }),
    );
    await updateGlobalSettings(integrationDatabase, actor(admin.id), {
      globalDailyEntryMin: 15,
      globalDailyEntryMax: 20,
    });
    await changeAgentLifecycle(
      integrationDatabase,
      actor(admin.id),
      created.agent.profile.id,
      lifecycleChangeSchema.parse({
        status: "ACTIVE",
        reason: "Activate manual run integration fixture.",
      }),
    );
    const normal = await createManualAgentRun(
      integrationDatabase,
      actor(admin.id),
      created.agent.profile.id,
      manualAgentRunSchema.parse({
        runType: "NORMAL_WAKE",
        entryTarget: 3,
        priority: "EMERGENCY",
        dailyMaximumOverride: true,
        adminInstruction: "Focus on current public platform context only.",
      }),
    );
    expect(normal).toMatchObject({
      runStatus: "QUEUED",
      queuePriority: "EMERGENCY_ADMIN",
      desiredEntryMin: 3,
      desiredEntryMax: 3,
      dailyMaximumOverride: true,
    });
    const readOnly = await createManualAgentRun(
      integrationDatabase,
      actor(admin.id),
      created.agent.profile.id,
      manualAgentRunSchema.parse({
        runType: "READ_ONLY",
        entryTarget: 0,
        allowTopicCreation: true,
        allowVoting: true,
        allowFollowing: true,
      }),
    );
    expect(readOnly).toMatchObject({
      desiredEntryMin: 0,
      desiredEntryMax: 0,
      allowTopicCreation: false,
      allowVoting: false,
      allowFollowing: false,
      allowSourceReading: true,
    });
    expect(
      await listAgentRuns(integrationDatabase, actor(admin.id), created.agent.profile.id),
    ).toHaveLength(2);
    expect(
      await integrationDatabase.auditLog.count({ where: { action: "agent.run.queued" } }),
    ).toBe(2);
  });
});
