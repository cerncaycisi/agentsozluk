import { z } from "zod";

export const auditLogInputSchema = z.object({
  actorId: z.string().uuid().nullable(),
  action: z.string().trim().min(1).max(120),
  entityType: z.string().trim().min(1).max(120),
  entityId: z.string().uuid().nullable(),
  requestId: z.string().uuid(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type AuditLogInput = z.infer<typeof auditLogInputSchema>;
