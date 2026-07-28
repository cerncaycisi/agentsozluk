import type { AgentSourceStatus, Prisma } from "@prisma/client";
import { appendAgentLifeEventRecord } from "@/modules/agents/repository/life-ledger";
import { assertSafeLifeLedgerValue } from "@/modules/agents/domain/life-ledger-safety";

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
    agentProfileId: string;
    credentialId: string;
    email: string;
    username: string;
    displayName: string;
    publicBio: string;
    passwordHash: string;
    lifecycleStatus: "DRAFT" | "PAUSED";
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
    runtimeEnrollmentCipher: string | null;
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
      id: input.agentProfileId,
      userId: user.id,
      lifecycleStatus: input.lifecycleStatus,
      useGlobalEntryQuota: false,
      dailyEntryMin: 0,
      dailyEntryMax: 0,
      dailyTopicMin: 0,
      dailyTopicMax: 0,
      dailyVoteMin: 0,
      dailyVoteMax: 0,
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
      id: input.credentialId,
      agentProfileId: profile.id,
      tokenHash: input.credentialTokenHash,
      prefix: input.credentialPrefix,
      scopes: ["runtime:lease", "runtime:read", "runtime:write", "runtime:plan"],
      runtimeEnrollmentCipher: input.runtimeEnrollmentCipher,
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

export async function getAgentLifeReconstructionSnapshot(
  transaction: Prisma.TransactionClient,
  agentProfileId: string,
): Promise<Prisma.InputJsonValue> {
  const rows = await transaction.$queryRaw<Array<{ snapshot: Prisma.JsonValue | null }>>`
    SELECT agent_life_reconstruction_snapshot(${agentProfileId}::UUID) AS "snapshot"
  `;
  const snapshot = rows[0]?.snapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot))
    throw new Error("AGENT_LIFE_RECONSTRUCTION_SNAPSHOT_NOT_FOUND");
  return snapshot as Prisma.InputJsonValue;
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
      credentials: {
        where: { revokedAt: null },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: { id: true, runtimeEnrollmentCipher: true },
      },
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
        select: {
          entryId: true,
          createdAt: true,
          entry: { select: { publicId: true } },
        },
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

export function getGlobalSettingsRecord(transaction: Prisma.TransactionClient) {
  return getStoredGlobalSettingsRecord(transaction);
}

export function getProductionActivationAnchor(transaction: Prisma.TransactionClient) {
  return transaction.agentRuntimeEvent.findFirst({
    where: { eventType: "runtime.production.activated" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, agentProfileId: true, createdAt: true },
  });
}

const productionRolloutAttemptEventTypes = [
  "runtime.production.rollout_attempt.started",
  "runtime.production.rollout_attempt.aborted",
  "runtime.production.rollout_attempt.completed",
] as const;

export function getLatestProductionRolloutAttemptEvent(transaction: Prisma.TransactionClient) {
  return transaction.agentRuntimeEvent.findFirst({
    where: {
      eventType: { in: [...productionRolloutAttemptEventTypes] },
      agentProfileId: null,
      runId: null,
      actionId: null,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, eventType: true, metadata: true, createdAt: true },
  });
}

export function getProductionRolloutAttemptStartEvent(
  transaction: Prisma.TransactionClient,
  attemptId: string,
) {
  return transaction.agentRuntimeEvent.findFirst({
    where: {
      eventType: "runtime.production.rollout_attempt.started",
      agentProfileId: null,
      runId: null,
      actionId: null,
      metadata: { path: ["attemptId"], equals: attemptId },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, eventType: true, metadata: true, createdAt: true, occurredAt: true },
  });
}

export function getProductionRolloutCommandEvent(
  transaction: Prisma.TransactionClient,
  commandId: string,
) {
  return transaction.agentRuntimeEvent.findFirst({
    where: {
      eventType: { startsWith: "runtime.production.rollout" },
      agentProfileId: null,
      runId: null,
      actionId: null,
      metadata: { path: ["commandId"], equals: commandId },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, eventType: true, metadata: true, createdAt: true, occurredAt: true },
  });
}

export function getProductionRolloutTerminalEvent(
  transaction: Prisma.TransactionClient,
  attemptId: string,
) {
  return transaction.agentRuntimeEvent.findFirst({
    where: {
      eventType: {
        in: [
          "runtime.production.rollout_attempt.aborted",
          "runtime.production.rollout_attempt.completed",
        ],
      },
      agentProfileId: null,
      runId: null,
      actionId: null,
      metadata: { path: ["attemptId"], equals: attemptId },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, eventType: true, metadata: true, createdAt: true, occurredAt: true },
  });
}

export async function getProductionSafetyWindowAnchor(transaction: Prisma.TransactionClient) {
  const latestAttemptEvent = await getLatestProductionRolloutAttemptEvent(transaction);
  if (!latestAttemptEvent) return getProductionActivationAnchor(transaction);
  return latestAttemptEvent.eventType === "runtime.production.rollout_attempt.started"
    ? latestAttemptEvent
    : null;
}

export async function getProductionRolloutOperationalState(
  transaction: Prisma.TransactionClient,
  now: Date,
) {
  const [
    settings,
    profileCounts,
    nonterminalRunCount,
    liveLeaseCount,
    firstActivation,
    latestEvent,
  ] = await Promise.all([
    transaction.agentGlobalSettings.findUniqueOrThrow({
      where: { id: "global" },
      select: {
        runtimeEnabled: true,
        schedulerEnabled: true,
        publicWriteEnabled: true,
        runtimeOperatingMode: true,
      },
    }),
    transaction.agentProfile.groupBy({
      by: ["lifecycleStatus"],
      _count: { _all: true },
    }),
    transaction.agentRun.count({
      where: { runStatus: { in: ["QUEUED", "RUNNING", "CANCEL_REQUESTED"] } },
    }),
    transaction.agentRun.count({
      where: {
        runStatus: { in: ["RUNNING", "CANCEL_REQUESTED"] },
        leaseExpiresAt: { gt: now },
      },
    }),
    getProductionActivationAnchor(transaction),
    getLatestProductionRolloutAttemptEvent(transaction),
  ]);
  const count = (lifecycleStatus: "PAUSED" | "ACTIVE") =>
    profileCounts.find((item) => item.lifecycleStatus === lifecycleStatus)?._count._all ?? 0;
  const totalProfileCount = profileCounts.reduce((sum, item) => sum + item._count._all, 0);
  return {
    settings,
    totalProfileCount,
    pausedProfileCount: count("PAUSED"),
    activeProfileCount: count("ACTIVE"),
    nonterminalRunCount,
    liveLeaseCount,
    firstActivation,
    latestEvent,
  };
}

export async function ensureProductionActivationAnchor(
  transaction: Prisma.TransactionClient,
  input: { agentProfileId: string; activatedAt: Date },
) {
  const existing = await getProductionActivationAnchor(transaction);
  if (existing) return existing;
  return appendAgentLifeEventRecord(transaction, {
    agentProfileId: input.agentProfileId,
    eventType: "runtime.production.activated",
    summary: "İlk agent ACTIVE oldu; production kritik breaker koruma penceresi başladı.",
    metadata: { trigger: "FIRST_AGENT_ACTIVE", timeZone: "Europe/Istanbul" },
    occurredAt: input.activatedAt,
    createdAt: input.activatedAt,
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

export function updateGlobalSettingsRecord(
  transaction: Prisma.TransactionClient,
  actorId: string,
  data: Prisma.AgentGlobalSettingsUpdateInput,
) {
  return transaction.agentGlobalSettings.update({
    where: { id: "global" },
    data: {
      ...data,
      settingsVersion: { increment: 1 },
      updatedBy: { connect: { id: actorId } },
    },
  });
}

export async function rotateAgentCredentialRecords(
  transaction: Prisma.TransactionClient,
  input: {
    credentialId: string;
    agentProfileId: string;
    tokenHash: string;
    prefix: string;
    runtimeEnrollmentCipher: string | null;
    now: Date;
  },
) {
  await transaction.agentCredential.updateMany({
    where: { agentProfileId: input.agentProfileId, revokedAt: null },
    data: { revokedAt: input.now },
  });
  return transaction.agentCredential.create({
    data: {
      id: input.credentialId,
      agentProfileId: input.agentProfileId,
      tokenHash: input.tokenHash,
      prefix: input.prefix,
      scopes: ["runtime:lease", "runtime:read", "runtime:write", "runtime:plan"],
      runtimeEnrollmentCipher: input.runtimeEnrollmentCipher,
    },
    select: { id: true, prefix: true, scopes: true, createdAt: true },
  });
}

export function appendRuntimeEvent(
  transaction: Prisma.TransactionClient,
  input: {
    agentProfileId?: string;
    runId?: string;
    actionId?: string;
    decisionSequence?: number;
    eventType: string;
    safeMessage: string;
    subject?: Prisma.InputJsonValue;
    confidence?: number;
    evidenceIds?: string[];
    causedByEventIds?: bigint[];
    before?: Prisma.InputJsonValue;
    after?: Prisma.InputJsonValue;
    metadata?: Prisma.InputJsonValue;
    occurredAt?: Date;
  },
) {
  if (input.agentProfileId) {
    const metadata = input.metadata ?? {};
    const metadataRecord =
      metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? (metadata as Prisma.JsonObject)
        : null;
    const before = input.before ?? metadataRecord?.before;
    const after = input.after ?? metadataRecord?.after;
    return appendAgentLifeEventRecord(transaction, {
      agentProfileId: input.agentProfileId,
      ...(input.runId ? { runId: input.runId } : {}),
      ...(input.actionId ? { actionId: input.actionId } : {}),
      ...(input.decisionSequence ? { decisionSequence: input.decisionSequence } : {}),
      eventType: input.eventType,
      ...(input.subject !== undefined ? { subject: input.subject } : {}),
      summary: input.safeMessage,
      ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
      ...(input.evidenceIds ? { evidenceIds: input.evidenceIds } : {}),
      ...(input.causedByEventIds ? { causedByEventIds: input.causedByEventIds } : {}),
      ...(before !== undefined && before !== null
        ? { before: before as Prisma.InputJsonValue }
        : {}),
      ...(after !== undefined && after !== null ? { after: after as Prisma.InputJsonValue } : {}),
      metadata,
      ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
    });
  }
  assertSafeLifeLedgerValue({ summary: input.safeMessage, metadata: input.metadata ?? {} });
  return transaction.agentRuntimeEvent.create({
    data: {
      ...(input.runId ? { runId: input.runId } : {}),
      eventType: input.eventType,
      safeMessage: input.safeMessage,
      metadata: input.metadata ?? {},
      ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
    },
  });
}

export async function listRuntimeEventsRecord(
  transaction: Prisma.TransactionClient,
  input: { afterId?: bigint; beforeId?: bigint; take: number; includeTechnical?: boolean },
) {
  const cursorWhere = input.afterId
    ? { id: { gt: input.afterId } }
    : input.beforeId
      ? { id: { lt: input.beforeId } }
      : {};
  const records = await transaction.agentRuntimeEvent.findMany({
    where: {
      ...cursorWhere,
      ...(input.includeTechnical ? {} : { eventType: { not: "agent.heartbeat" } }),
    },
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
      agentProfile: {
        select: {
          user: { select: { displayName: true, username: true } },
        },
      },
    },
  });
  return input.afterId ? records : records.reverse();
}

export function countRuntimeEventsRecord(
  transaction: Prisma.TransactionClient,
  input: { includeTechnical?: boolean } = {},
) {
  if (input.includeTechnical) return transaction.agentRuntimeEvent.count();
  return transaction.agentRuntimeEvent.count({
    where: { eventType: { not: "agent.heartbeat" } },
  });
}
