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
