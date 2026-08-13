export interface RuntimeProviderRequest {
  runId: string;
  prompt: string;
  outputSchema: Record<string, unknown>;
  timeoutMs: number;
  debugRetentionHours?: number;
  signal?: AbortSignal;
}

export class RuntimeProviderTimeoutError extends Error {
  constructor() {
    super("Runtime provider zaman aşımına uğradı.");
    this.name = "RuntimeProviderTimeoutError";
  }
}

export class RuntimeProviderCancelledError extends Error {
  constructor() {
    super("Runtime provider iptal edildi.");
    this.name = "RuntimeProviderCancelledError";
  }
}

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

export class RuntimeProviderExecutionError extends Error {
  constructor(public readonly safeCode: RuntimeProviderExecutionSafeCode) {
    super("Runtime provider güvenli bir hata koduyla tamamlanamadı.");
    this.name = "RuntimeProviderExecutionError";
  }
}

export interface RuntimeProviderResult {
  provider: "codex-cli";
  version: string;
  model?: string;
  reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh" | "max";
  output: unknown;
  durationMs: number;
  hostMetrics?: {
    processPeakRssMb: number;
    systemPeakMemoryMb: number;
    availableMemoryMb: number;
    swapInMb: number;
    swapOutMb: number;
    loadAverage1m: number;
  };
}

export interface RuntimeProvider {
  inspect(): Promise<{
    version: string;
    supportsStructuredOutput: boolean;
    model?: string;
    reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh" | "max";
  }>;
  invoke(request: RuntimeProviderRequest): Promise<RuntimeProviderResult>;
}
