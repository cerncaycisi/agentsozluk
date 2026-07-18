import { AppError } from "@/lib/http/errors";

export const SOURCE_SCORE_WEEKLY_DELTA_BOUND = 0.1;

export const sourceScoreFields = [
  "trustScore",
  "interestScore",
  "noveltyScore",
  "usefulnessScore",
] as const;

export type SourceScoreField = (typeof sourceScoreFields)[number];

export interface SourceScoreChange {
  from: number;
  to: number;
}

export interface SourceScoreBudget {
  usedBefore: number;
  requested: number;
  usedAfter: number;
  bound: number;
}

const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;
const PRECISION = 12;
const BUDGET_EPSILON = 1e-9;

function rounded(value: number): number {
  return Number(value.toFixed(PRECISION));
}

export function istanbulWeekWindow(now: Date): { start: Date; end: Date } {
  const istanbulTime = new Date(now.getTime() + ISTANBUL_OFFSET_MS);
  const localDate = new Date(
    Date.UTC(istanbulTime.getUTCFullYear(), istanbulTime.getUTCMonth(), istanbulTime.getUTCDate()),
  );
  const daysSinceMonday = (localDate.getUTCDay() + 6) % 7;
  const localWeekStart = new Date(localDate.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000);
  const start = new Date(localWeekStart.getTime() - ISTANBUL_OFFSET_MS);
  return { start, end: new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000) };
}

function scoreChangeFromAudit(
  metadata: unknown,
  field: SourceScoreField,
): SourceScoreChange | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const scoreChanges = (metadata as Record<string, unknown>).scoreChanges;
  if (!scoreChanges || typeof scoreChanges !== "object" || Array.isArray(scoreChanges)) return null;
  const change = (scoreChanges as Record<string, unknown>)[field];
  if (!change || typeof change !== "object" || Array.isArray(change)) return null;
  const { from, to } = change as Record<string, unknown>;
  return typeof from === "number" && typeof to === "number" ? { from, to } : null;
}

export function assertSourceScoreWeeklyBudget(input: {
  audits: Array<{ metadata: unknown }>;
  changes: Partial<Record<SourceScoreField, SourceScoreChange>>;
}): Partial<Record<SourceScoreField, SourceScoreBudget>> {
  const budgets: Partial<Record<SourceScoreField, SourceScoreBudget>> = {};
  for (const field of sourceScoreFields) {
    const requestedChange = input.changes[field];
    if (!requestedChange) continue;
    const usedBefore = rounded(
      input.audits.reduce((total, audit) => {
        const change = scoreChangeFromAudit(audit.metadata, field);
        return total + (change ? Math.abs(change.to - change.from) : 0);
      }, 0),
    );
    const requested = rounded(Math.abs(requestedChange.to - requestedChange.from));
    const usedAfter = rounded(usedBefore + requested);
    if (usedAfter > SOURCE_SCORE_WEEKLY_DELTA_BOUND + BUDGET_EPSILON)
      throw new AppError(
        "VALIDATION_ERROR",
        422,
        `${field} için İstanbul haftası toplam değişim bütçesi ±0.10 sınırını aşamaz.`,
        { [field]: ["Haftalık source score değişim bütçesi aşıldı."] },
        undefined,
        { reasonCode: "SOURCE_WEEKLY_DELTA_BUDGET_EXCEEDED" },
      );
    budgets[field] = {
      usedBefore,
      requested,
      usedAfter,
      bound: SOURCE_SCORE_WEEKLY_DELTA_BOUND,
    };
  }
  return budgets;
}
