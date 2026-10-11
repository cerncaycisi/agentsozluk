import { performance } from "node:perf_hooks";
import { isRetryableLockConflict } from "@/lib/db/errors";
import type { DatabaseClient, DatabaseExecutor, TransactionClient } from "@/lib/db/types";

export interface TransactionOptions {
  /**
    Kilit çakışmasında (kilitlenme iptali `40P01` ya da moderasyonun beklemeden
    vazgeçtiği ajan kilidi) transaction hiçbir şey yazmamış olur; işi baştan
    çalıştırmak güvenlidir. Yalnız tüm etkisi transaction içinde kalan ve süre
    sınırı olmayan insan istekleri (moderasyon) bunu açar; ajan yürütücüsü açmaz (#379).
  */
  retryOnLockConflict?: boolean;
}

export const LOCK_CONFLICT_RETRY_ATTEMPTS = 5;
/** Yeni deneme ilk denemenin başından en geç bu kadar sonra başlar. */
export const LOCK_CONFLICT_RETRY_BUDGET_MS = 4_000;

export async function retryOnLockConflict<T>(
  run: () => Promise<T>,
  now: () => number = () => performance.now(),
): Promise<T> {
  const retryUntil = now() + LOCK_CONFLICT_RETRY_BUDGET_MS;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= LOCK_CONFLICT_RETRY_ATTEMPTS || !isRetryableLockConflict(error)) throw error;
      // Ajanın kısa transaction'ı bitsin; aynı anda yeniden girilmesin diye rastgele.
      await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 150 * attempt));
      // Sınır beklemeden sonra denetlenir; yeni deneme hiçbir zaman sınırdan sonra başlamaz.
      if (now() >= retryUntil) throw error;
    }
  }
}

export function inTransaction<T>(
  client: DatabaseExecutor,
  work: (transaction: TransactionClient) => Promise<T>,
  options: TransactionOptions = {},
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
    const run = () =>
      (client as DatabaseClient).$transaction(work, { timeout: 15_000, maxWait: 5_000 });
    return options.retryOnLockConflict ? retryOnLockConflict(run) : run();
  }
  // İç içe çağrıda yeniden deneme en dıştaki transaction'ın işidir.
  return work(client as TransactionClient);
}

/** Kilit çakışmasında baştan denenen transaction; bkz. `TransactionOptions`. */
export function inLockConflictRetryingTransaction<T>(
  client: DatabaseExecutor,
  work: (transaction: TransactionClient) => Promise<T>,
): Promise<T> {
  return inTransaction(client, work, { retryOnLockConflict: true });
}
