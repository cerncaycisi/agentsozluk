import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { createAgent, createAgentSchema } from "@/modules/agents";
import { runtimeSourceHolderLimit } from "@/modules/agents/domain/runtime-source-candidates";
import { everydayWriterPersonas } from "@/modules/agents/personas/everyday-writer-personas";
import { organicWriterPersonas } from "@/modules/agents/personas/organic-writer-personas";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import { requireTestDatabaseUrl } from "../../scripts/test-database-safety";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

/*
  Kaynak uzlaştırma betiği gerçek PostgreSQL üzerinde (Astra 2ff4b2a/93a6c17 bulguları):
  plan dışı kökenli fazla sahiplikler, etkin olmayan profillerin sahipliği, ajan için engelli
  kanonik paket kaynakları ve yeniden çalıştırmanın idempotentliği.
*/
const databaseUrl = requireTestDatabaseUrl(process.env.TEST_DATABASE_URL, "Integration tests");

function actor(id: string): ActorContext {
  return {
    actorId: id,
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
      email: `admin-${suffix}@integration.test`,
      emailNormalized: `admin-${suffix}@integration.test`,
      username: `admin_${suffix.slice(0, 16)}`,
      usernameNormalized: `admin_${suffix.slice(0, 16)}`,
      displayName: "ADMIN principal",
      passwordHash: "not-used",
      termsVersion: "1.0",
      termsAcceptedAt: new Date(),
    },
  });
}

function runReconcile(adminId: string): { status: number; output: Record<string, unknown> } {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/reconcile-persona-sources.ts"],
    {
      encoding: "utf8",
      timeout: 300_000,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        AGENT_OPERATOR_ADMIN_ID: adminId,
        AGENT_SOURCE_RECONCILE_CONFIRMATION: "RECONCILE_VERIFIED_PERSONA_SOURCES",
      },
    },
  );
  const line = result.stdout.trim().split("\n").at(-1) ?? "{}";
  expect(line.startsWith("{"), result.stderr).toBe(true);
  return { status: result.status ?? -1, output: JSON.parse(line) as Record<string, unknown> };
}

// Çalışma zamanı sayımıyla aynı: engelsiz, REJECTED/BLOCKED olmayan satırlar, tüm profiller.
async function activeHolders(): Promise<Map<string, number>> {
  const groups = await integrationDatabase.agentSource.groupBy({
    by: ["url"],
    where: { adminBlocked: false, status: { notIn: ["REJECTED", "BLOCKED"] } },
    _count: { _all: true },
  });
  return new Map(groups.map((group) => [group.url, group._count._all]));
}

async function activeSourceCount(agentProfileId: string): Promise<number> {
  return integrationDatabase.agentSource.count({
    where: { agentProfileId, adminBlocked: false, status: { notIn: ["REJECTED", "BLOCKED"] } },
  });
}

beforeEach(resetIntegrationDatabase);
afterAll(closeIntegrationDatabase);

describe("persona kaynak uzlaştırması PostgreSQL ile", () => {
  it("beş ajan sınırını çalışma zamanı sayımıyla sağlar, engelleri korur ve idempotenttir", async () => {
    const admin = await createAdmin();
    // createAgent yalnız DRAFT/PAUSED açar; ithal yazarlar kurulumda doğrudan etkinleştirilir.
    const create = async (persona: unknown, lifecycleStatus: "ACTIVE" | "PAUSED") => {
      const created = await createAgent(
        integrationDatabase,
        actor(admin.id),
        createAgentSchema.parse({ persona, lifecycleStatus: "PAUSED" }),
      );
      if (lifecycleStatus === "ACTIVE")
        await integrationDatabase.agentProfile.update({
          where: { id: created.agent.profile.id },
          data: { lifecycleStatus: "ACTIVE" },
        });
      return created;
    };
    const canonical = [];
    for (const persona of originalPersonaPack.personas)
      canonical.push(await create(persona, "PAUSED"));
    const importedPersonas = [...organicWriterPersonas, ...everydayWriterPersonas].slice(0, 14);
    const imported = [];
    for (const persona of importedPersonas.slice(0, 13))
      imported.push(await create(persona, "ACTIVE"));
    // Etkin olmayan ithal profil: hedef değil ama kaynakları çalışma zamanı sınırına sayılır.
    const paused = await create(importedPersonas[13], "PAUSED");
    const pausedUrl = (
      await integrationDatabase.agentSource.findFirstOrThrow({
        where: { agentProfileId: paused.agent.profile.id },
        orderBy: { url: "asc" },
      })
    ).url;

    // Yedi ithal ajan aynı kaynağı kendisi öğrenmiş (AGENT kökenli): sınır beşte kesilmeli.
    const learnedUrl = "https://www.arkitera.com/feed/";
    for (const agent of imported.slice(0, 7))
      await integrationDatabase.agentSource.upsert({
        where: {
          agentProfileId_url: { agentProfileId: agent.agent.profile.id, url: learnedUrl },
        },
        update: { addedByOrigin: "AGENT", adminBlocked: false, status: "SEED" },
        create: {
          agentProfileId: agent.agent.profile.id,
          url: learnedUrl,
          normalizedDomain: "www.arkitera.com",
          sourceType: "RSS",
          status: "SEED",
          topics: ["mimarlık"],
          trustScore: 0.5,
          interestScore: 0.5,
          noveltyScore: 0.5,
          usefulnessScore: 0.5,
          addedByOrigin: "AGENT",
        },
      });

    // Kanonik ajanın üç paket kaynağı yönetici engelli: engel korunmalı, ajan alt sınırda kalmalı.
    const canonicalProfileId = canonical[0]!.agent.profile.id;
    const blockedCanonical = originalPersonaPack.personas[0]!.sources.slice(0, 3).map(
      ({ url }) => url,
    );
    await integrationDatabase.agentSource.updateMany({
      where: { agentProfileId: canonicalProfileId, url: { in: blockedCanonical } },
      data: { status: "BLOCKED", adminBlocked: true, adminPinned: false },
    });
    await integrationDatabase.agentGlobalSettings.update({
      where: { id: "global" },
      data: { runtimeEnabled: false },
    });

    const first = runReconcile(admin.id);
    expect(first.status, JSON.stringify(first.output)).toBe(0);
    expect(first.output.status).toBe("SOURCE_RECONCILE_SUCCEEDED");

    const holders = await activeHolders();
    const canonicalPacks = new Map<string, number>();
    for (const [index, persona] of originalPersonaPack.personas.entries())
      for (const { url } of persona.sources)
        if (index !== 0 || !blockedCanonical.includes(url))
          canonicalPacks.set(url, (canonicalPacks.get(url) ?? 0) + 1);
    for (const [url, count] of holders)
      expect(count, url).toBeLessThanOrEqual(
        Math.max(runtimeSourceHolderLimit, canonicalPacks.get(url) ?? 0),
      );
    expect(holders.get(learnedUrl) ?? 0).toBeLessThanOrEqual(runtimeSourceHolderLimit);
    expect(holders.get(pausedUrl) ?? 0).toBeLessThanOrEqual(
      Math.max(runtimeSourceHolderLimit, canonicalPacks.get(pausedUrl) ?? 0),
    );

    for (const agent of [...canonical, ...imported])
      expect(await activeSourceCount(agent.agent.profile.id)).toBeGreaterThanOrEqual(10);
    const stillBlocked = await integrationDatabase.agentSource.findMany({
      where: { agentProfileId: canonicalProfileId, url: { in: blockedCanonical } },
      select: { adminBlocked: true, status: true },
    });
    expect(stillBlocked).toHaveLength(3);
    for (const row of stillBlocked) expect(row).toEqual({ adminBlocked: true, status: "BLOCKED" });
    // Etkin olmayan profilin kaynaklarına dokunulmaz.
    expect(
      await integrationDatabase.agentSource.count({
        where: { agentProfileId: paused.agent.profile.id, adminBlocked: true },
      }),
    ).toBe(0);

    const second = runReconcile(admin.id);
    expect(second.status, JSON.stringify(second.output)).toBe(0);
    expect(second.output).toMatchObject({
      status: "SOURCE_RECONCILE_SUCCEEDED",
      personaVersionsCreated: 0,
      sourcesCreated: 0,
      sourcesBlocked: 0,
    });
  }, 600_000);
});
