import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as PilotFiles from "../../../scripts/contract-pilot/files";
import { atomicPrivateJson, hash, readPrivate } from "../../../scripts/contract-pilot/files";
import { preparePersonaPilot } from "../../../scripts/persona-pilot/input";
import { agentPersonaTemplates } from "@/modules/agents/personas/templates";
import { renderPersonaPrompt } from "@/modules/agents/personas/prompt-renderer";
import { buildRuntimePrompt } from "@/runtime/worker";
import { RUNTIME_PROMPT_PROFILE_HASH } from "@/runtime/prompt-profile";
import { runtimeNormalDecisionWireJsonSchema } from "@/runtime/output";
import type { RuntimeContext } from "@/runtime/control-plane-client";

// Üretim P0 içerikleri test deposuna taşınmaz. Yalnız sentetik baseline dosyasının
// bilinen hash'i uyarlanır; diğer bütün hash/şema/renderer/A′ kontrolleri gerçektir.
const synthetic = vi.hoisted(() => ({ baseline: "" }));
vi.mock("../../../scripts/contract-pilot/files", async (importOriginal) => {
  const actual = await importOriginal<typeof PilotFiles>();
  return {
    ...actual,
    hash: (value: string | Buffer) =>
      typeof value === "string" && value === synthetic.baseline
        ? "d1f9c44fa356155565ffca2948be0a155d003cc8ff492a1c7ca81935cfc5fd8b"
        : actual.hash(value),
  };
});
const dirs: string[] = [];
afterEach(() => {
  synthetic.baseline = "";
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const source = "a".repeat(40),
  time = Date.parse("2026-10-06T10:01:00Z");
const uuid = (i: number) => `00000000-0000-4000-8000-${i.toString().padStart(12, "0")}`;
function fixture() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "persona-input-"));
  dirs.push(directory);
  for (const phase of ["development", "holdout"])
    mkdirSync(path.join(directory, phase), { mode: 0o700 });
  const profiles = agentPersonaTemplates.slice(0, 6).map((persona) => ({
    username: persona.username,
    version: 1,
    renderedPrompt: "Eski sentetik persona.",
    persona,
  }));
  const baselineFile = path.join(directory, "baseline.json"),
    keyFile = path.join(directory, "key.json");
  atomicPrivateJson(baselineFile, { profiles });
  synthetic.baseline = readPrivate(baselineFile);
  writeFileSync(path.join(directory, "build.ts"), "// sentetik hazırlayıcı", { mode: 0o600 });
  const receiptFile = path.join(directory, "aprime.json");
  atomicPrivateJson(receiptFile, {
    version: 1,
    kind: "A_PRIME_DECISION",
    productionSha: source,
    resumedAt: "2026-10-03T09:20:00Z",
    windowEndedAt: "2026-10-06T10:00:00Z",
    concludedAt: "2026-10-06T10:00:30Z",
    decision: "INCONCLUSIVE",
  });
  const key: { pairs: { label: string; arm: string }[] } = { pairs: [] };
  const pairs = Array.from({ length: 12 }, (_, i) => {
    const phase = i < 6 ? "development" : "holdout",
      blindCase = `case-${i.toString(16).padStart(12, "0")}`;
    const profile = profiles[i % 6]!,
      topic = Math.floor(i / 2);
    return {
      phase,
      blindCase,
      writerAlias: `writer-${(i % 6) + 1}`,
      slots: ["A", "B"].map((slot, n) => {
        const label = `${blindCase}-${slot}`,
          arm = i % 2 === n ? "new" : "old";
        key.pairs.push({ label, arm });
        const context: RuntimeContext = {
          run: {
            id: uuid(topic + 1),
            runType: "NORMAL_WAKE",
            trigger: "STOCHASTIC_TICK",
            timeoutSeconds: 360,
            desiredEntryMin: 0,
            desiredEntryMax: 3,
            allowTopicCreation: true,
            allowVoting: true,
            allowFollowing: true,
            allowSourceReading: false,
            publishEnabled: true,
            publicWriteEnabled: true,
            runtimeOperatingMode: "NORMAL",
            sourceFetchLimit: 8,
            debugRetentionHours: 0,
            adminInstruction: null,
            cancelRequested: false,
          },
          agent: {
            username: profile.username,
            displayName: profile.persona.displayName,
            publicBio: null,
          },
          persona: {
            version: 1,
            document: profile.persona,
            renderedPrompt:
              arm === "new" ? renderPersonaPrompt(profile.persona) : profile.renderedPrompt,
            behavior: {
              topicCreationTendency: profile.persona.behavior.topicCreationTendency,
              votingTendency: profile.persona.behavior.votingTendency,
              followingTendency: profile.persona.behavior.followingTendency,
            },
            writing: { entryLength: profile.persona.writing.entryLength },
          },
          perception: {
            observedAt: "2026-10-04T10:00:00Z",
            recentEntries: [
              {
                id: uuid(topic + 101),
                body: "Sentetik görünür bağlam.",
                createdAt: "2026-10-04T09:00:00Z",
                topic: { id: uuid(topic + 201), title: `konu ${topic}` },
                author: { id: uuid(301), username: "hidden-author" },
              },
            ],
          },
        };
        const prompt = buildRuntimePrompt(context),
          file = `${phase}/${label}.json`;
        atomicPrivateJson(path.join(directory, file), {
          label,
          prompt,
          context,
          schema: runtimeNormalDecisionWireJsonSchema,
        });
        return {
          label,
          file,
          fileSha256: hash(readPrivate(path.join(directory, file))),
          promptSha256: hash(prompt),
        };
      }),
    };
  });
  const manifest = {
    version: 2,
    sourceSha: source,
    seed: "p2-20261004-v1",
    sourceSnapshotSha256: hash(synthetic.baseline),
    runtimeProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
    builderSha256: hash(readPrivate(path.join(directory, "build.ts"))),
    scope: "PERSONA_DECISION_PILOT",
    model: "gpt-5.6-luna",
    effort: "max",
    runtimeCalls: 0,
    maxRuntimeCalls: 24,
    maxReaderCalls: 2,
    maxElapsedMinutes: 90,
    pairs,
  };
  const configBytes = () => {
    atomicPrivateJson(path.join(directory, "manifest.json"), manifest);
    atomicPrivateJson(keyFile, key);
    return JSON.stringify({
      manifestDirectory: directory,
      manifestSha256: hash(readPrivate(path.join(directory, "manifest.json"))),
      sourceSha: source,
      model: "gpt-5.6-luna",
      reasoningEffort: "max",
      providerVersion: "synthetic",
      aPrimeReceiptFile: receiptFile,
      aPrimeReceiptSha256: hash(readPrivate(receiptFile)),
      aPrimeProductionSha: source,
      codex: {
        executable: "/fake/codex",
        sandboxExecutable: "/fake/bwrap",
        credentialFile: "/fake/auth",
      },
      readerExecutable: "/fake/claude",
      readerVersion: "synthetic",
      baselineFile,
      keyFile,
      keySha256: hash(readPrivate(keyFile)),
    });
  };
  const edit = (i: number, n: number, change: (context: RuntimeContext) => void) => {
    const slot = pairs[i]!.slots[n]!,
      file = path.join(directory, slot.file);
    const input = JSON.parse(readPrivate(file));
    change(input.context);
    input.prompt = buildRuntimePrompt(input.context);
    atomicPrivateJson(file, input);
    slot.fileSha256 = hash(readPrivate(file));
    slot.promptSha256 = hash(input.prompt);
  };
  return {
    directory,
    key,
    manifest,
    configBytes,
    edit,
    prepare: () => preparePersonaPilot(configBytes(), source, time),
  };
}
describe("P2 donmuş girdi bağları", () => {
  it("24 gerçek renderer/şema girdisini okur, kimliği kör karta taşımaz", () => {
    const f = fixture(),
      result = f.prepare();
    expect(result.pairs).toHaveLength(12);
    expect(JSON.stringify(result.pairs[0]!.perception)).not.toContain("hidden-author");
    expect(result.pairs[0]!.preferences).not.toHaveProperty("username");
  });
  it("gerçek tarihte A′ kapısından önce reddeder", () => {
    const f = fixture();
    expect(() =>
      preparePersonaPilot(f.configBytes(), source, Date.parse("2026-10-04T18:00:00Z")),
    ).toThrow("PILOT_DATE_GATE_CLOSED");
  });
  it("P2 paketine amaç/ödül/teknik geri bildirim bağlamı eklenemez", () => {
    const f = fixture();
    f.edit(0, 0, (context) => {
      context.perception.purposes = [];
    });
    expect(f.prepare).toThrow("PILOT_PERSONA_CONTEXT_SCOPE_CHANGED");
  });
  it("fixture hash uyarlaması olmadan sahte baseline kabul edilmez", () => {
    const f = fixture();
    synthetic.baseline = "";
    expect(f.prepare).toThrow("PILOT_INPUT_CHANGED");
  });
  it.each(["source", "budget", "path", "key", "duplicate", "renderer", "persona", "pair", "run"])(
    "yeniden hash'lense de %s sapmasını reddeder",
    (kind) => {
      const f = fixture();
      if (kind === "source") f.manifest.sourceSha = "b".repeat(40);
      if (kind === "budget") f.manifest.maxRuntimeCalls = 25;
      if (kind === "path") f.manifest.pairs[0]!.slots[0]!.file = "../outside.json";
      if (kind === "key") f.key.pairs[0]!.arm = "old";
      if (kind === "duplicate") f.manifest.pairs[1] = f.manifest.pairs[0]!;
      if (kind === "renderer")
        f.edit(0, 0, (context) => {
          context.persona.renderedPrompt = "başka renderer";
        });
      if (kind === "persona")
        f.edit(0, 0, (context) => {
          context.persona.version = 2;
        });
      if (kind === "pair")
        f.edit(0, 0, (context) => {
          context.run.id = uuid(999);
        });
      if (kind === "run")
        for (const slot of [0, 1])
          f.edit(0, slot, (context) => {
            context.run.id = uuid(999);
          });
      expect(f.prepare).toThrow();
    },
  );
});
