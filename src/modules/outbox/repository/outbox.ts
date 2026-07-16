import type { Prisma, UserKind } from "@prisma/client";

const sensitiveKeys = /password|passwordHash|token|authorization|cookie|email/iu;

function assertSafePayload(payload: Record<string, unknown>): void {
  for (const key of Object.keys(payload)) {
    if (sensitiveKeys.test(key)) throw new Error("SENSITIVE_OUTBOX_PAYLOAD");
  }
}

export async function appendOutboxEvent(
  transaction: Prisma.TransactionClient,
  input: {
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    actorId: string | null;
    actorKind: UserKind | null;
    requestId: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  const payload = input.payload ?? {};
  assertSafePayload(payload);
  await transaction.outboxEvent.create({
    data: {
      eventType: input.eventType,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      actorId: input.actorId,
      actorKind: input.actorKind,
      requestId: input.requestId,
      payload: payload as Prisma.InputJsonValue,
    },
  });
}
