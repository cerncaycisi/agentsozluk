export const DEFAULT_EXPIRED_RECORD_BATCH_SIZE = 500;
export const DEFAULT_EXPIRED_RECORD_MAX_BATCHES = 4;
export const MAX_EXPIRED_RECORD_BATCH_SIZE = 2_000;
export const MAX_EXPIRED_RECORD_BATCHES = 10;

export interface ExpiredRecordCleanupOptions {
  now: Date;
  batchSize: number;
  maxBatches: number;
}

export interface ExpiredRecordTableTelemetry {
  beforeCount: number;
  deletedCount: number;
  remainingCount: number;
  batchesRun: number;
  oldestRemainingAgeSeconds: number | null;
}

export interface ExpiredOperationalRecordTelemetry {
  rateLimitBuckets: ExpiredRecordTableTelemetry;
  idempotencyRecords: ExpiredRecordTableTelemetry;
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/u.test(value)) throw new Error(`${label} pozitif tam sayı olmalıdır.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum)
    throw new Error(`${label} ${minimum}–${maximum} aralığında olmalıdır.`);
  return parsed;
}

export function expiredRecordCleanupOptions(
  args: string[],
  now = new Date(),
): ExpiredRecordCleanupOptions {
  const values = new Map<string, string>();
  for (const argument of args) {
    const match = /^--(batch-size|max-batches)=(.+)$/u.exec(argument);
    if (!match?.[1] || !match[2]) throw new Error(`Bilinmeyen bakım argümanı: ${argument}`);
    if (values.has(match[1])) throw new Error(`Bakım argümanı tekrarlandı: --${match[1]}`);
    values.set(match[1], match[2]);
  }
  return {
    now,
    batchSize: boundedInteger(
      values.get("batch-size"),
      DEFAULT_EXPIRED_RECORD_BATCH_SIZE,
      1,
      MAX_EXPIRED_RECORD_BATCH_SIZE,
      "batch-size",
    ),
    maxBatches: boundedInteger(
      values.get("max-batches"),
      DEFAULT_EXPIRED_RECORD_MAX_BATCHES,
      1,
      MAX_EXPIRED_RECORD_BATCHES,
      "max-batches",
    ),
  };
}

export function oldestExpiredAgeSeconds(now: Date, oldest: Date | null): number | null {
  if (!oldest) return null;
  return Math.max(0, Math.floor((now.getTime() - oldest.getTime()) / 1000));
}
