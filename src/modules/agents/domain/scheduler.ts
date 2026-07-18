import { createHash } from "node:crypto";

export interface DailyPlanProfile {
  agentProfileId: string;
  entryMin: number;
  entryMax: number;
  topicMin: number;
  topicMax: number;
  voteMin: number;
  voteMax: number;
  activeTimeWeights: Record<string, number>;
}

export interface PlannedScheduleSlot {
  scheduledAt: Date;
  desiredEntryMin: number;
  desiredEntryMax: number;
}

export interface GeneratedDailyPlan {
  randomSeed: string;
  entryTarget: number;
  topicTarget: number;
  voteTarget: number;
  slots: PlannedScheduleSlot[];
}

export interface DailyPlanCapacityStrategy {
  entryTarget: number;
  topicTarget: number;
  voteTarget: number;
  contentRunCount: number;
  maxDesiredEntry: 3 | 4;
}

export interface DailyPlanScheduleConstraints {
  notBefore?: Date;
  fixedSlots?: PlannedScheduleSlot[];
  excludedScheduledAt?: Date[];
}

export interface AdaptiveContentRunInput {
  entryTarget: number;
  measuredP75DurationMs: number;
  availableCapacityMinutes: number;
  historicalSuccessRate: number;
  historicalEntriesPerSuccessfulRun: number;
}

/**
 * Selects the normal 6-8 content-run envelope from measured runtime capacity
 * and the agent's observed delivery yield. The published target is deliberately
 * not changed here; an impossible target remains visible to the capacity/SLO
 * layer instead of being silently reduced.
 */
export function calculateAdaptiveContentRunCount(input: AdaptiveContentRunInput): number {
  if (
    !Number.isInteger(input.entryTarget) ||
    input.entryTarget < 0 ||
    !Number.isFinite(input.measuredP75DurationMs) ||
    input.measuredP75DurationMs <= 0 ||
    !Number.isFinite(input.availableCapacityMinutes) ||
    input.availableCapacityMinutes < 0 ||
    !Number.isFinite(input.historicalSuccessRate) ||
    input.historicalSuccessRate < 0 ||
    input.historicalSuccessRate > 1 ||
    !Number.isFinite(input.historicalEntriesPerSuccessfulRun) ||
    input.historicalEntriesPerSuccessfulRun <= 0
  )
    throw new RangeError("Adaptive scheduler girdileri geçerli ölçümler olmalıdır.");
  if (input.entryTarget === 0) return 0;

  const effectiveSuccessRate = Math.max(0.25, input.historicalSuccessRate);
  const effectiveEntriesPerRun = Math.min(4, input.historicalEntriesPerSuccessfulRun);
  const requiredFromObservedYield = Math.ceil(
    input.entryTarget / (effectiveSuccessRate * effectiveEntriesPerRun),
  );
  const measuredCapacityRuns = Math.floor(
    (input.availableCapacityMinutes * 60_000) / input.measuredP75DurationMs,
  );
  const capacitySupportedNormalRuns = Math.max(6, Math.min(8, measuredCapacityRuns));
  return Math.min(capacitySupportedNormalRuns, Math.max(6, Math.min(8, requiredFromObservedYield)));
}

export interface DegradedPlanAllocation {
  contentRunCount: number;
  entryTarget: number;
}

export interface CatchUpWindow {
  phase: "EARLY" | "MID" | "EVENING";
  expectedProgress: number;
  maximumRuns: number;
  startMinute: number;
  endMinute: number;
}

export function catchUpWindowForLocalMinute(localMinute: number): CatchUpWindow | null {
  if (!Number.isInteger(localMinute) || localMinute < 0 || localMinute >= 24 * 60)
    throw new RangeError("Local dakika 0-1439 aralığında olmalıdır.");
  if (localMinute >= 10 * 60 && localMinute < 14 * 60)
    return {
      phase: "EARLY",
      expectedProgress: 0.15,
      maximumRuns: 2,
      startMinute: 10 * 60,
      endMinute: 14 * 60,
    };
  if (localMinute >= 14 * 60 && localMinute < 20 * 60)
    return {
      phase: "MID",
      expectedProgress: 0.45,
      maximumRuns: 2,
      startMinute: 14 * 60,
      endMinute: 20 * 60,
    };
  if (localMinute >= 20 * 60 && localMinute < 23 * 60 + 30)
    return {
      phase: "EVENING",
      expectedProgress: 1,
      maximumRuns: 3,
      startMinute: 20 * 60,
      endMinute: 23 * 60 + 30,
    };
  return null;
}

const degradedRunCapPerAgent = 6;
const degradedEntryCapPerRun = 4;

export function allocateDegradedPlanCapacity(
  entryTargets: readonly number[],
  runBudget: number,
): DegradedPlanAllocation[] {
  if (
    !Number.isInteger(runBudget) ||
    runBudget < 0 ||
    entryTargets.some((target) => !Number.isInteger(target) || target < 0)
  ) {
    throw new RangeError("Degraded plan kapasitesi negatif olmayan tam sayılardan oluşmalıdır.");
  }
  const requiredRunCounts = entryTargets.map((target) =>
    target === 0 ? 0 : Math.min(degradedRunCapPerAgent, Math.ceil(target / degradedEntryCapPerRun)),
  );
  const allocatedRunCounts = requiredRunCounts.map(() => 0);
  let remaining = runBudget;
  while (remaining > 0) {
    let changed = false;
    for (let index = 0; index < requiredRunCounts.length && remaining > 0; index += 1) {
      if (allocatedRunCounts[index]! >= requiredRunCounts[index]!) continue;
      allocatedRunCounts[index]! += 1;
      remaining -= 1;
      changed = true;
    }
    if (!changed) break;
  }
  return entryTargets.map((entryTarget, index) => {
    const contentRunCount = allocatedRunCounts[index] ?? 0;
    return {
      contentRunCount,
      entryTarget: Math.min(entryTarget, contentRunCount * degradedEntryCapPerRun),
    };
  });
}

const windows = [
  { key: "07:00-10:00", segments: [[7 * 60, 10 * 60]] },
  { key: "10:00-14:00", segments: [[10 * 60, 14 * 60]] },
  { key: "14:00-19:00", segments: [[14 * 60, 19 * 60]] },
  { key: "19:00-23:00", segments: [[19 * 60, 23 * 60]] },
  {
    key: "23:00-07:00",
    segments: [
      [0, 7 * 60],
      [23 * 60, 24 * 60],
    ],
  },
] as const;

function randomGenerator(seed: string): () => number {
  let state = Number.parseInt(createHash("sha256").update(seed).digest("hex").slice(0, 8), 16);
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4_294_967_296;
  };
}

function randomInteger(random: () => number, minimum: number, maximum: number): number {
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}

function localMinuteToInstant(localDate: Date, minute: number): Date {
  const hour = Math.floor(minute / 60);
  const minuteOfHour = minute % 60;
  return new Date(
    Date.UTC(
      localDate.getUTCFullYear(),
      localDate.getUTCMonth(),
      localDate.getUTCDate(),
      hour - 3,
      minuteOfHour,
    ),
  );
}

function instantToLocalMinute(localDate: Date, instant: Date): number {
  return Math.floor((instant.getTime() - localMinuteToInstant(localDate, 0).getTime()) / 60_000);
}

function weightedMinute(random: () => number, weights: Record<string, number>): number {
  const pick = random();
  let cumulative = 0;
  const selected =
    windows.find((window) => {
      cumulative += weights[window.key] ?? 0;
      return pick <= cumulative;
    }) ?? windows[windows.length - 1]!;
  const segmentMinutes = selected.segments.map(([start, end]) => end - start);
  const totalMinutes = segmentMinutes.reduce((sum, value) => sum + value, 0);
  let offset = Math.floor(random() * totalMinutes);
  for (let index = 0; index < selected.segments.length; index += 1) {
    const [start] = selected.segments[index]!;
    const length = segmentMinutes[index]!;
    if (offset < length) return start + offset;
    offset -= length;
  }
  return selected.segments[0]![0];
}

interface ScheduledLoad {
  minute: number;
  desiredEntryMax: number;
}

function respectsPlannedRateLimits(scheduled: ScheduledLoad[], candidate: ScheduledLoad): boolean {
  const combined = [...scheduled, candidate];
  return combined.every((point) => {
    const inWindow = (windowMinutes: number) =>
      combined
        .filter(({ minute }) => minute <= point.minute && minute > point.minute - windowMinutes)
        .reduce((sum, { desiredEntryMax }) => sum + desiredEntryMax, 0);
    return inWindow(60) <= 4 && inWindow(180) <= 9;
  });
}

function scheduleLoads(
  random: () => number,
  desiredEntries: number[],
  weights: Record<string, number>,
  constraints: {
    minimumMinute: number;
    fixedLoads: ScheduledLoad[];
    excludedMinutes: ReadonlySet<number>;
  },
): ScheduledLoad[] {
  const result: ScheduledLoad[] = [];
  for (const desiredEntryMax of desiredEntries) {
    let selected: ScheduledLoad | null = null;
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const candidate = { minute: weightedMinute(random, weights), desiredEntryMax };
      if (
        candidate.minute >= constraints.minimumMinute &&
        !constraints.excludedMinutes.has(candidate.minute) &&
        [...constraints.fixedLoads, ...result].every(
          ({ minute }) => Math.abs(minute - candidate.minute) >= 20,
        ) &&
        respectsPlannedRateLimits([...constraints.fixedLoads, ...result], candidate)
      ) {
        selected = candidate;
        break;
      }
    }
    if (!selected) {
      const firstFallbackMinute = Math.max(7 * 60 + 11, constraints.minimumMinute);
      for (let minute = firstFallbackMinute; minute < 24 * 60; minute += 23) {
        const candidate = { minute, desiredEntryMax };
        if (
          !constraints.excludedMinutes.has(candidate.minute) &&
          [...constraints.fixedLoads, ...result].every(
            (item) => Math.abs(item.minute - minute) >= 20,
          ) &&
          respectsPlannedRateLimits([...constraints.fixedLoads, ...result], candidate)
        ) {
          selected = candidate;
          break;
        }
      }
    }
    if (!selected) throw new Error("Günlük plan rate limit sınırları içinde dağıtılamadı.");
    result.push(selected);
  }
  return result.sort((left, right) => left.minute - right.minute);
}

export function generateDailyPlan(
  profile: DailyPlanProfile,
  input: {
    localDate: Date;
    settingsVersion: number;
    seedNamespace?: string;
    capacityStrategy?: DailyPlanCapacityStrategy;
    scheduleConstraints?: DailyPlanScheduleConstraints;
  },
): GeneratedDailyPlan {
  const minimumMinute = input.scheduleConstraints?.notBefore
    ? Math.max(
        0,
        Math.min(
          24 * 60,
          instantToLocalMinute(input.localDate, input.scheduleConstraints.notBefore) + 1,
        ),
      )
    : 0;
  const fixedLoads = (input.scheduleConstraints?.fixedSlots ?? []).flatMap((slot) => {
    const minute = instantToLocalMinute(input.localDate, slot.scheduledAt);
    return minute >= 0 && minute < 24 * 60
      ? [{ minute, desiredEntryMax: slot.desiredEntryMax }]
      : [];
  });
  const excludedMinutes = new Set(
    (input.scheduleConstraints?.excludedScheduledAt ?? []).flatMap((instant) => {
      const minute = instantToLocalMinute(input.localDate, instant);
      return minute >= 0 && minute < 24 * 60 ? [minute] : [];
    }),
  );
  const randomSeedParts: Array<string | number> = [
    input.seedNamespace ?? "agent-sozluk-daily-plan-v1",
    profile.agentProfileId,
    input.localDate.toISOString().slice(0, 10),
    input.settingsVersion,
  ];
  if (input.capacityStrategy)
    randomSeedParts.push(
      `capacity-${input.capacityStrategy.contentRunCount}-${input.capacityStrategy.entryTarget}`,
    );
  if (input.scheduleConstraints)
    randomSeedParts.push(`remaining-${minimumMinute}-${fixedLoads.length}-${excludedMinutes.size}`);
  const randomSeed = randomSeedParts.join(":");
  const random = randomGenerator(randomSeed);
  const entryTarget =
    input.capacityStrategy?.entryTarget ??
    randomInteger(random, profile.entryMin, profile.entryMax);
  const topicTarget =
    input.capacityStrategy?.topicTarget ??
    randomInteger(random, profile.topicMin, profile.topicMax);
  const voteTarget =
    input.capacityStrategy?.voteTarget ?? randomInteger(random, profile.voteMin, profile.voteMax);
  const requestedRunCount =
    input.capacityStrategy?.contentRunCount ??
    (entryTarget === 0
      ? 0
      : Math.min(entryTarget, Math.max(6, Math.min(8, Math.ceil(entryTarget / 3)))));
  const runCount = entryTarget === 0 ? 0 : Math.min(requestedRunCount, entryTarget);
  const maxDesiredEntry = input.capacityStrategy?.maxDesiredEntry ?? 3;
  if (runCount < 0 || runCount > 8 || entryTarget < 0) {
    throw new RangeError("Günlük hedef seçilen run kapasitesi içinde dağıtılamadı.");
  }
  const attainableEntryTarget = Math.min(entryTarget, runCount * maxDesiredEntry);
  const desired =
    runCount === 0
      ? []
      : Array.from(
          { length: runCount },
          (_, index) =>
            Math.floor(attainableEntryTarget / runCount) +
            (index < attainableEntryTarget % runCount ? 1 : 0),
        );
  const scheduled = scheduleLoads(random, desired, profile.activeTimeWeights, {
    minimumMinute,
    fixedLoads,
    excludedMinutes,
  });
  return {
    randomSeed,
    entryTarget,
    topicTarget,
    voteTarget,
    slots: scheduled.map(({ minute, desiredEntryMax }) => ({
      scheduledAt: localMinuteToInstant(input.localDate, minute),
      desiredEntryMin: Math.max(1, desiredEntryMax - 1),
      desiredEntryMax,
    })),
  };
}
