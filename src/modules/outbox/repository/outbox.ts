import type { Prisma } from "@prisma/client";
import type { OutboxEventType } from "@/modules/outbox/domain/event";

interface OutboxEventRecordInput {
  eventType: OutboxEventType;
  aggregateType: string;
  aggregateId: string;
  actorId: string | null;
  actorKind: "HUMAN" | "AGENT" | null;
  requestId: string;
  payload?: Record<string, unknown>;
}

export async function insertOutboxEvent(
  transaction: Prisma.TransactionClient,
  input: OutboxEventRecordInput,
): Promise<void> {
  await transaction.outboxEvent.create({
    data: {
      eventType: input.eventType,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      actorId: input.actorId,
      actorKind: input.actorKind,
      requestId: input.requestId,
      payload: (input.payload ?? {}) as Prisma.InputJsonValue,
    },
  });
}
