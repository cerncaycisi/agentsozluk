import assert from "node:assert/strict";
import path from "node:path";
import { z } from "zod";
import { runtimeNormalDecisionWireJsonSchema } from "../../src/runtime/output";
import { RUNTIME_PROMPT_PROFILE_HASH } from "../../src/runtime/prompt-profile";
import { contextResponseSchema } from "../../src/runtime/control-plane-client";
import { buildRuntimePrompt } from "../../src/runtime/worker";
import { hash, privateDirectory, readPrivate } from "./files";
import { AUTHORITY_END } from "./policy";
import { readerPerception } from "./reader-context";

const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const sha = z.string().regex(/^[a-f0-9]{40}$/u);
const label = z.string().regex(/^case-[a-f0-9]{12}-[AB]$/u);
const absolutePath = z
  .string()
  .refine((value) => path.isAbsolute(value) && path.normalize(value) === value);
export const pilotConfigSchema = z
  .object({
    manifestDirectory: absolutePath,
    manifestSha256: sha256,
    sourceSha: sha,
    model: z.literal("gpt-5.6-luna"),
    reasoningEffort: z.literal("max"),
    providerVersion: z.string().min(1).max(100),
    aPrimeReceiptFile: absolutePath,
    aPrimeReceiptSha256: sha256,
    aPrimeProductionSha: sha,
    codex: z
      .object({
        executable: absolutePath,
        sandboxExecutable: absolutePath,
        credentialFile: absolutePath,
      })
      .strict(),
    readerExecutable: absolutePath,
    readerVersion: z.string().min(1).max(100),
  })
  .strict();
export type PilotConfig = z.infer<typeof pilotConfigSchema>;

const manifestSchema = z.object({
  version: z.literal(2),
  sourceSha: sha,
  runtimeProfileHash: sha256,
  criteriaSha256: sha256,
  builderSha256: sha256,
  scope: z.literal("DECISION_ONLY"),
  model: z.literal("gpt-5.6-luna"),
  effort: z.literal("max"),
  calls: z.literal(0),
  networkCalls: z.literal(0),
  databaseWrites: z.literal(0),
  maxModelCallsTotal: z.literal(24),
  maxRuntimeCalls: z.literal(23),
  readerCallsReserved: z.literal(1),
  maxElapsedMinutes: z.literal(90),
  plannedDecisionCalls: z.literal(18),
  remainingRuntimeCallsReservedForTechnicalFailure: z.literal(5),
  noAutomaticBudgetResetAfterCodeChange: z.literal(true),
  allJudgeTimeInside90Minutes: z.literal(true),
  readOnlyProviderOnly: z.literal(true),
  noActionExecutorOrControlPlane: z.literal(true),
  cases: z
    .array(
      z.object({
        caseId: z.string().regex(/^case-[a-f0-9]{12}$/u),
        feature: z.enum(["P3", "P4", "P5"]),
        labels: z
          .array(z.object({ label, file: z.string(), fileSha256: sha256, promptSha256: sha256 }))
          .length(2),
      }),
    )
    .length(9),
});

export interface PilotInput {
  label: string;
  feature: "P3" | "P4" | "P5";
  runId: string;
  prompt: string;
  schema: Record<string, unknown>;
  perception: Record<string, unknown>;
}
export interface PreparedPilot {
  config: PilotConfig;
  fingerprint: string;
  inputs: PilotInput[];
  criteria: unknown;
}

export function preparePilot(configBytes: string, sourceSha: string, now: number): PreparedPilot {
  const config = pilotConfigSchema.parse(JSON.parse(configBytes));
  if (sourceSha !== config.sourceSha) throw new Error("PILOT_SOURCE_CHANGED");
  if (now < Date.parse("2026-10-06T10:00:00Z") || now >= AUTHORITY_END)
    throw new Error("PILOT_DATE_GATE_CLOSED");
  const receiptBytes = readPrivate(config.aPrimeReceiptFile);
  if (hash(receiptBytes) !== config.aPrimeReceiptSha256) throw new Error("PILOT_RECEIPT_CHANGED");
  const receipt = z
    .object({
      version: z.literal(1),
      kind: z.literal("A_PRIME_DECISION"),
      productionSha: sha,
      resumedAt: z.iso.datetime(),
      windowEndedAt: z.iso.datetime(),
      concludedAt: z.iso.datetime(),
      decision: z.enum(["ACCEPT", "REJECT", "INCONCLUSIVE"]),
    })
    .parse(JSON.parse(receiptBytes));
  if (
    receipt.productionSha !== config.aPrimeProductionSha ||
    Date.parse(receipt.resumedAt) < Date.parse("2026-10-03T00:00:00Z")
  )
    throw new Error("PILOT_A_PRIME_COHORT_CHANGED");
  if (
    Date.parse(receipt.windowEndedAt) - Date.parse(receipt.resumedAt) < 72 * 3_600_000 ||
    Date.parse(receipt.concludedAt) < Date.parse(receipt.windowEndedAt) ||
    Date.parse(receipt.concludedAt) > now
  )
    throw new Error("PILOT_A_PRIME_WINDOW_INVALID");
  // A′ kararının içeriği operatör kanıtıdır; sunucu metrikleri burada yeniden hesaplanmaz.
  privateDirectory(config.manifestDirectory);
  const manifestBytes = readPrivate(path.join(config.manifestDirectory, "manifest.json"));
  if (hash(manifestBytes) !== config.manifestSha256) throw new Error("PILOT_MANIFEST_CHANGED");
  const manifest = manifestSchema.parse(JSON.parse(manifestBytes));
  if (
    manifest.sourceSha !== sourceSha ||
    manifest.runtimeProfileHash !== RUNTIME_PROMPT_PROFILE_HASH
  )
    throw new Error("PILOT_SOURCE_CHANGED");
  const criteriaBytes = readPrivate(path.join(config.manifestDirectory, "criteria.json"));
  const builderBytes = readPrivate(path.join(config.manifestDirectory, "build.ts"));
  if (
    hash(criteriaBytes) !== manifest.criteriaSha256 ||
    hash(builderBytes) !== manifest.builderSha256
  )
    throw new Error("PILOT_INPUT_CHANGED");
  const inputs: PilotInput[] = [];
  const cases = new Set<string>();
  for (const item of manifest.cases) {
    if (cases.has(item.caseId)) throw new Error("PILOT_DUPLICATE_CASE");
    cases.add(item.caseId);
    for (const [index, slot] of item.labels.entries()) {
      if (
        slot.label !== `${item.caseId}-${index === 0 ? "A" : "B"}` ||
        slot.file !== `${slot.label}.json`
      )
        throw new Error("PILOT_INPUT_PATH_INVALID");
      const bytes = readPrivate(path.join(config.manifestDirectory, slot.file));
      if (hash(bytes) !== slot.fileSha256) throw new Error("PILOT_INPUT_CHANGED");
      const input = z
        .object({
          label,
          prompt: z.string().min(1),
          schema: z.record(z.string(), z.unknown()),
          context: contextResponseSchema,
        })
        .parse(JSON.parse(bytes));
      if (input.label !== slot.label || hash(input.prompt) !== slot.promptSha256)
        throw new Error("PILOT_INPUT_CHANGED");
      assert.deepEqual(input.schema, runtimeNormalDecisionWireJsonSchema, "PILOT_SCHEMA_CHANGED");
      if (
        input.context.run.runType !== "NORMAL_WAKE" ||
        buildRuntimePrompt(input.context) !== input.prompt
      )
        throw new Error("PILOT_PROMPT_CONTEXT_MISMATCH");
      inputs.push({
        label: input.label,
        feature: item.feature,
        runId: input.context.run.id,
        prompt: input.prompt,
        schema: input.schema,
        perception: readerPerception(input.context.perception),
      });
    }
  }
  if (
    inputs.filter((input) => input.feature === "P3").length !== 8 ||
    inputs.filter((input) => input.feature === "P4").length !== 8 ||
    inputs.filter((input) => input.feature === "P5").length !== 2
  )
    throw new Error("PILOT_CASE_COUNTS_INVALID");
  return { config, fingerprint: hash(configBytes), inputs, criteria: JSON.parse(criteriaBytes) };
}
