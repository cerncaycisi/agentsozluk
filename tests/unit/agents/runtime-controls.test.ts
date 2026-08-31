import { describe, expect, it } from "vitest";
import {
  productionRolloutAttemptDateMatches,
  publicRuntimeActionTypes,
  isExternalEffectRuntimeAction,
  isPublicRuntimeAction,
  runtimeActionBlockedByPublicWriteControl,
  runtimeRunAllowedInOperatingMode,
  societyFlowEnabled,
  sourceFetchTargetLimit,
  terminalizeInterruptedRuntimeRun,
} from "@/modules/agents/domain/runtime-controls";

describe("global agent runtime controls", () => {
  it("requires every continuous-flow control before reporting the society as running", () => {
    const running = {
      runtimeEnabled: true,
      schedulerEnabled: true,
      publishEnabled: true,
      publicWriteEnabled: true,
      runtimeOperatingMode: "NORMAL" as const,
    };
    expect(societyFlowEnabled(running)).toBe(true);
    expect(societyFlowEnabled({ ...running, runtimeEnabled: false })).toBe(false);
    expect(societyFlowEnabled({ ...running, schedulerEnabled: false })).toBe(false);
    expect(societyFlowEnabled({ ...running, publishEnabled: false })).toBe(false);
    expect(societyFlowEnabled({ ...running, publicWriteEnabled: false })).toBe(false);
    expect(societyFlowEnabled({ ...running, runtimeOperatingMode: "MAINTENANCE" })).toBe(false);
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

    for (const actionType of ["NO_ACTION", "UPDATE_BELIEF", "UPDATE_RELATIONSHIP_NOTE"])
      expect(
        runtimeActionBlockedByPublicWriteControl(actionType, {
          publicWriteEnabled: false,
          runtimeOperatingMode: "MAINTENANCE",
        }),
      ).toBe(false);
  });

  /*
    PROPOSE_SOURCE bu testte "iç bakım aksiyonu" sayılıp ENGELLENMEMESİ
    pinlenmişti; varsayım yanlıştı. Aksiyon public içerik yazmıyor ama modelin
    ürettiği URL doğrudan PROBATION kaydına giriyor ve sonraki source-enabled
    koşuda sunucu o adrese gerçek bir GET atıyor. Yani "public yazmayı kapat"
    denildiğinde dışarı istek doğuran bu yol açık kalıyordu — kill switch'in
    kapsamadığı bir dış etki kanalı.

    Kapılar artık `isExternalEffectRuntimeAction` kullanıyor; metrikler
    (`publicActionCount`) eski `isPublicRuntimeAction` tanımında kaldı, yoksa
    üretim rollout kabul ölçütünün anlamı değişirdi.
  */
  it("blocks PROPOSE_SOURCE with the public write kill switch", () => {
    for (const controls of [
      { publicWriteEnabled: false, runtimeOperatingMode: "NORMAL" as const },
      { publicWriteEnabled: true, runtimeOperatingMode: "MAINTENANCE" as const },
      { publicWriteEnabled: false, runtimeOperatingMode: "MAINTENANCE" as const },
    ])
      expect(runtimeActionBlockedByPublicWriteControl("PROPOSE_SOURCE", controls)).toBe(true);
    expect(
      runtimeActionBlockedByPublicWriteControl("PROPOSE_SOURCE", {
        publicWriteEnabled: true,
        runtimeOperatingMode: "NORMAL",
      }),
    ).toBe(false);
    // Kapı kümesi genişledi ama metrik kümesi genişlemedi.
    expect(isExternalEffectRuntimeAction("PROPOSE_SOURCE")).toBe(true);
    expect(isPublicRuntimeAction("PROPOSE_SOURCE")).toBe(false);
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

  it("uses the full source limit for refresh and a bounded three-source window for normal runs", () => {
    expect(sourceFetchTargetLimit("SOURCE_REFRESH", 8)).toBe(8);
    expect(sourceFetchTargetLimit("NORMAL_WAKE", 8)).toBe(3);
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
