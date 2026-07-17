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

function scheduleMinutes(
  random: () => number,
  count: number,
  weights: Record<string, number>,
): number[] {
  const result: number[] = [];
  for (let attempt = 0; result.length < count && attempt < 500; attempt += 1) {
    const candidate = weightedMinute(random, weights);
    if (result.every((value) => Math.abs(value - candidate) >= 20)) result.push(candidate);
  }
  if (result.length < count) {
    for (let minute = 7 * 60 + 11; result.length < count && minute < 23 * 60; minute += 73) {
      if (result.every((value) => Math.abs(value - minute) >= 20)) result.push(minute);
    }
  }
  return result.sort((left, right) => left - right).slice(0, count);
}

export function generateDailyPlan(
  profile: DailyPlanProfile,
  input: { localDate: Date; settingsVersion: number; seedNamespace?: string },
): GeneratedDailyPlan {
  const randomSeed = [
    input.seedNamespace ?? "agent-sozluk-daily-plan-v1",
    profile.agentProfileId,
    input.localDate.toISOString().slice(0, 10),
    input.settingsVersion,
  ].join(":");
  const random = randomGenerator(randomSeed);
  const entryTarget = randomInteger(random, profile.entryMin, profile.entryMax);
  const topicTarget = randomInteger(random, profile.topicMin, profile.topicMax);
  const voteTarget = randomInteger(random, profile.voteMin, profile.voteMax);
  const runCount = Math.max(6, Math.min(8, Math.ceil(entryTarget / 3)));
  const desired = Array.from({ length: runCount }, () => 2);
  let remaining = Math.max(0, entryTarget - runCount * 2);
  for (let index = 0; remaining > 0; index = (index + 1) % runCount) {
    if (desired[index]! < 3) {
      desired[index]! += 1;
      remaining -= 1;
    }
  }
  const minutes = scheduleMinutes(random, runCount, profile.activeTimeWeights);
  return {
    randomSeed,
    entryTarget,
    topicTarget,
    voteTarget,
    slots: minutes.map((minute, index) => ({
      scheduledAt: localMinuteToInstant(input.localDate, minute),
      desiredEntryMin: Math.max(1, desired[index]! - 1),
      desiredEntryMax: desired[index]!,
    })),
  };
}
