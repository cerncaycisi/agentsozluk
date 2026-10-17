import { describe, expect, it } from "vitest";
import { projectActionFeedback } from "@/modules/agents/domain/action-feedback";

const now = new Date("2026-10-03T12:00:00Z");
const result = {
  id: "action-one",
  runId: "run-one",
  actionType: "CREATE_ENTRY" as const,
  actionStatus: "SUCCEEDED",
  rejectionCode: null,
  createdAt: new Date("2026-10-03T11:00:00Z"),
  updatedAt: new Date("2026-10-03T11:01:00Z"),
};

describe("execution feedback is not a quality judgment", () => {
  it("does not turn nonterminal states or silence into feedback cards", () => {
    expect(
      projectActionFeedback(
        [
          { ...result, actionStatus: "EXECUTING" },
          { ...result, actionStatus: "UNKNOWN_FUTURE_STATUS" },
          { ...result, actionType: "NO_ACTION", actionStatus: "SKIPPED" },
        ],
        now,
      ),
    ).toEqual([]);
  });

  it("does not renew expiry when an old action row is updated", () => {
    const first = projectActionFeedback([result], now)[0]!;
    const updated = projectActionFeedback([{ ...result, updatedAt: now }], now)[0]!;
    expect(updated.expiresAt).toBe(first.expiresAt);
    expect(updated.actionCreatedAt).toBe(first.actionCreatedAt);
    expect(updated.resultRecordedAt).not.toBe(first.resultRecordedAt);
  });

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
    expect(later.actionCreatedAt).toBe(first.actionCreatedAt);
    expect(later.resultRecordedAt).toBe(first.resultRecordedAt);
    expect(later.expiresAt).toBe("2026-10-10T11:00:00.000Z");
    expect(later.observedAt).not.toBe(first.observedAt);
    expect(Object.keys(later)).not.toEqual(expect.arrayContaining(["reward", "score"]));
  });

  it("only explains known rejections, never inherits object properties", () => {
    const cards = projectActionFeedback(
      ["DUPLICATE_SIMILARITY", "TOPIC_EXISTS_UNREAD", "toString", "__proto__"].map(
        (rejectionCode) => ({
          ...result,
          actionStatus: "REJECTED",
          rejectionCode,
        }),
      ),
      now,
    );
    expect(cards.map(({ reason }) => reason)).toEqual([
      "SIMILARITY_REVIEW_REQUIRED",
      "TOPIC_EXISTS_READ_FIRST",
      null,
      null,
    ]);
  });
});

describe("proper-noun daily cap feedback (Astra tavan 1. tur P2)", () => {
  const capNow = new Date("2026-10-17T12:00:00Z");
  const capRejection = {
    ...result,
    actionType: "CREATE_TOPIC_WITH_ENTRY" as const,
    actionStatus: "REJECTED",
    rejectionCode: "TOPIC_CREATION_DISABLED",
    createdAt: new Date("2026-10-17T10:00:00Z"),
    updatedAt: new Date("2026-10-17T10:00:01Z"),
  };
  const detail = (quotaDay: string) => ({
    valid: false,
    code: "TOPIC_CREATION_DISABLED",
    rejectionDetail: { subReason: "PROPER_NOUN_DAILY_CAP", quotaDay },
  });

  it("explains today's cap with a safe reason and the quota day", () => {
    const [card] = projectActionFeedback(
      [{ ...capRejection, validationResult: detail("2026-10-17") }],
      capNow,
    );
    expect(card).toMatchObject({
      executionStatus: "REJECTED",
      reason: "PROPER_NOUN_DAILY_CAP_USE_EXISTING_OR_CONCEPT",
      quotaDay: "2026-10-17",
      semanticAssessment: "NOT_EVALUATED",
    });
    expect(JSON.stringify(card)).not.toContain("TOPIC_CREATION_DISABLED");
  });

  it("keeps yesterday's cap neutral once the Istanbul day has turned", () => {
    // 17 Ekim 21:00Z = 18 Ekim 00:00 TSİ; dünkü tavan artık geçerli değil.
    const [card] = projectActionFeedback(
      [{ ...capRejection, validationResult: detail("2026-10-17") }],
      new Date("2026-10-17T21:00:00Z"),
    );
    expect(card).toMatchObject({ reason: null });
    expect(card).not.toHaveProperty("quotaDay");
  });

  it("keeps the global topic-creation switch neutral", () => {
    const [card] = projectActionFeedback(
      [{ ...capRejection, validationResult: { valid: false, code: "TOPIC_CREATION_DISABLED" } }],
      capNow,
    );
    expect(card).toMatchObject({ reason: null });
    expect(card).not.toHaveProperty("quotaDay");
  });

  it("ignores a cap detail on any other rejection code", () => {
    const [card] = projectActionFeedback(
      [
        {
          ...capRejection,
          rejectionCode: "PRIVATE_FAILURE_DETAIL",
          validationResult: detail("2026-10-17"),
        },
      ],
      capNow,
    );
    expect(card).toMatchObject({ reason: null });
    expect(card).not.toHaveProperty("quotaDay");
  });
});
