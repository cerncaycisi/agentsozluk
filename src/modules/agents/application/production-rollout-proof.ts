import type { TransactionClient } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { sha256 } from "@/lib/security/crypto";
import { capabilityFreshness, runtimeFingerprint } from "@/modules/agents/domain/capacity";
import {
  evaluateProductionGate10,
  evaluateProductionGate11,
  evaluateProductionGate9,
  evaluateProductionRolloutOrder,
} from "@/modules/agents/domain/production-rollout";
import { istanbulCalendarDateKey } from "@/modules/agents/domain/runtime-controls";
import { getProductionRolloutOperationalState } from "@/modules/agents/repository/control-plane";
import {
  getLatestRuntimeCapability,
  getLatestRuntimeFingerprintRecord,
} from "@/modules/agents/repository/capacity";
import { canonicalLifeEventJson } from "@/modules/agents/repository/life-ledger";
import {
  countProductionCriticalBreakerEvents,
  findProductionRolloutAttemptEvents,
  loadProductionGate10Proof,
  loadProductionGate11Proof,
  loadProductionGate9Proof,
  loadProductionScheduledRunProof,
  productionRolloutEventTypes,
  type ProductionRolloutEventType,
} from "@/modules/agents/repository/production-rollout";
import { RUNTIME_PROMPT_PROFILE_HASH } from "@/runtime/prompt-profile";

type RolloutEvent = Awaited<ReturnType<typeof findProductionRolloutAttemptEvents>>[number];

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown, key: string): string | null {
  const candidate = objectValue(value)?.[key];
  return typeof candidate === "string" ? candidate : null;
}

function numberValue(value: unknown, key: string): number | null {
  const candidate = objectValue(value)?.[key];
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
}

function stringArray(value: unknown, key: string): string[] {
  const candidate = objectValue(value)?.[key];
  return Array.isArray(candidate)
    ? candidate.filter((item): item is string => typeof item === "string")
    : [];
}

function eventOfType(events: readonly RolloutEvent[], eventType: ProductionRolloutEventType) {
  return events.find((event) => event.eventType === eventType) ?? null;
}

function requireEvent(events: readonly RolloutEvent[], eventType: ProductionRolloutEventType) {
  const event = eventOfType(events, eventType);
  if (!event)
    throw new AppError(
      "AGENT_LIFECYCLE_INVALID",
      409,
      `Production rollout completion kanıtı eksik: ${eventType}.`,
    );
  return event;
}

function requireUuidMetadata(event: RolloutEvent, key: string): string {
  const value = stringValue(event.metadata, key);
  if (
    !value ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  )
    throw new AppError("AGENT_LIFECYCLE_INVALID", 409, `Rollout proof ${key} geçersiz.`);
  return value;
}

function assertPassed(
  label: string,
  result: { passed: boolean; failures: readonly string[] },
): void {
  if (!result.passed)
    throw new AppError(
      "AGENT_LIFECYCLE_INVALID",
      409,
      `${label} completion sırasında yeniden doğrulanamadı.`,
      undefined,
      undefined,
      { failures: result.failures },
    );
}

export async function assertProductionRolloutCompletionEvidence(
  transaction: TransactionClient,
  input: { attemptId: string; now: Date },
) {
  const events = await findProductionRolloutAttemptEvents(transaction, input.attemptId);
  const started = requireEvent(events, productionRolloutEventTypes.attemptStarted);
  const gate9 = requireEvent(events, productionRolloutEventTypes.gate9Completed);
  const gate10Started = requireEvent(events, productionRolloutEventTypes.gate10Started);
  const gate10Completed = requireEvent(events, productionRolloutEventTypes.gate10Completed);
  const gate11Started = requireEvent(events, productionRolloutEventTypes.gate11Started);
  const gate11Completed = requireEvent(events, productionRolloutEventTypes.gate11Completed);
  const gate12Pre = requireEvent(events, productionRolloutEventTypes.gate12PreReboot);
  const gate12Post = requireEvent(events, productionRolloutEventTypes.gate12PostReboot);
  const gate12Completed = requireEvent(events, productionRolloutEventTypes.gate12Completed);
  const localDate = stringValue(started.metadata, "localDate");
  if (!localDate || istanbulCalendarDateKey(input.now) !== localDate)
    throw new AppError(
      "AGENT_LIFECYCLE_INVALID",
      409,
      "Production rollout completion aynı İstanbul tarihinde yapılmalıdır.",
    );

  const order = evaluateProductionRolloutOrder({
    attemptLocalDate: localDate,
    attemptStartedAt: started.occurredAt,
    gate9CompletedAt: gate9.occurredAt,
    gate10StartedAt: gate10Started.occurredAt,
    gate10CompletedAt: gate10Completed.occurredAt,
    gate11StartedAt: gate11Started.occurredAt,
    gate11CompletedAt: gate11Completed.occurredAt,
  });
  assertPassed("Rollout milestone order", order);
  if (
    gate12Pre.occurredAt < gate11Completed.occurredAt ||
    gate12Post.occurredAt < gate12Pre.occurredAt ||
    gate12Completed.occurredAt < gate12Post.occurredAt ||
    [gate12Pre, gate12Post, gate12Completed].some(
      (event) => istanbulCalendarDateKey(event.occurredAt) !== localDate,
    )
  )
    throw new AppError("AGENT_LIFECYCLE_INVALID", 409, "Gate 12 sıra/tarih kanıtı geçersiz.");

  const gate9Proof = await loadProductionGate9Proof(transaction, {
    readOnlyRunId: requireUuidMetadata(gate9, "readOnlyRunId"),
    dryRunId: requireUuidMetadata(gate9, "dryRunId"),
    normalWakeRunId: requireUuidMetadata(gate9, "normalWakeRunId"),
    normalWakeEntryId: requireUuidMetadata(gate9, "normalWakeEntryId"),
    reportId: requireUuidMetadata(gate9, "reportId"),
    gracefulCancellationRunId: requireUuidMetadata(gate9, "gracefulStoppedRunId"),
    pendingCancellationRunId: requireUuidMetadata(gate9, "pendingCancelledRunId"),
  });
  const gate9Result = evaluateProductionGate9({
    attemptLocalDate: localDate,
    attemptStartedAt: started.occurredAt,
    gateObservedAt: gate9.occurredAt,
    smokeAgentProfileId: requireUuidMetadata(gate9, "smokeProfileId"),
    ...gate9Proof,
  });
  assertPassed("Gate 9", gate9Result);

  const cohortAgentIds = stringArray(gate10Started.metadata, "cohortAgentIds");
  const gate10Proof = await loadProductionGate10Proof(transaction, {
    attemptId: input.attemptId,
    attemptLocalDate: localDate,
    cohortAgentIds,
    windowStartedAt: gate10Started.occurredAt,
    windowFinishedAt: gate10Completed.occurredAt,
  });
  const gate10Result = evaluateProductionGate10({
    attemptLocalDate: localDate,
    cohortAgentIds,
    windowStartedAt: gate10Started.occurredAt,
    windowFinishedAt: gate10Completed.occurredAt,
    ...gate10Proof,
  });
  assertPassed("Gate 10", gate10Result);

  const gate11Runs = await loadProductionGate11Proof(transaction, {
    escalationStartedAt: gate11Started.occurredAt,
    windowFinishedAt: gate11Completed.occurredAt,
  });
  const gate11Result = evaluateProductionGate11({
    attemptLocalDate: localDate,
    escalationStartedAt: gate11Started.occurredAt,
    runs: gate11Runs,
  });
  assertPassed("Gate 11", gate11Result);

  const preBoot = stringValue(gate12Pre.metadata, "bootIdHash");
  const postBoot = stringValue(gate12Post.metadata, "bootIdHash");
  const preLedger = stringValue(gate12Pre.metadata, "ledgerIntegrityHash");
  const postLedger = stringValue(gate12Post.metadata, "ledgerIntegrityHash");
  const preRows = numberValue(gate12Pre.metadata, "ledgerRowCount");
  const postRows = numberValue(gate12Post.metadata, "ledgerRowCount");
  const preSha = stringValue(gate12Pre.metadata, "productionGitSha");
  const postSha = stringValue(gate12Post.metadata, "productionGitSha");
  if (
    !preBoot ||
    !postBoot ||
    preBoot === postBoot ||
    !preLedger ||
    preLedger !== postLedger ||
    preRows === null ||
    preRows !== postRows ||
    !preSha ||
    preSha !== postSha ||
    preSha !== stringValue(gate12Pre.metadata, "mainGitSha") ||
    postSha !== stringValue(gate12Post.metadata, "mainGitSha") ||
    !stringValue(gate12Pre.metadata, "backupChecksum") ||
    !stringValue(gate12Pre.metadata, "restoreFingerprint")
  )
    throw new AppError(
      "AGENT_LIFECYCLE_INVALID",
      409,
      "Gate 12 reboot, ledger, backup/restore veya exact SHA kanıtı geçersiz.",
    );
  const requiredTrueFields = [
    "runtimeServiceActive",
    "appContainerRunning",
    "databaseContainerRunning",
    "ciPassed",
  ];
  if (requiredTrueFields.some((key) => objectValue(gate12Post.metadata)?.[key] !== true))
    throw new AppError("AGENT_LIFECYCLE_INVALID", 409, "Gate 12 host return receipt eksik.");
  const finalTrueFields = [
    "repeatedHumanSmokePassed",
    "repeatedRoleDenialPassed",
    "repeatedMetadataScanPassed",
    "repeatedTakedownRestorePassed",
    "noDuplicateLeaseOrCatchUpBurst",
  ];
  if (finalTrueFields.some((key) => objectValue(gate12Completed.metadata)?.[key] !== true))
    throw new AppError("AGENT_LIFECYCLE_INVALID", 409, "Gate 12 final smoke receipt eksik.");
  const postResumeRunId = requireUuidMetadata(gate12Completed, "postResumeScheduledRunId");
  const postResumeRun = await loadProductionScheduledRunProof(transaction, postResumeRunId);
  if (
    !postResumeRun ||
    postResumeRun.runStatus !== "SUCCEEDED" ||
    postResumeRun.createdAt < gate12Post.occurredAt ||
    postResumeRun.attempts !== 1 ||
    postResumeRun.outbox.queued !== 1 ||
    postResumeRun.outbox.started !== 1 ||
    postResumeRun.outbox.completed !== 1 ||
    postResumeRun.outbox.failed !== 0
  )
    throw new AppError("AGENT_LIFECYCLE_INVALID", 409, "Gate 12 post-resume run proof geçersiz.");

  const criticalBreakerCount = await countProductionCriticalBreakerEvents(transaction, {
    startedAt: gate11Started.occurredAt,
    finishedAt: input.now,
  });
  if (criticalBreakerCount !== 0)
    throw new AppError("AGENT_LIFECYCLE_INVALID", 409, "Day 0 critical breaker kanıtı bulundu.");
  const state = await getProductionRolloutOperationalState(transaction, input.now);
  if (
    state.totalProfileCount !== 10 ||
    state.activeProfileCount !== 10 ||
    state.pausedProfileCount !== 0 ||
    !state.settings.runtimeEnabled ||
    !state.settings.schedulerEnabled ||
    !state.settings.publicWriteEnabled ||
    state.settings.runtimeOperatingMode !== "NORMAL" ||
    state.nonterminalRunCount !== 0 ||
    state.liveLeaseCount !== 0
  )
    throw new AppError(
      "AGENT_LIFECYCLE_INVALID",
      409,
      "Final production runtime state uygun değil.",
    );

  const [capability, fingerprintRecord] = await Promise.all([
    getLatestRuntimeCapability(transaction),
    getLatestRuntimeFingerprintRecord(transaction),
  ]);
  const fingerprint = runtimeFingerprint(fingerprintRecord?.usageMetadata);
  if (
    !capability ||
    capability.capacityStatus !== "HEALTHY" ||
    capability.benchmarkRunCount < 10 ||
    !capability.dualConcurrencySupported ||
    capability.promptProfileHash !== RUNTIME_PROMPT_PROFILE_HASH ||
    !capabilityFreshness(capability, {
      now: input.now,
      ...fingerprint,
      promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
    }).fresh
  )
    throw new AppError(
      "AGENT_LIFECYCLE_INVALID",
      409,
      "Final real-CLI capability/prompt fingerprint fresh ve HEALTHY değil.",
    );

  const checkpointEventIds = [
    gate9,
    gate10Started,
    gate10Completed,
    gate11Started,
    gate11Completed,
    gate12Pre,
    gate12Post,
    gate12Completed,
  ].map((event) => event.id.toString());
  const summary = {
    attemptId: input.attemptId,
    localDate,
    checkpointEventIds,
    gate10: gate10Result.metrics,
    gate11: gate11Result.metrics,
    postResumeRunId,
    capabilityId: capability.id,
    productionGitSha: preSha,
  };
  return {
    ...summary,
    evidenceSummaryHash: sha256(canonicalLifeEventJson(summary)),
  };
}
