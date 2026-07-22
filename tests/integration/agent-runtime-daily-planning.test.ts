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

beforeEach(resetIntegrationDatabase);
afterAll(closeIntegrationDatabase);

describe("retired runtime daily planning with PostgreSQL", () => {
  it("requires runtime:plan, then returns 410 without creating a plan", async () => {
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
    const retired = await planTodayRoute(planningRequest(created.credential));
    expect(retired.status).toBe(410);
    expect(await retired.json()).toMatchObject({
      error: { code: "AGENT_DAILY_PLANNING_RETIRED" },
    });
    expect(await integrationDatabase.agentDailyPlan.count()).toBe(0);
    expect(await integrationDatabase.agentCapacitySnapshot.count()).toBe(0);
  });
});
