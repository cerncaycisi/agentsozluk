import "dotenv/config";
import { getDatabase } from "@/lib/db/client";

const database = getDatabase();

async function main(): Promise<void> {
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
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Bakım başarısız oldu."}\n`);
  process.exitCode = 1;
});
