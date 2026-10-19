import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/lib/http/errors";
import {
  createAgent,
  createAgentSchema,
  createFocusList,
  endFocusList,
  focusListCreateSchema,
  getFocusListStatus,
  getRuntimeRunContext,
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
    expect(await integrationDatabase.agentFocusList.count()).toBe(0);

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

    // İkinci koşu odak başlığına yazmış olsun: yazıldı sayısı içerik kaydından gelir.
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
      written: 1,
      passed: 0,
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
    const row = await integrationDatabase.agentFocusList.findUniqueOrThrow({
      where: { id: list.id },
    });
    expect(row.endedById).toBe(seeded.admin.id);
    expect(row.endReason).toBe("odak listesi erken kapatma testi");
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
});
