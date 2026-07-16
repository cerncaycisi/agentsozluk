import type { Prisma, UserKind } from "@prisma/client";

const sensitiveKeys = /password|passwordHash|token|authorization|cookie|email/iu;

export type OutboxEventType =
  | "topic.created"
  | "topic.renamed"
  | "topic.hidden"
  | "topic.restored"
  | "topic.merged"
  | "entry.created"
  | "entry.updated"
  | "entry.deleted"
  | "entry.hidden"
  | "entry.restored"
  | "entry.moved"
  | "entry.voted"
  | "report.created"
  | "moderation.completed"
  | "user.suspended"
  | "user.unsuspended"
  | "user.role_changed"
  | "user.deactivated";

export function assertSafeOutboxPayload(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertSafeOutboxPayload(item);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, nestedValue] of Object.entries(value)) {
      if (sensitiveKeys.test(key)) throw new Error("SENSITIVE_OUTBOX_PAYLOAD");
      assertSafeOutboxPayload(nestedValue);
    }
  }
}

export async function appendOutboxEvent(
  transaction: Prisma.TransactionClient,
  input: {
    eventType: OutboxEventType;
    aggregateType: string;
    aggregateId: string;
    actorId: string | null;
    actorKind: UserKind | null;
    requestId: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  const payload = input.payload ?? {};
  assertSafeOutboxPayload(payload);
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
