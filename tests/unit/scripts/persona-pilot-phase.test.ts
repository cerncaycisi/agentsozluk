import { describe, expect, it } from "vitest";
import {
  canStartPersonaHoldout,
  evaluatePersonaPhase,
  type VerifiedPairScore,
} from "../../../scripts/persona-pilot/phase";

const promising = (): VerifiedPairScore[] =>
  Array.from({ length: 6 }, (_, index) => {
    const newSlot = index < 3 ? "A" : "B";
    return {
      caseId: `case-${index.toString(16).padStart(12, "0")}`,
      newSlot,
      complete: true,
      winnerSlot: index < 4 ? newSlot : index === 4 ? "A" : "TIE",
      verifiedViolationSlots: [],
    };
  });

describe("P2 saklı set politikası", () => {
  it("altı tam çiftte 4 yeni / 1 eski eşiğini geçer; davranış GO'su üretmez", () => {
    expect(evaluatePersonaPhase(promising())).toEqual({
      status: "THRESHOLD_MET",
      completePairs: 6,
      newWins: 4,
      oldWins: 1,
      verifiedNewViolations: 0,
    });
  });
  it("4 yeni kazansa bile iki eski tercihinde saklı set açılmaz", () => {
    const scores = promising();
    scores[5]!.winnerSlot = "A";
    expect(evaluatePersonaPhase(scores).status).toBe("THRESHOLD_NOT_MET");
  });
  it("dört kazanan var diye eksik çiftler atılmaz", () => {
    const scores = promising();
    scores[5]!.complete = false;
    scores[5]!.winnerSlot = "INSUFFICIENT";
    expect(evaluatePersonaPhase(scores).status).toBe("INCOMPLETE");
  });
  it("doğrulanmış yeni kol ihlali, kazançtan ve eksik çiftten önce gelir", () => {
    const scores = promising();
    scores[5]!.complete = false;
    scores[5]!.winnerSlot = "INSUFFICIENT";
    scores[0]!.verifiedViolationSlots = ["A"];
    expect(evaluatePersonaPhase(scores).status).toBe("VERIFIED_NEW_VIOLATION");
  });
  it("eski kol ihlalini yeni kola yazmaz", () => {
    const scores = promising();
    scores[0]!.verifiedViolationSlots = ["B"];
    expect(evaluatePersonaPhase(scores).verifiedNewViolations).toBe(0);
  });
  it("teknik retry sonrası kalan 11 çağrıyla saklı set açılmaz", () => {
    const result = evaluatePersonaPhase(promising());
    expect(canStartPersonaHoldout(result, 12, 30 * 60_000)).toBe(true);
    for (const calls of [0, 11, 13, 24, NaN])
      expect(canStartPersonaHoldout(result, calls, 30 * 60_000)).toBe(false);
  });
  it("son okuma ve kaynak kontrolü için süre bırakır", () => {
    const result = evaluatePersonaPhase(promising());
    expect(canStartPersonaHoldout(result, 12, 16 * 60_000)).toBe(true);
    for (const remaining of [16 * 60_000 - 1, -1, NaN, Infinity])
      expect(canStartPersonaHoldout(result, 12, remaining)).toBe(false);
  });
  it("aynı çifti iki kez veya dengesiz kol anahtarını saymaz", () => {
    const scores = promising();
    scores[5]!.caseId = scores[0]!.caseId;
    expect(() => evaluatePersonaPhase(scores)).toThrow("PILOT_PERSONA_REVIEW_SET_INVALID");
    const unbalanced = promising();
    unbalanced[5]!.newSlot = "A";
    expect(() => evaluatePersonaPhase(unbalanced)).toThrow("PILOT_PERSONA_REVIEW_SET_INVALID");
  });
});
