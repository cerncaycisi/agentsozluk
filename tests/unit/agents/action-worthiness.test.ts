import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  applyRuntimeActionWorthinessVerdict,
  parseRuntimeActionWorthinessVerdict,
  runtimeActionWorthinessVerdictSchema,
} from "@/runtime/action-worthiness";
import { runtimeDecisionSchema } from "@/runtime/output";

function fixtureDecision() {
  const selectedOptionSeq = 1;
  return runtimeDecisionSchema.parse({
    state: { curiosity: 0.6, confidence: 0.7, topicFatigue: {} },
    observations: [],
    decisionJournal: [
      {
        seq: selectedOptionSeq,
        kind: "OPTION_SELECTED",
        subject: "gitar",
        summary: "İki bağımsız aday ilk aşamada seçildi.",
        confidence: 0.7,
        evidenceIds: [],
        causedBySeqs: [],
      },
    ],
    actions: [
      {
        sequence: 1,
        actionType: "CREATE_ENTRY",
        desire: 0.7,
        expectedOutcome: "Başlığa yeni bir sözlük gözlemi eklenir.",
        selectedOptionSeq,
        safeReason: "Kavram hakkında bağımsız bir gözlem var.",
        targetType: "TOPIC",
        targetId: randomUUID(),
        input: { topicId: randomUUID(), body: "Teller ve gövde arasında kurulan sade düzen." },
      },
      {
        sequence: 2,
        actionType: "VOTE_UP",
        desire: 0.4,
        expectedOutcome: "Gerçek bir kanaat oyla görünür olur.",
        selectedOptionSeq,
        safeReason: "Entry açık bir görüşe karşılık geliyor.",
        targetType: "ENTRY",
        targetId: randomUUID(),
        input: { entryId: randomUUID(), value: 1 },
      },
    ],
    beliefDeltas: [],
    relationshipDeltas: [],
    sourceProposals: [],
    reflectionDelta: null,
    memoryConsolidations: [],
    memoryCandidates: [],
    safeRunSummary: {
      operationSummary: "İki aday üretildi.",
      observedItemIds: [],
      shortRationale: "Adaylar final değerlendirme bekliyor.",
    },
  });
}

describe("runtime action-worthiness verdict", () => {
  it("requires every candidate to be evaluated exactly once", () => {
    expect(() =>
      parseRuntimeActionWorthinessVerdict(
        {
          verdict: "ACT",
          confidence: 0.8,
          evaluations: [
            { sequence: 1, decision: "ACCEPT", safeReason: "Gerçek yeni değer taşıyor." },
          ],
          selectedSequences: [1],
          safeReason: "Bir aday uygulanmaya değer.",
        },
        [1, 2],
      ),
    ).toThrowError("ACTION_WORTHINESS_CANDIDATE_SET_MISMATCH");
  });

  it("keeps only independently accepted candidate sequences", () => {
    const decision = fixtureDecision();
    const verdict = runtimeActionWorthinessVerdictSchema.parse({
      verdict: "ACT",
      confidence: 0.81,
      evaluations: [
        { sequence: 1, decision: "ACCEPT", safeReason: "Yeni bir sözlük gözlemi taşıyor." },
        { sequence: 2, decision: "REJECT", safeReason: "Oy için bağımsız kanaat oluşmadı." },
      ],
      selectedSequences: [1],
      safeReason: "Yalnız entry adayı gerçekten değerli.",
    });

    const reviewed = applyRuntimeActionWorthinessVerdict(decision, verdict);
    expect(reviewed.actions).toEqual([
      expect.objectContaining({ sequence: 1, actionType: "CREATE_ENTRY", selectedOptionSeq: 2 }),
    ]);
    expect(reviewed.decisionJournal.at(-1)).toEqual(
      expect.objectContaining({ kind: "OPTION_SELECTED", summary: verdict.safeReason }),
    );
  });

  it("turns a fully rejected candidate set into an explicit auditable NO_ACTION", () => {
    const decision = fixtureDecision();
    const verdict = runtimeActionWorthinessVerdictSchema.parse({
      verdict: "NO_ACTION",
      confidence: 0.76,
      evaluations: [
        { sequence: 1, decision: "REJECT", safeReason: "Entry mevcut bilgiyi tekrar ediyor." },
        { sequence: 2, decision: "REJECT", safeReason: "Oy için bağımsız kanaat oluşmadı." },
      ],
      selectedSequences: [],
      safeReason: "Bu turdaki adayların hiçbiri bağımsız değer katmıyor.",
    });

    const reviewed = applyRuntimeActionWorthinessVerdict(decision, verdict);
    expect(reviewed.actions).toEqual([
      expect.objectContaining({
        sequence: 3,
        actionType: "NO_ACTION",
        safeReason: verdict.safeReason,
        selectedOptionSeq: null,
      }),
    ]);
    expect(reviewed.decisionJournal.at(-1)).toEqual(
      expect.objectContaining({
        kind: "OPTION_REJECTED",
        subject: "final action-worthiness",
        summary: verdict.safeReason,
      }),
    );
    expect(reviewed.safeRunSummary.shortRationale).toBe(verdict.safeReason);
  });
});
