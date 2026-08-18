import { describe, expect, it } from "vitest";
import { projectActiveAgentBehaviorLessons } from "@/modules/agents/domain/behavior-feedback";

function event(
  id: bigint,
  eventType: "CONTENT_MODERATED" | "CONTENT_RESTORED",
  feedbackKey: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    eventType,
    occurredAt: new Date(`2026-08-18T0${Number(id)}:00:00.000Z`),
    metadata: {
      feedbackKey,
      contentType: "ENTRY",
      operation: eventType === "CONTENT_MODERATED" ? "HIDDEN" : "RESTORED",
      behaviorReasonCode: "SYNTHETIC_TONE",
      editorNote: "Kalıp anlatım yerine doğal ve doğrudan bir sözlük cümlesi kur.",
      ...overrides,
    },
  } as const;
}

describe("agent behavior feedback projection", () => {
  it("keeps a moderation lesson active across later runs", () => {
    expect(
      projectActiveAgentBehaviorLessons([event(1n, "CONTENT_MODERATED", "ENTRY:one")]),
    ).toEqual([
      expect.objectContaining({
        reasonCode: "SYNTHETIC_TONE",
        lesson: "Kalıp anlatım yerine doğal ve doğrudan bir sözlük cümlesi kur.",
      }),
    ]);
  });

  it("lets a restore supersede only the matching content lesson", () => {
    const lessons = projectActiveAgentBehaviorLessons([
      event(3n, "CONTENT_RESTORED", "ENTRY:one"),
      event(2n, "CONTENT_MODERATED", "ENTRY:two", { behaviorReasonCode: "OFF_TOPIC" }),
      event(1n, "CONTENT_MODERATED", "ENTRY:one"),
    ]);
    expect(lessons).toHaveLength(1);
    expect(lessons[0]?.reasonCode).toBe("OFF_TOPIC");
  });

  it("bounds active lessons without leaking content ids or bodies", () => {
    const lessons = projectActiveAgentBehaviorLessons(
      Array.from({ length: 8 }, (_, index) =>
        event(BigInt(index + 1), "CONTENT_MODERATED", `ENTRY:${index}`),
      ).reverse(),
      5,
    );
    expect(lessons).toHaveLength(5);
    expect(JSON.stringify(lessons)).not.toMatch(/ENTRY:|body|moderationActionId/u);
  });
});
