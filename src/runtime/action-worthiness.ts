import { z } from "zod";
import { isSafeLifeLedgerText } from "@/modules/agents/domain/life-ledger-safety";
import type { RuntimeDecision } from "@/runtime/output";

const displaySafeText = z.string().trim().min(1).max(500).refine(isSafeLifeLedgerText);

const runtimeActionWorthinessEvaluationSchema = z
  .object({
    sequence: z.number().int().positive(),
    decision: z.enum(["ACCEPT", "REJECT"]),
    safeReason: displaySafeText,
  })
  .strict();

export const runtimeActionWorthinessVerdictSchema = z
  .object({
    verdict: z.enum(["ACT", "NO_ACTION"]),
    confidence: z.number().min(0).max(1),
    evaluations: z.array(runtimeActionWorthinessEvaluationSchema).min(1).max(50),
    selectedSequences: z
      .array(z.number().int().positive())
      .max(50)
      .refine((values) => new Set(values).size === values.length, {
        message: "selectedSequences benzersiz olmalıdır.",
      }),
    safeReason: displaySafeText,
  })
  .strict()
  .superRefine((value, context) => {
    const evaluated = new Set(value.evaluations.map(({ sequence }) => sequence));
    if (evaluated.size !== value.evaluations.length)
      context.addIssue({
        code: "custom",
        path: ["evaluations"],
        message: "Her candidate sequence tam bir kez değerlendirilmelidir.",
      });
    const accepted = value.evaluations
      .filter(({ decision }) => decision === "ACCEPT")
      .map(({ sequence }) => sequence)
      .sort((left, right) => left - right);
    const selected = [...value.selectedSequences].sort((left, right) => left - right);
    if (JSON.stringify(accepted) !== JSON.stringify(selected))
      context.addIssue({
        code: "custom",
        path: ["selectedSequences"],
        message: "selectedSequences tam olarak ACCEPT değerlendirmelerini içermelidir.",
      });
    if (value.verdict === "ACT" && selected.length === 0)
      context.addIssue({
        code: "custom",
        path: ["selectedSequences"],
        message: "ACT verdict en az bir candidate seçmelidir.",
      });
    if (value.verdict === "NO_ACTION" && selected.length > 0)
      context.addIssue({
        code: "custom",
        path: ["selectedSequences"],
        message: "NO_ACTION verdict candidate seçemez.",
      });
  });

export const runtimeActionWorthinessVerdictJsonSchema: Record<string, unknown> = Object.fromEntries(
  Object.entries(z.toJSONSchema(runtimeActionWorthinessVerdictSchema)).filter(
    ([key]) => key !== "$schema",
  ),
);

export type RuntimeActionWorthinessVerdict = z.infer<typeof runtimeActionWorthinessVerdictSchema>;

export function parseRuntimeActionWorthinessVerdict(
  output: unknown,
  candidateSequences: number[],
): RuntimeActionWorthinessVerdict {
  const verdict = runtimeActionWorthinessVerdictSchema.parse(output);
  const expected = [...candidateSequences].sort((left, right) => left - right);
  const evaluated = verdict.evaluations
    .map(({ sequence }) => sequence)
    .sort((left, right) => left - right);
  if (JSON.stringify(evaluated) !== JSON.stringify(expected))
    throw new Error("ACTION_WORTHINESS_CANDIDATE_SET_MISMATCH");
  return verdict;
}

export function applyRuntimeActionWorthinessVerdict(
  decision: RuntimeDecision,
  verdict: RuntimeActionWorthinessVerdict,
): RuntimeDecision {
  const finalJournalSequence = Math.max(0, ...decision.decisionJournal.map(({ seq }) => seq)) + 1;
  const selectedOptionSeqs = [
    ...new Set(
      decision.actions.flatMap(({ selectedOptionSeq }) =>
        selectedOptionSeq === null ? [] : [selectedOptionSeq],
      ),
    ),
  ].slice(0, 20);
  const finalJournal =
    decision.decisionJournal.length < 100
      ? [
          ...decision.decisionJournal,
          {
            seq: finalJournalSequence,
            kind:
              verdict.verdict === "ACT"
                ? ("OPTION_SELECTED" as const)
                : ("OPTION_REJECTED" as const),
            subject: "final action-worthiness",
            summary: verdict.safeReason,
            confidence: verdict.confidence,
            evidenceIds: [],
            causedBySeqs: selectedOptionSeqs,
          },
        ]
      : decision.decisionJournal;
  if (verdict.verdict === "ACT") {
    const selected = new Set(verdict.selectedSequences);
    const derivedCount =
      decision.beliefDeltas.length +
      decision.relationshipDeltas.length +
      decision.sourceProposals.length;
    if (derivedCount > decision.actions.length)
      throw new Error("ACTION_WORTHINESS_DERIVED_ACTION_SET_INVALID");
    const derivedActions =
      derivedCount === 0 ? [] : decision.actions.slice(decision.actions.length - derivedCount);
    let cursor = 0;
    const beliefActions = derivedActions.slice(cursor, (cursor += decision.beliefDeltas.length));
    const relationshipActions = derivedActions.slice(
      cursor,
      (cursor += decision.relationshipDeltas.length),
    );
    const sourceActions = derivedActions.slice(cursor, cursor + decision.sourceProposals.length);
    return {
      ...decision,
      decisionJournal: finalJournal,
      actions: decision.actions
        .filter(({ sequence }) => selected.has(sequence))
        .map((action) => ({
          ...action,
          ...(finalJournal === decision.decisionJournal
            ? {}
            : { selectedOptionSeq: finalJournalSequence }),
        })),
      beliefDeltas: decision.beliefDeltas.filter((_, index) =>
        selected.has(beliefActions[index]!.sequence),
      ),
      relationshipDeltas: decision.relationshipDeltas.filter((_, index) =>
        selected.has(relationshipActions[index]!.sequence),
      ),
      sourceProposals: decision.sourceProposals.filter((_, index) =>
        selected.has(sourceActions[index]!.sequence),
      ),
      safeRunSummary: {
        ...decision.safeRunSummary,
        operationSummary: "Final action-worthiness değerlendirmesi uygulanacak adayları seçti.",
        shortRationale: verdict.safeReason,
      },
    };
  }

  const actionSequence = Math.max(0, ...decision.actions.map(({ sequence }) => sequence)) + 1;
  return {
    ...decision,
    decisionJournal: finalJournal,
    actions: [
      {
        sequence: actionSequence,
        actionType: "NO_ACTION",
        desire: 0,
        expectedOutcome: "Bu run dış dünyada bir state değişikliği oluşturmayacak.",
        selectedOptionSeq: null,
        safeReason: verdict.safeReason,
        input: {},
      },
    ],
    beliefDeltas: [],
    relationshipDeltas: [],
    sourceProposals: [],
    safeRunSummary: {
      ...decision.safeRunSummary,
      operationSummary: "Final action-worthiness değerlendirmesi bütün adayları reddetti.",
      shortRationale: verdict.safeReason,
    },
  };
}
