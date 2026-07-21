import { DEFAULT_LOCALE, DEFAULT_TIME_ZONE } from "@/config/app";

type TimestampValue = Date | string | number;

function asDate(value: TimestampValue): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError("Geçerli bir timestamp gereklidir.");
  return date;
}

export function formatIstanbulDate(value: TimestampValue): string {
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    timeZone: DEFAULT_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(asDate(value));
}

export function formatIstanbulTimestamp(
  value: TimestampValue,
  options: { includeSeconds?: boolean } = {},
): string {
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    timeZone: DEFAULT_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(options.includeSeconds ? { second: "2-digit" as const } : {}),
    hourCycle: "h23",
  }).format(asDate(value));
}
