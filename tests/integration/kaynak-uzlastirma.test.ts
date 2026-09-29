import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { createAgent, createAgentSchema } from "@/modules/agents";
import {
  runtimeAgentSourceLimit,
  runtimeSourceHolderLimit,
} from "@/modules/agents/domain/runtime-source-candidates";
import { everydayWriterPersonas } from "@/modules/agents/personas/everyday-writer-personas";
import { organicWriterPersonas } from "@/modules/agents/personas/organic-writer-personas";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import { lockAgentProfile } from "@/modules/agents/repository/control-plane";
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

function reconcileEnvironment(adminId: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DATABASE_URL: databaseUrl,
    AGENT_OPERATOR_ADMIN_ID: adminId,
    AGENT_SOURCE_RECONCILE_CONFIRMATION: "RECONCILE_VERIFIED_PERSONA_SOURCES",
  };
}

function startReconcile(adminId: string): Promise<{ status: number; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "scripts/reconcile-persona-sources.ts"],
      {
        env: reconcileEnvironment(adminId),
      },
    );
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.on("close", (code) => resolve({ status: code ?? -1, stdout }));
  });
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

// createAgent yalnız DRAFT/PAUSED açar; ithal yazarlar kurulumda doğrudan etkinleştirilir.
async function createWriter(
  adminId: string,
  persona: unknown,
  lifecycleStatus: "ACTIVE" | "PAUSED",
) {
  const created = await createAgent(
    integrationDatabase,
    actor(adminId),
    createAgentSchema.parse({ persona, lifecycleStatus: "PAUSED" }),
  );
  if (lifecycleStatus === "ACTIVE")
    await integrationDatabase.agentProfile.update({
      where: { id: created.agent.profile.id },
      data: { lifecycleStatus: "ACTIVE" },
    });
  return created;
}

async function addOutsideSource(
  agentProfileId: string,
  url: string,
  addedByOrigin: "AGENT" | "OPERATOR_MANIFOLD_BACKFILL" = "AGENT",
) {
  await integrationDatabase.agentSource.upsert({
    where: { agentProfileId_url: { agentProfileId, url } },
    update: { addedByOrigin, adminBlocked: false, status: "SEED" },
    create: {
      agentProfileId,
      url,
      normalizedDomain: new URL(url).hostname,
      sourceType: "RSS",
      status: "SEED",
      topics: ["gündem"],
      trustScore: 0.5,
      interestScore: 0.5,
      noveltyScore: 0.5,
      usefulnessScore: 0.5,
      addedByOrigin,
    },
  });
}

beforeEach(resetIntegrationDatabase);
afterAll(closeIntegrationDatabase);

describe("persona kaynak uzlaştırması PostgreSQL ile", () => {
  it("beş ajan sınırını çalışma zamanı sayımıyla sağlar, engelleri korur ve idempotenttir", async () => {
    const admin = await createAdmin();
    const create = (persona: unknown, lifecycleStatus: "ACTIVE" | "PAUSED") =>
      createWriter(admin.id, persona, lifecycleStatus);
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
      await addOutsideSource(agent.agent.profile.id, learnedUrl);
    // Bir ajan 25 farklı kaynağı kendisi eklemiş: plan ile birlikte stok sınırı (25) korunmalı.
    const hoarder = imported[12]!.agent.profile.id;
    for (let index = 0; index < 25; index += 1)
      await addOutsideSource(hoarder, `https://kaynak-${index}.example.org/feed`);

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

    for (const agent of [...canonical, ...imported]) {
      const count = await activeSourceCount(agent.agent.profile.id);
      expect(count).toBeGreaterThanOrEqual(10);
      expect(count).toBeLessThanOrEqual(runtimeAgentSourceLimit);
    }
    // Stok kırpması nedeniyle engellenenler ayrı kayıtlı: sahip sınırı nedeniyle değil.
    const hoarderAudit = await integrationDatabase.auditLog.findFirstOrThrow({
      where: { action: "agent.sources.reconciled", entityId: hoarder },
    });
    expect(hoarderAudit.metadata).toMatchObject({ blockedStockLimit: expect.any(Number) });
    expect(
      (hoarderAudit.metadata as { blockedStockLimit: number }).blockedStockLimit,
    ).toBeGreaterThan(0);
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

  it("giderilemeyecek sahiplik aşımında hiçbir değişikliği kalıcılaştırmaz", async () => {
    const admin = await createAdmin();
    for (const persona of originalPersonaPack.personas)
      await createWriter(admin.id, persona, "PAUSED");
    for (const persona of organicWriterPersonas.slice(0, 4))
      await createWriter(admin.id, persona, "ACTIVE");
    // Altı kanonik pakette sabit olan kaynağı hedef dışı bir profil de tutuyor: 7 > 6.
    const shared = "https://turkiye.un.org/tr/stories/rss.xml";
    expect(
      originalPersonaPack.personas.filter(({ sources }) =>
        sources.some(({ url }) => url === shared),
      ).length,
    ).toBe(6);
    const outsider = await createWriter(admin.id, everydayWriterPersonas[0], "PAUSED");
    await addOutsideSource(outsider.agent.profile.id, shared, "OPERATOR_MANIFOLD_BACKFILL");
    await integrationDatabase.agentGlobalSettings.update({
      where: { id: "global" },
      data: { runtimeEnabled: false },
    });
    const snapshot = async () => ({
      sources: await integrationDatabase.agentSource.findMany({
        orderBy: { id: "asc" },
        select: { id: true, status: true, adminBlocked: true, adminPinned: true },
      }),
      personaVersions: await integrationDatabase.agentPersonaVersion.count(),
    });
    const before = await snapshot();

    const run = runReconcile(admin.id);
    expect(run.status).toBe(1);
    expect(run.output).toMatchObject({
      status: "SOURCE_RECONCILE_LIMIT_VIOLATED_ROLLED_BACK",
      holderLimitViolations: [{ url: shared, holders: 7, canonicalPacks: 6 }],
    });
    expect(await snapshot()).toEqual(before);
  }, 600_000);

  it("profil kilidini beklerken commit edilen yönetici değişikliğini görür ve geri alır", async () => {
    const admin = await createAdmin();
    for (const persona of originalPersonaPack.personas)
      await createWriter(admin.id, persona, "PAUSED");
    for (const persona of organicWriterPersonas.slice(0, 4))
      await createWriter(admin.id, persona, "ACTIVE");
    const shared = "https://turkiye.un.org/tr/stories/rss.xml";
    const outsider = await createWriter(admin.id, everydayWriterPersonas[0], "PAUSED");
    await addOutsideSource(outsider.agent.profile.id, shared, "OPERATOR_MANIFOLD_BACKFILL");
    await integrationDatabase.agentSource.update({
      where: { agentProfileId_url: { agentProfileId: outsider.agent.profile.id, url: shared } },
      data: { status: "BLOCKED", adminBlocked: true },
    });
    await integrationDatabase.agentGlobalSettings.update({
      where: { id: "global" },
      data: { runtimeEnabled: false },
    });
    const personaVersionsBefore = await integrationDatabase.agentPersonaVersion.count();

    // Yönetici hedef dışı profilin kilidini tutarken uzlaştırma başlar; engel kaldırılıp commit
    // edildikten sonra kilidi alan uzlaştırma güncel durumu görmeli: 7 sahip, geri alma.
    let reconcile: Promise<{ status: number; stdout: string }> | undefined;
    await integrationDatabase.$transaction(
      async (transaction) => {
        await lockAgentProfile(transaction, outsider.agent.profile.id);
        reconcile = startReconcile(admin.id);
        // Uzlaştırma bu kilidi gerçekten bekleyene kadar dur: sabit süre yüklü ortamda yetmez
        // ve değişiklik önceden commit edilirse eski (SERIALIZABLE) davranış da geçerdi.
        const deadline = Date.now() + 120_000;
        for (;;) {
          const [{ waiting }] = await integrationDatabase.$queryRaw<[{ waiting: bigint }]>`
            SELECT count(*) AS waiting FROM pg_locks
            WHERE locktype = 'advisory' AND NOT granted AND database = (
              SELECT oid FROM pg_database WHERE datname = current_database()
            )`;
          if (waiting > 0n) break;
          if (Date.now() > deadline) throw new Error("RECONCILE_NEVER_WAITED_FOR_PROFILE_LOCK");
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        await transaction.agentSource.update({
          where: {
            agentProfileId_url: { agentProfileId: outsider.agent.profile.id, url: shared },
          },
          data: { status: "SEED", adminBlocked: false },
        });
      },
      { timeout: 60_000 },
    );
    const result = await reconcile!;
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout.trim().split("\n").at(-1)!)).toMatchObject({
      status: "SOURCE_RECONCILE_LIMIT_VIOLATED_ROLLED_BACK",
      holderLimitViolations: [{ url: shared, holders: 7, canonicalPacks: 6 }],
    });
    expect(await integrationDatabase.agentPersonaVersion.count()).toBe(personaVersionsBefore);
  }, 600_000);
});
