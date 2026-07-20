import type { TransactionClient } from "@/lib/db/types";
import {
  evaluateProductionGate9,
  evaluateProductionGate10,
  evaluateProductionGate11,
  evaluateProductionRolloutOrder,
  productionP75DurationMs,
  selectFirstThreeProductionScheduledRuns,
  type ProductionRunProof,
} from "@/modules/agents/domain/production-rollout";
import {
  findProductionRolloutAttemptEvents,
  findProductionRolloutCommandReplay,
  findProductionRolloutGate10CheckpointEvents,
  loadProductionGate9Proof,
  loadProductionGate11Proof,
  productionRolloutEventTypes,
} from "@/modules/agents/repository/production-rollout";
import { describe, expect, it, vi } from "vitest";

const localDate = "2026-07-19";
const baseCreatedAt = new Date("2026-07-19T06:01:00.000Z");

function runProof(overrides: Partial<ProductionRunProof> = {}): ProductionRunProof {
  const id = overrides.id ?? "run-1";
  return {
    id,
    agentProfileId: "agent-1",
    personaVersionId: "persona-1",
    runType: "SCHEDULED_WAKE",
    runStatus: "SUCCEEDED",
    trigger: "SCHEDULER_SLOT",
    scheduleSlotId: `slot-${id}`,
    scheduleSlotStatus: "COMPLETED",
    scheduleSlotRunId: id,
    createdAt: baseCreatedAt,
    startedAt: new Date(baseCreatedAt.getTime() + 1000),
    finishedAt: new Date(baseCreatedAt.getTime() + 61_000),
    timeoutSeconds: 600,
    attempts: 1,
    desiredEntryMin: 0,
    desiredEntryMax: 1,
    actionCount: 1,
    distinctActionSequenceCount: 1,
    proposedActionCount: 1,
    succeededActionCount: 1,
    publicActionCount: 1,
    provenanceBackedPublicActionCount: 1,
    contentRecordCount: 1,
    distinctContentEntryCount: 1,
    distinctContentActionCount: 1,
    provenanceBackedContentCount: 1,
    auditEventCount: 1,
    runtimeEventCount: 1,
    supportingEvidenceTimestamps: [new Date(baseCreatedAt.getTime() + 30_000)],
    outbox: { queued: 1, started: 1, completed: 1, failed: 0 },
    ...overrides,
  };
}

function gate9Input() {
  const readOnlyRun = runProof({
    id: "read",
    runType: "READ_ONLY",
    trigger: "ADMIN_MANUAL",
    scheduleSlotId: null,
    scheduleSlotStatus: null,
    scheduleSlotRunId: null,
    publicActionCount: 0,
    provenanceBackedPublicActionCount: 0,
    contentRecordCount: 0,
    distinctContentEntryCount: 0,
    distinctContentActionCount: 0,
    provenanceBackedContentCount: 0,
  });
  const dryRun = runProof({
    id: "dry",
    runType: "DRY_RUN",
    trigger: "ADMIN_MANUAL",
    scheduleSlotId: null,
    scheduleSlotStatus: null,
    scheduleSlotRunId: null,
    succeededActionCount: 0,
    publicActionCount: 0,
    provenanceBackedPublicActionCount: 0,
    contentRecordCount: 0,
    distinctContentEntryCount: 0,
    distinctContentActionCount: 0,
    provenanceBackedContentCount: 0,
  });
  const normalWakeRun = runProof({
    id: "normal",
    runType: "NORMAL_WAKE",
    trigger: "ADMIN_MANUAL",
    scheduleSlotId: null,
    scheduleSlotStatus: null,
    scheduleSlotRunId: null,
  });
  const gracefulCancellationRun = runProof({
    id: "graceful",
    runType: "NORMAL_WAKE",
    runStatus: "CANCELLED",
    trigger: "ADMIN_MANUAL",
    scheduleSlotId: null,
    scheduleSlotStatus: null,
    scheduleSlotRunId: null,
    publicActionCount: 0,
    contentRecordCount: 0,
  });
  const pendingCancellationRun = runProof({
    id: "pending",
    runType: "NORMAL_WAKE",
    runStatus: "CANCELLED",
    trigger: "ADMIN_MANUAL",
    scheduleSlotId: null,
    scheduleSlotStatus: null,
    scheduleSlotRunId: null,
    startedAt: null,
    attempts: 0,
    publicActionCount: 0,
    contentRecordCount: 0,
  });
  return {
    attemptLocalDate: localDate,
    attemptStartedAt: new Date("2026-07-19T06:00:00.000Z"),
    gateObservedAt: new Date("2026-07-19T06:15:00.000Z"),
    smokeAgentProfileId: "agent-1",
    readOnlyRun,
    dryRun,
    normalWakeRun,
    gracefulCancellationRun,
    pendingCancellationRun,
    takedownProof: {
      entryLinkedToNormalWake: true,
      reportTargetsEntry: true,
      entryHiddenModerationActionCount: 1,
      entryRestoredModerationActionCount: 1,
      entryHiddenAuditCount: 1,
      entryRestoredAuditCount: 1,
      evidenceTimestamps: [
        new Date("2026-07-19T06:05:30.000Z"),
        new Date("2026-07-19T06:10:30.000Z"),
        new Date("2026-07-19T06:11:00.000Z"),
        new Date("2026-07-19T06:12:00.000Z"),
      ],
    },
  };
}

function gate10Runs(): ProductionRunProof[] {
  return Array.from({ length: 5 }, (_, index) => {
    const createdAt = new Date(baseCreatedAt.getTime() + index * 60_000);
    return runProof({
      id: `gate10-${index + 1}`,
      agentProfileId: `agent-${index + 1}`,
      createdAt,
      startedAt: new Date(createdAt.getTime() + 1000),
      finishedAt: new Date(createdAt.getTime() + 61_000),
    });
  });
}

describe("production rollout proof domain", () => {
  it("accepts the exact Gate 9 zero-write, public-write and cancellation evidence", () => {
    expect(evaluateProductionGate9(gate9Input())).toMatchObject({
      passed: true,
      failures: [],
      metrics: { publicWriteCount: 1 },
    });
  });

  it("fails Gate 9 when dry-run executes or normal outbox is duplicated", () => {
    const input = gate9Input();
    const result = evaluateProductionGate9({
      ...input,
      dryRun: { ...input.dryRun, succeededActionCount: 1 },
      normalWakeRun: {
        ...input.normalWakeRun,
        outbox: { ...input.normalWakeRun.outbox, completed: 2 },
      },
      takedownProof: {
        ...input.takedownProof,
        reportTargetsEntry: false,
        entryRestoredAuditCount: 0,
      },
    });
    expect(result.passed).toBe(false);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        "DRY_RUN_EXECUTED_ACTION_DETECTED",
        "NORMAL_WAKE_OUTBOX_NOT_EXACT_ONCE",
        "NORMAL_WAKE_REPORT_LINK_MISSING",
        "NORMAL_WAKE_TAKEDOWN_AUDIT_EVIDENCE_INVALID",
      ]),
    );
  });

  it("rejects same-day Gate 9 run evidence created before the current attempt", () => {
    const input = gate9Input();
    const createdAt = new Date("2026-07-19T05:58:00.000Z");
    const result = evaluateProductionGate9({
      ...input,
      readOnlyRun: {
        ...input.readOnlyRun,
        createdAt,
        startedAt: new Date("2026-07-19T05:58:10.000Z"),
        finishedAt: new Date("2026-07-19T05:59:00.000Z"),
        supportingEvidenceTimestamps: [new Date("2026-07-19T05:58:30.000Z")],
      },
    });

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        "SMOKE_RUN_OUTSIDE_ATTEMPT_WINDOW",
        "SMOKE_EVIDENCE_OUTSIDE_ATTEMPT_WINDOW",
      ]),
    );
    expect(result.failures).not.toContain("SMOKE_RUN_OUTSIDE_ATTEMPT_DATE");
  });

  it("rejects Gate 9 supporting evidence timestamped after the checkpoint cutoff", () => {
    const input = gate9Input();
    const result = evaluateProductionGate9({
      ...input,
      normalWakeRun: {
        ...input.normalWakeRun,
        supportingEvidenceTimestamps: [new Date("2026-07-19T06:15:00.001Z")],
      },
      takedownProof: {
        ...input.takedownProof,
        evidenceTimestamps: [new Date("2026-07-19T06:16:00.000Z")],
      },
    });

    expect(result.failures).toEqual(
      expect.arrayContaining([
        "SMOKE_EVIDENCE_OUTSIDE_ATTEMPT_WINDOW",
        "NORMAL_WAKE_TAKEDOWN_EVIDENCE_OUTSIDE_ATTEMPT_WINDOW",
      ]),
    );
  });

  it("uses nearest-rank p75 and accepts the complete continuous five-agent gate", () => {
    const runs = gate10Runs();
    expect(
      productionP75DurationMs([
        runProof({ startedAt: new Date(0), finishedAt: new Date(1000) }),
        runProof({ startedAt: new Date(0), finishedAt: new Date(2000) }),
        runProof({ startedAt: new Date(0), finishedAt: new Date(3000) }),
        runProof({ startedAt: new Date(0), finishedAt: new Date(4000) }),
      ]),
    ).toBe(3000);
    expect(
      evaluateProductionGate10({
        attemptLocalDate: localDate,
        cohortAgentIds: ["agent-1", "agent-2", "agent-3", "agent-4", "agent-5"],
        windowStartedAt: new Date("2026-07-19T06:00:00.000Z"),
        windowFinishedAt: new Date("2026-07-19T08:00:00.000Z"),
        runs,
        capacitySnapshot: {
          id: "capacity-1",
          localDate,
          createdAt: new Date("2026-07-19T06:00:30.000Z"),
          reserveFactor: 0.75,
          capacityStatus: "HEALTHY",
          linkedActiveAgentIds: ["agent-1", "agent-2", "agent-3", "agent-4", "agent-5"],
        },
        criticalBreakerCount: 0,
        checkpointMinutes: [0, 30, 60, 90, 120],
      }),
    ).toMatchObject({
      passed: true,
      failures: [],
      metrics: { terminalRunCount: 5, successfulAgentCount: 5, successRate: 1 },
    });
  });

  it("does not let manual runs, incomplete coverage or a breaker satisfy Gate 10", () => {
    const runs = gate10Runs();
    runs[4] = runProof({
      id: "manual-substitute",
      agentProfileId: "agent-5",
      runType: "NORMAL_WAKE",
      trigger: "MANUAL_SINGLE",
      scheduleSlotId: null,
      scheduleSlotStatus: null,
      scheduleSlotRunId: null,
    });
    const result = evaluateProductionGate10({
      attemptLocalDate: localDate,
      cohortAgentIds: ["agent-1", "agent-2", "agent-3", "agent-4", "agent-5"],
      windowStartedAt: new Date("2026-07-19T06:00:00.000Z"),
      windowFinishedAt: new Date("2026-07-19T07:59:59.000Z"),
      runs,
      capacitySnapshot: null,
      criticalBreakerCount: 1,
      checkpointMinutes: [0, 30],
    });
    expect(result.passed).toBe(false);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        "WINDOW_SHORTER_THAN_TWO_HOURS",
        "NON_SCHEDULED_RUN_INCLUDED",
        "TERMINAL_RUN_SAMPLE_TOO_SMALL",
        "FIVE_AGENT_SUCCESS_COVERAGE_MISSING",
        "CAPACITY_SNAPSHOT_MISSING",
        "CRITICAL_BREAKER_DETECTED",
        "OBSERVATION_CHECKPOINT_COVERAGE_MISSING",
      ]),
    );
  });

  it("pins Gate 11 to the first three scheduled runs instead of a later replacement", () => {
    const escalationStartedAt = new Date("2026-07-19T09:00:00.000Z");
    const runs = Array.from({ length: 4 }, (_, index) => {
      const createdAt = new Date(escalationStartedAt.getTime() + (index + 1) * 60_000);
      return runProof({
        id: `scheduled-${index + 1}`,
        agentProfileId: `agent-${index + 1}`,
        runStatus: index === 0 ? "FAILED" : "SUCCEEDED",
        createdAt,
        startedAt: new Date(createdAt.getTime() + 1000),
        finishedAt: new Date(createdAt.getTime() + 61_000),
      });
    });
    expect(
      selectFirstThreeProductionScheduledRuns(runs, escalationStartedAt).map(({ id }) => id),
    ).toEqual(["scheduled-1", "scheduled-2", "scheduled-3"]);
    const result = evaluateProductionGate11({
      attemptLocalDate: localDate,
      escalationStartedAt,
      runs,
    });
    expect(result.passed).toBe(false);
    expect(result.failures).toContain("FIRST_THREE_RUN_NOT_SUCCEEDED");
    expect(result.metrics.firstThreeRunIds).not.toContain("scheduled-4");
  });

  it("accepts three exact-once scheduled runs and rejects duplicate outbox/timeout evidence", () => {
    const escalationStartedAt = new Date("2026-07-19T09:00:00.000Z");
    const runs = Array.from({ length: 3 }, (_, index) => {
      const createdAt = new Date(escalationStartedAt.getTime() + (index + 1) * 60_000);
      return runProof({
        id: `success-${index + 1}`,
        createdAt,
        startedAt: new Date(createdAt.getTime() + 1000),
        finishedAt: new Date(createdAt.getTime() + 61_000),
      });
    });
    expect(
      evaluateProductionGate11({ attemptLocalDate: localDate, escalationStartedAt, runs }),
    ).toMatchObject({ passed: true, failures: [] });

    const invalid = evaluateProductionGate11({
      attemptLocalDate: localDate,
      escalationStartedAt,
      runs: [
        { ...runs[0]!, timeoutSeconds: 1, outbox: { ...runs[0]!.outbox, started: 2 } },
        runs[1]!,
        runs[2]!,
      ],
    });
    expect(invalid.failures).toEqual(
      expect.arrayContaining([
        "FIRST_THREE_RUN_EXCEEDED_TIMEOUT",
        "FIRST_THREE_OUTBOX_NOT_EXACT_ONCE",
      ]),
    );
  });

  it("requires ordered same-day milestones and a real two-hour Gate 10 interval", () => {
    const valid = {
      attemptLocalDate: localDate,
      attemptStartedAt: new Date("2026-07-19T04:00:00.000Z"),
      gate9CompletedAt: new Date("2026-07-19T05:00:00.000Z"),
      gate10StartedAt: new Date("2026-07-19T06:00:00.000Z"),
      gate10CompletedAt: new Date("2026-07-19T08:00:00.000Z"),
      gate11StartedAt: new Date("2026-07-19T09:00:00.000Z"),
      gate11CompletedAt: new Date("2026-07-19T10:00:00.000Z"),
    };
    expect(evaluateProductionRolloutOrder(valid)).toEqual({ passed: true, failures: [] });
    expect(
      evaluateProductionRolloutOrder({
        ...valid,
        gate10CompletedAt: new Date("2026-07-19T05:30:00.000Z"),
        gate11CompletedAt: new Date("2026-07-19T22:30:00.000Z"),
      }).failures,
    ).toEqual(
      expect.arrayContaining([
        "ROLLOUT_MILESTONE_OUTSIDE_ATTEMPT_DATE",
        "ROLLOUT_MILESTONE_ORDER_INVALID",
        "GATE_10_WINDOW_SHORTER_THAN_TWO_HOURS",
      ]),
    );
  });
});

describe("production rollout immutable repository", () => {
  it("reads Gate 10 samples only from the global rollout journal", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const transaction = {
      agentRuntimeEvent: { findMany },
    } as unknown as TransactionClient;
    const windowStartedAt = new Date("2026-07-19T06:00:00.000Z");
    const windowFinishedAt = new Date("2026-07-19T08:00:00.000Z");

    await findProductionRolloutGate10CheckpointEvents(transaction, {
      attemptId: "attempt-1",
      windowStartedAt,
      windowFinishedAt,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        eventType: productionRolloutEventTypes.gate10Checkpoint,
        agentProfileId: null,
        runId: null,
        actionId: null,
        metadata: { path: ["attemptId"], equals: "attempt-1" },
        occurredAt: { gte: windowStartedAt, lte: windowFinishedAt },
      },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      select: { metadata: true },
    });
  });

  it("looks up attempt events and command replay only in the immutable runtime journal", async () => {
    const replayEvent = {
      id: 41n,
      eventType: productionRolloutEventTypes.gate10Completed,
      metadata: {
        commandId: "command-1",
        attemptId: "attempt-1",
        command: "COMPLETE_GATE_10",
        requestHash: "hash-1",
        result: { passed: true },
      },
      occurredAt: new Date("2026-07-19T08:00:00.000Z"),
      createdAt: new Date("2026-07-19T08:00:00.000Z"),
    };
    const findMany = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([replayEvent]);
    const transaction = {
      agentRuntimeEvent: { findMany },
    } as unknown as TransactionClient;

    await findProductionRolloutAttemptEvents(transaction, "attempt-1");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          metadata: { path: ["attemptId"], equals: "attempt-1" },
        }),
        orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      }),
    );
    await expect(
      findProductionRolloutCommandReplay(transaction, "command-1"),
    ).resolves.toMatchObject({
      commandId: "command-1",
      attemptId: "attempt-1",
      command: "COMPLETE_GATE_10",
      requestHash: "hash-1",
      result: { passed: true },
      duplicateEventDetected: false,
    });
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          metadata: { path: ["commandId"], equals: "command-1" },
        }),
        take: 2,
      }),
    );
  });

  it("corroborates the Gate 9 entry, report and immutable hide/restore records", async () => {
    const transaction = {
      agentRun: { findMany: vi.fn().mockResolvedValue([]) },
      agentContentRecord: {
        findUnique: vi.fn().mockResolvedValue({
          entryId: "entry-1",
          runId: "normal-1",
          createdAt: new Date("2026-07-19T06:05:30.000Z"),
          entry: { createdAt: new Date("2026-07-19T06:05:30.000Z") },
        }),
      },
      report: {
        findUnique: vi.fn().mockResolvedValue({
          id: "report-1",
          targetType: "ENTRY",
          targetId: "entry-1",
          createdAt: new Date("2026-07-19T06:10:30.000Z"),
          updatedAt: new Date("2026-07-19T06:12:00.000Z"),
          handledAt: new Date("2026-07-19T06:12:00.000Z"),
        }),
      },
      moderationAction: {
        findMany: vi.fn().mockResolvedValue([
          { actionType: "ENTRY_HIDDEN", createdAt: new Date("2026-07-19T06:11:00.000Z") },
          { actionType: "ENTRY_RESTORED", createdAt: new Date("2026-07-19T06:12:00.000Z") },
        ]),
      },
      auditLog: {
        findMany: vi.fn().mockResolvedValue([
          { action: "entry.hidden", createdAt: new Date("2026-07-19T06:11:00.000Z") },
          { action: "entry.restored", createdAt: new Date("2026-07-19T06:12:00.000Z") },
        ]),
      },
    } as unknown as TransactionClient;

    await expect(
      loadProductionGate9Proof(transaction, {
        readOnlyRunId: "read-1",
        dryRunId: "dry-1",
        normalWakeRunId: "normal-1",
        normalWakeEntryId: "entry-1",
        reportId: "report-1",
        gracefulCancellationRunId: "graceful-1",
        pendingCancellationRunId: "pending-1",
      }),
    ).resolves.toMatchObject({
      takedownProof: {
        entryLinkedToNormalWake: true,
        reportTargetsEntry: true,
        entryHiddenModerationActionCount: 1,
        entryRestoredModerationActionCount: 1,
        entryHiddenAuditCount: 1,
        entryRestoredAuditCount: 1,
      },
    });
  });

  it("queries and hydrates only the deterministic first three Gate 11 runs", async () => {
    const createdAt = new Date("2026-07-19T09:01:00.000Z");
    const findRuns = vi.fn().mockResolvedValue([
      {
        id: "run-1",
        agentProfileId: "agent-1",
        personaVersionId: "persona-1",
        runType: "SCHEDULED_WAKE",
        runStatus: "SUCCEEDED",
        trigger: "SCHEDULER_SLOT",
        scheduleSlotId: "slot-1",
        createdAt,
        startedAt: new Date(createdAt.getTime() + 1000),
        finishedAt: new Date(createdAt.getTime() + 61_000),
        timeoutSeconds: 600,
        attempts: 1,
        desiredEntryMin: 0,
        desiredEntryMax: 1,
        requestedScheduleSlot: { id: "slot-1", status: "COMPLETED", runId: "run-1" },
      },
    ]);
    const transaction = {
      agentRun: { findMany: findRuns },
      agentAction: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "action-1",
            runId: "run-1",
            sequence: 1,
            actionType: "CREATE_ENTRY",
            actionStatus: "SUCCEEDED",
            provenance: { evidenceIds: ["evidence-1"] },
          },
        ]),
      },
      agentContentRecord: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ runId: "run-1", entryId: "entry-1", actionId: "action-1" }]),
      },
      outboxEvent: {
        findMany: vi.fn().mockResolvedValue([
          { aggregateId: "run-1", eventType: "agent.run.queued" },
          { aggregateId: "run-1", eventType: "agent.run.started" },
          { aggregateId: "run-1", eventType: "agent.run.completed" },
        ]),
      },
      auditLog: { findMany: vi.fn().mockResolvedValue([{ entityId: "run-1" }]) },
      agentRuntimeEvent: { findMany: vi.fn().mockResolvedValue([{ runId: "run-1" }]) },
    } as unknown as TransactionClient;

    await expect(
      loadProductionGate11Proof(transaction, {
        escalationStartedAt: new Date("2026-07-19T09:00:00.000Z"),
        windowFinishedAt: new Date("2026-07-19T12:00:00.000Z"),
      }),
    ).resolves.toMatchObject([
      {
        id: "run-1",
        publicActionCount: 1,
        provenanceBackedContentCount: 1,
        outbox: { queued: 1, started: 1, completed: 1, failed: 0 },
      },
    ]);
    expect(findRuns).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          runType: "SCHEDULED_WAKE",
          trigger: "SCHEDULER_SLOT",
          scheduleSlotId: { not: null },
        }),
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 3,
      }),
    );
  });
});
