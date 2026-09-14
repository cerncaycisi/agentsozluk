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
} from "@/modules/agents";
import type { RuntimePrincipal } from "@/modules/agents/application/runtime-auth";
import {
  recordEffectiveConcurrencyDecision,
  resolveEffectiveRuntimeConcurrency,
} from "@/modules/agents/application/runtime-concurrency";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";
import { measureDualLanes } from "./fixtures/runtime-capability";

/*
  F02: lease ve scheduler artık istenen eşzamanlılığı değil, KANITLANMIŞ
  eşzamanlılığı uyguluyor. Birim testler karar hesabını inceliyor; burada
  gerçek PostgreSQL üzerinde kilitleme, admission ve kuyruk tüketimi
  doğrulanıyor (Astra hakem turu, 14 Eylül).
*/

const NOW = new Date("2026-07-21T08:00:00.000Z");

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
      email: `evidence-${suffix}@integration.test`,
      emailNormalized: `evidence-${suffix}@integration.test`,
      username: `evidence_${suffix.slice(0, 16)}`,
      usernameNormalized: `evidence_${suffix.slice(0, 16)}`,
      displayName: "Concurrency evidence admin",
      passwordHash: "not-used",
      termsVersion: "1.0",
      termsAcceptedAt: new Date(),
    },
  });
}

async function createActiveAgents(count: number) {
  const admin = await createAdmin();
  const actor = adminActor(admin.id);
  const agents: Awaited<ReturnType<typeof createAgent>>[] = [];
  for (const persona of originalPersonaPack.personas.slice(0, count))
    agents.push(
      await createAgent(
        integrationDatabase,
        { ...actor, requestId: randomUUID() },
        createAgentSchema.parse({ persona }),
      ),
    );
  for (const agent of agents)
    await changeAgentLifecycle(
      integrationDatabase,
      { ...actor, requestId: randomUUID() },
      agent.agent.profile.id,
      lifecycleChangeSchema.parse({
        status: "ACTIVE",
        reason: "Activate concurrency evidence fixture.",
      }),
    );
  return agents;
}

async function principalFor(agentProfileId: string): Promise<RuntimePrincipal> {
  const profile = await integrationDatabase.agentProfile.findUniqueOrThrow({
    where: { id: agentProfileId },
    include: { user: true, credentials: { where: { revokedAt: null }, take: 1 } },
  });
  const credential = profile.credentials[0];
  if (!credential) throw new Error("Integration agent credential'ı bulunamadı.");
  return {
    credentialId: credential.id,
    agentProfileId,
    lifecycleStatus: "ACTIVE",
    actor: {
      actorId: profile.user.id,
      actorKind: "AGENT",
      actorRole: "USER",
      requestId: randomUUID(),
      origin: "AGENT",
    },
  };
}

/** Elle tetiklenmiş, kuyrukta bekleyen bir koşu. */
async function queueManualRun(agentProfileId: string) {
  const { currentPersonaVersionId } = await integrationDatabase.agentProfile.findUniqueOrThrow({
    where: { id: agentProfileId },
    select: { currentPersonaVersionId: true },
  });
  if (!currentPersonaVersionId) throw new Error("Fixture agent'ının persona sürümü yok.");
  return integrationDatabase.agentRun.create({
    data: {
      agentProfileId,
      personaVersionId: currentPersonaVersionId,
      runType: "NORMAL_WAKE",
      trigger: "MANUAL",
      runStatus: "QUEUED",
      queuePriority: "MANUAL_SINGLE",
      availableAt: NOW,
      idempotencyKey: `evidence-${randomUUID()}`,
      timeoutSeconds: 900,
      desiredEntryMin: 0,
      desiredEntryMax: 0,
    },
    select: { id: true },
  });
}

function lease(principal: RuntimePrincipal, now: Date) {
  return leaseRuntimeRun(
    integrationDatabase,
    principal,
    runtimeLeaseSchema.parse({ workerId: "evidence-worker", leaseSeconds: 300 }),
    { now },
  );
}

async function finishRun(runId: string, agentProfileId: string, now: Date) {
  await integrationDatabase.$transaction([
    integrationDatabase.agentRun.update({
      where: { id: runId },
      data: {
        runStatus: "SUCCEEDED",
        finishedAt: now,
        leaseOwner: null,
        leaseToken: null,
        leaseExpiresAt: null,
      },
    }),
    integrationDatabase.agentRuntimeState.update({
      where: { agentProfileId },
      data: { currentRunId: null, runtimeStatus: "SUCCEEDED" },
    }),
  ]);
}

function decisionEvents() {
  return integrationDatabase.agentRuntimeEvent.findMany({
    where: { eventType: "runtime.concurrency.decision_changed" },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    select: { safeMessage: true, metadata: true, occurredAt: true },
  });
}

beforeEach(resetIntegrationDatabase);
afterAll(closeIntegrationDatabase);

describe("proven runtime concurrency with PostgreSQL", () => {
  it("drops to one lane mid-flight, lets the two active runs finish, then drains the queue", async () => {
    const agents = await createActiveAgents(3);
    await integrationDatabase.agentGlobalSettings.update({
      where: { id: "global" },
      data: { codexConcurrency: 2 },
    });
    await measureDualLanes({
      measuredAt: new Date("2026-07-20T08:00:00.000Z"),
      staleAt: new Date("2026-08-03T08:00:00.000Z"),
    });

    const tick = await runRuntimeStochasticTick(
      integrationDatabase,
      await principalFor(agents[0]!.agent.profile.id),
      { workerId: "evidence-worker" },
      NOW,
    );
    if (!("createdRuns" in tick)) throw new Error("Tick rollout guard tarafından durduruldu.");
    expect(tick.createdRuns).toBe(2);

    const queued = await integrationDatabase.agentRun.findMany({
      where: { runStatus: "QUEUED" },
      select: { id: true, agentProfileId: true },
    });
    expect(queued).toHaveLength(2);
    const active: { runId: string; agentProfileId: string }[] = [];
    for (const run of queued) {
      const leased = await lease(await principalFor(run.agentProfileId), NOW);
      expect(leased).toMatchObject({ run: { id: run.id } });
      active.push({ runId: run.id, agentProfileId: run.agentProfileId });
    }
    expect(await integrationDatabase.agentRun.count({ where: { runStatus: "RUNNING" } })).toBe(2);

    /*
      Üçüncü agent için bekleyen bir koşu: sınır düştüğünde kuyruğun yalnız
      beklediğini, kaybolmadığını görmek için gerekli.
    */
    const waitingProfileId = agents[2]!.agent.profile.id;
    const waitingRun = await queueManualRun(waitingProfileId);

    // Kanıt eskiyor: ölçüm hâlâ duruyor ama geçerliliği bitti.
    await integrationDatabase.agentRuntimeCapability.updateMany({
      data: { staleAt: new Date("2026-07-21T07:00:00.000Z") },
    });

    const blocked = await lease(await principalFor(waitingProfileId), NOW);
    expect(blocked).toMatchObject({ run: null, reason: "CAPACITY_FULL" });
    expect(await integrationDatabase.agentRun.count({ where: { runStatus: "RUNNING" } })).toBe(2);

    const drop = await decisionEvents();
    expect(drop.at(-1)?.metadata).toMatchObject({
      effectiveConcurrency: 1,
      configuredConcurrency: 2,
      reason: "EVIDENCE_STALE",
      staleReasons: ["AGE"],
      callPath: "LEASE",
    });

    // Çalışan iki koşu etkilenmiyor: ikisi de normal biçimde sonlanabiliyor.
    for (const run of active) await finishRun(run.runId, run.agentProfileId, NOW);
    expect(await integrationDatabase.agentRun.count({ where: { runStatus: "SUCCEEDED" } })).toBe(2);

    // Kuyruk kilitlenmiyor: şerit boşalınca bekleyen koşu tüketiliyor.
    const drained = await lease(await principalFor(waitingProfileId), NOW);
    expect(drained.run?.id).toBe(waitingRun.id);
    /*
      Kuyruğun tamamı değil, BEKLEYEN koşu hedefleniyor: lease yolu kendi bakım
      koşularını (REFLECTION / SOURCE_REFRESH) da kuyruğa ekliyor, o yüzden
      "kuyruk boş" iddiası yanlış olurdu.
    */
    expect(
      await integrationDatabase.agentRun.findUniqueOrThrow({
        where: { id: waitingRun.id },
        select: { runStatus: true },
      }),
    ).toEqual({ runStatus: "RUNNING" });
  });

  it("admits only one of two concurrent leases when the evidence proves a single lane", async () => {
    const agents = await createActiveAgents(2);
    await integrationDatabase.agentGlobalSettings.update({
      where: { id: "global" },
      data: { codexConcurrency: 2 },
    });
    /*
      Ayar 2 ama ölçüm yok. Eski davranışta bu iki lease'i de kabul ederdi;
      kanıtsız ikinci şerit tam olarak F02'nin kapattığı yol.
    */
    for (const agent of agents) await queueManualRun(agent.agent.profile.id);

    const principals = await Promise.all(
      agents.map((agent) => principalFor(agent.agent.profile.id)),
    );
    const results = await Promise.all(principals.map((principal) => lease(principal, NOW)));
    const admitted = results.filter((result) => result.run !== null);
    expect(admitted).toHaveLength(1);
    expect(results.filter((result) => result.reason === "CAPACITY_FULL")).toHaveLength(1);
    expect(await integrationDatabase.agentRun.count({ where: { runStatus: "RUNNING" } })).toBe(1);

    const events = await decisionEvents();
    expect(events.at(-1)?.metadata).toMatchObject({
      effectiveConcurrency: 1,
      configuredConcurrency: 2,
      reason: "BENCHMARK_MISSING",
      measurementId: null,
    });
  });

  it("records the decision once instead of on every lease", async () => {
    const agents = await createActiveAgents(1);
    await integrationDatabase.agentGlobalSettings.update({
      where: { id: "global" },
      data: { codexConcurrency: 2 },
    });
    const principal = await principalFor(agents[0]!.agent.profile.id);
    for (let attempt = 0; attempt < 3; attempt += 1)
      await lease(principal, new Date(NOW.getTime() + attempt * 60_000));
    expect(await decisionEvents()).toHaveLength(1);
  });
  /*
    Kayıt, kararı uygulayan transaction'ın içinde yazılıyor. Bu testin tek işi
    geri alınan bir transaction'ın uygulanmış karar izi bırakmadığını GERÇEK
    PostgreSQL üzerinde göstermek (Astra, 14 Eylül).
  */
  it("leaves no decision trace when the applying transaction rolls back", async () => {
    await createActiveAgents(1);
    await integrationDatabase.agentGlobalSettings.update({
      where: { id: "global" },
      data: { codexConcurrency: 2 },
    });
    await expect(
      integrationDatabase.$transaction(async (transaction) => {
        const decision = await resolveEffectiveRuntimeConcurrency(transaction, {
          configuredConcurrency: 2,
          now: NOW,
        });
        expect(decision.concurrency).toBe(1);
        const written = await recordEffectiveConcurrencyDecision(transaction, decision, {
          callPath: "LEASE",
          now: NOW,
        });
        expect(written.recorded).toBe(true);
        // Satır transaction İÇİNDE gerçekten var: test boşuna geçmiyor.
        expect(
          await transaction.agentRuntimeEvent.count({
            where: { eventType: "runtime.concurrency.decision_changed" },
          }),
        ).toBe(1);
        throw new Error("Bilinçli geri alma.");
      }),
    ).rejects.toThrow("Bilinçli geri alma.");
    expect(await decisionEvents()).toHaveLength(0);
  });
});
