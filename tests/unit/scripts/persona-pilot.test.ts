import { mkdtempSync, rmSync, writeFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { atomicPrivateJson, readPrivate } from "../../../scripts/contract-pilot/files";
import { runPersonaPilot } from "../../../scripts/persona-pilot/run";
import type { PreparedPersonaPilot, PersonaPhase } from "../../../scripts/persona-pilot/input";
import type { PilotReader } from "../../../scripts/contract-pilot/run";
import {
  RuntimeProviderExecutionError,
  RuntimeProviderTimeoutError,
  type RuntimeProvider,
} from "@/runtime/provider";
import { runtimeNormalDecisionWireJsonSchema } from "@/runtime/output";
const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const output = {
  safeSummary: "Bu uyanışta yalnız gözlem yapıyorum.",
  state: { curiosity: 0.5, confidence: 0.5, topicFatigue: { items: [] } },
  observations: [],
  decisionJournal: [
    {
      seq: 1,
      kind: "OBSERVATION",
      subject: "gözlem",
      summary: "Yeni eylem gerektiren bir değişim yok.",
      confidence: 0.5,
      evidenceIds: [],
      causedBySeqs: [],
    },
  ],
  actions: [
    {
      type: "NO_ACTION",
      desire: 0.1,
      expectedOutcome: "Beklemek.",
      selectedOptionSeq: null,
      safeReason: "Yeni kanıt yok.",
      claimProvenance: [],
    },
  ],
  beliefDeltas: [],
  relationshipDeltas: [],
  sourceProposals: [],
  memoryCandidates: [],
  purposeChanges: [],
};
function fixture() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "persona-pilot-"));
  directories.push(directory);
  const prepared: PreparedPersonaPilot = {
    config: {
      manifestDirectory: directory,
      manifestSha256: "b".repeat(64),
      sourceSha: "a".repeat(40),
      model: "gpt-5.6-luna",
      reasoningEffort: "max",
      providerVersion: "synthetic-codex",
      aPrimeReceiptFile: "/private/aprime",
      aPrimeReceiptSha256: "c".repeat(64),
      aPrimeProductionSha: "a".repeat(40),
      codex: {
        executable: "/fake/codex",
        sandboxExecutable: "/fake/bwrap",
        credentialFile: "/fake/auth",
      },
      readerExecutable: "/fake/claude",
      readerVersion: "synthetic-reader",
      baselineFile: "/private/baseline",
      keyFile: "/private/hidden-key",
      keySha256: "d".repeat(64),
    },
    fingerprint: "f".repeat(64),
    pairs: Array.from({ length: 12 }, (_, i) => {
      const caseId = `case-${i.toString(16).padStart(12, "0")}`;
      return {
        caseId,
        phase: i < 6 ? "development" : "holdout",
        newSlot: i % 2 ? "B" : "A",
        preferences: { coreValues: ["kanıt"] },
        perception: { recentEntries: [] },
        inputs: ["A", "B"].map((slot) => ({
          label: `${caseId}-${slot}`,
          runId: "00000000-0000-4000-8000-000000000001",
          prompt: "private-rendered-persona",
          schema: runtimeNormalDecisionWireJsonSchema,
        })),
      };
    }),
  };
  const result = {
    provider: "codex-cli" as const,
    version: prepared.config.providerVersion,
    model: "gpt-5.6-luna",
    reasoningEffort: "max" as const,
    output,
    durationMs: 1,
  };
  const provider = {
    inspect: vi.fn(async () => ({
      version: result.version,
      model: result.model,
      reasoningEffort: result.reasoningEffort,
      supportsStructuredOutput: true,
    })),
    invoke: vi.fn<RuntimeProvider["invoke"]>(async () => result),
  };
  const scores = (packet: { cases: { caseId: string; outputs: { A: unknown; B: unknown } }[] }) =>
    packet.cases.map((item) => ({
      caseId: item.caseId,
      winnerSlot:
        !item.outputs.A || !item.outputs.B
          ? "INSUFFICIENT"
          : prepared.pairs.find((pair) => pair.caseId === item.caseId)!.newSlot,
      evidence: ["A", "B"]
        .filter((slot) => item.outputs[slot as "A" | "B"])
        .map((slot) => ({
          slot,
          quote: output.safeSummary,
          reason: "Sentetik kaynak eşliği; davranış başarısı iddiası yok.",
        })),
      violations: [],
      reason: "Bu yalnız çalıştırıcı fixture değerlendirmesidir.",
    }));
  const reader = {
    inspect: vi.fn(async () => {}),
    invoke: vi.fn<PilotReader["invoke"]>(async (packet) => ({
      model: "claude-opus-5",
      report: JSON.stringify({ cases: scores(JSON.parse(packet)) }),
      observedModels: ["claude-opus-5"],
      version: prepared.config.readerVersion,
    })),
  };
  let clock = Date.parse("2026-10-06T10:01:00Z");
  const options = { prepare: () => prepared, directory, provider, reader, now: () => clock };
  const journal = () => JSON.parse(readPrivate(path.join(directory, "state.json")));
  const review = (phase: PersonaPhase) => {
    const attempt = journal().attempts.find(
      (item: { kind: string; phase: string }) => item.kind === "READER" && item.phase === phase,
    );
    const report = JSON.parse(readPrivate(path.join(directory, `${attempt.index}.json`)));
    return {
      phase,
      value: {
        version: 1,
        readerOutputHash: attempt.outputHash,
        packetHash: attempt.packetHash,
        sourceVerified: true,
        readerDisagreement: null,
        ...JSON.parse(report.report),
      },
    };
  };
  return {
    directory,
    prepared,
    provider,
    reader,
    result,
    options,
    journal,
    review,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}
describe("P2 iki aşamalı kalıcı pilot (ağsız)", () => {
  it("12+12 karar, iki ayrı kör okuma ve kaynak kontrolü; geçerli çıktıyı yeniden üretmez", async () => {
    const f = fixture();
    f.provider.invoke.mockImplementation(async () => {
      expect(f.journal().attempts.at(-1).status).toBe("RESERVED");
      return f.result;
    });
    expect(await runPersonaPilot(f.options)).toMatchObject({
      status: "AWAITING_SOURCE_REVIEW",
      runtimeCalls: 12,
      readerCalls: 1,
    });
    expect(await runPersonaPilot(f.options)).toMatchObject({
      status: "AWAITING_SOURCE_REVIEW",
      runtimeCalls: 12,
    });
    await runPersonaPilot({ ...f.options, review: f.review("development") });
    expect(f.provider.invoke).toHaveBeenCalledTimes(12);
    expect(await runPersonaPilot(f.options)).toMatchObject({
      status: "AWAITING_SOURCE_REVIEW",
      runtimeCalls: 24,
      readerCalls: 2,
    });
    await runPersonaPilot({ ...f.options, review: f.review("holdout") });
    expect(await runPersonaPilot(f.options)).toMatchObject({
      status: "BOTH_THRESHOLDS_MET_NOT_BEHAVIOR_PASS",
      runtimeCalls: 24,
    });
    expect(f.provider.invoke).toHaveBeenCalledTimes(24);
    expect(f.reader.invoke).toHaveBeenCalledTimes(2);
    f.advance(91 * 60000);
    expect(await runPersonaPilot(f.options)).toMatchObject({
      status: "BOTH_THRESHOLDS_MET_NOT_BEHAVIOR_PASS",
      runtimeCalls: 24,
    });
    await expect(runPersonaPilot({ ...f.options, review: f.review("holdout") })).rejects.toThrow(
      "PILOT_PERSONA_PHASE_CLOSED",
    );
    expect(f.journal().terminalReason).toBeUndefined();
    const packet = f.reader.invoke.mock.calls[0]![0];
    for (const forbidden of [
      "newSlot",
      "development",
      "holdout",
      "private-rendered-persona",
      "private/hidden-key",
      "manifestDirectory",
    ])
      expect(packet).not.toContain(forbidden);
    expect(statSync(path.join(f.directory, "state.json")).mode & 0o777).toBe(0o600);
  });
  it("eşik altı ilk set saklı sete geçmez", async () => {
    const f = fixture();
    await runPersonaPilot(f.options);
    const review = f.review("development");
    review.value.readerDisagreement = "Kaynak kontrolünde üstünlük doğrulanmadı.";
    for (const item of review.value.cases) item.winnerSlot = "TIE";
    await runPersonaPilot({ ...f.options, review });
    expect(await runPersonaPilot(f.options)).toMatchObject({
      status: "THRESHOLD_NOT_MET",
      runtimeCalls: 12,
    });
    f.advance(91 * 60000);
    expect(await runPersonaPilot(f.options)).toMatchObject({
      status: "THRESHOLD_NOT_MET",
      runtimeCalls: 12,
    });
  });
  it("teknik hatayı tekrar etmez, tam çift eşiğini küçültmez", async () => {
    const f = fixture();
    f.provider.invoke.mockRejectedValueOnce(new RuntimeProviderTimeoutError());
    await runPersonaPilot(f.options);
    await runPersonaPilot({ ...f.options, review: f.review("development") });
    expect(await runPersonaPilot(f.options)).toMatchObject({
      status: "INCOMPLETE",
      development: { completePairs: 5 },
      runtimeCalls: 12,
    });
    expect(f.provider.invoke).toHaveBeenCalledTimes(12);
  });
  it("doğrulanmış yeni kol ihlali saklı seti kapatır", async () => {
    const f = fixture();
    await runPersonaPilot(f.options);
    const review = f.review("development");
    review.value.readerDisagreement = "Sentetik ihlal kaynakla doğrulandı.";
    review.value.cases[0].violations = [
      {
        slot: "A",
        quote: output.safeSummary,
        reason: "Test ihlali için sentetik gerekçe.",
        rule: "Sentetik kural",
      },
    ];
    await runPersonaPilot({ ...f.options, review });
    expect(await runPersonaPilot(f.options)).toMatchObject({
      status: "VERIFIED_NEW_VIOLATION",
      runtimeCalls: 12,
    });
  });
  it("başarılı ilk setten sonra geçen operatör zamanı aynı bütçeden düşer", async () => {
    const f = fixture();
    await runPersonaPilot(f.options);
    f.advance(75 * 60000);
    await runPersonaPilot({ ...f.options, review: f.review("development") });
    expect(await runPersonaPilot(f.options)).toMatchObject({
      status: "INCOMPLETE",
      runtimeCalls: 12,
    });
    expect(f.journal().terminalReason).toBe("PILOT_PERSONA_HOLDOUT_BUDGET_CLOSED");
  });
  it("90 dakikadan sonra alıntı kontrolünü kabul etmez", async () => {
    const f = fixture();
    await runPersonaPilot(f.options);
    f.advance(90 * 60000);
    expect(await runPersonaPilot({ ...f.options, review: f.review("development") })).toMatchObject({
      status: "INCOMPLETE",
    });
    expect(f.journal().reviews).toHaveLength(0);
  });
  it("yetki sonuna tam 90 dakika yoksa ilk invoke açılmaz", async () => {
    const f = fixture();
    f.options.now = () => Date.parse("2026-10-17T18:21:00Z");
    await expect(runPersonaPilot(f.options)).rejects.toThrow("PILOT_START_WINDOW_TOO_SHORT");
    expect(f.provider.invoke).not.toHaveBeenCalled();
  });
  it("ilk aşamada iki okuma ve saklı karar dilimleri için 42 dakika korur", async () => {
    const f = fixture();
    f.provider.invoke.mockImplementation(async (request) => {
      f.advance(Math.min(5 * 60000, request.timeoutMs));
      return f.result;
    });
    const result = await runPersonaPilot(f.options);
    expect(result.runtimeCalls).toBe(10);
    expect(result.manualReviewRemainingMs).toBe(42 * 60000);
    expect(f.provider.invoke.mock.calls.every(([request]) => request.timeoutMs <= 6 * 60000)).toBe(
      true,
    );
  });
  it("bozuk wire çıktısını özel kanıtta saklar", async () => {
    const f = fixture();
    f.provider.invoke.mockResolvedValueOnce({ ...f.result, output: { broken: true } });
    await runPersonaPilot(f.options);
    expect(f.journal().attempts[0]).toMatchObject({
      status: "FAILED",
      safeCode: "PILOT_WIRE_INVALID",
    });
    expect(JSON.parse(readPrivate(path.join(f.directory, "1.json"))).output).toEqual({
      broken: true,
    });
  });
  it("fatal auth hatası terminaldir; ayarı geri almak yeni hak açmaz", async () => {
    const f = fixture();
    f.provider.invoke.mockRejectedValueOnce(
      new RuntimeProviderExecutionError("CODEX_AUTH_REQUIRED"),
    );
    await expect(runPersonaPilot(f.options)).rejects.toThrow("CODEX_AUTH_REQUIRED");
    await expect(runPersonaPilot(f.options)).rejects.toThrow("CODEX_AUTH_REQUIRED");
    expect(f.provider.invoke).toHaveBeenCalledTimes(1);
  });
  it("yarım rezervasyon harcanmış kalır", async () => {
    const f = fixture();
    await runPersonaPilot(f.options);
    const state = f.journal();
    state.attempts.at(-1).status = "RESERVED";
    atomicPrivateJson(path.join(f.directory, "state.json"), state);
    await expect(runPersonaPilot(f.options)).rejects.toThrow("PILOT_UNFINISHED_ATTEMPT");
    expect(f.provider.invoke).toHaveBeenCalledTimes(12);
  });
  it("eski/aktif lock'u kendi kendine temizlemez", async () => {
    const f = fixture();
    writeFileSync(path.join(f.directory, "run.lock"), "test", { mode: 0o600 });
    await expect(runPersonaPilot(f.options)).rejects.toThrow("PILOT_ALREADY_RUNNING_OR_STALE_LOCK");
    expect(f.provider.invoke).not.toHaveBeenCalled();
  });
  it("başlamış kayıtta prepare hatası da terminal kapanır", async () => {
    const f = fixture();
    await runPersonaPilot(f.options);
    await expect(
      runPersonaPilot({
        ...f.options,
        prepare: () => {
          throw new Error("PILOT_INPUT_CHANGED");
        },
      }),
    ).rejects.toThrow("PILOT_INPUT_CHANGED");
    await expect(runPersonaPilot(f.options)).rejects.toThrow("PILOT_INPUT_CHANGED");
  });
  it("değişen config ve çıktı özeti yeniden başlatmayı kapatır", async () => {
    const f = fixture();
    await runPersonaPilot(f.options);
    f.prepared.fingerprint = "e".repeat(64);
    await expect(runPersonaPilot(f.options)).rejects.toThrow("PILOT_FROZEN_CONFIG_CHANGED");
    const g = fixture();
    await runPersonaPilot(g.options);
    atomicPrivateJson(path.join(g.directory, "1.json"), {});
    await expect(runPersonaPilot(g.options)).rejects.toThrow("PILOT_OUTPUT_CHANGED");
  });
  it("kaydedilen inceleme değişirse tekrar okunamaz", async () => {
    const f = fixture();
    await runPersonaPilot(f.options);
    await runPersonaPilot({ ...f.options, review: f.review("development") });
    atomicPrivateJson(path.join(f.directory, "development-review.json"), {});
    await expect(runPersonaPilot(f.options)).rejects.toThrow(
      "PILOT_PERSONA_REVIEW_BINDING_CHANGED",
    );
  });
  it("saat gerilemesi ek süre vermez", async () => {
    const f = fixture();
    await runPersonaPilot(f.options);
    f.advance(-3000);
    await expect(runPersonaPilot(f.options)).rejects.toThrow("PILOT_CLOCK_ROLLBACK");
  });
  it("yanlış reader sürümü ve bozuk rapor saklı set açmaz; ham rapor korunur", async () => {
    const f = fixture();
    f.reader.invoke.mockResolvedValueOnce({
      model: "claude-opus-5",
      version: "wrong",
      report: "raw-private-report",
      observedModels: ["claude-opus-5"],
    });
    expect(await runPersonaPilot(f.options)).toMatchObject({ status: "INCOMPLETE" });
    expect(f.journal().attempts.at(-1).safeCode).toBe("PILOT_READER_VERSION_CHANGED");
    expect(JSON.parse(readPrivate(path.join(f.directory, "13.json"))).report).toBe(
      "raw-private-report",
    );
    await runPersonaPilot(f.options);
    expect(f.reader.invoke).toHaveBeenCalledTimes(1);
  });
  it("ilk modelden önce CLI/model fingerprint sapmasını reddeder", async () => {
    const f = fixture();
    f.provider.inspect.mockResolvedValueOnce({
      version: "wrong",
      model: "gpt-5.6-luna",
      reasoningEffort: "max",
      supportsStructuredOutput: true,
    });
    await expect(runPersonaPilot(f.options)).rejects.toThrow("PILOT_PROVIDER_FINGERPRINT_CHANGED");
    expect(f.provider.invoke).not.toHaveBeenCalled();
  });
  it("kaynaksız, tek kollu veya başka rapora bağlı inceleme başarıya dönüşmez", async () => {
    for (const variant of ["quote", "one-sided", "binding", "disagreement", "case"] as const) {
      const f = fixture();
      await runPersonaPilot(f.options);
      const review = f.review("development");
      if (variant === "quote") review.value.cases[0].evidence[0].quote = "olmayan bir alıntı";
      if (variant === "one-sided") review.value.cases[0].evidence.pop();
      if (variant === "binding") review.value.readerOutputHash = "e".repeat(64);
      if (variant === "disagreement") review.value.cases[0].winnerSlot = "TIE";
      if (variant === "case") review.value.cases[0].caseId = "case-ffffffffffff";
      await expect(runPersonaPilot({ ...f.options, review })).rejects.toThrow(/PILOT_PERSONA_/u);
      expect(f.journal().reviews).toHaveLength(0);
      expect(f.journal().terminalReason).toBeUndefined();
      const startedAt = f.journal().startedAt;
      f.advance(60000);
      await runPersonaPilot({ ...f.options, review: f.review("development") });
      expect(f.journal().startedAt).toBe(startedAt);
      expect(f.journal().reviews).toHaveLength(1);
      expect(f.provider.invoke).toHaveBeenCalledTimes(12);
    }
  });
});

describe("P2 hakem bulgularının karşı örnekleri", () => {
  it("sentetik 2dk karar +5dk okuyucu +3dk kontrol ile iki set64dk içinde sığar", async () => {
    const f = fixture();
    f.provider.invoke.mockImplementation(async () => {
      f.advance(2 * 60000);
      return f.result;
    });
    const reader = f.reader.invoke.getMockImplementation()!;
    f.reader.invoke.mockImplementation(async (...args) => {
      f.advance(5 * 60000);
      return reader(...args);
    });
    await runPersonaPilot(f.options);
    f.advance(3 * 60000);
    await runPersonaPilot({ ...f.options, review: f.review("development") });
    await runPersonaPilot(f.options);
    f.advance(3 * 60000);
    await runPersonaPilot({ ...f.options, review: f.review("holdout") });
    expect(await runPersonaPilot(f.options)).toMatchObject({
      status: "BOTH_THRESHOLDS_MET_NOT_BEHAVIOR_PASS",
      runtimeCalls: 24,
      readerCalls: 2,
      manualReviewRemainingMs: 26 * 60000,
    });
  });
  it("ilk set geçip saklı set reddedilebilir; iki okuyucu hükmü ve override sayısı görünür", async () => {
    const f = fixture();
    await runPersonaPilot(f.options);
    await runPersonaPilot({ ...f.options, review: f.review("development") });
    await runPersonaPilot(f.options);
    const review = f.review("holdout");
    review.value.readerDisagreement = "Kaynak incelemesi üstünlüğü doğrulamadı.";
    for (const item of review.value.cases) item.winnerSlot = "TIE";
    await runPersonaPilot({ ...f.options, review });
    const result = await runPersonaPilot(f.options);
    expect(result).toMatchObject({
      status: "THRESHOLD_NOT_MET",
      development: { status: "THRESHOLD_MET", changedCaseIds: [] },
      holdout: {
        status: "THRESHOLD_NOT_MET",
        newWins: 0,
        readerAssessment: { status: "THRESHOLD_MET", newWins: 6 },
      },
    });
    expect(result.holdout?.changedCaseIds).toHaveLength(6);
  });
  it("saklı okuma son tarihi aşarsa geç raporu başarı saymaz", async () => {
    const f = fixture();
    await runPersonaPilot(f.options);
    await runPersonaPilot({ ...f.options, review: f.review("development") });
    const reader = f.reader.invoke.getMockImplementation()!;
    f.reader.invoke.mockImplementationOnce(async (...args) => {
      f.advance(91 * 60000);
      return reader(...args);
    });
    expect(await runPersonaPilot(f.options)).toMatchObject({
      status: "INCOMPLETE",
      runtimeCalls: 24,
    });
    expect(f.journal().reviews).toHaveLength(1);
  });
  it("Opus yanında yardımcı model görülürse P2 okumasını kabul etmez", async () => {
    const f = fixture();
    const reader = f.reader.invoke.getMockImplementation()!;
    f.reader.invoke.mockImplementationOnce(async (...args) => ({
      ...(await reader(...args)),
      observedModels: ["claude-opus-5", "claude-haiku-test"],
    }));
    expect(await runPersonaPilot(f.options)).toMatchObject({ status: "INCOMPLETE" });
    expect(f.journal().attempts.at(-1).safeCode).toBe("PILOT_READER_MODEL_CHANGED");
  });
  it("puanlanan bağlam okuyucunun gördüğü paketten farklı olamaz", async () => {
    const f = fixture();
    await runPersonaPilot(f.options);
    const review = f.review("development");
    // Gerçek prepare ayrıca hash kapısıyla engeller; paket bağı bağımsız sınanıyor.
    f.prepared.pairs[0]!.preferences = { coreValues: ["başka tercih"] };
    await expect(runPersonaPilot({ ...f.options, review })).rejects.toThrow(
      "PILOT_PERSONA_READER_PACKET_CHANGED",
    );
  });
  it("bilinmeyen ortam hatasında otomatik bütçe kurtarma yapmaz", async () => {
    const f = fixture();
    await runPersonaPilot(f.options);
    await expect(
      runPersonaPilot({
        ...f.options,
        prepare: () => {
          throw new Error("synthetic IO unavailable");
        },
      }),
    ).rejects.toThrow("synthetic IO unavailable");
    expect(f.journal().terminalReason).toBe("PILOT_FATAL_ERROR");
    await expect(runPersonaPilot(f.options)).rejects.toThrow("PILOT_FATAL_ERROR");
  });
});

describe("P2 son inceleme düzeltmeleri", () => {
  it("yalnız alıntı sırası değişince anlaşmazlık üretmez; aynı inceleme tekrar yazılmaz", async () => {
    const f = fixture();
    await runPersonaPilot(f.options);
    const review = f.review("development");
    for (const item of review.value.cases) item.evidence.reverse();
    expect(await runPersonaPilot({ ...f.options, review })).toMatchObject({
      development: { changedCaseIds: [], gateEligible: true },
    });
    await expect(runPersonaPilot({ ...f.options, review })).rejects.toThrow(
      "PILOT_PERSONA_REVIEW_ALREADY_RECORDED",
    );
    expect(f.journal().terminalReason).toBeUndefined();
    expect(f.journal().reviews).toHaveLength(1);
  });
  it("operatör altı vakayı yükseltse bile okuyucunun reddinden saklı sete geçmez", async () => {
    const f = fixture(),
      reader = f.reader.invoke.getMockImplementation()!;
    f.reader.invoke.mockImplementationOnce(async (...args) => {
      const result = await reader(...args),
        report = JSON.parse(result.report);
      for (const item of report.cases) item.winnerSlot = "TIE";
      return { ...result, report: JSON.stringify(report) };
    });
    await runPersonaPilot(f.options);
    const review = f.review("development");
    review.value.readerDisagreement =
      "Operatör farklı yorumladı; bağımsız uyuşmazlık devam ediyor.";
    for (const item of review.value.cases)
      item.winnerSlot = f.prepared.pairs.find((pair) => pair.caseId === item.caseId)!.newSlot;
    await runPersonaPilot({ ...f.options, review });
    const result = await runPersonaPilot(f.options);
    expect(result).toMatchObject({
      status: "READER_DISAGREEMENT",
      runtimeCalls: 12,
      development: {
        status: "THRESHOLD_MET",
        gateEligible: false,
        readerAssessment: { status: "THRESHOLD_NOT_MET" },
      },
    });
    expect(result.development?.changedCaseIds).toHaveLength(6);
    expect(f.provider.invoke).toHaveBeenCalledTimes(12);
  });
  it("bozuk inceleme şekli düzeltilebilir fakat son tarih uzamaz", async () => {
    const f = fixture();
    await runPersonaPilot(f.options);
    await expect(
      runPersonaPilot({ ...f.options, review: { phase: "development", value: {} } }),
    ).rejects.toThrow("PILOT_PERSONA_REVIEW_INVALID");
    expect(f.journal().terminalReason).toBeUndefined();
    f.advance(90 * 60000);
    expect(await runPersonaPilot({ ...f.options, review: f.review("development") })).toMatchObject({
      status: "INCOMPLETE",
    });
    expect(f.journal().reviews).toHaveLength(0);
  });
  it("okuyucuya gönderilen baytlar hash bağlı packet dosyasıyla aynıdır", async () => {
    const f = fixture();
    await runPersonaPilot(f.options);
    expect(f.reader.invoke.mock.calls[0]![0]).toBe(
      readPrivate(path.join(f.directory, "development-packet.json")),
    );
  });
  it("her donmuş girdi denetiminin süresi aynı saatte sayılır", async () => {
    const f = fixture();
    const result = await runPersonaPilot({
      ...f.options,
      prepare: () => {
        f.advance(1000);
        return f.prepared;
      },
    });
    expect(result.runtimeCalls).toBe(12);
    expect(result.manualReviewRemainingMs).toBeLessThanOrEqual(90 * 60000 - 12000);
  });
});
