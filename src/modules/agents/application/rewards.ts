import {
  truncateUntrustedText,
  runtimeReadTopicEntryLimit,
} from "@/modules/agents/domain/perception";
import { globalAgentSettingsAggregateId } from "@/modules/agents/domain/settings-identity";
import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor, TransactionClient, InputJsonObject } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { createOpaqueToken, sha256, constantTimeEqual } from "@/lib/security/crypto";
import { requireAgentAdminInTransaction } from "@/modules/agents/application/authorization";
import { lockAgentProfile, lockAgentSettings } from "@/modules/agents/repository/control-plane";
import { updatePurposeRecord, findPurposeTopicRecords } from "@/modules/agents/repository/purposes";
import * as records from "@/modules/agents/repository/rewards";
import { canonicalLifeEventJson } from "@/modules/agents/repository/life-ledger";
import { appendAuditLog } from "@/modules/audit";
import type { ActorContext } from "@/modules/auth/domain/actor";
import {
  rewardObject as object,
  rewardLifetimeMs,
  assessmentPacketLifetimeMs,
  rewardSevenDayLimit,
  rewardPolicyVersion,
} from "@/modules/agents/domain/rewards";
import type {
  IssueAssessmentPacketInput,
  SubmitRewardAssessmentInput,
  ReverseRewardAssessmentInput,
  RewardModeInput,
} from "@/modules/agents/validation/reward-schemas";

function reject(message: string): never {
  throw new AppError("AGENT_REWARD_CONFLICT", 409, message);
}
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}
function contentHash(text: string) {
  return sha256(text.normalize("NFKC").trim().replaceAll(/\s+/gu, " "));
}

// Kimlik/oy/persona paket dışında; tarzdan kimlik çıkarılamadığı iddia edilmez.
async function buildPurposeAssessment(
  tx: TransactionClient,
  profileId: string,
  purposeId: string,
  now: Date,
) {
  const purpose = await records.findAssessmentPurpose(tx, profileId, purposeId);
  if (
    !purpose ||
    purpose.status !== "ACTIVE" ||
    purpose.expiresAt <= now ||
    purpose.claimStatus !== "EVIDENCE_MET" ||
    !purpose.claimRunId
  )
    reject("Değerlendirilebilir etkin amaç ve kayıt önkoşulu bulunamadı.");
  if (
    purpose.targetType === "TOPIC" &&
    (await findPurposeTopicRecords(tx, [purpose.targetId])).length !== 1
  )
    reject("Amaç hedefi artık erişilebilir değil.");
  const run = await records.findAssessmentRun(tx, profileId, purpose.claimRunId);
  if (!run) reject("Tamamlanmış normal claim koşusu bulunamadı.");
  const proof = object(purpose.claimEvidence);
  let sourceActKey: string;
  let sourceAt: Date;
  let sourceContentHash: string;
  let observation: InputJsonObject;
  if (purpose.kind === "EXPLORE_CONTRIBUTION") {
    if (
      typeof proof.decisionEventId !== "string" ||
      !/^[1-9][0-9]{0,18}$/u.test(proof.decisionEventId)
    )
      reject("Yorum kaydı yok.");
    const event = await records.findAssessmentJournal(
      tx,
      profileId,
      purpose.claimRunId,
      BigInt(proof.decisionEventId),
      purpose.targetId,
    );
    if (!event) reject("Yorumun kendi koşusundaki kaydı doğrulanamadı.");
    const topics = object(run.perceptionSummary).readTopics;
    const topic = Array.isArray(topics)
      ? topics.map(object).find((row) => row.id === purpose.targetId)
      : undefined;
    if (!topic || !Array.isArray(topic.entries)) reject("Gerçek okuma snapshot'ı yok.");
    const shownEntries = topic.entries.map(object);
    const ids = shownEntries
      .map((entry) => entry.id)
      .filter((id): id is string => typeof id === "string");
    const entries = await records.findAssessmentEntries(tx, ids);
    if (!ids.length || entries.length !== new Set(ids).size)
      reject("Okunan kanıtın görünürlüğü değişti.");
    // Mevcut içerik, okunduğu andaki metinle aynı olmalı; yeni sürüm eski okumaya mal edilmez.
    if (
      entries.some(
        (entry) =>
          entry.topicId !== purpose.targetId ||
          truncateUntrustedText(
            entry.body,
            runtimeReadTopicEntryLimit(
              shownEntries.findIndex((shown) => shown.id === entry.id),
              shownEntries.length,
            ),
          ) !== shownEntries.find((shown) => shown.id === entry.id)?.body,
      )
    )
      reject("Okunan kanıtın metni değişti.");
    const independent = entries.filter((entry) => entry.authorId !== purpose.agentProfile.userId);
    if (!independent.length) reject("Yalnız kendi içeriği bağımsız amaç kanıtı sayılmaz.");
    sourceActKey = `JOURNAL:${event.id}`;
    sourceAt = event.occurredAt;
    sourceContentHash = contentHash(event.safeMessage);
    observation = {
      interpretation: event.safeMessage,
      entries: independent.map(({ id }) => ({
        body: String(shownEntries.find((shown) => shown.id === id)!.body),
      })),
    };
  } else {
    if (typeof proof.beliefId !== "string" || typeof proof.beliefVersion !== "number")
      reject("Sabit belief kanıtı yok.");
    const belief = await records.findAssessmentBelief(
      tx,
      profileId,
      proof.beliefId,
      proof.beliefVersion,
    );
    const action = belief && (await records.findBeliefOriginAction(tx, profileId, belief.id));
    if (!belief || !action || belief.topicKey !== purpose.topicKey)
      reject("Belief'in gerçek UPDATE_BELIEF eylemi doğrulanamadı.");
    const ids = [...new Set(strings(proof.newEvidenceIds))];
    if (!ids.length || ids.length > 20) reject("Bağımsız yeni kanıt bulunamadı.");
    const entries = await records.findAssessmentEntries(tx, ids);
    const sources = await records.findAssessmentSourceItems(tx, profileId, ids, now);
    if (entries.some((entry) => entry.authorId === purpose.agentProfile.userId))
      reject("Kendi eylemi olumlu amaç kanıtı olamaz.");
    if (new Set([...entries, ...sources].map((item) => item.id)).size !== ids.length)
      reject("Yeni kanıt artık doğrulanamıyor.");
    const baseline = object(purpose.baseline);
    const previous =
      typeof baseline.beliefVersion === "number" && baseline.beliefVersion > 0
        ? await records.findAssessmentBaseline(
            tx,
            profileId,
            purpose.topicKey,
            baseline.beliefVersion,
          )
        : null;
    if (Number(baseline.beliefVersion) > 0 && !previous) reject("Başlangıç belief'i bulunamadı.");
    sourceActKey = `ACTION:${action.id}`;
    sourceAt = action.createdAt;
    sourceContentHash = contentHash(`${belief.statement}\n${belief.evidenceSummary}`);
    observation = {
      previous,
      current: { statement: belief.statement, evidenceSummary: belief.evidenceSummary },
      entries: entries.map(({ body }) => ({ body })),
      sources: sources.map(({ title, safeText, canonicalUrl }) => ({
        title,
        text: safeText,
        url: canonicalUrl,
      })),
    };
  }
  if (
    sourceAt < purpose.createdAt ||
    sourceAt > now ||
    sourceAt.getTime() + rewardLifetimeMs <= now.getTime()
  )
    reject("Dayanak olay yedi günlük değerlendirme aralığı dışında.");
  const configuration = await records.getRewardConfiguration(tx);
  const packet = {
    settingsVersion: configuration.settingsVersion,
    policyVersion: rewardPolicyVersion,
    mode: configuration.rewardMode,
    channel: "INTRINSIC",
    kind: purpose.kind,
    question: purpose.question,
    topicKey: purpose.topicKey,
    criterion: purpose.completionCriterion,
    observation,
  };
  // Operatör paketi 64 KiB'ı aşarsa kırpıp eksik kanıtla olumlu karar üretme.
  const serialized = canonicalLifeEventJson(packet);
  if (Buffer.byteLength(serialized, "utf8") > 64 * 1024)
    reject("Kanıt paketi güvenli boyut sınırını aşıyor.");
  const packageHash = sha256(
    canonicalLifeEventJson({
      packet,
      purposeId,
      purposeVersion: purpose.version,
      claimEvidence: purpose.claimEvidence,
      sourceActKey,
      sourceAt: sourceAt.toISOString(),
    }),
  );
  return { purpose, packet, packageHash, sourceActKey, sourceAt, sourceContentHash };
}

export function issuePurposeAssessmentPacket(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: IssueAssessmentPacketInput,
  now = new Date(),
) {
  return inTransaction(client, async (tx) => {
    await requireAgentAdminInTransaction(tx, actor);
    await lockAgentProfile(tx, input.agentProfileId);
    await lockAgentSettings(tx);
    if ((await records.getRewardMode(tx)) === "OFF") reject("Ödül değerlendirmesi kapalı.");
    const built = await buildPurposeAssessment(tx, input.agentProfileId, input.purposeId, now);
    const nonce = createOpaqueToken();
    const expiresAt = new Date(
      Math.min(
        now.getTime() + assessmentPacketLifetimeMs,
        built.purpose.expiresAt.getTime(),
        built.sourceAt.getTime() + rewardLifetimeMs,
      ),
    );
    const record = await records.createAssessmentPacket(tx, {
      ...input,
      createdById: actor.actorId,
      nonceHash: sha256(nonce),
      packageHash: built.packageHash,
      expiresAt,
      createdAt: now,
    });
    return {
      packetId: record.id,
      nonce,
      packageHash: built.packageHash,
      expiresAt: expiresAt.toISOString(),
      packet: built.packet,
    };
  });
}

export function submitPurposeAssessment(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: SubmitRewardAssessmentInput,
  now = new Date(),
) {
  return inTransaction(client, async (tx) => {
    await requireAgentAdminInTransaction(tx, actor);
    const issued = await records.findAssessmentPacket(tx, input.packetId);
    if (
      !issued ||
      issued.createdById !== actor.actorId ||
      issued.consumedAt ||
      issued.expiresAt <= now ||
      !constantTimeEqual(sha256(input.nonce), issued.nonceHash) ||
      issued.packageHash !== input.packageHash
    )
      reject("İnceleme paketi eski, tüketilmiş veya doğrulanamıyor.");
    await lockAgentProfile(tx, issued.agentProfileId);
    await lockAgentSettings(tx);
    const mode = await records.getRewardMode(tx);
    if (mode === "OFF") reject("Ödül değerlendirmesi kapalı.");
    const built = await buildPurposeAssessment(tx, issued.agentProfileId, issued.purposeId, now);
    if (built.packageHash !== issued.packageHash)
      reject("İncelenen amaç veya kanıt değişti; yeni paket gerekir.");
    const supported = input.verdict === "SUPPORTED";
    const duplicate =
      supported &&
      !!(await records.findConsumedRewardCredit(
        tx,
        issued.agentProfileId,
        built.sourceActKey,
        built.sourceContentHash,
      ));
    const capped =
      supported &&
      (await records.countRecentRewardCredits(
        tx,
        issued.agentProfileId,
        new Date(now.getTime() - rewardLifetimeMs),
      )) >= rewardSevenDayLimit;
    const applied = supported && mode === "FULFILL_SLOT" && !duplicate && !capped;
    const consumed = await records.consumeAssessmentPacket(tx, issued.id, now);
    if (consumed.count !== 1) reject("İnceleme paketi zaten tüketildi.");
    const assessment = await records.createRewardAssessment(tx, {
      packetId: issued.id,
      agentProfileId: issued.agentProfileId,
      purposeId: issued.purposeId,
      createdById: actor.actorId,
      mode,
      verdict: input.verdict,
      reviewerModel: input.reviewerModel,
      reason: input.reason,
      packageHash: built.packageHash,
      sourceActKey: built.sourceActKey,
      sourceContentHash: built.sourceContentHash,
      sourceAt: built.sourceAt,
      expiresAt: new Date(built.sourceAt.getTime() + rewardLifetimeMs),
      applied,
      creditedSourceKey: applied ? built.sourceActKey : null,
      creditedContentHash: applied ? built.sourceContentHash : null,
      evidenceSnapshot: built.packet,
      createdAt: now,
    });
    if (applied)
      await updatePurposeRecord(tx, built.purpose, {
        status: "FULFILLED",
        activeSlot: null,
        activeKey: null,
        updatedAt: now,
      });
    const disposition = applied
      ? "FULFILLED"
      : duplicate
        ? "ALREADY_CREDITED"
        : capped
          ? "SEVEN_DAY_LIMIT"
          : mode === "SHADOW" && supported
            ? "SHADOW_SUPPORTED"
            : "NO_REWARD";
    await appendAuditLog(tx, {
      actorId: actor.actorId,
      action: "agent.reward.assessed",
      entityType: "AgentRewardAssessment",
      entityId: assessment.id,
      requestId: actor.requestId,
      metadata: {
        mode,
        verdict: input.verdict,
        applied,
        disposition,
        packageHash: built.packageHash,
        independentReviewConfirmed: input.independentReviewConfirmed,
        policyVersion: rewardPolicyVersion,
      },
    });
    return { assessmentId: assessment.id, mode, verdict: input.verdict, applied, disposition };
  });
}

export function reversePurposeAssessment(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: ReverseRewardAssessmentInput,
  now = new Date(),
) {
  return inTransaction(client, async (tx) => {
    await requireAgentAdminInTransaction(tx, actor);
    const first = await records.findRewardAssessment(tx, input.assessmentId);
    if (!first) reject("Değerlendirme bulunamadı.");
    await lockAgentProfile(tx, first.agentProfileId);
    await lockAgentSettings(tx);
    const assessment = await records.findRewardAssessment(tx, input.assessmentId);
    if (!assessment) reject("Değerlendirme bulunamadı.");
    if (assessment.reversal) return { assessmentId: assessment.id, reversed: true, replayed: true };
    await records.createRewardReversal(tx, {
      assessmentId: assessment.id,
      createdById: actor.actorId,
      reason: input.reason,
      createdAt: now,
    });
    if (assessment.applied) await records.revokeFulfilledPurpose(tx, assessment.purposeId, now);
    await appendAuditLog(tx, {
      actorId: actor.actorId,
      action: "agent.reward.reversed",
      entityType: "AgentRewardAssessment",
      entityId: assessment.id,
      requestId: actor.requestId,
      metadata: { applied: assessment.applied, policyVersion: rewardPolicyVersion },
    });
    return { assessmentId: assessment.id, reversed: true, replayed: false };
  });
}

export function changeRewardMode(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: RewardModeInput,
) {
  return inTransaction(client, async (tx) => {
    await requireAgentAdminInTransaction(tx, actor);
    await lockAgentSettings(tx);
    const previous = await records.getRewardMode(tx);
    if (previous !== input.expectedMode) reject("Ödül modu değişti; güncel modu yeniden oku.");
    if (previous === input.mode) return { mode: previous };
    await records.setRewardMode(tx, input.mode, actor.actorId);
    await appendAuditLog(tx, {
      actorId: actor.actorId,
      action: "agent.reward.mode_changed",
      entityType: "AgentGlobalSettings",
      entityId: globalAgentSettingsAggregateId,
      requestId: actor.requestId,
      metadata: {
        previous,
        mode: input.mode,
        reason: input.reason,
        policyVersion: rewardPolicyVersion,
      },
    });
    return { mode: input.mode };
  });
}
