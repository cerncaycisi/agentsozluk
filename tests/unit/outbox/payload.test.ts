import type { TransactionClient } from "@/lib/db/types";
import { describe, expect, it, vi } from "vitest";
import { appendOutboxEvent } from "@/modules/outbox/application/outbox";
import { assertSafeOutboxPayload } from "@/modules/outbox/domain/event";

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

  it("validates and persists a safe application-level event", async () => {
    const create = vi.fn().mockResolvedValue({ id: "event-id" });
    const transaction = { outboxEvent: { create } } as unknown as TransactionClient;
    await appendOutboxEvent(transaction, {
      eventType: "entry.created",
      aggregateType: "Entry",
      aggregateId: "018f5d51-8f89-7a4e-89df-2166b53ea420",
      actorId: "018f5d51-8f89-7a4e-89df-2166b53ea41f",
      actorKind: "HUMAN",
      requestId: "018f5d51-8f89-7a4e-89df-2166b53ea421",
      payload: { origin: "WEB" },
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: "entry.created", payload: { origin: "WEB" } }),
    });
  });
});
