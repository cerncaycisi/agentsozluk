import { describe, expect, it } from "vitest";
import {
  gammazEvidenceRows,
  gammazReasonLabel,
  isGammazReason,
  reasonsForTarget,
} from "@/modules/moderation/domain/gammaz";

describe("gammaz domain presentation", () => {
  it("keeps active, historical and unknown reason labels distinct", () => {
    expect(gammazReasonLabel("GAMMAZ_8_DUPLICATE_ENTRY")).toContain("daha önce yazılmış");
    expect(gammazReasonLabel("SPAM")).toBe("Tarihsel · spam");
    expect(gammazReasonLabel("FUTURE_REASON")).toBe("FUTURE_REASON");
    expect(isGammazReason("TOPIC_CANONICALIZATION_REQUEST")).toBe(true);
    expect(isGammazReason("SPAM")).toBe(false);
    expect(reasonsForTarget("TOPIC")).toEqual([
      "GAMMAZ_7_LEGAL_OR_COMMERCIAL_RISK",
      "TOPIC_CANONICALIZATION_REQUEST",
    ]);
  });

  it("renders only the allowlisted structured evidence fields", () => {
    expect(gammazEvidenceRows(null)).toEqual([]);
    expect(
      gammazEvidenceRows({
        duplicateEntryPublicId: 519,
        referenceEntryPublicId: 520,
        legalRiskCategory: "COPYRIGHT",
        suggestedTitle: "kanonik başlık",
        privateNote: "render edilmemeli",
      }),
    ).toEqual([
      { label: "Önceki entry", value: "#519" },
      { label: "Dayanak entry", value: "#520" },
      { label: "Risk hattı", value: "Telif hakkı" },
      { label: "Önerilen başlık", value: "kanonik başlık" },
    ]);
  });
});
