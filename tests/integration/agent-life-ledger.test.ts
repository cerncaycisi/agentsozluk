import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  listAgentLifeEvents,
  recordRuntimeLifeEventBatch,
} from "@/modules/agents/application/life-ledger";
import {
  agentSourceAdminUpdateSchema,
  createAgent,
  createAgentSchema,
  executeRuntimeAction,
  invalidateAgentMemory,
  invalidateAgentMemorySchema,
  recordRuntimeDecisionBatch,
  runtimeDecisionBatchSchema,
  updateAgentSourceAdmin,
} from "@/modules/agents";
import { appendRuntimeEvent } from "@/modules/agents/repository/control-plane";
import type { RuntimePrincipal } from "@/modules/agents/application/runtime-auth";
import { runtimeLifeEventBatchSchema } from "@/modules/agents/validation/life-schemas";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { sha256 } from "@/lib/security/crypto";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

const leaseToken = "l".repeat(43);
const reconstructionWorkerId = "life-reconstruction-worker";

type JsonRecord = Record<string, unknown>;

function jsonRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("EXPECTED_JSON_RECORD");
  return value as JsonRecord;
}

function jsonRecords(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) throw new Error("EXPECTED_JSON_ARRAY");
  return value.map(jsonRecord);
}

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

async function createApplicationFixture() {
  const suffix = randomUUID().replaceAll("-", "");
  const admin = await integrationDatabase.user.create({
    data: {
      kind: "HUMAN",
      role: "ADMIN",
      status: "ACTIVE",
      email: `reconstruction-admin-${suffix}@integration.test`,
      emailNormalized: `reconstruction-admin-${suffix}@integration.test`,
      username: `reconstruction_admin_${suffix.slice(0, 8)}`,
      usernameNormalized: `reconstruction_admin_${suffix.slice(0, 8)}`,
      displayName: "Reconstruction admin",
      passwordHash: "not-used",
      termsVersion: "1.0",
      termsAcceptedAt: new Date(),
    },
  });
  const created = await createAgent(
    integrationDatabase,
    adminActor(admin.id),
    createAgentSchema.parse({
      persona: originalPersonaPack.personas[0],
      creation: {
        method: "TEMPLATE",
        templateUsername: originalPersonaPack.personas[0]!.username,
      },
    }),
  );
  return { admin, created };
}

async function createReconstructionRun(input: {
  profileId: string;
  userId: string;
  personaVersionId: string;
  targetUserId: string;
}) {
  await integrationDatabase.agentProfile.update({
    where: { id: input.profileId },
    data: { lifecycleStatus: "ACTIVE" },
  });
  const now = new Date();
  const run = await integrationDatabase.agentRun.create({
    data: {
      agentProfileId: input.profileId,
      runType: "NORMAL_WAKE",
      runStatus: "RUNNING",
      queuePriority: "MANUAL_SINGLE",
      trigger: "LIFE_RECONSTRUCTION_INTEGRATION",
      personaVersionId: input.personaVersionId,
      idempotencyKey: randomUUID(),
      leaseOwner: reconstructionWorkerId,
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
    agentProfileId: input.profileId,
    lifecycleStatus: "ACTIVE",
    actor: {
      actorId: input.userId,
      actorKind: "AGENT",
      actorRole: "USER",
      requestId: randomUUID(),
      origin: "AGENT",
    },
  };
  const provenance = {
    evidenceType: "PLATFORM_EVENT" as const,
    evidenceIds: [run.id],
    shortRationale: "Owned runtime run görünür ve doğrulanabilir state kanıtıdır.",
  };
  const actions = [
    {
      sequence: 1,
      actionType: "UPDATE_BELIEF" as const,
      safeReason: "İlk görünür belief durumu oluşturuluyor.",
      input: {
        topicKey: "reconstruction-proof",
        statement: "İlk ölçülebilir reconstruction inancı.",
        confidence: 0.6,
        summary: "Görünür runtime run ilk belief kanıtını sağladı.",
      },
      provenance,
    },
    {
      sequence: 2,
      actionType: "UPDATE_RELATIONSHIP_NOTE" as const,
      safeReason: "İlk görünür relationship durumu oluşturuluyor.",
      targetType: "USER",
      targetId: input.targetUserId,
      input: {
        userId: input.targetUserId,
        familiarity: 0.2,
        trust: 0.5,
        interest: 0.6,
        disagreement: 0.1,
        summary: "Görünür platform olayı sınırlı bir ilişki kanıtı sağladı.",
      },
      provenance,
    },
    {
      sequence: 3,
      actionType: "FOLLOW_USER" as const,
      safeReason: "Görünür kullanıcı kontrollü biçimde takip ediliyor.",
      targetType: "USER",
      targetId: input.targetUserId,
      input: { userId: input.targetUserId },
    },
    {
      sequence: 4,
      actionType: "CREATE_TOPIC_WITH_ENTRY" as const,
      safeReason: "Own public state kontrollü bir topic ve entry ile oluşturuluyor.",
      input: {
        title: "reconstruction boundary public state",
        body: "Bu entry yalnız canonical reconstruction doğrulaması için oluşturuldu.",
      },
      provenance,
    },
    {
      sequence: 5,
      actionType: "UPDATE_BELIEF" as const,
      safeReason: "Belief yeni görünür kanıtla sürümleniyor.",
      input: {
        topicKey: "reconstruction-proof",
        statement: "İkinci ölçülebilir reconstruction inancı.",
        confidence: 0.72,
        summary: "Aynı görünür runtime run ikinci belief kanıtını sağladı.",
      },
      provenance,
    },
    {
      sequence: 6,
      actionType: "UPDATE_RELATIONSHIP_NOTE" as const,
      safeReason: "Relationship yeni görünür kanıtla güncelleniyor.",
      targetType: "USER",
      targetId: input.targetUserId,
      input: {
        userId: input.targetUserId,
        familiarity: 0.4,
        trust: 0.58,
        interest: 0.7,
        disagreement: 0.05,
        summary: "İkinci görünür platform olayı ilişki durumunu güncelledi.",
      },
      provenance,
    },
    {
      sequence: 7,
      actionType: "UNFOLLOW_USER" as const,
      safeReason: "Kullanıcı takibi kontrollü biçimde kaldırılıyor.",
      targetType: "USER",
      targetId: input.targetUserId,
      input: { userId: input.targetUserId },
    },
  ];
  await recordRuntimeDecisionBatch(
    integrationDatabase,
    principal,
    run.id,
    runtimeDecisionBatchSchema.parse({
      workerId: reconstructionWorkerId,
      leaseToken,
      actions,
      payload: {
        observations: [],
        memoryCandidates: [],
        decisionJournal: [
          {
            seq: 1,
            kind: "OPTION_SELECTED",
            subject: "Authoritative state mutation",
            summary: "Server-authoritative mutation yolları reconstruction için seçildi.",
            confidence: 0.9,
            evidenceIds: [run.id],
            causedBySeqs: [],
          },
        ],
        actionIntents: actions.map(({ sequence }) => ({
          sequence,
          desire: 0.8,
          expectedOutcome: `Action ${sequence} server-authoritative state üretecek.`,
          selectedOptionSeq: 1,
        })),
      },
    }),
  );
  return { principal, run };
}

async function executeReconstructionActions(
  principal: RuntimePrincipal,
  runId: string,
  sequences: number[],
) {
  for (const sequence of sequences)
    await expect(
      executeRuntimeAction(integrationDatabase, principal, runId, {
        workerId: reconstructionWorkerId,
        leaseToken,
        sequence,
      }),
    ).resolves.toMatchObject({ actionStatus: "SUCCEEDED" });
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

  it("uses the canonical safe reconstruction projection for new-agent genesis", async () => {
    const fixture = await createApplicationFixture();
    const profileId = fixture.created.agent.profile.id;
    const genesis = await integrationDatabase.agentRuntimeEvent.findFirstOrThrow({
      where: {
        agentProfileId: profileId,
        eventType: "LIFE_GENESIS_SNAPSHOT",
        metadata: { path: ["origin"], equals: "AGENT_CREATION" },
      },
    });
    const [current] = await integrationDatabase.$queryRaw<Array<{ snapshot: unknown }>>`
      SELECT agent_life_reconstruction_snapshot(${profileId}::UUID) AS "snapshot"
    `;

    expect(genesis.afterState).toEqual(current!.snapshot);
    expect(genesis.metadata).toMatchObject({
      origin: "AGENT_CREATION",
      boundary: true,
      reconstructionVersion: 1,
    });
    expect(jsonRecord(genesis.afterState)).toMatchObject({
      reconstructionVersion: 1,
      beliefs: [],
      relationships: [],
      memories: [],
      socialState: {
        followedTopicIds: [],
        followedUserIds: [],
        bookmarkedEntryIds: [],
        votes: [],
      },
      actions: [],
    });
    const serialized = JSON.stringify(genesis.afterState);
    for (const source of originalPersonaPack.personas[0]!.sources)
      expect(serialized).not.toContain(source.url);
    expect(serialized).not.toContain(fixture.created.credential);
    expect(serialized).not.toMatch(/chain.?of.?thought|rawPrompt|rawReasoning/iu);
  });

  it("reconstructs real application mutations from an idempotent migration boundary", async () => {
    const fixture = await createApplicationFixture();
    const profileId = fixture.created.agent.profile.id;
    const userId = fixture.created.agent.user.id;
    const personaVersionId = fixture.created.agent.personaVersion.id;
    const runtime = await createReconstructionRun({
      profileId,
      userId,
      personaVersionId,
      targetUserId: fixture.admin.id,
    });
    await executeReconstructionActions(runtime.principal, runtime.run.id, [1, 2, 3, 4]);

    const unsafeOpaque = "Zx9_Qp2Lm7-Rt4Vn8Ks1Hd6W";
    const unsafeOtp = "481205";
    const unsafePrivateKey = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
    const unsafeJwt = `eyJ${"a".repeat(10)}.${"b".repeat(10)}.${"c".repeat(8)}`;
    const unsafeStructuredSecret = { password: "hunter2" };
    const unsafePaddedUuid = ` ${profileId} `;
    const unsafeNbspUuid = `\u00a0${profileId}\u00a0`;
    const unsafeOverlongKey = "x".repeat(101);
    await integrationDatabase.agentRuntimeState.update({
      where: { agentProfileId: profileId },
      data: {
        runtimeMetadata: {
          fastState: {
            curiosity: 0.55,
            confidence: 0.65,
            topicFatigue: {
              "safe-topic": 0.25,
              " safe-topic ": 0.75,
              "": 0.4,
              [unsafePaddedUuid]: 0.6,
              [unsafeNbspUuid]: 0.65,
              [unsafeOverlongKey]: 0.7,
              [unsafeOpaque]: 0.5,
              [`agt_${"c".repeat(43)}`]: 0.75,
            },
          },
        },
      },
    });
    await integrationDatabase.agentBelief.updateMany({
      where: { agentProfileId: profileId, topicKey: "reconstruction-proof" },
      data: { evidenceSummary: unsafeOpaque },
    });
    const legacyMemories = await integrationDatabase.agentMemoryEpisode.findMany({
      where: { agentProfileId: profileId, runId: runtime.run.id },
      orderBy: { occurredAt: "asc" },
      take: 3,
    });
    expect(legacyMemories).toHaveLength(3);
    await Promise.all(
      [unsafeOtp, unsafePrivateKey, unsafeJwt].map((summary, index) =>
        integrationDatabase.agentMemoryEpisode.update({
          where: { id: legacyMemories[index]!.id },
          data: { summary },
        }),
      ),
    );
    const legacyAction = await integrationDatabase.agentAction.findFirstOrThrow({
      where: { agentProfileId: profileId, runId: runtime.run.id },
      orderBy: { sequence: "asc" },
    });
    await integrationDatabase.agentAction.update({
      where: { id: legacyAction.id },
      data: { result: unsafeStructuredSecret },
    });

    const [invalidFastState] = await integrationDatabase.$queryRaw<Array<{ fastState: unknown }>>`
      SELECT agent_life_snapshot_safe_fast_state(
        ${JSON.stringify({ confidence: 0.5, topicFatigue: {} })}::JSONB
      ) AS "fastState"
    `;
    expect(invalidFastState!.fastState).toBeNull();
    const safeSourceUrl = "https://example.com/article?lang=tr";
    const [urlHashProbe] = await integrationDatabase.$queryRaw<
      Array<{
        safeHash: string | null;
        signedHash: string | null;
        userInfoHash: string | null;
        fragmentHash: string | null;
      }>
    >`
      SELECT
        agent_life_snapshot_safe_url_hash(${safeSourceUrl}) AS "safeHash",
        agent_life_snapshot_safe_url_hash('https://example.com/?token=hunter2') AS "signedHash",
        agent_life_snapshot_safe_url_hash('https://user:hunter2@example.com/article') AS "userInfoHash",
        agent_life_snapshot_safe_url_hash('https://example.com/article#hunter2') AS "fragmentHash"
    `;
    expect(urlHashProbe).toEqual({
      safeHash: sha256(safeSourceUrl),
      signedHash: null,
      userInfoHash: null,
      fragmentHash: null,
    });

    const [firstBoundary] = await integrationDatabase.$queryRaw<Array<{ eventId: bigint }>>`
      SELECT append_agent_life_reconstruction_boundary(${profileId}::UUID) AS "eventId"
    `;
    const [replayedBoundary] = await integrationDatabase.$queryRaw<Array<{ eventId: bigint }>>`
      SELECT append_agent_life_reconstruction_boundary(${profileId}::UUID) AS "eventId"
    `;
    expect(replayedBoundary!.eventId).toBe(firstBoundary!.eventId);
    expect(
      await integrationDatabase.agentRuntimeEvent.count({
        where: {
          agentProfileId: profileId,
          eventType: "LIFE_GENESIS_SNAPSHOT",
          metadata: {
            path: ["origin"],
            equals: "LIFE_LEDGER_RECONSTRUCTION_MIGRATION",
          },
        },
      }),
    ).toBe(1);

    const boundary = await integrationDatabase.agentRuntimeEvent.findUniqueOrThrow({
      where: { id: firstBoundary!.eventId },
    });
    const boundaryState = jsonRecord(boundary.afterState);
    expect(boundaryState).toMatchObject({
      reconstructionVersion: 1,
      beliefs: [expect.objectContaining({ topicKey: "reconstruction-proof", version: 1 })],
      relationships: [expect.objectContaining({ targetUserId: fixture.admin.id, trust: 0.5 })],
      socialState: expect.objectContaining({
        followedUserIds: [fixture.admin.id],
        ownEntries: [expect.objectContaining({ status: "ACTIVE" })],
        ownTopics: [expect.objectContaining({ status: "ACTIVE" })],
      }),
    });
    expect(jsonRecords(boundaryState.sources).length).toBeGreaterThan(0);
    const persistedSource = await integrationDatabase.agentSource.findFirstOrThrow({
      where: { agentProfileId: profileId },
      orderBy: { id: "asc" },
    });
    expect(
      jsonRecords(boundaryState.sources).find((source) => source.id === persistedSource.id),
    ).toMatchObject({ urlHash: sha256(persistedSource.url) });
    expect(jsonRecords(boundaryState.memories)).toHaveLength(4);
    expect(jsonRecords(boundaryState.actions)).toHaveLength(7);
    const boundaryRuntime = jsonRecord(boundaryState.runtime);
    expect(jsonRecord(boundaryRuntime.fastState)).toEqual({
      curiosity: 0.55,
      confidence: 0.65,
      topicFatigue: { "safe-topic": 0.25 },
    });
    expect(boundaryRuntime.runtimeMetadataHash).toBeNull();
    const boundaryBelief = jsonRecords(boundaryState.beliefs).find(
      (belief) => belief.topicKey === "reconstruction-proof",
    );
    expect(boundaryBelief).toMatchObject({ evidenceSummary: null, evidenceSummaryHash: null });
    const boundaryMemories = new Map(
      jsonRecords(boundaryState.memories).map((memory) => [String(memory.id), memory]),
    );
    for (const memory of legacyMemories)
      expect(boundaryMemories.get(memory.id)).toMatchObject({ summary: null, summaryHash: null });
    expect(
      jsonRecords(boundaryState.actions).find((action) => action.id === legacyAction.id),
    ).toMatchObject({ result: null, resultHash: null });
    const serializedBoundary = JSON.stringify(boundaryState);
    for (const source of originalPersonaPack.personas[0]!.sources)
      expect(serializedBoundary).not.toContain(source.url);
    expect(serializedBoundary).not.toContain(fixture.created.credential);
    expect(serializedBoundary).not.toContain(unsafeOpaque);
    expect(serializedBoundary).not.toContain(unsafePrivateKey);
    expect(serializedBoundary).not.toContain(unsafeJwt);
    expect(serializedBoundary).not.toContain(unsafeStructuredSecret.password);
    expect(serializedBoundary).not.toContain(unsafePaddedUuid);
    expect(serializedBoundary).not.toContain(unsafeNbspUuid);
    expect(serializedBoundary).not.toContain(unsafeOverlongKey);
    expect(serializedBoundary).not.toContain(`agt_${"c".repeat(43)}`);
    expect(serializedBoundary).toContain("İlk ölçülebilir reconstruction inancı.");
    expect(serializedBoundary).toContain(
      "Görünür platform olayı sınırlı bir ilişki kanıtı sağladı.",
    );

    await executeReconstructionActions(runtime.principal, runtime.run.id, [5, 6, 7]);
    const source = await integrationDatabase.agentSource.findFirstOrThrow({
      where: { agentProfileId: profileId },
      orderBy: { id: "asc" },
    });
    await updateAgentSourceAdmin(
      integrationDatabase,
      adminActor(fixture.admin.id),
      source.id,
      agentSourceAdminUpdateSchema.parse({
        adminPinned: true,
        reason: "Reconstruction source state gerçek admin yoluyla güncellendi.",
      }),
    );
    const memory = await integrationDatabase.agentMemoryEpisode.findFirstOrThrow({
      where: { agentProfileId: profileId, runId: runtime.run.id, eventType: "ACTION_EXECUTED" },
      orderBy: { occurredAt: "asc" },
    });
    await invalidateAgentMemory(
      integrationDatabase,
      adminActor(fixture.admin.id),
      profileId,
      memory.id,
      invalidateAgentMemorySchema.parse({
        reason: "Reconstruction replay invalidation durumunu doğrulamalıdır.",
        confirmation: "INVALIDATE_AGENT_MEMORY",
      }),
    );

    const beliefState = new Map(
      jsonRecords(boundaryState.beliefs).map((belief) => [
        String(belief.topicKey),
        {
          id: String(belief.id),
          topicKey: String(belief.topicKey),
          statementHash: String(belief.statementHash),
          confidence: belief.confidence,
          version: belief.version,
          status: belief.status,
        },
      ]),
    );
    const relationshipState = new Map(
      jsonRecords(boundaryState.relationships).map((relationship) => [
        String(relationship.targetUserId),
        {
          id: String(relationship.id),
          targetUserId: String(relationship.targetUserId),
          familiarity: relationship.familiarity,
          trust: relationship.trust,
          interest: relationship.interest,
          disagreement: relationship.disagreement,
          summaryHash: String(relationship.summaryHash),
        },
      ]),
    );
    const sourceState = new Map(
      jsonRecords(boundaryState.sources).map((item) => [String(item.id), { ...item }]),
    );
    const memoryState = new Map(
      jsonRecords(boundaryState.memories).map((item) => [
        String(item.id),
        {
          id: String(item.id),
          eventType: String(item.eventType),
          invalidatedAt: item.invalidatedAt,
        },
      ]),
    );
    const actionState = new Map(
      jsonRecords(boundaryState.actions).map((item) => [
        String(item.id),
        { id: String(item.id), status: String(item.status) },
      ]),
    );
    const social = jsonRecord(boundaryState.socialState);
    const followedUserIds = new Set((social.followedUserIds as unknown[]).map(String));
    const events = await integrationDatabase.agentRuntimeEvent.findMany({
      where: {
        agentProfileId: profileId,
        agentSequence: { gt: boundary.agentSequence! },
      },
      orderBy: { agentSequence: "asc" },
    });
    expect(events.map(({ agentSequence }) => agentSequence)).toEqual(
      [...events].map((_, index) => boundary.agentSequence! + BigInt(index + 1)),
    );

    for (const event of events) {
      const subject = event.subject ? jsonRecord(event.subject) : {};
      const after = event.afterState ? jsonRecord(event.afterState) : {};
      if (event.eventType === "BELIEF_CHANGED") {
        const topicKey = String(subject.topicKey);
        beliefState.set(topicKey, {
          id: String(subject.id),
          topicKey,
          statementHash: sha256(String(after.statement)),
          confidence: after.confidence,
          version: after.version,
          status: after.status,
        });
      }
      if (event.eventType === "RELATIONSHIP_CHANGED") {
        const targetUserId = String(subject.id);
        relationshipState.set(targetUserId, {
          id: String(subject.relationshipId),
          targetUserId,
          familiarity: after.familiarity,
          trust: after.trust,
          interest: after.interest,
          disagreement: after.disagreement,
          summaryHash: sha256(String(after.summary)),
        });
      }
      if (event.eventType === "SOURCE_STATE_CHANGED") {
        const sourceId = String(subject.id);
        sourceState.set(sourceId, { ...sourceState.get(sourceId), ...after, id: sourceId });
      }
      if (event.eventType === "MEMORY_CANDIDATE_COMMITTED") {
        const memoryId = String(after.memoryId);
        memoryState.set(memoryId, {
          id: memoryId,
          eventType: String(after.eventType),
          invalidatedAt: null,
        });
      }
      if (event.eventType === "MEMORY_CHANGED") {
        const memoryId = String(subject.id);
        const previous = memoryState.get(memoryId);
        if (!previous) throw new Error("RECONSTRUCTION_MEMORY_BASELINE_MISSING");
        memoryState.set(memoryId, { ...previous, invalidatedAt: after.invalidatedAt });
      }
      if (event.eventType === "ACTION_STATUS_CHANGED") {
        const actionId = String(subject.id);
        actionState.set(actionId, { id: actionId, status: String(after.status) });
        if (after.status === "SUCCEEDED" && after.result) {
          const result = jsonRecord(after.result);
          if (subject.actionType === "FOLLOW_USER" && result.followed === true)
            followedUserIds.add(String(result.userId));
          if (subject.actionType === "UNFOLLOW_USER" && result.followed === false)
            followedUserIds.delete(String(result.userId));
        }
      }
    }

    const beliefRows = await integrationDatabase.agentBelief.findMany({
      where: { agentProfileId: profileId },
      orderBy: [{ topicKey: "asc" }, { version: "desc" }],
    });
    const currentBeliefs = new Map<string, (typeof beliefRows)[number]>();
    for (const belief of beliefRows)
      if (!currentBeliefs.has(belief.topicKey)) currentBeliefs.set(belief.topicKey, belief);
    expect(
      [...beliefState.values()].sort((left, right) => left.topicKey.localeCompare(right.topicKey)),
    ).toEqual(
      [...currentBeliefs.values()].map((belief) => ({
        id: belief.id,
        topicKey: belief.topicKey,
        statementHash: sha256(belief.statement),
        confidence: belief.confidence,
        version: belief.version,
        status: belief.status,
      })),
    );

    const relationships = await integrationDatabase.agentRelationship.findMany({
      where: { agentProfileId: profileId },
      orderBy: { targetUserId: "asc" },
    });
    expect(
      [...relationshipState.values()].sort((left, right) =>
        left.targetUserId.localeCompare(right.targetUserId),
      ),
    ).toEqual(
      relationships.map((relationship) => ({
        id: relationship.id,
        targetUserId: relationship.targetUserId,
        familiarity: relationship.familiarity,
        trust: relationship.trust,
        interest: relationship.interest,
        disagreement: relationship.disagreement,
        summaryHash: sha256(relationship.summary),
      })),
    );

    const sources = await integrationDatabase.agentSource.findMany({
      where: { agentProfileId: profileId },
      orderBy: { id: "asc" },
    });
    expect(
      [...sourceState.values()]
        .map((item) => ({
          id: String(item.id),
          status: item.status,
          trustScore: item.trustScore,
          interestScore: item.interestScore,
          noveltyScore: item.noveltyScore,
          usefulnessScore: item.usefulnessScore,
          adminPinned: item.adminPinned,
          adminBlocked: item.adminBlocked,
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    ).toEqual(
      sources.map((item) => ({
        id: item.id,
        status: item.status,
        trustScore: item.trustScore,
        interestScore: item.interestScore,
        noveltyScore: item.noveltyScore,
        usefulnessScore: item.usefulnessScore,
        adminPinned: item.adminPinned,
        adminBlocked: item.adminBlocked,
      })),
    );

    const memories = await integrationDatabase.agentMemoryEpisode.findMany({
      where: { agentProfileId: profileId },
      orderBy: { id: "asc" },
    });
    expect(
      [...memoryState.values()].sort((left, right) => left.id.localeCompare(right.id)),
    ).toEqual(
      memories.map((item) => ({
        id: item.id,
        eventType: item.eventType,
        invalidatedAt: item.invalidatedAt?.toISOString() ?? null,
      })),
    );
    expect([...followedUserIds].sort()).toEqual(
      (
        await integrationDatabase.userFollow.findMany({
          where: { followerId: userId },
          select: { followedId: true },
          orderBy: { followedId: "asc" },
        })
      ).map(({ followedId }) => followedId),
    );
    expect(
      [...actionState.values()].sort((left, right) => left.id.localeCompare(right.id)),
    ).toEqual(
      (
        await integrationDatabase.agentAction.findMany({
          where: { agentProfileId: profileId },
          select: { id: true, actionStatus: true },
          orderBy: { id: "asc" },
        })
      ).map(({ id, actionStatus }) => ({ id, status: actionStatus })),
    );
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
