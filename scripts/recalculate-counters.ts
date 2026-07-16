import "dotenv/config";
import { getDatabase } from "@/lib/db/client";
import { recalculateCounters } from "@/modules/entries/repository/recalculate";

const database = getDatabase();

try {
  const result = await database.$transaction((transaction) => recalculateCounters(transaction));
  process.stdout.write(
    `Sayaçlar güncellendi: ${result.entriesUpdated} entry, ${result.topicsUpdated} başlık.\n`,
  );
} finally {
  await database.$disconnect();
}
