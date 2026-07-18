import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ActorContext } from "@/modules/auth/domain/actor";
import {
  createAgent,
  createAgentSchema,
  forgetAgentMemory,
  forgetAgentMemorySchema,
  invalidateAgentMemory,
  invalidateAgentMemorySchema,
  listAgentMemories,
  reconsolidateAgentMemory,
  reconsolidateAgentMemorySchema,
} from "@/modules/agents";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import { getRuntimePerceptionRecords } from "@/modules/agents/repository/runtime";
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
      email: `memory-${role.toLowerCase()}-${suffix}@integration.test`,
      emailNormalized: `memory-${role.toLowerCase()}-${suffix}@integration.test`,
      username: `memory_${role.toLowerCase()}_${suffix.slice(0, 12)}`,
      usernameNormalized: `memory_${role.toLowerCase()}_${suffix.slice(0, 12)}`,
      displayName: `Memory ${role}`,
      passwordHash: "not-used",
      termsVersion: "1.0",
      termsAcceptedAt: new Date(),
    },
  });
}

function actor(
  id: string,
  role: "USER" | "MODERATOR" | "ADMIN" = "ADMIN",
  kind: "HUMAN" | "AGENT" = "HUMAN",
): ActorContext {
  return {
    actorId: id,
    actorKind: kind,
    actorRole: role,
    requestId: randomUUID(),
    origin: "API",
  };
}

async function createTestAgent(adminId: string, personaIndex = 0) {
  const persona = originalPersonaPack.personas[personaIndex]!;
  return createAgent(
    integrationDatabase,
    actor(adminId),
    createAgentSchema.parse({
      persona,
      creation: { method: "TEMPLATE", templateUsername: persona.username },
    }),
  );
}

function createMemory(
  agentProfileId: string,
  input: { evidence?: object; invalidatedAt?: Date; eventType?: string } = {},
) {
  return integrationDatabase.agentMemoryEpisode.create({
    data: {
      agentProfileId,
      eventType: input.eventType ?? "OBSERVATION_READ",
      summary: `Memory integration ${randomUUID()}`,
      salience: 0.7,
      provenance: input.evidence ? "AGENT_MEMORY" : "PLATFORM_EVENT",
      evidence: input.evidence ?? { evidenceIds: [randomUUID()] },
      invalidatedAt: input.invalidatedAt ?? null,
      occurredAt: new Date(),
    },
  });
}

beforeEach(resetIntegrationDatabase);
afterAll(closeIntegrationDatabase);

describe("agent memory lifecycle with PostgreSQL", () => {
  it("allows a HUMAN ADMIN to list and invalidate one episode, then excludes it from context", async () => {
    const admin = await createPrincipal();
    const created = await createTestAgent(admin.id);
    const profileId = created.agent.profile.id;
    const userId = created.agent.user.id;
    const memory = await createMemory(profileId);

    const [listed, total] = await listAgentMemories(
      integrationDatabase,
      actor(admin.id),
      profileId,
      { skip: 0, take: 50 },
    );
    expect(total).toBe(1);
    expect(listed[0]).toMatchObject({ id: memory.id, invalidatedAt: null, sourceMemoryIds: [] });

    await expect(
      invalidateAgentMemory(
        integrationDatabase,
        actor(admin.id),
        profileId,
        memory.id,
        invalidateAgentMemorySchema.parse({
          reason: "Bu episode yanlış provenance ile kaydedildi.",
          confirmation: "INVALIDATE_AGENT_MEMORY",
        }),
      ),
    ).resolves.toMatchObject({ memoryId: memory.id, affectedCount: 1 });

    const perception = await integrationDatabase.$transaction((transaction) =>
      getRuntimePerceptionRecords(transaction, {
        agentProfileId: profileId,
        agentUserId: userId,
        now: new Date(),
        includeSources: false,
        sourceFetchLimit: 8,
      }),
    );
    expect(perception.memories.map(({ id }) => id)).not.toContain(memory.id);
    expect(
      await integrationDatabase.auditLog.count({
        where: { action: "agent.memory.invalidated", entityId: memory.id },
      }),
    ).toBe(1);
    expect(
      await integrationDatabase.outboxEvent.count({
        where: { eventType: "agent.memory.invalidated", aggregateId: memory.id },
      }),
    ).toBe(1);
    expect(await integrationDatabase.agentMemoryEpisode.count()).toBe(1);
  });

  it("denies moderators and AGENT principals", async () => {
    const admin = await createPrincipal();
    const moderator = await createPrincipal("MODERATOR");
    const created = await createTestAgent(admin.id);
    const profileId = created.agent.profile.id;
    const memory = await createMemory(profileId);

    await expect(
      listAgentMemories(integrationDatabase, actor(moderator.id, "MODERATOR"), profileId, {
        skip: 0,
        take: 10,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      invalidateAgentMemory(
        integrationDatabase,
        actor(created.agent.user.id, "USER", "AGENT"),
        profileId,
        memory.id,
        invalidateAgentMemorySchema.parse({
          reason: "Agent kendi hafızasını admin endpointinden değiştiremez.",
          confirmation: "INVALIDATE_AGENT_MEMORY",
        }),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(
      await integrationDatabase.agentMemoryEpisode.findUniqueOrThrow({ where: { id: memory.id } }),
    ).toMatchObject({ invalidatedAt: null });
  });

  it("forgets the owned root and every active transitive descendant without crossing agents", async () => {
    const admin = await createPrincipal();
    const first = await createTestAgent(admin.id, 0);
    const second = await createTestAgent(admin.id, 1);
    const firstProfileId = first.agent.profile.id;
    const secondProfileId = second.agent.profile.id;
    const root = await createMemory(firstProfileId);
    const child = await createMemory(firstProfileId, {
      evidence: { sourceMemoryIds: [root.id] },
      eventType: "MEMORY_CONSOLIDATION",
      invalidatedAt: new Date(Date.now() - 60_000),
    });
    const grandchild = await createMemory(firstProfileId, {
      evidence: { sourceMemoryIds: [child.id] },
      eventType: "MEMORY_CONSOLIDATION",
    });
    const unrelated = await createMemory(firstProfileId);
    const foreign = await createMemory(secondProfileId, {
      evidence: { sourceMemoryIds: [root.id] },
      eventType: "MEMORY_CONSOLIDATION",
    });

    await expect(
      forgetAgentMemory(
        integrationDatabase,
        actor(admin.id),
        firstProfileId,
        root.id,
        forgetAgentMemorySchema.parse({
          reason: "Kök provenance geçersiz olduğu için bütün türevleri unutulmalı.",
          confirmation: "FORGET_AGENT_MEMORY",
        }),
      ),
    ).resolves.toMatchObject({
      rootMemoryId: root.id,
      affectedCount: 2,
      lineageCount: 3,
    });

    const records = await integrationDatabase.agentMemoryEpisode.findMany({
      where: { id: { in: [root.id, child.id, grandchild.id, unrelated.id, foreign.id] } },
      select: { id: true, invalidatedAt: true },
    });
    const byId = new Map(records.map((record) => [record.id, record.invalidatedAt]));
    expect(byId.get(root.id)).toBeInstanceOf(Date);
    expect(byId.get(child.id)).toBeInstanceOf(Date);
    expect(byId.get(grandchild.id)).toBeInstanceOf(Date);
    expect(byId.get(unrelated.id)).toBeNull();
    expect(byId.get(foreign.id)).toBeNull();
    expect(await integrationDatabase.agentMemoryEpisode.count()).toBe(5);

    await expect(
      forgetAgentMemory(
        integrationDatabase,
        actor(admin.id),
        firstProfileId,
        foreign.id,
        forgetAgentMemorySchema.parse({
          reason: "Başka agent hafızası bu agent üzerinden değiştirilemez.",
          confirmation: "FORGET_AGENT_MEMORY",
        }),
      ),
    ).rejects.toMatchObject({ code: "AGENT_MEMORY_NOT_FOUND" });
    expect(
      await integrationDatabase.auditLog.count({ where: { action: "agent.memory.forgotten" } }),
    ).toBe(1);
    expect(
      await integrationDatabase.outboxEvent.count({
        where: { eventType: "agent.memory.forgotten" },
      }),
    ).toBe(1);
  });

  it("queues exactly one confirmed non-public reconsolidation REFLECTION run", async () => {
    const admin = await createPrincipal();
    const created = await createTestAgent(admin.id);
    const profileId = created.agent.profile.id;
    await integrationDatabase.agentProfile.update({
      where: { id: profileId },
      data: { lifecycleStatus: "ACTIVE" },
    });
    const input = reconsolidateAgentMemorySchema.parse({
      reason: "Geçersiz episode sonrası aktif hafıza yeniden birleştirilmeli.",
      confirmation: "RECONSOLIDATE_AGENT_MEMORY",
    });
    const run = await reconsolidateAgentMemory(
      integrationDatabase,
      actor(admin.id),
      profileId,
      input,
    );
    expect(run).toMatchObject({
      runType: "REFLECTION",
      runStatus: "QUEUED",
      queuePriority: "REFLECTION",
      trigger: "ADMIN_MEMORY_RECONSOLIDATE",
      timeoutSeconds: 600,
    });
    expect(
      await integrationDatabase.agentRun.findUniqueOrThrow({ where: { id: run.id } }),
    ).toMatchObject({
      desiredEntryMin: 0,
      desiredEntryMax: 0,
      allowTopicCreation: false,
      allowVoting: false,
      allowFollowing: false,
      allowSourceReading: false,
    });
    await expect(
      reconsolidateAgentMemory(integrationDatabase, actor(admin.id), profileId, input),
    ).rejects.toMatchObject({ code: "AGENT_MEMORY_RECONSOLIDATION_PENDING" });
    expect(
      await integrationDatabase.agentRun.count({
        where: { agentProfileId: profileId, trigger: "ADMIN_MEMORY_RECONSOLIDATE" },
      }),
    ).toBe(1);
    expect(
      await integrationDatabase.auditLog.count({
        where: { action: "agent.run.queued", entityId: run.id },
      }),
    ).toBe(1);
    expect(
      await integrationDatabase.outboxEvent.count({
        where: { eventType: "agent.run.queued", aggregateId: run.id },
      }),
    ).toBe(1);
  });
});
