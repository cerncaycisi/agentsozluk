import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import type { RuntimeCapabilityMeasurementInput } from "@/modules/agents/validation/capacity-schemas";
import { runtimeCapabilityMeasurementSchema } from "@/modules/agents/validation/capacity-schemas";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import { renderPersonaPrompt } from "@/modules/agents/personas/prompt-renderer";
import { seedPersonaPackSchema } from "@/modules/agents/personas/schema";
import type { RuntimeContext } from "@/runtime/control-plane-client";
import { parseRuntimeDecisionOutput, runtimeNormalDecisionWireJsonSchema } from "@/runtime/output";
import type { RuntimeProvider, RuntimeProviderResult } from "@/runtime/provider";
import {
  buildActionWorthinessPrompt,
  buildRuntimePrompt,
  RUNTIME_STRUCTURED_REPAIR_INSTRUCTION,
} from "@/runtime/worker";
import { RUNTIME_PROMPT_PROFILE_HASH } from "@/runtime/prompt-profile";
import {
  parseRuntimeActionWorthinessVerdict,
  runtimeActionWorthinessVerdictJsonSchema,
} from "@/runtime/action-worthiness";
import {
  type CapabilityBenchmarkScenarioDiagnostic,
  type CapabilityBenchmarkStageDiagnostic,
  safeBenchmarkProviderCode,
  safeBenchmarkZodIssues,
} from "@/runtime/capability-diagnostics";
import type { capacityBenchmarkScenarioNames } from "@/runtime/capability-diagnostics";

const AVAILABLE_CONTENT_MINUTES = 960;
const CAPACITY_RESERVE_FACTOR = 0.75;
const benchmarkPersonas = seedPersonaPackSchema.parse(originalPersonaPack).personas;

export interface CapabilityBenchmarkOptions {
  baseUrl: string;
  timeoutMs?: number;
  plannedContentRuns?: number;
  fetchImplementation?: typeof fetch;
  diagnosticSink?: (diagnostic: CapabilityBenchmarkScenarioDiagnostic) => void;
}

interface ProbeResult {
  durationMs: number;
  ok: boolean;
}

function combineSequentialResults(
  first: RuntimeProviderResult,
  second: RuntimeProviderResult,
): RuntimeProviderResult {
  const firstMetrics = first.hostMetrics;
  const secondMetrics = second.hostMetrics;
  const hostMetrics =
    firstMetrics && secondMetrics
      ? {
          processPeakRssMb: Math.max(firstMetrics.processPeakRssMb, secondMetrics.processPeakRssMb),
          systemPeakMemoryMb: Math.max(
            firstMetrics.systemPeakMemoryMb,
            secondMetrics.systemPeakMemoryMb,
          ),
          availableMemoryMb: Math.min(
            firstMetrics.availableMemoryMb,
            secondMetrics.availableMemoryMb,
          ),
          swapInMb: firstMetrics.swapInMb + secondMetrics.swapInMb,
          swapOutMb: firstMetrics.swapOutMb + secondMetrics.swapOutMb,
          loadAverage1m: Math.max(firstMetrics.loadAverage1m, secondMetrics.loadAverage1m),
        }
      : (secondMetrics ?? firstMetrics);
  return {
    ...second,
    durationMs: first.durationMs + second.durationMs,
    ...(hostMetrics ? { hostMetrics } : {}),
  };
}

export async function invokeWithStructuredRepair(
  provider: RuntimeProvider,
  request: Parameters<RuntimeProvider["invoke"]>[0],
  diagnostics?: ScenarioDiagnosticRecorder,
): Promise<RuntimeProviderResult> {
  let first: RuntimeProviderResult;
  try {
    first = await provider.invoke(request);
  } catch (error) {
    diagnostics?.providerFailure("DECISION_PRIMARY", error);
    throw error;
  }
  const firstParsed = parseRuntimeDecisionOutput(first.output);
  if (firstParsed.success) {
    diagnostics?.pass("DECISION_PRIMARY");
    return first;
  }
  diagnostics?.schemaFailure(
    "DECISION_PRIMARY",
    "CODEX_DECISION_OUTPUT_INVALID",
    firstParsed.error,
  );
  diagnostics?.markRepairAttempted();
  let repaired: RuntimeProviderResult;
  try {
    repaired = await provider.invoke({
      ...request,
      timeoutMs: Math.max(1, request.timeoutMs - first.durationMs),
      prompt: `${request.prompt}\n\n${RUNTIME_STRUCTURED_REPAIR_INSTRUCTION}`,
    });
  } catch (error) {
    diagnostics?.providerFailure("DECISION_REPAIR", error);
    throw error;
  }
  const repairedParsed = parseRuntimeDecisionOutput(repaired.output);
  if (repairedParsed.success) diagnostics?.pass("DECISION_REPAIR");
  else
    diagnostics?.schemaFailure(
      "DECISION_REPAIR",
      "CODEX_DECISION_OUTPUT_INVALID",
      repairedParsed.error,
    );
  return combineSequentialResults(first, repaired);
}

type DiagnosticStage = CapabilityBenchmarkStageDiagnostic["stage"];

interface ScenarioDiagnosticRecorder {
  pass(stage: DiagnosticStage): void;
  providerFailure(stage: DiagnosticStage, error: unknown): void;
  schemaFailure(
    stage: DiagnosticStage,
    safeCode: CapabilityBenchmarkStageDiagnostic["safeCode"],
    error?: ZodError,
  ): void;
  markRepairAttempted(): void;
  finish(finalStatus: CapabilityBenchmarkScenarioDiagnostic["finalStatus"]): void;
}

function scenarioDiagnosticRecorder(
  scenario: Scenario["name"],
  lane: CapabilityBenchmarkScenarioDiagnostic["lane"],
  sink: CapabilityBenchmarkOptions["diagnosticSink"],
): ScenarioDiagnosticRecorder {
  const stages: CapabilityBenchmarkStageDiagnostic[] = [];
  let repairAttempted = false;
  let finished = false;
  return {
    pass(stage) {
      stages.push({ stage, outcome: "PASS", safeCode: "OK", issues: [] });
    },
    providerFailure(stage, error) {
      stages.push({
        stage,
        outcome: "PROVIDER_FAILED",
        safeCode: safeBenchmarkProviderCode(error),
        issues: [],
      });
    },
    schemaFailure(stage, safeCode, error) {
      stages.push({
        stage,
        outcome: "SCHEMA_INVALID",
        safeCode,
        issues: error ? safeBenchmarkZodIssues(error) : [],
      });
    },
    markRepairAttempted() {
      repairAttempted = true;
    },
    finish(finalStatus) {
      if (finished) return;
      finished = true;
      if (stages.length === 0)
        stages.push({
          stage: "DECISION_PRIMARY",
          outcome: "PROVIDER_FAILED",
          safeCode: "BENCHMARK_STAGE_FAILED",
          issues: [],
        });
      sink?.({ scenario, lane, finalStatus, repairAttempted, stages });
    },
  };
}

async function invokeBenchmarkDecision(
  provider: RuntimeProvider,
  context: RuntimeContext,
  timeoutMs: number,
  diagnostics?: ScenarioDiagnosticRecorder,
): Promise<RuntimeProviderResult> {
  const decisionResult = await invokeWithStructuredRepair(
    provider,
    {
      runId: context.run.id,
      prompt: buildRuntimePrompt(context),
      outputSchema: runtimeNormalDecisionWireJsonSchema,
      timeoutMs,
    },
    diagnostics,
  );
  const parsed = parseRuntimeDecisionOutput(decisionResult.output);
  if (!parsed.success) return decisionResult;
  const candidateSequences = parsed.data.actions
    .filter(({ actionType }) => actionType !== "NO_ACTION")
    .map(({ sequence }) => sequence);
  if (candidateSequences.length === 0) return decisionResult;
  let reviewResult: RuntimeProviderResult;
  try {
    reviewResult = await provider.invoke({
      runId: context.run.id,
      prompt: buildActionWorthinessPrompt(context, parsed.data),
      outputSchema: runtimeActionWorthinessVerdictJsonSchema,
      timeoutMs: Math.max(1, timeoutMs - decisionResult.durationMs),
    });
  } catch (error) {
    diagnostics?.providerFailure("ACTION_WORTHINESS", error);
    throw error;
  }
  try {
    parseRuntimeActionWorthinessVerdict(reviewResult.output, candidateSequences);
    diagnostics?.pass("ACTION_WORTHINESS");
  } catch (error) {
    diagnostics?.schemaFailure(
      "ACTION_WORTHINESS",
      error instanceof Error && error.message === "ACTION_WORTHINESS_CANDIDATE_SET_MISMATCH"
        ? "ACTION_WORTHINESS_CANDIDATE_SET_MISMATCH"
        : "CODEX_ACTION_WORTHINESS_OUTPUT_INVALID",
      error instanceof ZodError ? error : undefined,
    );
    throw error;
  }
  return {
    ...combineSequentialResults(decisionResult, reviewResult),
    output: decisionResult.output,
  };
}

interface Scenario {
  name: (typeof capacityBenchmarkScenarioNames)[number];
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
      adminInstruction: null,
      cancelRequested: false,
    },
    agent: {
      username: firstPersona.username,
      displayName: firstPersona.displayName,
      publicBio: firstPersona.publicBio,
    },
    persona: {
      version: 1,
      renderedPrompt: longPersonaPrompt,
      behavior: {
        topicCreationTendency: 0.5,
        votingTendency: 0.5,
        followingTendency: 0.5,
      },
      writing: { entryLength: scenario.longPersona ? "LONG" : "MEDIUM" },
    },
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
    availableMemoryMb:
      metrics.length === 0
        ? 0
        : Math.max(
            0,
            Math.floor(
              Math.min(...metrics.map(({ availableMemoryMb }) => availableMemoryMb), 65_536),
            ),
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
  for (const [index, scenario] of CAPACITY_BENCHMARK_SCENARIOS.entries()) {
    const context = benchmarkContext(scenario, index);
    const diagnostics = scenarioDiagnosticRecorder(scenario.name, null, options.diagnosticSink);
    try {
      const { value: result, probes } = await withRuntimeProbes(
        invokeBenchmarkDecision(
          provider,
          context,
          options.timeoutMs ?? benchmarkTimeoutMs(),
          diagnostics,
        ),
        fetchImplementation,
        endpoint,
      );
      results.push(result);
      measuredHealth.push(...probes.health);
      measuredReady.push(...probes.ready);
      diagnostics.finish(parseRuntimeDecisionOutput(result.output).success ? "PASS" : "FAIL");
    } catch {
      failureCount += 1;
      diagnostics.finish("FAIL");
    }
  }
  if (results.length === 0) throw new Error("CAPABILITY_BENCHMARK_EXHAUSTED");
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
    // No kernel/cgroup OOM signal is collected by this harness. Scenario failures
    // remain explicit in failureRate and the bounded diagnostics sidecar.
    oomDetected: false,
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
      contexts.map(async (context, index) => {
        const scenario = scenarios[index]!;
        const diagnostics = scenarioDiagnosticRecorder(
          scenario.name,
          index === 0 ? 1 : 2,
          options.diagnosticSink,
        );
        try {
          const result = await invokeBenchmarkDecision(
            provider,
            context,
            options.timeoutMs ?? benchmarkTimeoutMs(),
            diagnostics,
          );
          diagnostics.finish(parseRuntimeDecisionOutput(result.output).success ? "PASS" : "FAIL");
          return result;
        } catch (error) {
          diagnostics.finish("FAIL");
          throw error;
        }
      }),
    ),
    fetchImplementation,
    endpoint,
  );
  const results = settled.flatMap((item) =>
    item.status === "fulfilled" && parseRuntimeDecisionOutput(item.value.output).success
      ? [item.value]
      : [],
  );
  if (results.length === 0) throw new Error("CAPABILITY_BENCHMARK_EXHAUSTED");
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
    // Incomplete dual evidence is represented by dualRunSuccessCount. It is not
    // equivalent to a measured kernel/cgroup OOM event.
    oomDetected: false,
    swapThrashingDetected: host.swapInMb > 256 || host.swapOutMb > 256,
    healthStable: appLatencyImpact.stable,
    readinessStable: databaseLatencyImpact.stable,
    appLatencyImpact,
    databaseLatencyImpact,
  });
}
