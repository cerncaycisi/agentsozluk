import { Prisma } from "@prisma/client";
import { AppError } from "@/lib/http/errors";

export function isDatabaseError(
  error: unknown,
  code: string,
): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function metadataStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/**
 * Prisma exposes a unique violation as either a field target or a database
 * constraint name depending on the connector and query shape. Keep the raw
 * metadata behind the data-access boundary so callers can match only exact,
 * expected identifiers instead of inspecting an error message.
 */
export function getDatabaseErrorTargets(error: unknown, code: string): string[] {
  if (!isDatabaseError(error, code)) return [];
  return [...metadataStrings(error.meta?.target), ...metadataStrings(error.meta?.constraint)];
}

/**
 * PostgreSQL kilitlenme iptali. ORM sorguları bunu P2034, ham sorgular P2010 +
 * `40P01` olarak taşır (10 Ekim 2026, yerel PostgreSQL 16 ölçümü).
 */
export function isDeadlockError(error: unknown): boolean {
  // İptal edilmiş Proxy gibi okunurken fırlatan hata nesneleri asıl hata olarak kalmalı.
  try {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code === "P2034") return true;
    return error.code === "P2010" && error.meta?.code === "40P01";
  } catch {
    return false;
  }
}

/** `FOR ... NOWAIT` kilidi alınamadı (`55P03`). */
export function isLockNotAvailableError(error: unknown): boolean {
  try {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2010" &&
      error.meta?.code === "55P03"
    );
  } catch {
    return false;
  }
}

/**
 * Moderasyon, ajan yürütücüsünün tuttuğu kilidi beklemek yerine bu hatayla kendi
 * transaction'ını geri alır; böylece yürütücü hiçbir zaman kilitlenme kurbanı olmaz.
 * Yeniden denemeler tükenirse kullanıcıya 409 olarak görünür (#379).
 */
export class TransientLockConflictError extends AppError {
  constructor() {
    super(
      "AGENT_PROFILE_STATE_CONFLICT",
      409,
      "Ajan şu an bu içerik üzerinde çalışıyor; birkaç saniye sonra yeniden deneyin.",
    );
    this.name = "TransientLockConflictError";
  }
}

export function isRetryableLockConflict(error: unknown): boolean {
  try {
    return error instanceof TransientLockConflictError || isDeadlockError(error);
  } catch {
    return false;
  }
}
