import type { TransactionClient } from "@/lib/db/types";
import { assertSafeOutboxPayload } from "@/modules/outbox/domain/event";
import { insertOutboxEvent } from "@/modules/outbox/repository/outbox";
import { outboxEventInputSchema, type OutboxEventInput } from "@/modules/outbox/validation/schemas";

export async function appendOutboxEvent(
  transaction: TransactionClient,
  input: OutboxEventInput,
): Promise<void> {
  const validated = outboxEventInputSchema.parse(input);
  const payload = validated.payload ?? {};
  assertSafeOutboxPayload(payload);
  await insertOutboxEvent(transaction, { ...validated, payload });
}
