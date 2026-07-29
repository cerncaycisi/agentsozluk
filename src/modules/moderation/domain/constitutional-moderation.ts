import type { GammazReason, ModerationCapabilityName } from "@/modules/moderation/domain/gammaz";

export const MODERATION_REVIEW_TRACKS = ["FORMAT", "LEGAL"] as const;
export type ModerationReviewTrack = (typeof MODERATION_REVIEW_TRACKS)[number];

export const GAMMAZ_DECISION_OUTCOMES = ["ACCEPTED", "REJECTED"] as const;
export type GammazDecisionOutcome = (typeof GAMMAZ_DECISION_OUTCOMES)[number];

export const CONSTITUTIONAL_CONTENT_ACTIONS = [
  "ENTRY_HIDDEN",
  "ENTRY_MOVED",
  "TOPIC_HIDDEN",
  "TOPIC_RENAMED",
  "TOPIC_MERGED",
] as const;
export type ConstitutionalContentAction = (typeof CONSTITUTIONAL_CONTENT_ACTIONS)[number];

const FORMAT_ENTRY_ACTIONS = ["ENTRY_HIDDEN", "ENTRY_MOVED"] as const;
const LEGAL_ENTRY_ACTIONS = ["ENTRY_HIDDEN"] as const;
const FORMAT_TOPIC_ACTIONS = ["TOPIC_RENAMED", "TOPIC_MERGED"] as const;
const LEGAL_TOPIC_ACTIONS = ["TOPIC_HIDDEN"] as const;

const CONSTITUTIONAL_ARTICLES: Record<GammazReason, readonly number[]> = {
  GAMMAZ_1_NOT_DICTIONARY_FUNCTION: [6, 17],
  GAMMAZ_2_NON_TURKISH_NON_QUOTE: [12],
  GAMMAZ_3_MISSING_CONTINUATION_CONTEXT: [8, 37],
  GAMMAZ_4_PHYSICAL_ENTRY_REFERENCE: [15],
  GAMMAZ_5_DICTIONARY_META: [14],
  GAMMAZ_7_LEGAL_OR_COMMERCIAL_RISK: [23],
  GAMMAZ_8_DUPLICATE_ENTRY: [16],
  GAMMAZ_9_DELETED_BKZ_TARGET: [11, 37],
  TOPIC_CANONICALIZATION_REQUEST: [27, 34, 35],
};

export function reviewTrackForGammazReason(reason: GammazReason): ModerationReviewTrack {
  return reason === "GAMMAZ_7_LEGAL_OR_COMMERCIAL_RISK" ? "LEGAL" : "FORMAT";
}

export function constitutionalArticlesForGammazReason(reason: GammazReason): readonly number[] {
  return CONSTITUTIONAL_ARTICLES[reason];
}

export function capabilityForReviewTrack(
  track: ModerationReviewTrack,
): Extract<ModerationCapabilityName, "FORMAT_MODERATOR" | "LEGAL_REVIEWER"> {
  return track === "LEGAL" ? "LEGAL_REVIEWER" : "FORMAT_MODERATOR";
}

export function allowedContentActions(
  reason: GammazReason,
  targetType: "ENTRY" | "TOPIC",
): readonly ConstitutionalContentAction[] {
  const track = reviewTrackForGammazReason(reason);
  if (targetType === "ENTRY") return track === "LEGAL" ? LEGAL_ENTRY_ACTIONS : FORMAT_ENTRY_ACTIONS;
  return track === "LEGAL" ? LEGAL_TOPIC_ACTIONS : FORMAT_TOPIC_ACTIONS;
}

export function isContentActionAllowed(
  reason: GammazReason,
  targetType: "ENTRY" | "TOPIC",
  action: string,
): action is ConstitutionalContentAction {
  return (allowedContentActions(reason, targetType) as readonly string[]).includes(action);
}

export function assertNoModerationConflict(input: {
  actorId: string;
  targetOwnerId?: string | null;
}): boolean {
  return !input.targetOwnerId || input.actorId !== input.targetOwnerId;
}

export function reviewTrackLabel(track: ModerationReviewTrack): string {
  return track === "LEGAL" ? "Hukuk ve platform güvenliği" : "Sözlük formatı";
}

export function gammazDecisionLabel(outcome: GammazDecisionOutcome): string {
  return outcome === "ACCEPTED" ? "Gerekçe kabul edildi" : "Gerekçe reddedildi";
}
