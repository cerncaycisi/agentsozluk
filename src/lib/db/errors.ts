import { Prisma } from "@prisma/client";

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
