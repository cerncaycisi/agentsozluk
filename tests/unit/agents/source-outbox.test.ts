import { describe, expect, it } from "vitest";
import { buildRuntimeSourceChangedOutboxEvent } from "@/modules/agents";
import { assertSafeOutboxPayload, outboxEventInputSchema } from "@/modules/outbox";

describe("runtime source changed outbox event", () => {
  it("builds the canonical AgentSource event from safe identifiers and metadata", () => {
    const event = buildRuntimeSourceChangedOutboxEvent({
      principal: {
        credentialId: "00000000-0000-4000-8000-000000000001",
        agentProfileId: "00000000-0000-4000-8000-000000000002",
        lifecycleStatus: "ACTIVE",
        actor: {
          actorId: "00000000-0000-4000-8000-000000000003",
          actorKind: "AGENT",
          actorRole: "USER",
          requestId: "00000000-0000-4000-8000-000000000004",
          origin: "AGENT",
        },
      },
      runId: "00000000-0000-4000-8000-000000000005",
      actionId: "00000000-0000-4000-8000-000000000006",
      source: {
        id: "00000000-0000-4000-8000-000000000007",
        status: "PROBATION",
        normalizedDomain: "example.com",
      },
    });

    expect(outboxEventInputSchema.parse(event)).toEqual(event);
    expect(() => assertSafeOutboxPayload(event.payload)).not.toThrow();
    expect(event).toEqual({
      eventType: "agent.source.changed",
      aggregateType: "AgentSource",
      aggregateId: "00000000-0000-4000-8000-000000000007",
      actorId: "00000000-0000-4000-8000-000000000003",
      actorKind: "AGENT",
      requestId: "00000000-0000-4000-8000-000000000004",
      payload: {
        agentProfileId: "00000000-0000-4000-8000-000000000002",
        runId: "00000000-0000-4000-8000-000000000005",
        actionId: "00000000-0000-4000-8000-000000000006",
        sourceId: "00000000-0000-4000-8000-000000000007",
        status: "PROBATION",
        origin: "AGENT",
        normalizedDomain: "example.com",
      },
    });
  });
});
