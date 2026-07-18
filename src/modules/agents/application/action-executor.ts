import { inTransaction } from "@/lib/db/transaction";
import type {
  DatabaseExecutor,
  InputJsonObject,
  InputJsonValue,
  TransactionClient,
} from "@/lib/db/types";
import { checkDatabaseReadiness } from "@/lib/db/readiness";
import { AppError } from "@/lib/http/errors";
import { appendAuditLog } from "@/modules/audit";
import { appendRuntimeEvent, lockAgentSettings } from "@/modules/agents/repository/control-plane";
import type { RuntimePrincipal } from "@/modules/agents/application/runtime-auth";
import {
  createRuntimeContentRecord,
  createRuntimeBeliefVersion,
  createRuntimeMemoryEpisode,
  findActiveRuntimeTopicWriteLock,
  findActiveRuntimeTopicSaturation,
  findRuntimeActionForExecution,
  findRuntimeReplyTarget,
  findRuntimeRelationshipTarget,
  getRuntimeActionPolicyMetrics,
  getRuntimeGlobalSettings,
  getRuntimeProvocationMetrics,
  getRuntimeDuplicateSimilarity,
  getRuntimeRecentAgentEntryBodies,
  lockRuntimeAction,
  lockRuntimeAgent,
  lockRuntimeRunForLeaseMutation,
  lockRuntimeTopicSaturation,
  proposeRuntimeSource,
  updateRuntimeRelationship,
  updateRuntimeActionStatus,
  validateRuntimeProvenanceEvidence,
} from "@/modules/agents/repository/runtime";
import {
  provenanceIsRequired,
  relationshipProvenanceIsVisible,
  userEntryClaimIsSafelyFramed,
} from "@/modules/agents/domain/provenance";
import {
  hasUnrecordedOfflineFirstPersonClaim,
  repeatedEntryFraming,
  seriousFactualClaimRequiresStrongEvidence,
  sourceGroundingIssue,
  userEntryContainsHighRiskReproduction,
} from "@/modules/agents/domain/action-policy";
import {
  isPublicRuntimeAction,
  runtimeActionBlockedByPublicWriteControl,
  type RuntimeOperatingMode,
} from "@/modules/agents/domain/runtime-controls";
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
import { appendOutboxEvent, type OutboxEventInput } from "@/modules/outbox";

const contentActions = new Set(["CREATE_ENTRY", "CREATE_TOPIC_WITH_ENTRY", "EDIT_OWN_ENTRY"]);
const terminalStatuses = new Set(["REJECTED", "SUCCEEDED", "FAILED", "SKIPPED"]);
const noPublicWriteRunTypes = new Set(["READ_ONLY", "DRY_RUN", "REFLECTION", "SOURCE_REFRESH"]);

interface ActionExecutionDependencies {
  checkReadiness?: (executor: DatabaseExecutor) => Promise<void>;
  /** Test seam entered after a public action owns the global settings lock. */
  afterPublicWriteSettingsLocked?: () => Promise<void>;
  /** Test seam for a terminal replay that wins after execution rollback. */
  beforeFallback?: () => Promise<void>;
}

export async function assertPublicWriteReadiness(
  actionType: string,
  executor: DatabaseExecutor,
  checkReadiness: (executor: DatabaseExecutor) => Promise<void> = checkDatabaseReadiness,
): Promise<void> {
  if (!isPublicRuntimeAction(actionType)) return;
  try {
    await checkReadiness(executor);
  } catch {
    throw new AppError(
      "SERVICE_NOT_READY",
      503,
      "Servis hazır değil; public agent action çalıştırılmadı.",
    );
  }
}

interface Rejection {
  code: string;
  reason: string;
}

function runtimeActionResult(action: {
  id: string;
  sequence: number;
  actionType: string;
  actionStatus: string;
  result: unknown;
  rejectionCode: string | null;
  rejectionReason: string | null;
}) {
  return {
    id: action.id,
    sequence: action.sequence,
    actionType: action.actionType,
    actionStatus: action.actionStatus,
    result: action.result,
    rejectionCode: action.rejectionCode,
    rejectionReason: action.rejectionReason,
  };
}

type ParsedRuntimeAction = ReturnType<typeof runtimeActionSchema.parse>;

export type RuntimeActionTargetResolution =
  | {
      ok: true;
      topicId?: string;
      entryId?: string;
      userId?: string;
    }
  | {
      ok: false;
      rejection: Rejection;
    };

function invalidActionTarget(reason: string): RuntimeActionTargetResolution {
  return {
    ok: false,
    rejection: {
      code: "ACTION_TARGET_INVALID",
      reason,
    },
  };
}

function unexpectedTargetSelector(
  action: ParsedRuntimeAction,
  allowed: ReadonlySet<"topicId" | "entryId" | "replyToEntryId" | "userId">,
): string | null {
  for (const selector of ["topicId", "entryId", "replyToEntryId", "userId"] as const)
    if (action.input[selector] !== undefined && !allowed.has(selector)) return selector;
  return null;
}

function resolveEntityActionTarget(
  action: ParsedRuntimeAction,
  expectedType: "TOPIC" | "ENTRY" | "USER",
  inputKey: "topicId" | "entryId" | "userId",
): RuntimeActionTargetResolution {
  const unexpected = unexpectedTargetSelector(action, new Set([inputKey]));
  if (unexpected)
    return invalidActionTarget(
      `${action.actionType} action'ı ${unexpected} hedef seçicisini kullanamaz.`,
    );
  if (action.targetType !== undefined && action.targetType !== expectedType)
    return invalidActionTarget(
      `${action.actionType} action'ı yalnız ${expectedType} hedefi kullanabilir.`,
    );
  const inputId = action.input[inputKey];
  if (inputId && action.targetId && inputId !== action.targetId)
    return invalidActionTarget(`${action.actionType} action hedef kimliği input ile eşleşmelidir.`);
  const canonicalId = inputId ?? action.targetId;
  if (!canonicalId)
    return invalidActionTarget(`${action.actionType} action hedef kimliği zorunludur.`);
  if (inputKey === "topicId") return { ok: true, topicId: canonicalId };
  if (inputKey === "entryId") return { ok: true, entryId: canonicalId };
  return { ok: true, userId: canonicalId };
}

/**
 * Resolves one canonical entity id for policy checks and the eventual write.
 * The runtime action schema intentionally stays transport-focused, so persisted
 * or older actions still receive this fail-closed execution-time validation.
 */
export function resolveRuntimeActionTarget(
  action: ParsedRuntimeAction,
): RuntimeActionTargetResolution {
  if ((action.targetType === undefined) !== (action.targetId === undefined))
    return invalidActionTarget("targetType ve targetId birlikte verilmelidir.");

  switch (action.actionType) {
    case "CREATE_ENTRY": {
      const unexpected = unexpectedTargetSelector(
        action,
        new Set(["topicId", "replyToEntryId", "userId"]),
      );
      if (unexpected)
        return invalidActionTarget(`CREATE_ENTRY action'ı ${unexpected} hedefini kullanamaz.`);
      if (action.targetType === "USER") {
        if (!action.targetId || !action.input.topicId || !action.input.replyToEntryId)
          return invalidActionTarget(
            "USER hedefli CREATE_ENTRY targetId, topicId ve replyToEntryId gerektirir.",
          );
        if (action.input.userId && action.input.userId !== action.targetId)
          return invalidActionTarget("CREATE_ENTRY userId hedef kimliği ile eşleşmelidir.");
        return {
          ok: true,
          topicId: action.input.topicId,
          userId: action.targetId,
          entryId: action.input.replyToEntryId,
        };
      }
      if (action.targetType !== undefined && action.targetType !== "TOPIC")
        return invalidActionTarget(
          "CREATE_ENTRY yalnız TOPIC veya doğrudan tepki için USER hedefi kullanabilir.",
        );
      if (action.input.replyToEntryId || action.input.userId)
        return invalidActionTarget(
          "Doğrudan tepki CREATE_ENTRY action'ı USER hedefi kullanmalıdır.",
        );
      if (action.input.topicId && action.targetId && action.input.topicId !== action.targetId)
        return invalidActionTarget("CREATE_ENTRY topic hedefi input.topicId ile eşleşmelidir.");
      const topicId = action.input.topicId ?? action.targetId;
      return topicId
        ? { ok: true, topicId }
        : invalidActionTarget("CREATE_ENTRY topicId hedefi zorunludur.");
    }
    case "EDIT_OWN_ENTRY":
    case "VOTE_UP":
    case "VOTE_DOWN":
    case "REMOVE_VOTE":
    case "BOOKMARK_ENTRY":
    case "REMOVE_BOOKMARK":
      return resolveEntityActionTarget(action, "ENTRY", "entryId");
    case "FOLLOW_TOPIC":
    case "UNFOLLOW_TOPIC":
      return resolveEntityActionTarget(action, "TOPIC", "topicId");
    case "FOLLOW_USER":
    case "UNFOLLOW_USER":
    case "UPDATE_RELATIONSHIP_NOTE":
      return resolveEntityActionTarget(action, "USER", "userId");
    case "NO_ACTION":
    case "CREATE_TOPIC_WITH_ENTRY":
    case "PROPOSE_SOURCE":
    case "UPDATE_BELIEF": {
      const unexpected = unexpectedTargetSelector(action, new Set());
      if (action.targetType || action.targetId || unexpected)
        return invalidActionTarget(`${action.actionType} action'ı entity hedefi kullanamaz.`);
      return { ok: true };
    }
  }
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function storedActionPayload(value: unknown): {
  safeReason: unknown;
  input: Record<string, unknown>;
} {
  const stored = { ...jsonRecord(value) };
  const safeReason = stored.safeReason;
  delete stored.safeReason;
  return { safeReason, input: stored };
}

function repairValidationMarker(value: unknown): { repairOfSequence?: number } {
  const sequence = jsonRecord(value).repairOfSequence;
  return typeof sequence === "number" && Number.isInteger(sequence)
    ? { repairOfSequence: sequence }
    : {};
}

function validationWithRepairMarker(
  action: { validationResult?: unknown },
  value: Record<string, unknown>,
): InputJsonObject {
  return {
    ...value,
    ...repairValidationMarker(action.validationResult),
  } as InputJsonObject;
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
  action: {
    id: string;
    actionType: string;
    sequence: number;
    runId: string;
    input?: unknown;
  },
  status: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const actionStatus = status.toUpperCase();
  if (!terminalStatuses.has(actionStatus)) throw new Error("ACTION_OUTBOX_STATUS_NOT_TERMINAL");
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
      ...(typeof jsonRecord(action.input).safeReason === "string"
        ? { safeReason: jsonRecord(action.input).safeReason }
        : {}),
      ...metadata,
    },
  });
  await appendOutboxEvent(transaction, {
    eventType: "agent.action.executed",
    aggregateType: "AgentAction",
    aggregateId: action.id,
    actorId: principal.actor.actorId,
    actorKind: principal.actor.actorKind,
    requestId: principal.actor.requestId,
    payload: {
      agentProfileId: principal.agentProfileId,
      runId: action.runId,
      actionId: action.id,
      actionType: action.actionType,
      sequence: action.sequence,
      actionStatus,
      ...(typeof metadata.rejectionCode === "string"
        ? { rejectionCode: metadata.rejectionCode }
        : {}),
    },
  });
}

export function buildRuntimeSourceChangedOutboxEvent(input: {
  principal: RuntimePrincipal;
  runId: string;
  actionId: string;
  source: {
    id: string;
    status: string;
    normalizedDomain: string;
  };
}): OutboxEventInput {
  return {
    eventType: "agent.source.changed",
    aggregateType: "AgentSource",
    aggregateId: input.source.id,
    actorId: input.principal.actor.actorId,
    actorKind: input.principal.actor.actorKind,
    requestId: input.principal.actor.requestId,
    payload: {
      agentProfileId: input.principal.agentProfileId,
      runId: input.runId,
      actionId: input.actionId,
      sourceId: input.source.id,
      status: input.source.status,
      origin: input.principal.actor.origin,
      normalizedDomain: input.source.normalizedDomain,
    },
  };
}

function staticPolicyRejection(input: {
  actionType: string;
  runType: string;
  runtimeEnabled: boolean;
  publishEnabled: boolean;
  publicWriteEnabled: boolean;
  runtimeOperatingMode: RuntimeOperatingMode;
  agentLifecycleStatus: "DRAFT" | "PAUSED" | "ACTIVE" | "SUSPENDED" | "RETIRED";
  topicCreationAllowed: boolean;
  votingAllowed: boolean;
  followingAllowed: boolean;
  hasProvenance: boolean;
}): Rejection | null {
  if (input.agentLifecycleStatus !== "ACTIVE")
    return {
      code: "AGENT_LIFECYCLE_NOT_ACTIVE",
      reason: "ACTIVE olmayan agent yeni runtime action çalıştıramaz.",
    };
  if (isPublicRuntimeAction(input.actionType) && !input.runtimeEnabled)
    return {
      code: "GLOBAL_RUNTIME_PAUSED",
      reason: "Global runtime pause durumundayken public action çalıştırılamaz.",
    };
  if (
    runtimeActionBlockedByPublicWriteControl(input.actionType, {
      publicWriteEnabled: input.publicWriteEnabled,
      runtimeOperatingMode: input.runtimeOperatingMode,
    })
  )
    return {
      code: "GLOBAL_PUBLIC_WRITE_DISABLED",
      reason:
        input.runtimeOperatingMode === "MAINTENANCE"
          ? "Runtime bakım modundayken public action çalıştırılamaz."
          : "Global public write kontrolü kapalıdır.",
    };
  if (isPublicRuntimeAction(input.actionType) && noPublicWriteRunTypes.has(input.runType))
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
      if (input.metrics.agentHour >= input.maxEntriesPerHour)
        return { code: "HOURLY_ENTRY_RATE", reason: "Agent saatlik entry hız sınırına ulaştı." };
      if (input.metrics.agentThreeHours >= input.maxEntriesPerThreeHours)
        return { code: "THREE_HOUR_ENTRY_RATE", reason: "Agent üç saatlik entry sınırına ulaştı." };
    }
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

function provocationPolicyRejection(input: {
  override: boolean;
  provocationSignal: number;
  metrics: Awaited<ReturnType<typeof getRuntimeProvocationMetrics>>;
}): Rejection | null {
  if (input.override) return null;
  if (input.metrics.agentTargetSixHours >= 2)
    return {
      code: "PROVOCATION_TARGET_COOLDOWN",
      reason: "Agent aynı kullanıcıya altı saatte en fazla iki doğrudan tepki verebilir.",
    };
  if (input.metrics.agentDiscussionDay >= 3)
    return {
      code: "PROVOCATION_DISCUSSION_COOLDOWN",
      reason: "Agent aynı tartışmaya yirmi dört saatte en fazla üç doğrudan dönüş yapabilir.",
    };
  if (input.metrics.distinctRecentAgents >= 3)
    return {
      code: "PROVOCATION_PILE_ON",
      reason: "Aynı kullanıcıya otuz dakikada üç farklı agent sınırı dolmuştur.",
    };
  if (input.provocationSignal >= 0.7 && input.metrics.agentCooldownResponses > 0)
    return {
      code: "PROVOCATION_HIGH_SIGNAL_COOLDOWN",
      reason: "Yüksek provokasyon sinyali sonrası doksan dakikalık cooldown uygulanır.",
    };
  return null;
}

async function rejectAction(
  transaction: TransactionClient,
  principal: RuntimePrincipal,
  action: {
    id: string;
    actionType: string;
    sequence: number;
    runId: string;
    input?: unknown;
    validationResult?: unknown;
  },
  rejection: Rejection,
) {
  const result = await updateRuntimeActionStatus(transaction, action.id, {
    actionStatus: "REJECTED",
    validationResult: validationWithRepairMarker(action, {
      valid: false,
      code: rejection.code,
    }),
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
  action: ParsedRuntimeAction,
  target: Extract<RuntimeActionTargetResolution, { ok: true }>,
): Promise<{
  result: InputJsonValue;
  entryId?: string;
  changedSource?: { id: string; status: string; normalizedDomain: string };
}> {
  const input = action.input;
  switch (action.actionType) {
    case "NO_ACTION":
      return { result: { skipped: true } };
    case "CREATE_ENTRY": {
      const topicId = requiredString(target.topicId, "topicId");
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
      const entryId = requiredString(target.entryId, "entryId");
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
      const entryId = requiredString(target.entryId, "entryId");
      const vote = await setVote(
        transaction,
        principal.actor,
        entryId,
        action.actionType === "VOTE_UP" ? 1 : -1,
      );
      return { result: { entryId, value: vote.value, score: vote.score } };
    }
    case "REMOVE_VOTE": {
      const entryId = requiredString(target.entryId, "entryId");
      const vote = await removeVote(transaction, principal.actor, entryId);
      return { result: { entryId, value: null, score: vote.score } };
    }
    case "FOLLOW_TOPIC": {
      const topicId = requiredString(target.topicId, "topicId");
      const result = await putFollow(transaction, principal.actor, topicId);
      return { result: { topicId, followed: result.followed } };
    }
    case "UNFOLLOW_TOPIC": {
      const topicId = requiredString(target.topicId, "topicId");
      await deleteFollow(transaction, principal.actor, topicId);
      return { result: { topicId, followed: false } };
    }
    case "FOLLOW_USER": {
      const userId = requiredString(target.userId, "userId");
      await putUserFollow(transaction, principal.actor, userId);
      return { result: { userId, followed: true } };
    }
    case "UNFOLLOW_USER": {
      const userId = requiredString(target.userId, "userId");
      await deleteUserFollow(transaction, principal.actor, userId);
      return { result: { userId, followed: false } };
    }
    case "BOOKMARK_ENTRY": {
      const entryId = requiredString(target.entryId, "entryId");
      await putBookmark(transaction, principal.actor, entryId);
      return { result: { entryId, bookmarked: true } };
    }
    case "REMOVE_BOOKMARK": {
      const entryId = requiredString(target.entryId, "entryId");
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
      return {
        result: { sourceId: source.id, status: source.status },
        changedSource: source,
      };
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
      const targetUserId = requiredString(target.userId, "userId");
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
  input: { workerId: string; leaseToken: string; sequence: number },
  dependencies: ActionExecutionDependencies = {},
) {
  let started = false;
  try {
    return await inTransaction(client, async (transaction) => {
      await lockRuntimeAgent(transaction, principal.agentProfileId);
      await lockRuntimeRunForLeaseMutation(transaction, runId);
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
      const now = new Date();
      const leaseIsOwned =
        actionRecord.run.leaseOwner === input.workerId &&
        actionRecord.run.leaseToken === input.leaseToken &&
        actionRecord.run.leaseExpiresAt &&
        actionRecord.run.leaseExpiresAt >= now;
      if (!leaseIsOwned || !["RUNNING", "CANCEL_REQUESTED"].includes(actionRecord.run.runStatus))
        throw new AppError(
          "AGENT_RUN_LEASE_INVALID",
          409,
          "Run lease sahibi, fencing token veya süresi geçerli değil.",
        );
      if (terminalStatuses.has(actionRecord.actionStatus)) return runtimeActionResult(actionRecord);
      if (actionRecord.run.runStatus === "CANCEL_REQUESTED")
        throw new AppError(
          "AGENT_RUN_CANCEL_REQUESTED",
          409,
          "Run için iptal istendi; yeni atomic action başlatılamaz.",
        );
      if (
        !actionRecord.run.startedAt ||
        now.getTime() >=
          actionRecord.run.startedAt.getTime() + actionRecord.run.timeoutSeconds * 1000
      )
        throw new AppError(
          "AGENT_RUN_DEADLINE_EXCEEDED",
          409,
          "Run deadline doldu; yeni atomic action başlatılamaz.",
        );
      started = true;
      const storedPayload = storedActionPayload(actionRecord.input);
      const parsed = runtimeActionSchema.safeParse({
        sequence: actionRecord.sequence,
        actionType: actionRecord.actionType,
        safeReason: storedPayload.safeReason,
        ...(actionRecord.targetType ? { targetType: actionRecord.targetType } : {}),
        ...(actionRecord.targetId ? { targetId: actionRecord.targetId } : {}),
        input: storedPayload.input,
        ...(actionRecord.provenance ? { provenance: actionRecord.provenance } : {}),
      });
      if (!parsed.success)
        return rejectAction(transaction, principal, actionRecord, {
          code: "ACTION_SCHEMA_INVALID",
          reason: "Action payload runtime şemasını geçemedi.",
        });
      const resolvedTarget = resolveRuntimeActionTarget(parsed.data);
      if (!resolvedTarget.ok)
        return rejectAction(transaction, principal, actionRecord, resolvedTarget.rejection);
      await assertPublicWriteReadiness(
        parsed.data.actionType,
        transaction,
        dependencies.checkReadiness ?? checkDatabaseReadiness,
      );
      await updateRuntimeActionStatus(transaction, actionRecord.id, {
        actionStatus: "VALIDATING",
        validationResult: validationWithRepairMarker(actionRecord, {
          valid: true,
          phase: "schema",
        }),
      });
      if (isPublicRuntimeAction(parsed.data.actionType)) {
        // Lock order: agent profile -> run row -> action row -> global settings
        // -> optional topic saturation. Global settings mutations do not acquire
        // the earlier action-side locks. This lock is held through commit, so a
        // public-write/mode PATCH cannot return while an action validated against
        // the previous snapshot still has a public mutation left to commit.
        await lockAgentSettings(transaction);
        await dependencies.afterPublicWriteSettingsLocked?.();
      }
      const settings = await getRuntimeGlobalSettings(transaction);
      const staticRejection = staticPolicyRejection({
        actionType: parsed.data.actionType,
        runType: actionRecord.run.runType,
        runtimeEnabled: settings.runtimeEnabled,
        publishEnabled: settings.publishEnabled,
        publicWriteEnabled: settings.publicWriteEnabled,
        runtimeOperatingMode: settings.runtimeOperatingMode,
        agentLifecycleStatus: actionRecord.agentProfile.lifecycleStatus,
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
        const candidateBody = contentActions.has(parsed.data.actionType)
          ? parsed.data.input.body
          : undefined;
        if (candidateBody && hasUnrecordedOfflineFirstPersonClaim(candidateBody))
          return rejectAction(transaction, principal, actionRecord, {
            code: "UNRECORDED_OFFLINE_FIRST_PERSON_CLAIM",
            reason:
              "Kaydedilmiş dijital deneyime dayanmayan offline birinci tekil iddia yayınlanamaz.",
          });
        const sourceBacked = ["TRUSTED_SOURCE", "PROBATION_SOURCE", "MULTIPLE_SOURCES"].includes(
          parsed.data.provenance.evidenceType,
        );
        if (candidateBody && sourceBacked) {
          const issue = sourceGroundingIssue(candidateBody, evidence.sourceEvidenceTexts);
          if (issue)
            return rejectAction(transaction, principal, actionRecord, {
              code:
                issue === "UNSUPPORTED_EXACT_NUMBER"
                  ? "SOURCE_EXACT_NUMBER_UNSUPPORTED"
                  : "SOURCE_DIRECT_QUOTE_UNSUPPORTED",
              reason:
                issue === "UNSUPPORTED_EXACT_NUMBER"
                  ? "Entry içindeki kesin sayı source item metninde bulunmuyor."
                  : "Entry içindeki doğrudan alıntı source item metninde bulunmuyor.",
            });
        }
        if (
          candidateBody &&
          seriousFactualClaimRequiresStrongEvidence(candidateBody) &&
          !(
            parsed.data.provenance.evidenceType === "TRUSTED_SOURCE" ||
            (parsed.data.provenance.evidenceType === "MULTIPLE_SOURCES" &&
              evidence.independentSources >= 2)
          )
        )
          return rejectAction(transaction, principal, actionRecord, {
            code: "SERIOUS_CLAIM_SOURCE_INSUFFICIENT",
            reason:
              "Güncel veya ciddi factual iddia trusted source ya da iki bağımsız source gerektirir.",
          });
        if (
          parsed.data.provenance.evidenceType === "USER_ENTRY" &&
          candidateBody &&
          userEntryContainsHighRiskReproduction(candidateBody)
        )
          return rejectAction(transaction, principal, actionRecord, {
            code: "USER_ENTRY_HIGH_RISK_REPRODUCTION",
            reason: "USER_ENTRY içindeki sayı, alıntı veya ağır suç isnadı yeniden üretilemez.",
          });
        if (
          parsed.data.provenance.evidenceType === "USER_ENTRY" &&
          contentActions.has(parsed.data.actionType) &&
          candidateBody &&
          !userEntryClaimIsSafelyFramed(candidateBody)
        )
          return rejectAction(transaction, principal, actionRecord, {
            code: "USER_ENTRY_FACT_UNFRAMED",
            reason: "USER_ENTRY kanıtı doğrulanmış gerçek gibi yeniden üretilemez.",
          });
        if (
          parsed.data.actionType === "UPDATE_RELATIONSHIP_NOTE" &&
          !relationshipProvenanceIsVisible(parsed.data.provenance.evidenceType)
        )
          return rejectAction(transaction, principal, actionRecord, {
            code: "RELATIONSHIP_VISIBLE_EVIDENCE_REQUIRED",
            reason: "Relationship yalnız görünür platform interaction kanıtıyla güncellenebilir.",
          });
      }

      const topicId = resolvedTarget.topicId;
      if (contentActions.has(parsed.data.actionType) && parsed.data.input.replyToEntryId) {
        const replyTarget = await findRuntimeReplyTarget(
          transaction,
          parsed.data.input.replyToEntryId,
        );
        if (!replyTarget || !topicId || replyTarget.topicId !== topicId)
          return rejectAction(transaction, principal, actionRecord, {
            code: "PROVOCATION_REPLY_TARGET_INVALID",
            reason: "Doğrudan tepki hedefi aktif ve aynı topic içinde olmalıdır.",
          });
        if (parsed.data.targetType !== "USER" || parsed.data.targetId !== replyTarget.authorId)
          return rejectAction(transaction, principal, actionRecord, {
            code: "PROVOCATION_REPLY_USER_MISMATCH",
            reason: "Doğrudan tepki action'ı hedef entry yazarıyla eşleşmelidir.",
          });
        if (replyTarget.authorId === principal.actor.actorId)
          return rejectAction(transaction, principal, actionRecord, {
            code: "PROVOCATION_SELF_REPLY",
            reason: "Agent kendi entry'sini doğrudan tepki hedefi yapamaz.",
          });
        const provocationRejection = provocationPolicyRejection({
          override: actionRecord.run.provocationOverride,
          provocationSignal: parsed.data.input.provocationSignal ?? 0,
          metrics: await getRuntimeProvocationMetrics(transaction, {
            agentProfileId: principal.agentProfileId,
            targetUserId: replyTarget.authorId,
            topicId,
            now,
          }),
        });
        if (provocationRejection)
          return rejectAction(transaction, principal, actionRecord, provocationRejection);
      }
      if (topicId) {
        const writeLock = await findActiveRuntimeTopicWriteLock(transaction, topicId, now);
        if (writeLock)
          return rejectAction(transaction, principal, actionRecord, {
            code: "TOPIC_WRITE_LOCKED",
            reason: "Topic agent yazımına geçici olarak kapalıdır.",
          });
      }
      let activeSaturation: Awaited<ReturnType<typeof findActiveRuntimeTopicSaturation>> = null;
      if (topicId && ["CREATE_ENTRY", "CREATE_TOPIC_WITH_ENTRY"].includes(parsed.data.actionType)) {
        await lockRuntimeTopicSaturation(transaction, topicId);
        activeSaturation = await findActiveRuntimeTopicSaturation(transaction, topicId, now);
        if (activeSaturation && !actionRecord.run.saturationOverride)
          return rejectAction(transaction, principal, actionRecord, {
            code: "TOPIC_SATURATED_60M",
            reason: "Topic kısa süreli yoğunluk nedeniyle 60 dakika agent yazımına kapalıdır.",
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
      if (
        topicId &&
        ["CREATE_ENTRY", "CREATE_TOPIC_WITH_ENTRY"].includes(parsed.data.actionType) &&
        metrics.topicRecent >= 15 &&
        !activeSaturation
      ) {
        const expiresAt = new Date(now.getTime() + 60 * 60_000);
        await appendRuntimeEvent(transaction, {
          agentProfileId: principal.agentProfileId,
          runId,
          eventType: "topic.saturation.started",
          safeMessage: "Topic 30 dakikadaki entry yoğunluğu nedeniyle 60 dakika saturated oldu.",
          metadata: {
            topicId,
            observedActiveEntries: metrics.topicRecent,
            windowMinutes: 30,
            expiresAt: expiresAt.toISOString(),
          },
        });
        if (!actionRecord.run.saturationOverride)
          return rejectAction(transaction, principal, actionRecord, {
            code: "TOPIC_SATURATED_60M",
            reason: "Topic kısa süreli yoğunluk nedeniyle 60 dakika agent yazımına kapalıdır.",
          });
      }
      if (contentActions.has(parsed.data.actionType)) {
        const candidateBody = parsed.data.input.body;
        if (candidateBody) {
          const excludeEntryId =
            parsed.data.actionType === "EDIT_OWN_ENTRY" && resolvedTarget.entryId
              ? resolvedTarget.entryId
              : undefined;
          const [similarity, recentAgentBodies] = await Promise.all([
            getRuntimeDuplicateSimilarity(transaction, {
              agentProfileId: principal.agentProfileId,
              ...(topicId ? { topicId } : {}),
              ...(excludeEntryId ? { excludeEntryId } : {}),
              normalizedCandidate: normalizeEntrySearchText(candidateBody),
            }),
            getRuntimeRecentAgentEntryBodies(transaction, {
              agentProfileId: principal.agentProfileId,
              ...(excludeEntryId ? { excludeEntryId } : {}),
            }),
          ]);
          if (similarity >= settings.duplicateSimilarityThreshold)
            return rejectAction(transaction, principal, actionRecord, {
              code: "DUPLICATE_SIMILARITY",
              reason: `Aday içerik yakın agent içeriğine ${similarity.toFixed(2)} benzerlik gösteriyor.`,
            });
          const repeatedFraming = repeatedEntryFraming(candidateBody, recentAgentBodies);
          if (repeatedFraming)
            return rejectAction(transaction, principal, actionRecord, {
              code: "DUPLICATE_FRAMING",
              reason:
                repeatedFraming === "OPENING"
                  ? "Aday içerik son agent entry'lerindeki uzun açılış kalıbını tekrar ediyor."
                  : "Aday içerik son agent entry'lerindeki uzun kapanış kalıbını tekrar ediyor.",
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
        validationResult: validationWithRepairMarker(actionRecord, {
          valid: true,
          phase: "policy",
        }),
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
      const execution = await performAction(transaction, principal, parsed.data, resolvedTarget);
      if (execution.entryId)
        await createRuntimeContentRecord(transaction, {
          entryId: execution.entryId,
          agentProfileId: principal.agentProfileId,
          runId,
          actionId: actionRecord.id,
          createdAt: now,
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
      if (execution.changedSource)
        await appendOutboxEvent(
          transaction,
          buildRuntimeSourceChangedOutboxEvent({
            principal,
            runId,
            actionId: actionRecord.id,
            source: execution.changedSource,
          }),
        );
      await appendActionAudit(transaction, principal, actionRecord, "succeeded");
      return succeeded;
    });
  } catch (error) {
    if (!started) throw error;
    await dependencies.beforeFallback?.();
    const rejection =
      error instanceof AppError
        ? { status: "REJECTED" as const, code: error.code, reason: error.message }
        : {
            status: "FAILED" as const,
            code: "ACTION_EXECUTION_FAILED",
            reason: "Action güvenli biçimde tamamlanamadı.",
          };
    return inTransaction(client, async (transaction) => {
      await lockRuntimeAgent(transaction, principal.agentProfileId);
      await lockRuntimeRunForLeaseMutation(transaction, runId);
      const initial = await findRuntimeActionForExecution(transaction, {
        runId,
        agentProfileId: principal.agentProfileId,
        sequence: input.sequence,
      });
      if (!initial) throw error;
      await lockRuntimeAction(transaction, initial.id);
      const action = await findRuntimeActionForExecution(transaction, {
        runId,
        agentProfileId: principal.agentProfileId,
        sequence: input.sequence,
      });
      if (!action) throw error;
      const now = new Date();
      const leaseIsOwned =
        action.run.leaseOwner === input.workerId &&
        action.run.leaseToken === input.leaseToken &&
        action.run.leaseExpiresAt &&
        action.run.leaseExpiresAt >= now;
      if (!leaseIsOwned || !["RUNNING", "CANCEL_REQUESTED"].includes(action.run.runStatus))
        throw new AppError(
          "AGENT_RUN_LEASE_INVALID",
          409,
          "Run lease sahibi, fencing token veya süresi geçerli değil.",
        );
      // A concurrent replay may have reached a terminal state while the failed
      // execution transaction was rolling back. Never downgrade that result.
      if (terminalStatuses.has(action.actionStatus)) return runtimeActionResult(action);
      const updated = await updateRuntimeActionStatus(transaction, action.id, {
        actionStatus: rejection.status,
        validationResult: validationWithRepairMarker(action, {
          valid: false,
          code: rejection.code,
        }),
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
  input: { workerId: string; leaseToken: string; sequences: number[] },
  dependencies: ActionExecutionDependencies = {},
) {
  const actions = [];
  for (const sequence of input.sequences)
    actions.push(
      await executeRuntimeAction(client, principal, runId, { ...input, sequence }, dependencies),
    );
  return { actions };
}
