import { randomUUID } from "node:crypto";
import { Prisma, type AgentSourceStatus } from "@prisma/client";
import { assertSafeAuditMetadata } from "@/modules/audit/domain/metadata";
import { insertAuditLog } from "@/modules/audit/repository/audit";
import {
  istanbulQuotaLocalDate,
  quotaSettingsSnapshotSchema,
  resolveQuotaSettings,
} from "@/modules/agents/domain/quota";
import { assertSafeOutboxPayload } from "@/modules/outbox/domain/event";
import { insertOutboxEvent } from "@/modules/outbox/repository/outbox";

const GLOBAL_SETTINGS_AGGREGATE_ID = "00000000-0000-4000-8000-000000000001";

export function findAgentAdminPrincipal(transaction: Prisma.TransactionClient, actorId: string) {
  return transaction.user.findUnique({
    where: { id: actorId },
    select: { id: true, kind: true, role: true, status: true },
  });
}

export async function lockAgentProfile(
  transaction: Prisma.TransactionClient,
  agentProfileId: string,
): Promise<void> {
  const key = `agent-profile:${agentProfileId}`;
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

export async function lockAgentSettings(transaction: Prisma.TransactionClient): Promise<void> {
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(92024002)`;
}

export async function lockAgentSource(
  transaction: Prisma.TransactionClient,
  sourceId: string,
): Promise<void> {
  const key = `agent-source:${sourceId}`;
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

export function listAgentSourcesRecord(
  transaction: Prisma.TransactionClient,
  input: {
    agentProfileId?: string;
    status?: AgentSourceStatus;
    adminPinned?: boolean;
    adminBlocked?: boolean;
    domain?: string;
    skip: number;
    take: number;
  },
) {
  const where: Prisma.AgentSourceWhereInput = {
    ...(input.agentProfileId ? { agentProfileId: input.agentProfileId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.adminPinned !== undefined ? { adminPinned: input.adminPinned } : {}),
    ...(input.adminBlocked !== undefined ? { adminBlocked: input.adminBlocked } : {}),
    ...(input.domain
      ? { normalizedDomain: { contains: input.domain.toLowerCase(), mode: "insensitive" } }
      : {}),
  };
  return Promise.all([
    transaction.agentSource.findMany({
      where,
      orderBy: [
        { adminBlocked: "desc" },
        { adminPinned: "desc" },
        { updatedAt: "desc" },
        { id: "desc" },
      ],
      skip: input.skip,
      take: input.take,
      select: {
        id: true,
        url: true,
        normalizedDomain: true,
        sourceType: true,
        status: true,
        topics: true,
        trustScore: true,
        interestScore: true,
        noveltyScore: true,
        usefulnessScore: true,
        adminPinned: true,
        adminBlocked: true,
        discoveredFrom: true,
        addedByOrigin: true,
        lastFetchedAt: true,
        lastUsefulAt: true,
        consecutiveFailures: true,
        createdAt: true,
        updatedAt: true,
        agentProfile: {
          select: { id: true, user: { select: { username: true, displayName: true } } },
        },
        _count: { select: { items: true } },
      },
    }),
    transaction.agentSource.count({ where }),
  ]);
}

export function findAgentSourceForAdmin(transaction: Prisma.TransactionClient, sourceId: string) {
  return transaction.agentSource.findUnique({
    where: { id: sourceId },
    include: { _count: { select: { items: true } } },
  });
}

export function updateAgentSourceAdminRecord(
  transaction: Prisma.TransactionClient,
  sourceId: string,
  data: Prisma.AgentSourceUpdateInput,
) {
  return transaction.agentSource.update({
    where: { id: sourceId },
    data,
    include: { _count: { select: { items: true } } },
  });
}

export function listAgentSourceScoreAudits(
  transaction: Prisma.TransactionClient,
  sourceId: string,
  window: { start: Date; end: Date },
) {
  return transaction.auditLog.findMany({
    where: {
      action: { in: ["agent.source.changed", "agent.source.updated"] },
      entityType: "AgentSource",
      entityId: sourceId,
      createdAt: { gte: window.start, lt: window.end },
    },
    select: { metadata: true },
    orderBy: { createdAt: "asc" },
  });
}

export function findAgentIdentityConflict(
  transaction: Prisma.TransactionClient,
  usernameNormalized: string,
) {
  return transaction.user.findUnique({
    where: { usernameNormalized },
    select: { id: true },
  });
}

export async function createAgentRecords(
  transaction: Prisma.TransactionClient,
  input: {
    userId: string;
    email: string;
    username: string;
    displayName: string;
    publicBio: string;
    passwordHash: string;
    lifecycleStatus: "DRAFT" | "PAUSED";
    useGlobalEntryQuota: boolean;
    dailyEntryMin: number | null;
    dailyEntryMax: number | null;
    dailyTopicMin: number;
    dailyTopicMax: number;
    dailyVoteMin: number;
    dailyVoteMax: number;
    activeTimeProfile: Prisma.InputJsonValue;
    personaEvolutionEnabled: boolean;
    sourceEvolutionEnabled: boolean;
    scheduledTimeoutSeconds: number;
    manualTimeoutSeconds: number;
    actorId: string;
    persona: Prisma.InputJsonValue;
    renderedPrompt: string;
    validationReport: Prisma.InputJsonValue;
    changeSummary: string;
    todayDate: Date;
    credentialTokenHash: string;
    credentialPrefix: string;
    sources: Array<{
      url: string;
      normalizedDomain: string;
      sourceType: string;
      status: "SEED" | "TRUSTED";
      topics: Prisma.InputJsonValue;
      trustScore: number;
      interestScore: number;
      adminPinned: boolean;
    }>;
  },
) {
  const user = await transaction.user.create({
    data: {
      id: input.userId,
      kind: "AGENT",
      role: "USER",
      status: "ACTIVE",
      email: input.email,
      emailNormalized: input.email,
      username: input.username,
      usernameNormalized: input.username,
      displayName: input.displayName,
      bio: input.publicBio,
      passwordHash: input.passwordHash,
      loginDisabled: true,
      termsVersion: "m2-agent-system",
      termsAcceptedAt: new Date(),
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      bio: true,
      kind: true,
      role: true,
      status: true,
    },
  });
  const profile = await transaction.agentProfile.create({
    data: {
      userId: user.id,
      lifecycleStatus: input.lifecycleStatus,
      useGlobalEntryQuota: input.useGlobalEntryQuota,
      dailyEntryMin: input.dailyEntryMin,
      dailyEntryMax: input.dailyEntryMax,
      dailyTopicMin: input.dailyTopicMin,
      dailyTopicMax: input.dailyTopicMax,
      dailyVoteMin: input.dailyVoteMin,
      dailyVoteMax: input.dailyVoteMax,
      activeTimeProfile: input.activeTimeProfile,
      personaEvolutionEnabled: input.personaEvolutionEnabled,
      sourceEvolutionEnabled: input.sourceEvolutionEnabled,
      scheduledTimeoutSeconds: input.scheduledTimeoutSeconds,
      manualTimeoutSeconds: input.manualTimeoutSeconds,
      createdById: input.actorId,
      updatedById: input.actorId,
    },
  });
  const personaVersion = await transaction.agentPersonaVersion.create({
    data: {
      agentProfileId: profile.id,
      version: 1,
      persona: input.persona,
      renderedPrompt: input.renderedPrompt,
      changeOrigin: "INITIAL",
      changeSummary: input.changeSummary,
      createdById: input.actorId,
      validationReport: input.validationReport,
    },
  });
  await transaction.agentProfile.update({
    where: { id: profile.id },
    data: { currentPersonaVersionId: personaVersion.id },
  });
  await transaction.agentRuntimeState.create({
    data: {
      agentProfileId: profile.id,
      todayDate: input.todayDate,
      runtimeMetadata: {},
    },
  });
  await transaction.agentCredential.create({
    data: {
      agentProfileId: profile.id,
      tokenHash: input.credentialTokenHash,
      prefix: input.credentialPrefix,
      scopes: ["runtime:lease", "runtime:read", "runtime:write", "runtime:plan"],
    },
  });
  if (input.sources.length > 0) {
    await transaction.agentSource.createMany({
      data: input.sources.map((source) => ({
        agentProfileId: profile.id,
        ...source,
        interestScore: source.interestScore,
        noveltyScore: 0.5,
        usefulnessScore: 0.5,
        adminBlocked: false,
        addedByOrigin: "INITIAL_PERSONA",
      })),
    });
  }
  return {
    user,
    profile: { ...profile, currentPersonaVersionId: personaVersion.id },
    personaVersion,
  };
}

export function listCurrentPersonas(
  transaction: Prisma.TransactionClient,
  excludeProfileId?: string,
) {
  return transaction.agentProfile.findMany({
    where: {
      currentPersonaVersionId: { not: null },
      lifecycleStatus: { not: "RETIRED" },
      ...(excludeProfileId ? { id: { not: excludeProfileId } } : {}),
    },
    select: { id: true, currentPersonaVersion: { select: { persona: true } } },
  });
}

export function listAgentDashboardRecords(transaction: Prisma.TransactionClient) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return transaction.agentProfile.findMany({
    orderBy: [{ lifecycleStatus: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      lifecycleStatus: true,
      dailyEntryMin: true,
      dailyEntryMax: true,
      useGlobalEntryQuota: true,
      createdAt: true,
      user: { select: { username: true, displayName: true, bio: true } },
      runtimeState: {
        include: {
          currentRun: {
            select: { id: true, runType: true, runStatus: true, startedAt: true, createdAt: true },
          },
        },
      },
      currentPersonaVersion: { select: { version: true, createdAt: true } },
      _count: { select: { sources: true, runs: true } },
      runs: {
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          runType: true,
          runStatus: true,
          startedAt: true,
          finishedAt: true,
          createdAt: true,
          usageMetadata: true,
          performanceMetrics: true,
        },
      },
      contentRecords: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { entryId: true, createdAt: true },
      },
    },
  });
}

export function findAgentDetailRecord(
  transaction: Prisma.TransactionClient,
  agentProfileId: string,
) {
  return transaction.agentProfile.findUnique({
    where: { id: agentProfileId },
    select: {
      id: true,
      lifecycleStatus: true,
      useGlobalEntryQuota: true,
      dailyEntryMin: true,
      dailyEntryMax: true,
      dailyTopicMin: true,
      dailyTopicMax: true,
      dailyVoteMin: true,
      dailyVoteMax: true,
      activeTimeProfile: true,
      personaEvolutionEnabled: true,
      sourceEvolutionEnabled: true,
      scheduledTimeoutSeconds: true,
      manualTimeoutSeconds: true,
      createdAt: true,
      updatedAt: true,
      retiredAt: true,
      user: {
        select: {
          username: true,
          displayName: true,
          bio: true,
          kind: true,
          role: true,
          status: true,
          loginDisabled: true,
        },
      },
      runtimeState: {
        include: {
          currentRun: {
            select: { id: true, runType: true, runStatus: true, startedAt: true, createdAt: true },
          },
        },
      },
      currentPersonaVersion: true,
      personaVersions: {
        orderBy: { version: "desc" },
        take: 100,
        select: {
          id: true,
          version: true,
          changeOrigin: true,
          changeSummary: true,
          validationReport: true,
          createdAt: true,
          createdById: true,
        },
      },
      sources: { orderBy: [{ adminPinned: "desc" }, { trustScore: "desc" }], take: 100 },
      runs: { orderBy: { createdAt: "desc" }, take: 50 },
      dailyPlans: {
        orderBy: { localDate: "desc" },
        take: 7,
        select: {
          id: true,
          localDate: true,
          entryTarget: true,
          topicTarget: true,
          voteTarget: true,
          status: true,
          slots: {
            orderBy: { scheduledAt: "asc" },
            take: 24,
            select: {
              id: true,
              scheduledAt: true,
              runType: true,
              status: true,
              runId: true,
            },
          },
        },
      },
      actions: {
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          actionType: true,
          actionStatus: true,
          targetType: true,
          targetId: true,
          createdAt: true,
        },
      },
      beliefs: {
        orderBy: { lastUpdatedAt: "desc" },
        take: 20,
        select: {
          id: true,
          topicKey: true,
          statement: true,
          confidence: true,
          status: true,
          version: true,
          lastUpdatedAt: true,
        },
      },
      relationships: {
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: {
          id: true,
          familiarity: true,
          trust: true,
          interest: true,
          disagreement: true,
          summary: true,
          lastInteractionAt: true,
          targetUser: { select: { username: true, displayName: true } },
        },
      },
      _count: {
        select: {
          memoryEpisodes: true,
          beliefs: true,
          relationships: true,
          actions: true,
          contentRecords: true,
          credentials: true,
        },
      },
    },
  });
}

export function findAgentForMutation(
  transaction: Prisma.TransactionClient,
  agentProfileId: string,
) {
  return transaction.agentProfile.findUnique({
    where: { id: agentProfileId },
    include: { user: true, currentPersonaVersion: true },
  });
}

export function countQueuedRuns(transaction: Prisma.TransactionClient) {
  return transaction.agentRun.groupBy({
    by: ["agentProfileId"],
    where: { runStatus: "QUEUED" },
    _count: { _all: true },
  });
}

export function findPersonaVersion(
  transaction: Prisma.TransactionClient,
  agentProfileId: string,
  version: number,
) {
  return transaction.agentPersonaVersion.findUnique({
    where: { agentProfileId_version: { agentProfileId, version } },
  });
}

export async function updateAgentProfileRecords(
  transaction: Prisma.TransactionClient,
  input: {
    agentProfileId: string;
    userId: string;
    actorId: string;
    displayName?: string;
    publicBio?: string;
    profileData: Prisma.AgentProfileUpdateInput;
  },
) {
  if (input.displayName !== undefined || input.publicBio !== undefined) {
    await transaction.user.update({
      where: { id: input.userId },
      data: {
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.publicBio !== undefined ? { bio: input.publicBio } : {}),
      },
    });
  }
  return transaction.agentProfile.update({
    where: { id: input.agentProfileId },
    data: { ...input.profileData, updatedBy: { connect: { id: input.actorId } } },
  });
}

export async function appendPersonaVersion(
  transaction: Prisma.TransactionClient,
  input: {
    agentProfileId: string;
    currentVersionId: string;
    version: number;
    persona: Prisma.InputJsonValue;
    renderedPrompt: string;
    changeOrigin: "ADMIN" | "ROLLBACK";
    changeSummary: string;
    actorId: string;
    validationReport: Prisma.InputJsonValue;
  },
) {
  const created = await transaction.agentPersonaVersion.create({
    data: {
      agentProfileId: input.agentProfileId,
      version: input.version,
      persona: input.persona,
      renderedPrompt: input.renderedPrompt,
      changeOrigin: input.changeOrigin,
      changeSummary: input.changeSummary,
      previousVersionId: input.currentVersionId,
      createdById: input.actorId,
      validationReport: input.validationReport,
    },
  });
  await transaction.agentProfile.update({
    where: { id: input.agentProfileId },
    data: { currentPersonaVersionId: created.id, updatedById: input.actorId },
  });
  return created;
}

export function updateAgentLifecycle(
  transaction: Prisma.TransactionClient,
  agentProfileId: string,
  actorId: string,
  status: "DRAFT" | "PAUSED" | "ACTIVE" | "SUSPENDED" | "RETIRED",
) {
  return transaction.agentProfile.update({
    where: { id: agentProfileId },
    data: {
      lifecycleStatus: status,
      updatedById: actorId,
      ...(status === "RETIRED" ? { retiredAt: new Date() } : {}),
    },
  });
}

export function getStoredGlobalSettingsRecord(transaction: Prisma.TransactionClient) {
  return transaction.agentGlobalSettings.findUniqueOrThrow({ where: { id: "global" } });
}

export async function getGlobalSettingsRecord(
  transaction: Prisma.TransactionClient,
  localDate = istanbulQuotaLocalDate(new Date()),
) {
  const stored = await getStoredGlobalSettingsRecord(transaction);
  return resolveQuotaSettings(stored, localDate);
}

export async function promotePendingQuotaSettingsRecord(
  transaction: Prisma.TransactionClient,
  localDate: Date,
  auditContext?: {
    actorId: string;
    actorKind: "HUMAN" | "AGENT";
    requestId: string;
  },
) {
  const stored = await getStoredGlobalSettingsRecord(transaction);
  if (
    !stored.pendingQuotaEffectiveDate ||
    stored.pendingQuotaSettings === null ||
    stored.pendingQuotaEffectiveDate.getTime() > localDate.getTime()
  )
    return { settings: resolveQuotaSettings(stored, localDate), promoted: false } as const;
  const quota = quotaSettingsSnapshotSchema.parse(stored.pendingQuotaSettings);
  const updated = await transaction.agentGlobalSettings.update({
    where: { id: "global" },
    data: {
      ...quota,
      pendingQuotaSettings: Prisma.DbNull,
      pendingQuotaEffectiveDate: null,
      settingsVersion: { increment: 1 },
    },
  });
  const actorId = auditContext?.actorId ?? stored.updatedById;
  const actorKind = auditContext?.actorKind ?? (actorId ? "HUMAN" : null);
  const requestId = auditContext?.requestId ?? randomUUID();
  const effectiveLocalDate = stored.pendingQuotaEffectiveDate.toISOString().slice(0, 10);
  const before = {
    quotaMode: stored.quotaMode,
    defaultDailyEntryMin: stored.defaultDailyEntryMin,
    defaultDailyEntryMax: stored.defaultDailyEntryMax,
    globalDailyEntryMin: stored.globalDailyEntryMin,
    globalDailyEntryMax: stored.globalDailyEntryMax,
  };
  const after = {
    quotaMode: updated.quotaMode,
    defaultDailyEntryMin: updated.defaultDailyEntryMin,
    defaultDailyEntryMax: updated.defaultDailyEntryMax,
    globalDailyEntryMin: updated.globalDailyEntryMin,
    globalDailyEntryMax: updated.globalDailyEntryMax,
  };
  const metadata = {
    actorKind,
    before,
    after,
    reason: "Pending quota settings reached their effective Europe/Istanbul date.",
    settingsKey: "global",
    changedFields: [
      "quotaMode",
      "defaultDailyEntryMin",
      "defaultDailyEntryMax",
      "globalDailyEntryMin",
      "globalDailyEntryMax",
    ],
    quotaApplyMode: "PROMOTE_PENDING",
    effectiveLocalDate,
    previousSettingsVersion: stored.settingsVersion,
    settingsVersion: updated.settingsVersion,
  };
  assertSafeAuditMetadata(metadata);
  assertSafeOutboxPayload(metadata);
  await insertAuditLog(transaction, {
    actorId,
    action: "agent.settings.changed",
    entityType: "AgentGlobalSettings",
    entityId: GLOBAL_SETTINGS_AGGREGATE_ID,
    requestId,
    metadata,
  });
  await insertOutboxEvent(transaction, {
    eventType: "agent.settings.changed",
    aggregateType: "AgentGlobalSettings",
    aggregateId: GLOBAL_SETTINGS_AGGREGATE_ID,
    actorId,
    actorKind,
    requestId,
    payload: metadata,
  });
  await appendRuntimeEvent(transaction, {
    eventType: "quota.changed",
    safeMessage: "Bekleyen global quota ayarları planlanan İstanbul tarihinde devreye girdi.",
    metadata: {
      quotaApplyMode: "PROMOTE_PENDING",
      effectiveLocalDate,
      settingsVersion: updated.settingsVersion,
    },
  });
  return { settings: updated, promoted: true } as const;
}

export function getProductionActivationAnchor(transaction: Prisma.TransactionClient) {
  return transaction.agentRuntimeEvent.findFirst({
    where: { eventType: "runtime.production.activated" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, agentProfileId: true, createdAt: true },
  });
}

export async function ensureProductionActivationAnchor(
  transaction: Prisma.TransactionClient,
  input: { agentProfileId: string; activatedAt: Date },
) {
  const existing = await getProductionActivationAnchor(transaction);
  if (existing) return existing;
  return transaction.agentRuntimeEvent.create({
    data: {
      agentProfileId: input.agentProfileId,
      eventType: "runtime.production.activated",
      safeMessage: "İlk agent ACTIVE oldu; production kritik breaker koruma penceresi başladı.",
      metadata: { trigger: "FIRST_AGENT_ACTIVE", timeZone: "Europe/Istanbul" },
      createdAt: input.activatedAt,
    },
    select: { id: true, agentProfileId: true, createdAt: true },
  });
}

export function pauseGlobalRuntimeForCriticalBreakerRecord(transaction: Prisma.TransactionClient) {
  return transaction.agentGlobalSettings.update({
    where: { id: "global" },
    data: {
      runtimeEnabled: false,
      settingsVersion: { increment: 1 },
      updatedBy: { disconnect: true },
    },
    select: { runtimeEnabled: true, settingsVersion: true, updatedAt: true },
  });
}

export function getQuotaProfiles(transaction: Prisma.TransactionClient) {
  return transaction.agentProfile.findMany({
    where: { lifecycleStatus: { not: "RETIRED" } },
    select: { id: true, useGlobalEntryQuota: true, dailyEntryMin: true, dailyEntryMax: true },
  });
}

export function updateGlobalSettingsRecord(
  transaction: Prisma.TransactionClient,
  actorId: string,
  data: Prisma.AgentGlobalSettingsUpdateInput,
  options: { clearPendingQuota?: boolean } = {},
) {
  return transaction.agentGlobalSettings.update({
    where: { id: "global" },
    data: {
      ...data,
      ...(options.clearPendingQuota
        ? { pendingQuotaSettings: Prisma.DbNull, pendingQuotaEffectiveDate: null }
        : {}),
      settingsVersion: { increment: 1 },
      updatedBy: { connect: { id: actorId } },
    },
  });
}

export async function rotateAgentCredentialRecords(
  transaction: Prisma.TransactionClient,
  input: {
    agentProfileId: string;
    tokenHash: string;
    prefix: string;
    now: Date;
  },
) {
  await transaction.agentCredential.updateMany({
    where: { agentProfileId: input.agentProfileId, revokedAt: null },
    data: { revokedAt: input.now },
  });
  return transaction.agentCredential.create({
    data: {
      agentProfileId: input.agentProfileId,
      tokenHash: input.tokenHash,
      prefix: input.prefix,
      scopes: ["runtime:lease", "runtime:read", "runtime:write", "runtime:plan"],
    },
    select: { id: true, prefix: true, scopes: true, createdAt: true },
  });
}

export function appendRuntimeEvent(
  transaction: Prisma.TransactionClient,
  input: {
    agentProfileId?: string;
    runId?: string;
    eventType: string;
    safeMessage: string;
    metadata?: Prisma.InputJsonValue;
  },
) {
  return transaction.agentRuntimeEvent.create({
    data: {
      ...(input.agentProfileId ? { agentProfileId: input.agentProfileId } : {}),
      ...(input.runId ? { runId: input.runId } : {}),
      eventType: input.eventType,
      safeMessage: input.safeMessage,
      metadata: input.metadata ?? {},
    },
  });
}

export async function listRuntimeEventsRecord(
  transaction: Prisma.TransactionClient,
  input: { afterId?: bigint; take: number },
) {
  const records = await transaction.agentRuntimeEvent.findMany({
    ...(input.afterId ? { where: { id: { gt: input.afterId } } } : {}),
    orderBy: { id: input.afterId ? "asc" : "desc" },
    take: input.take,
    select: {
      id: true,
      agentProfileId: true,
      runId: true,
      eventType: true,
      safeMessage: true,
      metadata: true,
      createdAt: true,
    },
  });
  return input.afterId ? records : records.reverse();
}
