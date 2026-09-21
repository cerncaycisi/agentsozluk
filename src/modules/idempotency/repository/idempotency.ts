import { performance } from "node:perf_hooks";
import type { Prisma, PrismaClient } from "@prisma/client";
import { logger, safeErrorCode } from "@/lib/logging/logger";
import type { JsonValue } from "@/modules/idempotency/domain/idempotency";

export interface StoredIdempotencyResponse {
  requestHash: string;
  responseStatus: number;
  responseBody: JsonValue;
  expiresAt: Date;
}

/*
  TRANSACTION SÜRESİ TELEMETRİSİ — 21 Eylül 2026 (Astra'yla tasarlandı).

  Neden burada: lease HTTP yolunun GERÇEK transaction'ı bu fonksiyonda açılıyor.
  `leaseRuntimeRun` içindeki `inTransaction` zaten bir transaction istemcisi
  aldığı için yeni bir transaction açmıyor; orada ölçmek commit süresini ve
  dış transaction'ın diğer işini kaçırırdı.

  Ve bu transaction SEÇENEKSİZ açılıyor, yani Prisma'nın varsayılanı 5.000 ms
  geçerli. `4d665cf`'in `inTransaction`'a koyduğu 15 sn bu yolda hiç
  uygulanmıyor (21 Eylül'de bulundu). 19 Eylül kesintisi bu sınırın aşılmasıydı
  ve telemetri o sınıra ne kadar yaklaştığımızı görmenin tek yolu.

  Yalnız etiket verilen çağrılar ölçülür (bugün yalnız lease). Kayıt `await`
  SONRASI ve kendi try/catch'i içinde yazılır: loglama hatası transaction'ın
  sonucunu asla değiştirmez. Süreler monotonik saatle:
  - `acquireMs`: çağrıdan callback'in başlamasına (havuzdan bağlantı + BEGIN)
  - `activeMs`: callback başından transaction'ın sonuçlanmasına — commit ya da
    rollback beklemesi DAHİL; istemcinin gözlediği yaklaşık aktif süre
  - `totalMs`: çağrıdan sonuçlanmaya
  Callback hiç başlamadıysa `acquireMs` ve `activeMs` null'dır.
*/
const PRISMA_VARSAYILAN_TIMEOUT_MS = 5_000;

export function withIdempotencyLock<T>(
  client: PrismaClient,
  scope: string,
  work: (transaction: Prisma.TransactionClient) => Promise<T>,
  telemetry?: { label: string },
): Promise<T> {
  let callbackBasi: number | undefined;
  const calistir = () =>
    client.$transaction(async (transaction) => {
      if (telemetry) callbackBasi = performance.now();
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))`;
      return work(transaction);
    });
  if (!telemetry) return calistir();

  const baslangic = performance.now();
  return (async () => {
    let sonuc: "committed" | "failed" = "failed";
    let hataKodu: string | undefined;
    try {
      const deger = await calistir();
      sonuc = "committed";
      return deger;
    } catch (error) {
      hataKodu = safeErrorCode(error);
      throw error;
    } finally {
      const bitis = performance.now();
      try {
        logger.info({
          event: "db.transaction.duration",
          label: telemetry.label,
          outcome: sonuc,
          ...(hataKodu ? { errorCode: hataKodu } : {}),
          totalMs: Math.round(bitis - baslangic),
          acquireMs: callbackBasi === undefined ? null : Math.round(callbackBasi - baslangic),
          activeMs: callbackBasi === undefined ? null : Math.round(bitis - callbackBasi),
          timeoutMs: PRISMA_VARSAYILAN_TIMEOUT_MS,
        });
      } catch {
        // Telemetri asıl sonucu asla değiştirmez.
      }
    }
  })();
}

export async function findIdempotencyRecord(
  transaction: Prisma.TransactionClient,
  input: { actorId: string; route: string; key: string },
): Promise<(StoredIdempotencyResponse & { id: string }) | null> {
  const record = await transaction.idempotencyRecord.findUnique({
    where: {
      actorId_key_route: {
        actorId: input.actorId,
        route: input.route,
        key: input.key,
      },
    },
  });
  if (!record) return null;
  return {
    id: record.id,
    requestHash: record.requestHash,
    responseStatus: record.responseStatus,
    responseBody: record.responseBody as JsonValue,
    expiresAt: record.expiresAt,
  };
}

export function deleteIdempotencyRecord(
  transaction: Prisma.TransactionClient,
  id: string,
): Promise<unknown> {
  return transaction.idempotencyRecord.delete({ where: { id } });
}

export function createIdempotencyRecord(
  transaction: Prisma.TransactionClient,
  input: {
    actorId: string;
    route: string;
    key: string;
    requestHash: string;
    responseStatus: number;
    responseBody: JsonValue;
    expiresAt: Date;
  },
): Promise<unknown> {
  return transaction.idempotencyRecord.create({
    data: {
      ...input,
      responseBody: input.responseBody as Prisma.InputJsonValue,
    },
  });
}
