import "dotenv/config";
import { getDatabase } from "@/lib/db/client";
import {
  cleanupExpiredOperationalRecords,
  expiredRecordCleanupOptions,
} from "@/modules/maintenance";

const database = getDatabase();

async function main(): Promise<void> {
  try {
    const options = expiredRecordCleanupOptions(process.argv.slice(2));
    const result = await cleanupExpiredOperationalRecords(database, options);
    process.stdout.write(
      `${JSON.stringify({
        event: "maintenance.expired_operational_records.completed",
        batchSize: options.batchSize,
        maxBatches: options.maxBatches,
        rateLimitBuckets: result.rateLimitBuckets,
        idempotencyRecords: result.idempotencyRecords,
      })}\n`,
    );
  } finally {
    await database.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Bakım başarısız oldu."}\n`);
  process.exitCode = 1;
});
