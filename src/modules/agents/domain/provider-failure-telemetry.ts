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
