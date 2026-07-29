import type { DatabaseClient } from "@/lib/db/types";
import type { ExpiredRecordCleanupOptions } from "@/modules/maintenance/domain/expired-operational-records";
import { deleteExpiredOperationalRecordBatches } from "@/modules/maintenance/repository/expired-operational-records";
import { expiredRecordCleanupOptionsSchema } from "@/modules/maintenance/validation/schemas";

export function cleanupExpiredOperationalRecords(
  database: DatabaseClient,
  input: ExpiredRecordCleanupOptions,
) {
  return deleteExpiredOperationalRecordBatches(
    database,
    expiredRecordCleanupOptionsSchema.parse(input),
  );
}
