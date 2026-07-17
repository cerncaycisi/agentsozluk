import { randomUUID } from "node:crypto";
import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor, TransactionClient } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { createOpaqueToken, sha256 } from "@/lib/security/crypto";
import { appendAuditLog } from "@/modules/audit";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { hashPassword } from "@/modules/auth/domain/password";
import { requireAgentAdminInTransaction } from "@/modules/agents/application/authorization";
import { assertLifecycleTransition } from "@/modules/agents/domain/authorization";
import { validatePersonaCandidate } from "@/modules/agents/domain/persona-validation";
import { assertQuotaConsistency } from "@/modules/agents/domain/quota";
import { assertDualConcurrencySupported } from "@/modules/agents/domain/capacity";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import { seedPersonaSchema, type SeedPersona } from "@/modules/agents/personas/schema";
import {
  appendPersonaVersion,
  appendRuntimeEvent,
  countQueuedRuns,
  createAgentRecords,
  findAgentDetailRecord,
  findAgentForMutation,
  findAgentIdentityConflict,
  findPersonaVersion,
  getGlobalSettingsRecord,
  getQuotaProfiles,
  listAgentDashboardRecords,
  listCurrentPersonas,
  lockAgentProfile,
  lockAgentSettings,
  rotateAgentCredentialRecords,
  updateAgentLifecycle,
  updateAgentProfileRecords,
  updateGlobalSettingsRecord,
} from "@/modules/agents/repository/control-plane";
import { getLatestRuntimeCapability } from "@/modules/agents/repository/capacity";
import type {
  CreateAgentInput,
  GlobalSettingsUpdateInput,
  LifecycleChangeInput,
  PersonaRollbackInput,
  RuntimeControlInput,
  UpdateAgentInput,
} from "@/modules/agents/validation/schemas";
import type { RuntimeCredentialRotationInput } from "@/modules/agents/validation/runtime-schemas";
import { appendOutboxEvent } from "@/modules/outbox";

const GLOBAL_SETTINGS_AGGREGATE_ID = "00000000-0000-4000-8000-000000000001";

async function recordControlPlaneChange(
  transaction: TransactionClient,
  actor: ActorContext,
  input: {
    eventType:
      | "agent.created"
      | "agent.updated"
      | "agent.lifecycle_changed"
      | "agent.persona_version_created"
      | "agent.credential_rotated"
      | "agent.settings_changed";
    entityType: "AgentProfile" | "AgentGlobalSettings";
    entityId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await appendAuditLog(transaction, {
    actorId: actor.actorId,
    action: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    requestId: actor.requestId,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
  await appendOutboxEvent(transaction, {
    eventType: input.eventType,
    aggregateType: input.entityType,
    aggregateId: input.entityId,
    actorId: actor.actorId,
    actorKind: actor.actorKind,
    requestId: actor.requestId,
    ...(input.metadata ? { payload: input.metadata } : {}),
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
      metadata: creationMetadata,
    });
    await appendRuntimeEvent(transaction, {
      agentProfileId: created.profile.id,
      eventType: "persona.version.created",
      safeMessage: "İlk persona sürümü oluşturuldu.",
      metadata: { version: 1, origin: "INITIAL" },
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
    const personaInput = input.persona;
    if (personaInput && personaInput.username !== current.user.username) {
      throw new AppError("VALIDATION_ERROR", 422, "Agent kullanıcı adı düzenlenemez.", {
        "persona.username": ["Mevcut kullanıcı adı korunmalıdır."],
      });
    }
    let personaVersion = null;
    if (personaInput) {
      if (!current.currentPersonaVersion) {
        throw new AppError("PERSONA_VERSION_NOT_FOUND", 409, "Mevcut persona sürümü bulunamadı.");
      }
      const existing = await listCurrentPersonas(transaction, agentProfileId);
      const validated = validatePersonaCandidate(
        personaInput,
        existingPersonaValues(existing),
        input.changeSummary!,
      );
      personaVersion = await appendPersonaVersion(transaction, {
        agentProfileId,
        currentVersionId: current.currentPersonaVersion.id,
        version: current.currentPersonaVersion.version + 1,
        persona: validated.persona,
        renderedPrompt: validated.renderedPrompt,
        changeOrigin: "ADMIN",
        changeSummary: input.changeSummary!,
        actorId: actor.actorId,
        validationReport: validated.report,
      });
      await appendRuntimeEvent(transaction, {
        agentProfileId,
        eventType: "persona.version.created",
        safeMessage: "Admin persona sürümü oluşturuldu.",
        metadata: { version: personaVersion.version, origin: "ADMIN" },
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
    await recordControlPlaneChange(transaction, actor, {
      eventType: personaVersion ? "agent.persona_version_created" : "agent.updated",
      entityType: "AgentProfile",
      entityId: agentProfileId,
      metadata: {
        changedFields: Object.keys(input).filter((key) => key !== "persona"),
        ...(personaVersion ? { personaVersion: personaVersion.version } : {}),
      },
    });
    return findAgentDetailRecord(transaction, agentProfileId);
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
    await recordControlPlaneChange(transaction, actor, {
      eventType: "agent.persona_version_created",
      entityType: "AgentProfile",
      entityId: agentProfileId,
      metadata: { personaVersion: created.version, rollbackFromVersion: input.version },
    });
    await appendRuntimeEvent(transaction, {
      agentProfileId,
      eventType: "persona.version.created",
      safeMessage: "Persona rollback yeni sürüm olarak oluşturuldu.",
      metadata: { version: created.version, origin: "ROLLBACK" },
    });
    return created;
  });
}

export async function changeAgentLifecycle(
  client: DatabaseExecutor,
  actor: ActorContext,
  agentProfileId: string,
  input: LifecycleChangeInput,
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
    }
    const updated = await updateAgentLifecycle(
      transaction,
      agentProfileId,
      actor.actorId,
      input.status,
    );
    await recordControlPlaneChange(transaction, actor, {
      eventType: "agent.lifecycle_changed",
      entityType: "AgentProfile",
      entityId: agentProfileId,
      metadata: { from: current.lifecycleStatus, to: input.status, reason: input.reason },
    });
    await appendRuntimeEvent(transaction, {
      agentProfileId,
      eventType: "agent.status.changed",
      safeMessage: `Lifecycle ${current.lifecycleStatus} durumundan ${input.status} durumuna geçti.`,
      metadata: { from: current.lifecycleStatus, to: input.status },
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
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    await lockAgentSettings(transaction);
    const current = await getGlobalSettingsRecord(transaction);
    if (input.codexConcurrency === 2) {
      assertDualConcurrencySupported(await getLatestRuntimeCapability(transaction));
    }
    const candidate = {
      defaultDailyEntryMin: input.defaultDailyEntryMin ?? current.defaultDailyEntryMin,
      defaultDailyEntryMax: input.defaultDailyEntryMax ?? current.defaultDailyEntryMax,
      globalDailyEntryMin: input.globalDailyEntryMin ?? current.globalDailyEntryMin,
      globalDailyEntryMax: input.globalDailyEntryMax ?? current.globalDailyEntryMax,
    };
    const profiles = await getQuotaProfiles(transaction);
    assertQuotaConsistency(candidate, profiles);
    const data = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    );
    const updated = await updateGlobalSettingsRecord(transaction, actor.actorId, data);
    await recordControlPlaneChange(transaction, actor, {
      eventType: "agent.settings_changed",
      entityType: "AgentGlobalSettings",
      entityId: GLOBAL_SETTINGS_AGGREGATE_ID,
      metadata: {
        settingsKey: "global",
        changedFields: Object.keys(data),
        settingsVersion: updated.settingsVersion,
      },
    });
    await appendRuntimeEvent(transaction, {
      eventType: "runtime.global.changed",
      safeMessage: "Global agent runtime ayarları güncellendi.",
      metadata: { changedFields: Object.keys(data), settingsVersion: updated.settingsVersion },
    });
    return updated;
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
    const updated = await updateGlobalSettingsRecord(transaction, actor.actorId, {
      runtimeEnabled: enabled,
    });
    await recordControlPlaneChange(transaction, actor, {
      eventType: "agent.settings_changed",
      entityType: "AgentGlobalSettings",
      entityId: GLOBAL_SETTINGS_AGGREGATE_ID,
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
      metadata: { reason: input.reason, credentialId: credential.id },
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
