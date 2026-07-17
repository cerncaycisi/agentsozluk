export interface RuntimeProviderRequest {
  runId: string;
  prompt: string;
  outputSchema: Record<string, unknown>;
  timeoutMs: number;
}

export interface RuntimeProviderResult {
  provider: "codex-cli";
  version: string;
  output: unknown;
  durationMs: number;
}

export interface RuntimeProvider {
  inspect(): Promise<{ version: string; supportsStructuredOutput: boolean }>;
  invoke(request: RuntimeProviderRequest): Promise<RuntimeProviderResult>;
}
