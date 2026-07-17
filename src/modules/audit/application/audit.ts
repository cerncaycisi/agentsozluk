import type { TransactionClient } from "@/lib/db/types";
import { assertSafeAuditMetadata } from "@/modules/audit/domain/metadata";
import { insertAuditLog } from "@/modules/audit/repository/audit";
import { auditLogInputSchema, type AuditLogInput } from "@/modules/audit/validation/schemas";

export async function appendAuditLog(
  transaction: TransactionClient,
  input: AuditLogInput,
): Promise<void> {
  const validated = auditLogInputSchema.parse(input);
  const metadata = validated.metadata ?? {};
  assertSafeAuditMetadata(metadata);
  await insertAuditLog(transaction, { ...validated, metadata });
}
