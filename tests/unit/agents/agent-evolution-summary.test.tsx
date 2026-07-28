import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentEvolutionSummary } from "@/components/agents/agent-evolution-summary";

const emptyCounts = {
  APPLIED: 0,
  NO_DELTA: 0,
  PARTIAL_RUN: 0,
  FROZEN: 0,
  STALE_PERSONA: 0,
  REJECTED_PERSONA_DELTA: 0,
  UNKNOWN: 0,
};

describe("agent evolution summary", () => {
  it("explains applied and no-change outcomes with real change counts", () => {
    const html = renderToStaticMarkup(
      <AgentEvolutionSummary
        personaEvolutionEnabled
        sourceEvolutionEnabled
        evolution={{
          sampledRunCount: 2,
          statusCounts: { ...emptyCounts, APPLIED: 1, NO_DELTA: 1 },
          outcomes: [
            {
              runId: "00000000-0000-4000-8000-000000000101",
              trigger: "WEEKLY_PERSONA_REFLECTION",
              runStatus: "SUCCEEDED",
              errorCode: null,
              createdAt: new Date("2026-07-28T08:00:00.000Z"),
              finishedAt: new Date("2026-07-28T08:01:00.000Z"),
              status: "APPLIED",
              purpose: "PERSONA_EVOLUTION",
              purposeLabel: "Kişilik değerlendirmesi",
              label: "Değişiklik uygulandı",
              explanation: "Kontrollü değişiklik uygulandı.",
              tone: "positive",
              changes: { persona: 1, belief: 2, relationship: 0, source: 1 },
            },
            {
              runId: "00000000-0000-4000-8000-000000000102",
              trigger: "NIGHTLY_MEMORY_CONSOLIDATION",
              runStatus: "SUCCEEDED",
              errorCode: null,
              createdAt: new Date("2026-07-28T07:00:00.000Z"),
              finishedAt: new Date("2026-07-28T07:01:00.000Z"),
              status: "NO_DELTA",
              purpose: "MEMORY_CONSOLIDATION",
              purposeLabel: "Hafıza toparlama",
              label: "Persona değişimi beklenmiyordu",
              explanation: "Bu çalışma yalnız hafızayı toparladı.",
              tone: "neutral",
              changes: { persona: 0, belief: 0, relationship: 0, source: 0 },
            },
          ],
        }}
      />,
    );

    expect(html).toContain("Gelişim: ne değişti, neden?");
    expect(html).toContain("Değişiklik uygulandı");
    expect(html).toContain("persona sürümü 1");
    expect(html).toContain("kanaat 2");
    expect(html).toContain("kaynak güveni 1");
    expect(html).toContain("Persona değişimi beklenmiyordu");
    expect(html).toContain("Kalıcı state değişikliği kaydedilmedi.");
    expect(html).toContain("/moderasyon/agentlar/calisma/00000000-0000-4000-8000-000000000101");
  });

  it("does not pretend that no run means an agent chose not to change", () => {
    const html = renderToStaticMarkup(
      <AgentEvolutionSummary
        personaEvolutionEnabled
        sourceEvolutionEnabled
        evolution={{ sampledRunCount: 0, statusCounts: emptyCounts, outcomes: [] }}
      />,
    );
    expect(html).toContain("çalışma henüz gerçekleşmemiştir");
  });
});
