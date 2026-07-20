import { istanbulCalendarDateKey } from "@/modules/agents/domain/runtime-controls";

export const PRODUCTION_GATE_10_MINIMUM_WINDOW_MS = 2 * 60 * 60_000;
export const PRODUCTION_GATE_10_MINIMUM_TERMINAL_RUNS = 5;
export const PRODUCTION_GATE_10_MINIMUM_SUCCESS_RATE = 0.9;
export const PRODUCTION_GATE_10_MAXIMUM_P75_DURATION_MS = 5 * 60_000;
export const PRODUCTION_GATE_10_REQUIRED_CHECKPOINT_MINUTES = [0, 30, 60, 90, 120] as const;
export const PRODUCTION_MINIMUM_CAPACITY_RESERVE_FACTOR = 0.75;

const terminalRunStatuses = new Set(["SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED", "TIMED_OUT"]);

export interface ProductionOutboxProof {
  queued: number;
  started: number;
  completed: number;
  failed: number;
}

export interface ProductionRunProof {
  id: string;
  agentProfileId: string;
  personaVersionId: string;
  runType: string;
  runStatus: string;
  trigger: string;
  scheduleSlotId: string | null;
  scheduleSlotStatus: string | null;
  scheduleSlotRunId: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  timeoutSeconds: number;
  attempts: number;
  desiredEntryMin: number;
  desiredEntryMax: number;
  actionCount: number;
  distinctActionSequenceCount: number;
  proposedActionCount: number;
  succeededActionCount: number;
  publicActionCount: number;
  provenanceBackedPublicActionCount: number;
  contentRecordCount: number;
  distinctContentEntryCount: number;
  distinctContentActionCount: number;
  provenanceBackedContentCount: number;
  auditEventCount: number;
  runtimeEventCount: number;
  supportingEvidenceTimestamps: readonly Date[];
  outbox: ProductionOutboxProof;
}

export interface ProductionCapacityProof {
  id: string;
  localDate: string;
  createdAt: Date;
  reserveFactor: number;
  capacityStatus: string;
  linkedActiveAgentIds: readonly string[];
}

function validLocalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function everyTimestampOnDate(values: ReadonlyArray<Date | null>, localDate: string): boolean {
  return values.every(
    (value) =>
      value !== null &&
      Number.isFinite(value.getTime()) &&
      istanbulCalendarDateKey(value) === localDate,
  );
}

function orderedRunTimestamps(run: ProductionRunProof, started: boolean): boolean {
  const createdAt = run.createdAt.getTime();
  const finishedAt = run.finishedAt?.getTime() ?? Number.NaN;
  if (!Number.isFinite(createdAt) || !Number.isFinite(finishedAt)) return false;
  if (!started) return run.startedAt === null && createdAt <= finishedAt;
  const startedAt = run.startedAt?.getTime() ?? Number.NaN;
  return Number.isFinite(startedAt) && createdAt <= startedAt && startedAt <= finishedAt;
}

function validAttemptWindow(startedAt: Date, observedAt: Date, localDate: string): boolean {
  const start = startedAt.getTime();
  const end = observedAt.getTime();
  return (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start <= end &&
    everyTimestampOnDate([startedAt, observedAt], localDate)
  );
}

function everyTimestampInAttemptWindow(
  values: ReadonlyArray<Date | null>,
  startedAt: Date,
  observedAt: Date,
  localDate: string,
): boolean {
  const start = startedAt.getTime();
  const end = observedAt.getTime();
  return values.every((value) => {
    if (value === null) return false;
    const timestamp = value.getTime();
    return (
      Number.isFinite(timestamp) &&
      timestamp >= start &&
      timestamp <= end &&
      istanbulCalendarDateKey(value) === localDate
    );
  });
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function addFailure<T extends string>(failures: T[], failure: T, failed: boolean): void {
  if (failed && !failures.includes(failure)) failures.push(failure);
}

export function productionRunDurationMs(run: ProductionRunProof): number | null {
  if (!run.startedAt || !run.finishedAt) return null;
  const duration = run.finishedAt.getTime() - run.startedAt.getTime();
  return duration >= 0 ? duration : null;
}

/** Nearest-rank percentile, matching the runtime capability calculation. */
export function productionP75DurationMs(runs: readonly ProductionRunProof[]): number | null {
  const durations = runs
    .map(productionRunDurationMs)
    .filter((duration): duration is number => duration !== null)
    .sort((left, right) => left - right);
  if (durations.length === 0) return null;
  return durations[Math.ceil(durations.length * 0.75) - 1] ?? null;
}

export function isProductionScheduledRun(run: ProductionRunProof): boolean {
  return (
    run.runType === "SCHEDULED_WAKE" &&
    run.trigger === "SCHEDULER_SLOT" &&
    run.scheduleSlotId !== null
  );
}

export type ProductionGate9Failure =
  | "ATTEMPT_LOCAL_DATE_INVALID"
  | "ATTEMPT_WINDOW_INVALID"
  | "READ_ONLY_RUN_MISSING"
  | "DRY_RUN_MISSING"
  | "NORMAL_WAKE_RUN_MISSING"
  | "SMOKE_PROFILE_MISMATCH"
  | "SMOKE_RUN_TYPE_MISMATCH"
  | "SMOKE_RUN_NOT_SUCCEEDED"
  | "SMOKE_RUN_TIMESTAMP_ORDER_INVALID"
  | "SMOKE_RUN_OUTSIDE_ATTEMPT_DATE"
  | "SMOKE_RUN_OUTSIDE_ATTEMPT_WINDOW"
  | "SMOKE_EVIDENCE_OUTSIDE_ATTEMPT_WINDOW"
  | "READ_ONLY_PUBLIC_WRITE_DETECTED"
  | "DRY_RUN_PROPOSAL_MISSING"
  | "DRY_RUN_EXECUTED_ACTION_DETECTED"
  | "DRY_RUN_PUBLIC_WRITE_DETECTED"
  | "NORMAL_WAKE_PUBLIC_WRITE_MISSING"
  | "NORMAL_WAKE_PROVENANCE_MISSING"
  | "NORMAL_WAKE_OUTBOX_NOT_EXACT_ONCE"
  | "NORMAL_WAKE_AUDIT_MISSING"
  | "NORMAL_WAKE_RUNTIME_EVENT_MISSING"
  | "NORMAL_WAKE_ENTRY_LINK_MISSING"
  | "NORMAL_WAKE_REPORT_LINK_MISSING"
  | "NORMAL_WAKE_TAKEDOWN_MODERATION_EVIDENCE_INVALID"
  | "NORMAL_WAKE_TAKEDOWN_AUDIT_EVIDENCE_INVALID"
  | "NORMAL_WAKE_TAKEDOWN_EVIDENCE_OUTSIDE_ATTEMPT_WINDOW"
  | "GRACEFUL_CANCELLATION_MISSING"
  | "GRACEFUL_CANCELLATION_INVALID"
  | "PENDING_CANCELLATION_MISSING"
  | "PENDING_CANCELLATION_INVALID";

export interface ProductionGate9Input {
  attemptLocalDate: string;
  attemptStartedAt: Date;
  gateObservedAt: Date;
  smokeAgentProfileId: string;
  readOnlyRun: ProductionRunProof | null;
  dryRun: ProductionRunProof | null;
  normalWakeRun: ProductionRunProof | null;
  gracefulCancellationRun: ProductionRunProof | null;
  pendingCancellationRun: ProductionRunProof | null;
  takedownProof: {
    entryLinkedToNormalWake: boolean;
    reportTargetsEntry: boolean;
    entryHiddenModerationActionCount: number;
    entryRestoredModerationActionCount: number;
    entryHiddenAuditCount: number;
    entryRestoredAuditCount: number;
    evidenceTimestamps: readonly Date[];
  };
}

export function evaluateProductionGate9(input: ProductionGate9Input) {
  const failures: ProductionGate9Failure[] = [];
  addFailure(failures, "ATTEMPT_LOCAL_DATE_INVALID", !validLocalDate(input.attemptLocalDate));
  addFailure(
    failures,
    "ATTEMPT_WINDOW_INVALID",
    !validAttemptWindow(input.attemptStartedAt, input.gateObservedAt, input.attemptLocalDate),
  );
  addFailure(failures, "READ_ONLY_RUN_MISSING", input.readOnlyRun === null);
  addFailure(failures, "DRY_RUN_MISSING", input.dryRun === null);
  addFailure(failures, "NORMAL_WAKE_RUN_MISSING", input.normalWakeRun === null);

  const smokeRuns = [
    [input.readOnlyRun, "READ_ONLY"],
    [input.dryRun, "DRY_RUN"],
    [input.normalWakeRun, "NORMAL_WAKE"],
  ] as const;
  for (const [run, expectedType] of smokeRuns) {
    if (!run) continue;
    addFailure(
      failures,
      "SMOKE_PROFILE_MISMATCH",
      run.agentProfileId !== input.smokeAgentProfileId,
    );
    addFailure(
      failures,
      "SMOKE_RUN_TYPE_MISMATCH",
      run.runType !== expectedType || run.trigger !== "ADMIN_MANUAL" || run.scheduleSlotId !== null,
    );
    addFailure(failures, "SMOKE_RUN_NOT_SUCCEEDED", run.runStatus !== "SUCCEEDED");
    addFailure(failures, "SMOKE_RUN_TIMESTAMP_ORDER_INVALID", !orderedRunTimestamps(run, true));
    addFailure(
      failures,
      "SMOKE_RUN_OUTSIDE_ATTEMPT_DATE",
      !everyTimestampOnDate([run.createdAt, run.startedAt, run.finishedAt], input.attemptLocalDate),
    );
    addFailure(
      failures,
      "SMOKE_RUN_OUTSIDE_ATTEMPT_WINDOW",
      !everyTimestampInAttemptWindow(
        [run.createdAt, run.startedAt, run.finishedAt],
        input.attemptStartedAt,
        input.gateObservedAt,
        input.attemptLocalDate,
      ),
    );
    addFailure(
      failures,
      "SMOKE_EVIDENCE_OUTSIDE_ATTEMPT_WINDOW",
      !everyTimestampInAttemptWindow(
        run.supportingEvidenceTimestamps,
        input.attemptStartedAt,
        input.gateObservedAt,
        input.attemptLocalDate,
      ),
    );
  }

  if (input.readOnlyRun) {
    addFailure(
      failures,
      "READ_ONLY_PUBLIC_WRITE_DETECTED",
      input.readOnlyRun.publicActionCount !== 0 || input.readOnlyRun.contentRecordCount !== 0,
    );
  }
  if (input.dryRun) {
    addFailure(failures, "DRY_RUN_PROPOSAL_MISSING", input.dryRun.proposedActionCount < 1);
    addFailure(
      failures,
      "DRY_RUN_EXECUTED_ACTION_DETECTED",
      input.dryRun.succeededActionCount !== 0,
    );
    addFailure(
      failures,
      "DRY_RUN_PUBLIC_WRITE_DETECTED",
      input.dryRun.publicActionCount !== 0 || input.dryRun.contentRecordCount !== 0,
    );
  }
  if (input.normalWakeRun) {
    const run = input.normalWakeRun;
    addFailure(
      failures,
      "NORMAL_WAKE_PUBLIC_WRITE_MISSING",
      run.publicActionCount < 1 || run.contentRecordCount < 1,
    );
    addFailure(
      failures,
      "NORMAL_WAKE_PROVENANCE_MISSING",
      run.provenanceBackedPublicActionCount < 1 ||
        run.provenanceBackedContentCount !== run.contentRecordCount,
    );
    addFailure(
      failures,
      "NORMAL_WAKE_OUTBOX_NOT_EXACT_ONCE",
      run.outbox.queued !== 1 ||
        run.outbox.started !== 1 ||
        run.outbox.completed !== 1 ||
        run.outbox.failed !== 0,
    );
    addFailure(failures, "NORMAL_WAKE_AUDIT_MISSING", run.auditEventCount < 1);
    addFailure(failures, "NORMAL_WAKE_RUNTIME_EVENT_MISSING", run.runtimeEventCount < 1);
  }
  addFailure(
    failures,
    "NORMAL_WAKE_ENTRY_LINK_MISSING",
    !input.takedownProof.entryLinkedToNormalWake,
  );
  addFailure(failures, "NORMAL_WAKE_REPORT_LINK_MISSING", !input.takedownProof.reportTargetsEntry);
  addFailure(
    failures,
    "NORMAL_WAKE_TAKEDOWN_MODERATION_EVIDENCE_INVALID",
    input.takedownProof.entryHiddenModerationActionCount !== 1 ||
      input.takedownProof.entryRestoredModerationActionCount !== 1,
  );
  addFailure(
    failures,
    "NORMAL_WAKE_TAKEDOWN_AUDIT_EVIDENCE_INVALID",
    input.takedownProof.entryHiddenAuditCount !== 1 ||
      input.takedownProof.entryRestoredAuditCount !== 1,
  );
  addFailure(
    failures,
    "NORMAL_WAKE_TAKEDOWN_EVIDENCE_OUTSIDE_ATTEMPT_WINDOW",
    !everyTimestampInAttemptWindow(
      input.takedownProof.evidenceTimestamps,
      input.attemptStartedAt,
      input.gateObservedAt,
      input.attemptLocalDate,
    ),
  );

  addFailure(failures, "GRACEFUL_CANCELLATION_MISSING", input.gracefulCancellationRun === null);
  if (input.gracefulCancellationRun) {
    const run = input.gracefulCancellationRun;
    addFailure(
      failures,
      "GRACEFUL_CANCELLATION_INVALID",
      run.agentProfileId !== input.smokeAgentProfileId ||
        run.runType !== "NORMAL_WAKE" ||
        run.trigger !== "ADMIN_MANUAL" ||
        run.scheduleSlotId !== null ||
        run.runStatus !== "CANCELLED" ||
        run.attempts < 1 ||
        run.startedAt === null ||
        !orderedRunTimestamps(run, true) ||
        !everyTimestampOnDate(
          [run.createdAt, run.startedAt, run.finishedAt],
          input.attemptLocalDate,
        ) ||
        !everyTimestampInAttemptWindow(
          [run.createdAt, run.startedAt, run.finishedAt, ...run.supportingEvidenceTimestamps],
          input.attemptStartedAt,
          input.gateObservedAt,
          input.attemptLocalDate,
        ),
    );
  }
  addFailure(failures, "PENDING_CANCELLATION_MISSING", input.pendingCancellationRun === null);
  if (input.pendingCancellationRun) {
    const run = input.pendingCancellationRun;
    addFailure(
      failures,
      "PENDING_CANCELLATION_INVALID",
      run.agentProfileId !== input.smokeAgentProfileId ||
        run.runType !== "NORMAL_WAKE" ||
        run.trigger !== "ADMIN_MANUAL" ||
        run.scheduleSlotId !== null ||
        run.runStatus !== "CANCELLED" ||
        run.attempts !== 0 ||
        run.startedAt !== null ||
        !orderedRunTimestamps(run, false) ||
        !everyTimestampOnDate([run.createdAt, run.finishedAt], input.attemptLocalDate) ||
        !everyTimestampInAttemptWindow(
          [run.createdAt, run.finishedAt, ...run.supportingEvidenceTimestamps],
          input.attemptStartedAt,
          input.gateObservedAt,
          input.attemptLocalDate,
        ),
    );
  }

  return {
    passed: failures.length === 0,
    failures,
    metrics: {
      readOnlyRunId: input.readOnlyRun?.id ?? null,
      dryRunId: input.dryRun?.id ?? null,
      normalWakeRunId: input.normalWakeRun?.id ?? null,
      publicWriteCount: input.normalWakeRun?.publicActionCount ?? 0,
    },
  } as const;
}

export type ProductionGate10Failure =
  | "ATTEMPT_LOCAL_DATE_INVALID"
  | "FIVE_AGENT_COHORT_REQUIRED"
  | "WINDOW_SHORTER_THAN_TWO_HOURS"
  | "WINDOW_OUTSIDE_ATTEMPT_DATE"
  | "NON_SCHEDULED_RUN_INCLUDED"
  | "SCHEDULED_RUN_OUTSIDE_COHORT"
  | "SCHEDULED_RUN_OUTSIDE_WINDOW"
  | "SCHEDULED_RUN_OUTSIDE_ATTEMPT_DATE"
  | "TERMINAL_RUN_SAMPLE_TOO_SMALL"
  | "SCHEDULED_SUCCESS_RATE_BELOW_NINETY_PERCENT"
  | "FIVE_AGENT_SUCCESS_COVERAGE_MISSING"
  | "SCHEDULED_P75_OR_HEALTHY_CAPACITY_REQUIRED"
  | "CAPACITY_SNAPSHOT_MISSING"
  | "CAPACITY_SNAPSHOT_OUTSIDE_ATTEMPT_DATE"
  | "CAPACITY_RESERVE_MISSING"
  | "CAPACITY_STATUS_NOT_APPROVED"
  | "FIVE_LINKED_ACTIVE_PLANS_REQUIRED"
  | "CRITICAL_BREAKER_DETECTED"
  | "OBSERVATION_CHECKPOINT_COVERAGE_MISSING";

export interface ProductionGate10Input {
  attemptLocalDate: string;
  cohortAgentIds: readonly string[];
  windowStartedAt: Date;
  windowFinishedAt: Date;
  runs: readonly ProductionRunProof[];
  capacitySnapshot: ProductionCapacityProof | null;
  criticalBreakerCount: number;
  checkpointMinutes: readonly number[];
  degradedModeApproved?: boolean;
}

export function evaluateProductionGate10(input: ProductionGate10Input) {
  const failures: ProductionGate10Failure[] = [];
  const cohort = unique(input.cohortAgentIds);
  const windowDurationMs = input.windowFinishedAt.getTime() - input.windowStartedAt.getTime();
  addFailure(failures, "ATTEMPT_LOCAL_DATE_INVALID", !validLocalDate(input.attemptLocalDate));
  addFailure(
    failures,
    "FIVE_AGENT_COHORT_REQUIRED",
    cohort.length !== 5 || cohort.length !== input.cohortAgentIds.length,
  );
  addFailure(
    failures,
    "WINDOW_SHORTER_THAN_TWO_HOURS",
    windowDurationMs < PRODUCTION_GATE_10_MINIMUM_WINDOW_MS,
  );
  addFailure(
    failures,
    "WINDOW_OUTSIDE_ATTEMPT_DATE",
    !everyTimestampOnDate([input.windowStartedAt, input.windowFinishedAt], input.attemptLocalDate),
  );

  const scheduledRuns = input.runs.filter(isProductionScheduledRun);
  addFailure(failures, "NON_SCHEDULED_RUN_INCLUDED", scheduledRuns.length !== input.runs.length);
  const terminalRuns = scheduledRuns.filter((run) => terminalRunStatuses.has(run.runStatus));
  for (const run of terminalRuns) {
    addFailure(failures, "SCHEDULED_RUN_OUTSIDE_COHORT", !cohort.includes(run.agentProfileId));
    addFailure(
      failures,
      "SCHEDULED_RUN_OUTSIDE_WINDOW",
      run.createdAt < input.windowStartedAt ||
        run.finishedAt === null ||
        run.finishedAt > input.windowFinishedAt,
    );
    addFailure(
      failures,
      "SCHEDULED_RUN_OUTSIDE_ATTEMPT_DATE",
      !everyTimestampOnDate([run.createdAt, run.startedAt, run.finishedAt], input.attemptLocalDate),
    );
  }
  addFailure(
    failures,
    "TERMINAL_RUN_SAMPLE_TOO_SMALL",
    terminalRuns.length < PRODUCTION_GATE_10_MINIMUM_TERMINAL_RUNS,
  );
  const successfulRuns = terminalRuns.filter((run) => run.runStatus === "SUCCEEDED");
  const successRate = terminalRuns.length === 0 ? 0 : successfulRuns.length / terminalRuns.length;
  addFailure(
    failures,
    "SCHEDULED_SUCCESS_RATE_BELOW_NINETY_PERCENT",
    successRate < PRODUCTION_GATE_10_MINIMUM_SUCCESS_RATE,
  );
  const successfulAgents = new Set(successfulRuns.map((run) => run.agentProfileId));
  addFailure(
    failures,
    "FIVE_AGENT_SUCCESS_COVERAGE_MISSING",
    cohort.some((agentProfileId) => !successfulAgents.has(agentProfileId)),
  );

  const p75DurationMs = productionP75DurationMs(terminalRuns);
  addFailure(failures, "CAPACITY_SNAPSHOT_MISSING", input.capacitySnapshot === null);
  addFailure(
    failures,
    "SCHEDULED_P75_OR_HEALTHY_CAPACITY_REQUIRED",
    (p75DurationMs === null || p75DurationMs > PRODUCTION_GATE_10_MAXIMUM_P75_DURATION_MS) &&
      input.capacitySnapshot?.capacityStatus !== "HEALTHY",
  );
  if (input.capacitySnapshot) {
    const snapshot = input.capacitySnapshot;
    addFailure(
      failures,
      "CAPACITY_SNAPSHOT_OUTSIDE_ATTEMPT_DATE",
      snapshot.localDate !== input.attemptLocalDate ||
        istanbulCalendarDateKey(snapshot.createdAt) !== input.attemptLocalDate ||
        snapshot.createdAt < input.windowStartedAt ||
        snapshot.createdAt > input.windowFinishedAt,
    );
    addFailure(
      failures,
      "CAPACITY_RESERVE_MISSING",
      snapshot.reserveFactor < PRODUCTION_MINIMUM_CAPACITY_RESERVE_FACTOR,
    );
    addFailure(
      failures,
      "CAPACITY_STATUS_NOT_APPROVED",
      !["HEALTHY", "DEGRADED"].includes(snapshot.capacityStatus) ||
        (snapshot.capacityStatus === "DEGRADED" && input.degradedModeApproved !== true),
    );
    const linkedAgents = unique(snapshot.linkedActiveAgentIds);
    addFailure(
      failures,
      "FIVE_LINKED_ACTIVE_PLANS_REQUIRED",
      linkedAgents.length !== 5 ||
        linkedAgents.length !== snapshot.linkedActiveAgentIds.length ||
        cohort.some((agentProfileId) => !linkedAgents.includes(agentProfileId)),
    );
  }
  addFailure(failures, "CRITICAL_BREAKER_DETECTED", input.criticalBreakerCount !== 0);
  const checkpointSet = new Set(input.checkpointMinutes);
  addFailure(
    failures,
    "OBSERVATION_CHECKPOINT_COVERAGE_MISSING",
    PRODUCTION_GATE_10_REQUIRED_CHECKPOINT_MINUTES.some(
      (checkpoint) => !checkpointSet.has(checkpoint),
    ),
  );

  return {
    passed: failures.length === 0,
    failures,
    metrics: {
      windowDurationMs,
      terminalRunCount: terminalRuns.length,
      successfulRunCount: successfulRuns.length,
      successRate,
      successfulAgentCount: successfulAgents.size,
      p75DurationMs,
    },
  } as const;
}

export type ProductionGate11Failure =
  | "ATTEMPT_LOCAL_DATE_INVALID"
  | "ESCALATION_OUTSIDE_ATTEMPT_DATE"
  | "FIRST_THREE_SCHEDULED_RUNS_MISSING"
  | "FIRST_THREE_RUN_IDS_NOT_DISTINCT"
  | "FIRST_THREE_RUN_OUTSIDE_ATTEMPT_DATE"
  | "FIRST_THREE_RUN_NOT_SUCCEEDED"
  | "FIRST_THREE_RUN_EXCEEDED_TIMEOUT"
  | "FIRST_THREE_SCHEDULE_SLOT_INVALID"
  | "FIRST_THREE_OUTBOX_NOT_EXACT_ONCE"
  | "FIRST_THREE_DUPLICATE_ACTION_DETECTED"
  | "FIRST_THREE_DUPLICATE_CONTENT_DETECTED"
  | "FIRST_THREE_CONTENT_PROVENANCE_MISSING"
  | "FIRST_THREE_ENTRY_QUOTA_EXCEEDED"
  | "FIRST_THREE_DUPLICATE_LEASE_DETECTED";

export interface ProductionGate11Input {
  attemptLocalDate: string;
  escalationStartedAt: Date;
  runs: readonly ProductionRunProof[];
}

export function selectFirstThreeProductionScheduledRuns(
  runs: readonly ProductionRunProof[],
  escalationStartedAt: Date,
): ProductionRunProof[] {
  return runs
    .filter((run) => isProductionScheduledRun(run) && run.createdAt >= escalationStartedAt)
    .sort(
      (left, right) =>
        left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id),
    )
    .slice(0, 3);
}

export function evaluateProductionGate11(input: ProductionGate11Input) {
  const failures: ProductionGate11Failure[] = [];
  addFailure(failures, "ATTEMPT_LOCAL_DATE_INVALID", !validLocalDate(input.attemptLocalDate));
  addFailure(
    failures,
    "ESCALATION_OUTSIDE_ATTEMPT_DATE",
    istanbulCalendarDateKey(input.escalationStartedAt) !== input.attemptLocalDate,
  );
  const firstThree = selectFirstThreeProductionScheduledRuns(input.runs, input.escalationStartedAt);
  addFailure(failures, "FIRST_THREE_SCHEDULED_RUNS_MISSING", firstThree.length !== 3);
  addFailure(
    failures,
    "FIRST_THREE_RUN_IDS_NOT_DISTINCT",
    unique(firstThree.map((run) => run.id)).length !== firstThree.length,
  );
  for (const run of firstThree) {
    addFailure(
      failures,
      "FIRST_THREE_RUN_OUTSIDE_ATTEMPT_DATE",
      !everyTimestampOnDate([run.createdAt, run.startedAt, run.finishedAt], input.attemptLocalDate),
    );
    addFailure(failures, "FIRST_THREE_RUN_NOT_SUCCEEDED", run.runStatus !== "SUCCEEDED");
    const durationMs = productionRunDurationMs(run);
    addFailure(
      failures,
      "FIRST_THREE_RUN_EXCEEDED_TIMEOUT",
      durationMs === null || durationMs > run.timeoutSeconds * 1000,
    );
    addFailure(
      failures,
      "FIRST_THREE_SCHEDULE_SLOT_INVALID",
      run.scheduleSlotStatus !== "COMPLETED" || run.scheduleSlotRunId !== run.id,
    );
    addFailure(
      failures,
      "FIRST_THREE_OUTBOX_NOT_EXACT_ONCE",
      run.outbox.queued !== 1 ||
        run.outbox.started !== 1 ||
        run.outbox.completed !== 1 ||
        run.outbox.failed !== 0,
    );
    addFailure(
      failures,
      "FIRST_THREE_DUPLICATE_ACTION_DETECTED",
      run.actionCount !== run.distinctActionSequenceCount,
    );
    addFailure(
      failures,
      "FIRST_THREE_DUPLICATE_CONTENT_DETECTED",
      run.contentRecordCount !== run.distinctContentEntryCount ||
        run.contentRecordCount !== run.distinctContentActionCount,
    );
    addFailure(
      failures,
      "FIRST_THREE_CONTENT_PROVENANCE_MISSING",
      run.provenanceBackedContentCount !== run.contentRecordCount,
    );
    addFailure(
      failures,
      "FIRST_THREE_ENTRY_QUOTA_EXCEEDED",
      run.contentRecordCount > run.desiredEntryMax,
    );
    addFailure(failures, "FIRST_THREE_DUPLICATE_LEASE_DETECTED", run.attempts !== 1);
  }

  return {
    passed: failures.length === 0,
    failures,
    metrics: {
      firstThreeRunIds: firstThree.map((run) => run.id),
      durationsMs: firstThree.map(productionRunDurationMs),
    },
  } as const;
}

export type ProductionRolloutOrderFailure =
  | "ATTEMPT_LOCAL_DATE_INVALID"
  | "ROLLOUT_MILESTONE_OUTSIDE_ATTEMPT_DATE"
  | "ROLLOUT_MILESTONE_ORDER_INVALID"
  | "GATE_10_WINDOW_SHORTER_THAN_TWO_HOURS";

export interface ProductionRolloutOrderInput {
  attemptLocalDate: string;
  attemptStartedAt: Date;
  gate9CompletedAt: Date;
  gate10StartedAt: Date;
  gate10CompletedAt: Date;
  gate11StartedAt: Date;
  gate11CompletedAt: Date;
}

export function evaluateProductionRolloutOrder(input: ProductionRolloutOrderInput) {
  const failures: ProductionRolloutOrderFailure[] = [];
  const milestones = [
    input.attemptStartedAt,
    input.gate9CompletedAt,
    input.gate10StartedAt,
    input.gate10CompletedAt,
    input.gate11StartedAt,
    input.gate11CompletedAt,
  ];
  addFailure(failures, "ATTEMPT_LOCAL_DATE_INVALID", !validLocalDate(input.attemptLocalDate));
  addFailure(
    failures,
    "ROLLOUT_MILESTONE_OUTSIDE_ATTEMPT_DATE",
    !everyTimestampOnDate(milestones, input.attemptLocalDate),
  );
  addFailure(
    failures,
    "ROLLOUT_MILESTONE_ORDER_INVALID",
    milestones.some((milestone, index) => index > 0 && milestone < milestones[index - 1]!),
  );
  addFailure(
    failures,
    "GATE_10_WINDOW_SHORTER_THAN_TWO_HOURS",
    input.gate10CompletedAt.getTime() - input.gate10StartedAt.getTime() <
      PRODUCTION_GATE_10_MINIMUM_WINDOW_MS,
  );
  return { passed: failures.length === 0, failures } as const;
}
