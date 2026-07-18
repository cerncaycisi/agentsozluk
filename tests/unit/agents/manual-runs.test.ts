import { describe, expect, it } from "vitest";
import {
  isWriteCapableAgentRunType,
  MANUAL_CATCH_UP_MAX_ENTRIES_PER_RUN,
  planManualDailyCatchUp,
} from "@/modules/agents/domain/manual-runs";
import {
  cancelPendingAgentRunsSchema,
  cancelPendingGlobalAgentRunsSchema,
  gracefulStopAgentRunsSchema,
  gracefulStopGlobalAgentRunsSchema,
} from "@/modules/agents/validation/scheduling-schemas";

describe("manual agent run planning", () => {
  it("derives bounded catch-up jobs from the target after ACTIVE publications and reservations", () => {
    expect(
      planManualDailyCatchUp({
        targetEntries: 20,
        activePublishedEntries: 6,
        pendingReservedEntries: 3,
      }),
    ).toEqual({
      targetEntries: 20,
      activePublishedEntries: 6,
      pendingReservedEntries: 3,
      remainingEntries: 11,
      desiredEntryTargets: [4, 4, 3],
    });
    expect(
      planManualDailyCatchUp({
        targetEntries: 20,
        activePublishedEntries: 18,
        pendingReservedEntries: 2,
      }).desiredEntryTargets,
    ).toEqual([]);
    expect(MANUAL_CATCH_UP_MAX_ENTRIES_PER_RUN).toBe(4);
  });

  it("rejects corrupt or unbounded target inputs", () => {
    expect(() =>
      planManualDailyCatchUp({
        targetEntries: -1,
        activePublishedEntries: 0,
        pendingReservedEntries: 0,
      }),
    ).toThrow(/targetEntries/iu);
    expect(() =>
      planManualDailyCatchUp({
        targetEntries: 101,
        activePublishedEntries: 0,
        pendingReservedEntries: 0,
      }),
    ).toThrow(/sınır/iu);
  });

  it("classifies only public-write-capable run types for pending cancellation", () => {
    for (const runType of ["SCHEDULED_WAKE", "NORMAL_WAKE", "ENTRY_BURST", "DAILY_CATCH_UP"])
      expect(isWriteCapableAgentRunType(runType)).toBe(true);
    for (const runType of [
      "READ_ONLY",
      "DRY_RUN",
      "REFLECTION",
      "SOURCE_REFRESH",
      "CAPACITY_BENCHMARK",
      "CONCURRENCY_TEST",
    ])
      expect(isWriteCapableAgentRunType(runType)).toBe(false);
  });

  it("requires scope- and command-specific bulk control confirmations", () => {
    const reason = "Operator explicitly confirms this bounded bulk run control.";
    expect(
      cancelPendingAgentRunsSchema.parse({ reason, confirmation: "CANCEL_PENDING_WRITE_RUNS" }),
    ).toMatchObject({ confirmation: "CANCEL_PENDING_WRITE_RUNS" });
    expect(
      cancelPendingGlobalAgentRunsSchema.parse({
        reason,
        confirmation: "CANCEL_ALL_PENDING_WRITE_RUNS",
      }),
    ).toMatchObject({ confirmation: "CANCEL_ALL_PENDING_WRITE_RUNS" });
    expect(
      gracefulStopAgentRunsSchema.parse({
        reason,
        confirmation: "GRACEFULLY_STOP_ACTIVE_RUNS",
      }),
    ).toMatchObject({ confirmation: "GRACEFULLY_STOP_ACTIVE_RUNS" });
    expect(
      gracefulStopGlobalAgentRunsSchema.parse({
        reason,
        confirmation: "GRACEFULLY_STOP_ALL_ACTIVE_RUNS",
      }),
    ).toMatchObject({ confirmation: "GRACEFULLY_STOP_ALL_ACTIVE_RUNS" });
    expect(() =>
      cancelPendingAgentRunsSchema.parse({
        reason,
        confirmation: "CANCEL_ALL_PENDING_WRITE_RUNS",
      }),
    ).toThrow();
    expect(() =>
      gracefulStopGlobalAgentRunsSchema.parse({
        reason,
        confirmation: "GRACEFULLY_STOP_ACTIVE_RUNS",
        unexpected: true,
      }),
    ).toThrow();
  });
});
