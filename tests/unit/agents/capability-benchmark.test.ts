import { describe, expect, it, vi } from "vitest";
import type { RuntimeCapabilityMeasurementInput } from "@/modules/agents";
import {
  CAPACITY_BENCHMARK_SCENARIOS,
  capacityBenchmarkRequest,
  runCapacityBenchmark,
  runConcurrencyCapabilityTest,
} from "@/runtime/capability-benchmark";
import { createCapabilityBenchmarkDiagnosticCollector } from "@/runtime/capability-diagnostics";
import {
  type RuntimeProvider,
  RuntimeProviderExecutionError,
  type RuntimeProviderResult,
} from "@/runtime/provider";

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

function candidateOutput() {
  return {
    ...output(),
    decisionJournal: [
      {
        seq: 1,
        kind: "OPTION_SELECTED",
        subject: "gitar",
        summary: "Bağımsız bir entry adayı ilk aşamada seçildi.",
        confidence: 0.7,
        evidenceIds: [],
        causedBySeqs: [],
      },
    ],
    actions: [
      {
        type: "CREATE_ENTRY",
        targetId: "00000000-0000-4000-8000-000000000100",
        body: "Gitar, tel titreşimini gövdede büyüten bir çalgıdır.",
        desire: 0.7,
        expectedOutcome: "Başlığa bağımsız bir tanım eklenir.",
        selectedOptionSeq: 1,
        safeReason: "Kavrama yeni bir tanım eklenebilir.",
        claimProvenance: [],
      },
    ],
  };
}

function worthinessOutput() {
  return {
    verdict: "ACT",
    confidence: 0.8,
    evaluations: [
      { sequence: 1, decision: "ACCEPT", safeReason: "Aday bağımsız sözlük değeri taşıyor." },
    ],
    selectedSequences: [1],
    safeReason: "Entry adayı uygulanmaya değer.",
  };
}

function invalidDecisionOutput(rawSecret = "RAW_MODEL_VALUE_MUST_NOT_LEAK") {
  return {
    ...output(),
    state: { ...output().state, curiosity: rawSecret },
  };
}

function baselineMeasurement(): RuntimeCapabilityMeasurementInput {
  return {
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

  it("projects representative benchmark context with production-shaped topics and source items", () => {
    const decodeContext = (index: number) => {
      const prompt = capacityBenchmarkRequest(index).request.prompt;
      const opening = "<UNTRUSTED_CONTENT>\n";
      const closing = "\n</UNTRUSTED_CONTENT>";
      const start = prompt.indexOf(opening);
      const end = prompt.indexOf(closing, start + opening.length);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);
      return JSON.parse(prompt.slice(start + opening.length, end)) as {
        perception: {
          previousFastState: { topicFatigue: Record<string, number> };
          recentEntries: Array<Record<string, unknown>>;
          sourceItems: Array<Record<string, unknown>>;
          evidenceCatalog: Record<string, string[]>;
        };
      };
    };

    const dense = decodeContext(1);
    const entry = dense.perception.recentEntries[0]!;
    expect(entry).not.toHaveProperty("topicId");
    expect(entry).toMatchObject({
      createdAt: "2026-07-18T11:00:00.000Z",
      topic: { id: expect.any(String), title: expect.any(String) },
      author: {
        id: expect.any(String),
        username: expect.any(String),
        displayName: expect.any(String),
      },
      followedTopic: false,
      followedAuthor: false,
      topicOpenedByCurrentWriter: false,
      saturated: false,
    });
    const topicId = (entry.topic as { id: string }).id;
    expect(dense.perception.evidenceCatalog.PLATFORM_EVENT).toContain(topicId);
    expect(dense.perception.evidenceCatalog.USER_ENTRY).toContain(entry.id);
    expect(dense.perception.previousFastState.topicFatigue).toEqual({ "bakım maliyeti": 0.2 });

    const sourced = decodeContext(2);
    const sourceItem = sourced.perception.sourceItems[0]!;
    expect(sourceItem).toMatchObject({
      sourceId: expect.any(String),
      sourceDomain: "benchmark.example",
      sourceStatus: "TRUSTED",
      sourceTrustScore: 0.9,
      itemId: expect.any(String),
      canonicalUrl: "https://benchmark.example/items/3",
      title: expect.any(String),
      safeText: expect.any(String),
      summary: expect.any(String),
      publishedAt: "2026-07-18T10:00:00.000Z",
      fetchedAt: "2026-07-18T11:30:00.000Z",
    });
    expect(sourced.perception.evidenceCatalog.TRUSTED_SOURCE).toContain(sourceItem.itemId);
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
    const baseline = baselineMeasurement();
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

  it("measures the final action-worthiness call as part of every actionable scenario", async () => {
    const provider: RuntimeProvider = {
      inspect: vi
        .fn()
        .mockResolvedValue({ version: "codex-cli 1.2.3", supportsStructuredOutput: true }),
      invoke: vi.fn().mockImplementation(async ({ prompt }) => ({
        ...result(prompt.includes("# Final action-worthiness decision") ? 500 : 1000),
        output: prompt.includes("# Final action-worthiness decision")
          ? worthinessOutput()
          : candidateOutput(),
      })),
    };

    const measurement = await runCapacityBenchmark(provider, {
      baseUrl: "http://127.0.0.1:3000",
      fetchImplementation: healthyFetch,
      plannedContentRuns: 70,
    });

    expect(provider.invoke).toHaveBeenCalledTimes(20);
    expect(
      vi
        .mocked(provider.invoke)
        .mock.calls.filter(([request]) =>
          request.prompt.includes("# Final action-worthiness decision"),
        ),
    ).toHaveLength(10);
    expect(measurement).toMatchObject({
      p50DurationMs: 1500,
      p75DurationMs: 1500,
      p95DurationMs: 1500,
      maxDurationMs: 1500,
      successfulActionCount: 10,
      proposedEntryActionCount: 10,
      failureRate: 0,
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

  it("repairs an unsafe topic-fatigue identifier with the bounded human-topic contract", async () => {
    const unsafeTopicKey = "00000000-0000-4000-8000-000000000099";
    const diagnostics = createCapabilityBenchmarkDiagnosticCollector("capacity");
    let invocation = 0;
    const provider: RuntimeProvider = {
      inspect: vi
        .fn()
        .mockResolvedValue({ version: "codex-cli 1.2.3", supportsStructuredOutput: true }),
      invoke: vi.fn().mockImplementation(async () => {
        invocation += 1;
        return {
          ...result(1000),
          output:
            invocation % 2 === 1
              ? {
                  ...output(),
                  state: {
                    ...output().state,
                    topicFatigue: { items: [{ topicKey: unsafeTopicKey, fatigue: 0.5 }] },
                  },
                }
              : output(),
        };
      }),
    };

    const measurement = await runCapacityBenchmark(provider, {
      baseUrl: "http://127.0.0.1:3000",
      fetchImplementation: healthyFetch,
      diagnosticSink: diagnostics.record,
    });
    const document = diagnostics.document("BENCHMARK_COMPLETED");

    expect(measurement.failureRate).toBe(0);
    expect(provider.invoke).toHaveBeenCalledTimes(20);
    expect(document.scenarios).toHaveLength(10);
    expect(document.scenarios[0]).toMatchObject({
      finalStatus: "PASS",
      repairAttempted: true,
      stages: [
        {
          stage: "DECISION_PRIMARY",
          outcome: "SCHEMA_INVALID",
          safeCode: "CODEX_DECISION_OUTPUT_INVALID",
          issues: [
            {
              code: "CUSTOM",
              path: "$.state.topicFatigue.items[0].topicKey",
            },
          ],
        },
        { stage: "DECISION_REPAIR", outcome: "PASS", safeCode: "OK", issues: [] },
      ],
    });
    expect(JSON.stringify(document)).not.toContain(unsafeTopicKey);
    expect(vi.mocked(provider.invoke).mock.calls[1]?.[0].prompt).toContain(
      "topicKey değerleri benzersiz, 1-100 karakterlik kısa, insan-okur gerçek topic etiketi",
    );
    expect(vi.mocked(provider.invoke).mock.calls[1]?.[0].prompt).toContain(
      "güvenli bir konu etiketi yoksa items=[] üret",
    );
  });

  it("records bounded schema paths when decision repair remains invalid", async () => {
    const rawSecret = "RAW_MODEL_VALUE_MUST_NOT_LEAK";
    const diagnostics = createCapabilityBenchmarkDiagnosticCollector("capacity");
    const provider: RuntimeProvider = {
      inspect: vi
        .fn()
        .mockResolvedValue({ version: "codex-cli 1.2.3", supportsStructuredOutput: true }),
      invoke: vi
        .fn()
        .mockResolvedValue({ ...result(1000), output: invalidDecisionOutput(rawSecret) }),
    };

    const measurement = await runCapacityBenchmark(provider, {
      baseUrl: "http://127.0.0.1:3000",
      fetchImplementation: healthyFetch,
      diagnosticSink: diagnostics.record,
    });
    const document = diagnostics.document("BENCHMARK_COMPLETED");

    expect(measurement).toMatchObject({ failureRate: 1, oomDetected: false });
    expect(provider.invoke).toHaveBeenCalledTimes(20);
    expect(document.scenarios).toHaveLength(10);
    expect(document.scenarios[0]).toMatchObject({
      scenario: "short-topic-context",
      lane: null,
      finalStatus: "FAIL",
      repairAttempted: true,
      stages: [
        {
          stage: "DECISION_PRIMARY",
          outcome: "SCHEMA_INVALID",
          safeCode: "CODEX_DECISION_OUTPUT_INVALID",
          issues: expect.arrayContaining([{ code: "INVALID_TYPE", path: "$.state.curiosity" }]),
        },
        {
          stage: "DECISION_REPAIR",
          outcome: "SCHEMA_INVALID",
          safeCode: "CODEX_DECISION_OUTPUT_INVALID",
          issues: expect.arrayContaining([{ code: "INVALID_TYPE", path: "$.state.curiosity" }]),
        },
      ],
    });
    expect(JSON.stringify(document)).not.toContain(rawSecret);
  });

  it("classifies action-worthiness candidate mismatch without retaining output", async () => {
    const diagnostics = createCapabilityBenchmarkDiagnosticCollector("capacity");
    const mismatchedWorthiness = {
      ...worthinessOutput(),
      evaluations: [
        { sequence: 2, decision: "ACCEPT", safeReason: "RAW_WORTHINESS_MUST_NOT_LEAK" },
      ],
      selectedSequences: [2],
    };
    const provider: RuntimeProvider = {
      inspect: vi
        .fn()
        .mockResolvedValue({ version: "codex-cli 1.2.3", supportsStructuredOutput: true }),
      invoke: vi.fn().mockImplementation(async ({ prompt }) => ({
        ...result(1000),
        output: prompt.includes("# Final action-worthiness decision")
          ? mismatchedWorthiness
          : candidateOutput(),
      })),
    };

    await expect(
      runCapacityBenchmark(provider, {
        baseUrl: "http://127.0.0.1:3000",
        fetchImplementation: healthyFetch,
        diagnosticSink: diagnostics.record,
      }),
    ).rejects.toThrow("CAPABILITY_BENCHMARK_EXHAUSTED");
    const document = diagnostics.document("BENCHMARK_EXHAUSTED");

    expect(document.scenarios).toHaveLength(10);
    expect(document.scenarios[0]?.stages.at(-1)).toEqual({
      stage: "ACTION_WORTHINESS",
      outcome: "SCHEMA_INVALID",
      safeCode: "ACTION_WORTHINESS_CANDIDATE_SET_MISMATCH",
      issues: [],
    });
    expect(JSON.stringify(document)).not.toContain("RAW_WORTHINESS_MUST_NOT_LEAK");
  });

  it("keeps exact dual lane failure code without fabricating an OOM", async () => {
    let invocation = 0;
    const diagnostics = createCapabilityBenchmarkDiagnosticCollector("concurrency");
    const provider: RuntimeProvider = {
      inspect: vi
        .fn()
        .mockResolvedValue({ version: "codex-cli 1.2.3", supportsStructuredOutput: true }),
      invoke: vi.fn().mockImplementation(async () => {
        invocation += 1;
        if (invocation === 2) throw new RuntimeProviderExecutionError("CODEX_RATE_LIMITED");
        return result(5000);
      }),
    };

    const measurement = await runConcurrencyCapabilityTest(
      provider,
      {
        baseUrl: "http://127.0.0.1:3000",
        fetchImplementation: healthyFetch,
        diagnosticSink: diagnostics.record,
      },
      baselineMeasurement(),
    );
    const document = diagnostics.document("BENCHMARK_COMPLETED");

    expect(measurement).toMatchObject({
      dualRunSuccessCount: 1,
      dualProcessPeakRssMb: 100,
      oomDetected: false,
    });
    expect(document.scenarios).toEqual([
      expect.objectContaining({ lane: 1, finalStatus: "PASS" }),
      expect.objectContaining({
        lane: 2,
        finalStatus: "FAIL",
        stages: [
          {
            stage: "DECISION_PRIMARY",
            outcome: "PROVIDER_FAILED",
            safeCode: "CODEX_RATE_LIMITED",
            issues: [],
          },
        ],
      }),
    ]);
  });

  it("fails exhausted dual evidence while retaining both bounded lane diagnostics", async () => {
    const diagnostics = createCapabilityBenchmarkDiagnosticCollector("concurrency");
    const provider: RuntimeProvider = {
      inspect: vi
        .fn()
        .mockResolvedValue({ version: "codex-cli 1.2.3", supportsStructuredOutput: true }),
      invoke: vi
        .fn()
        .mockRejectedValue(new RuntimeProviderExecutionError("CODEX_UPSTREAM_UNAVAILABLE")),
    };

    await expect(
      runConcurrencyCapabilityTest(
        provider,
        {
          baseUrl: "http://127.0.0.1:3000",
          fetchImplementation: healthyFetch,
          diagnosticSink: diagnostics.record,
        },
        baselineMeasurement(),
      ),
    ).rejects.toThrow("CAPABILITY_BENCHMARK_EXHAUSTED");

    expect(diagnostics.document("BENCHMARK_EXHAUSTED").scenarios).toEqual([
      expect.objectContaining({
        lane: 1,
        finalStatus: "FAIL",
        stages: [expect.objectContaining({ safeCode: "CODEX_UPSTREAM_UNAVAILABLE" })],
      }),
      expect.objectContaining({
        lane: 2,
        finalStatus: "FAIL",
        stages: [expect.objectContaining({ safeCode: "CODEX_UPSTREAM_UNAVAILABLE" })],
      }),
    ]);
  });
});
