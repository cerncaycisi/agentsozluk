import type { DatabaseClient, DatabaseExecutor, TransactionClient } from "@/lib/db/types";

export function inTransaction<T>(
  client: DatabaseExecutor,
  work: (transaction: TransactionClient) => Promise<T>,
): Promise<T> {
  if ("$transaction" in client && typeof client.$transaction === "function") {
    /*
      Prisma'nın varsayılan interactive-transaction timeout'u 5000 ms.
      `leaseRuntimeRun` gibi devre kesici metriklerini aynı transaction'da
      hesaplayan yollar, agentRun/agentAction tabloları büyüdükçe bu sınırı
      aştı (P2028, 19 Eylül 2026 canlı kesintisi) ve her lease denemesi
      başarısız oldu. Tavanı yükseltmek yalnız gerçekten yavaşlayan
      transaction'ları kurtarır; hızlı olanların süresini değiştirmez.
    */
    return (client as DatabaseClient).$transaction(work, { timeout: 15_000, maxWait: 5_000 });
  }
  return work(client as TransactionClient);
}
