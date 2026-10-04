import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { atomicPrivateJson, hash, readPrivate } from "../../../scripts/contract-pilot/files";
import { preparePilot, type PreparedPilot } from "../../../scripts/contract-pilot/input";
import { runContractPilot, type PilotReader } from "../../../scripts/contract-pilot/run";
import { opusReader } from "../../../scripts/contract-pilot/reader";
import { parseRuntimeDecisionOutput, runtimeNormalDecisionWireJsonSchema } from "@/runtime/output";
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
    invoke: vi.fn<PilotReader["invoke"]>(async () => ({
      model: "claude-opus-5" as const,
      report: "NOT_EXERCISED",
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
      calls: 18,
      readerComplete: false,
      status: "INCOMPLETE",
    });
    f.advance(60_000);
    expect(await runContractPilot(f.options)).toMatchObject({ calls: 18, readerComplete: false });
    expect(f.reader.invoke).not.toHaveBeenCalled();
  });

  it("okuyucuya yalnız kalan süreyi verir ve geç sonucu başarı saymaz", async () => {
    const f = fixture();
    let count = 0;
    f.provider.invoke.mockImplementation(async () => {
      if (++count === 18) f.advance(89 * 60_000);
      return f.result;
    });
    f.reader.invoke.mockImplementation(async (_packet, timeout) => {
      expect(timeout).toBe(60_000);
      f.advance(61_000);
      return { model: "claude-opus-5", report: "NO_FINDING" };
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
        if (kind === "clock") f.advance(-1);
        return kind === "provider" ? { ...f.result, version: "changed" } : f.result;
      });
      await expect(runContractPilot(f.options)).rejects.toThrow();
      expect(f.journal().terminalReason).toMatch(/^PILOT_/u);
      f.prepared.fingerprint = "d".repeat(64);
      f.options.prepare = () => f.prepared;
      f.advance(2);
      await expect(runContractPilot(f.options)).rejects.toThrow();
      expect(f.provider.invoke).toHaveBeenCalledTimes(1);
    },
  );

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
        atomicPrivateJson(path.join(f.directory, file), {
          label: input.label,
          prompt: input.prompt,
          schema: input.schema,
          context: { run: { id: input.runId }, perception: input.perception },
        });
        return {
          label: input.label,
          file,
          fileSha256: hash(readPrivate(path.join(f.directory, file))),
          promptSha256: hash(input.prompt),
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
      `#!${process.execPath}\nif (process.argv[2] === '--version') { process.stdout.write('test-reader'); process.exit(0); }\n${body}`,
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
  it("başka modelden raporu reddeder", async () => {
    const f = fakeReader(
      `process.stdin.resume(); process.stdin.on('end',()=>process.stdout.write(JSON.stringify({is_error:false,result:'GO',modelUsage:{'claude-opus-5.5':{}}})));`,
    );
    await expect(f.reader.invoke("packet", 5_000)).rejects.toThrow("PILOT_READER_MODEL_CHANGED");
  });
  it("zaman aşımında yalnız kendi sürecini kapatıp sonucunu bekler", async () => {
    const f = fakeReader("process.stdin.resume(); setInterval(()=>{},1000);");
    await expect(f.reader.invoke("packet", 100)).rejects.toThrow("PILOT_READER_INCOMPLETE");
  });
});
