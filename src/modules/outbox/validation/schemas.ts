import { z } from "zod";
import { OUTBOX_EVENT_TYPES } from "@/modules/outbox/domain/event";

export const outboxEventInputSchema = z.object({
  eventType: z.enum(OUTBOX_EVENT_TYPES),
  aggregateType: z.string().trim().min(1).max(120),
  aggregateId: z.string().uuid(),
  actorId: z.string().uuid().nullable(),
  actorKind: z.enum(["HUMAN", "AGENT"]).nullable(),
  requestId: z.string().uuid(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export type OutboxEventInput = z.infer<typeof outboxEventInputSchema>;
