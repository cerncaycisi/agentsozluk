import { describe, expect, it } from "vitest";
import { projectActionFeedback } from "@/modules/agents/domain/action-feedback";

const now = new Date("2026-10-03T12:00:00Z");
const result = {
  id: "action-one",
  runId: "run-one",
  actionType: "NO_ACTION",
  actionStatus: "SUCCEEDED",
  rejectionCode: null,
  updatedAt: new Date("2026-10-03T11:00:00Z"),
};

describe("execution feedback is not a quality judgment", () => {
  it.each(["SUCCEEDED", "REJECTED", "FAILED", "SKIPPED"])(
    "keeps %s neutral and excludes raw operational data",
    (actionStatus) => {
      const cards = projectActionFeedback(
        [{ ...result, actionStatus, rejectionCode: "PRIVATE_FAILURE_DETAIL" }],
        now,
      );
      expect(cards[0]).toMatchObject({
        executionStatus: actionStatus,
        semanticAssessment: "NOT_EVALUATED",
        channel: "EXECUTION",
        reason: null,
      });
      expect(JSON.stringify(cards)).not.toContain("PRIVATE_FAILURE_DETAIL");
    },
  );

  it("uses a stable event key across later observations without inventing a new effect", () => {
    const first = projectActionFeedback([result], now)[0]!;
    const later = projectActionFeedback([result], new Date(now.getTime() + 60_000))[0]!;
    expect(later.eventKey).toBe(first.eventKey);
    expect(later.recordedAt).toBe(first.recordedAt);
    expect(later.expiresAt).toBe("2026-10-10T11:00:00.000Z");
    expect(later.observedAt).not.toBe(first.observedAt);
    expect(Object.keys(later)).not.toEqual(expect.arrayContaining(["reward", "score"]));
  });

  it("only explains known rejections, never inherits object properties", () => {
    const cards = projectActionFeedback(
      ["DUPLICATE_SIMILARITY", "toString", "__proto__"].map((rejectionCode) => ({
        ...result,
        actionStatus: "REJECTED",
        rejectionCode,
      })),
      now,
    );
    expect(cards.map(({ reason }) => reason)).toEqual(["SIMILARITY_REVIEW_REQUIRED", null, null]);
  });
});
