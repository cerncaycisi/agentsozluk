import { describe, expect, it } from "vitest";
import { assertSafeOutboxPayload } from "@/modules/outbox/repository/outbox";

describe("outbox payload safety", () => {
  it("accepts non-sensitive nested event metadata", () => {
    expect(() =>
      assertSafeOutboxPayload({ topicId: "topic-id", changes: [{ field: "title" }] }),
    ).not.toThrow();
  });

  it.each(["password", "passwordHash", "accessToken", "authorization", "cookie", "email"])(
    "rejects a nested %s field",
    (field) => {
      expect(() => assertSafeOutboxPayload({ metadata: { actor: { [field]: "secret" } } })).toThrow(
        "SENSITIVE_OUTBOX_PAYLOAD",
      );
    },
  );
});
