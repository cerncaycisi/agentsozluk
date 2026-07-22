import { createHash } from "node:crypto";

export const EPOCH_2_FROM = "2026-07-23T00:00:00+03:00";
export const EPOCH_2_TO = "2026-07-30T00:00:00+03:00";

export type ExperimentBucket = "instruction-shaped" | "forced-timing-only";

export interface ObservationWindow {
  from: Date;
  to: Date;
}

export interface OperatorWindow extends ObservationWindow {
  bucket: ExperimentBucket;
  fingerprint: string;
}

export const OPERATOR_WINDOWS: readonly OperatorWindow[] = [
  {
    bucket: "instruction-shaped",
    from: new Date("2026-07-20T17:24:26.332+03:00"),
    to: new Date("2026-07-20T17:26:12.546+03:00"),
    fingerprint: "daedc8fd1571de2b49e9ac5a37c5bd3f60ca86387a2339febe67ddb158a4346e",
  },
  {
    bucket: "instruction-shaped",
    from: new Date("2026-07-20T18:23:52.548+03:00"),
    to: new Date("2026-07-20T18:40:34.193+03:00"),
    fingerprint: "9a799d8cd9c4bd81032cf3c8765389f355e11ce450065a8cb391f5b8ee8a1dfe",
  },
  {
    bucket: "instruction-shaped",
    from: new Date("2026-07-21T18:33:48.249+03:00"),
    to: new Date("2026-07-21T18:39:17.284+03:00"),
    fingerprint: "3dc82d7995ddfa203c0c7a8de0d711a19b264211ffe14b33865bd8fc3fb27e43",
  },
  {
    bucket: "forced-timing-only",
    from: new Date("2026-07-21T11:28:51.606+03:00"),
    to: new Date("2026-07-21T11:38:09.581+03:00"),
    fingerprint: "5e959fe2e007aef8345e6f92c132ed913ba61979c536b6742bad7081867a7766",
  },
  {
    bucket: "forced-timing-only",
    from: new Date("2026-07-21T12:02:40.568+03:00"),
    to: new Date("2026-07-21T12:08:49.904+03:00"),
    fingerprint: "af5e7b745da18106f9541ce667e8a2ac5839dba4242941aee5609df0223e0c13",
  },
  {
    bucket: "forced-timing-only",
    from: new Date("2026-07-21T17:19:17.079+03:00"),
    to: new Date("2026-07-21T19:30:56.375+03:00"),
    fingerprint: "aa101f3a563e7ea485096828014db3fb985e77fdfbf481bf512f4fc7c6b78a56",
  },
];

export const EXPECTED_OPERATOR_FINGERPRINTS = {
  instructionShaped: "a7c0ddd383331e0fad7acdd2b0c9a64f3a622f1c5467472e5a4205a66e2d3b4d",
  forcedTimingOnly: "1acf0450d2665fc765a22b9a9876cd1c1db80d72db19f69e519f75042da20e8c",
  all: "24bd6380a512fc502337d50bf5b2bb75974c1abcc215d9866d52fe4ed3c179a3",
} as const;

export type RunClass = "natural-public" | "automatic-maintenance" | "operator-directed" | "unknown";

export type ContentAttribution =
  | "natural-agent"
  | "operator-directed-agent"
  | "human"
  | "operator-directed-fallback"
  | "unattributed";

interface ParseWindowOptions {
  defaultFrom?: string;
  defaultTo?: string | (() => string);
}

const ISO_WITH_OFFSET =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/u;

function parseIsoInstant(value: string, flag: string): Date {
  const match = ISO_WITH_OFFSET.exec(value);
  if (!match) throw new Error(`${flag} must be ISO 8601 with an explicit UTC offset.`);

  const [year, month, day, hour, minute, second] = match.slice(1, 7).map((part) => Number(part));
  const milliseconds = Number((match[7] ?? "0").padEnd(3, "0"));
  const offsetHour = Number(match[10] ?? 0);
  const offsetMinute = Number(match[11] ?? 0);
  if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) {
    throw new Error(`${flag} has an invalid UTC offset.`);
  }
  const offsetSign = match[8] === "Z" ? 0 : match[9] === "+" ? 1 : -1;
  const offsetMs = offsetSign * (offsetHour * 60 + offsetMinute) * 60_000;
  const instant = new Date(
    Date.UTC(year!, month! - 1, day!, hour!, minute!, second!, milliseconds) - offsetMs,
  );
  const local = new Date(instant.getTime() + offsetMs);
  if (
    local.getUTCFullYear() !== year ||
    local.getUTCMonth() !== month! - 1 ||
    local.getUTCDate() !== day ||
    local.getUTCHours() !== hour ||
    local.getUTCMinutes() !== minute ||
    local.getUTCSeconds() !== second ||
    local.getUTCMilliseconds() !== milliseconds
  ) {
    throw new Error(`${flag} is not a valid calendar timestamp.`);
  }
  return instant;
}

function flagValues(argv: readonly string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    const equalsIndex = argument.indexOf("=");
    const flag = equalsIndex >= 0 ? argument.slice(0, equalsIndex) : argument;
    if (flag !== "--from" && flag !== "--to") throw new Error(`Unknown argument: ${argument}`);
    if (values.has(flag)) throw new Error(`${flag} may be provided only once.`);
    const value = equalsIndex >= 0 ? argument.slice(equalsIndex + 1) : argv[++index];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
    values.set(flag, value);
  }
  return values;
}

export function parseWindowArguments(
  argv: readonly string[],
  options: ParseWindowOptions = {},
): ObservationWindow {
  const values = flagValues(argv);
  const fromValue = values.get("--from") ?? options.defaultFrom;
  const defaultTo =
    typeof options.defaultTo === "function" ? options.defaultTo() : options.defaultTo;
  const toValue = values.get("--to") ?? defaultTo;
  if (!fromValue) throw new Error("--from is required.");
  if (!toValue) throw new Error("--to is required.");
  const from = parseIsoInstant(fromValue, "--from");
  const to = parseIsoInstant(toValue, "--to");
  if (from.getTime() >= to.getTime()) throw new Error("--from must be earlier than --to.");
  return { from, to };
}

export function istanbulDayKey(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const fields = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

export function istanbulDayKeys(window: ObservationWindow): string[] {
  const start = istanbulDayKey(window.from);
  const end = istanbulDayKey(new Date(window.to.getTime() - 1));
  const [startYear, startMonth, startDay] = start.split("-").map(Number);
  const cursor = new Date(Date.UTC(startYear!, startMonth! - 1, startDay!));
  const values: string[] = [];
  while (true) {
    const key = cursor.toISOString().slice(0, 10);
    values.push(key);
    if (key === end) return values;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

export function ratio(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}

export function formatRatio(numerator: number, denominator: number): string {
  const value = ratio(numerator, denominator);
  return value === null ? "N/A" : `${(value * 100).toFixed(1)}% (${numerator}/${denominator})`;
}

export function classifyRunPair(trigger: string, runType: string): RunClass {
  if (trigger === "ADMIN_MANUAL" || trigger === "ADMIN_RETRY") return "operator-directed";
  if (trigger === "STOCHASTIC_TICK" && runType === "NORMAL_WAKE") return "natural-public";
  if (
    (trigger === "NIGHTLY_MEMORY_CONSOLIDATION" && runType === "REFLECTION") ||
    (trigger === "WEEKLY_PERSONA_REFLECTION" && runType === "REFLECTION") ||
    (trigger === "DAILY_SOURCE_REFRESH" && runType === "SOURCE_REFRESH")
  ) {
    return "automatic-maintenance";
  }
  return "unknown";
}

export function operatorFallbackBucket(value: Date): ExperimentBucket | null {
  const timestamp = value.getTime();
  return (
    OPERATOR_WINDOWS.find(
      ({ from, to }) => timestamp >= from.getTime() && timestamp <= to.getTime(),
    )?.bucket ?? null
  );
}

export function classifyContentAttribution(input: {
  authorKind: "AGENT" | "HUMAN";
  createdAt: Date;
  hasRunLinkage: boolean;
  linkageValid: boolean;
  trigger: string | null;
  runType: string | null;
}): ContentAttribution {
  if (input.authorKind === "HUMAN") return "human";
  if (input.hasRunLinkage) {
    if (!input.linkageValid || !input.trigger || !input.runType) return "unattributed";
    const runClass = classifyRunPair(input.trigger, input.runType);
    if (runClass === "natural-public") return "natural-agent";
    if (runClass === "operator-directed") return "operator-directed-agent";
    return "unattributed";
  }
  return operatorFallbackBucket(input.createdAt) ? "operator-directed-fallback" : "unattributed";
}

export function fingerprintIds(ids: readonly string[]): string {
  const normalized = [...ids].sort();
  const payload = normalized.length === 0 ? "" : `${normalized.join("\n")}\n`;
  return createHash("sha256").update(payload).digest("hex");
}

export function renderTable(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => (row[index] ?? "").length)),
  );
  const render = (row: readonly string[]): string =>
    row
      .map((value, index) => value.padEnd(widths[index]!))
      .join("  ")
      .trimEnd();
  return [
    render(headers),
    widths.map((width) => "-".repeat(width)).join("  "),
    ...rows.map(render),
  ].join("\n");
}
