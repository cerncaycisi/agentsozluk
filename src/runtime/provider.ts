import type { RuntimeProviderExecutionSafeCode } from "@/modules/agents/domain/provider-failure-telemetry";
export {
  runtimeProviderExecutionSafeCodes,
  type RuntimeProviderExecutionSafeCode,
} from "@/modules/agents/domain/provider-failure-telemetry";

export interface RuntimeProviderHostMetrics {
  processPeakRssMb: number;
  systemPeakMemoryMb: number;
  availableMemoryMb: number;
  swapInMb: number;
  swapOutMb: number;
  loadAverage1m: number;
}

export interface RuntimeProviderRequest {
  runId: string;
  prompt: string;
  outputSchema: Record<string, unknown>;
  timeoutMs: number;
  debugRetentionHours?: number;
  signal?: AbortSignal;
}

/**
 * Bir çağrının süresi TEK bir sayı değil.
 *
 * Ölçülen aralık modelin düşünme süresi sanılıyordu; değil. İçinde her çağrıda
 * yeniden koşan üç sandbox'lı CLI denetimi (`--version`, `--help`,
 * `exec --help`), süreç kurulumu ve temizlik de var. 3 Eylül 2026'daki teşhis
 * turu tam bu yüzden yanlış yere baktı: "DECISION 352 sn" saf model süresi
 * sanıldı.
 *
 * Ayrıştırma davranışı değiştirmiyor, yalnız neyin ne kadar sürdüğünü
 * söylüyor.
 */
/**
 * Codex `exec --json` olay akışındaki `turn.completed.usage` sayıları. Yalnız sayılar
 * taşınır; olay akışındaki model içeriği okunmaz, saklanmaz.
 */
export interface RuntimeProviderTokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** CLI bildirmediyse yoktur; sıfır sayılmaz. */
  cachedInputTokens?: number;
  /** CLI bildirmediyse yoktur; sıfır sayılmaz. */
  reasoningOutputTokens?: number;
}

export interface RuntimeProviderAttemptDiagnostics {
  /** Çağrı başlangıcından süreç doğana kadar (dizin, şema, CLI denetimi). */
  setupMs: number;
  /** Yalnız üç CLI denetimi. */
  inspectMs: number;
  /** Süreç doğduktan çıktı toplanana kadar — modelin gerçek payı. */
  modelMs: number;
  hostMetrics?: RuntimeProviderHostMetrics;
  /** CLI `--json` destekliyorsa ve tur tamamlandıysa; eksik değer sıfır sayılmaz. */
  tokenUsage?: RuntimeProviderTokenUsage;
}

/*
  Tanılama hata nesnesine SERİLEŞMEYEN bir alan olarak takılıyor.

  Sebebi bir testin yakaladığı gerçek bir kural: hata nesnesi kaydedilirken
  `JSON.stringify` ediliyor ve süreç sonlandırma ayrıntıları oraya sızmamalı
  (`codex-provider.test.ts`, "keeps process termination details inside the
  provider"). Tanılama yalnız sayı taşıyor, yani bir sır sızdırmıyor; ama
  kuralın kendisi doğru ve gevşetilmemeli. `enumerable: false` ile worker
  alanı okuyabiliyor, serileştirme göremiyor.
*/
function attachDiagnostics(
  error: Error,
  diagnostics: RuntimeProviderAttemptDiagnostics | undefined,
): void {
  Object.defineProperty(error, "diagnostics", {
    value: diagnostics,
    enumerable: false,
    writable: false,
    configurable: false,
  });
}

export class RuntimeProviderTimeoutError extends Error {
  readonly diagnostics?: RuntimeProviderAttemptDiagnostics;
  constructor(diagnostics?: RuntimeProviderAttemptDiagnostics) {
    super("Runtime provider zaman aşımına uğradı.");
    this.name = "RuntimeProviderTimeoutError";
    attachDiagnostics(this, diagnostics);
  }
}

export class RuntimeProviderCancelledError extends Error {
  readonly diagnostics?: RuntimeProviderAttemptDiagnostics;
  constructor(diagnostics?: RuntimeProviderAttemptDiagnostics) {
    super("Runtime provider iptal edildi.");
    this.name = "RuntimeProviderCancelledError";
    attachDiagnostics(this, diagnostics);
  }
}

export class RuntimeProviderExecutionError extends Error {
  readonly diagnostics?: RuntimeProviderAttemptDiagnostics;
  constructor(
    public readonly safeCode: RuntimeProviderExecutionSafeCode,
    diagnostics?: RuntimeProviderAttemptDiagnostics,
  ) {
    super("Runtime provider güvenli bir hata koduyla tamamlanamadı.");
    this.name = "RuntimeProviderExecutionError";
    attachDiagnostics(this, diagnostics);
  }
}

export interface RuntimeProviderResult {
  provider: "codex-cli";
  version: string;
  model?: string;
  reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh" | "max";
  output: unknown;
  durationMs: number;
  hostMetrics?: RuntimeProviderHostMetrics;
  diagnostics?: RuntimeProviderAttemptDiagnostics;
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
