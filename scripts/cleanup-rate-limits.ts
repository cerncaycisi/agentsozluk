import "dotenv/config";
import { getDatabase } from "@/lib/db/client";

const database = getDatabase();
try {
  const [rateLimits, idempotencyRecords] = await database.$transaction([
    database.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    database.idempotencyRecord.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
  ]);
  process.stdout.write(
    `Bakım tamamlandı: ${rateLimits.count} rate-limit bucket, ${idempotencyRecords.count} idempotency kaydı silindi.\n`,
  );
} finally {
  await database.$disconnect();
}
