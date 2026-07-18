import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as planTodayRoute } from "@/app/api/v1/internal/agent-runtime/plans/today/route";
import type { ActorContext } from "@/modules/auth/domain/actor";
import {
  changeAgentLifecycle,
  createAgent,
  createAgentSchema,
  lifecycleChangeSchema,
  updateGlobalSettings,
} from "@/modules/agents";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import { RUNTIME_PROMPT_PROFILE_HASH } from "@/runtime/prompt-profile";
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
      email: `runtime-planner-${suffix}@integration.test`,
      emailNormalized: `runtime-planner-${suffix}@integration.test`,
      username: `planner_${suffix.slice(0, 16)}`,
      usernameNormalized: `planner_${suffix.slice(0, 16)}`,
      displayName: "Runtime planner admin",
      passwordHash: "not-used",
      termsVersion: "1.0",
      termsAcceptedAt: new Date(),
    },
  });
}

function planningRequest(credential: string, idempotencyKey = randomUUID()) {
  return new NextRequest("http://localhost/api/v1/internal/agent-runtime/plans/today", {
    method: "POST",
    headers: {
      authorization: `Bearer ${credential}`,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({ workerId: "integration-orchestrator" }),
  });
}

async function createFreshCapability(now: Date) {
  await integrationDatabase.agentRuntimeCapability.create({
    data: {
      codexVersion: "codex-cli 2.4.0",
      promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
      benchmarkRunCount: 10,
      p50DurationMs: 90_000,
      p75DurationMs: 120_000,
      p95DurationMs: 180_000,
      maxDurationMs: 240_000,
      singleProcessPeakRssMb: 400,
      dualConcurrencySupported: false,
      appLatencyImpact: { baselineP95Ms: 50, measuredP95Ms: 55, stable: true },
      databaseLatencyImpact: { baselineP95Ms: 10, measuredP95Ms: 12, stable: true },
      availableMemoryMb: 900,
      capacityStatus: "HEALTHY",
      measuredAt: now,
      staleAt: new Date(now.getTime() + 14 * 24 * 60 * 60_000),
    },
  });
  await integrationDatabase.agentRuntimeEvent.create({
    data: {
      eventType: "agent.capacity.measured",
      safeMessage: "Planner integration benchmark fingerprint observed.",
      metadata: {
        codexVersion: "codex-cli 2.4.0",
        promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
      },
      createdAt: now,
    },
  });
}

beforeEach(resetIntegrationDatabase);
afterAll(closeIntegrationDatabase);

describe("runtime-owned automatic daily planning with PostgreSQL", () => {
  it("requires runtime:plan and creates one idempotent current-day plan as the real AGENT actor", async () => {
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
        reason: "Activate automatic daily planning integration fixture.",
      }),
    );
    const credentialRecord = await integrationDatabase.agentCredential.findFirstOrThrow({
      where: { agentProfileId: created.agent.profile.id, revokedAt: null },
    });
    await integrationDatabase.agentCredential.update({
      where: { id: credentialRecord.id },
      data: { scopes: ["runtime:lease", "runtime:read", "runtime:write"] },
    });

    const denied = await planTodayRoute(planningRequest(created.credential));
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ error: { code: "FORBIDDEN" } });

    await integrationDatabase.agentCredential.update({
      where: { id: credentialRecord.id },
      data: {
        scopes: ["runtime:lease", "runtime:read", "runtime:write", "runtime:plan"],
      },
    });
    await createFreshCapability(new Date());

    const [left, right] = await Promise.all([
      planTodayRoute(planningRequest(created.credential)),
      planTodayRoute(planningRequest(created.credential)),
    ]);
    expect([left.status, right.status]).toEqual([200, 200]);
    const results = await Promise.all([left.json(), right.json()]);
    expect(
      results.map((body) => body.data.createdPlans).reduce((sum, value) => sum + value, 0),
    ).toBe(1);
    expect(results.every((body) => body.data.blocked === false)).toBe(true);

    expect(await integrationDatabase.agentDailyPlan.count()).toBe(1);
    expect(await integrationDatabase.agentCapacitySnapshot.count()).toBe(1);
    expect(
      await integrationDatabase.auditLog.findFirstOrThrow({
        where: { action: "agent.schedule.generated" },
        select: { actorId: true },
      }),
    ).toEqual({ actorId: created.agent.user.id });
    expect(
      await integrationDatabase.outboxEvent.findFirstOrThrow({
        where: { eventType: "agent.schedule.generated" },
        select: { actorKind: true },
      }),
    ).toEqual({ actorKind: "AGENT" });
  });
});
