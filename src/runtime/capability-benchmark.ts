import { randomUUID } from "node:crypto";
import type { RuntimeCapabilityMeasurementInput } from "@/modules/agents/validation/capacity-schemas";
import { runtimeCapabilityMeasurementSchema } from "@/modules/agents/validation/capacity-schemas";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import { renderPersonaPrompt } from "@/modules/agents/personas/prompt-renderer";
import { seedPersonaPackSchema } from "@/modules/agents/personas/schema";
import type { RuntimeContext } from "@/runtime/control-plane-client";
import { parseRuntimeDecisionOutput, runtimeNormalDecisionWireJsonSchema } from "@/runtime/output";
import type { RuntimeProvider, RuntimeProviderResult } from "@/runtime/provider";
import { buildRuntimePrompt } from "@/runtime/worker";
import { RUNTIME_PROMPT_PROFILE_HASH } from "@/runtime/prompt-profile";

const AVAILABLE_CONTENT_MINUTES = 960;
const CAPACITY_RESERVE_FACTOR = 0.75;
const benchmarkPersonas = seedPersonaPackSchema.parse(originalPersonaPack).personas;

export interface CapabilityBenchmarkOptions {
  baseUrl: string;
  timeoutMs?: number;
  plannedContentRuns?: number;
  fetchImplementation?: typeof fetch;
}

interface ProbeResult {
  durationMs: number;
  ok: boolean;
}

interface Scenario {
  name: string;
  runType: string;
  desiredEntryMin: number;
  desiredEntryMax: number;
  includeSources: boolean;
  denseContext: boolean;
  longPersona: boolean;
  duplicateBody?: string;
}

export const CAPACITY_BENCHMARK_SCENARIOS: readonly Scenario[] = [
  {
    name: "short-topic-context",
    runType: "NORMAL_WAKE",
    desiredEntryMin: 1,
    desiredEntryMax: 1,
    includeSources: false,
    denseContext: false,
    longPersona: false,
  },
  {
    name: "dense-topic-context",
    runType: "NORMAL_WAKE",
    desiredEntryMin: 1,
    desiredEntryMax: 2,
    includeSources: false,
    denseContext: true,
    longPersona: false,
  },
  {
    name: "external-source-context",
    runType: "NORMAL_WAKE",
    desiredEntryMin: 1,
    desiredEntryMax: 2,
    includeSources: true,
    denseContext: false,
    longPersona: false,
  },
  {
    name: "two-entry-target",
    runType: "ENTRY_BURST",
    desiredEntryMin: 2,
    desiredEntryMax: 2,
    includeSources: false,
    denseContext: true,
    longPersona: false,
  },
  {
    name: "three-entry-target",
    runType: "ENTRY_BURST",
    desiredEntryMin: 3,
    desiredEntryMax: 3,
    includeSources: true,
    denseContext: true,
    longPersona: false,
  },
  {
    name: "duplicate-retry",
    runType: "NORMAL_WAKE",
    desiredEntryMin: 1,
    desiredEntryMax: 1,
    includeSources: false,
    denseContext: false,
    longPersona: false,
    duplicateBody: "Aynı gövdeyi yeniden yayınlama; farklı kanıt yoksa NO_ACTION seç.",
  },
  {
    name: "read-only",
    runType: "READ_ONLY",
    desiredEntryMin: 0,
    desiredEntryMax: 0,
    includeSources: true,
    denseContext: false,
    longPersona: false,
  },
  {
    name: "normal-wake",
    runType: "NORMAL_WAKE",
    desiredEntryMin: 2,
    desiredEntryMax: 3,
    includeSources: true,
    denseContext: false,
    longPersona: false,
  },
  {
    name: "source-free",
    runType: "NORMAL_WAKE",
    desiredEntryMin: 1,
    desiredEntryMax: 2,
    includeSources: false,
    denseContext: false,
    longPersona: false,
  },
  {
    name: "long-persona-context",
    runType: "NORMAL_WAKE",
    desiredEntryMin: 2,
    desiredEntryMax: 3,
    includeSources: true,
    denseContext: true,
    longPersona: true,
  },
] as const;

function fixedUuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function benchmarkContext(scenario: Scenario, index: number): RuntimeContext {
  const entries = Array.from({ length: scenario.denseContext ? 24 : 3 }, (_, entryIndex) => ({
    id: fixedUuid(1000 + index * 100 + entryIndex),
    topicId: fixedUuid(100 + (entryIndex % 4)),
    body: `Gözlem ${entryIndex + 1}: bakım maliyeti, kullanıcı etkisi ve doğrulanabilir ölçüm ayrıştırılmalı.`,
    score: entryIndex % 5,
    author: { username: `yazar_${entryIndex % 5}` },
  }));
  const firstPersona = benchmarkPersonas[0]!;
  const personaPrompt = renderPersonaPrompt(firstPersona);
  const longPersonaPrompt = scenario.longPersona
    ? benchmarkPersonas
        .slice(0, 3)
        .map((persona) => renderPersonaPrompt(persona))
        .join("\n\n# Karşılaştırmalı yazım sınırları\n")
    : personaPrompt;
  return {
    run: {
      id: randomUUID(),
      runType: scenario.runType,
      trigger: "CAPABILITY_BENCHMARK",
      timeoutSeconds: Math.ceil(benchmarkTimeoutMs() / 1000),
      desiredEntryMin: scenario.desiredEntryMin,
      desiredEntryMax: scenario.desiredEntryMax,
      allowTopicCreation: scenario.runType !== "READ_ONLY",
      allowVoting: scenario.runType !== "READ_ONLY",
      allowFollowing: scenario.runType !== "READ_ONLY",
      allowSourceReading: scenario.includeSources,
      publishEnabled: scenario.runType !== "READ_ONLY",
      publicWriteEnabled: scenario.runType !== "READ_ONLY",
      runtimeOperatingMode: "NORMAL",
      sourceFetchLimit: 8,
      debugRetentionHours: 0,
      saturationOverride: false,
      dailyMaximumOverride: false,
      adminInstruction: null,
      cancelRequested: false,
    },
    agent: {
      username: firstPersona.username,
      displayName: firstPersona.displayName,
      publicBio: firstPersona.publicBio,
    },
    persona: { version: 1, renderedPrompt: longPersonaPrompt },
    perception: {
      observedAt: "2026-07-18T12:00:00.000Z",
      recentEntries: entries,
      sources: scenario.includeSources
        ? [
            {
              id: fixedUuid(9000 + index),
              status: "TRUSTED",
              title: "Ölçümlü sistemlerde kapasite rezervi",
              safeText:
                "UNTRUSTED_CONTENT: kapasite iddiası p75 süre, bellek rezervi ve hata oranıyla birlikte sınanmalıdır.",
            },
          ]
        : [],
      duplicateCandidate: scenario.duplicateBody ?? null,
    },
  };
}

export function capacityBenchmarkRequest(index = 0) {
  const scenario = CAPACITY_BENCHMARK_SCENARIOS[index];
  if (!scenario) throw new Error("Benchmark scenario index geçersiz.");
  const context = benchmarkContext(scenario, index);
  return {
    scenario: scenario.name,
    request: {
      runId: context.run.id,
      prompt: buildRuntimePrompt(context),
      outputSchema: runtimeNormalDecisionWireJsonSchema,
      timeoutMs: benchmarkTimeoutMs(),
    },
  };
}

function benchmarkTimeoutMs(): number {
  return 10 * 60_000;
}

function percentile(values: number[], ratio: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? 1;
}

async function probe(fetchImplementation: typeof fetch, url: string): Promise<ProbeResult> {
  const startedAt = performance.now();
  try {
    const response = await fetchImplementation(url, { signal: AbortSignal.timeout(10_000) });
    await response.arrayBuffer();
    return { durationMs: Math.ceil(performance.now() - startedAt), ok: response.ok };
  } catch {
    return { durationMs: Math.ceil(performance.now() - startedAt), ok: false };
  }
}

async function probeSet(
  fetchImplementation: typeof fetch,
  baseUrl: string,
  count: number,
): Promise<{ health: ProbeResult[]; ready: ProbeResult[] }> {
  const health: ProbeResult[] = [];
  const ready: ProbeResult[] = [];
  for (let index = 0; index < count; index += 1) {
    const [healthResult, readyResult] = await Promise.all([
      probe(fetchImplementation, `${baseUrl}/api/health`),
      probe(fetchImplementation, `${baseUrl}/api/ready`),
    ]);
    health.push(healthResult);
    ready.push(readyResult);
  }
  return { health, ready };
}

async function withRuntimeProbes<T>(
  operation: Promise<T>,
  fetchImplementation: typeof fetch,
  endpoint: string,
): Promise<{ value: T; probes: { health: ProbeResult[]; ready: ProbeResult[] } }> {
  let finished = false;
  let finishPolling!: () => void;
  const finishedSignal = new Promise<void>((resolve) => {
    finishPolling = resolve;
  });
  const probes = { health: [] as ProbeResult[], ready: [] as ProbeResult[] };
  const polling = (async () => {
    while (!finished) {
      const next = await probeSet(fetchImplementation, endpoint, 1);
      probes.health.push(...next.health);
      probes.ready.push(...next.ready);
      if (!finished)
        await Promise.race([
          new Promise<void>((resolve) => setTimeout(resolve, 1000)),
          finishedSignal,
        ]);
    }
  })();
  try {
    return { value: await operation, probes };
  } finally {
    finished = true;
    finishPolling();
    await polling;
  }
}

function latencyImpact(baseline: ProbeResult[], measured: ProbeResult[]) {
  const baselineP95Ms = percentile(
    baseline.map(({ durationMs }) => durationMs),
    0.95,
  );
  const measuredP95Ms = percentile(
    measured.map(({ durationMs }) => durationMs),
    0.95,
  );
  return {
    baselineP95Ms,
    measuredP95Ms,
    stable:
      baseline.every(({ ok }) => ok) &&
      measured.every(({ ok }) => ok) &&
      measuredP95Ms <= Math.max(baselineP95Ms * 2, baselineP95Ms + 250),
  };
}

function candidateMetrics(results: RuntimeProviderResult[]) {
  const decisions = results.flatMap((result) => {
    const parsed = parseRuntimeDecisionOutput(result.output);
    return parsed.success ? [parsed.data] : [];
  });
  const actions = decisions.flatMap(({ actions }) => actions);
  const published = actions.filter(({ actionType }) =>
    ["CREATE_ENTRY", "CREATE_TOPIC_WITH_ENTRY"].includes(actionType),
  );
  const bodies = published.flatMap(({ input }) =>
    typeof input.body === "string" ? [input.body.trim().toLocaleLowerCase("tr-TR")] : [],
  );
  const duplicateCount = bodies.length - new Set(bodies).size;
  return {
    successfulActionCount: actions.length,
    proposedEntryActionCount: published.length,
    duplicateRetryRate: bodies.length === 0 ? 0 : duplicateCount / bodies.length,
    structuredSuccessCount: decisions.length,
  };
}

function aggregateHostMetrics(results: RuntimeProviderResult[]) {
  const metrics = results.flatMap(({ hostMetrics }) => (hostMetrics ? [hostMetrics] : []));
  return {
    singleProcessPeakRssMb: Math.max(
      1,
      ...metrics.map(({ processPeakRssMb }) => Math.ceil(processPeakRssMb)),
    ),
    systemPeakMemoryMb: Math.max(
      1,
      ...metrics.map(({ systemPeakMemoryMb }) => Math.ceil(systemPeakMemoryMb)),
    ),
    availableMemoryMb: Math.max(
      0,
      Math.floor(Math.min(...metrics.map(({ availableMemoryMb }) => availableMemoryMb), 65_536)),
    ),
    swapInMb: Math.min(
      65_536,
      metrics.reduce((sum, item) => sum + item.swapInMb, 0),
    ),
    swapOutMb: Math.min(
      65_536,
      metrics.reduce((sum, item) => sum + item.swapOutMb, 0),
    ),
    loadAverage1m: Math.min(
      1000,
      Math.max(0, ...metrics.map(({ loadAverage1m }) => loadAverage1m)),
    ),
  };
}

function capacityStatus(
  p75DurationMs: number,
  plannedContentRuns: number,
): RuntimeCapabilityMeasurementInput["capacityStatus"] {
  const requiredMinutes = (p75DurationMs * plannedContentRuns) / 60_000;
  if (requiredMinutes > AVAILABLE_CONTENT_MINUTES) return "OVERLOADED";
  if (requiredMinutes > AVAILABLE_CONTENT_MINUTES * CAPACITY_RESERVE_FACTOR) return "AT_RISK";
  return "HEALTHY";
}

function baseUrl(value: string): string {
  const parsed = new URL(value);
  const loopback = ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(loopback && parsed.protocol === "http:")) {
    throw new Error("Benchmark base URL HTTPS veya loopback HTTP olmalıdır.");
  }
  parsed.pathname = parsed.pathname.replace(/\/$/u, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/u, "");
}

export async function runCapacityBenchmark(
  provider: RuntimeProvider,
  options: CapabilityBenchmarkOptions,
): Promise<RuntimeCapabilityMeasurementInput> {
  const endpoint = baseUrl(options.baseUrl);
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const inspected = await provider.inspect();
  if (!inspected.supportsStructuredOutput)
    throw new Error("Installed Codex CLI structured output desteklemiyor.");
  const baseline = await probeSet(fetchImplementation, endpoint, 5);
  const results: RuntimeProviderResult[] = [];
  const measuredHealth: ProbeResult[] = [];
  const measuredReady: ProbeResult[] = [];
  let failureCount = 0;
  const failureReasons = new Map<string, number>();
  for (const [index, scenario] of CAPACITY_BENCHMARK_SCENARIOS.entries()) {
    const context = benchmarkContext(scenario, index);
    try {
      const { value: result, probes } = await withRuntimeProbes(
        provider.invoke({
          runId: context.run.id,
          prompt: buildRuntimePrompt(context),
          outputSchema: runtimeNormalDecisionWireJsonSchema,
          timeoutMs: options.timeoutMs ?? benchmarkTimeoutMs(),
        }),
        fetchImplementation,
        endpoint,
      );
      results.push(result);
      measuredHealth.push(...probes.health);
      measuredReady.push(...probes.ready);
    } catch (error) {
      failureCount += 1;
      const reason = error instanceof Error ? error.message : "CODEX_BENCHMARK_FAILED";
      failureReasons.set(reason, (failureReasons.get(reason) ?? 0) + 1);
    }
  }
  if (results.length === 0)
    throw new Error(
      `Codex CLI benchmark run’larının tamamı başarısız: ${[...failureReasons.entries()]
        .map(([reason, count]) => `${reason} (${count})`)
        .join(", ")}`,
    );
  const durations = results.map(({ durationMs }) => Math.max(1, Math.round(durationMs)));
  const candidate = candidateMetrics(results);
  const host = aggregateHostMetrics(results);
  const appLatencyImpact = latencyImpact(baseline.health, measuredHealth);
  const databaseLatencyImpact = latencyImpact(baseline.ready, measuredReady);
  const p75DurationMs = percentile(durations, 0.75);
  return runtimeCapabilityMeasurementSchema.parse({
    codexVersion: inspected.version,
    promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
    benchmarkRunCount: CAPACITY_BENCHMARK_SCENARIOS.length,
    p50DurationMs: percentile(durations, 0.5),
    p75DurationMs,
    p95DurationMs: percentile(durations, 0.95),
    maxDurationMs: Math.max(...durations),
    successfulActionCount: candidate.successfulActionCount,
    proposedEntryActionCount: candidate.proposedEntryActionCount,
    // This CLI-only harness does not execute actions against the application.
    // Actual published entries must be supplied by the production run orchestrator.
    publishedEntries: 0,
    failureRate:
      (failureCount + results.length - candidate.structuredSuccessCount) /
      CAPACITY_BENCHMARK_SCENARIOS.length,
    duplicateRetryRate: candidate.duplicateRetryRate,
    ...host,
    dualProcessPeakRssMb: null,
    dualRunSuccessCount: 0,
    oomDetected: failureCount > 0,
    swapThrashingDetected: host.swapInMb > 256 || host.swapOutMb > 256,
    healthStable: appLatencyImpact.stable,
    readinessStable: databaseLatencyImpact.stable,
    appLatencyImpact,
    databaseLatencyImpact,
    capacityStatus: capacityStatus(p75DurationMs, options.plannedContentRuns ?? 70),
  });
}

export async function runConcurrencyCapabilityTest(
  provider: RuntimeProvider,
  options: CapabilityBenchmarkOptions,
  baseline: RuntimeCapabilityMeasurementInput,
): Promise<RuntimeCapabilityMeasurementInput> {
  const endpoint = baseUrl(options.baseUrl);
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const inspected = await provider.inspect();
  const baselineProbes = await probeSet(fetchImplementation, endpoint, 5);
  const scenarios = [CAPACITY_BENCHMARK_SCENARIOS[1]!, CAPACITY_BENCHMARK_SCENARIOS[4]!];
  const contexts = scenarios.map((scenario, index) => benchmarkContext(scenario, index + 20));
  const { value: settled, probes: measuredProbes } = await withRuntimeProbes(
    Promise.allSettled(
      contexts.map((context) =>
        provider.invoke({
          runId: context.run.id,
          prompt: buildRuntimePrompt(context),
          outputSchema: runtimeNormalDecisionWireJsonSchema,
          timeoutMs: options.timeoutMs ?? benchmarkTimeoutMs(),
        }),
      ),
    ),
    fetchImplementation,
    endpoint,
  );
  const results = settled.flatMap((item) =>
    item.status === "fulfilled" && parseRuntimeDecisionOutput(item.value.output).success
      ? [item.value]
      : [],
  );
  const host = aggregateHostMetrics(results);
  const appLatencyImpact = latencyImpact(baselineProbes.health, measuredProbes.health);
  const databaseLatencyImpact = latencyImpact(baselineProbes.ready, measuredProbes.ready);
  const dualProcessPeakRssMb = Math.max(
    1,
    Math.ceil(
      results.reduce((sum, result) => sum + (result.hostMetrics?.processPeakRssMb ?? 0), 0),
    ),
  );
  return runtimeCapabilityMeasurementSchema.parse({
    ...baseline,
    codexVersion: inspected.version,
    promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
    dualProcessPeakRssMb,
    systemPeakMemoryMb: host.systemPeakMemoryMb,
    availableMemoryMb: host.availableMemoryMb,
    swapInMb: host.swapInMb,
    swapOutMb: host.swapOutMb,
    loadAverage1m: host.loadAverage1m,
    dualRunSuccessCount: results.length,
    oomDetected: results.length < 2,
    swapThrashingDetected: host.swapInMb > 256 || host.swapOutMb > 256,
    healthStable: appLatencyImpact.stable,
    readinessStable: databaseLatencyImpact.stable,
    appLatencyImpact,
    databaseLatencyImpact,
  });
}
