import type { TransactionClient } from "@/lib/db/types";
import { describe, expect, it, vi } from "vitest";
import { appendOutboxEvent } from "@/modules/outbox/application/outbox";
import { assertSafeOutboxPayload, OUTBOX_EVENT_TYPES } from "@/modules/outbox/domain/event";

describe("outbox payload safety", () => {
  it("includes every canonical M2 agent audit/outbox event type", () => {
    expect(OUTBOX_EVENT_TYPES).toEqual(
      expect.arrayContaining([
        "agent.created",
        "agent.updated",
        "agent.paused",
        "agent.resumed",
        "agent.retired",
        "agent.run.queued",
        "agent.run.started",
        "agent.run.completed",
        "agent.run.failed",
        "agent.action.executed",
        "agent.persona.versioned",
        "agent.source.changed",
        "agent.schedule.generated",
        "agent.settings.changed",
        "agent.capacity.measured",
        "agent.circuit_breaker.triggered",
        "agent.content.bulk_hidden",
        "agent.content.bulk_restored",
        "agent.topic.write_locked",
      ]),
    );
  });

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
