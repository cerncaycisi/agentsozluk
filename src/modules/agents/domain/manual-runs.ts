export const MANUAL_CATCH_UP_MAX_ENTRIES_PER_RUN = 4;
export const MANUAL_CATCH_UP_MAX_RUNS_PER_AGENT = 25;
export const WRITE_CAPABLE_AGENT_RUN_TYPES = [
  "SCHEDULED_WAKE",
  "NORMAL_WAKE",
  "ENTRY_BURST",
  "DAILY_CATCH_UP",
] as const;

export function isWriteCapableAgentRunType(runType: string): boolean {
  return (WRITE_CAPABLE_AGENT_RUN_TYPES as readonly string[]).includes(runType);
}

export interface ManualCatchUpPlan {
  targetEntries: number;
  activePublishedEntries: number;
  pendingReservedEntries: number;
  remainingEntries: number;
  desiredEntryTargets: number[];
}

function assertNonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0)
    throw new RangeError(`${field} negatif olmayan bir tam sayı olmalıdır.`);
}

/**
 * A manual catch-up is derived from the persisted daily target. The caller must
 * supply authoritative ACTIVE publications and all still-pending reservations.
 * One job can reserve at most four entries, matching the capacity adaptation
 * ceiling used by the automatic scheduler.
 */
export function planManualDailyCatchUp(input: {
  targetEntries: number;
  activePublishedEntries: number;
  pendingReservedEntries: number;
}): ManualCatchUpPlan {
  assertNonNegativeInteger(input.targetEntries, "targetEntries");
  assertNonNegativeInteger(input.activePublishedEntries, "activePublishedEntries");
  assertNonNegativeInteger(input.pendingReservedEntries, "pendingReservedEntries");
  const remainingEntries = Math.max(
    0,
    input.targetEntries - input.activePublishedEntries - input.pendingReservedEntries,
  );
  const runCount = Math.ceil(remainingEntries / MANUAL_CATCH_UP_MAX_ENTRIES_PER_RUN);
  if (runCount > MANUAL_CATCH_UP_MAX_RUNS_PER_AGENT)
    throw new RangeError("Manual DAILY_CATCH_UP güvenli günlük run sınırını aşıyor.");
  const desiredEntryTargets = Array.from({ length: runCount }, (_, index) =>
    Math.min(
      MANUAL_CATCH_UP_MAX_ENTRIES_PER_RUN,
      remainingEntries - index * MANUAL_CATCH_UP_MAX_ENTRIES_PER_RUN,
    ),
  );
  return { ...input, remainingEntries, desiredEntryTargets };
}
