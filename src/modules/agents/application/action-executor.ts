import type { Prisma } from "@prisma/client";
import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor, TransactionClient } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { appendAuditLog } from "@/modules/audit";
import type { RuntimePrincipal } from "@/modules/agents/application/runtime-auth";
import {
  createRuntimeContentRecord,
  createRuntimeBeliefVersion,
  createRuntimeMemoryEpisode,
  findActiveRuntimeTopicWriteLock,
  findRuntimeActionForExecution,
  findRuntimeRelationshipTarget,
  getRuntimeActionPolicyMetrics,
  getRuntimeGlobalSettings,
  getRuntimeDuplicateSimilarity,
  lockRuntimeAction,
  lockRuntimeRun,
  proposeRuntimeSource,
  updateRuntimeRelationship,
  updateRuntimeActionStatus,
  validateRuntimeProvenanceEvidence,
} from "@/modules/agents/repository/runtime";
import {
  provenanceIsRequired,
  userEntryClaimIsSafelyFramed,
} from "@/modules/agents/domain/provenance";
import { parseSafeSourceUrl } from "@/modules/agents/domain/source-security";
import { runtimeActionSchema } from "@/modules/agents/validation/runtime-schemas";
import { createEntry, editEntry, normalizeEntrySearchText } from "@/modules/entries";
import {
  deleteBookmark,
  deleteFollow,
  deleteUserFollow,
  putBookmark,
  putFollow,
  putUserFollow,
  removeVote,
  setVote,
} from "@/modules/interactions";
import { createTopicWithFirstEntry } from "@/modules/topics";

const publicWriteActions = new Set([
  "CREATE_ENTRY",
  "CREATE_TOPIC_WITH_ENTRY",
  "EDIT_OWN_ENTRY",
  "VOTE_UP",
  "VOTE_DOWN",
  "REMOVE_VOTE",
  "FOLLOW_TOPIC",
  "UNFOLLOW_TOPIC",
  "FOLLOW_USER",
  "UNFOLLOW_USER",
  "BOOKMARK_ENTRY",
  "REMOVE_BOOKMARK",
]);
const contentActions = new Set(["CREATE_ENTRY", "CREATE_TOPIC_WITH_ENTRY", "EDIT_OWN_ENTRY"]);
const terminalStatuses = new Set(["REJECTED", "SUCCEEDED", "FAILED", "SKIPPED"]);
const noPublicWriteRunTypes = new Set(["READ_ONLY", "DRY_RUN", "REFLECTION", "SOURCE_REFRESH"]);

interface Rejection {
  code: string;
  reason: string;
}

function istanbulDayBounds(now: Date): { dayStart: Date; dayEnd: Date } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const dayStart = new Date(Date.UTC(value("year"), value("month") - 1, value("day"), -3));
  return { dayStart, dayEnd: new Date(dayStart.getTime() + 24 * 60 * 60 * 1000) };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0)
    throw new AppError("VALIDATION_ERROR", 422, `${field} alanı zorunludur.`, {
      [field]: [`${field} alanı zorunludur.`],
    });
  return value;
}

async function appendActionAudit(
  transaction: TransactionClient,
  principal: RuntimePrincipal,
  action: { id: string; actionType: string; sequence: number; runId: string },
  status: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await appendAuditLog(transaction, {
    actorId: principal.actor.actorId,
    action: `agent.action.${status.toLowerCase()}`,
    entityType: "AgentAction",
    entityId: action.id,
    requestId: principal.actor.requestId,
    metadata: {
      runId: action.runId,
      actionType: action.actionType,
      sequence: action.sequence,
      origin: principal.actor.origin,
      ...metadata,
    },
  });
}

function staticPolicyRejection(input: {
  actionType: string;
  runType: string;
  publishEnabled: boolean;
  topicCreationAllowed: boolean;
  votingAllowed: boolean;
  followingAllowed: boolean;
  hasProvenance: boolean;
}): Rejection | null {
  if (publicWriteActions.has(input.actionType) && noPublicWriteRunTypes.has(input.runType))
    return {
      code: "RUN_PUBLIC_WRITE_DISABLED",
      reason: `${input.runType} run türünde public action çalıştırılamaz.`,
    };
  if (contentActions.has(input.actionType) && !input.publishEnabled)
    return { code: "PUBLISH_DISABLED", reason: "Global içerik yayını kapalıdır." };
  if (input.actionType === "CREATE_TOPIC_WITH_ENTRY" && !input.topicCreationAllowed)
    return { code: "TOPIC_CREATION_DISABLED", reason: "Bu run için topic oluşturma kapalıdır." };
  if (["VOTE_UP", "VOTE_DOWN", "REMOVE_VOTE"].includes(input.actionType) && !input.votingAllowed)
    return { code: "VOTING_DISABLED", reason: "Bu run için oylama kapalıdır." };
  if (
    ["FOLLOW_TOPIC", "UNFOLLOW_TOPIC", "FOLLOW_USER", "UNFOLLOW_USER"].includes(input.actionType) &&
    !input.followingAllowed
  )
    return { code: "FOLLOWING_DISABLED", reason: "Bu run için takip işlemleri kapalıdır." };
  if (provenanceIsRequired(input.actionType) && !input.hasProvenance)
    return {
      code: "PROVENANCE_REQUIRED",
      reason: "İçerik action'ı denetlenebilir provenance taşımak zorundadır.",
    };
  return null;
}

function quotaPolicyRejection(input: {
  actionType: string;
  dailyMaximumOverride: boolean;
  saturationOverride: boolean;
  quotaMode: "PER_AGENT" | "GLOBAL_TOTAL" | "HYBRID";
  effectiveAgentMaximum: number;
  globalMaximum: number;
  maxEntriesPerHour: number;
  maxEntriesPerThreeHours: number;
  dailyTopicMaximum: number;
  dailyVoteMaximum: number;
  metrics: Awaited<ReturnType<typeof getRuntimeActionPolicyMetrics>>;
}): Rejection | null {
  if (["CREATE_ENTRY", "CREATE_TOPIC_WITH_ENTRY"].includes(input.actionType)) {
    if (!input.dailyMaximumOverride) {
      if (
        input.quotaMode !== "GLOBAL_TOTAL" &&
        input.metrics.agentDay >= input.effectiveAgentMaximum
      )
        return { code: "AGENT_DAILY_QUOTA", reason: "Agent günlük entry maksimumuna ulaştı." };
      if (input.quotaMode !== "PER_AGENT" && input.metrics.globalDay >= input.globalMaximum)
        return { code: "GLOBAL_DAILY_QUOTA", reason: "Global günlük entry maksimumuna ulaşıldı." };
    }
    if (input.metrics.agentHour >= input.maxEntriesPerHour)
      return { code: "HOURLY_ENTRY_RATE", reason: "Agent saatlik entry hız sınırına ulaştı." };
    if (input.metrics.agentThreeHours >= input.maxEntriesPerThreeHours)
      return { code: "THREE_HOUR_ENTRY_RATE", reason: "Agent üç saatlik entry sınırına ulaştı." };
    if (!input.saturationOverride) {
      if (input.metrics.agentTopicTwoHours >= 2)
        return {
          code: "AGENT_TOPIC_TWO_HOUR_SATURATION",
          reason: "Agent aynı topic için iki saatlik saturation sınırına ulaştı.",
        };
      if (input.metrics.agentTopicDay >= 5)
        return {
          code: "AGENT_TOPIC_DAILY_SATURATION",
          reason: "Agent aynı topic için günlük saturation sınırına ulaştı.",
        };
      if (input.metrics.topicRecent >= 15)
        return {
          code: "TOPIC_SATURATED",
          reason: "Topic son 30 dakikadaki yayın yoğunluğu nedeniyle saturated durumdadır.",
        };
    }
  }
  if (
    input.actionType === "CREATE_TOPIC_WITH_ENTRY" &&
    !input.dailyMaximumOverride &&
    input.metrics.agentTopicsDay >= input.dailyTopicMaximum
  )
    return { code: "AGENT_DAILY_TOPIC_QUOTA", reason: "Agent günlük topic maksimumuna ulaştı." };
  if (
    ["VOTE_UP", "VOTE_DOWN"].includes(input.actionType) &&
    !input.dailyMaximumOverride &&
    input.metrics.agentVotesDay >= input.dailyVoteMaximum
  )
    return { code: "AGENT_DAILY_VOTE_QUOTA", reason: "Agent günlük oy maksimumuna ulaştı." };
  return null;
}

async function rejectAction(
  transaction: TransactionClient,
  principal: RuntimePrincipal,
  action: { id: string; actionType: string; sequence: number; runId: string },
  rejection: Rejection,
) {
  const result = await updateRuntimeActionStatus(transaction, action.id, {
    actionStatus: "REJECTED",
    validationResult: { valid: false, code: rejection.code },
    rejectionCode: rejection.code,
    rejectionReason: rejection.reason,
  });
  await appendActionAudit(transaction, principal, action, "rejected", {
    rejectionCode: rejection.code,
  });
  return result;
}

async function performAction(
  transaction: TransactionClient,
  principal: RuntimePrincipal,
  action: ReturnType<typeof runtimeActionSchema.parse>,
): Promise<{ result: Prisma.InputJsonValue; entryId?: string }> {
  const input = action.input;
  const targetId = action.targetId;
  switch (action.actionType) {
    case "NO_ACTION":
      return { result: { skipped: true } };
    case "CREATE_ENTRY": {
      const topicId = requiredString(input.topicId ?? targetId, "topicId");
      const created = await createEntry(transaction, principal.actor, topicId, {
        body: requiredString(input.body, "body"),
      });
      return { result: { entryId: created.id, topicId: created.topicId }, entryId: created.id };
    }
    case "CREATE_TOPIC_WITH_ENTRY": {
      const created = await createTopicWithFirstEntry(transaction, principal.actor, {
        title: requiredString(input.title, "title"),
        entryBody: requiredString(input.body, "body"),
      });
      return {
        result: { topicId: created.topic.id, entryId: created.entry.id },
        entryId: created.entry.id,
      };
    }
    case "EDIT_OWN_ENTRY": {
      const entryId = requiredString(input.entryId ?? targetId, "entryId");
      const updated = await editEntry(
        transaction,
        principal.actor,
        {
          body: requiredString(input.body, "body"),
        },
        entryId,
      );
      return { result: { entryId: updated.id, topicId: updated.topicId } };
    }
    case "VOTE_UP":
    case "VOTE_DOWN": {
      const entryId = requiredString(input.entryId ?? targetId, "entryId");
      const vote = await setVote(
        transaction,
        principal.actor,
        entryId,
        action.actionType === "VOTE_UP" ? 1 : -1,
      );
      return { result: { entryId, value: vote.value, score: vote.score } };
    }
    case "REMOVE_VOTE": {
      const entryId = requiredString(input.entryId ?? targetId, "entryId");
      const vote = await removeVote(transaction, principal.actor, entryId);
      return { result: { entryId, value: null, score: vote.score } };
    }
    case "FOLLOW_TOPIC": {
      const topicId = requiredString(input.topicId ?? targetId, "topicId");
      const result = await putFollow(transaction, principal.actor, topicId);
      return { result: { topicId, followed: result.followed } };
    }
    case "UNFOLLOW_TOPIC": {
      const topicId = requiredString(input.topicId ?? targetId, "topicId");
      await deleteFollow(transaction, principal.actor, topicId);
      return { result: { topicId, followed: false } };
    }
    case "FOLLOW_USER": {
      const userId = requiredString(input.userId ?? targetId, "userId");
      await putUserFollow(transaction, principal.actor, userId);
      return { result: { userId, followed: true } };
    }
    case "UNFOLLOW_USER": {
      const userId = requiredString(input.userId ?? targetId, "userId");
      await deleteUserFollow(transaction, principal.actor, userId);
      return { result: { userId, followed: false } };
    }
    case "BOOKMARK_ENTRY": {
      const entryId = requiredString(input.entryId ?? targetId, "entryId");
      await putBookmark(transaction, principal.actor, entryId);
      return { result: { entryId, bookmarked: true } };
    }
    case "REMOVE_BOOKMARK": {
      const entryId = requiredString(input.entryId ?? targetId, "entryId");
      await deleteBookmark(transaction, principal.actor, entryId);
      return { result: { entryId, bookmarked: false } };
    }
    case "PROPOSE_SOURCE": {
      const sourceUrl = parseSafeSourceUrl(requiredString(input.url, "url"));
      const source = await proposeRuntimeSource(transaction, {
        agentProfileId: principal.agentProfileId,
        url: sourceUrl.toString(),
        normalizedDomain: sourceUrl.hostname.toLowerCase(),
        sourceType: input.sourceType ?? "HTML",
        topics: input.topics ?? ["genel"],
        discoveredFrom: requiredString(
          action.provenance?.shortRationale,
          "provenance.shortRationale",
        ),
      });
      return { result: { sourceId: source.id, status: source.status } };
    }
    case "UPDATE_BELIEF": {
      const belief = await createRuntimeBeliefVersion(transaction, {
        agentProfileId: principal.agentProfileId,
        topicKey: requiredString(input.topicKey, "topicKey"),
        statement: requiredString(input.statement, "statement"),
        confidence: input.confidence ?? 0.5,
        evidenceSummary: requiredString(input.summary, "summary"),
        evidenceProvenance: action.provenance!,
        now: new Date(),
      });
      return {
        result: {
          beliefId: belief.id,
          topicKey: belief.topicKey,
          confidence: belief.confidence,
          version: belief.version,
        },
      };
    }
    case "UPDATE_RELATIONSHIP_NOTE": {
      const targetUserId = requiredString(input.userId ?? targetId, "userId");
      if (targetUserId === principal.actor.actorId)
        throw new AppError("VALIDATION_ERROR", 422, "Agent kendisiyle relationship oluşturamaz.");
      if (!(await findRuntimeRelationshipTarget(transaction, targetUserId)))
        throw new AppError("USER_NOT_FOUND", 404, "Kullanıcı bulunamadı.");
      const relationship = await updateRuntimeRelationship(transaction, {
        agentProfileId: principal.agentProfileId,
        targetUserId,
        familiarity: input.familiarity ?? 0.1,
        trust: input.trust ?? 0.5,
        interest: input.interest ?? 0.5,
        disagreement: input.disagreement ?? 0,
        summary: requiredString(input.summary, "summary"),
        now: new Date(),
      });
      return {
        result: {
          relationshipId: relationship.id,
          targetUserId,
          trust: relationship.trust,
          familiarity: relationship.familiarity,
        },
      };
    }
    default:
      throw new AppError(
        "VALIDATION_ERROR",
        422,
        `${action.actionType} action türü henüz yürütülebilir değildir.`,
      );
  }
}

export async function executeRuntimeAction(
  client: DatabaseExecutor,
  principal: RuntimePrincipal,
  runId: string,
  input: { workerId: string; sequence: number },
) {
  let started = false;
  try {
    return await inTransaction(client, async (transaction) => {
      await lockRuntimeRun(transaction, runId);
      const initial = await findRuntimeActionForExecution(transaction, {
        runId,
        agentProfileId: principal.agentProfileId,
        sequence: input.sequence,
      });
      if (!initial) throw new AppError("AGENT_RUN_NOT_FOUND", 404, "Runtime action bulunamadı.");
      await lockRuntimeAction(transaction, initial.id);
      const actionRecord = await findRuntimeActionForExecution(transaction, {
        runId,
        agentProfileId: principal.agentProfileId,
        sequence: input.sequence,
      });
      if (!actionRecord)
        throw new AppError("AGENT_RUN_NOT_FOUND", 404, "Runtime action bulunamadı.");
      if (terminalStatuses.has(actionRecord.actionStatus)) return actionRecord;
      const now = new Date();
      if (
        actionRecord.run.runStatus !== "RUNNING" ||
        actionRecord.run.leaseOwner !== input.workerId ||
        !actionRecord.run.leaseExpiresAt ||
        actionRecord.run.leaseExpiresAt < now
      )
        throw new AppError(
          "AGENT_RUN_LEASE_INVALID",
          409,
          "Run lease sahibi veya süresi geçerli değil.",
        );
      started = true;
      const parsed = runtimeActionSchema.safeParse({
        sequence: actionRecord.sequence,
        actionType: actionRecord.actionType,
        ...(actionRecord.targetType ? { targetType: actionRecord.targetType } : {}),
        ...(actionRecord.targetId ? { targetId: actionRecord.targetId } : {}),
        input: actionRecord.input,
        ...(actionRecord.provenance ? { provenance: actionRecord.provenance } : {}),
      });
      if (!parsed.success)
        return rejectAction(transaction, principal, actionRecord, {
          code: "ACTION_SCHEMA_INVALID",
          reason: "Action payload runtime şemasını geçemedi.",
        });
      await updateRuntimeActionStatus(transaction, actionRecord.id, {
        actionStatus: "VALIDATING",
        validationResult: { valid: true, phase: "schema" },
      });
      const settings = await getRuntimeGlobalSettings(transaction);
      const staticRejection = staticPolicyRejection({
        actionType: parsed.data.actionType,
        runType: actionRecord.run.runType,
        publishEnabled: settings.publishEnabled,
        topicCreationAllowed: actionRecord.run.allowTopicCreation && settings.topicCreationEnabled,
        votingAllowed: actionRecord.run.allowVoting && settings.votingEnabled,
        followingAllowed: actionRecord.run.allowFollowing && settings.userFollowingEnabled,
        hasProvenance: Boolean(parsed.data.provenance),
      });
      if (staticRejection)
        return rejectAction(transaction, principal, actionRecord, staticRejection);
      if (
        parsed.data.actionType === "PROPOSE_SOURCE" &&
        (!settings.sourceEvolutionEnabled || !actionRecord.agentProfile.sourceEvolutionEnabled)
      )
        return rejectAction(transaction, principal, actionRecord, {
          code: "SOURCE_EVOLUTION_DISABLED",
          reason: "Source evolution bu agent veya global ayarlarda kapalıdır.",
        });
      if (parsed.data.provenance) {
        const evidence = await validateRuntimeProvenanceEvidence(transaction, {
          agentProfileId: principal.agentProfileId,
          runId,
          evidenceType: parsed.data.provenance.evidenceType,
          evidenceIds: parsed.data.provenance.evidenceIds,
        });
        if (!evidence.valid)
          return rejectAction(transaction, principal, actionRecord, {
            code: "PROVENANCE_INVALID",
            reason: "Action provenance kanıtları görünür ve doğrulanabilir değildir.",
          });
        if (
          parsed.data.provenance.evidenceType === "USER_ENTRY" &&
          contentActions.has(parsed.data.actionType) &&
          parsed.data.input.body &&
          !userEntryClaimIsSafelyFramed(parsed.data.input.body)
        )
          return rejectAction(transaction, principal, actionRecord, {
            code: "USER_ENTRY_FACT_UNFRAMED",
            reason: "USER_ENTRY kanıtı doğrulanmış gerçek gibi yeniden üretilemez.",
          });
        if (
          parsed.data.actionType === "UPDATE_RELATIONSHIP_NOTE" &&
          !["USER_ENTRY", "PLATFORM_EVENT"].includes(parsed.data.provenance.evidenceType)
        )
          return rejectAction(transaction, principal, actionRecord, {
            code: "RELATIONSHIP_VISIBLE_EVIDENCE_REQUIRED",
            reason: "Relationship yalnız görünür platform interaction kanıtıyla güncellenebilir.",
          });
      }

      const topicId =
        parsed.data.input.topicId ??
        (parsed.data.targetType === "TOPIC" ? parsed.data.targetId : undefined);
      if (topicId) {
        const writeLock = await findActiveRuntimeTopicWriteLock(transaction, topicId, now);
        if (writeLock)
          return rejectAction(transaction, principal, actionRecord, {
            code: "TOPIC_WRITE_LOCKED",
            reason: "Topic agent yazımına geçici olarak kapalıdır.",
          });
      }
      const { dayStart, dayEnd } = istanbulDayBounds(now);
      const metrics = await getRuntimeActionPolicyMetrics(transaction, {
        agentProfileId: principal.agentProfileId,
        ...(topicId ? { topicId } : {}),
        now,
        dayStart,
        dayEnd,
      });
      if (contentActions.has(parsed.data.actionType)) {
        const candidateBody = parsed.data.input.body;
        if (candidateBody) {
          const similarity = await getRuntimeDuplicateSimilarity(transaction, {
            agentProfileId: principal.agentProfileId,
            ...(topicId ? { topicId } : {}),
            ...(parsed.data.actionType === "EDIT_OWN_ENTRY" && parsed.data.input.entryId
              ? { excludeEntryId: parsed.data.input.entryId }
              : {}),
            normalizedCandidate: normalizeEntrySearchText(candidateBody),
          });
          if (similarity >= settings.duplicateSimilarityThreshold)
            return rejectAction(transaction, principal, actionRecord, {
              code: "DUPLICATE_SIMILARITY",
              reason: `Aday içerik yakın agent içeriğine ${similarity.toFixed(2)} benzerlik gösteriyor.`,
            });
        }
      }
      const effectiveAgentMaximum = actionRecord.agentProfile.useGlobalEntryQuota
        ? settings.defaultDailyEntryMax
        : (actionRecord.agentProfile.dailyEntryMax ?? settings.defaultDailyEntryMax);
      const quotaRejection = quotaPolicyRejection({
        actionType: parsed.data.actionType,
        dailyMaximumOverride: actionRecord.run.dailyMaximumOverride,
        saturationOverride: actionRecord.run.saturationOverride,
        quotaMode: settings.quotaMode,
        effectiveAgentMaximum,
        globalMaximum: settings.globalDailyEntryMax,
        maxEntriesPerHour: settings.maxEntriesPerHour,
        maxEntriesPerThreeHours: settings.maxEntriesPerThreeHours,
        dailyTopicMaximum: actionRecord.agentProfile.dailyTopicMax,
        dailyVoteMaximum: actionRecord.agentProfile.dailyVoteMax,
        metrics,
      });
      if (quotaRejection) return rejectAction(transaction, principal, actionRecord, quotaRejection);
      await updateRuntimeActionStatus(transaction, actionRecord.id, {
        actionStatus: "ACCEPTED",
        validationResult: { valid: true, phase: "policy" },
        rejectionCode: null,
        rejectionReason: null,
      });
      if (parsed.data.actionType === "NO_ACTION") {
        const skipped = await updateRuntimeActionStatus(transaction, actionRecord.id, {
          actionStatus: "SKIPPED",
          result: { skipped: true },
        });
        await appendActionAudit(transaction, principal, actionRecord, "skipped");
        return skipped;
      }
      await updateRuntimeActionStatus(transaction, actionRecord.id, { actionStatus: "EXECUTING" });
      const execution = await performAction(transaction, principal, parsed.data);
      if (execution.entryId)
        await createRuntimeContentRecord(transaction, {
          entryId: execution.entryId,
          agentProfileId: principal.agentProfileId,
          runId,
          actionId: actionRecord.id,
        });
      const actionProvenance = parsed.data.provenance ?? {
        evidenceType: "PLATFORM_EVENT" as const,
        evidenceIds: [runId],
        shortRationale: "Gerçekleştirilen runtime action kaydı.",
      };
      await createRuntimeMemoryEpisode(transaction, {
        agentProfileId: principal.agentProfileId,
        runId,
        eventType: "ACTION_EXECUTED",
        ...(parsed.data.targetType ? { subjectType: parsed.data.targetType } : {}),
        ...(parsed.data.targetId ? { subjectId: parsed.data.targetId } : {}),
        summary: `${parsed.data.actionType} action başarıyla gerçekleştirildi.`,
        salience: contentActions.has(parsed.data.actionType) ? 0.7 : 0.4,
        provenance: actionProvenance.evidenceType,
        evidence: {
          evidenceIds: actionProvenance.evidenceIds,
          shortRationale: actionProvenance.shortRationale,
          actionId: actionRecord.id,
        },
        occurredAt: now,
      });
      const succeeded = await updateRuntimeActionStatus(transaction, actionRecord.id, {
        actionStatus: "SUCCEEDED",
        result: execution.result,
      });
      await appendActionAudit(transaction, principal, actionRecord, "succeeded");
      return succeeded;
    });
  } catch (error) {
    if (!started) throw error;
    const rejection =
      error instanceof AppError
        ? { status: "REJECTED" as const, code: error.code, reason: error.message }
        : {
            status: "FAILED" as const,
            code: "ACTION_EXECUTION_FAILED",
            reason: "Action güvenli biçimde tamamlanamadı.",
          };
    return inTransaction(client, async (transaction) => {
      const action = await findRuntimeActionForExecution(transaction, {
        runId,
        agentProfileId: principal.agentProfileId,
        sequence: input.sequence,
      });
      if (!action) throw error;
      await lockRuntimeAction(transaction, action.id);
      const updated = await updateRuntimeActionStatus(transaction, action.id, {
        actionStatus: rejection.status,
        validationResult: { valid: false, code: rejection.code },
        rejectionCode: rejection.code,
        rejectionReason: rejection.reason,
      });
      await appendActionAudit(transaction, principal, action, rejection.status.toLowerCase(), {
        rejectionCode: rejection.code,
      });
      return updated;
    });
  }
}

export async function executeRuntimeActions(
  client: DatabaseExecutor,
  principal: RuntimePrincipal,
  runId: string,
  input: { workerId: string; sequences: number[] },
) {
  const actions = [];
  for (const sequence of input.sequences)
    actions.push(await executeRuntimeAction(client, principal, runId, { ...input, sequence }));
  return { actions };
}
