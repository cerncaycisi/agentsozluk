import "dotenv/config";
import { getDatabase } from "@/lib/db/client";
import { recalculateCounters } from "@/modules/entries/repository/recalculate";

const database = getDatabase();

async function main(): Promise<void> {
  try {
    const result = await database.$transaction((transaction) => recalculateCounters(transaction));
    process.stdout.write(
      `Sayaçlar güncellendi: ${result.entriesUpdated} entry, ${result.topicsUpdated} başlık.\n`,
    );
  } finally {
    await database.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Sayaç güncellemesi başarısız oldu."}\n`,
  );
  process.exitCode = 1;
});
