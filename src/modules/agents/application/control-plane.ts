import { randomUUID } from "node:crypto";
import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor, InputJsonValue, TransactionClient } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { createOpaqueToken, sha256 } from "@/lib/security/crypto";
import { appendAuditLog } from "@/modules/audit";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { hashPassword } from "@/modules/auth/domain/password";
import { requireAgentAdminInTransaction } from "@/modules/agents/application/authorization";
import { assertLifecycleTransition } from "@/modules/agents/domain/authorization";
import { assertPinnedPersonaFieldsUnchanged } from "@/modules/agents/domain/persona-evolution";
import { validatePersonaCandidate } from "@/modules/agents/domain/persona-validation";
import {
  assertQuotaConsistency,
  istanbulQuotaLocalDate,
  nextIstanbulQuotaLocalDate,
  quotaSettingsSnapshot,
} from "@/modules/agents/domain/quota";
import {
  assertDualConcurrencySupported,
  runtimeFingerprint,
} from "@/modules/agents/domain/capacity";
import {
  assertSourceScoreWeeklyBudget,
  istanbulWeekWindow,
  sourceScoreFields,
  type SourceScoreChange,
} from "@/modules/agents/domain/source-evolution";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import { seedPersonaSchema, type SeedPersona } from "@/modules/agents/personas/schema";
import {
  appendPersonaVersion,
  appendRuntimeEvent,
  countQueuedRuns,
  createAgentRecords,
  ensureProductionActivationAnchor,
  findAgentDetailRecord,
  findAgentForMutation,
  findAgentIdentityConflict,
  findAgentSourceForAdmin,
  findPersonaVersion,
  getGlobalSettingsRecord,
  getQuotaProfiles,
  listAgentDashboardRecords,
  listCurrentPersonas,
  listAgentSourcesRecord,
  listAgentSourceScoreAudits,
  listRuntimeEventsRecord,
  lockAgentProfile,
  lockAgentSource,
  lockAgentSettings,
  promotePendingQuotaSettingsRecord,
  rotateAgentCredentialRecords,
  updateAgentLifecycle,
  updateAgentProfileRecords,
  updateAgentSourceAdminRecord,
  updateGlobalSettingsRecord,
} from "@/modules/agents/repository/control-plane";
import { regenerateRemainingAgentDailyPlansInTransaction } from "@/modules/agents/application/scheduler";
import { lockPersonaUniverse } from "@/modules/agents/repository/persona-lock";
import {
  getLatestRuntimeCapability,
  getLatestRuntimeFingerprintRecord,
} from "@/modules/agents/repository/capacity";
import type {
  CreateAgentInput,
  AgentSourceAdminUpdateInput,
  GlobalSettingsUpdateInput,
  LifecycleChangeInput,
  PersonaRollbackInput,
  RuntimeControlInput,
  UpdateAgentInput,
} from "@/modules/agents/validation/schemas";
import type { RuntimeCredentialRotationInput } from "@/modules/agents/validation/runtime-schemas";
import { appendOutboxEvent } from "@/modules/outbox";
import { RUNTIME_PROMPT_PROFILE_HASH } from "@/runtime/prompt-profile";

const GLOBAL_SETTINGS_AGGREGATE_ID = "00000000-0000-4000-8000-000000000001";
const QUOTA_SETTING_FIELDS = [
  "quotaMode",
  "defaultDailyEntryMin",
  "defaultDailyEntryMax",
  "globalDailyEntryMin",
  "globalDailyEntryMax",
] as const;
const CRITICAL_RUNTIME_SETTING_FIELD_NAMES = [
  "publicWriteEnabled",
  "runtimeOperatingMode",
] as const;

function settingsValueEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left !== null && right !== null && typeof left === "object" && typeof right === "object")
    return JSON.stringify(left) === JSON.stringify(right);
  return false;
}

export function listAgentSources(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: Parameters<typeof listAgentSourcesRecord>[1],
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    return listAgentSourcesRecord(transaction, input);
  });
}

export function updateAgentSourceAdmin(
  client: DatabaseExecutor,
  actor: ActorContext,
  sourceId: string,
  input: AgentSourceAdminUpdateInput,
  now = new Date(),
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    const candidate = await findAgentSourceForAdmin(transaction, sourceId);
    if (!candidate) throw new AppError("AGENT_SOURCE_NOT_FOUND", 404, "Agent source bulunamadı.");
    // Preserve the shared mutation order used by runtime actions:
    // agent profile -> source -> life-ledger advisory lock.
    await lockAgentProfile(transaction, candidate.agentProfileId);
    await lockAgentSource(transaction, sourceId);
    const current = await findAgentSourceForAdmin(transaction, sourceId);
    if (!current) throw new AppError("AGENT_SOURCE_NOT_FOUND", 404, "Agent source bulunamadı.");
    const week = istanbulWeekWindow(now);
    const recentAudits = await listAgentSourceScoreAudits(transaction, sourceId, week);
    const scoreChanges: Partial<Record<(typeof sourceScoreFields)[number], SourceScoreChange>> = {};
    for (const field of sourceScoreFields) {
      const next = input[field];
      if (next === undefined || next === current[field]) continue;
      scoreChanges[field] = { from: current[field], to: next };
    }
    const weeklyScoreBudget = assertSourceScoreWeeklyBudget({
      audits: recentAudits,
      changes: scoreChanges,
    });
    let adminBlocked = input.adminBlocked ?? current.adminBlocked;
    let status = input.status ?? current.status;
    if (input.status === "BLOCKED") adminBlocked = true;
    if (input.adminBlocked === true) status = "BLOCKED";
    if (input.adminBlocked === false && current.status === "BLOCKED" && input.status === undefined)
      status = "PROBATION";
    const adminPinned = input.adminPinned ?? current.adminPinned;
    if (adminPinned && adminBlocked)
      throw new AppError("VALIDATION_ERROR", 422, "Source aynı anda pinned ve blocked olamaz.");
    if (adminPinned && ["DORMANT", "REJECTED", "BLOCKED"].includes(status))
      throw new AppError(
        "VALIDATION_ERROR",
        422,
        "Pinned source dormant, rejected veya blocked durumuna alınamaz.",
      );
    const updated = await updateAgentSourceAdminRecord(transaction, sourceId, {
      ...(input.adminPinned !== undefined ? { adminPinned } : {}),
      ...(input.adminBlocked !== undefined || input.status === "BLOCKED" ? { adminBlocked } : {}),
      ...(input.status !== undefined || input.adminBlocked !== undefined ? { status } : {}),
      ...Object.fromEntries(
        sourceScoreFields.flatMap((field) =>
          input[field] === undefined ? [] : [[field, input[field]]],
        ),
      ),
    });
    const metadata = {
      actorKind: actor.actorKind,
      reason: input.reason,
      changeOrigin: "ADMIN",
      status: { from: current.status, to: updated.status },
      adminPinned: { from: current.adminPinned, to: updated.adminPinned },
      adminBlocked: { from: current.adminBlocked, to: updated.adminBlocked },
      scoreChanges,
      before: {
        status: current.status,
        adminPinned: current.adminPinned,
        adminBlocked: current.adminBlocked,
        ...Object.fromEntries(
          sourceScoreFields.flatMap((field) =>
            scoreChanges[field] ? [[field, scoreChanges[field]!.from]] : [],
          ),
        ),
      },
      after: {
        status: updated.status,
        adminPinned: updated.adminPinned,
        adminBlocked: updated.adminBlocked,
        ...Object.fromEntries(
          sourceScoreFields.flatMap((field) =>
            scoreChanges[field] ? [[field, scoreChanges[field]!.to]] : [],
          ),
        ),
      },
      weeklyScoreBudget: {
        timeZone: "Europe/Istanbul",
        start: week.start.toISOString(),
        end: week.end.toISOString(),
        fields: weeklyScoreBudget,
      },
      adminTrustedApproval:
        updated.status === "TRUSTED" && current.status !== "TRUSTED" && current._count.items < 3,
    };
    await appendAuditLog(transaction, {
      actorId: actor.actorId,
      action: "agent.source.changed",
      entityType: "AgentSource",
      entityId: sourceId,
      requestId: actor.requestId,
      metadata,
    });
    await appendOutboxEvent(transaction, {
      eventType: "agent.source.changed",
      aggregateType: "AgentSource",
      aggregateId: sourceId,
      actorId: actor.actorId,
      actorKind: actor.actorKind,
      requestId: actor.requestId,
      payload: metadata,
    });
    await appendRuntimeEvent(transaction, {
      agentProfileId: current.agentProfileId,
      eventType: "SOURCE_STATE_CHANGED",
      subject: { type: "SOURCE", id: sourceId },
      safeMessage: "Agent source admin tarafından güncellendi.",
      before: metadata.before,
      after: metadata.after,
      metadata: {
        origin: "ADMIN",
        reason: input.reason,
      },
    });
    return updated;
  });
}

export function listRuntimeEvents(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: { afterId?: bigint; take: number },
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    const events = await listRuntimeEventsRecord(transaction, input);
    return events.map((event) => ({ ...event, id: event.id.toString() }));
  });
}

async function recordControlPlaneChange(
  transaction: TransactionClient,
  actor: ActorContext,
  input: {
    eventType:
      | "agent.created"
      | "agent.updated"
      | "agent.paused"
      | "agent.resumed"
      | "agent.retired"
      | "agent.persona.versioned"
      | "agent.credential_rotated"
      | "agent.settings.changed";
    entityType: "AgentProfile" | "AgentGlobalSettings";
    entityId: string;
    reason: string;
    before: unknown;
    after: unknown;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const auditMetadata = {
    actorKind: actor.actorKind,
    before: input.before,
    after: input.after,
    reason: input.reason,
    ...(input.metadata ?? {}),
  };
  await appendAuditLog(transaction, {
    actorId: actor.actorId,
    action: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    requestId: actor.requestId,
    metadata: auditMetadata,
  });
  await appendOutboxEvent(transaction, {
    eventType: input.eventType,
    aggregateType: input.entityType,
    aggregateId: input.entityId,
    actorId: actor.actorId,
    actorKind: actor.actorKind,
    requestId: actor.requestId,
    payload: auditMetadata,
  });
}

function istanbulDate(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
}

function sourceRecords(persona: SeedPersona) {
  return persona.sources.map((source) => ({
    url: source.url,
    normalizedDomain: new URL(source.url).hostname.toLowerCase(),
    sourceType: source.sourceType,
    status: source.status,
    topics: source.topics,
    trustScore: source.status === "TRUSTED" ? 0.8 : 0.5,
    interestScore: source.weight,
    adminPinned: source.pinned,
  }));
}

function existingPersonaValues(
  records: Awaited<ReturnType<typeof listCurrentPersonas>>,
): unknown[] {
  return records.flatMap(({ currentPersonaVersion }) =>
    currentPersonaVersion ? [currentPersonaVersion.persona] : [],
  );
}

function validateCreationMethod(
  input: CreateAgentInput,
  sourceAgent: Awaited<ReturnType<typeof findAgentForMutation>>,
): void {
  if (input.creation.method === "TEMPLATE") {
    const templateUsername = input.creation.templateUsername;
    const template = originalPersonaPack.personas.find(
      ({ username }) => username === templateUsername,
    );
    if (!template) {
      throw new AppError("VALIDATION_ERROR", 422, "Persona şablonu bulunamadı.");
    }
  }
  if (input.creation.method === "CLONE" && !sourceAgent) {
    throw new AppError("AGENT_NOT_FOUND", 404, "Kopyalanacak agent bulunamadı.");
  }
}

export async function createAgent(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: CreateAgentInput,
) {
  const userId = randomUUID();
  const internalEmail = `agent+${userId}@invalid.local`;
  const passwordHash = await hashPassword(createOpaqueToken());
  const rawCredential = `agt_${createOpaqueToken()}`;
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    if (await findAgentIdentityConflict(transaction, input.persona.username)) {
      throw new AppError("USERNAME_TAKEN", 409, "Bu kullanıcı adı kullanılıyor.");
    }
    const sourceAgent =
      input.creation.method === "CLONE"
        ? await findAgentForMutation(transaction, input.creation.sourceAgentId)
        : null;
    validateCreationMethod(input, sourceAgent);
    await lockPersonaUniverse(transaction);
    const existing = await listCurrentPersonas(transaction);
    const validated = validatePersonaCandidate(
      input.persona,
      existingPersonaValues(existing),
      `Initial ${input.creation.method.toLowerCase()} persona`,
    );
    if (!input.useGlobalEntryQuota && !input.dailyEntry) {
      throw new AppError("QUOTA_INVALID", 422, "Özel quota için entry min/max zorunludur.");
    }
    const created = await createAgentRecords(transaction, {
      userId,
      email: internalEmail,
      username: validated.persona.username,
      displayName: validated.persona.displayName,
      publicBio: validated.persona.publicBio,
      passwordHash,
      lifecycleStatus: input.lifecycleStatus,
      useGlobalEntryQuota: input.useGlobalEntryQuota,
      dailyEntryMin: input.useGlobalEntryQuota ? null : (input.dailyEntry?.min ?? null),
      dailyEntryMax: input.useGlobalEntryQuota ? null : (input.dailyEntry?.max ?? null),
      dailyTopicMin: input.dailyTopic.min,
      dailyTopicMax: input.dailyTopic.max,
      dailyVoteMin: input.dailyVote.min,
      dailyVoteMax: input.dailyVote.max,
      activeTimeProfile: input.activeTimeProfile,
      personaEvolutionEnabled: input.personaEvolutionEnabled,
      sourceEvolutionEnabled: input.sourceEvolutionEnabled,
      scheduledTimeoutSeconds: input.scheduledTimeoutSeconds,
      manualTimeoutSeconds: input.manualTimeoutSeconds,
      actorId: actor.actorId,
      persona: validated.persona,
      renderedPrompt: validated.renderedPrompt,
      validationReport: validated.report,
      changeSummary: `Created from ${input.creation.method.toLowerCase()} input`,
      todayDate: istanbulDate(),
      credentialTokenHash: sha256(rawCredential),
      credentialPrefix: rawCredential.slice(0, 16),
      sources: sourceRecords(validated.persona),
    });
    const creationMetadata = {
      method: input.creation.method,
      lifecycleStatus: input.lifecycleStatus,
      personaVersion: 1,
    };
    await recordControlPlaneChange(transaction, actor, {
      eventType: "agent.created",
      entityType: "AgentProfile",
      entityId: created.profile.id,
      reason: `Agent created through ${input.creation.method} workflow.`,
      before: null,
      after: creationMetadata,
      metadata: creationMetadata,
    });
    await appendRuntimeEvent(transaction, {
      agentProfileId: created.profile.id,
      eventType: "LIFE_GENESIS_SNAPSHOT",
      subject: { type: "AGENT_PROFILE", id: created.profile.id },
      safeMessage: "Agent yaşam günlüğü başlangıç snapshot'ı oluşturuldu.",
      after: {
        lifecycleStatus: input.lifecycleStatus,
        useGlobalEntryQuota: input.useGlobalEntryQuota,
        dailyEntry: input.useGlobalEntryQuota
          ? { min: null, max: null }
          : { min: input.dailyEntry?.min ?? null, max: input.dailyEntry?.max ?? null },
        dailyTopic: input.dailyTopic,
        dailyVote: input.dailyVote,
        activeTimeProfile: input.activeTimeProfile,
        personaEvolutionEnabled: input.personaEvolutionEnabled,
        sourceEvolutionEnabled: input.sourceEvolutionEnabled,
        scheduledTimeoutSeconds: input.scheduledTimeoutSeconds,
        manualTimeoutSeconds: input.manualTimeoutSeconds,
        personaVersion: 1,
        runtimeStatus: "IDLE",
      },
      metadata: { origin: "AGENT_CREATION", method: input.creation.method },
    });
    await appendRuntimeEvent(transaction, {
      agentProfileId: created.profile.id,
      eventType: "PERSONA_CHANGED",
      subject: { type: "PERSONA", id: created.personaVersion.id },
      safeMessage: "İlk persona sürümü oluşturuldu.",
      after: { personaVersionId: created.personaVersion.id, version: 1 },
      metadata: { origin: "INITIAL" },
    });
    const [initialSources] = await listAgentSourcesRecord(transaction, {
      agentProfileId: created.profile.id,
      skip: 0,
      take: 100,
    });
    for (const source of initialSources)
      await appendRuntimeEvent(transaction, {
        agentProfileId: created.profile.id,
        eventType: "SOURCE_STATE_CHANGED",
        subject: { type: "SOURCE", id: source.id },
        safeMessage: "İlk persona source kaydı agent yaşam durumuna eklendi.",
        after: {
          normalizedDomain: source.normalizedDomain,
          urlHash: sha256(source.url),
          status: source.status,
          sourceType: source.sourceType,
          topics: source.topics,
          trustScore: source.trustScore,
          interestScore: source.interestScore,
          adminPinned: source.adminPinned,
          adminBlocked: source.adminBlocked,
        },
        metadata: { origin: "INITIAL_PERSONA" },
      });
    return {
      agent: created,
      credential: rawCredential,
      credentialShownOnce: true,
    };
  });
}

function percentile75(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.75) - 1] ?? null;
}

function jsonNumber(value: unknown, key: string): number {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : 0;
}

function agentProfileAuditSnapshot(profile: {
  lifecycleStatus: string;
  useGlobalEntryQuota: boolean;
  dailyEntryMin: number | null;
  dailyEntryMax: number | null;
  dailyTopicMin: number;
  dailyTopicMax: number;
  dailyVoteMin: number;
  dailyVoteMax: number;
  activeTimeProfile: unknown;
  personaEvolutionEnabled: boolean;
  sourceEvolutionEnabled: boolean;
  scheduledTimeoutSeconds: number;
  manualTimeoutSeconds: number;
  user: { displayName: string; bio: string | null };
  currentPersonaVersion: { version: number } | null;
}) {
  return {
    lifecycleStatus: profile.lifecycleStatus,
    displayName: profile.user.displayName,
    publicBio: profile.user.bio,
    useGlobalEntryQuota: profile.useGlobalEntryQuota,
    dailyEntry: { min: profile.dailyEntryMin, max: profile.dailyEntryMax },
    dailyTopic: { min: profile.dailyTopicMin, max: profile.dailyTopicMax },
    dailyVote: { min: profile.dailyVoteMin, max: profile.dailyVoteMax },
    activeTimeProfile: profile.activeTimeProfile as InputJsonValue,
    personaEvolutionEnabled: profile.personaEvolutionEnabled,
    sourceEvolutionEnabled: profile.sourceEvolutionEnabled,
    scheduledTimeoutSeconds: profile.scheduledTimeoutSeconds,
    manualTimeoutSeconds: profile.manualTimeoutSeconds,
    personaVersion: profile.currentPersonaVersion?.version ?? null,
  };
}

export async function listAgentDashboard(client: DatabaseExecutor, actor: ActorContext) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    const [records, queued] = await Promise.all([
      listAgentDashboardRecords(transaction),
      countQueuedRuns(transaction),
    ]);
    const queuedByAgent = new Map(queued.map((item) => [item.agentProfileId, item._count._all]));
    return records.map((record) => {
      const completed = record.runs.filter(({ runStatus }) =>
        ["SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED", "TIMED_OUT"].includes(runStatus),
      );
      const successful = completed.filter(({ runStatus }) => runStatus === "SUCCEEDED").length;
      const durations = completed.flatMap(({ startedAt, finishedAt }) =>
        startedAt && finishedAt ? [finishedAt.getTime() - startedAt.getTime()] : [],
      );
      const publishedEntries = record.runs.reduce(
        (sum, run) => sum + jsonNumber(run.performanceMetrics, "publishedEntries"),
        0,
      );
      const target = record.runtimeState?.todayEntryTarget ?? 0;
      return {
        id: record.id,
        user: record.user,
        lifecycleStatus: record.lifecycleStatus,
        runtimeStatus: record.runtimeState?.runtimeStatus ?? "IDLE",
        lastHeartbeatAt: record.runtimeState?.lastHeartbeatAt ?? null,
        currentRun: record.runtimeState?.currentRun ?? null,
        today: record.runtimeState
          ? {
              publishedEntries: record.runtimeState.todayPublishedEntries,
              entryTarget: target,
              createdTopics: record.runtimeState.todayCreatedTopics,
              topicTarget: record.runtimeState.todayTopicTarget,
              votes: record.runtimeState.todayVotes,
              voteTarget: record.runtimeState.todayVoteTarget,
              sourceReads: record.runtimeState.todaySourceReads,
            }
          : null,
        lastEntry: record.contentRecords[0] ?? null,
        nextRunAt: record.runtimeState?.nextScheduledAt ?? null,
        queueLength: queuedByAgent.get(record.id) ?? 0,
        consecutiveFailures: record.runtimeState?.consecutiveFailures ?? 0,
        lastError: record.runtimeState?.lastErrorSummary ?? null,
        personaVersion: record.currentPersonaVersion?.version ?? null,
        sourceCount: record._count.sources,
        codexInvocations: record.runs.filter(({ usageMetadata }) => usageMetadata !== null).length,
        latestUsageMetadata:
          record.runs.find(({ usageMetadata }) => usageMetadata !== null)?.usageMetadata ?? null,
        successRate24h: completed.length === 0 ? null : successful / completed.length,
        averageEntriesPerRun:
          record.runs.length === 0 ? null : publishedEntries / record.runs.length,
        p75RunDurationMs: percentile75(durations),
        targetProjection: target === 0 ? null : record.runtimeState!.todayPublishedEntries / target,
      };
    });
  });
}

export async function getAgentDetail(
  client: DatabaseExecutor,
  actor: ActorContext,
  agentProfileId: string,
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    const agent = await findAgentDetailRecord(transaction, agentProfileId);
    if (!agent) throw new AppError("AGENT_NOT_FOUND", 404, "Agent bulunamadı.");
    return agent;
  });
}

export async function updateAgent(
  client: DatabaseExecutor,
  actor: ActorContext,
  agentProfileId: string,
  input: UpdateAgentInput,
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    await lockAgentProfile(transaction, agentProfileId);
    const current = await findAgentForMutation(transaction, agentProfileId);
    if (!current) throw new AppError("AGENT_NOT_FOUND", 404, "Agent bulunamadı.");
    if (current.lifecycleStatus === "RETIRED") {
      throw new AppError("AGENT_LIFECYCLE_INVALID", 409, "Emekli agent düzenlenemez.");
    }
    const quotaChanged = input.useGlobalEntryQuota !== undefined || input.dailyEntry !== undefined;
    const quotaCandidate = quotaChanged
      ? {
          useGlobalEntryQuota: input.useGlobalEntryQuota ?? current.useGlobalEntryQuota,
          dailyEntryMin:
            input.useGlobalEntryQuota === true
              ? null
              : input.dailyEntry !== undefined
                ? (input.dailyEntry?.min ?? null)
                : current.dailyEntryMin,
          dailyEntryMax:
            input.useGlobalEntryQuota === true
              ? null
              : input.dailyEntry !== undefined
                ? (input.dailyEntry?.max ?? null)
                : current.dailyEntryMax,
        }
      : null;
    if (
      quotaCandidate?.useGlobalEntryQuota &&
      input.dailyEntry !== undefined &&
      input.dailyEntry !== null
    ) {
      throw new AppError(
        "QUOTA_INVALID",
        422,
        "Global quota seçiliyken özel agent entry quota gönderilemez.",
      );
    }
    if (
      quotaCandidate &&
      !quotaCandidate.useGlobalEntryQuota &&
      (quotaCandidate.dailyEntryMin === null || quotaCandidate.dailyEntryMax === null)
    ) {
      throw new AppError("QUOTA_INVALID", 422, "Özel quota için entry min/max zorunludur.");
    }
    if (quotaCandidate) {
      await lockAgentSettings(transaction);
      const [settings, profiles] = await Promise.all([
        getGlobalSettingsRecord(transaction),
        getQuotaProfiles(transaction),
      ]);
      assertQuotaConsistency(
        settings,
        profiles.map((profile) =>
          profile.id === agentProfileId ? { ...profile, ...quotaCandidate } : profile,
        ),
      );
    }
    const identityPatchRequested = input.displayName !== undefined || input.publicBio !== undefined;
    let personaInput = input.persona;
    if (personaInput || identityPatchRequested) {
      if (!current.currentPersonaVersion) {
        throw new AppError("PERSONA_VERSION_NOT_FOUND", 409, "Mevcut persona sürümü bulunamadı.");
      }
      const currentPersona = seedPersonaSchema.parse(current.currentPersonaVersion.persona);
      personaInput = seedPersonaSchema.parse({
        ...(personaInput ?? currentPersona),
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.publicBio !== undefined ? { publicBio: input.publicBio } : {}),
      });
    }
    if (personaInput && personaInput.username !== current.user.username) {
      throw new AppError("VALIDATION_ERROR", 422, "Agent kullanıcı adı düzenlenemez.", {
        "persona.username": ["Mevcut kullanıcı adı korunmalıdır."],
      });
    }
    let personaVersion = null;
    if (personaInput) {
      if (!current.currentPersonaVersion || !input.changeSummary) {
        throw new AppError(
          "VALIDATION_ERROR",
          422,
          "Persona kimliği değişikliği için güvenli değişiklik özeti zorunludur.",
        );
      }
      assertPinnedPersonaFieldsUnchanged(current.currentPersonaVersion.persona, personaInput);
      await lockPersonaUniverse(transaction);
      const existing = await listCurrentPersonas(transaction, agentProfileId);
      const validated = validatePersonaCandidate(
        personaInput,
        existingPersonaValues(existing),
        input.changeSummary,
      );
      personaVersion = await appendPersonaVersion(transaction, {
        agentProfileId,
        currentVersionId: current.currentPersonaVersion.id,
        version: current.currentPersonaVersion.version + 1,
        persona: validated.persona,
        renderedPrompt: validated.renderedPrompt,
        changeOrigin: "ADMIN",
        changeSummary: input.changeSummary,
        actorId: actor.actorId,
        validationReport: validated.report,
      });
      await appendRuntimeEvent(transaction, {
        agentProfileId,
        eventType: "PERSONA_CHANGED",
        subject: { type: "PERSONA", id: personaVersion.id },
        safeMessage: "Admin persona sürümü oluşturuldu.",
        before: {
          personaVersionId: current.currentPersonaVersion.id,
          version: current.currentPersonaVersion.version,
        },
        after: { personaVersionId: personaVersion.id, version: personaVersion.version },
        metadata: { origin: "ADMIN", changeSummary: input.changeSummary },
      });
    }
    const effectiveDisplayName = personaInput?.displayName ?? input.displayName;
    const effectivePublicBio = personaInput?.publicBio ?? input.publicBio;
    const profileData = {
      ...(quotaCandidate
        ? {
            useGlobalEntryQuota: quotaCandidate.useGlobalEntryQuota,
            dailyEntryMin: quotaCandidate.dailyEntryMin,
            dailyEntryMax: quotaCandidate.dailyEntryMax,
          }
        : {}),
      ...(input.dailyTopic
        ? { dailyTopicMin: input.dailyTopic.min, dailyTopicMax: input.dailyTopic.max }
        : {}),
      ...(input.dailyVote
        ? { dailyVoteMin: input.dailyVote.min, dailyVoteMax: input.dailyVote.max }
        : {}),
      ...(input.activeTimeProfile ? { activeTimeProfile: input.activeTimeProfile } : {}),
      ...(input.personaEvolutionEnabled !== undefined
        ? { personaEvolutionEnabled: input.personaEvolutionEnabled }
        : {}),
      ...(input.sourceEvolutionEnabled !== undefined
        ? { sourceEvolutionEnabled: input.sourceEvolutionEnabled }
        : {}),
      ...(input.scheduledTimeoutSeconds !== undefined
        ? { scheduledTimeoutSeconds: input.scheduledTimeoutSeconds }
        : {}),
      ...(input.manualTimeoutSeconds !== undefined
        ? { manualTimeoutSeconds: input.manualTimeoutSeconds }
        : {}),
    };
    await updateAgentProfileRecords(transaction, {
      agentProfileId,
      userId: current.userId,
      actorId: actor.actorId,
      ...(effectiveDisplayName !== undefined ? { displayName: effectiveDisplayName } : {}),
      ...(effectivePublicBio !== undefined ? { publicBio: effectivePublicBio } : {}),
      profileData,
    });
    const updatedAgent = await findAgentDetailRecord(transaction, agentProfileId);
    if (!updatedAgent) throw new AppError("AGENT_NOT_FOUND", 404, "Agent bulunamadı.");
    const beforeProfile = agentProfileAuditSnapshot(current);
    const afterProfile = agentProfileAuditSnapshot(updatedAgent);
    if (JSON.stringify(beforeProfile) !== JSON.stringify(afterProfile))
      await appendRuntimeEvent(transaction, {
        agentProfileId,
        eventType: "AGENT_PROFILE_CHANGED",
        subject: { type: "AGENT_PROFILE", id: agentProfileId },
        safeMessage: "Agent profil ve çalışma ayarları admin tarafından güncellendi.",
        before: beforeProfile,
        after: afterProfile,
        metadata: {
          origin: "ADMIN",
          reason: input.changeSummary ?? "Agent profile settings updated by administrator.",
        },
      });
    await recordControlPlaneChange(transaction, actor, {
      eventType: personaVersion ? "agent.persona.versioned" : "agent.updated",
      entityType: "AgentProfile",
      entityId: agentProfileId,
      reason: input.changeSummary ?? "Agent profile settings updated by administrator.",
      before: beforeProfile,
      after: afterProfile,
      metadata: {
        changedFields: Object.keys(input).filter(
          (key) => key !== "persona" && key !== "changeSummary",
        ),
        ...(personaVersion ? { personaVersion: personaVersion.version } : {}),
      },
    });
    return updatedAgent;
  });
}

export async function rollbackPersona(
  client: DatabaseExecutor,
  actor: ActorContext,
  agentProfileId: string,
  input: PersonaRollbackInput,
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    await lockAgentProfile(transaction, agentProfileId);
    const current = await findAgentForMutation(transaction, agentProfileId);
    if (!current) throw new AppError("AGENT_NOT_FOUND", 404, "Agent bulunamadı.");
    if (!current.currentPersonaVersion) {
      throw new AppError("PERSONA_VERSION_NOT_FOUND", 409, "Mevcut persona sürümü bulunamadı.");
    }
    const target = await findPersonaVersion(transaction, agentProfileId, input.version);
    if (!target) throw new AppError("PERSONA_VERSION_NOT_FOUND", 404, "Persona sürümü bulunamadı.");
    assertPinnedPersonaFieldsUnchanged(current.currentPersonaVersion.persona, target.persona);
    await lockPersonaUniverse(transaction);
    const existing = await listCurrentPersonas(transaction, agentProfileId);
    const validated = validatePersonaCandidate(
      target.persona,
      existingPersonaValues(existing),
      input.reason,
    );
    const created = await appendPersonaVersion(transaction, {
      agentProfileId,
      currentVersionId: current.currentPersonaVersion.id,
      version: current.currentPersonaVersion.version + 1,
      persona: validated.persona,
      renderedPrompt: validated.renderedPrompt,
      changeOrigin: "ROLLBACK",
      changeSummary: input.reason,
      actorId: actor.actorId,
      validationReport: validated.report,
    });
    await updateAgentProfileRecords(transaction, {
      agentProfileId,
      userId: current.userId,
      actorId: actor.actorId,
      displayName: validated.persona.displayName,
      publicBio: validated.persona.publicBio,
      profileData: {},
    });
    await recordControlPlaneChange(transaction, actor, {
      eventType: "agent.persona.versioned",
      entityType: "AgentProfile",
      entityId: agentProfileId,
      reason: input.reason,
      before: { personaVersion: current.currentPersonaVersion.version },
      after: { personaVersion: created.version },
      metadata: { personaVersion: created.version, rollbackFromVersion: input.version },
    });
    await appendRuntimeEvent(transaction, {
      agentProfileId,
      eventType: "PERSONA_CHANGED",
      subject: { type: "PERSONA", id: created.id },
      safeMessage: "Persona rollback yeni sürüm olarak oluşturuldu.",
      before: {
        personaVersionId: current.currentPersonaVersion.id,
        version: current.currentPersonaVersion.version,
      },
      after: { personaVersionId: created.id, version: created.version },
      metadata: { origin: "ROLLBACK", rollbackFromVersion: input.version },
    });
    return created;
  });
}

export async function changeAgentLifecycle(
  client: DatabaseExecutor,
  actor: ActorContext,
  agentProfileId: string,
  input: LifecycleChangeInput,
  now = new Date(),
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    await lockAgentProfile(transaction, agentProfileId);
    const current = await findAgentForMutation(transaction, agentProfileId);
    if (!current) throw new AppError("AGENT_NOT_FOUND", 404, "Agent bulunamadı.");
    assertLifecycleTransition(current.lifecycleStatus, input.status);
    if (input.status === "ACTIVE") {
      await lockAgentSettings(transaction);
      const [settings, profiles] = await Promise.all([
        getGlobalSettingsRecord(transaction),
        getQuotaProfiles(transaction),
      ]);
      assertQuotaConsistency(settings, profiles);
      await ensureProductionActivationAnchor(transaction, {
        agentProfileId,
        activatedAt: now,
      });
    }
    const updated = await updateAgentLifecycle(
      transaction,
      agentProfileId,
      actor.actorId,
      input.status,
    );
    const lifecycleEventType =
      input.status === "ACTIVE"
        ? "agent.resumed"
        : input.status === "RETIRED"
          ? "agent.retired"
          : input.status === "PAUSED" || input.status === "SUSPENDED"
            ? "agent.paused"
            : "agent.updated";
    await recordControlPlaneChange(transaction, actor, {
      eventType: lifecycleEventType,
      entityType: "AgentProfile",
      entityId: agentProfileId,
      reason: input.reason,
      before: { lifecycleStatus: current.lifecycleStatus },
      after: { lifecycleStatus: updated.lifecycleStatus },
      metadata: { from: current.lifecycleStatus, to: input.status, reason: input.reason },
    });
    await appendRuntimeEvent(transaction, {
      agentProfileId,
      eventType: "agent.status.changed",
      safeMessage: `Lifecycle ${current.lifecycleStatus} durumundan ${input.status} durumuna geçti.`,
      before: { lifecycleStatus: current.lifecycleStatus },
      after: { lifecycleStatus: updated.lifecycleStatus },
      metadata: { from: current.lifecycleStatus, to: input.status, reason: input.reason },
      occurredAt: now,
    });
    return updated;
  });
}

export async function getGlobalSettings(client: DatabaseExecutor, actor: ActorContext) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    return getGlobalSettingsRecord(transaction);
  });
}

export async function updateGlobalSettings(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: GlobalSettingsUpdateInput,
  now = new Date(),
) {
  const localDate = istanbulQuotaLocalDate(now);
  await inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    await lockAgentSettings(transaction);
    await promotePendingQuotaSettingsRecord(transaction, localDate, {
      actorId: actor.actorId,
      actorKind: actor.actorKind,
      requestId: actor.requestId,
    });
  });
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    await lockAgentSettings(transaction);
    const current = await getGlobalSettingsRecord(transaction, localDate);
    const changesCriticalRuntimeControl = CRITICAL_RUNTIME_SETTING_FIELD_NAMES.some(
      (field) => input[field] !== undefined,
    );
    if (
      changesCriticalRuntimeControl &&
      (input.expectedSettingsVersion === undefined || !input.changeReason)
    )
      throw new AppError(
        "VALIDATION_ERROR",
        422,
        "Kritik runtime kontrolü güncel settings version ve gerekçe gerektirir.",
      );
    if (
      input.expectedSettingsVersion !== undefined &&
      input.expectedSettingsVersion !== current.settingsVersion
    )
      throw new AppError(
        "AGENT_SETTINGS_VERSION_CONFLICT",
        409,
        "Global agent ayarları başka bir işlem tarafından değiştirildi; güncel durumu yükleyin.",
      );
    if (input.codexConcurrency === 2) {
      const [capability, fingerprintRecord] = await Promise.all([
        getLatestRuntimeCapability(transaction),
        getLatestRuntimeFingerprintRecord(transaction),
      ]);
      const observedFingerprint = runtimeFingerprint(fingerprintRecord?.usageMetadata);
      assertDualConcurrencySupported(capability, {
        now,
        codexVersion: observedFingerprint.codexVersion ?? capability?.codexVersion ?? "",
        promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
      });
    }
    const activeQuotaSettings = quotaSettingsSnapshot({
      quotaMode: current.quotaMode,
      defaultDailyEntryMin: current.defaultDailyEntryMin,
      defaultDailyEntryMax: current.defaultDailyEntryMax,
      globalDailyEntryMin: current.globalDailyEntryMin,
      globalDailyEntryMax: current.globalDailyEntryMax,
    });
    const nextQuotaEffectiveDate = nextIstanbulQuotaLocalDate(now);
    const quotaBase =
      input.quotaApplyMode === "NEXT_DAY" &&
      current.pendingQuotaEffectiveDate?.getTime() === nextQuotaEffectiveDate.getTime() &&
      current.pendingQuotaSettings !== null
        ? quotaSettingsSnapshot(current.pendingQuotaSettings)
        : activeQuotaSettings;
    const quotaCandidate = quotaSettingsSnapshot({
      quotaMode: input.quotaMode ?? quotaBase.quotaMode,
      defaultDailyEntryMin: input.defaultDailyEntryMin ?? quotaBase.defaultDailyEntryMin,
      defaultDailyEntryMax: input.defaultDailyEntryMax ?? quotaBase.defaultDailyEntryMax,
      globalDailyEntryMin: input.globalDailyEntryMin ?? quotaBase.globalDailyEntryMin,
      globalDailyEntryMax: input.globalDailyEntryMax ?? quotaBase.globalDailyEntryMax,
    });
    const profiles = await getQuotaProfiles(transaction);
    assertQuotaConsistency(quotaCandidate, profiles);
    const quotaCommand = QUOTA_SETTING_FIELDS.some((field) => input[field] !== undefined);
    const nonQuotaData = Object.fromEntries(
      Object.entries(input).filter(
        ([key, value]) =>
          key !== "quotaApplyMode" &&
          key !== "expectedSettingsVersion" &&
          key !== "changeReason" &&
          !QUOTA_SETTING_FIELDS.includes(key as (typeof QUOTA_SETTING_FIELDS)[number]) &&
          value !== undefined &&
          !settingsValueEqual(current[key as keyof typeof current], value),
      ),
    ) as Parameters<typeof updateGlobalSettingsRecord>[2];
    let data: Parameters<typeof updateGlobalSettingsRecord>[2] = nonQuotaData;
    let clearPendingQuota = false;
    let effectiveLocalDate: Date | null = null;
    if (quotaCommand && input.quotaApplyMode === "NEXT_DAY") {
      effectiveLocalDate = nextQuotaEffectiveDate;
      const pendingMatches =
        current.pendingQuotaEffectiveDate?.getTime() === effectiveLocalDate.getTime() &&
        settingsValueEqual(current.pendingQuotaSettings, quotaCandidate);
      if (!pendingMatches)
        data = {
          ...data,
          pendingQuotaSettings: quotaCandidate,
          pendingQuotaEffectiveDate: effectiveLocalDate,
        };
    } else if (quotaCommand) {
      data = {
        ...data,
        ...Object.fromEntries(
          QUOTA_SETTING_FIELDS.flatMap((field) =>
            settingsValueEqual(current[field], quotaCandidate[field])
              ? []
              : [[field, quotaCandidate[field]]],
          ),
        ),
      };
      clearPendingQuota =
        current.pendingQuotaSettings !== null || current.pendingQuotaEffectiveDate !== null;
    }
    const hasSettingsMutation = Object.keys(data).length > 0 || clearPendingQuota;
    const updated = hasSettingsMutation
      ? await updateGlobalSettingsRecord(transaction, actor.actorId, data, { clearPendingQuota })
      : current;
    let regeneration: Awaited<
      ReturnType<typeof regenerateRemainingAgentDailyPlansInTransaction>
    > | null = null;
    if (quotaCommand && input.quotaApplyMode === "REGENERATE_REMAINING_TODAY")
      regeneration = await regenerateRemainingAgentDailyPlansInTransaction(
        transaction,
        actor,
        {
          localDate,
          reason: input.changeReason ?? "Global quota settings changed by human administrator.",
        },
        now,
      );
    const changedFields = [
      ...Object.keys(nonQuotaData),
      ...(quotaCommand ? QUOTA_SETTING_FIELDS.filter((field) => input[field] !== undefined) : []),
    ];
    if (hasSettingsMutation) {
      const criticalRuntimeChanges = Object.fromEntries(
        CRITICAL_RUNTIME_SETTING_FIELD_NAMES.flatMap((field) =>
          input[field] !== undefined && !settingsValueEqual(current[field], updated[field])
            ? [[field, { from: current[field], to: updated[field] }]]
            : [],
        ),
      );
      const before = Object.fromEntries(
        changedFields.map((field) => {
          const quotaField = QUOTA_SETTING_FIELDS.find((candidate) => candidate === field);
          return [
            field,
            quotaField && input.quotaApplyMode === "NEXT_DAY"
              ? quotaBase[quotaField]
              : current[field as keyof typeof current],
          ];
        }),
      );
      const after = Object.fromEntries(
        changedFields.map((field) => {
          const quotaField = QUOTA_SETTING_FIELDS.find((candidate) => candidate === field);
          return [
            field,
            quotaField ? quotaCandidate[quotaField] : updated[field as keyof typeof updated],
          ];
        }),
      );
      await recordControlPlaneChange(transaction, actor, {
        eventType: "agent.settings.changed",
        entityType: "AgentGlobalSettings",
        entityId: GLOBAL_SETTINGS_AGGREGATE_ID,
        reason: input.changeReason ?? "Global settings updated by administrator.",
        before,
        after,
        metadata: {
          settingsKey: "global",
          changedFields,
          settingsVersion: updated.settingsVersion,
          ...(Object.keys(criticalRuntimeChanges).length > 0 ? { criticalRuntimeChanges } : {}),
          ...(quotaCommand
            ? {
                quotaApplyMode: input.quotaApplyMode ?? "IMMEDIATE_INTERNAL",
                effectiveLocalDate:
                  effectiveLocalDate?.toISOString().slice(0, 10) ??
                  localDate.toISOString().slice(0, 10),
              }
            : {}),
        },
      });
      await appendRuntimeEvent(transaction, {
        eventType: "runtime.global.changed",
        safeMessage:
          input.quotaApplyMode === "NEXT_DAY"
            ? "Global agent quota ayarları yarından itibaren uygulanmak üzere kaydedildi."
            : "Global agent runtime ayarları güncellendi.",
        metadata: {
          changedFields,
          settingsVersion: updated.settingsVersion,
          ...(quotaCommand
            ? {
                quotaApplyMode: input.quotaApplyMode ?? "IMMEDIATE_INTERNAL",
                effectiveLocalDate:
                  effectiveLocalDate?.toISOString().slice(0, 10) ??
                  localDate.toISOString().slice(0, 10),
              }
            : {}),
        },
      });
    }
    return {
      ...updated,
      ...(quotaCommand
        ? {
            quotaApplication: {
              mode: input.quotaApplyMode ?? "IMMEDIATE_INTERNAL",
              effectiveLocalDate:
                effectiveLocalDate?.toISOString().slice(0, 10) ??
                localDate.toISOString().slice(0, 10),
              regeneration,
            },
          }
        : {}),
    };
  });
}

export async function setGlobalRuntimeEnabled(
  client: DatabaseExecutor,
  actor: ActorContext,
  enabled: boolean,
  input: RuntimeControlInput,
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    await lockAgentSettings(transaction);
    const current = await getGlobalSettingsRecord(transaction);
    const updated = await updateGlobalSettingsRecord(transaction, actor.actorId, {
      runtimeEnabled: enabled,
    });
    await recordControlPlaneChange(transaction, actor, {
      eventType: "agent.settings.changed",
      entityType: "AgentGlobalSettings",
      entityId: GLOBAL_SETTINGS_AGGREGATE_ID,
      reason: input.reason,
      before: { runtimeEnabled: current.runtimeEnabled },
      after: { runtimeEnabled: updated.runtimeEnabled },
      metadata: {
        settingsKey: "global",
        changedFields: ["runtimeEnabled"],
        settingsVersion: updated.settingsVersion,
        reason: input.reason,
        command: enabled ? "RESUME" : "PAUSE",
      },
    });
    await appendRuntimeEvent(transaction, {
      eventType: enabled ? "breaker.reset" : "runtime.global.paused",
      safeMessage: enabled
        ? "Global runtime admin tarafından açıldı ve breaker geçmişi resetlendi."
        : "Global runtime admin tarafından pause edildi.",
      metadata: { settingsVersion: updated.settingsVersion, reason: input.reason },
    });
    return updated;
  });
}

export async function rotateAgentCredential(
  client: DatabaseExecutor,
  actor: ActorContext,
  agentProfileId: string,
  input: RuntimeCredentialRotationInput,
) {
  const rawCredential = `agt_${createOpaqueToken()}`;
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    await lockAgentProfile(transaction, agentProfileId);
    const agent = await findAgentForMutation(transaction, agentProfileId);
    if (!agent) throw new AppError("AGENT_NOT_FOUND", 404, "Agent bulunamadı.");
    if (agent.lifecycleStatus === "RETIRED") {
      throw new AppError("AGENT_LIFECYCLE_INVALID", 409, "Emekli agent credential'ı döndürülemez.");
    }
    const credential = await rotateAgentCredentialRecords(transaction, {
      agentProfileId,
      tokenHash: sha256(rawCredential),
      prefix: rawCredential.slice(0, 16),
      now: new Date(),
    });
    await recordControlPlaneChange(transaction, actor, {
      eventType: "agent.credential_rotated",
      entityType: "AgentProfile",
      entityId: agentProfileId,
      reason: input.reason,
      before: { credentialState: "CURRENT" },
      after: { credentialState: "ROTATED", credentialId: credential.id },
      metadata: { credentialId: credential.id },
    });
    await appendRuntimeEvent(transaction, {
      agentProfileId,
      eventType: "agent.credential.rotated",
      safeMessage: "Agent runtime credential'ı admin tarafından döndürüldü.",
      metadata: { credentialId: credential.id },
    });
    return {
      agentProfileId,
      credentialRecord: credential,
      credential: rawCredential,
      credentialShownOnce: true,
    };
  });
}

export function parseStoredPersona(value: unknown): SeedPersona {
  return seedPersonaSchema.parse(value);
}
