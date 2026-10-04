import { performance } from "node:perf_hooks";
import { runtimeProviderExecutionSafeCodes } from "../../src/runtime/provider";

export const PILOT_DURATION_MS = 90 * 60_000;
export const READER_RESERVE_MS = 15 * 60_000;
export const MANUAL_REVIEW_RESERVE_MS = 3 * 60_000;
export const MIN_CALL_MS = 60_000;
export const DECISION_TIMEOUT_MS = 6 * 60_000;
export const AUTHORITY_END = Date.parse("2026-10-17T19:50:00Z");

export function monotonicWallClock(): () => number {
  const wall = Date.now();
  const monotonic = performance.now();
  return () => Math.max(Date.now(), wall + performance.now() - monotonic);
}

export function safePilotCode(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  if (/^PILOT_[A-Z0-9_]+$/u.test(error.message)) return error.message;
  return runtimeProviderExecutionSafeCodes.some((code) => code === error.message)
    ? error.message
    : fallback;
}
