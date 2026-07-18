import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  listAgentLifeEvents,
  recordRuntimeLifeEventBatch,
} from "@/modules/agents/application/life-ledger";
import { appendRuntimeEvent } from "@/modules/agents/repository/control-plane";
import type { RuntimePrincipal } from "@/modules/agents/application/runtime-auth";
import { runtimeLifeEventBatchSchema } from "@/modules/agents/validation/life-schemas";
import type { ActorContext } from "@/modules/auth/domain/actor";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

const leaseToken = "l".repeat(43);

function adminActor(id: string): ActorContext {
  return {
    actorId: id,
    actorKind: "HUMAN",
    actorRole: "ADMIN",
    requestId: randomUUID(),
    origin: "API",
  };
}

async function createFixture() {
  const suffix = randomUUID().replaceAll("-", "");
  const admin = await integrationDatabase.user.create({
    data: {
      kind: "HUMAN",
      role: "ADMIN",
      status: "ACTIVE",
      email: `life-admin-${suffix}@integration.test`,
      emailNormalized: `life-admin-${suffix}@integration.test`,
      username: `life_admin_${suffix.slice(0, 14)}`,
      usernameNormalized: `life_admin_${suffix.slice(0, 14)}`,
      displayName: "Life ledger admin",
      passwordHash: "not-used",
      termsVersion: "1.0",
      termsAcceptedAt: new Date(),
    },
  });
  const user = await integrationDatabase.user.create({
    data: {
      kind: "AGENT",
      role: "USER",
      status: "ACTIVE",
      email: `life-agent-${suffix}@invalid.local`,
      emailNormalized: `life-agent-${suffix}@invalid.local`,
      username: `life_agent_${suffix.slice(0, 14)}`,
      usernameNormalized: `life_agent_${suffix.slice(0, 14)}`,
      displayName: "Life ledger agent",
      passwordHash: "not-used",
      loginDisabled: true,
      termsVersion: "1.0",
      termsAcceptedAt: new Date(),
    },
  });
  const profile = await integrationDatabase.agentProfile.create({
    data: {
      userId: user.id,
      lifecycleStatus: "ACTIVE",
      activeTimeProfile: { timezone: "Europe/Istanbul", profile: "daytime" },
      createdById: admin.id,
      updatedById: admin.id,
    },
  });
  const persona = await integrationDatabase.agentPersonaVersion.create({
    data: {
      agentProfileId: profile.id,
      version: 1,
      persona: { displayName: "Life ledger agent", pinned: ["ontology-neutral"] },
      renderedPrompt: "Görünür bağlamı yapılandırılmış karar günlüğüyle değerlendir.",
      changeOrigin: "INITIAL",
      changeSummary: "Life ledger integration persona",
      createdById: admin.id,
      validationReport: { passed: true },
    },
  });
  await integrationDatabase.agentProfile.update({
    where: { id: profile.id },
    data: { currentPersonaVersionId: persona.id },
  });
  const now = new Date();
  const run = await integrationDatabase.agentRun.create({
    data: {
      agentProfileId: profile.id,
      runType: "NORMAL_WAKE",
      runStatus: "RUNNING",
      queuePriority: "MANUAL_SINGLE",
      trigger: "LIFE_LEDGER_INTEGRATION",
      personaVersionId: persona.id,
      idempotencyKey: randomUUID(),
      leaseOwner: "life-worker",
      leaseToken,
      leaseExpiresAt: new Date(now.getTime() + 60_000),
      startedAt: now,
      timeoutSeconds: 600,
      desiredEntryMin: 0,
      desiredEntryMax: 1,
    },
  });
  const action = await integrationDatabase.agentAction.create({
    data: {
      runId: run.id,
      agentProfileId: profile.id,
      sequence: 1,
      actionType: "CREATE_ENTRY",
      targetType: "TOPIC",
      targetId: randomUUID(),
      input: { body: "Ledger action adayı", safeReason: "Görünür kanıt yanıtı destekliyor." },
    },
  });
  const principal: RuntimePrincipal = {
    credentialId: randomUUID(),
    agentProfileId: profile.id,
    lifecycleStatus: "ACTIVE",
    actor: {
      actorId: user.id,
      actorKind: "AGENT",
      actorRole: "USER",
      requestId: randomUUID(),
      origin: "AGENT",
    },
  };
  return { admin, profile, run, action, principal };
}

function batchInput(subjectId: string) {
  return runtimeLifeEventBatchSchema.parse({
    workerId: "life-worker",
    leaseToken,
    payload: {
      observations: [
        {
          subjectType: "ENTRY",
          subjectId,
          summary: "Görünür entry içindeki iddia ve kanıt birlikte gözlendi.",
          salience: 0.8,
          provenance: {
            evidenceType: "USER_ENTRY",
            evidenceIds: [subjectId],
            shortRationale: "Görünür entry runtime kararına doğrudan kanıt sağladı.",
          },
        },
      ],
      memoryCandidates: [
        {
          subjectType: "ENTRY",
          subjectId,
          summary: "Bu gözlem sonraki run için hatırlanmaya adaydır.",
          salience: 0.7,
          provenance: {
            evidenceType: "USER_ENTRY",
            evidenceIds: [subjectId],
            shortRationale: "Aday bellek görünür entry kanıtına dayanır.",
          },
        },
      ],
      decisionJournal: [
        {
          seq: 1,
          kind: "OPTION_CONSIDERED",
          subject: "Yanıt seçeneği",
          summary: "Kanıta bağlı kısa bir yanıt seçeneği değerlendirildi.",
          confidence: 0.7,
          evidenceIds: [subjectId],
          causedBySeqs: [],
        },
        {
          seq: 2,
          kind: "OPTION_SELECTED",
          subject: "Yanıt seçildi",
          summary: "Yeni bilgi değeri taşıyan kontrollü yanıt seçildi.",
          confidence: 0.85,
          evidenceIds: [subjectId],
          causedBySeqs: [1],
        },
      ],
      actionIntents: [
        {
          sequence: 1,
          desire: 0.78,
          expectedOutcome: "Konuya kanıtı görünür tutan yeni bir çerçeve eklemek.",
          selectedOptionSeq: 2,
        },
      ],
    },
  });
}

async function collectLifeEventsForVerification(
  actor: ActorContext,
  agentProfileId: string,
  input: Parameters<typeof listAgentLifeEvents>[3],
) {
  const items: Awaited<ReturnType<typeof listAgentLifeEvents>>["items"] = [];
  let cursor = input.cursor;
  for (;;) {
    const page = await listAgentLifeEvents(integrationDatabase, actor, agentProfileId, {
      ...input,
      format: "json",
      limit: 500,
      ...(cursor ? { cursor } : {}),
    });
    items.push(...page.items);
    if (!page.nextCursor) return items;
    expect(page.nextCursor).not.toBe(cursor);
    cursor = page.nextCursor;
  }
}

beforeEach(resetIntegrationDatabase);
afterAll(closeIntegrationDatabase);

describe("agent life ledger with PostgreSQL", () => {
  it("persists an idempotent ordered batch with action and causal links", async () => {
    const fixture = await createFixture();
    const input = batchInput(randomUUID());
    const first = await recordRuntimeLifeEventBatch(
      integrationDatabase,
      fixture.principal,
      fixture.run.id,
      input,
    );
    const replay = await recordRuntimeLifeEventBatch(
      integrationDatabase,
      fixture.principal,
      fixture.run.id,
      input,
    );

    expect(first).toMatchObject({ inserted: 5, replayed: false });
    expect(replay).toMatchObject({ inserted: 0, replayed: true, batchId: first.batchId });
    expect(replay.events.map(({ id }) => id)).toEqual(first.events.map(({ id }) => id));

    const records = await integrationDatabase.agentRuntimeEvent.findMany({
      where: { batchId: first.batchId },
      orderBy: { agentSequence: "asc" },
    });
    expect(records.map(({ agentSequence }) => agentSequence)).toEqual([1n, 2n, 3n, 4n, 5n]);
    expect(records.map(({ eventType }) => eventType)).toEqual([
      "OBSERVATION_RECORDED",
      "MEMORY_CANDIDATE_PROPOSED",
      "DECISION_STEP_RECORDED",
      "DECISION_STEP_RECORDED",
      "ACTION_PROPOSED",
    ]);
    expect(records[3]!.causedByEventIds).toEqual([records[2]!.id]);
    expect(records[4]).toMatchObject({ actionId: fixture.action.id, confidence: 0.78 });
    for (const [index, record] of records.entries()) {
      expect(record.contentHash).toMatch(/^[a-f0-9]{64}$/u);
      expect(record.eventHash).toMatch(/^[a-f0-9]{64}$/u);
      expect(record.previousEventHash).toBe(index === 0 ? null : records[index - 1]!.eventHash);
    }
  });

  it("provides descending cursor pages and server-side filters only to admins", async () => {
    const fixture = await createFixture();
    await recordRuntimeLifeEventBatch(
      integrationDatabase,
      fixture.principal,
      fixture.run.id,
      batchInput(randomUUID()),
    );
    const firstPage = await listAgentLifeEvents(
      integrationDatabase,
      adminActor(fixture.admin.id),
      fixture.profile.id,
      { limit: 2, format: "json" },
    );
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toMatch(/^\d+$/u);
    const secondPage = await listAgentLifeEvents(
      integrationDatabase,
      adminActor(fixture.admin.id),
      fixture.profile.id,
      { cursor: firstPage.nextCursor!, limit: 2, format: "json" },
    );
    expect(new Set([...firstPage.items, ...secondPage.items].map(({ id }) => id)).size).toBe(4);

    const actions = await listAgentLifeEvents(
      integrationDatabase,
      adminActor(fixture.admin.id),
      fixture.profile.id,
      { eventType: "ACTION_PROPOSED", runId: fixture.run.id, limit: 20, format: "json" },
    );
    expect(actions.items).toHaveLength(1);
    expect(actions.items[0]).toMatchObject({ actionId: fixture.action.id });

    const moderatorSuffix = randomUUID().replaceAll("-", "");
    const moderatorEmail = `${moderatorSuffix}@integration.test`;
    const moderatorUsername = `moderator_${moderatorSuffix.slice(0, 14)}`;
    const moderator = await integrationDatabase.user.create({
      data: {
        kind: "HUMAN",
        role: "MODERATOR",
        status: "ACTIVE",
        email: moderatorEmail,
        emailNormalized: moderatorEmail,
        username: moderatorUsername,
        usernameNormalized: moderatorUsername,
        displayName: "Unauthorized moderator",
        passwordHash: "not-used",
        termsVersion: "1.0",
        termsAcceptedAt: new Date(),
      },
    });
    await expect(
      listAgentLifeEvents(
        integrationDatabase,
        { ...adminActor(moderator.id), actorRole: "MODERATOR" },
        fixture.profile.id,
        { limit: 20, format: "json" },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects mutation and a forged gap at the database boundary", async () => {
    const fixture = await createFixture();
    const recorded = await recordRuntimeLifeEventBatch(
      integrationDatabase,
      fixture.principal,
      fixture.run.id,
      batchInput(randomUUID()),
    );
    await expect(
      integrationDatabase.agentRuntimeEvent.update({
        where: { id: BigInt(recorded.events[0]!.id) },
        data: { safeMessage: "Sonradan değiştirilmiş kayıt" },
      }),
    ).rejects.toThrow(/append-only/iu);
    await expect(
      integrationDatabase.agentRuntimeEvent.delete({
        where: { id: BigInt(recorded.events[0]!.id) },
      }),
    ).rejects.toThrow(/append-only/iu);

    const autoChained = await integrationDatabase.agentRuntimeEvent.create({
      data: {
        agentProfileId: fixture.profile.id,
        runId: fixture.run.id,
        eventType: "agent.heartbeat",
        safeMessage: "Legacy writer event'i DB tarafından görünür zincire alındı.",
        metadata: { origin: "DB_CHAIN_BOUNDARY_TEST" },
      },
    });
    expect(autoChained.agentSequence).not.toBeNull();
    expect(autoChained.contentHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(autoChained.eventHash).toMatch(/^[a-f0-9]{64}$/u);

    await expect(
      integrationDatabase.agentRuntimeEvent.create({
        data: {
          agentProfileId: fixture.profile.id,
          runId: fixture.run.id,
          agentSequence: autoChained.agentSequence! + 1n,
          eventType: "FAST_STATE_CHANGED",
          safeMessage: "Sırası doğru ama hash'i sahte kayıt.",
          metadata: {},
          contentHash: "a".repeat(64),
          previousEventHash: autoChained.eventHash,
          eventHash: "b".repeat(64),
        },
      }),
    ).rejects.toThrow(/content hash mismatch/iu);

    await expect(
      integrationDatabase.agentRuntimeEvent.create({
        data: {
          agentProfileId: fixture.profile.id,
          runId: fixture.run.id,
          agentSequence: 99n,
          eventType: "FAST_STATE_CHANGED",
          safeMessage: "Sahte sıra boşluğu",
          metadata: {},
          contentHash: "a".repeat(64),
          previousEventHash: "b".repeat(64),
          eventHash: "c".repeat(64),
        },
      }),
    ).rejects.toThrow(/sequence or previous hash mismatch/iu);
  });

  it("computes changed fields and replays belief, relationship and fast-state history", async () => {
    const fixture = await createFixture();
    const histories = [
      {
        eventType: "BELIEF_CHANGED",
        subject: { type: "BELIEF", topicKey: "replayable-belief" },
        states: [
          { confidence: 0.2, version: 1 },
          { confidence: 0.45, version: 2 },
          { confidence: 0.7, version: 3 },
        ],
      },
      {
        eventType: "RELATIONSHIP_CHANGED",
        subject: { type: "USER", id: fixture.admin.id },
        states: [
          { trust: 0.3, familiarity: 0.1 },
          { trust: 0.5, familiarity: 0.2 },
          { trust: 0.6, familiarity: 0.4 },
        ],
      },
      {
        eventType: "FAST_STATE_CHANGED",
        subject: { type: "AGENT_RUNTIME_STATE", id: fixture.profile.id },
        states: [
          { curiosity: 0.2, confidence: 0.3, topicFatigue: {} },
          { curiosity: 0.5, confidence: 0.4, topicFatigue: { replay: 0.2 } },
          { curiosity: 0.7, confidence: 0.8, topicFatigue: { replay: 0.1 } },
        ],
      },
    ] as const;

    await integrationDatabase.$transaction(async (transaction) => {
      for (const history of histories)
        for (let index = 1; index < history.states.length; index += 1)
          await appendRuntimeEvent(transaction, {
            agentProfileId: fixture.profile.id,
            runId: fixture.run.id,
            eventType: history.eventType,
            subject: history.subject,
            safeMessage: `${history.eventType} replay acceptance transition ${index}.`,
            before: history.states[index - 1]!,
            after: history.states[index]!,
            metadata: { origin: "LIFE_LEDGER_ACCEPTANCE" },
          });
    });

    for (const history of histories) {
      const records = await integrationDatabase.agentRuntimeEvent.findMany({
        where: {
          agentProfileId: fixture.profile.id,
          runId: fixture.run.id,
          eventType: history.eventType,
        },
        orderBy: { agentSequence: "asc" },
      });
      expect(records).toHaveLength(2);
      let reconstructed: unknown = history.states[0];
      for (const record of records) {
        expect(record.beforeState).toEqual(reconstructed);
        expect(record.changedFields.length).toBeGreaterThan(0);
        reconstructed = record.afterState;
      }
      expect(reconstructed).toEqual(history.states.at(-1));
    }
  });

  it("exports every filtered event across 500-record cursor pages without duplicates", async () => {
    const fixture = await createFixture();
    await integrationDatabase.$transaction(
      async (transaction) => {
        for (let index = 0; index < 505; index += 1)
          await appendRuntimeEvent(transaction, {
            agentProfileId: fixture.profile.id,
            runId: fixture.run.id,
            eventType: "OBSERVATION_RECORDED",
            subject: { type: "RUN", id: fixture.run.id, index },
            safeMessage: `Export pagination observation ${index + 1}.`,
            confidence: 0.5,
            after: { index },
            metadata: { origin: "EXPORT_INTEGRATION_TEST" },
          });
        await appendRuntimeEvent(transaction, {
          agentProfileId: fixture.profile.id,
          runId: fixture.run.id,
          eventType: "agent.heartbeat",
          safeMessage: "Filter dışındaki kontrol olayı.",
          metadata: { origin: "EXPORT_INTEGRATION_TEST" },
        });
      },
      { timeout: 30_000 },
    );

    const exported = await collectLifeEventsForVerification(
      adminActor(fixture.admin.id),
      fixture.profile.id,
      {
        limit: 1,
        format: "jsonl",
        eventType: "OBSERVATION_RECORDED",
        runId: fixture.run.id,
      },
    );
    expect(exported).toHaveLength(505);
    expect(new Set(exported.map(({ id }) => id)).size).toBe(505);
    expect(exported.every(({ eventType }) => eventType === "OBSERVATION_RECORDED")).toBe(true);
    expect(
      exported.every(
        (event, index) => index === 0 || BigInt(event.id) < BigInt(exported[index - 1]!.id),
      ),
    ).toBe(true);

    const startingCursor = exported[249]!.id;
    const remainder = await collectLifeEventsForVerification(
      adminActor(fixture.admin.id),
      fixture.profile.id,
      {
        cursor: startingCursor,
        limit: 500,
        format: "jsonl",
        eventType: "OBSERVATION_RECORDED",
        runId: fixture.run.id,
      },
    );
    expect(remainder).toHaveLength(255);
    expect(remainder.every(({ id }) => BigInt(id) < BigInt(startingCursor))).toBe(true);
  }, 40_000);
});
