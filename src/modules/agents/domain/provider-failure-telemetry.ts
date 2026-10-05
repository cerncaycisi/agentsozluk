/** Yalnız sağlayıcının kapalı, içeriksiz hata sözlüğü; ham hata metni değildir. */
export const runtimeProviderExecutionSafeCodes = [
  "CODEX_ARGUMENT_UNSUPPORTED",
  "CODEX_AUTH_REQUIRED",
  "CODEX_SCHEMA_MISSING_REQUIRED",
  "CODEX_SCHEMA_ADDITIONAL_PROPERTIES",
  "CODEX_SCHEMA_FORMAT_UNSUPPORTED",
  "CODEX_SCHEMA_UNSUPPORTED",
  "CODEX_RATE_LIMITED",
  "CODEX_UPSTREAM_UNAVAILABLE",
  "CODEX_PROCESS_SIGNALLED",
  "CODEX_EXEC_FAILED_NO_STDERR",
  "CODEX_EXEC_FAILED",
  "CODEX_OUTPUT_INVALID",
] as const;

export type RuntimeProviderExecutionSafeCode = (typeof runtimeProviderExecutionSafeCodes)[number];

export function isRuntimeProviderExecutionSafeCode(
  value: unknown,
): value is RuntimeProviderExecutionSafeCode {
  return (
    typeof value === "string" &&
    runtimeProviderExecutionSafeCodes.some((safeCode) => safeCode === value)
  );
}

/**
 * Gezinme kolu öncesi ölçümde koşu başına 3-4 Codex çağrısı, medyan 101 sn
 * (ölçüm: 1 Eylül 2026, üretim, 7 gün, n=8323 aralık). Faz etiketi olmadan
 * 440 sn'lik karar süresinin hangi fazdan geldiği ölçülemiyordu; hangi fazın
 * pahalı olduğu bilinmeden hiçbir iyileştirme hedeflenemez.
 */
export const runtimeCodexPhases = [
  "BROWSE",
  "DECISION",
  "DECISION_REPAIR",
  "ACTION_WORTHINESS",
  "CONTENT_REPAIR",
] as const;
export type RuntimeCodexPhase = (typeof runtimeCodexPhases)[number];

/** Worker ve raporun ortak terminal sağlayıcı aşamaları. */
export const runtimeProviderFailureStages = {
  decisionProvider: { errorCode: "CODEX_DECISION_FAILED", phase: "DECISION" },
  decisionRepairProvider: { errorCode: "CODEX_DECISION_REPAIR_FAILED", phase: "DECISION_REPAIR" },
  actionWorthinessProvider: {
    errorCode: "CODEX_ACTION_WORTHINESS_FAILED",
    phase: "ACTION_WORTHINESS",
  },
} as const satisfies Record<string, { errorCode: string; phase: RuntimeCodexPhase }>;

export function isRuntimeCodexPhase(value: unknown): value is RuntimeCodexPhase {
  return typeof value === "string" && runtimeCodexPhases.some((phase) => phase === value);
}
