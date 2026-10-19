import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/lib/http/errors";
import {
  createAgent,
  createAgentSchema,
  createFocusList,
  endFocusList,
  executeRuntimeAction,
  focusListCreateSchema,
  getFocusListStatus,
  getRuntimeRunContext,
  recordRuntimeActions,
  runtimeActionsSchema,
  runtimeFocusWriteGuard,
} from "@/modules/agents";
import type { RuntimePrincipal } from "@/modules/agents/application/runtime-auth";
import { browsableTopicIds } from "@/modules/agents/domain/runtime-browse";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { createTopicSlug, normalizeTopicTitle } from "@/modules/topics/domain/normalization";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

/*
  Süreli odak listesi (Gökhan kararı, 19 Ekim 2026). Uygun yazarın doğal koşusunun dondurulmuş
  algısında en çok bir odak başlığı bulunur ve okuma menüsüne girer; listede olmayan yazarın
  algısında hiç bulunmaz. Sunulma ve okunma `agent_runtime_events` satırlarıdır; kapatma anında
  geçerlidir.
*/

const leaseToken = "f".repeat(43);
const workerId = "focus-list-worker";
const longBody = Array.from({ length: 45 }, (_, index) => `sözcük${index}`).join(" ");

let humanAuthorId = "";

function adminActor(id: string): ActorContext {
  return {
    actorId: id,
    actorKind: "HUMAN",
    actorRole: "ADMIN",
    requestId: randomUUID(),
    origin: "API",
  };
}

async function createHuman(role: "ADMIN" | "USER") {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  return integrationDatabase.user.create({
    data: {
      kind: "HUMAN",
      role,
      status: "ACTIVE",
      email: `focus-${role.toLowerCase()}-${suffix}@integration.test`,
      emailNormalized: `focus-${role.toLowerCase()}-${suffix}@integration.test`,
      username: `focus_${role.toLowerCase()}_${suffix}`,
      usernameNormalized: `focus_${role.toLowerCase()}_${suffix}`,
      displayName: "Odak testi",
      passwordHash: "not-used",
      termsVersion: "1.0",
      termsAcceptedAt: new Date(),
    },
  });
}

async function createTopic(title: string, bodies: string[]) {
  const topic = await integrationDatabase.topic.create({
    data: {
      title,
      normalizedTitle: normalizeTopicTitle(title),
      slug: createTopicSlug(title),
      createdById: humanAuthorId,
      entryCount: bodies.length,
    },
  });
  for (const body of bodies)
    await integrationDatabase.entry.create({
      data: {
        topicId: topic.id,
        authorId: humanAuthorId,
        origin: "WEB",
        body,
        normalizedBody: body.toLocaleLowerCase("tr-TR"),
      },
    });
  return topic;
}

/** Yalnız liste sayısını tamamlayan, koşmayan ajan hesabı. */
async function createFillerAgent(adminId: string, index: number) {
  const username = `focus_filler_${index}_${randomUUID().slice(0, 6)}`;
  const user = await integrationDatabase.user.create({
    data: {
      kind: "AGENT",
      role: "USER",
      status: "ACTIVE",
      email: `${username}@invalid.local`,
      emailNormalized: `${username}@invalid.local`,
      username,
      usernameNormalized: username,
      displayName: `Odak dolgu ${index}`,
      passwordHash: "not-used",
      loginDisabled: true,
      termsVersion: "1.0",
      termsAcceptedAt: new Date(),
    },
  });
  await integrationDatabase.agentProfile.create({
    data: {
      userId: user.id,
      lifecycleStatus: "ACTIVE",
      activeTimeProfile: { timezone: "Europe/Istanbul", profile: "daytime" },
      createdById: adminId,
      updatedById: adminId,
    },
  });
  return username;
}

async function createRunner(adminId: string, personaIndex: number) {
  const persona = originalPersonaPack.personas[personaIndex]!;
  const created = await createAgent(
    integrationDatabase,
    adminActor(adminId),
    createAgentSchema.parse({
      persona,
      creation: { method: "TEMPLATE", templateUsername: persona.username },
    }),
  );
  const profile = await integrationDatabase.agentProfile.update({
    where: { id: created.agent.profile.id },
    data: { lifecycleStatus: "ACTIVE" },
    select: {
      id: true,
      currentPersonaVersionId: true,
      user: { select: { id: true, username: true } },
    },
  });
  return profile;
}

async function startRun(
  runner: Awaited<ReturnType<typeof createRunner>>,
  trigger = "STOCHASTIC_TICK",
) {
  const now = new Date();
  const run = await integrationDatabase.agentRun.create({
    data: {
      agentProfileId: runner.id,
      runType: "NORMAL_WAKE",
      runStatus: "RUNNING",
      queuePriority: "SCHEDULED_CONTENT",
      trigger,
      personaVersionId: runner.currentPersonaVersionId!,
      idempotencyKey: randomUUID(),
      leaseOwner: workerId,
      leaseToken,
      leaseExpiresAt: new Date(now.getTime() + 5 * 60_000),
      startedAt: now,
      timeoutSeconds: 600,
      desiredEntryMin: 0,
      desiredEntryMax: 0,
    },
  });
  const principal: RuntimePrincipal = {
    credentialId: randomUUID(),
    agentProfileId: runner.id,
    lifecycleStatus: "ACTIVE",
    actor: {
      actorId: runner.user.id,
      actorKind: "AGENT",
      actorRole: "USER",
      requestId: randomUUID(),
      origin: "AGENT",
    },
  };
  return { run, principal };
}

/** Ajan başına tek etkin koşu; sonraki koşudan önce öncekini bitmiş say (yalnız test). */
async function finishRun(started: Awaited<ReturnType<typeof startRun>>) {
  await integrationDatabase.agentRun.update({
    where: { id: started.run.id },
    data: {
      runStatus: "SUCCEEDED",
      finishedAt: new Date(),
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
    },
  });
}

async function context(
  started: Awaited<ReturnType<typeof startRun>>,
  readTopicIds: readonly string[] = [],
) {
  return getRuntimeRunContext(
    integrationDatabase,
    started.principal,
    started.run.id,
    workerId,
    leaseToken,
    readTopicIds,
  );
}

async function storedPerception(runId: string) {
  const run = await integrationDatabase.agentRun.findUniqueOrThrow({
    where: { id: runId },
    select: { perceptionSummary: true },
  });
  return run.perceptionSummary as Record<string, unknown>;
}

function interestIds(perception: Record<string, unknown>): string[] {
  const topics = perception.interestTopics;
  return Array.isArray(topics) ? topics.map((topic) => (topic as { id: string }).id) : [];
}

function listCreatedEvents() {
  return integrationDatabase.agentRuntimeEvent.findMany({
    where: { eventType: "agent.focus_list.created" },
    select: { id: true },
  });
}

function focusEvents(runId: string, eventType: string) {
  return integrationDatabase.agentRuntimeEvent.findMany({
    where: { runId, eventType },
    select: { metadata: true, subject: true },
  });
}

async function seed() {
  const admin = await createHuman("ADMIN");
  const author = await createHuman("USER");
  humanAuthorId = author.id;
  const eligibleA = await createTopic("kibrithane odak testi", [longBody]);
  const eligibleB = await createTopic("filmekimi odak testi", ["kısa tanım", "ikinci entry"]);
  const thin = await createTopic("ince odak testi", ["tek kısa entry"]);
  const control = await createTopic("kontrol odak testi", [longBody]);
  const runner = await createRunner(admin.id, 0);
  const outsider = await createRunner(admin.id, 1);
  const fillers = [];
  for (let index = 0; index < 5; index += 1) fillers.push(await createFillerAgent(admin.id, index));
  return { admin, eligibleA, eligibleB, thin, control, runner, outsider, fillers };
}

type Seeded = Awaited<ReturnType<typeof seed>>;

function createInput(seeded: Seeded, topics: Array<{ publicId: bigint }>) {
  return focusListCreateSchema.parse({
    label: "odak entegrasyon testi",
    topics: topics.map(({ publicId }) => publicId.toString()),
    agents: [seeded.runner.user.username, ...seeded.fillers],
    endsAt: new Date(Date.now() + 7 * 24 * 3_600_000).toISOString(),
    reason: "odak listesi entegrasyon testi",
  });
}

beforeEach(resetIntegrationDatabase, 60_000);
afterAll(closeIntegrationDatabase);

describe("süreli odak listesi (PostgreSQL)", () => {
  it("ince başlığı ve listede olmayan yazarı reddeder; aynı anda tek etkin liste", async () => {
    const seeded = await seed();
    const actor = adminActor(seeded.admin.id);
    await expect(
      createFocusList(integrationDatabase, actor, createInput(seeded, [seeded.thin])),
    ).rejects.toMatchObject({
      code: "AGENT_FOCUS_LIST_INVALID",
      details: { reason: "FOCUS_TOPIC_INELIGIBLE", publicIds: [seeded.thin.publicId.toString()] },
    });
    await expect(
      createFocusList(integrationDatabase, actor, {
        ...createInput(seeded, [seeded.eligibleA]),
        agents: [...seeded.fillers, "olmayan_yazar"],
      }),
    ).rejects.toMatchObject({ details: { reason: "FOCUS_AGENT_INVALID" } });
    expect(await listCreatedEvents()).toHaveLength(0);

    const list = await createFocusList(
      integrationDatabase,
      actor,
      createInput(seeded, [seeded.eligibleA, seeded.eligibleB]),
    );
    expect(list.topicIds).toEqual([seeded.eligibleA.id, seeded.eligibleB.id]);
    expect(list.agentProfileIds).toContain(seeded.runner.id);
    const second = createFocusList(
      integrationDatabase,
      actor,
      createInput(seeded, [seeded.eligibleA]),
    );
    await expect(second).rejects.toBeInstanceOf(AppError);
    await expect(second).rejects.toMatchObject({ code: "AGENT_FOCUS_LIST_CONFLICT" });
    const audit = await integrationDatabase.auditLog.findMany({
      where: { entityType: "AgentFocusList" },
      select: { action: true, actorId: true, entityId: true },
    });
    expect(audit).toEqual([
      { action: "agent.focus_list.created", actorId: seeded.admin.id, entityId: list.id },
    ]);
  }, 120_000);

  it("uygun yazarın algısında en çok bir odak başlığı, listede olmayanınkinde hiç yok", async () => {
    const seeded = await seed();
    const actor = adminActor(seeded.admin.id);
    const focusIds = [seeded.eligibleA.id, seeded.eligibleB.id];
    await createFocusList(
      integrationDatabase,
      actor,
      createInput(seeded, [seeded.eligibleA, seeded.eligibleB]),
    );

    const first = await startRun(seeded.runner);
    await context(first);
    const perception = await storedPerception(first.run.id);
    const offered = interestIds(perception).filter((id) => focusIds.includes(id));
    expect(offered).toHaveLength(1);
    expect(interestIds(perception)[0]).toBe(offered[0]);
    expect(browsableTopicIds(perception).has(offered[0]!)).toBe(true);
    // Kontrol başlığı odak yoluyla eklenmez (yeni/gündem gibi olağan yollardan görünebilir).
    expect(interestIds(perception)).not.toContain(seeded.control.id);
    const offers = await focusEvents(first.run.id, "agent.focus.offered");
    expect(offers).toHaveLength(1);
    expect(offers[0]!.metadata).toMatchObject({
      topicId: offered[0],
      origin: "RUNTIME_FOCUS_LIST",
    });

    // Dondurulmuş algı yeniden seçilmez; okuma bir kez kaydedilir.
    await context(first, [offered[0]!]);
    await context(first, [offered[0]!]);
    expect(await focusEvents(first.run.id, "agent.focus.offered")).toHaveLength(1);
    expect(await focusEvents(first.run.id, "agent.focus.read")).toHaveLength(1);
    expect((await storedPerception(first.run.id)).readTopics).toEqual([
      expect.objectContaining({ id: offered[0] }),
    ]);

    const outsiderRun = await startRun(seeded.outsider);
    await context(outsiderRun);
    const outsiderPerception = await storedPerception(outsiderRun.run.id);
    expect(interestIds(outsiderPerception).filter((id) => focusIds.includes(id))).toHaveLength(0);
    expect(await focusEvents(outsiderRun.run.id, "agent.focus.offered")).toHaveLength(0);

    // Elle/toplu koşu doğal akış değildir.
    await finishRun(first);
    const manual = await startRun(seeded.runner, "ADMIN_BULK");
    await context(manual);
    expect(await focusEvents(manual.run.id, "agent.focus.offered")).toHaveLength(0);

    // 3 gün kuralı: ikinci doğal koşu öteki başlığı görür, üçüncüsü hiçbirini.
    await finishRun(manual);
    const second = await startRun(seeded.runner);
    await context(second);
    const secondOffers = await focusEvents(second.run.id, "agent.focus.offered");
    expect(secondOffers).toHaveLength(1);
    expect(secondOffers[0]!.metadata).toMatchObject({
      topicId: focusIds.find((id) => id !== offered[0]),
    });
    await finishRun(second);
    const third = await startRun(seeded.runner);
    await context(third);
    expect(await focusEvents(third.run.id, "agent.focus.offered")).toHaveLength(0);

    // Yazım olayı olmadan eklenen içerik kaydı "yazıldı" sayılmaz; sayım yayım anındaki
    // değişmez `agent.focus.written` olayından gelir (Sol 6.1, 1. tur).
    const secondTopicId = focusIds.find((id) => id !== offered[0])!;
    const entry = await integrationDatabase.entry.create({
      data: {
        topicId: secondTopicId,
        authorId: seeded.runner.user.id,
        origin: "AGENT",
        body: "odak başlığına yazılmış ajan entry'si",
        normalizedBody: "odak başlığına yazılmış ajan entry'si",
      },
    });
    const action = await integrationDatabase.agentAction.create({
      data: {
        runId: second.run.id,
        agentProfileId: seeded.runner.id,
        sequence: 1,
        actionType: "CREATE_ENTRY",
        actionStatus: "SUCCEEDED",
        targetType: "TOPIC",
        targetId: secondTopicId,
        input: { body: "odak" },
      },
    });
    await integrationDatabase.agentContentRecord.create({
      data: {
        entryId: entry.id,
        agentProfileId: seeded.runner.id,
        runId: second.run.id,
        actionId: action.id,
      },
    });

    const status = await getFocusListStatus(integrationDatabase);
    expect(status?.active).toBe(true);
    expect(status!.topics.find(({ topicId }) => topicId === secondTopicId)).toMatchObject({
      agentEntriesSinceStart: 1,
      offered: 1,
      read: 0,
      written: 0,
      passed: 1,
    });
    const firstTopic = status!.topics.find(({ topicId }) => topicId === offered[0])!;
    expect(firstTopic).toMatchObject({ offered: 1, read: 1, written: 0, passed: 1, pending: 0 });
    expect(status!.agentUsernames).toContain(seeded.runner.user.username);
  }, 180_000);

  it("kapatma anında geçerlidir ve denetlenir", async () => {
    const seeded = await seed();
    const actor = adminActor(seeded.admin.id);
    const list = await createFocusList(
      integrationDatabase,
      actor,
      createInput(seeded, [seeded.eligibleA]),
    );
    const ended = await endFocusList(integrationDatabase, actor, {
      reason: "odak listesi erken kapatma testi",
    });
    expect(ended.id).toBe(list.id);
    await expect(
      endFocusList(integrationDatabase, actor, { reason: "ikinci kapatma denemesi" }),
    ).rejects.toMatchObject({ code: "AGENT_FOCUS_LIST_CONFLICT" });

    const started = await startRun(seeded.runner);
    await context(started);
    expect(interestIds(await storedPerception(started.run.id))).not.toContain(seeded.eligibleA.id);
    expect(await focusEvents(started.run.id, "agent.focus.offered")).toHaveLength(0);

    const status = await getFocusListStatus(integrationDatabase);
    expect(status?.active).toBe(false);
    expect(status!.list).toMatchObject({
      id: list.id,
      endedById: seeded.admin.id,
      endReason: "odak listesi erken kapatma testi",
    });
    // Liste ayrı tabloda değil: açılış ve kapanış, ajana/koşuya bağlı olmayan iki olaydır.
    const listEvents = await integrationDatabase.agentRuntimeEvent.findMany({
      where: { eventType: { startsWith: "agent.focus_list." } },
      orderBy: { id: "asc" },
      select: { eventType: true, agentProfileId: true, runId: true, metadata: true },
    });
    expect(listEvents).toEqual([
      expect.objectContaining({
        eventType: "agent.focus_list.created",
        agentProfileId: null,
        runId: null,
        metadata: expect.objectContaining({
          origin: "FOCUS_LIST_OPERATOR",
          focusListId: list.id,
          topicIds: [seeded.eligibleA.id],
          createdById: seeded.admin.id,
        }),
      }),
      expect.objectContaining({
        eventType: "agent.focus_list.ended",
        agentProfileId: null,
        runId: null,
        metadata: expect.objectContaining({ focusListId: list.id, endedById: seeded.admin.id }),
      }),
    ]);
    const actions = await integrationDatabase.auditLog.findMany({
      where: { entityType: "AgentFocusList" },
      orderBy: { createdAt: "asc" },
      select: { action: true },
    });
    expect(actions.map(({ action }) => action)).toEqual([
      "agent.focus_list.created",
      "agent.focus_list.ended",
    ]);
  }, 120_000);

  it("eşzamanlı iki oluşturmadan yalnız biri açılır (Sol 6.1, 1. tur)", async () => {
    const seeded = await seed();
    const actor = adminActor(seeded.admin.id);
    const results = await Promise.allSettled([
      createFocusList(integrationDatabase, actor, createInput(seeded, [seeded.eligibleA])),
      createFocusList(integrationDatabase, actor, createInput(seeded, [seeded.eligibleB])),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(({ status }) => status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "AGENT_FOCUS_LIST_CONFLICT" });
    expect(await listCreatedEvents()).toHaveLength(1);
  }, 120_000);

  it("süresi geçmiş yazma kilidi engellemez, etkin kilit engeller (Sol 6.1, 1. tur)", async () => {
    const seeded = await seed();
    const actor = adminActor(seeded.admin.id);
    await integrationDatabase.agentTopicWriteLock.create({
      data: {
        topicId: seeded.eligibleA.id,
        reason: "süresi geçmiş test kilidi",
        createdById: seeded.admin.id,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    await integrationDatabase.agentTopicWriteLock.create({
      data: {
        topicId: seeded.eligibleB.id,
        reason: "etkin test kilidi",
        createdById: seeded.admin.id,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    await expect(
      createFocusList(integrationDatabase, actor, createInput(seeded, [seeded.eligibleB])),
    ).rejects.toMatchObject({
      details: {
        reason: "FOCUS_TOPIC_INELIGIBLE",
        publicIds: [seeded.eligibleB.publicId.toString()],
      },
    });
    const list = await createFocusList(
      integrationDatabase,
      actor,
      createInput(seeded, [seeded.eligibleA]),
    );
    expect(list.topicIds).toEqual([seeded.eligibleA.id]);
  }, 120_000);

  it("yazımda tavan ve aynı yazar kuralı yeniden denetlenir; okuma ve yazım değişmez kayıttır", async () => {
    const seeded = await seed();
    const actor = adminActor(seeded.admin.id);
    const extra = await createTopic("üçüncü odak testi", [longBody]);
    const focusIds = [seeded.eligibleA.id, seeded.eligibleB.id, extra.id];
    await createFocusList(
      integrationDatabase,
      actor,
      createInput(seeded, [seeded.eligibleA, seeded.eligibleB, extra]),
    );
    const offeredTopic = async (started: Awaited<ReturnType<typeof startRun>>) => {
      await context(started);
      const [offer] = await focusEvents(started.run.id, "agent.focus.offered");
      return (offer!.metadata as { topicId: string }).topicId;
    };
    const writeTwice = async (
      started: Awaited<ReturnType<typeof startRun>>,
      topicId: string,
      bodies: [string, string],
    ) => {
      await recordRuntimeActions(
        integrationDatabase,
        started.principal,
        started.run.id,
        runtimeActionsSchema.parse({
          workerId,
          leaseToken,
          actions: bodies.map((body, index) => ({
            sequence: index + 1,
            actionType: "CREATE_ENTRY" as const,
            safeReason: "Okunan odak başlığına yeni bir ayrıntı eklenir.",
            targetType: "TOPIC" as const,
            targetId: topicId,
            input: { topicId, body },
            provenance: {
              evidenceType: "PLATFORM_EVENT" as const,
              evidenceIds: [started.run.id],
              shortRationale: "Runtime run odak başlığı yazımı için görünür kanıttır.",
            },
          })),
        }),
      );
      const execute = (sequence: number) =>
        executeRuntimeAction(
          integrationDatabase,
          started.principal,
          started.run.id,
          { workerId, leaseToken, sequence },
          { requireLifeLedger: false },
        );
      return [await execute(1), await execute(2)];
    };

    // 1. koşu: sahte worker "okundu" olayı gerçek okumayı bastırmaz; ikinci yazım reddedilir.
    const first = await startRun(seeded.runner);
    const firstTopic = await offeredTopic(first);
    await integrationDatabase.agentRuntimeEvent.create({
      data: {
        agentProfileId: seeded.runner.id,
        runId: first.run.id,
        eventType: "agent.focus.read",
        safeMessage: "worker kaynaklı sahte okuma",
        metadata: { phase: "forged" },
      },
    });
    await context(first, [firstTopic]);
    const reads = await focusEvents(first.run.id, "agent.focus.read");
    expect(reads.filter(({ metadata }) => (metadata as { origin?: string }).origin)).toHaveLength(
      1,
    );
    const [succeeded, rejected] = await writeTwice(first, firstTopic, [
      "Kibrit fabrikasının kültür merkezine dönüşmesinde eski üretim hattının mekâna nasıl çevrildiği belirleyici olmuş.",
      "Benzer bir dönüşüm eski bir santralde de görülmüş; orada makine dairesi müze olarak korunmuş.",
    ]);
    expect(succeeded).toMatchObject({ actionStatus: "SUCCEEDED" });
    expect(rejected).toMatchObject({
      actionStatus: "REJECTED",
      rejectionCode: "FOCUS_TOPIC_CAP_REACHED",
    });
    const written = await focusEvents(first.run.id, "agent.focus.written");
    expect(written).toHaveLength(1);
    const writtenEntryId = (written[0]!.metadata as { entryId: string }).entryId;
    await finishRun(first);

    // 2. koşu: sunumdan sonra başka ajanlar 2 entry yazdıysa yazım reddedilir.
    const second = await startRun(seeded.runner);
    const secondTopic = await offeredTopic(second);
    expect(secondTopic).not.toBe(firstTopic);
    const fillerUsers = await integrationDatabase.user.findMany({
      where: { username: { in: seeded.fillers.slice(0, 2) } },
      select: { id: true },
    });
    for (const [index, user] of fillerUsers.entries())
      await integrationDatabase.entry.create({
        data: {
          topicId: secondTopic,
          authorId: user.id,
          origin: "AGENT",
          body: `başka ajanın odak entry'si ${index}`,
          normalizedBody: `başka ajanın odak entry'si ${index}`,
        },
      });
    await context(second, [secondTopic]);
    const [capped] = await writeTwice(second, secondTopic, [
      "Festival programındaki restorasyon seçkisi bu yıl yetmişlerin yerli filmlerine ağırlık vermiş.",
      "Seçkinin ölçütü kopyaların durumuymuş; bozuk negatifler programdan çıkarılmış.",
    ]);
    expect(capped).toMatchObject({
      actionStatus: "REJECTED",
      rejectionCode: "FOCUS_TOPIC_CAP_REACHED",
    });
    expect(await focusEvents(second.run.id, "agent.focus.written")).toHaveLength(0);
    await finishRun(second);

    // 3. koşu: okuma anında gizlenen başlık algıya girmez, "okundu" sayılmaz.
    const third = await startRun(seeded.runner);
    const thirdTopic = await offeredTopic(third);
    expect(focusIds).toContain(thirdTopic);
    await integrationDatabase.topic.update({
      where: { id: thirdTopic },
      data: { status: "HIDDEN" },
    });
    await context(third, [thirdTopic]);
    expect(await focusEvents(third.run.id, "agent.focus.read")).toHaveLength(0);
    await finishRun(third);

    // Entry sonradan başka başlığa taşınsa da yazım geçmişi değişmez.
    await integrationDatabase.entry.update({
      where: { id: writtenEntryId },
      data: { topicId: seeded.control.id },
    });
    const status = await getFocusListStatus(integrationDatabase);
    expect(status!.topics.find(({ topicId }) => topicId === firstTopic)).toMatchObject({
      offered: 1,
      read: 1,
      written: 1,
      passed: 0,
      pending: 0,
    });
    expect(status!.topics.find(({ topicId }) => topicId === secondTopic)).toMatchObject({
      offered: 1,
      written: 0,
      passed: 1,
    });
  }, 240_000);

  it("kapatılan listede sunulmuş başlığa yazım 'yazıldı' sayılır; yeni-başlık yolu da denetlenir (Sol 6.1, 2. tur)", async () => {
    const seeded = await seed();
    const actor = adminActor(seeded.admin.id);
    await createFocusList(
      integrationDatabase,
      actor,
      createInput(seeded, [seeded.eligibleA, seeded.eligibleB]),
    );
    const provenance = (runId: string) => ({
      evidenceType: "PLATFORM_EVENT" as const,
      evidenceIds: [runId],
      shortRationale: "Runtime run odak başlığı yazımı için görünür kanıttır.",
    });
    const run = async (
      started: Awaited<ReturnType<typeof startRun>>,
      action: Record<string, unknown>,
    ) => {
      await recordRuntimeActions(
        integrationDatabase,
        started.principal,
        started.run.id,
        runtimeActionsSchema.parse({
          workerId,
          leaseToken,
          actions: [{ sequence: 1, provenance: provenance(started.run.id), ...action }],
        }),
      );
      return executeRuntimeAction(
        integrationDatabase,
        started.principal,
        started.run.id,
        { workerId, leaseToken, sequence: 1 },
        { requireLifeLedger: false },
      );
    };
    const offeredTopic = async (started: Awaited<ReturnType<typeof startRun>>) => {
      await context(started);
      const [offer] = await focusEvents(started.run.id, "agent.focus.offered");
      return (offer!.metadata as { topicId: string }).topicId;
    };

    // Yeni-başlık yolu: görünür entry'leri gizlenmiş odak başlığına çözülen öneri tavana takılır.
    const first = await startRun(seeded.runner);
    const firstTopic = await offeredTopic(first);
    await context(first, [firstTopic]);
    const fillerUsers = await integrationDatabase.user.findMany({
      where: { username: { in: seeded.fillers.slice(0, 2) } },
      select: { id: true },
    });
    for (const [index, user] of fillerUsers.entries())
      await integrationDatabase.entry.create({
        data: {
          topicId: firstTopic,
          authorId: user.id,
          origin: "AGENT",
          body: `başka ajanın gizlenecek entry'si ${index}`,
          normalizedBody: `başka ajanın gizlenecek entry'si ${index}`,
        },
      });
    await integrationDatabase.entry.updateMany({
      where: { topicId: firstTopic },
      data: { status: "HIDDEN", hiddenAt: new Date() },
    });
    const entriesBefore = await integrationDatabase.entry.count({ where: { topicId: firstTopic } });
    const topicRow = await integrationDatabase.topic.findUniqueOrThrow({
      where: { id: firstTopic },
      select: { title: true },
    });
    const viaNewTopic = await run(first, {
      actionType: "CREATE_TOPIC_WITH_ENTRY",
      safeReason: "Başlık adıyla yeni başlık önerisi var olan odak başlığına çözülür.",
      input: {
        title: topicRow.title,
        body: "Eski fabrika yapısının kültür merkezine çevrilmesinde ölçek kararı belirleyici olmuş.",
      },
    });
    expect(viaNewTopic).toMatchObject({
      actionStatus: "REJECTED",
      rejectionCode: "FOCUS_TOPIC_CAP_REACHED",
    });
    expect(await integrationDatabase.entry.count({ where: { topicId: firstTopic } })).toBe(
      entriesBefore,
    );
    await finishRun(first);

    // Atıf: sunumdan sonra liste kapanır; dondurulmuş algıdan yazım yine "yazıldı" sayılır.
    const second = await startRun(seeded.runner);
    const secondTopic = await offeredTopic(second);
    expect(secondTopic).not.toBe(firstTopic);
    await context(second, [secondTopic]);
    await endFocusList(integrationDatabase, actor, { reason: "odak listesi kapatma atıf testi" });
    const afterEnd = await run(second, {
      actionType: "CREATE_ENTRY",
      safeReason: "Okunan odak başlığına yeni bir ayrıntı eklenir.",
      targetType: "TOPIC",
      targetId: secondTopic,
      input: {
        topicId: secondTopic,
        body: "Festival seçkisindeki restorasyon kopyaları bu yıl ilk kez özgün oranlarıyla gösterilmiş.",
      },
    });
    expect(afterEnd).toMatchObject({ actionStatus: "SUCCEEDED" });
    const written = await focusEvents(second.run.id, "agent.focus.written");
    expect(written).toHaveLength(1);
    await finishRun(second);
    const status = await getFocusListStatus(integrationDatabase);
    expect(status?.active).toBe(false);
    expect(status!.topics.find(({ topicId }) => topicId === secondTopic)).toMatchObject({
      offered: 1,
      read: 1,
      written: 1,
      passed: 0,
    });
    expect(status!.topics.find(({ topicId }) => topicId === firstTopic)).toMatchObject({
      offered: 1,
      written: 0,
      passed: 1,
    });
  }, 240_000);

  it("yazım denetimi etkinlik saatini kilitlerden sonra kendisi okur (Sol 6.1, 2. tur)", async () => {
    const seeded = await seed();
    const list = await createFocusList(
      integrationDatabase,
      adminActor(seeded.admin.id),
      createInput(seeded, [seeded.eligibleA]),
    );
    const started = await startRun(seeded.runner);
    await context(started);
    const guard = (clock: () => Date) =>
      integrationDatabase.$transaction((transaction) =>
        runtimeFocusWriteGuard(
          transaction,
          {
            runId: started.run.id,
            authorId: seeded.runner.user.id,
            topicId: seeded.eligibleA.id,
          },
          clock,
        ),
      );
    await expect(guard(() => new Date())).resolves.toMatchObject({
      status: "OFFERED",
      enforced: true,
    });
    // Kilit beklerken pencere kapandıysa tavan uygulanmaz ama atıf korunur.
    await expect(guard(() => new Date(list.endsAt.getTime() + 1))).resolves.toMatchObject({
      status: "OFFERED",
      focusListId: list.id,
      enforced: false,
    });
  }, 120_000);

  it("ajana bağlı ya da kaynaksız sahte liste olayı etkin liste sayılmaz", async () => {
    const seeded = await seed();
    const forged = (extra: Record<string, unknown>) => ({
      eventType: "agent.focus_list.created",
      safeMessage: "sahte liste",
      metadata: {
        origin: "FOCUS_LIST_OPERATOR",
        focusListId: randomUUID(),
        label: "sahte",
        topicIds: [seeded.eligibleA.id],
        agentProfileIds: [seeded.runner.id],
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        endsAt: new Date(Date.now() + 3_600_000).toISOString(),
        createdAt: new Date(Date.now() - 60_000).toISOString(),
      },
      ...extra,
    });
    // Worker olayı her zaman ajan profiline bağlıdır; kaynaksız satır da yok sayılır.
    await integrationDatabase.agentRuntimeEvent.create({
      data: forged({ agentProfileId: seeded.runner.id }),
    });
    const noOrigin = forged({});
    await integrationDatabase.agentRuntimeEvent.create({
      data: { ...noOrigin, metadata: { ...noOrigin.metadata, origin: "WORKER" } },
    });
    expect(await getFocusListStatus(integrationDatabase)).toBeNull();
    const started = await startRun(seeded.runner);
    await context(started);
    expect(await focusEvents(started.run.id, "agent.focus.offered")).toHaveLength(0);
    // Gerçek liste yine açılabilir: sahte olay "açık liste" sayılmaz.
    await expect(
      createFocusList(
        integrationDatabase,
        adminActor(seeded.admin.id),
        createInput(seeded, [seeded.eligibleA]),
      ),
    ).resolves.toMatchObject({ topicIds: [seeded.eligibleA.id] });
  }, 120_000);

  it("saat geri gitse de kapatılan liste yeniden etkinleşmez (Sol 6.1, 4. tur)", async () => {
    const seeded = await seed();
    const actor = adminActor(seeded.admin.id);
    const list = await createFocusList(
      integrationDatabase,
      actor,
      createInput(seeded, [seeded.eligibleA]),
    );
    // Kapanış anı açılıştan bir saat önce görünür (geri giden saat).
    await endFocusList(
      integrationDatabase,
      actor,
      { reason: "geri giden saatle kapatma testi" },
      () => new Date(list.createdAt.getTime() - 3_600_000),
    );
    const status = await getFocusListStatus(integrationDatabase);
    expect(status).toMatchObject({ active: false, list: { id: list.id } });
    expect(status!.list.endedAt).not.toBeNull();
    const started = await startRun(seeded.runner);
    await context(started);
    expect(await focusEvents(started.run.id, "agent.focus.offered")).toHaveLength(0);
    // Kapatılmış liste açık sayılmaz; yeni liste açılabilir.
    await expect(
      createFocusList(integrationDatabase, actor, createInput(seeded, [seeded.eligibleB])),
    ).resolves.toMatchObject({ topicIds: [seeded.eligibleB.id] });
  }, 120_000);

  it("saat geri gitse de en son açılan liste görünür ve ikinci açık liste açılamaz (Sol 6.1, 4. tur)", async () => {
    const seeded = await seed();
    const actor = adminActor(seeded.admin.id);
    const base = Date.now();
    const first = await createFocusList(
      integrationDatabase,
      actor,
      createInput(seeded, [seeded.eligibleA]),
      () => new Date(base),
    );
    await endFocusList(
      integrationDatabase,
      actor,
      { reason: "ilk liste kapatılır" },
      () => new Date(base),
    );
    // Saat iki saat geri gitti: yeni liste eskisinden önce zaman damgası taşır.
    const second = await createFocusList(
      integrationDatabase,
      actor,
      createInput(seeded, [seeded.eligibleB]),
      () => new Date(base - 2 * 3_600_000),
    );
    expect(second.createdAt.getTime()).toBeLessThan(first.createdAt.getTime());
    const status = await getFocusListStatus(integrationDatabase);
    expect(status).toMatchObject({ active: true, list: { id: second.id } });
    // Daha da geri giden saatle üçüncü liste açılamaz: açık liste zaman damgasına bakmadan bulunur.
    await expect(
      createFocusList(
        integrationDatabase,
        actor,
        createInput(seeded, [seeded.eligibleA]),
        () => new Date(base - 3 * 3_600_000),
      ),
    ).rejects.toMatchObject({ code: "AGENT_FOCUS_LIST_CONFLICT" });
    const started = await startRun(seeded.runner);
    await context(started);
    const offers = await focusEvents(started.run.id, "agent.focus.offered");
    expect(offers).toHaveLength(1);
    expect(offers[0]!.metadata).toMatchObject({
      focusListId: second.id,
      topicId: seeded.eligibleB.id,
    });
  }, 120_000);
});
