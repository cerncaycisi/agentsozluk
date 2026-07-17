import type { Prisma } from "@prisma/client";

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
      scopes: ["runtime:lease", "runtime:read", "runtime:write"],
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

export function getGlobalSettingsRecord(transaction: Prisma.TransactionClient) {
  return transaction.agentGlobalSettings.findUniqueOrThrow({ where: { id: "global" } });
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
) {
  return transaction.agentGlobalSettings.update({
    where: { id: "global" },
    data: { ...data, settingsVersion: { increment: 1 }, updatedBy: { connect: { id: actorId } } },
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
      scopes: ["runtime:lease", "runtime:read", "runtime:write"],
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
