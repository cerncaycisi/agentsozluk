import assert from "node:assert/strict";
import path from "node:path";
import { z } from "zod";
import { contextResponseSchema } from "../../src/runtime/control-plane-client";
import { runtimeNormalDecisionWireJsonSchema } from "../../src/runtime/output";
import { RUNTIME_PROMPT_PROFILE_HASH } from "../../src/runtime/prompt-profile";
import { buildRuntimePrompt } from "../../src/runtime/worker";
import { seedPersonaSchema } from "../../src/modules/agents/personas/schema";
import { renderPersonaPrompt } from "../../src/modules/agents/personas/prompt-renderer";
import { hash, privateDirectory, readPrivate } from "../contract-pilot/files";
import { assertPilotWindow, pilotConfigSchema } from "../contract-pilot/input";
import { readerPerception } from "../contract-pilot/reader-context";

const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const absolute = z.string().refine((x) => path.isAbsolute(x) && path.normalize(x) === x);
export const personaPilotConfigSchema = pilotConfigSchema.extend({
  baselineFile: absolute,
  keyFile: absolute,
  keySha256: digest,
});
export type PersonaPilotConfig = z.infer<typeof personaPilotConfigSchema>;
export type PersonaPhase = "development" | "holdout";
const phaseSchema = z.enum(["development", "holdout"]);
const caseId = z.string().regex(/^case-[a-f0-9]{12}$/u);
const manifestSchema = z.object({
  version: z.literal(2),
  sourceSha: z.string().regex(/^[a-f0-9]{40}$/u),
  seed: z.literal("p2-20261004-v1"),
  sourceSnapshotSha256: z.literal(
    "d1f9c44fa356155565ffca2948be0a155d003cc8ff492a1c7ca81935cfc5fd8b",
  ),
  runtimeProfileHash: digest,
  builderSha256: digest,
  scope: z.literal("PERSONA_DECISION_PILOT"),
  model: z.literal("gpt-5.6-luna"),
  effort: z.literal("max"),
  runtimeCalls: z.literal(0),
  maxRuntimeCalls: z.literal(24),
  maxReaderCalls: z.literal(2),
  maxElapsedMinutes: z.literal(90),
  pairs: z
    .array(
      z.object({
        blindCase: caseId,
        phase: phaseSchema,
        writerAlias: z.string().regex(/^writer-[1-6]$/u),
        slots: z
          .array(
            z.object({
              label: z.string(),
              file: z.string(),
              fileSha256: digest,
              promptSha256: digest,
            }),
          )
          .length(2),
      }),
    )
    .length(12),
});
export interface PersonaPair {
  caseId: string;
  phase: PersonaPhase;
  newSlot: "A" | "B";
  preferences: Record<string, unknown>;
  perception: Record<string, unknown>;
  inputs: { label: string; runId: string; prompt: string; schema: Record<string, unknown> }[];
}
export interface PreparedPersonaPilot {
  config: PersonaPilotConfig;
  fingerprint: string;
  pairs: PersonaPair[];
}

export function preparePersonaPilot(
  configBytes: string,
  sourceSha: string,
  now: number,
): PreparedPersonaPilot {
  const config = personaPilotConfigSchema.parse(JSON.parse(configBytes));
  assertPilotWindow(config, sourceSha, now);
  privateDirectory(config.manifestDirectory);
  const manifestBytes = readPrivate(path.join(config.manifestDirectory, "manifest.json"));
  if (hash(manifestBytes) !== config.manifestSha256) throw new Error("PILOT_INPUT_CHANGED");
  const manifest = manifestSchema.parse(JSON.parse(manifestBytes));
  if (
    manifest.sourceSha !== sourceSha ||
    manifest.runtimeProfileHash !== RUNTIME_PROMPT_PROFILE_HASH
  )
    throw new Error("PILOT_SOURCE_CHANGED");
  if (hash(readPrivate(path.join(config.manifestDirectory, "build.ts"))) !== manifest.builderSha256)
    throw new Error("PILOT_INPUT_CHANGED");
  const baselineBytes = readPrivate(config.baselineFile),
    keyBytes = readPrivate(config.keyFile);
  if (hash(baselineBytes) !== manifest.sourceSnapshotSha256 || hash(keyBytes) !== config.keySha256)
    throw new Error("PILOT_INPUT_CHANGED");
  const baseline = z
    .object({
      profiles: z.array(
        z.object({
          username: z.string(),
          version: z.number(),
          renderedPrompt: z.string(),
          persona: seedPersonaSchema,
        }),
      ),
    })
    .parse(JSON.parse(baselineBytes));
  const key = z
    .object({
      pairs: z.array(z.object({ label: z.string(), arm: z.enum(["old", "new"]) })).length(24),
    })
    .parse(JSON.parse(keyBytes));
  const arms = new Map(key.pairs.map((item) => [item.label, item.arm]));
  if (arms.size !== 24) throw new Error("PILOT_PERSONA_KEY_INVALID");
  const preferencesKeys = [
    "coreValues",
    "epistemicApproach",
    "persuasionConditions",
    "valuedContent",
    "dislikedBehaviors",
    "boredomConditions",
    "humor",
    "conflict",
    "relationshipTendencies",
  ] as const;
  const seen = new Set<string>();
  const contextPhases = new Map<PersonaPhase, Set<string>>();
  const contextRuns = new Map<string, { run: string; count: number }>();
  const pairs: PersonaPair[] = [];
  const writers = new Map<PersonaPhase, Map<string, string>>();
  for (const item of manifest.pairs) {
    if (seen.has(item.blindCase)) throw new Error("PILOT_DUPLICATE_CASE");
    seen.add(item.blindCase);
    privateDirectory(path.join(config.manifestDirectory, item.phase));
    const contexts = [],
      inputs: PersonaPair["inputs"] = [];
    for (const [index, slot] of item.slots.entries()) {
      const label = `${item.blindCase}-${index === 0 ? "A" : "B"}`;
      if (slot.label !== label || slot.file !== `${item.phase}/${label}.json` || !arms.has(label))
        throw new Error("PILOT_INPUT_PATH_INVALID");
      const bytes = readPrivate(path.join(config.manifestDirectory, slot.file));
      if (hash(bytes) !== slot.fileSha256) throw new Error("PILOT_INPUT_CHANGED");
      const input = z
        .object({
          label: z.string(),
          prompt: z.string(),
          context: contextResponseSchema,
          schema: z.record(z.string(), z.unknown()),
        })
        .parse(JSON.parse(bytes));
      if (
        input.label !== label ||
        hash(input.prompt) !== slot.promptSha256 ||
        input.context.run.runType !== "NORMAL_WAKE" ||
        input.prompt !== buildRuntimePrompt(input.context)
      )
        throw new Error("PILOT_PROMPT_CONTEXT_MISMATCH");
      assert.deepEqual(input.schema, runtimeNormalDecisionWireJsonSchema, "PILOT_SCHEMA_CHANGED");
      const original = baseline.profiles.find(
        (profile) => profile.username === input.context.agent.username,
      );
      if (!original || original.version !== input.context.persona.version)
        throw new Error("PILOT_PERSONA_BASELINE_CHANGED");
      assert.deepEqual(
        input.context.persona.document,
        original.persona,
        "PILOT_PERSONA_BASELINE_CHANGED",
      );
      const expected =
        arms.get(label) === "new" ? renderPersonaPrompt(original.persona) : original.renderedPrompt;
      if (input.context.persona.renderedPrompt !== expected)
        throw new Error("PILOT_PERSONA_RENDERER_CHANGED");
      if (
        Object.keys(input.context.perception).some(
          (key) => !["observedAt", "recentEntries"].includes(key),
        )
      )
        throw new Error("PILOT_PERSONA_CONTEXT_SCOPE_CHANGED");
      contexts.push(input.context);
      inputs.push({
        label,
        runId: input.context.run.id,
        prompt: input.prompt,
        schema: input.schema,
      });
    }
    if (arms.get(inputs[0]!.label) === arms.get(inputs[1]!.label))
      throw new Error("PILOT_PERSONA_KEY_INVALID");
    assert.deepEqual(
      { ...contexts[0], persona: { ...contexts[0]!.persona, renderedPrompt: null } },
      { ...contexts[1], persona: { ...contexts[1]!.persona, renderedPrompt: null } },
      "PILOT_PERSONA_PAIR_CHANGED",
    );
    const context = contexts[0]!;
    const persona = seedPersonaSchema.parse(context.persona.document);
    const phaseWriters = writers.get(item.phase) ?? new Map<string, string>();
    if (phaseWriters.has(item.writerAlias)) throw new Error("PILOT_PERSONA_CASE_COUNTS_INVALID");
    phaseWriters.set(item.writerAlias, context.agent.username);
    writers.set(item.phase, phaseWriters);
    const contextsSeen = contextPhases.get(item.phase) ?? new Set<string>();
    const perceptionHash = hash(JSON.stringify(context.perception));
    const shared = contextRuns.get(perceptionHash);
    const run = JSON.stringify(context.run);
    if (shared && shared.run !== run) throw new Error("PILOT_PERSONA_RUN_VARIATION_CHANGED");
    contextRuns.set(perceptionHash, { run, count: (shared?.count ?? 0) + 1 });
    contextsSeen.add(perceptionHash);
    contextPhases.set(item.phase, contextsSeen);
    pairs.push({
      caseId: item.blindCase,
      phase: item.phase,
      newSlot: arms.get(inputs[0]!.label) === "new" ? "A" : "B",
      inputs,
      preferences: Object.fromEntries(preferencesKeys.map((key) => [key, persona[key]])),
      perception: readerPerception(context.perception),
    });
  }
  for (const phase of ["development", "holdout"] as const) {
    const group = pairs.filter((pair) => pair.phase === phase);
    if (
      group.length !== 6 ||
      group.filter((pair) => pair.newSlot === "A").length !== 3 ||
      new Set(writers.get(phase)?.values()).size !== 6 ||
      contextPhases.get(phase)?.size !== 3
    )
      throw new Error("PILOT_PERSONA_CASE_COUNTS_INVALID");
  }
  if ([...contextRuns.values()].some((item) => item.count !== 2))
    throw new Error("PILOT_PERSONA_CASE_COUNTS_INVALID");
  assert.deepEqual(
    writers.get("development"),
    writers.get("holdout"),
    "PILOT_PERSONA_WRITERS_CHANGED",
  );
  if (
    [...contextPhases.get("development")!].some((value) => contextPhases.get("holdout")!.has(value))
  )
    throw new Error("PILOT_PERSONA_HOLDOUT_OVERLAP");
  return { config, fingerprint: hash(configBytes), pairs };
}
