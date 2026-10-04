import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { atomicPrivateJson, hash, readPrivate } from "../../../scripts/contract-pilot/files";
import { preparePilot, type PreparedPilot } from "../../../scripts/contract-pilot/input";
import { runContractPilot, type PilotReader } from "../../../scripts/contract-pilot/run";
import { opusReader } from "../../../scripts/contract-pilot/reader";
import { parseRuntimeDecisionOutput, runtimeNormalDecisionWireJsonSchema } from "@/runtime/output";
import { buildRuntimePrompt } from "@/runtime/worker";
import type { RuntimeContext } from "@/runtime/control-plane-client";
import { RUNTIME_PROMPT_PROFILE_HASH } from "@/runtime/prompt-profile";
import {
  RuntimeProviderExecutionError,
  RuntimeProviderTimeoutError,
  type RuntimeProvider,
} from "@/runtime/provider";

const directories: string[] = [];
const temporary = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "contract-pilot-"));
  directories.push(dir);
  return dir;
};
afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const time = Date.parse("2026-10-06T10:01:00Z");
const source = "a".repeat(40);
const version = "codex-cli synthetic-test";
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
  const directory = temporary();
  const result = {
    provider: "codex-cli" as const,
    version,
    model: "gpt-5.6-luna",
    reasoningEffort: "max" as const,
    output,
    durationMs: 1,
  };
  const prepared: PreparedPilot = {
    config: {
      manifestDirectory: directory,
      manifestSha256: "b".repeat(64),
      sourceSha: source,
      model: "gpt-5.6-luna",
      reasoningEffort: "max",
      providerVersion: version,
      aPrimeReceiptFile: path.join(directory, "receipt.json"),
      aPrimeReceiptSha256: "c".repeat(64),
      aPrimeProductionSha: source,
      codex: {
        executable: "/fake/codex",
        sandboxExecutable: "/fake/bwrap",
        credentialFile: "/fake/auth.json",
      },
      readerExecutable: "/fake/claude",
      readerVersion: "test-reader",
    },
    fingerprint: "d".repeat(64),
    criteria: { emptyBkzAllowed: true, p5ObservationOnly: true },
    inputs: Array.from({ length: 18 }, (_, index) => ({
      label: `case-${Math.floor(index / 2)
        .toString(16)
        .padStart(12, "0")}-${index % 2 ? "B" : "A"}`,
      feature: index < 8 ? "P3" : index < 16 ? "P4" : "P5",
      runId: "00000000-0000-4000-8000-000000000001",
      prompt: `private-system-prompt-${index}`,
      schema: runtimeNormalDecisionWireJsonSchema,
      perception: {
        recentEntries: [
          { username: "hidden-name", displayName: "hidden-display", body: "görünür metin" },
        ],
        publicBio: "hidden-bio",
      },
    })),
  };
  const provider = {
    inspect: vi.fn(async () => ({
      version,
      supportsStructuredOutput: true,
      model: "gpt-5.6-luna",
      reasoningEffort: "max" as const,
    })),
    invoke: vi.fn<RuntimeProvider["invoke"]>(async () => result),
  };
  const reader = {
    inspect: vi.fn(async () => {}),
    invoke: vi.fn<PilotReader["invoke"]>(async () => ({
      model: "claude-opus-5" as const,
      report: "NOT_EXERCISED",
      observedModels: ["claude-opus-5"],
      version: "test-reader",
    })),
  };
  let clock = time;
  const options = { directory, prepare: () => prepared, provider, reader, now: () => clock };
  const journal = () => JSON.parse(readPrivate(path.join(directory, "state.json")));
  return {
    options,
    prepared,
    result,
    provider,
    reader,
    directory,
    journal,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe("P3/P4/P5 kalıcı pilot bütçesi (sahte sağlayıcı)", () => {
  it("18 karar + 1 okuyucu kaydeder; rezervasyonu çağrıdan önce yazar ve tekrar çalıştırmaz", async () => {
    const f = fixture();
    expect(parseRuntimeDecisionOutput(output).success).toBe(true);
    f.provider.invoke.mockImplementation(async () => {
      expect(f.journal().attempts.at(-1).status).toBe("RESERVED");
      return f.result;
    });
    expect(await runContractPilot(f.options)).toMatchObject({
      status: "OUTPUTS_RECORDED_NOT_BEHAVIOR_PASS",
      calls: 19,
      validDecisions: 18,
    });
    expect(await runContractPilot(f.options)).toMatchObject({ calls: 19 });
    expect(f.provider.invoke).toHaveBeenCalledTimes(18);
    expect(f.reader.invoke).toHaveBeenCalledTimes(1);
    expect(statSync(path.join(f.directory, "state.json")).mode & 0o777).toBe(0o600);
    const packet = f.reader.invoke.mock.calls[0]![0];
    for (const value of [
      "hidden-name",
      "hidden-display",
      "hidden-bio",
      "private-system-prompt",
      "/fake/auth.json",
    ])
      expect(packet).not.toContain(value);
    expect(packet).toContain("görünür metin");
  });

  it("beş teknik tekrarın tamamını ve ilk hatayı korur; 24 toplam çağrıyı aşmaz", async () => {
    const f = fixture();
    let calls = 0;
    f.provider.invoke.mockImplementation(async () => {
      if (calls++ < 5) throw new RuntimeProviderTimeoutError();
      return f.result;
    });
    expect(await runContractPilot(f.options)).toMatchObject({
      calls: 24,
      validDecisions: 18,
      readerComplete: true,
    });
    expect(
      f
        .journal()
        .attempts.slice(0, 5)
        .every((attempt: { safeCode: string }) => attempt.safeCode === "CODEX_TIMEOUT"),
    ).toBe(true);
    expect(f.journal().startedAt).toBe(time);
  });

  it("her karar bozuksa 23 karardan sonra tek okuyucu ile INCOMPLETE döner; ham hata çıktısını özel saklar", async () => {
    const f = fixture();
    f.provider.invoke.mockResolvedValue({ ...f.result, output: { ...output, safeSummary: "" } });
    expect(await runContractPilot(f.options)).toMatchObject({
      calls: 24,
      validDecisions: 0,
      status: "INCOMPLETE",
    });
    expect(f.provider.invoke).toHaveBeenCalledTimes(23);
    expect(f.journal().attempts[0]).toMatchObject({
      status: "FAILED",
      safeCode: "PILOT_WIRE_INVALID",
      outputHash: expect.any(String),
    });
    expect(JSON.parse(readPrivate(path.join(f.directory, "1.json"))).output.safeSummary).toBe("");
  });

  it("90 dakika kararlar, tekrarlar ve okuyucu için ortaktır; yeniden başlatma uzatmaz", async () => {
    const f = fixture();
    f.provider.invoke.mockImplementation(async () => {
      f.advance(5 * 60_000);
      return f.result;
    });
    expect(await runContractPilot(f.options)).toMatchObject({
      calls: 16,
      validDecisions: 15,
      readerComplete: true,
      status: "INCOMPLETE",
    });
    f.advance(60_000);
    expect(await runContractPilot(f.options)).toMatchObject({ calls: 16, readerComplete: true });
    expect(f.reader.invoke).toHaveBeenCalledTimes(1);
  });

  it("okuyucuya yalnız kalan süreyi verir ve geç sonucu başarı saymaz", async () => {
    const f = fixture();
    let count = 0;
    f.provider.invoke.mockImplementation(async () => {
      if (++count === 18) f.advance(78 * 60_000);
      return f.result;
    });
    f.reader.invoke.mockImplementation(async (_packet, timeout) => {
      expect(timeout).toBe(9 * 60_000);
      f.advance(13 * 60_000);
      return {
        model: "claude-opus-5",
        report: "NO_FINDING",
        observedModels: ["claude-opus-5"],
        version: "test-reader",
      };
    });
    expect(await runContractPilot(f.options)).toMatchObject({ status: "INCOMPLETE", calls: 19 });
  });

  it("okuyucu hatasına ikinci okuyucu çağrısı açmaz", async () => {
    const f = fixture();
    f.reader.invoke.mockRejectedValue(new Error("private error"));
    expect(await runContractPilot(f.options)).toMatchObject({ status: "INCOMPLETE", calls: 19 });
    await runContractPilot(f.options);
    expect(f.reader.invoke).toHaveBeenCalledTimes(1);
    expect(readPrivate(path.join(f.directory, "state.json"))).not.toContain("private error");
  });

  it.each(["fingerprint", "source", "provider", "clock"])(
    "%s değişimi kaydı kalıcı kapatır",
    async (kind) => {
      const f = fixture();
      f.provider.invoke.mockImplementationOnce(async () => {
        if (kind === "fingerprint") f.prepared.fingerprint = "e".repeat(64);
        if (kind === "source")
          f.options.prepare = () => {
            throw new Error("PILOT_SOURCE_CHANGED");
          };
        if (kind === "clock") f.advance(-3_000);
        return kind === "provider" ? { ...f.result, version: "changed" } : f.result;
      });
      await expect(runContractPilot(f.options)).rejects.toThrow();
      expect(f.journal().terminalReason).toMatch(/^PILOT_/u);
      f.prepared.fingerprint = "d".repeat(64);
      f.options.prepare = () => f.prepared;
      f.advance(3_001);
      await expect(runContractPilot(f.options)).rejects.toThrow();
      expect(f.provider.invoke).toHaveBeenCalledTimes(1);
    },
  );

  it("küçük saat düzeltmesini süre kredisi vermeden kenetler", async () => {
    const f = fixture();
    f.provider.invoke.mockImplementationOnce(async () => {
      f.advance(-1);
      return f.result;
    });
    expect(await runContractPilot(f.options)).toMatchObject({ calls: 19, readerComplete: true });
    const state = f.journal();
    expect(state.startedAt).toBe(time);
    expect(state.lastObservedAt).toBe(time);
    expect(
      state.attempts.every(
        (a: { reservedAt: number; finishedAt: number }) =>
          a.reservedAt >= time && a.finishedAt >= a.reservedAt,
      ),
    ).toBe(true);
  });

  it("dakikadan kısa karar dilimini yakmaz; okuyucuya ayrılan zamanı korur", async () => {
    const f = fixture();
    f.provider.invoke.mockImplementationOnce(async () => {
      f.advance(74.5 * 60_000);
      return f.result;
    });
    expect(await runContractPilot(f.options)).toMatchObject({
      calls: 2,
      validDecisions: 1,
      readerComplete: true,
    });
    expect(f.reader.invoke.mock.calls[0]![1]).toBe(12 * 60_000);
  });

  it("yetki bitimine 90 dakikadan az kalmışsa ilk model çağrısını açmaz", async () => {
    const f = fixture();
    f.options.now = () => Date.parse("2026-10-17T19:49:00Z");
    await expect(runContractPilot(f.options)).rejects.toThrow("PILOT_START_WINDOW_TOO_SHORT");
    expect(f.provider.invoke).not.toHaveBeenCalled();
    expect(() => f.journal()).toThrow();
  });

  it("okuyucu ön kontrolü başarısızken karar çağrısı/bütçe yaratmaz; yerel hazırlık düzeltilebilir", async () => {
    const f = fixture();
    f.reader.inspect.mockRejectedValueOnce(new Error("PILOT_READER_ARGUMENT_UNSUPPORTED"));
    await expect(runContractPilot(f.options)).rejects.toThrow("PILOT_READER_ARGUMENT_UNSUPPORTED");
    expect(f.provider.invoke).not.toHaveBeenCalled();
    expect(() => f.journal()).toThrow();
    expect(await runContractPilot(f.options)).toMatchObject({ calls: 19 });
  });

  it("okuyucunun güvenli hatasını düzleştirmez", async () => {
    const f = fixture();
    f.reader.invoke.mockRejectedValue(new Error("PILOT_READER_VERSION_CHANGED"));
    await runContractPilot(f.options);
    expect(f.journal().attempts.at(-1).safeCode).toBe("PILOT_READER_VERSION_CHANGED");
  });

  it("fatal auth hatası teknik tekrar hakkıyla yeniden denenmez", async () => {
    const f = fixture();
    f.provider.invoke.mockRejectedValue(new RuntimeProviderExecutionError("CODEX_AUTH_REQUIRED"));
    await expect(runContractPilot(f.options)).rejects.toThrow("CODEX_AUTH_REQUIRED");
    expect(f.provider.invoke).toHaveBeenCalledTimes(1);
    expect(f.reader.invoke).not.toHaveBeenCalled();
  });

  it("kalan RESERVED çağrı ve değiştirilmiş çıktı otomatik kurtarılmaz", async () => {
    for (const corrupt of ["reservation", "output"]) {
      const f = fixture();
      await runContractPilot(f.options);
      if (corrupt === "reservation") {
        const state = f.journal();
        state.attempts[0].status = "RESERVED";
        atomicPrivateJson(path.join(f.directory, "state.json"), state);
      } else atomicPrivateJson(path.join(f.directory, "1.json"), { changed: true });
      await expect(runContractPilot(f.options)).rejects.toThrow(
        corrupt === "reservation" ? "PILOT_UNFINISHED_ATTEMPT" : "PILOT_OUTPUT_CHANGED",
      );
      expect(f.provider.invoke).toHaveBeenCalledTimes(18);
    }
  });

  it("eşzamanlı veya eski kilidi kaldırmaz", async () => {
    const f = fixture();
    writeFileSync(path.join(f.directory, "run.lock"), "existing", { mode: 0o600 });
    await expect(runContractPilot(f.options)).rejects.toThrow(
      "PILOT_ALREADY_RUNNING_OR_STALE_LOCK",
    );
    expect(f.provider.inspect).not.toHaveBeenCalled();
    expect(readPrivate(path.join(f.directory, "run.lock"))).toBe("existing");
  });

  it("A′ kapısı kapanırken sıfır çağrılı bir çalışma bütçesi yaratmaz", async () => {
    const f = fixture();
    f.options.prepare = () => {
      throw new Error("PILOT_DATE_GATE_CLOSED");
    };
    await expect(runContractPilot(f.options)).rejects.toThrow("PILOT_DATE_GATE_CLOSED");
    expect(() => f.journal()).toThrow();
    expect(f.provider.inspect).not.toHaveBeenCalled();
  });
});

function manifestFixture() {
  const f = fixture();
  const receipt = {
    version: 1,
    kind: "A_PRIME_DECISION",
    productionSha: source,
    resumedAt: "2026-10-03T09:20:00Z",
    windowEndedAt: "2026-10-06T09:20:00Z",
    concludedAt: "2026-10-06T10:00:00Z",
    decision: "INCONCLUSIVE",
  };
  atomicPrivateJson(f.prepared.config.aPrimeReceiptFile, receipt);
  atomicPrivateJson(path.join(f.directory, "criteria.json"), f.prepared.criteria);
  writeFileSync(path.join(f.directory, "build.ts"), "// synthetic fixture builder", {
    mode: 0o600,
  });
  const cases = Array.from({ length: 9 }, (_, index) => {
    const inputs = f.prepared.inputs.slice(index * 2, index * 2 + 2);
    return {
      caseId: inputs[0]!.label.slice(0, -2),
      feature: inputs[0]!.feature,
      labels: inputs.map((input) => {
        const file = `${input.label}.json`;
        const context: RuntimeContext = {
          run: {
            id: input.runId,
            runType: "NORMAL_WAKE",
            trigger: "STOCHASTIC_TICK",
            timeoutSeconds: 1200,
            desiredEntryMin: 0,
            desiredEntryMax: 1,
            allowTopicCreation: false,
            allowVoting: false,
            allowFollowing: false,
            allowSourceReading: false,
            publishEnabled: true,
            publicWriteEnabled: true,
            runtimeOperatingMode: "NORMAL",
            sourceFetchLimit: 1,
            debugRetentionHours: 0,
            adminInstruction: null,
            cancelRequested: false,
          },
          agent: { username: "fixture-agent", displayName: "Fixture", publicBio: null },
          persona: {
            version: 1,
            renderedPrompt: "Sentetik test personası.",
            behavior: { topicCreationTendency: 0.1, votingTendency: 0.1, followingTendency: 0.1 },
            writing: { entryLength: "SHORT" },
          },
          perception: {
            observedAt: "2026-10-04T10:00:00Z",
            recentEntries: [
              {
                id: "00000000-0000-4000-8000-000000000002",
                body: "Görünür metin.",
                createdAt: "2026-10-04T09:00:00Z",
                topic: { id: "00000000-0000-4000-8000-000000000003", title: "test konusu" },
                author: { id: "00000000-0000-4000-8000-000000000004", username: "fixture-other" },
              },
            ],
          },
        };
        const prompt = buildRuntimePrompt(context);
        atomicPrivateJson(path.join(f.directory, file), {
          label: input.label,
          prompt,
          schema: input.schema,
          context,
        });
        return {
          label: input.label,
          file,
          fileSha256: hash(readPrivate(path.join(f.directory, file))),
          promptSha256: hash(prompt),
        };
      }),
    };
  });
  const manifest = {
    version: 2,
    sourceSha: source,
    runtimeProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
    criteriaSha256: hash(readPrivate(path.join(f.directory, "criteria.json"))),
    builderSha256: hash(readPrivate(path.join(f.directory, "build.ts"))),
    scope: "DECISION_ONLY",
    model: "gpt-5.6-luna",
    effort: "max",
    calls: 0,
    networkCalls: 0,
    databaseWrites: 0,
    maxModelCallsTotal: 24,
    maxRuntimeCalls: 23,
    readerCallsReserved: 1,
    maxElapsedMinutes: 90,
    plannedDecisionCalls: 18,
    remainingRuntimeCallsReservedForTechnicalFailure: 5,
    noAutomaticBudgetResetAfterCodeChange: true,
    allJudgeTimeInside90Minutes: true,
    readOnlyProviderOnly: true,
    noActionExecutorOrControlPlane: true,
    cases,
  };
  const configBytes = () => {
    atomicPrivateJson(path.join(f.directory, "manifest.json"), manifest);
    return JSON.stringify({
      ...f.prepared.config,
      manifestSha256: hash(readPrivate(path.join(f.directory, "manifest.json"))),
      aPrimeReceiptSha256: hash(readPrivate(f.prepared.config.aPrimeReceiptFile)),
    });
  };
  return { ...f, receipt, manifest, configBytes };
}

describe("pilot girdisi, A′ ve sabit kaynak kapıları", () => {
  it("9 eşleşmiş vakayı normal wire ile okur; A′ sonucu olumlu olmak zorunda değildir", () => {
    const f = manifestFixture();
    expect(preparePilot(f.configBytes(), source, time).inputs).toHaveLength(18);
  });
  it.each([time - 120_000, Date.parse("2026-10-17T19:50:00Z")])(
    "izinli tarih dışını reddeder (%s)",
    (date) => {
      const f = manifestFixture();
      expect(() => preparePilot(f.configBytes(), source, date)).toThrow("PILOT_DATE_GATE_CLOSED");
    },
  );
  it("72 saat veya karar zamanı kanıtı eksikse reddeder", () => {
    const f = manifestFixture();
    f.receipt.windowEndedAt = "2026-10-06T09:19:59Z";
    atomicPrivateJson(f.prepared.config.aPrimeReceiptFile, f.receipt);
    expect(() => preparePilot(f.configBytes(), source, time)).toThrow(
      "PILOT_A_PRIME_WINDOW_INVALID",
    );
  });
  it.each(["production", "old-window"])("A′ cohort sapmasını reddeder: %s", (kind) => {
    const f = manifestFixture();
    if (kind === "production") f.receipt.productionSha = "e".repeat(40);
    else {
      f.receipt.resumedAt = "2026-09-24T09:20:00Z";
      f.receipt.windowEndedAt = "2026-09-27T09:20:00Z";
    }
    atomicPrivateJson(f.prepared.config.aPrimeReceiptFile, f.receipt);
    expect(() => preparePilot(f.configBytes(), source, time)).toThrow(
      "PILOT_A_PRIME_COHORT_CHANGED",
    );
  });

  it.each(["binding", "unknown-root", "unknown-author"])(
    "hash'ler yenilense de bağlam sapmasını reddeder: %s",
    (kind) => {
      const f = manifestFixture();
      const slot = f.manifest.cases[0]!.labels[0]!;
      const file = path.join(f.directory, slot.file);
      const input = JSON.parse(readPrivate(file));
      if (kind === "binding") input.context.perception.recentEntries[0].body = "Başka bir bağlam.";
      if (kind === "unknown-root") input.context.perception.privateIdentity = "hidden";
      if (kind === "unknown-author")
        input.context.perception.recentEntries[0].author.handle = "hidden";
      if (kind !== "binding") input.prompt = buildRuntimePrompt(input.context);
      slot.promptSha256 = hash(input.prompt);
      atomicPrivateJson(file, input);
      slot.fileSha256 = hash(readPrivate(file));
      expect(() => preparePilot(f.configBytes(), source, time)).toThrow();
    },
  );

  it("okuyucu bağlamını izinli alanlardan kurar; yazar nesnesini çıkarır", () => {
    const f = manifestFixture();
    const prepared = preparePilot(f.configBytes(), source, time);
    const text = JSON.stringify(prepared.inputs[0]!.perception);
    expect(text).not.toContain("fixture-other");
    expect(text).not.toContain('"author"');
    expect(text).toContain("Görünür metin.");
  });

  it.each(["effort", "budget", "path", "source", "input", "schema", "duplicate", "privacy"])(
    "%s sapmasını model çağrısından önce reddeder",
    (kind) => {
      const f = manifestFixture();
      if (kind === "effort") f.manifest.effort = "unspecified";
      if (kind === "budget") f.manifest.maxModelCallsTotal = 25;
      if (kind === "path") f.manifest.cases[0]!.labels[0]!.file = "../outside.json";
      if (kind === "source") f.manifest.sourceSha = "e".repeat(40);
      if (kind === "duplicate") f.manifest.cases[1] = f.manifest.cases[0]!;
      if (kind === "input" || kind === "schema") {
        const slot = f.manifest.cases[0]!.labels[0]!;
        const file = path.join(f.directory, slot.file);
        const input = JSON.parse(readPrivate(file));
        input.schema = { changed: true };
        atomicPrivateJson(file, input);
        if (kind === "schema") slot.fileSha256 = hash(readPrivate(file));
      }
      if (kind === "privacy")
        chmodSync(path.join(f.directory, f.manifest.cases[0]!.labels[0]!.file), 0o644);
      expect(() => preparePilot(f.configBytes(), source, time)).toThrow();
    },
  );
});

describe("Opus okuyucu adaptörü (ağsız yerel sahte süreç)", () => {
  function fakeReader(body: string) {
    const directory = temporary();
    const executable = path.join(directory, "fake-reader");
    writeFileSync(
      executable,
      `#!${process.execPath}\nif (process.argv[2] === '--version') { process.stdout.write('test-reader'); process.exit(0); }\nif (process.argv[2] === '--help') { process.stdout.write('--model --effort --safe-mode --tools --strict-mcp-config --mcp-config --disable-slash-commands --setting-sources --no-session-persistence --system-prompt --output-format'); process.exit(0); }\n${body}`,
      { mode: 0o700 },
    );
    return { directory, reader: opusReader(executable, directory, "test-reader") };
  }
  it("araç/MCP kapalı exact Opus 5 çağrısına stdin ile paket verir", async () => {
    const f =
      fakeReader(`const fs = require('node:fs'); let input=''; process.stdin.on('data', c=>input+=c); process.stdin.on('end',()=>{
      fs.writeFileSync('args.json',JSON.stringify(process.argv.slice(2))); fs.writeFileSync('input.txt',input);
      process.stdout.write(JSON.stringify({is_error:false,result:'NO_FINDING',modelUsage:{'claude-opus-5':{}}})); });`);
    expect(await f.reader.invoke("private-packet", 5_000)).toMatchObject({
      model: "claude-opus-5",
      report: "NO_FINDING",
    });
    const args = JSON.parse(readFileSync(path.join(f.directory, "args.json"), "utf8")) as string[];
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(args).toContain("--safe-mode");
    expect(args).toContain("--strict-mcp-config");
    expect(args).not.toContain("private-packet");
    expect(readFileSync(path.join(f.directory, "input.txt"), "utf8")).toBe("private-packet");
  });
  it("endpoint/proxy/Node/Claude ortam sızıntılarını devralmaz", async () => {
    for (const key of [
      "ANTHROPIC_BASE_URL",
      "ANTHROPIC_API_KEY",
      "HTTPS_PROXY",
      "NODE_OPTIONS",
      "CLAUDE_AGENT_SDK_VERSION",
    ])
      vi.stubEnv(key, "injected-value");
    const f =
      fakeReader(`const fs=require('node:fs'); process.stdin.resume(); process.stdin.on('end',()=>{
      fs.writeFileSync('env.json',JSON.stringify(process.env)); process.stdout.write(JSON.stringify({is_error:false,result:'NO_FINDING',modelUsage:{'claude-opus-5':{}}})); });`);
    await f.reader.invoke("packet", 5_000);
    expect(readFileSync(path.join(f.directory, "env.json"), "utf8")).not.toContain(
      "injected-value",
    );
  });

  it("desteklenmeyen okuyucu argümanını model çalıştırmadan yakalar", async () => {
    const f = fakeReader("throw new Error('must not run model');");
    const file = path.join(f.directory, "fake-reader");
    writeFileSync(file, readFileSync(file, "utf8").replace("--safe-mode", "--unsupported"));
    await expect(f.reader.inspect()).rejects.toThrow("PILOT_READER_ARGUMENT_UNSUPPORTED");
  });

  it("başka modelden raporu reddeder", async () => {
    const f = fakeReader(
      `process.stdin.resume(); process.stdin.on('end',()=>process.stdout.write(JSON.stringify({is_error:false,result:'GO',modelUsage:{'claude-opus-5.5':{}}})));`,
    );
    await expect(f.reader.invoke("packet", 5_000)).rejects.toThrow("PILOT_READER_MODEL_CHANGED");
  });
  it("zaman aşımında yalnız kendi sürecini kapatıp sonucunu bekler", async () => {
    const f = fakeReader("process.stdin.resume(); setInterval(()=>{},1000);");
    await expect(f.reader.invoke("packet", 300)).rejects.toThrow("PILOT_READER_INCOMPLETE");
  });

  it("lider çıkınca kendi grubundaki torun süreci de bırakmaz", async () => {
    const f = fakeReader(`const fs=require('node:fs'); const cp=require('node:child_process');
      const child=cp.spawn(process.execPath,['-e','setTimeout(()=>process.exit(0),6000); setInterval(()=>{},1000)'],{stdio:'ignore'});
      fs.writeFileSync('descendant.pid',String(child.pid)); process.stdin.resume();
      process.stdin.on('end',()=>process.stdout.write(JSON.stringify({is_error:false,result:'NO_FINDING',modelUsage:{'claude-opus-5':{}}}),()=>process.exit(0)));`);
    await f.reader.invoke("packet", 5_000);
    const pid = Number(readFileSync(path.join(f.directory, "descendant.pid"), "utf8"));
    await vi.waitFor(() => {
      let status: string;
      try {
        status = readFileSync(`/proc/${pid}/status`, "utf8");
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
          return;
        throw error;
      }
      expect(status).toMatch(/State:\s+[ZX]/u);
    });
  });
});
