import { describe, expect, it } from "vitest";
import {
  describeReflectionOutcome,
  parseReflectionStatus,
  reflectionPurpose,
} from "@/modules/agents/domain/evolution-observability";

describe("agent evolution observability", () => {
  it("keeps persona evolution and memory consolidation semantically separate", () => {
    expect(reflectionPurpose("WEEKLY_PERSONA_REFLECTION")).toBe("PERSONA_EVOLUTION");
    expect(reflectionPurpose("ADMIN_MANUAL")).toBe("PERSONA_EVOLUTION");
    expect(reflectionPurpose("NIGHTLY_MEMORY_CONSOLIDATION")).toBe("MEMORY_CONSOLIDATION");
    expect(reflectionPurpose("ADMIN_MEMORY_RECONSOLIDATE")).toBe("MEMORY_CONSOLIDATION");

    expect(
      describeReflectionOutcome({
        trigger: "NIGHTLY_MEMORY_CONSOLIDATION",
        status: "NO_DELTA",
      }),
    ).toMatchObject({
      purpose: "MEMORY_CONSOLIDATION",
      label: "Persona değişimi beklenmiyordu",
    });
    expect(
      describeReflectionOutcome({
        trigger: "WEEKLY_PERSONA_REFLECTION",
        status: "NO_DELTA",
      }),
    ).toMatchObject({
      purpose: "PERSONA_EVOLUTION",
      label: "Değişiklik önermedi",
    });
  });

  it("returns only allowlisted statuses and never echoes unknown metadata", () => {
    expect(parseReflectionStatus({ reflectionStatus: "APPLIED" })).toBe("APPLIED");
    expect(parseReflectionStatus({ reflectionStatus: "private internal explanation" })).toBe(
      "UNKNOWN",
    );
    expect(
      describeReflectionOutcome({
        trigger: "WEEKLY_PERSONA_REFLECTION",
        status: "UNKNOWN",
      }),
    ).toMatchObject({
      label: "Sonuç sınıflandırılamadı",
      explanation: expect.not.stringContaining("private"),
    });
  });
});
