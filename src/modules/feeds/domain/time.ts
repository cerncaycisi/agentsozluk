import { DEFAULT_TIME_ZONE } from "@/config/app";

const istanbulOffsetMilliseconds = 3 * 60 * 60 * 1000;
const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: DEFAULT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function localDateParts(now: Date): { year: number; month: number; day: number } {
  const parts = Object.fromEntries(
    dateFormatter
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const { year, month, day } = parts;
  if (!year || !month || !day) throw new Error("ISTANBUL_DATE_FORMAT_FAILED");
  return { year, month, day };
}

function istanbulMidnightUtc(now: Date, dayOffset: number): Date {
  const { year, month, day } = localDateParts(now);
  return new Date(Date.UTC(year, month - 1, day + dayOffset) - istanbulOffsetMilliseconds);
}

export function currentIstanbulDayWindow(now = new Date()): { start: Date; end: Date } {
  return { start: istanbulMidnightUtc(now, 0), end: istanbulMidnightUtc(now, 1) };
}

export function previousIstanbulDayWindow(now = new Date()): { start: Date; end: Date } {
  return { start: istanbulMidnightUtc(now, -1), end: istanbulMidnightUtc(now, 0) };
}
