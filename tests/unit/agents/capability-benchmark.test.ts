import { describe, expect, it, vi } from "vitest";
import type { RuntimeCapabilityMeasurementInput } from "@/modules/agents";
import {
  CAPACITY_BENCHMARK_SCENARIOS,
  runCapacityBenchmark,
  runConcurrencyCapabilityTest,
} from "@/runtime/capability-benchmark";
import type { RuntimeProvider, RuntimeProviderResult } from "@/runtime/provider";

function output() {
  return {
    safeSummary: "Temsilî context güvenli biçimde değerlendirildi.",
    state: { curiosity: 0.5, confidence: 0.5, topicFatigue: { items: [] } },
    observations: [],
    decisionJournal: [
      {
        seq: 1,
        kind: "STATE_PROPOSAL",
        subject: "benchmark-scenario",
        summary: "Temsilî benchmark context'i public action gerektirmiyor.",
        confidence: 0.8,
        evidenceIds: [],
        causedBySeqs: [],
      },
    ],
    actions: [
      {
        type: "NO_ACTION",
        desire: 0,
        expectedOutcome: "Benchmark dış dünyada bir state değişikliği oluşturmayacak.",
        selectedOptionSeq: null,
        safeReason: "Benchmark senaryosu public action gerektirmiyor.",
        claimProvenance: [],
      },
    ],
    beliefDeltas: [],
    relationshipDeltas: [],
    sourceProposals: [],
    memoryCandidates: [],
  };
}

function result(durationMs: number): RuntimeProviderResult {
  return {
    provider: "codex-cli",
    version: "codex-cli 1.2.3",
    durationMs,
    output: output(),
    hostMetrics: {
      processPeakRssMb: 100,
      systemPeakMemoryMb: 2048,
      availableMemoryMb: 1600,
      swapInMb: 0,
      swapOutMb: 0,
      loadAverage1m: 0.5,
    },
  };
}

const healthyFetch = vi.fn<typeof fetch>().mockImplementation(async () =>
  Promise.resolve(
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ),
);

describe("Codex capability benchmark harness", () => {
  it("covers the ten required representative scenarios and returns measured p75 capacity", async () => {
    let invocation = 0;
    const provider: RuntimeProvider = {
      inspect: vi
        .fn()
        .mockResolvedValue({ version: "codex-cli 1.2.3", supportsStructuredOutput: true }),
      invoke: vi.fn().mockImplementation(async () => result((invocation += 1) * 1000)),
    };
    const measurement = await runCapacityBenchmark(provider, {
      baseUrl: "http://127.0.0.1:3000",
      fetchImplementation: healthyFetch,
      plannedContentRuns: 70,
    });
    expect(CAPACITY_BENCHMARK_SCENARIOS.map(({ name }) => name)).toEqual([
      "short-topic-context",
      "dense-topic-context",
      "external-source-context",
      "two-entry-target",
      "three-entry-target",
      "duplicate-retry",
      "read-only",
      "normal-wake",
      "source-free",
      "long-persona-context",
    ]);
    expect(provider.invoke).toHaveBeenCalledTimes(10);
    expect(measurement).toMatchObject({
      benchmarkRunCount: 10,
      p50DurationMs: 5000,
      p75DurationMs: 8000,
      p95DurationMs: 10_000,
      maxDurationMs: 10_000,
      successfulActionCount: 10,
      proposedEntryActionCount: 0,
      publishedEntries: 0,
      failureRate: 0,
      capacityStatus: "HEALTHY",
      singleProcessPeakRssMb: 100,
      healthStable: true,
      readinessStable: true,
    });
  });

  it("runs exactly two representative calls in parallel and merges them with the baseline", async () => {
    let active = 0;
    let peakActive = 0;
    const provider: RuntimeProvider = {
      inspect: vi
        .fn()
        .mockResolvedValue({ version: "codex-cli 1.2.3", supportsStructuredOutput: true }),
      invoke: vi.fn().mockImplementation(async () => {
        active += 1;
        peakActive = Math.max(peakActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return result(5000);
      }),
    };
    const baseline: RuntimeCapabilityMeasurementInput = {
      codexVersion: "codex-cli 1.2.3",
      promptProfileHash: "a".repeat(64),
      benchmarkRunCount: 10,
      p50DurationMs: 5000,
      p75DurationMs: 8000,
      p95DurationMs: 10_000,
      maxDurationMs: 10_000,
      successfulActionCount: 10,
      proposedEntryActionCount: 0,
      publishedEntries: 0,
      failureRate: 0,
      duplicateRetryRate: 0,
      singleProcessPeakRssMb: 100,
      dualProcessPeakRssMb: null,
      systemPeakMemoryMb: 2048,
      availableMemoryMb: 1600,
      swapInMb: 0,
      swapOutMb: 0,
      loadAverage1m: 0.5,
      dualRunSuccessCount: 0,
      oomDetected: false,
      swapThrashingDetected: false,
      healthStable: true,
      readinessStable: true,
      appLatencyImpact: { baselineP95Ms: 10, measuredP95Ms: 10, stable: true },
      databaseLatencyImpact: { baselineP95Ms: 10, measuredP95Ms: 10, stable: true },
      capacityStatus: "HEALTHY",
    };
    const measurement = await runConcurrencyCapabilityTest(
      provider,
      { baseUrl: "http://127.0.0.1:3000", fetchImplementation: healthyFetch },
      baseline,
    );
    expect(peakActive).toBe(2);
    expect(provider.invoke).toHaveBeenCalledTimes(2);
    expect(measurement).toMatchObject({
      benchmarkRunCount: 10,
      dualRunSuccessCount: 2,
      dualProcessPeakRssMb: 200,
      availableMemoryMb: 1600,
      oomDetected: false,
      healthStable: true,
      readinessStable: true,
    });
  });

  it("uses one bounded semantic repair and includes both calls in measured duration", async () => {
    let invocation = 0;
    const invalidOutput = () => ({
      ...output(),
      decisionJournal: output().decisionJournal.map((item) => ({
        ...item,
        subject: "00000000-0000-4000-8000-000000000100",
      })),
      actions: [
        {
          type: "CREATE_ENTRY",
          targetId: "00000000-0000-4000-8000-000000000100",
          body: "Geçerli görünen fakat journal bağı olmayan aday.",
          desire: 0.8,
          expectedOutcome: "Bir entry adayı oluşacak.",
          selectedOptionSeq: null,
          safeReason: "Semantik repair testi.",
          claimProvenance: [],
        },
      ],
    });
    const provider: RuntimeProvider = {
      inspect: vi
        .fn()
        .mockResolvedValue({ version: "codex-cli 1.2.3", supportsStructuredOutput: true }),
      invoke: vi.fn().mockImplementation(async () => {
        invocation += 1;
        return { ...result(1000), output: invocation % 2 === 1 ? invalidOutput() : output() };
      }),
    };

    const measurement = await runCapacityBenchmark(provider, {
      baseUrl: "http://127.0.0.1:3000",
      fetchImplementation: healthyFetch,
      plannedContentRuns: 70,
    });

    expect(provider.invoke).toHaveBeenCalledTimes(20);
    expect(vi.mocked(provider.invoke).mock.calls[1]?.[0].prompt).toContain(
      "claimProvenance içindeki bütün kanıt grupları tek ve aynı provenance türünü kullansın",
    );
    expect(vi.mocked(provider.invoke).mock.calls[1]?.[0].prompt).toContain(
      "UUID, digest/hash, URL, e-posta, credential, secret veya token değerini subject içine kopyalama",
    );
    expect(measurement).toMatchObject({
      benchmarkRunCount: 10,
      p50DurationMs: 2000,
      p75DurationMs: 2000,
      p95DurationMs: 2000,
      maxDurationMs: 2000,
      failureRate: 0,
      healthStable: true,
      readinessStable: true,
    });
  });
});
