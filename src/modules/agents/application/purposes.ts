import { randomUUID } from "node:crypto";
import type { InputJsonValue, TransactionClient } from "@/lib/db/types";
import { sha256 } from "@/lib/security/crypto";
import { appendRuntimeEvent } from "@/modules/agents/repository/control-plane";
import {
  createPurposeRecord,
  findPurposeBeliefRecord,
  findPurposeTopicRecords,
  hasPurposeTopicReviewRecord,
  latestPurposeBeliefRecord,
  listActivePurposeRecords,
  updatePurposeRecord,
  type PurposeRecord,
} from "@/modules/agents/repository/purposes";
import { validateRuntimeProvenanceEvidence } from "@/modules/agents/repository/runtime";
import {
  availablePurposeSlot,
  purposeActiveKey,
  purposeCompletionCriteria,
  purposeLifetimeMs,
  purposePolicyVersion,
  purposePerceptionKey,
} from "@/modules/agents/domain/purpose";
import { runtimeEvidenceCatalogFrom } from "@/modules/agents/domain/runtime-evidence-catalog";
import { runtimeProvenanceSchema } from "@/modules/agents/validation/runtime-schemas";
import type { RuntimePurposeChange } from "@/modules/agents/validation/purpose-schemas";

interface PurposeRun {
  id: string;
  runType: string;
  agentProfileId: string;
  perceptionSummary: unknown;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(object) : [];
}
function statementHash(statement: string) {
  return sha256(statement.normalize("NFKC").trim().replaceAll(/\s+/gu, " "));
}
function versionState(record: PurposeRecord) {
  return { status: record.status, claimStatus: record.claimStatus, version: record.version };
}
async function recordChange(
  transaction: TransactionClient,
  run: PurposeRun,
  record: PurposeRecord,
  now: Date,
  before?: PurposeRecord,
) {
  await appendRuntimeEvent(transaction, {
    agentProfileId: run.agentProfileId,
    runId: run.id,
    eventType: "PURPOSE_CHANGED",
    subject: { type: "PURPOSE", id: record.id },
    safeMessage:
      "Süreli amaç durumu sunucu tarafından kaydedildi; semantik başarı veya ödül üretilmedi.",
    ...(before ? { before: versionState(before) } : {}),
    after: { ...versionState(record), claimEvidence: record.claimEvidence },
    metadata: {
      origin: "PURPOSE_POLICY",
      policyVersion: purposePolicyVersion,
      expiresAt: record.expiresAt.toISOString(),
      question: { contentHash: sha256(record.question) },
      baselineHash: sha256(JSON.stringify(record.baseline)),
    },
    occurredAt: now,
  });
}

// Çağıran runtime transaction'ı profile/lease kilidini ve kimliği doğrulamış olmalıdır.
export async function expireRuntimePurposes(
  transaction: TransactionClient,
  run: PurposeRun,
  now: Date,
) {
  const active = await listActivePurposeRecords(transaction, run.agentProfileId);
  for (const record of active.filter((item) => item.expiresAt <= now)) {
    const expired = await updatePurposeRecord(transaction, record, {
      status: "EXPIRED",
      activeSlot: null,
      activeKey: null,
      updatedAt: now,
    });
    await recordChange(transaction, run, expired, now, record);
  }
  return active.filter((item) => item.expiresAt > now);
}

export async function runtimePurposeContext(
  transaction: TransactionClient,
  run: PurposeRun,
  now: Date,
) {
  const active = await expireRuntimePurposes(transaction, run, now);
  const topics = await findPurposeTopicRecords(
    transaction,
    active.filter((item) => item.targetType === "TOPIC").map((item) => item.targetId),
  );
  const visibleTopics = new Set(topics.map((item) => item.id));
  return {
    [purposePerceptionKey]: active.map((item) => {
      const targetAvailable = item.targetType === "BELIEF" || visibleTopics.has(item.targetId);
      return {
        id: item.id,
        kind: item.kind,
        targetType: item.targetType,
        targetId: targetAvailable ? item.targetId : null,
        targetAvailable,
        question: targetAvailable ? item.question : null,
        topicKey: targetAvailable ? item.topicKey : null,
        status: item.status,
        claimStatus: item.claimStatus,
        completionCriterion: item.completionCriterion,
        version: item.version,
        createdAt: item.createdAt.toISOString(),
        expiresAt: item.expiresAt.toISOString(),
        lastReviewNote: targetAvailable ? item.lastReviewNote : null,
        lastReviewedAt: item.lastReviewedAt?.toISOString() ?? null,
        semanticAssessment: "NOT_EVALUATED",
      };
    }),
    purposeTopics: topics,
  };
}

async function claimEvidence(
  transaction: TransactionClient,
  run: PurposeRun,
  record: PurposeRecord,
  now: Date,
) {
  const perception = object(run.perceptionSummary);
  if (
    record.targetType === "TOPIC" &&
    (await findPurposeTopicRecords(transaction, [record.targetId])).length === 0
  )
    return null;
  if (record.kind === "EXPLORE_CONTRIBUTION") {
    const read = rows(perception.readTopics).find((topic) => topic.id === record.targetId);
    const review =
      read &&
      (await hasPurposeTopicReviewRecord(transaction, run.agentProfileId, run.id, record.targetId));
    return review
      ? {
          criterion: record.completionCriterion,
          topicId: record.targetId,
          decisionEventId: review.id.toString(),
        }
      : null;
  }
  const baseline = object(record.baseline);
  const belief = await latestPurposeBeliefRecord(transaction, run.agentProfileId, record.topicKey);
  if (
    !belief ||
    belief.lastUpdatedAt <= record.createdAt ||
    belief.lastUpdatedAt > now ||
    belief.version <= Number(baseline.beliefVersion ?? 0)
  )
    return null;
  if (
    record.kind === "UNDERSTAND_CONCEPT" &&
    statementHash(belief.statement) === baseline.statementHash
  )
    return null;
  const provenance = runtimeProvenanceSchema.safeParse(belief.evidenceProvenance);
  if (
    !provenance.success ||
    !["USER_ENTRY", "TRUSTED_SOURCE", "PROBATION_SOURCE", "MULTIPLE_SOURCES"].includes(
      provenance.data.evidenceType,
    )
  )
    return null;
  const previousIds = new Set(Array.isArray(baseline.evidenceIds) ? baseline.evidenceIds : []);
  const newIds = provenance.data.evidenceIds.filter((id) => !previousIds.has(id));
  if (newIds.length === 0) return null;
  const checked = await validateRuntimeProvenanceEvidence(transaction, {
    agentProfileId: run.agentProfileId,
    runId: run.id,
    perceptionSummary: run.perceptionSummary,
    evidenceType: provenance.data.evidenceType,
    evidenceIds: provenance.data.evidenceIds,
  });
  return checked.valid
    ? {
        criterion: record.completionCriterion,
        beliefId: belief.id,
        beliefVersion: belief.version,
        newEvidenceIds: newIds,
      }
    : null;
}

export async function applyRuntimePurposeChanges(
  transaction: TransactionClient,
  run: PurposeRun,
  changes: readonly RuntimePurposeChange[],
  now: Date,
) {
  if (changes.length === 0) return { status: "NO_CHANGES" as const };
  const reject = (reasonCode: string) => ({ status: "REJECTED" as const, reasonCode });
  if (run.runType !== "NORMAL_WAKE") return reject("PURPOSE_NORMAL_WAKE_REQUIRED");
  const active = await expireRuntimePurposes(transaction, run, now);
  const planned = new Map(active.map((record) => [record.id, record]));
  const perception = object(run.perceptionSummary);
  const shown = rows(perception[purposePerceptionKey]);
  const seenCommands = new Set<string>();
  // Bütün batch önce doğrulanır. Hatalı ikinci komut, ilkini kısmen yazamaz.
  const writes: Array<() => Promise<void>> = [];
  for (const change of changes) {
    if (change.operation === "CREATE") {
      if ((change.kind === "TEST_BELIEF") !== (change.targetType === "BELIEF"))
        return reject("PURPOSE_TARGET_KIND_MISMATCH");
      let topicKey: string;
      let targetKey: string;
      if (change.targetType === "BELIEF") {
        if (!rows(perception.beliefs).some((belief) => belief.id === change.targetId))
          return reject("PURPOSE_TARGET_NOT_PRESENTED");
        const belief = await findPurposeBeliefRecord(
          transaction,
          run.agentProfileId,
          change.targetId,
        );
        if (!belief) return reject("PURPOSE_TARGET_UNAVAILABLE");
        topicKey = belief.topicKey;
        targetKey = topicKey;
      } else {
        if (
          !runtimeEvidenceCatalogFrom(perception, run.id).PLATFORM_EVENT.includes(change.targetId)
        )
          return reject("PURPOSE_TARGET_NOT_PRESENTED");
        const [topic] = await findPurposeTopicRecords(transaction, [change.targetId]);
        if (!topic) return reject("PURPOSE_TARGET_UNAVAILABLE");
        topicKey = topic.title;
        targetKey = topic.id;
      }
      // Geçmiş/import edilmiş DB başlığı API'nin güncel uzunluk kuralını aşabilir.
      if ([...topicKey].length > 200) return reject("PURPOSE_TARGET_KEY_TOO_LONG");
      const activeKey = purposeActiveKey(change.kind, change.targetType, targetKey);
      if ([...planned.values()].some((record) => record.activeKey === activeKey))
        return reject("PURPOSE_ALREADY_ACTIVE");
      const slot = availablePurposeSlot(
        [...planned.values()].flatMap((record) =>
          record.activeSlot === null ? [] : [record.activeSlot],
        ),
      );
      if (slot === null) return reject("PURPOSE_ACTIVE_LIMIT");
      const belief = await latestPurposeBeliefRecord(transaction, run.agentProfileId, topicKey);
      const evidence = runtimeProvenanceSchema.safeParse(belief?.evidenceProvenance);
      const data = {
        id: randomUUID(),
        agentProfileId: run.agentProfileId,
        creationRunId: run.id,
        kind: change.kind,
        targetType: change.targetType,
        targetId: change.targetId,
        question: change.question,
        topicKey,
        completionCriterion: purposeCompletionCriteria[change.kind],
        policyVersion: purposePolicyVersion,
        baseline: {
          beliefVersion: belief?.version ?? 0,
          statementHash: belief ? statementHash(belief.statement) : null,
          evidenceIds: evidence.success ? evidence.data.evidenceIds : [],
        },
        status: "ACTIVE" as const,
        claimStatus: "NOT_CLAIMED" as const,
        version: 1,
        activeSlot: slot,
        activeKey,
        createdAt: now,
        expiresAt: new Date(now.getTime() + purposeLifetimeMs),
        updatedAt: now,
        lastReviewNote: null,
        lastReviewedAt: null,
        claimRunId: null,
        claimedAt: null,
        claimEvidence: null,
      };
      planned.set(data.id, data);
      writes.push(async () => {
        const record = await createPurposeRecord(transaction, data);
        await recordChange(transaction, run, record, now);
      });
    } else {
      if (seenCommands.has(change.purposeId)) return reject("PURPOSE_DUPLICATE_COMMAND");
      seenCommands.add(change.purposeId);
      const record = planned.get(change.purposeId);
      if (
        !record ||
        !shown.some((item) => item.id === record.id && item.version === change.expectedVersion)
      )
        return reject("PURPOSE_NOT_PRESENTED");
      if (record.version !== change.expectedVersion) return reject("PURPOSE_VERSION_CONFLICT");
      if (change.operation === "REVIEW" && record.lastReviewNote === change.note) continue;
      const evidence =
        change.operation === "CLAIM_COMPLETION"
          ? await claimEvidence(transaction, run, record, now)
          : null;
      if (change.operation === "ABANDON") planned.delete(record.id);
      writes.push(async () => {
        const updated = await updatePurposeRecord(transaction, record, {
          lastReviewNote: change.note,
          lastReviewedAt: now,
          updatedAt: now,
          ...(change.operation === "ABANDON"
            ? { status: "ABANDONED", activeSlot: null, activeKey: null }
            : {}),
          ...(change.operation === "CLAIM_COMPLETION"
            ? {
                claimStatus: evidence ? "EVIDENCE_MET" : "CLAIMED",
                claimRunId: run.id,
                claimedAt: now,
                claimEvidence: (evidence ?? {
                  criterion: record.completionCriterion,
                  preconditionMet: false,
                }) as InputJsonValue,
              }
            : {}),
        });
        await recordChange(transaction, run, updated, now, record);
      });
    }
  }
  for (const write of writes) await write();
  return { status: "APPLIED" as const, changedCount: writes.length };
}
