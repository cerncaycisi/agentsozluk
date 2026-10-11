import { performance } from "node:perf_hooks";
import { isDeadlockError } from "@/lib/db/errors";
import type { DatabaseClient, DatabaseExecutor, TransactionClient } from "@/lib/db/types";

export interface TransactionOptions {
  /**
    PostgreSQL kilitlenmede (40P01) işlemlerden birini iptal eder. İptal edilen
    transaction hiçbir şey yazmamış olur; işi baştan çalıştırmak güvenlidir.
    Yalnız tüm etkisi transaction içinde kalan işler bu seçeneği açar.
  */
  retryOnDeadlock?: boolean;
}

export const DEADLOCK_RETRY_ATTEMPTS = 3;
/** Çağıran bir sınır vermezse yeni deneme ilk denemenin başından en geç bu kadar sonra başlar. */
export const DEADLOCK_RETRY_BUDGET_MS = 4_000;

export interface DeadlockRetryOptions {
  /**
    `performance.now()` ölçeğinde an: bundan sonra yeni deneme başlamaz. Süre sınırı
    olan istekler (işçi 15 sn) bunu istek başından hesaplar (Sol #379).
  */
  retryUntil?: number;
  now?: () => number;
}

export async function retryOnDeadlock<T>(
  run: () => Promise<T>,
  options: DeadlockRetryOptions = {},
): Promise<T> {
  const now = options.now ?? (() => performance.now());
  const retryUntil = options.retryUntil ?? now() + DEADLOCK_RETRY_BUDGET_MS;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= DEADLOCK_RETRY_ATTEMPTS || !isDeadlockError(error)) throw error;
      // İki kurban aynı anda yeniden girip yine çakışmasın diye kısa, rastgele bekleme.
      await new Promise((resolve) => setTimeout(resolve, 20 + Math.random() * 80 * attempt));
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
    return options.retryOnDeadlock ? retryOnDeadlock(run) : run();
  }
  // İç içe çağrıda yeniden deneme en dıştaki transaction'ın işidir.
  return work(client as TransactionClient);
}

/** Kilitlenme iptalinde baştan denenen transaction; bkz. `TransactionOptions`. */
export function inDeadlockRetryingTransaction<T>(
  client: DatabaseExecutor,
  work: (transaction: TransactionClient) => Promise<T>,
): Promise<T> {
  return inTransaction(client, work, { retryOnDeadlock: true });
}
