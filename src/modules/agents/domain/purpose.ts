export const purposePolicyVersion = 1;
export const activePurposeLimit = 2;
export const purposeCommandLimit = 2;
export const purposeTopicKeyMaxLength = 200;
export const purposeLifetimeMs = 7 * 24 * 60 * 60 * 1000;
export const purposePerceptionKey = "purposes";

export const purposeKinds = ["UNDERSTAND_CONCEPT", "TEST_BELIEF", "EXPLORE_CONTRIBUTION"] as const;
export type PurposeKind = (typeof purposeKinds)[number];

// Bunlar semantik başarı değil, bağımsız değerlendirme öncesi kayıt koşullarıdır.
export const purposeCompletionCriteria = {
  UNDERSTAND_CONCEPT: "NEW_EVIDENCE_AND_CHANGED_BELIEF",
  TEST_BELIEF: "BELIEF_REASSESSED_WITH_NEW_EVIDENCE",
  EXPLORE_CONTRIBUTION: "TOPIC_READ_AND_REVIEW_RECORDED",
} as const satisfies Record<PurposeKind, string>;

export function purposeActiveKey(
  kind: PurposeKind,
  targetType: "TOPIC" | "BELIEF",
  targetId: string,
) {
  return `${kind}:${targetType}:${targetId}`;
}

export function availablePurposeSlot(occupied: readonly number[]): 1 | 2 | null {
  return !occupied.includes(1) ? 1 : !occupied.includes(2) ? 2 : null;
}
