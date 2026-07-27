import type { Prisma } from "@prisma/client";

const stochasticRunSelect = {
  id: true,
  agentProfileId: true,
  runType: true,
  queuePriority: true,
  runStatus: true,
  trigger: true,
  availableAt: true,
  desiredEntryMin: true,
  desiredEntryMax: true,
  parentRunId: true,
} as const satisfies Prisma.AgentRunSelect;

export type StochasticQueuedRun = Prisma.AgentRunGetPayload<{
  select: typeof stochasticRunSelect;
}>;

type RuntimeRosterSync = {
  loadedCredentialIds: string[];
  syncedAt: Date;
} | null;

function profileCredentialReady(
  profile: {
    credentials: Array<{ id: string; runtimeEnrollmentCipher: string | null }>;
  },
  sync: RuntimeRosterSync,
  now: Date,
): boolean {
  const credential = profile.credentials[0];
  if (!credential) return false;
  if (!sync) return credential.runtimeEnrollmentCipher === null;
  if (now.getTime() - sync.syncedAt.getTime() > 120_000) return false;
  return sync.loadedCredentialIds.includes(credential.id);
}

export async function lockStochasticSchedulerTick(
  transaction: Prisma.TransactionClient,
  tickKey: string,
): Promise<void> {
  const key = `agent-stochastic-tick:${tickKey}`;
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

export async function stochasticSchedulerTickWasCreated(
  transaction: Prisma.TransactionClient,
  tickKey: string,
): Promise<boolean> {
  return Boolean(
    await transaction.agentRuntimeEvent.findFirst({
      where: {
        eventType: "scheduler.stochastic_tick",
        metadata: { path: ["tickKey"], equals: tickKey },
      },
      select: { id: true },
    }),
  );
}

export async function getStochasticSchedulerSnapshot(
  transaction: Prisma.TransactionClient,
  now: Date,
) {
  const [settings, runningCount, queuedRecords, candidateRecords, credentialSync] =
    await Promise.all([
      transaction.agentGlobalSettings.findUniqueOrThrow({
        where: { id: "global" },
        select: {
          settingsVersion: true,
          runtimeEnabled: true,
          schedulerEnabled: true,
          publishEnabled: true,
          publicWriteEnabled: true,
          runtimeOperatingMode: true,
          sourceReadingEnabled: true,
          votingEnabled: true,
          topicCreationEnabled: true,
          userFollowingEnabled: true,
          codexConcurrency: true,
          scheduledTimeoutSeconds: true,
          activeTimeWeights: true,
        },
      }),
      transaction.agentRun.count({
        where: {
          runStatus: { in: ["RUNNING", "CANCEL_REQUESTED"] },
          leaseExpiresAt: { gte: now },
        },
      }),
      transaction.agentRun.findMany({
        where: {
          runStatus: "QUEUED",
          availableAt: { lte: now },
          agentProfile: {
            lifecycleStatus: "ACTIVE",
            currentPersonaVersionId: { not: null },
          },
        },
        select: {
          id: true,
          agentProfile: {
            select: {
              credentials: {
                where: { revokedAt: null },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                take: 1,
                select: { id: true, runtimeEnrollmentCipher: true },
              },
            },
          },
        },
      }),
      transaction.agentProfile.findMany({
        where: {
          lifecycleStatus: "ACTIVE",
          currentPersonaVersionId: { not: null },
          runs: {
            none: { runStatus: { in: ["QUEUED", "RUNNING", "CANCEL_REQUESTED"] } },
          },
        },
        orderBy: { id: "asc" },
        select: {
          id: true,
          currentPersonaVersionId: true,
          activeTimeProfile: true,
          runtimeState: { select: { lastRunAt: true } },
          credentials: {
            where: { revokedAt: null },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 1,
            select: { id: true, runtimeEnrollmentCipher: true },
          },
        },
      }),
      transaction.agentRuntimeCredentialSync.findUnique({
        where: { id: "global" },
        select: { loadedCredentialIds: true, syncedAt: true },
      }),
    ]);
  const queuedCount = queuedRecords.filter(({ agentProfile }) =>
    profileCredentialReady(agentProfile, credentialSync, now),
  ).length;
  const candidates = candidateRecords.filter((candidate) =>
    profileCredentialReady(candidate, credentialSync, now),
  );
  return { settings, runningCount, queuedCount, candidates };
}

export async function cancelUnleaseableQueuedRuns(
  transaction: Prisma.TransactionClient,
  now: Date,
) {
  const [queued, credentialSync] = await Promise.all([
    transaction.agentRun.findMany({
      where: { runStatus: "QUEUED" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 100,
      select: {
        id: true,
        agentProfileId: true,
        runType: true,
        trigger: true,
        queuePriority: true,
        agentProfile: {
          select: {
            lifecycleStatus: true,
            currentPersonaVersionId: true,
            credentials: {
              where: { revokedAt: null },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: 1,
              select: { id: true, runtimeEnrollmentCipher: true },
            },
          },
        },
      },
    }),
    transaction.agentRuntimeCredentialSync.findUnique({
      where: { id: "global" },
      select: { loadedCredentialIds: true, syncedAt: true },
    }),
  ]);
  const candidates = queued
    .filter(
      ({ agentProfile }) =>
        agentProfile.lifecycleStatus !== "ACTIVE" ||
        agentProfile.currentPersonaVersionId === null ||
        !profileCredentialReady(agentProfile, credentialSync, now),
    )
    .map(({ id, agentProfileId, runType, trigger, queuePriority }) => ({
      id,
      agentProfileId,
      runType,
      trigger,
      queuePriority,
    }));
  if (candidates.length === 0) return [];
  const recovered = [];
  for (const candidate of candidates) {
    const result = await transaction.agentRun.updateMany({
      where: { id: candidate.id, runStatus: "QUEUED" },
      data: {
        runStatus: "CANCELLED",
        cancelRequestedAt: now,
        finishedAt: now,
        errorCode: "AGENT_RUNTIME_NOT_READY",
        errorSummary: "Agent ACTIVE ve çalıştırılabilir olmadığı için queued run kapatıldı.",
        leaseOwner: null,
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
    if (result.count === 1) recovered.push(candidate);
  }
  return recovered;
}

export async function createStochasticWakeRuns(
  transaction: Prisma.TransactionClient,
  input: {
    candidates: Array<{ id: string; personaVersionId: string }>;
    tickKey: string;
    now: Date;
    timeoutSeconds: number;
    allowTopicCreation: boolean;
    allowVoting: boolean;
    allowFollowing: boolean;
    allowSourceReading: boolean;
  },
): Promise<StochasticQueuedRun[]> {
  const runs: StochasticQueuedRun[] = [];
  for (const candidate of input.candidates) {
    const idempotencyKey = `stochastic-wake:${input.tickKey}:${candidate.id}`;
    const existing = await transaction.agentRun.findUnique({
      where: { idempotencyKey },
      select: stochasticRunSelect,
    });
    if (existing) {
      runs.push(existing);
      continue;
    }
    runs.push(
      await transaction.agentRun.create({
        select: stochasticRunSelect,
        data: {
          agentProfileId: candidate.id,
          runType: "NORMAL_WAKE",
          queuePriority: "SCHEDULED_CONTENT",
          trigger: "STOCHASTIC_TICK",
          personaVersionId: candidate.personaVersionId,
          idempotencyKey,
          availableAt: input.now,
          timeoutSeconds: input.timeoutSeconds,
          desiredEntryMin: 0,
          desiredEntryMax: 1,
          allowTopicCreation: input.allowTopicCreation,
          allowVoting: input.allowVoting,
          allowFollowing: input.allowFollowing,
          allowSourceReading: input.allowSourceReading,
          // These persistence fields are legacy evidence only. Daily quotas
          // and automatic topic saturation no longer participate in dispatch.
          saturationOverride: false,
          dailyMaximumOverride: false,
          provocationOverride: false,
          createdAt: input.now,
        },
      }),
    );
  }
  return runs;
}
