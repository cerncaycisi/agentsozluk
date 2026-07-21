import { createHash } from "node:crypto";

export const STOCHASTIC_TICK_IDEMPOTENCY_MS = 60_000;
export const MINIMUM_STOCHASTIC_TICK_DELAY_MS = 3 * 60_000;
export const MAXIMUM_STOCHASTIC_TICK_DELAY_MS = 10 * 60_000;
export const MINIMUM_STOCHASTIC_AGENT_GAP_MS = 10 * 60_000;

const activeWindows = [
  { key: "07:00-10:00", startHour: 7, endHour: 10, durationHours: 3 },
  { key: "10:00-14:00", startHour: 10, endHour: 14, durationHours: 4 },
  { key: "14:00-19:00", startHour: 14, endHour: 19, durationHours: 5 },
  { key: "19:00-23:00", startHour: 19, endHour: 23, durationHours: 4 },
  { key: "23:00-07:00", startHour: 23, endHour: 7, durationHours: 8 },
] as const;

export type StochasticActiveTimeProfile = Record<(typeof activeWindows)[number]["key"], number>;

export interface StochasticWakeCandidate {
  id: string;
  activeTimeProfile: StochasticActiveTimeProfile;
  lastRunAt: Date | null;
}

function istanbulHour(now: Date): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(now)
    .find(({ type }) => type === "hour")?.value;
  if (hour === undefined) throw new Error("İstanbul saati çözümlenemedi.");
  return Number(hour);
}

function currentWindow(now: Date) {
  const hour = istanbulHour(now);
  const window = activeWindows.find(({ startHour, endHour }) =>
    startHour < endHour ? hour >= startHour && hour < endHour : hour >= startHour || hour < endHour,
  );
  if (!window) throw new Error("İstanbul aktif zaman penceresi çözümlenemedi.");
  return window;
}

function windowDensity(profile: StochasticActiveTimeProfile, now: Date): number {
  const window = currentWindow(now);
  return profile[window.key] / window.durationHours;
}

function seededUnitInterval(seed: string): number {
  const digest = createHash("sha256").update(seed).digest("hex").slice(0, 13);
  return (Number.parseInt(digest, 16) + 1) / (0x1_0000_0000_0000_00 + 1);
}

export function stochasticTickKey(now: Date, intervalMs = STOCHASTIC_TICK_IDEMPOTENCY_MS): string {
  if (!Number.isInteger(intervalMs) || intervalMs < 60_000 || intervalMs > 30 * 60_000)
    throw new RangeError("Stochastic tick aralığı 1-30 dakika olmalıdır.");
  return new Date(Math.floor(now.getTime() / intervalMs) * intervalMs).toISOString();
}

export function stochasticDispatchProbability(
  profile: StochasticActiveTimeProfile,
  now: Date,
): number {
  const peakDensity = Math.max(
    ...activeWindows.map(({ key, durationHours }) => profile[key] / durationHours),
  );
  if (peakDensity <= 0) return 0;
  return Math.min(1, windowDensity(profile, now) / peakDensity);
}

export function stochasticTickShouldDispatch(input: {
  tickKey: string;
  probability: number;
  seed: string;
}): boolean {
  if (!Number.isFinite(input.probability) || input.probability < 0 || input.probability > 1)
    throw new RangeError("Tick olasılığı 0-1 aralığında olmalıdır.");
  return seededUnitInterval(`${input.seed}:${input.tickKey}`) <= input.probability;
}

export function selectStochasticWakeCandidates<Candidate extends StochasticWakeCandidate>(input: {
  candidates: Candidate[];
  count: number;
  now: Date;
  seed: string;
  minimumGapMs?: number;
}): Candidate[] {
  if (!Number.isInteger(input.count) || input.count < 0)
    throw new RangeError("Seçilecek agent sayısı negatif olamaz.");
  const minimumGapMs = input.minimumGapMs ?? MINIMUM_STOCHASTIC_AGENT_GAP_MS;
  const eligible = input.candidates.filter(
    ({ lastRunAt }) => !lastRunAt || input.now.getTime() - lastRunAt.getTime() >= minimumGapMs,
  );
  return eligible
    .map((candidate) => {
      const density = windowDensity(candidate.activeTimeProfile, input.now);
      const minutesSinceLast = candidate.lastRunAt
        ? Math.max(0, input.now.getTime() - candidate.lastRunAt.getTime()) / 60_000
        : 240;
      const fairnessBoost = Math.min(4, Math.max(0.5, minutesSinceLast / 30));
      const weight = density * fairnessBoost;
      const unit = Math.max(Number.EPSILON, seededUnitInterval(`${input.seed}:${candidate.id}`));
      return { candidate, rank: weight > 0 ? -Math.log(unit) / weight : Number.POSITIVE_INFINITY };
    })
    .filter(({ rank }) => Number.isFinite(rank))
    .sort(
      (left, right) =>
        left.rank - right.rank || left.candidate.id.localeCompare(right.candidate.id),
    )
    .slice(0, input.count)
    .map(({ candidate }) => candidate);
}
