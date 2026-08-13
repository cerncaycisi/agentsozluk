import { chmod, writeFile } from "node:fs/promises";
import path from "node:path";
import { z, type ZodError } from "zod";
import {
  RuntimeProviderCancelledError,
  RuntimeProviderExecutionError,
  runtimeProviderExecutionSafeCodes,
  RuntimeProviderTimeoutError,
} from "@/runtime/provider";

export const capacityBenchmarkScenarioNames = [
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
] as const;

const benchmarkDiagnosticIssueCodes = [
  "INVALID_TYPE",
  "TOO_BIG",
  "TOO_SMALL",
  "INVALID_FORMAT",
  "NOT_MULTIPLE_OF",
  "UNRECOGNIZED_KEYS",
  "INVALID_UNION",
  "INVALID_KEY",
  "INVALID_ELEMENT",
  "INVALID_VALUE",
  "CUSTOM",
] as const;

export const benchmarkDiagnosticSafeCodes = [
  "OK",
  "CODEX_TIMEOUT",
  "CODEX_CANCELLED",
  ...runtimeProviderExecutionSafeCodes,
  "CODEX_DECISION_OUTPUT_INVALID",
  "CODEX_ACTION_WORTHINESS_OUTPUT_INVALID",
  "ACTION_WORTHINESS_CANDIDATE_SET_MISMATCH",
  "BENCHMARK_STAGE_FAILED",
] as const;

const safePathPattern = /^\$(?:(?:\.[A-Za-z][A-Za-z0-9_]{0,63})|(?:\[(?:\d{1,4}|\*)\]))*$/u;
const safePathSegments: ReadonlySet<string> = new Set([
  "actions",
  "beliefDeltas",
  "body",
  "causedBySeqs",
  "claimProvenance",
  "confidence",
  "curiosity",
  "decision",
  "decisionJournal",
  "desire",
  "disagreement",
  "evaluations",
  "evidenceIds",
  "evidenceSummary",
  "expectedOutcome",
  "familiarity",
  "fatigue",
  "interest",
  "items",
  "kind",
  "memoryCandidates",
  "observations",
  "provenance",
  "relationshipDeltas",
  "safeReason",
  "safeSummary",
  "salience",
  "selectedOptionSeq",
  "selectedSequences",
  "seq",
  "sequence",
  "shortRationale",
  "sourceProposals",
  "sourceType",
  "state",
  "statement",
  "subject",
  "subjectId",
  "subjectType",
  "summary",
  "targetId",
  "title",
  "topicFatigue",
  "topicKey",
  "topics",
  "trust",
  "type",
  "url",
  "userId",
  "verdict",
]);

const benchmarkDiagnosticIssueSchema = z
  .object({
    code: z.enum(benchmarkDiagnosticIssueCodes),
    path: z
      .string()
      .max(160)
      .regex(safePathPattern)
      .refine(
        (value) =>
          [...value.matchAll(/\.([A-Za-z][A-Za-z0-9_]*)/gu)].every(([, field]) =>
            safePathSegments.has(field ?? ""),
          ),
        { message: "Diagnostic path yalnız allowlisted şema alanlarını içerebilir." },
      ),
  })
  .strict();

export const capabilityBenchmarkStageDiagnosticSchema = z
  .object({
    stage: z.enum(["DECISION_PRIMARY", "DECISION_REPAIR", "ACTION_WORTHINESS"]),
    outcome: z.enum(["PASS", "SCHEMA_INVALID", "PROVIDER_FAILED"]),
    safeCode: z.enum(benchmarkDiagnosticSafeCodes),
    issues: z.array(benchmarkDiagnosticIssueSchema).max(8),
  })
  .strict()
  .superRefine(({ stage, outcome, safeCode, issues }, context) => {
    const providerFailureCodes: ReadonlySet<CapabilityBenchmarkDiagnosticSafeCode> = new Set([
      "CODEX_TIMEOUT",
      "CODEX_CANCELLED",
      ...runtimeProviderExecutionSafeCodes,
      "BENCHMARK_STAGE_FAILED",
    ]);
    const schemaFailureCodes: ReadonlySet<CapabilityBenchmarkDiagnosticSafeCode> = new Set([
      "CODEX_DECISION_OUTPUT_INVALID",
      "CODEX_ACTION_WORTHINESS_OUTPUT_INVALID",
      "ACTION_WORTHINESS_CANDIDATE_SET_MISMATCH",
    ]);
    const validOutcome =
      (outcome === "PASS" && safeCode === "OK" && issues.length === 0) ||
      (outcome === "PROVIDER_FAILED" &&
        providerFailureCodes.has(safeCode) &&
        issues.length === 0) ||
      (outcome === "SCHEMA_INVALID" && schemaFailureCodes.has(safeCode));
    if (!validOutcome)
      context.addIssue({ code: "custom", message: "Diagnostic outcome/code contract invalid." });
    if (
      outcome === "SCHEMA_INVALID" &&
      ((stage === "ACTION_WORTHINESS" && safeCode === "CODEX_DECISION_OUTPUT_INVALID") ||
        (stage !== "ACTION_WORTHINESS" && safeCode !== "CODEX_DECISION_OUTPUT_INVALID"))
    )
      context.addIssue({ code: "custom", message: "Diagnostic stage/code contract invalid." });
  });

export const capabilityBenchmarkScenarioDiagnosticSchema = z
  .object({
    scenario: z.enum(capacityBenchmarkScenarioNames),
    lane: z.union([z.literal(1), z.literal(2)]).nullable(),
    finalStatus: z.enum(["PASS", "FAIL"]),
    repairAttempted: z.boolean(),
    stages: z.array(capabilityBenchmarkStageDiagnosticSchema).min(1).max(3),
  })
  .strict()
  .superRefine(({ finalStatus, repairAttempted, stages }, context) => {
    const stageNames = stages.map(({ stage }) => stage);
    const repairIndex = stageNames.indexOf("DECISION_REPAIR");
    const worthinessIndex = stageNames.indexOf("ACTION_WORTHINESS");
    if (stageNames[0] !== "DECISION_PRIMARY" || new Set(stageNames).size !== stageNames.length)
      context.addIssue({ code: "custom", path: ["stages"], message: "Stage order invalid." });
    if (
      repairAttempted !== repairIndex >= 0 ||
      (repairIndex >= 0 && (repairIndex !== 1 || stages[0]?.outcome !== "SCHEMA_INVALID"))
    )
      context.addIssue({
        code: "custom",
        path: ["repairAttempted"],
        message: "Repair stage contract invalid.",
      });
    if (
      worthinessIndex >= 0 &&
      (worthinessIndex !== stages.length - 1 ||
        stages[repairIndex >= 0 ? repairIndex : 0]?.outcome !== "PASS")
    )
      context.addIssue({
        code: "custom",
        path: ["stages"],
        message: "Action-worthiness stage contract invalid.",
      });
    const repairSucceeded = repairIndex >= 0 && stages[repairIndex]?.outcome === "PASS";
    const unresolvedFailure = stages.some(
      ({ stage, outcome }) =>
        outcome !== "PASS" &&
        !(stage === "DECISION_PRIMARY" && outcome === "SCHEMA_INVALID" && repairSucceeded),
    );
    const expectedFinalStatus =
      !unresolvedFailure && stages.at(-1)?.outcome === "PASS" ? "PASS" : "FAIL";
    if (finalStatus !== expectedFinalStatus)
      context.addIssue({
        code: "custom",
        path: ["finalStatus"],
        message: "Final status does not match terminal stage evidence.",
      });
  });

export const capabilityBenchmarkDiagnosticsSchema = z
  .object({
    version: z.literal(1),
    mode: z.enum(["capacity", "concurrency"]),
    terminalCode: z.enum(["BENCHMARK_COMPLETED", "BENCHMARK_EXHAUSTED", "BENCHMARK_FAILED"]),
    scenarios: z.array(capabilityBenchmarkScenarioDiagnosticSchema).max(10),
  })
  .strict()
  .superRefine(({ mode, scenarios }, context) => {
    if (mode === "concurrency" && scenarios.length > 2)
      context.addIssue({
        code: "custom",
        path: ["scenarios"],
        message: "Concurrency diagnostics en fazla iki lane içerebilir.",
      });
    if (mode === "capacity" && scenarios.some(({ lane }) => lane !== null))
      context.addIssue({
        code: "custom",
        path: ["scenarios"],
        message: "Capacity diagnostics lane taşımamalıdır.",
      });
    if (mode === "concurrency" && scenarios.some(({ lane }) => lane === null))
      context.addIssue({
        code: "custom",
        path: ["scenarios"],
        message: "Concurrency diagnostics exact lane taşımalıdır.",
      });
    if (new Set(scenarios.map(({ scenario }) => scenario)).size !== scenarios.length)
      context.addIssue({
        code: "custom",
        path: ["scenarios"],
        message: "Diagnostic scenario adları tekil olmalıdır.",
      });
    const lanes = scenarios.flatMap(({ lane }) => (lane === null ? [] : [lane]));
    if (new Set(lanes).size !== lanes.length)
      context.addIssue({
        code: "custom",
        path: ["scenarios"],
        message: "Concurrency diagnostic lane değerleri tekil olmalıdır.",
      });
    for (const [index, scenario] of scenarios.entries()) {
      const hasRepairStage = scenario.stages.some(({ stage }) => stage === "DECISION_REPAIR");
      if (scenario.repairAttempted !== hasRepairStage)
        context.addIssue({
          code: "custom",
          path: ["scenarios", index, "repairAttempted"],
          message: "Diagnostic repair flag/stage contract invalid.",
        });
    }
  });

export type CapabilityBenchmarkStageDiagnostic = z.infer<
  typeof capabilityBenchmarkStageDiagnosticSchema
>;
export type CapabilityBenchmarkScenarioDiagnostic = z.infer<
  typeof capabilityBenchmarkScenarioDiagnosticSchema
>;
export type CapabilityBenchmarkDiagnostics = z.infer<typeof capabilityBenchmarkDiagnosticsSchema>;
export type CapabilityBenchmarkDiagnosticSafeCode = (typeof benchmarkDiagnosticSafeCodes)[number];

type ZodIssueLike = {
  code?: unknown;
  path?: unknown;
  errors?: unknown;
};

function diagnosticIssueCode(value: unknown): (typeof benchmarkDiagnosticIssueCodes)[number] {
  const normalized = typeof value === "string" ? value.toUpperCase() : "CUSTOM";
  return benchmarkDiagnosticIssueCodes.includes(
    normalized as (typeof benchmarkDiagnosticIssueCodes)[number],
  )
    ? (normalized as (typeof benchmarkDiagnosticIssueCodes)[number])
    : "CUSTOM";
}

function diagnosticPath(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return "$";
  let rendered = "$";
  for (const segment of value.slice(0, 8)) {
    if (typeof segment === "string" && safePathSegments.has(segment)) {
      rendered += `.${segment}`;
    } else if (
      typeof segment === "number" &&
      Number.isSafeInteger(segment) &&
      segment >= 0 &&
      segment <= 9999
    ) {
      rendered += `[${segment}]`;
    } else {
      rendered += "[*]";
    }
  }
  if (value.length > 8) rendered += "[*]";
  return rendered.length <= 160 && safePathPattern.test(rendered) ? rendered : "$";
}

export function safeBenchmarkZodIssues(error: ZodError): Array<{
  code: (typeof benchmarkDiagnosticIssueCodes)[number];
  path: string;
}> {
  const collected: Array<{ code: (typeof benchmarkDiagnosticIssueCodes)[number]; path: string }> =
    [];
  const visit = (value: unknown, depth: number): void => {
    if (depth > 6 || !value || typeof value !== "object" || Array.isArray(value)) return;
    const issue = value as ZodIssueLike;
    if (issue.code !== undefined)
      collected.push({ code: diagnosticIssueCode(issue.code), path: diagnosticPath(issue.path) });
    if (Array.isArray(issue.errors))
      for (const branch of issue.errors.slice(0, 8)) {
        if (Array.isArray(branch))
          for (const nested of branch.slice(0, 8)) visit(nested, depth + 1);
        else visit(branch, depth + 1);
      }
  };
  for (const issue of error.issues.slice(0, 16)) visit(issue, 0);
  return [...new Map(collected.map((issue) => [`${issue.code}|${issue.path}`, issue])).values()]
    .sort((left, right) =>
      `${left.path}|${left.code}`.localeCompare(`${right.path}|${right.code}`, "en"),
    )
    .slice(0, 8);
}

export function safeBenchmarkProviderCode(error: unknown): CapabilityBenchmarkDiagnosticSafeCode {
  if (error instanceof RuntimeProviderTimeoutError) return "CODEX_TIMEOUT";
  if (error instanceof RuntimeProviderCancelledError) return "CODEX_CANCELLED";
  if (error instanceof RuntimeProviderExecutionError) return error.safeCode;
  return "BENCHMARK_STAGE_FAILED";
}

export function createCapabilityBenchmarkDiagnosticCollector(
  mode: CapabilityBenchmarkDiagnostics["mode"],
) {
  const scenarios: CapabilityBenchmarkScenarioDiagnostic[] = [];
  return {
    record(value: CapabilityBenchmarkScenarioDiagnostic): void {
      scenarios.push(capabilityBenchmarkScenarioDiagnosticSchema.parse(value));
    },
    document(
      terminalCode: CapabilityBenchmarkDiagnostics["terminalCode"],
    ): CapabilityBenchmarkDiagnostics {
      return capabilityBenchmarkDiagnosticsSchema.parse({
        version: 1,
        mode,
        terminalCode,
        scenarios,
      });
    },
  };
}

export async function writeCapabilityBenchmarkDiagnostics(
  outputPath: string,
  diagnostics: CapabilityBenchmarkDiagnostics,
): Promise<void> {
  if (!path.isAbsolute(outputPath) || path.normalize(outputPath) !== outputPath)
    throw new Error("CAPABILITY_DIAGNOSTICS_PATH_INVALID");
  const serialized = `${JSON.stringify(capabilityBenchmarkDiagnosticsSchema.parse(diagnostics), null, 2)}\n`;
  await writeFile(outputPath, serialized, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await chmod(outputPath, 0o600);
}
