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
  const [settings, runningCount, queuedCount, candidates] = await Promise.all([
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
    transaction.agentRun.count({
      where: { runStatus: "QUEUED", availableAt: { lte: now } },
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
      },
    }),
  ]);
  return { settings, runningCount, queuedCount, candidates };
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
