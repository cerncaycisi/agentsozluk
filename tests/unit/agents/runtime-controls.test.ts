import { describe, expect, it } from "vitest";
import {
  productionActivationCatchUpFrozen,
  productionRolloutAttemptDateMatches,
  publicRuntimeActionTypes,
  runtimeActionBlockedByPublicWriteControl,
  runtimeRunAllowedInOperatingMode,
  sourceFetchTargetLimit,
  terminalizeInterruptedRuntimeRun,
} from "@/modules/agents/domain/runtime-controls";

describe("global agent runtime controls", () => {
  it("freezes catch-up only on and after the rollout-attempt activation within its Istanbul day", () => {
    const activationStartedAt = new Date("2026-07-18T20:30:00.000Z"); // 23:30 Istanbul

    expect(
      productionActivationCatchUpFrozen({
        activationStartedAt,
        now: new Date("2026-07-18T20:29:59.999Z"),
      }),
    ).toBe(false);
    expect(
      productionActivationCatchUpFrozen({
        activationStartedAt,
        now: new Date("2026-07-18T20:59:59.999Z"),
      }),
    ).toBe(true);
    expect(
      productionActivationCatchUpFrozen({
        activationStartedAt,
        now: new Date("2026-07-18T21:00:00.000Z"),
      }),
    ).toBe(false);
    expect(
      productionActivationCatchUpFrozen({
        activationStartedAt: null,
        now: new Date("2026-07-18T20:59:59.999Z"),
      }),
    ).toBe(false);
  });

  it("treats an active rollout crossing Istanbul midnight as expired", () => {
    expect(
      productionRolloutAttemptDateMatches({
        attemptLocalDate: "2026-07-19",
        now: new Date("2026-07-19T20:59:59.999Z"),
      }),
    ).toBe(true);
    expect(
      productionRolloutAttemptDateMatches({
        attemptLocalDate: "2026-07-19",
        now: new Date("2026-07-19T21:00:00.000Z"),
      }),
    ).toBe(false);
    expect(
      productionRolloutAttemptDateMatches({
        attemptLocalDate: "not-a-date",
        now: new Date("2026-07-19T20:00:00.000Z"),
      }),
    ).toBe(false);
  });

  it("blocks every public write while preserving internal maintenance actions", () => {
    for (const actionType of publicRuntimeActionTypes) {
      expect(
        runtimeActionBlockedByPublicWriteControl(actionType, {
          publicWriteEnabled: false,
          runtimeOperatingMode: "NORMAL",
        }),
      ).toBe(true);
      expect(
        runtimeActionBlockedByPublicWriteControl(actionType, {
          publicWriteEnabled: true,
          runtimeOperatingMode: "MAINTENANCE",
        }),
      ).toBe(true);
      expect(
        runtimeActionBlockedByPublicWriteControl(actionType, {
          publicWriteEnabled: true,
          runtimeOperatingMode: "NORMAL",
        }),
      ).toBe(false);
    }

    for (const actionType of [
      "NO_ACTION",
      "PROPOSE_SOURCE",
      "UPDATE_BELIEF",
      "UPDATE_RELATIONSHIP_NOTE",
    ])
      expect(
        runtimeActionBlockedByPublicWriteControl(actionType, {
          publicWriteEnabled: false,
          runtimeOperatingMode: "MAINTENANCE",
        }),
      ).toBe(false);
  });

  it("leases only reflection and source refresh runs in maintenance mode", () => {
    for (const runType of ["REFLECTION", "SOURCE_REFRESH"])
      expect(runtimeRunAllowedInOperatingMode(runType, "MAINTENANCE")).toBe(true);
    for (const runType of [
      "SCHEDULED_WAKE",
      "NORMAL_WAKE",
      "ENTRY_BURST",
      "DAILY_CATCH_UP",
      "READ_ONLY",
      "DRY_RUN",
      "CAPACITY_BENCHMARK",
      "CONCURRENCY_TEST",
    ])
      expect(runtimeRunAllowedInOperatingMode(runType, "MAINTENANCE")).toBe(false);
    expect(runtimeRunAllowedInOperatingMode("NORMAL_WAKE", "NORMAL")).toBe(true);
  });

  it("uses the full source limit for refresh and a conservative ceiling for normal runs", () => {
    expect(sourceFetchTargetLimit("SOURCE_REFRESH", 8)).toBe(8);
    expect(sourceFetchTargetLimit("NORMAL_WAKE", 8)).toBe(2);
    expect(sourceFetchTargetLimit("NORMAL_WAKE", 1)).toBe(1);
    expect(sourceFetchTargetLimit("SOURCE_REFRESH", 50)).toBe(50);
    expect(() => sourceFetchTargetLimit("SOURCE_REFRESH", 0)).toThrow(/sourceFetchLimit/iu);
    expect(() => sourceFetchTargetLimit("SOURCE_REFRESH", 51)).toThrow(/sourceFetchLimit/iu);
  });

  it("preserves committed effects as PARTIAL for worker and lease-expiry interruptions", () => {
    const empty = {
      succeededActions: 0,
      committedMemoryEpisodes: 0,
      recordedSourceResults: 0,
      proposedActions: 1,
      rejectedActions: 0,
    };
    expect(terminalizeInterruptedRuntimeRun("CANCELLED", empty)).toEqual({
      outcome: "CANCELLED",
      safeRunSummary: undefined,
    });
    expect(
      terminalizeInterruptedRuntimeRun("CANCELLED", {
        ...empty,
        succeededActions: 1,
      }),
    ).toMatchObject({
      outcome: "PARTIAL",
      safeRunSummary: {
        proposedActionCount: 1,
        completedActionCount: 1,
        rejectedActionCount: 0,
      },
    });
    expect(
      terminalizeInterruptedRuntimeRun("TIMED_OUT", {
        ...empty,
        committedMemoryEpisodes: 1,
      }).outcome,
    ).toBe("PARTIAL");
    expect(
      terminalizeInterruptedRuntimeRun("CANCELLED", {
        ...empty,
        recordedSourceResults: 1,
      }).outcome,
    ).toBe("PARTIAL");
    expect(
      terminalizeInterruptedRuntimeRun("FAILED", {
        ...empty,
        succeededActions: 1,
      }).outcome,
    ).toBe("FAILED");
  });
});
