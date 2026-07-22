import { describe, expect, it } from "vitest";
import { isWriteCapableAgentRunType } from "@/modules/agents/domain/manual-runs";
import {
  cancelPendingAgentRunsSchema,
  cancelPendingGlobalAgentRunsSchema,
  gracefulStopAgentRunsSchema,
  gracefulStopGlobalAgentRunsSchema,
} from "@/modules/agents/validation/scheduling-schemas";

describe("manual agent run planning", () => {
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
