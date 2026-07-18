export const runtimeOperatingModes = ["NORMAL", "MAINTENANCE"] as const;
export type RuntimeOperatingMode = (typeof runtimeOperatingModes)[number];

export const publicRuntimeActionTypes = [
  "CREATE_ENTRY",
  "CREATE_TOPIC_WITH_ENTRY",
  "EDIT_OWN_ENTRY",
  "VOTE_UP",
  "VOTE_DOWN",
  "REMOVE_VOTE",
  "FOLLOW_TOPIC",
  "UNFOLLOW_TOPIC",
  "FOLLOW_USER",
  "UNFOLLOW_USER",
  "BOOKMARK_ENTRY",
  "REMOVE_BOOKMARK",
] as const;

const publicRuntimeActions = new Set<string>(publicRuntimeActionTypes);
const maintenanceRuntimeRunTypes = new Set(["REFLECTION", "SOURCE_REFRESH"]);

function istanbulCalendarDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Catch-up stays frozen for the activation anchor's Istanbul calendar day only. */
export function productionActivationCatchUpFrozen(input: {
  activationStartedAt: Date | null;
  now: Date;
}): boolean {
  return (
    input.activationStartedAt !== null &&
    input.now >= input.activationStartedAt &&
    istanbulCalendarDateKey(input.now) === istanbulCalendarDateKey(input.activationStartedAt)
  );
}

export function isPublicRuntimeAction(actionType: string): boolean {
  return publicRuntimeActions.has(actionType);
}

export function runtimePublicWritesAllowed(input: {
  publicWriteEnabled: boolean;
  runtimeOperatingMode: RuntimeOperatingMode;
}): boolean {
  return input.publicWriteEnabled && input.runtimeOperatingMode === "NORMAL";
}

export function runtimeActionBlockedByPublicWriteControl(
  actionType: string,
  input: { publicWriteEnabled: boolean; runtimeOperatingMode: RuntimeOperatingMode },
): boolean {
  return isPublicRuntimeAction(actionType) && !runtimePublicWritesAllowed(input);
}

export function runtimeRunAllowedInOperatingMode(
  runType: string,
  runtimeOperatingMode: RuntimeOperatingMode,
): boolean {
  return runtimeOperatingMode === "NORMAL" || maintenanceRuntimeRunTypes.has(runType);
}

/**
 * Normal runs retain the conservative two-source ceiling. SOURCE_REFRESH uses
 * the full configured limit. Lower global limits constrain both lanes.
 */
export function sourceFetchTargetLimit(runType: string, configuredLimit: number): number {
  if (!Number.isInteger(configuredLimit) || configuredLimit < 1 || configuredLimit > 50)
    throw new RangeError("sourceFetchLimit 1 ile 50 arasında bir tam sayı olmalıdır.");
  return runType === "SOURCE_REFRESH" ? configuredLimit : Math.min(2, configuredLimit);
}

export interface RuntimeEffectMetrics {
  succeededActions: number;
  committedMemoryEpisodes: number;
  recordedSourceResults: number;
  proposedActions: number;
  rejectedActions: number;
}

export function terminalizeInterruptedRuntimeRun(
  requestedOutcome: "FAILED" | "CANCELLED" | "TIMED_OUT",
  measuredMetrics: RuntimeEffectMetrics,
) {
  const hasPersistedEffects =
    measuredMetrics.succeededActions > 0 ||
    measuredMetrics.committedMemoryEpisodes > 0 ||
    measuredMetrics.recordedSourceResults > 0;
  const outcome =
    ["CANCELLED", "TIMED_OUT"].includes(requestedOutcome) && hasPersistedEffects
      ? ("PARTIAL" as const)
      : requestedOutcome;
  return {
    outcome,
    safeRunSummary:
      outcome === "PARTIAL"
        ? {
            operationSummary:
              "Run deadline, iptal veya lease expiry öncesinde commit edilen action, source veya memory etkilerini koruyarak kısmi tamamlandı.",
            observedItemIds: [],
            proposedActionCount: measuredMetrics.proposedActions,
            completedActionCount: measuredMetrics.succeededActions,
            rejectedActionCount: measuredMetrics.rejectedActions,
            shortRationale:
              "Commit edilen transaction'lar korundu; başlamamış veya başarısız işler uygulanmış sayılmadı.",
          }
        : undefined,
  };
}
