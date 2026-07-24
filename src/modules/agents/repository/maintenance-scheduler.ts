import type { Prisma } from "@prisma/client";

const queuedRunEventSelect = {
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

export type QueuedRunEventRecord = Prisma.AgentRunGetPayload<{
  select: typeof queuedRunEventSelect;
}>;

function istanbulClock(now: Date): { hour: number; weekday: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    hour: Number(value("hour")),
    weekday: value("weekday"),
  };
}

export async function planRuntimeMaintenance(
  transaction: Prisma.TransactionClient,
  input: {
    agentProfileId: string;
    localDate: Date;
    now: Date;
    reflectionTimeoutSeconds: number;
    sourceRefreshTimeoutSeconds: number;
    personaEvolutionEnabled: boolean;
    sourceEvolutionEnabled: boolean;
  },
) {
  const dateKey = input.localDate.toISOString().slice(0, 10);
  const clock = istanbulClock(input.now);
  const profile = await transaction.agentProfile.findFirst({
    where: {
      id: input.agentProfileId,
      lifecycleStatus: "ACTIVE",
      currentPersonaVersionId: { not: null },
    },
    select: {
      currentPersonaVersionId: true,
      personaEvolutionEnabled: true,
      sourceEvolutionEnabled: true,
    },
  });
  if (!profile?.currentPersonaVersionId)
    return { maintenanceQueued: 0, runs: [] as QueuedRunEventRecord[] };
  let maintenanceQueued = 0;
  const queuedRuns: QueuedRunEventRecord[] = [];
  const createMaintenance = async (definition: {
    trigger: string;
    runType: "REFLECTION" | "SOURCE_REFRESH";
    timeoutSeconds: number;
    allowSourceReading: boolean;
  }) => {
    const idempotencyKey = `maintenance:${definition.trigger}:${input.agentProfileId}:${dateKey}`;
    if (await transaction.agentRun.findUnique({ where: { idempotencyKey } })) return;
    const run = await transaction.agentRun.create({
      select: queuedRunEventSelect,
      data: {
        agentProfileId: input.agentProfileId,
        runType: definition.runType,
        queuePriority: definition.runType === "SOURCE_REFRESH" ? "SOURCE_REFRESH" : "REFLECTION",
        trigger: definition.trigger,
        personaVersionId: profile.currentPersonaVersionId!,
        idempotencyKey,
        availableAt: input.now,
        timeoutSeconds: definition.timeoutSeconds,
        desiredEntryMin: 0,
        desiredEntryMax: 0,
        allowTopicCreation: false,
        allowVoting: false,
        allowFollowing: false,
        allowSourceReading: definition.allowSourceReading,
        createdAt: input.now,
      },
    });
    queuedRuns.push(run);
    maintenanceQueued += 1;
  };
  if (clock.hour >= 2)
    await createMaintenance({
      trigger: "NIGHTLY_MEMORY_CONSOLIDATION",
      runType: "REFLECTION",
      timeoutSeconds: input.reflectionTimeoutSeconds,
      allowSourceReading: false,
    });
  if (
    clock.weekday === "Sun" &&
    clock.hour >= 3 &&
    input.personaEvolutionEnabled &&
    profile.personaEvolutionEnabled
  )
    await createMaintenance({
      trigger: "WEEKLY_PERSONA_REFLECTION",
      runType: "REFLECTION",
      timeoutSeconds: input.reflectionTimeoutSeconds,
      allowSourceReading: false,
    });
  if (clock.hour >= 4 && input.sourceEvolutionEnabled && profile.sourceEvolutionEnabled)
    await createMaintenance({
      trigger: "DAILY_SOURCE_REFRESH",
      runType: "SOURCE_REFRESH",
      timeoutSeconds: input.sourceRefreshTimeoutSeconds,
      allowSourceReading: true,
    });
  return { maintenanceQueued, runs: queuedRuns };
}
