import { z } from "zod";

// Son aşama okuyucusu en çok 12 dakika, operatör kaynak kontrolü için 3 dakika.
export const PERSONA_FINAL_REVIEW_RESERVE_MS = 15 * 60_000;
export const PERSONA_MIN_CALL_SLICE_MS = 60_000;
const slot = z.enum(["A", "B"]);
const scoreSchema = z
  .object({
    caseId: z.string().regex(/^case-[a-f0-9]{12}$/u),
    newSlot: slot,
    complete: z.boolean(),
    winnerSlot: z.enum(["A", "B", "TIE", "INSUFFICIENT"]),
    verifiedViolationSlots: z.array(slot).max(2),
  })
  .strict();
export type VerifiedPairScore = z.infer<typeof scoreSchema>;

/** Anahtarı uygulayan ve alıntıları kontrol eden operatörün altı çiftlik makbuzu.
 * Bu fonksiyon alıntı doğrulamaz, model çağırmaz ve davranış kabulü vermez. */
export function evaluatePersonaPhase(input: unknown) {
  const scores = z.array(scoreSchema).length(6).parse(input);
  if (
    new Set(scores.map((score) => score.caseId)).size !== 6 ||
    scores.filter((score) => score.newSlot === "A").length !== 3 ||
    scores.some(
      (score) =>
        new Set(score.verifiedViolationSlots).size !== score.verifiedViolationSlots.length ||
        (!score.complete && score.winnerSlot !== "INSUFFICIENT"),
    )
  )
    throw new Error("PILOT_PERSONA_REVIEW_SET_INVALID");
  const newWins = scores.filter(
    (score) => score.complete && score.winnerSlot === score.newSlot,
  ).length;
  const oldWins = scores.filter(
    (score) =>
      score.complete && ["A", "B"].includes(score.winnerSlot) && score.winnerSlot !== score.newSlot,
  ).length;
  const completePairs = scores.filter((score) => score.complete).length;
  const verifiedNewViolations = scores.filter((score) =>
    score.verifiedViolationSlots.includes(score.newSlot),
  ).length;
  const status =
    verifiedNewViolations > 0
      ? "VERIFIED_NEW_VIOLATION"
      : completePairs < 6
        ? "INCOMPLETE"
        : newWins >= 4 && oldWins <= 1
          ? "THRESHOLD_MET"
          : "THRESHOLD_NOT_MET";
  return { status, completePairs, newWins, oldWins, verifiedNewViolations } as const;
}

/** Saklı set için 12 yeni runtime çağrısı kalmalı; fazlar bütçeyi/süreyi sıfırlamaz. */
export function canStartPersonaHoldout(
  result: ReturnType<typeof evaluatePersonaPhase>,
  runtimeCalls: number,
  remainingMs: number,
) {
  // İlk altı tam çift en az 12 çağrı ister. Bir teknik retry bile saklı set payını tüketir.
  return (
    result.status === "THRESHOLD_MET" &&
    runtimeCalls === 12 &&
    Number.isFinite(remainingMs) &&
    remainingMs >= PERSONA_FINAL_REVIEW_RESERVE_MS + PERSONA_MIN_CALL_SLICE_MS
  );
}
