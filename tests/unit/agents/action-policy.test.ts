import { describe, expect, it } from "vitest";
import {
  duplicateRepairCandidateIsSafe,
  entrySimilarity,
  hasUnrecordedOfflineFirstPersonClaim,
  maximumEntrySimilarity,
  repeatedEntryFraming,
  isRepairableContentRejectionCode,
  sourceGroundingIssue,
} from "@/modules/agents";

describe("agent action duplicate policy", () => {
  it("normalizes exact Turkish content and scores it as duplicate", () => {
    expect(entrySimilarity("  İyi   bir gün! ", "iyi bir gün!")).toBe(1);
  });

  it("uses deterministic token Jaccard similarity for candidate history", () => {
    expect(
      maximumEntrySimilarity("ölçülebilir kapasite planı bugün açıklandı", [
        "tamamen farklı kısa içerik",
        "ölçülebilir kapasite planı bugün açıklandı ve doğrulandı",
      ]),
    ).toBeCloseTo(5 / 7);
    expect(entrySimilarity("elma armut", "deniz gökyüzü")).toBe(0);
  });

  it("rejects a repeated long opening or closing frame from recent agent entries", () => {
    expect(
      repeatedEntryFraming(
        "Bu konuya bakarken önce ölçülebilir veriyi ayırmak gerekir; sonuç bugün farklı.",
        ["Bu konuya bakarken önce ölçülebilir veriyi ayırmak gerekir; dün başka sonuç çıktı."],
      ),
    ).toBe("OPENING");
    expect(
      repeatedEntryFraming(
        "Başka bir gözlem var ama sonunda karar değişmedi: ölçmeden hüküm vermek doğru değil.",
        ["Dünkü tartışma farklıydı; ölçmeden hüküm vermek doğru değil."],
      ),
    ).toBe("CLOSING");
    expect(repeatedEntryFraming("Kısa ve özgün bir not.", ["Kısa ama farklı bir not."])).toBeNull();
  });

  it("requires exact source support for numeric and direct-quote claims", () => {
    const evidence = [
      "Ölçüm sonucu 37,5 olarak açıklandı. Raporda karar vermeden önce ölç ifadesi yer aldı.",
    ];
    expect(
      sourceGroundingIssue('Sonuç 37,5; rapor "karar vermeden önce ölç" diyor.', evidence),
    ).toBeNull();
    expect(sourceGroundingIssue("Sonuç tam 42 olarak açıklandı.", evidence)).toBe(
      "UNSUPPORTED_EXACT_NUMBER",
    );
    expect(sourceGroundingIssue('Raporda "kanıt olmadan kesin konuş" deniyor.', evidence)).toBe(
      "UNSUPPORTED_DIRECT_QUOTE",
    );
  });

  it("rejects unrecorded offline first-person claims without blocking digital context or quoted discussion", () => {
    for (const body of [
      "Ben pilotum ve işe giderken bu kararı her gün uyguluyorum.",
      "Üniversitedeyken dün sokakta gördüm; bu yüzden kesin konuşuyorum.",
      "Çocuğum okuldayken yaşadığım şehirde aynı olay tekrarlandı.",
    ])
      expect(hasUnrecordedOfflineFirstPersonClaim(body)).toBe(true);

    for (const body of [
      "Bu akışta daha önce okuduğum entry üzerinden iddianın sınırlarını tartışıyorum.",
      "Bu başlıkta bir yazarın ‘ben pilotum’ iddiası var; doğrulanmış saymıyorum.",
      "Ben pilotum diyen yazarın ifadesi tek başına kanıt değildir.",
    ])
      expect(hasUnrecordedOfflineFirstPersonClaim(body)).toBe(false);
  });

  it("allows only one body-only repair with the same target and provenance", () => {
    const provenance = {
      evidenceType: "PLATFORM_EVENT",
      evidenceIds: ["00000000-0000-4000-8000-000000000001"],
      shortRationale: "Görünür runtime kanıtı.",
    };
    const original = {
      sequence: 2,
      actionType: "CREATE_ENTRY",
      targetType: "TOPIC",
      targetId: "00000000-0000-4000-8000-000000000002",
      input: {
        topicId: "00000000-0000-4000-8000-000000000002",
        body: "İlk duplicate aday metni.",
      },
      provenance,
    };
    const repaired = {
      ...original,
      sequence: 7,
      repairOfSequence: 2,
      input: { ...original.input, body: "Aynı kanıta dayanan gerçekten farklı bir anlatım." },
    };
    expect(duplicateRepairCandidateIsSafe(original, repaired)).toBe(true);
    expect(
      duplicateRepairCandidateIsSafe(original, {
        ...repaired,
        targetId: "00000000-0000-4000-8000-000000000003",
      }),
    ).toBe(false);
    expect(
      duplicateRepairCandidateIsSafe(original, {
        ...repaired,
        provenance: { ...provenance, evidenceIds: ["00000000-0000-4000-8000-000000000004"] },
      }),
    ).toBe(false);
  });

  it("shares the complete body-repair rejection allowlist between worker and server", () => {
    for (const code of [
      "DUPLICATE_SIMILARITY",
      "USER_ENTRY_HIGH_RISK_REPRODUCTION",
      "SERIOUS_CLAIM_SOURCE_INSUFFICIENT",
      "SOURCE_DIRECT_QUOTE_UNSUPPORTED",
      "CONSTITUTION_ENTRY_PHYSICAL_REFERENCE",
      "CONSTITUTION_ENTRY_TOPIC_META",
    ])
      expect(isRepairableContentRejectionCode(code)).toBe(true);
    expect(isRepairableContentRejectionCode("CONSTITUTION_TOPIC_FORUM_PROMPT")).toBe(false);
    expect(isRepairableContentRejectionCode(null)).toBe(false);
  });
});
