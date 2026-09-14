import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ActorContext } from "@/modules/auth/domain/actor";
import {
  changeAgentLifecycle,
  completeRuntimeRun,
  createAgent,
  createAgentSchema,
  lifecycleChangeSchema,
  leaseRuntimeRun,
  runRuntimeStochasticTick,
  runtimeCompleteSchema,
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
import { measureDualLanesAround } from "./fixtures/runtime-capability";

/*
  F02: lease ve scheduler artık istenen eşzamanlılığı değil, KANITLANMIŞ
  eşzamanlılığı uyguluyor. Birim testler karar hesabını inceliyor; burada
  gerçek PostgreSQL üzerinde kilitleme, admission ve kuyruk tüketimi
  doğrulanıyor (Astra hakem turu, 14 Eylül).
*/

/*
  Sabit bir geçmiş tarih kullanılamıyor: `completeRuntimeRun` saat enjeksiyonu
  kabul etmiyor, gerçek `new Date()` ile lease süresini denetliyor. Geçmişte
  alınmış bir lease anında süresi geçmiş sayılır ve gerçek tamamlama yolu hiç
  denenemezdi.

  Zaman modül yüklenirken DEĞİL her testin başında alınıyor: sabitlenseydi
  dosyadaki testlerin toplam süresi 300 saniyelik lease penceresini aşınca
  sonraki testler süre aşımından kırılırdı — yanlış kırmızı (Astra, 14 Eylül).
*/
let NOW = new Date();

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

/**
 * Koşuyu GERÇEK tamamlama yolundan bitirir.
 *
 * Doğrudan `agentRun.update` yazmak şeridi boşaltıyor gibi görünür ama üretimde
 * şeridi boşaltan yolun çalıştığını kanıtlamaz (Astra, 14 Eylül).
 */
async function finishRun(runId: string, agentProfileId: string, leaseToken: string) {
  await completeRuntimeRun(
    integrationDatabase,
    await principalFor(agentProfileId),
    runId,
    runtimeCompleteSchema.parse({
      workerId: "evidence-worker",
      leaseToken,
      outcome: "SUCCEEDED",
      state: { curiosity: 0.5, confidence: 0.6, topicFatigue: {} },
      safeRunSummary: {
        operationSummary: "Kanıt fixture'ı: koşu aksiyonsuz tamamlandı.",
        observedItemIds: [],
        proposedActionCount: 0,
        completedActionCount: 0,
        rejectedActionCount: 0,
        shortRationale: "Yayınlanabilir aday bulunmadı.",
      },
      usageMetadata: { durationMs: 1, provider: "codex-cli" },
      performanceMetrics: {},
      reflectionDelta: null,
    }),
  );
}

function decisionEvents() {
  return integrationDatabase.agentRuntimeEvent.findMany({
    where: { eventType: "runtime.concurrency.decision_changed" },
    orderBy: { id: "asc" },
    select: { safeMessage: true, metadata: true, occurredAt: true },
  });
}

beforeEach(async () => {
  NOW = new Date();
  await resetIntegrationDatabase();
});
afterAll(closeIntegrationDatabase);

describe("proven runtime concurrency with PostgreSQL", () => {
  it("drops to one lane mid-flight, still refuses a lease with one run left, then drains", async () => {
    const agents = await createActiveAgents(3);
    await integrationDatabase.agentGlobalSettings.update({
      where: { id: "global" },
      data: { codexConcurrency: 2 },
    });
    await measureDualLanesAround(NOW);

    const active: { runId: string; agentProfileId: string; leaseToken: string }[] = [];
    for (const agent of agents.slice(0, 2)) {
      const queued = await queueManualRun(agent.agent.profile.id);
      const leased = await lease(await principalFor(agent.agent.profile.id), NOW);
      expect(leased).toMatchObject({ run: { id: queued.id } });
      active.push({
        runId: queued.id,
        agentProfileId: agent.agent.profile.id,
        leaseToken: leased.run!.leaseToken,
      });
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
      data: { staleAt: new Date(NOW.getTime() - 60 * 60 * 1000) },
    });

    const blocked = await lease(await principalFor(waitingProfileId), NOW);
    expect(blocked).toMatchObject({ run: null, reason: "CAPACITY_FULL" });

    const drop = await decisionEvents();
    expect(drop.at(-1)?.metadata).toMatchObject({
      effectiveConcurrency: 1,
      configuredConcurrency: 2,
      reason: "EVIDENCE_STALE",
      staleReasons: ["AGE"],
      callPath: "LEASE",
    });

    /*
      AYIRT EDİCİ ADIM. İki koşu birden çalışırken hem 1 hem 2 sınırı lease'i
      reddeder; yukarıdaki `CAPACITY_FULL` tek başına F02'yi kanıtlamaz. Tek koşu
      kaldığında sınır 2 olsaydı bekleyen koşu KABUL EDİLİRDİ; hâlâ reddediliyor
      olması etkin sınırın gerçekten 1 olduğunu gösterir (Astra, 14 Eylül).
    */
    await finishRun(active[0]!.runId, active[0]!.agentProfileId, active[0]!.leaseToken);
    expect(await integrationDatabase.agentRun.count({ where: { runStatus: "RUNNING" } })).toBe(1);
    expect(await lease(await principalFor(waitingProfileId), NOW)).toMatchObject({
      run: null,
      reason: "CAPACITY_FULL",
    });

    // Çalışan koşular etkilenmiyor: ikincisi de gerçek tamamlama yolundan bitiyor.
    await finishRun(active[1]!.runId, active[1]!.agentProfileId, active[1]!.leaseToken);
    expect(await integrationDatabase.agentRun.count({ where: { runStatus: "RUNNING" } })).toBe(0);

    // Kuyruk kilitlenmiyor: şerit boşalınca bekleyen koşu tüketiliyor.
    const drained = await lease(await principalFor(waitingProfileId), NOW);
    expect(drained.run?.id).toBe(waitingRun.id);
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
  /*
    Scheduler tarafı, eskimiş kanıtla. Sınır 2 olsaydı bir çalışan koşu varken
    hâlâ bir şerit boş sayılır ve tick yeni koşu üretirdi (Astra, 14 Eylül).
  */
  it("creates no new run when one is already running and the evidence has expired", async () => {
    const agents = await createActiveAgents(3);
    await integrationDatabase.agentGlobalSettings.update({
      where: { id: "global" },
      data: { codexConcurrency: 2 },
    });
    await measureDualLanesAround(NOW);
    /*
      Lease yolu scheduler açıkken kendi bakım koşularını da kuyruğa ekliyor.
      Kuyrukta bir şey kalırsa tick zaten `QUEUE_NOT_EMPTY` der ve testin sınırla
      hiçbir ilgisi kalmazdı; şeridi ölçen tek değişken çalışan koşu olmalı.
    */
    await integrationDatabase.agentGlobalSettings.update({
      where: { id: "global" },
      data: { schedulerEnabled: false },
    });
    await queueManualRun(agents[0]!.agent.profile.id);
    const leased = await lease(await principalFor(agents[0]!.agent.profile.id), NOW);
    expect(leased.run).not.toBeNull();
    expect(await integrationDatabase.agentRun.count({ where: { runStatus: "QUEUED" } })).toBe(0);
    await integrationDatabase.agentGlobalSettings.update({
      where: { id: "global" },
      data: { schedulerEnabled: true },
    });
    await integrationDatabase.agentRuntimeCapability.updateMany({
      data: { staleAt: new Date(NOW.getTime() - 60 * 60 * 1000) },
    });

    const tick = await runRuntimeStochasticTick(
      integrationDatabase,
      await principalFor(agents[0]!.agent.profile.id),
      { workerId: "evidence-worker" },
      NOW,
    );
    if (!("createdRuns" in tick)) throw new Error("Tick rollout guard tarafından durduruldu.");
    expect(tick).toMatchObject({ createdRuns: 0, skipReason: "CAPACITY_FULL" });
    expect(
      await integrationDatabase.agentRun.count({ where: { trigger: "STOCHASTIC_TICK" } }),
    ).toBe(0);
  });

  /*
    `occurredAt`, çağıranın istek başında aldığı zamandır ve kilide giriş sırasıyla
    aynı olmak zorunda değildir. Kayıtlar zaman sırasına göre okunsaydı, geç yazılan
    ama daha eski zaman taşıyan karar görünmez olur; operatör düşmüş sınırı 2
    görürdü (Astra, 14 Eylül).
  */
  it("treats the last written decision as current even when its timestamp is older", async () => {
    await createActiveAgents(1);
    const older = new Date(NOW.getTime() - 60 * 60 * 1000);
    await integrationDatabase.$transaction(async (transaction) =>
      recordEffectiveConcurrencyDecision(
        transaction,
        {
          concurrency: 2,
          configuredConcurrency: 2,
          reason: "EVIDENCE_FRESH",
          measurementId: randomUUID(),
          staleAt: new Date(NOW.getTime() + 60_000),
          staleReasons: [],
        },
        { callPath: "STOCHASTIC_SCHEDULER", now: NOW },
      ),
    );
    const applied = {
      concurrency: 1 as const,
      configuredConcurrency: 2 as const,
      reason: "EVIDENCE_STALE" as const,
      measurementId: randomUUID(),
      staleAt: older,
      staleReasons: ["AGE" as const],
    };
    await integrationDatabase.$transaction(async (transaction) =>
      recordEffectiveConcurrencyDecision(transaction, applied, {
        callPath: "LEASE",
        now: older,
      }),
    );

    const events = await decisionEvents();
    expect(events).toHaveLength(2);
    expect(events.at(-1)?.metadata).toMatchObject({ effectiveConcurrency: 1 });

    // Uygulanan karar değişmediği için üçüncü bir kayıt yazılmamalı.
    await integrationDatabase.$transaction(async (transaction) =>
      expect(
        await recordEffectiveConcurrencyDecision(transaction, applied, {
          callPath: "LEASE",
          now: new Date(NOW.getTime() + 120_000),
        }),
      ).toMatchObject({ recorded: false }),
    );
    expect(await decisionEvents()).toHaveLength(2);
  });
});
