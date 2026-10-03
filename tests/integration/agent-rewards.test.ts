import {
  runtimeReadTopicEntryLimit,
  truncateUntrustedText,
} from "@/modules/agents/domain/perception";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  issuePurposeAssessmentPacket,
  submitPurposeAssessment,
  reversePurposeAssessment,
  changeRewardMode,
} from "@/modules/agents/application/rewards";
import { appendRuntimeEvent } from "@/modules/agents/repository/control-plane";
import type { ActorContext } from "@/modules/auth/domain/actor";
import {
  closeIntegrationDatabase,
  integrationDatabase as db,
  resetIntegrationDatabase,
} from "./database";

const now = new Date("2026-10-04T00:00:00.000Z");
const actor = (id: string): ActorContext => ({
  actorId: id,
  actorKind: "HUMAN",
  actorRole: "ADMIN",
  requestId: randomUUID(),
  origin: "API",
});
async function fixture() {
  const suffix = randomUUID().slice(0, 8);
  const user = async (name: string, kind: "HUMAN" | "AGENT", role: "ADMIN" | "USER") =>
    db.user.create({
      data: {
        kind,
        loginDisabled: kind === "AGENT",
        role,
        status: "ACTIVE",
        email: `${name}-${suffix}@integration.test`,
        emailNormalized: `${name}-${suffix}@integration.test`,
        username: `${name}_${suffix}`,
        usernameNormalized: `${name}_${suffix}`,
        displayName: name,
        passwordHash: "not-used",
        termsVersion: "1",
        termsAcceptedAt: now,
      },
    });
  const admin = await user("reward_admin", "HUMAN", "ADMIN");
  const writer = await user("reward_writer", "AGENT", "USER");
  const profile = await db.agentProfile.create({
    data: {
      userId: writer.id,
      lifecycleStatus: "ACTIVE",
      activeTimeProfile: {},
      createdById: admin.id,
      updatedById: admin.id,
    },
  });
  const persona = await db.agentPersonaVersion.create({
    data: {
      agentProfileId: profile.id,
      version: 1,
      persona: {},
      renderedPrompt: "Yerel amaç testi.",
      changeOrigin: "INITIAL",
      changeSummary: "Yerel test",
      createdById: admin.id,
      validationReport: { passed: true },
    },
  });
  const run = await db.agentRun.create({
    data: {
      agentProfileId: profile.id,
      runType: "NORMAL_WAKE",
      runStatus: "SUCCEEDED",
      queuePriority: "MANUAL_SINGLE",
      trigger: "TEST",
      idempotencyKey: randomUUID(),
      timeoutSeconds: 600,
      personaVersionId: persona.id,
      desiredEntryMin: 0,
      desiredEntryMax: 1,
    },
  });
  const topic = await db.topic.create({
    data: {
      title: "Ödül için okunan konu",
      normalizedTitle: `odul ${suffix}`,
      slug: `odul-${suffix}`,
      createdById: admin.id,
    },
  });
  const entry = await db.entry.create({
    data: {
      topicId: topic.id,
      authorId: admin.id,
      body: "Bu konu birden fazla yoruma açık, yazmak zorunlu değil.",
      normalizedBody: "konu",
      origin: "WEB",
    },
  });
  await db.agentRun.update({
    where: { id: run.id },
    data: {
      perceptionSummary: {
        readTopics: [
          {
            id: topic.id,
            title: topic.title,
            entries: [{ id: entry.id, body: entry.body, username: admin.username, mine: false }],
          },
        ],
      },
    },
  });
  const event = await db.$transaction((tx) =>
    appendRuntimeEvent(tx, {
      agentProfileId: profile.id,
      runId: run.id,
      eventType: "DECISION_STEP_RECORDED",
      subject: { kind: "INTERPRETATION" },
      evidenceIds: [topic.id],
      safeMessage: "Eksik katkı bulamadım; tekrar yazmak yerine bu amacı kapatabilirim.",
      occurredAt: new Date(now.getTime() - 1000),
    }),
  );
  const purpose = await db.agentPurpose.create({
    data: {
      agentProfileId: profile.id,
      creationRunId: run.id,
      claimRunId: run.id,
      kind: "EXPLORE_CONTRIBUTION",
      targetType: "TOPIC",
      targetId: topic.id,
      question: "Bu konuda eksik kalan katkı var mı?",
      topicKey: topic.title,
      completionCriterion: "TOPIC_READ_AND_REVIEW_RECORDED",
      baseline: {},
      activeSlot: 1,
      activeKey: `EXPLORE:${topic.id}`,
      claimStatus: "EVIDENCE_MET",
      claimEvidence: { decisionEventId: event.id.toString() },
      createdAt: new Date(now.getTime() - 2000),
      expiresAt: new Date(now.getTime() + 86400000),
    },
  });
  const adminActor = actor(admin.id);
  const issue = () =>
    issuePurposeAssessmentPacket(
      db,
      adminActor,
      { agentProfileId: profile.id, purposeId: purpose.id },
      now,
    );
  const mode = (value: "SHADOW" | "FULFILL_SLOT", expectedMode: "OFF" | "SHADOW" = "OFF") =>
    changeRewardMode(db, adminActor, {
      mode: value,
      expectedMode,
      reason: "Yerel kontrollü test.",
    });
  const submit = async (
    packet: Awaited<ReturnType<typeof issue>>,
    verdict: "SUPPORTED" | "INSUFFICIENT" | "CORRECTIVE" = "SUPPORTED",
  ) =>
    submitPurposeAssessment(
      db,
      adminActor,
      {
        packetId: packet.packetId,
        nonce: packet.nonce,
        packageHash: packet.packageHash,
        verdict,
        reviewerModel: "independent-test-reviewer",
        independentReviewConfirmed: true,
        reason: "İncelenen kanıt niyetin tamamlandığını destekliyor.",
      },
      now,
    );
  return {
    admin,
    writer,
    profile,
    run,
    topic,
    entry,
    event,
    purpose,
    adminActor,
    issue,
    mode,
    submit,
  };
}

beforeEach(resetIntegrationDatabase);
afterAll(closeIntegrationDatabase);
describe("independent purpose assessment with PostgreSQL", () => {
  it("defaults off; shadow records evidence without freeing a slot; explicit activation fulfills once", async () => {
    const f = await fixture();
    await expect(f.issue()).rejects.toMatchObject({ code: "AGENT_REWARD_CONFLICT" });
    await f.mode("SHADOW");
    const packet = await f.issue();
    expect(JSON.stringify(packet.packet)).not.toContain(f.admin.username);
    expect(JSON.stringify(packet.packet)).not.toContain(f.writer.username);
    const shadow = await f.submit(packet);
    expect(shadow).toMatchObject({ applied: false, disposition: "SHADOW_SUPPORTED" });
    expect(await db.agentPurpose.findUnique({ where: { id: f.purpose.id } })).toMatchObject({
      status: "ACTIVE",
      activeSlot: 1,
    });
    await expect(f.submit(packet)).rejects.toMatchObject({ code: "AGENT_REWARD_CONFLICT" });
    await f.mode("FULFILL_SLOT", "SHADOW");
    expect(await f.submit(await f.issue())).toMatchObject({
      applied: true,
      disposition: "FULFILLED",
    });
    expect(await db.agentPurpose.findUnique({ where: { id: f.purpose.id } })).toMatchObject({
      status: "FULFILLED",
      activeSlot: null,
      activeKey: null,
      version: 2,
    });
    expect(await db.agentRewardAssessment.count()).toBe(2);
    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: "agent.reward.assessed", entityId: shadow.assessmentId },
    });
    expect(audit.metadata).toMatchObject({ independentReviewConfirmed: true });
  });
  it("requires current human administrator in the application layer", async () => {
    const f = await fixture();
    await f.mode("SHADOW");
    await expect(
      issuePurposeAssessmentPacket(
        db,
        { ...f.adminActor, actorId: f.writer.id },
        { agentProfileId: f.profile.id, purposeId: f.purpose.id },
        now,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db.user.update({ where: { id: f.admin.id }, data: { role: "MODERATOR" } });
    await expect(f.issue()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("binds nonce, goal version, exact content and packet expiry", async () => {
    const f = await fixture();
    await f.mode("FULFILL_SLOT");
    const packet = await f.issue();
    await expect(f.submit({ ...packet, nonce: "a".repeat(43) })).rejects.toMatchObject({
      code: "AGENT_REWARD_CONFLICT",
    });
    await db.entry.update({ where: { id: f.entry.id }, data: { body: "İçerik artık farklı." } });
    await expect(f.submit(packet)).rejects.toMatchObject({ code: "AGENT_REWARD_CONFLICT" });
    await db.entry.update({ where: { id: f.entry.id }, data: { body: f.entry.body } });
    await db.agentPurpose.update({ where: { id: f.purpose.id }, data: { version: 2 } });
    await expect(f.submit(packet)).rejects.toMatchObject({ code: "AGENT_REWARD_CONFLICT" });
    const fresh = await f.issue();
    await expect(
      submitPurposeAssessment(
        db,
        f.adminActor,
        {
          ...fresh,
          verdict: "SUPPORTED",
          reviewerModel: "independent",
          independentReviewConfirmed: true,
          reason: "Kanıtı bağımsız değerlendirdim.",
        },
        new Date(now.getTime() + 16 * 60000),
      ),
    ).rejects.toMatchObject({ code: "AGENT_REWARD_CONFLICT" });
    expect(await db.agentRewardAssessment.count()).toBe(0);
  });
  it.each(["INSUFFICIENT", "CORRECTIVE"] as const)(
    "keeps %s neutral and leaves moderation and active slots unchanged",
    async (verdict) => {
      const f = await fixture();
      await f.mode("FULFILL_SLOT");
      expect(await f.submit(await f.issue(), verdict)).toMatchObject({
        applied: false,
        disposition: "NO_REWARD",
      });
      expect(await db.agentPurpose.findUnique({ where: { id: f.purpose.id } })).toMatchObject({
        status: "ACTIVE",
        activeSlot: 1,
      });
      expect(await db.moderationAction.count()).toBe(0);
    },
  );
  it("reverses append-only without reopening a third slot or restoring spent credit", async () => {
    const f = await fixture();
    await f.mode("FULFILL_SLOT");
    const awarded = await f.submit(await f.issue());
    const base = {
      agentProfileId: f.profile.id,
      creationRunId: f.run.id,
      claimRunId: f.run.id,
      kind: "EXPLORE_CONTRIBUTION" as const,
      targetType: "TOPIC",
      targetId: f.topic.id,
      question: "Yeni amacım için katkı arıyorum.",
      topicKey: f.topic.title,
      completionCriterion: "TOPIC_READ_AND_REVIEW_RECORDED",
      baseline: {},
      claimStatus: "EVIDENCE_MET" as const,
      claimEvidence: { decisionEventId: f.event.id.toString() },
      createdAt: new Date(now.getTime() - 2000),
      expiresAt: new Date(now.getTime() + 86400000),
    };
    const next = await db.agentPurpose.create({
      data: { ...base, activeSlot: 1, activeKey: "new-one" },
    });
    await db.agentPurpose.create({ data: { ...base, activeSlot: 2, activeKey: "new-two" } });
    const reversal = {
      assessmentId: awarded.assessmentId,
      reason: "İnceleme hatası bağımsız olarak doğrulandı.",
    };
    expect(await reversePurposeAssessment(db, f.adminActor, reversal, now)).toMatchObject({
      replayed: false,
    });
    expect(await reversePurposeAssessment(db, f.adminActor, reversal, now)).toMatchObject({
      replayed: true,
    });
    expect(await db.agentPurpose.count({ where: { status: "ACTIVE" } })).toBe(2);
    expect(await db.agentPurpose.findUnique({ where: { id: f.purpose.id } })).toMatchObject({
      status: "REVIEW_REVOKED",
      activeSlot: null,
    });
    const packet = await issuePurposeAssessmentPacket(
      db,
      f.adminActor,
      { agentProfileId: f.profile.id, purposeId: next.id },
      now,
    );
    expect(await f.submit(packet)).toMatchObject({
      applied: false,
      disposition: "ALREADY_CREDITED",
    });
    await expect(
      db.agentRewardAssessment.update({
        where: { id: awarded.assessmentId },
        data: { applied: false },
      }),
    ).rejects.toThrow();
    await expect(db.agentRewardReversal.deleteMany()).rejects.toThrow();
  });
  it("rejects hidden, self-only and late evidence without manufacturing punishment", async () => {
    const f = await fixture();
    await f.mode("SHADOW");
    await db.entry.update({ where: { id: f.entry.id }, data: { status: "HIDDEN", hiddenAt: now } });
    await expect(f.issue()).rejects.toMatchObject({ code: "AGENT_REWARD_CONFLICT" });
    await db.entry.update({
      where: { id: f.entry.id },
      data: { status: "ACTIVE", hiddenAt: null, authorId: f.writer.id },
    });
    await expect(f.issue()).rejects.toMatchObject({ code: "AGENT_REWARD_CONFLICT" });
    await db.entry.update({ where: { id: f.entry.id }, data: { authorId: f.admin.id } });
    await expect(
      issuePurposeAssessmentPacket(
        db,
        f.adminActor,
        { agentProfileId: f.profile.id, purposeId: f.purpose.id },
        new Date(now.getTime() + 8 * 86400000),
      ),
    ).rejects.toMatchObject({ code: "AGENT_REWARD_CONFLICT" });
    expect(await db.agentRewardAssessment.count()).toBe(0);
  });
  it("serializes simultaneous claims and caps three credits in seven days", async () => {
    const f = await fixture();
    await f.mode("FULFILL_SLOT");
    const packets = await Promise.all([f.issue(), f.issue()]);
    const competing = await Promise.allSettled(packets.map((packet) => f.submit(packet)));
    expect(competing.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.agentRewardAssessment.count({ where: { applied: true } })).toBe(1);
    for (let i = 2; i <= 4; i++) {
      const event = await db.$transaction((tx) =>
        appendRuntimeEvent(tx, {
          agentProfileId: f.profile.id,
          runId: f.run.id,
          eventType: "DECISION_STEP_RECORDED",
          subject: { kind: "INTERPRETATION" },
          evidenceIds: [f.topic.id],
          safeMessage: `Bağımsız katkı incelemesi ${i}, ayrı gözlem.`,
          occurredAt: new Date(now.getTime() - 1000),
        }),
      );
      const purpose = await db.agentPurpose.create({
        data: {
          agentProfileId: f.profile.id,
          creationRunId: f.run.id,
          claimRunId: f.run.id,
          kind: "EXPLORE_CONTRIBUTION",
          targetType: "TOPIC",
          targetId: f.topic.id,
          question: `Araştırma ${i} için ne eksik?`,
          topicKey: f.topic.title,
          completionCriterion: "TOPIC_READ_AND_REVIEW_RECORDED",
          baseline: {},
          activeSlot: 1,
          activeKey: `new-${i}`,
          claimStatus: "EVIDENCE_MET",
          claimEvidence: { decisionEventId: event.id.toString() },
          createdAt: new Date(now.getTime() - 2000),
          expiresAt: new Date(now.getTime() + 86400000),
        },
      });
      const packet = await issuePurposeAssessmentPacket(
        db,
        f.adminActor,
        { agentProfileId: f.profile.id, purposeId: purpose.id },
        now,
      );
      expect(await f.submit(packet)).toMatchObject(
        i < 4 ? { applied: true } : { applied: false, disposition: "SEVEN_DAY_LIMIT" },
      );
    }
    expect(await db.agentRewardAssessment.count({ where: { applied: true } })).toBe(3);
    expect(await db.agentPurpose.count({ where: { status: "ACTIVE" } })).toBe(1);
  });
  it("requires actual belief action; preserves the claimed version and permits an unchanged opinion", async () => {
    const f = await fixture();
    await f.mode("FULFILL_SLOT");
    const base = {
      agentProfileId: f.profile.id,
      topicKey: f.topic.title,
      statement: "Kanaatim hâlâ aynı; yeni kanıtı sınadım.",
      confidence: 0.5,
      evidenceSummary: "Yeni bağımsız metin aynı kanaatle tutarlı.",
      evidenceProvenance: {
        evidenceType: "USER_ENTRY",
        evidenceIds: [f.entry.id],
        summary: "Yeni metin.",
      },
      firstFormedAt: new Date(now.getTime() - 3000),
      status: "ACTIVE",
    };
    const before = await db.agentBelief.create({
      data: { ...base, version: 1, lastUpdatedAt: new Date(now.getTime() - 3000) },
    });
    const belief = await db.agentBelief.create({
      data: { ...base, version: 2, lastUpdatedAt: new Date(now.getTime() - 1000) },
    });
    await db.agentPurpose.update({
      where: { id: f.purpose.id },
      data: {
        kind: "TEST_BELIEF",
        targetType: "BELIEF",
        targetId: before.id,
        baseline: { beliefVersion: 1 },
        claimEvidence: { beliefId: belief.id, beliefVersion: 2, newEvidenceIds: [f.entry.id] },
      },
    });
    await expect(f.issue()).rejects.toMatchObject({ code: "AGENT_REWARD_CONFLICT" });
    await db.agentAction.create({
      data: {
        runId: f.run.id,
        agentProfileId: f.profile.id,
        sequence: 1,
        actionType: "UPDATE_BELIEF",
        actionStatus: "SUCCEEDED",
        input: {},
        result: { beliefId: belief.id },
        createdAt: new Date(now.getTime() - 1000),
      },
    });
    const packet = await f.issue();
    // Tarihsel yinelenen action satırı yeni TTL/köken seçtirmez: en eski gerçek action sabittir.
    await db.agentAction.create({
      data: {
        runId: f.run.id,
        agentProfileId: f.profile.id,
        sequence: 2,
        actionType: "UPDATE_BELIEF",
        actionStatus: "SUCCEEDED",
        input: {},
        result: { beliefId: belief.id },
        createdAt: now,
      },
    });
    await db.agentBelief.create({
      data: {
        ...base,
        version: 3,
        statement: "Sonraki bağımsız çalışma farklı bir kanaat getirdi.",
        lastUpdatedAt: now,
      },
    });
    expect(await f.submit(packet)).toMatchObject({ applied: true });
  });
  it("invalidates issued packets on a mode change and permits reversals while OFF", async () => {
    const f = await fixture();
    await f.mode("SHADOW");
    const shadowPacket = await f.issue();
    await f.mode("FULFILL_SLOT", "SHADOW");
    await expect(f.submit(shadowPacket)).rejects.toMatchObject({ code: "AGENT_REWARD_CONFLICT" });
    await changeRewardMode(db, f.adminActor, {
      mode: "SHADOW",
      expectedMode: "FULFILL_SLOT",
      reason: "Gölge moda tekrar dön.",
    });
    await expect(f.submit(shadowPacket)).rejects.toMatchObject({ code: "AGENT_REWARD_CONFLICT" });
    await f.mode("FULFILL_SLOT", "SHADOW");
    const granted = await f.submit(await f.issue());
    await changeRewardMode(db, f.adminActor, {
      mode: "OFF",
      expectedMode: "FULFILL_SLOT",
      reason: "Yeni etkileri durdur.",
    });
    await expect(f.issue()).rejects.toMatchObject({ code: "AGENT_REWARD_CONFLICT" });
    expect(
      await reversePurposeAssessment(
        db,
        f.adminActor,
        { assessmentId: granted.assessmentId, reason: "Yanlış kararı geri al." },
        now,
      ),
    ).toMatchObject({ reversed: true });
  });
  it("keeps the shared long preview boundary and rejects changes to visible evidence", async () => {
    const f = await fixture();
    await f.mode("SHADOW");
    const longBody = "  uzun   kanıt\n".repeat(150);
    await db.entry.update({ where: { id: f.entry.id }, data: { body: longBody } });
    const others = [];
    for (let i = 0; i < 7; i++)
      others.push(
        await db.entry.create({
          data: {
            topicId: f.topic.id,
            authorId: f.admin.id,
            body: `Başka katkı ${i}.`,
            normalizedBody: `katki ${i}`,
            origin: "WEB",
          },
        }),
      );
    const ordered = [others[0]!, { ...f.entry, body: longBody }, ...others.slice(1)];
    const entries = ordered.map((entry, index) => ({
      id: entry.id,
      body: truncateUntrustedText(entry.body, runtimeReadTopicEntryLimit(index, ordered.length)),
    }));
    expect(entries[1]!.body).toHaveLength(600);
    await db.agentRun.update({
      where: { id: f.run.id },
      data: { perceptionSummary: { readTopics: [{ id: f.topic.id, entries }] } },
    });
    const packet = await f.issue();
    const shown = packet.packet.observation.entries as Array<{ body: string }>;
    expect(shown).toEqual(entries.map(({ body }) => ({ body })));
    expect(JSON.stringify(packet.packet)).not.toContain(truncateUntrustedText(longBody, 2000));
    await db.entry.update({
      where: { id: f.entry.id },
      data: { body: `Yeni görünür kanıt. ${longBody}` },
    });
    await expect(f.submit(packet)).rejects.toMatchObject({ code: "AGENT_REWARD_CONFLICT" });
  });
  it("does not bump settings version for a repeated mode and retains the mode reason", async () => {
    const f = await fixture();
    await f.mode("SHADOW");
    const before = await db.agentGlobalSettings.findUniqueOrThrow({ where: { id: "global" } });
    await changeRewardMode(db, f.adminActor, {
      mode: "SHADOW",
      expectedMode: "SHADOW",
      reason: "Aynı modda kal.",
    });
    const after = await db.agentGlobalSettings.findUniqueOrThrow({ where: { id: "global" } });
    expect(after.settingsVersion).toBe(before.settingsVersion);
    const audits = await db.auditLog.findMany({ where: { action: "agent.reward.mode_changed" } });
    expect(audits).toHaveLength(1);
    expect(audits[0]!.metadata).toMatchObject({ reason: "Yerel kontrollü test." });
  });
});
