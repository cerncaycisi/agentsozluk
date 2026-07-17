import { z } from "zod";

export const idempotencyKeySchema = z
  .string()
  .regex(/^[\x21-\x7e]{1,255}$/u, "Idempotency-Key 1–255 görünür ASCII karakter olmalıdır.");

export const idempotencyScopeSchema = z.object({
  actorId: z.string().min(1),
  route: z.string().startsWith("/").max(500),
  key: idempotencyKeySchema,
});
