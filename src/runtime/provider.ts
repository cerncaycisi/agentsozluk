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

export interface RuntimeProviderResult {
  provider: "codex-cli";
  version: string;
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
  inspect(): Promise<{ version: string; supportsStructuredOutput: boolean }>;
  invoke(request: RuntimeProviderRequest): Promise<RuntimeProviderResult>;
}
