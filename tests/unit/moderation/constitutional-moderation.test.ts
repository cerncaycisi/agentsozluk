import { describe, expect, it } from "vitest";
import {
  allowedContentActions,
  assertNoModerationConflict,
  capabilityForReviewTrack,
  constitutionalArticlesForGammazReason,
  isContentActionAllowed,
  reviewTrackForGammazReason,
} from "@/modules/moderation/domain/constitutional-moderation";

describe("constitutional moderation domain", () => {
  it("routes only legal-risk gammazes to the legal queue", () => {
    expect(reviewTrackForGammazReason("GAMMAZ_7_LEGAL_OR_COMMERCIAL_RISK")).toBe("LEGAL");
    expect(reviewTrackForGammazReason("GAMMAZ_1_NOT_DICTIONARY_FUNCTION")).toBe("FORMAT");
    expect(reviewTrackForGammazReason("TOPIC_CANONICALIZATION_REQUEST")).toBe("FORMAT");
  });

  it("maps review tracks to independently granted capabilities", () => {
    expect(capabilityForReviewTrack("FORMAT")).toBe("FORMAT_MODERATOR");
    expect(capabilityForReviewTrack("LEGAL")).toBe("LEGAL_REVIEWER");
  });

  it("pins decisions to the applicable constitutional articles", () => {
    expect(constitutionalArticlesForGammazReason("GAMMAZ_1_NOT_DICTIONARY_FUNCTION")).toEqual([
      6, 17,
    ]);
    expect(constitutionalArticlesForGammazReason("GAMMAZ_7_LEGAL_OR_COMMERCIAL_RISK")).toEqual([
      23,
    ]);
    expect(constitutionalArticlesForGammazReason("TOPIC_CANONICALIZATION_REQUEST")).toEqual([
      27, 34, 35,
    ]);
  });

  it("keeps format, legal and target action matrices distinct", () => {
    expect(allowedContentActions("GAMMAZ_1_NOT_DICTIONARY_FUNCTION", "ENTRY")).toEqual([
      "ENTRY_HIDDEN",
      "ENTRY_MOVED",
    ]);
    expect(allowedContentActions("GAMMAZ_7_LEGAL_OR_COMMERCIAL_RISK", "ENTRY")).toEqual([
      "ENTRY_HIDDEN",
    ]);
    expect(allowedContentActions("TOPIC_CANONICALIZATION_REQUEST", "TOPIC")).toEqual([
      "TOPIC_RENAMED",
      "TOPIC_MERGED",
    ]);
    expect(allowedContentActions("GAMMAZ_7_LEGAL_OR_COMMERCIAL_RISK", "TOPIC")).toEqual([
      "TOPIC_HIDDEN",
    ]);
    expect(isContentActionAllowed("TOPIC_CANONICALIZATION_REQUEST", "TOPIC", "TOPIC_HIDDEN")).toBe(
      false,
    );
  });

  it("fails closed when the moderator owns the target", () => {
    expect(assertNoModerationConflict({ actorId: "actor", targetOwnerId: "actor" })).toBe(false);
    expect(assertNoModerationConflict({ actorId: "actor", targetOwnerId: "author" })).toBe(true);
    expect(assertNoModerationConflict({ actorId: "actor", targetOwnerId: null })).toBe(true);
  });
});
