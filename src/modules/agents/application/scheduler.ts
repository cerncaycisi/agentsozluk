import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor } from "@/lib/db/types";
import { appendAuditLog } from "@/modules/audit";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { requireAgentAdminInTransaction } from "@/modules/agents/application/authorization";
import { calculateRuntimeCapacity } from "@/modules/agents/domain/capacity";
import { generateDailyPlan } from "@/modules/agents/domain/scheduler";
import { getLatestRuntimeCapability } from "@/modules/agents/repository/capacity";
import {
  appendRuntimeEvent,
  getGlobalSettingsRecord,
} from "@/modules/agents/repository/control-plane";
import {
  createCapacitySnapshotRecord,
  createDailyPlanRecords,
  listActivePlanningProfiles,
  listDailyPlansForDate,
  lockDailyPlanning,
} from "@/modules/agents/repository/scheduler";
import { activeTimeProfileSchema } from "@/modules/agents/validation/schemas";
import type { DailyPlanGenerationInput } from "@/modules/agents/validation/scheduling-schemas";
import { appendOutboxEvent } from "@/modules/outbox";

export function istanbulLocalDate(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
}

export function generateAgentDailyPlans(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: DailyPlanGenerationInput,
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    const localDate = input.localDate ?? istanbulLocalDate(new Date());
    await lockDailyPlanning(transaction, localDate);
    const [settings, capability, profiles, existing] = await Promise.all([
      getGlobalSettingsRecord(transaction),
      getLatestRuntimeCapability(transaction),
      listActivePlanningProfiles(transaction),
      listDailyPlansForDate(transaction, localDate),
    ]);
    const existingAgentIds = new Set(existing.map(({ agentProfileId }) => agentProfileId));
    const generated = profiles
      .filter(({ id }) => !existingAgentIds.has(id))
      .map((profile) => ({
        profile,
        plan: generateDailyPlan(
          {
            agentProfileId: profile.id,
            entryMin: profile.useGlobalEntryQuota
              ? settings.defaultDailyEntryMin
              : profile.dailyEntryMin!,
            entryMax: profile.useGlobalEntryQuota
              ? settings.defaultDailyEntryMax
              : profile.dailyEntryMax!,
            topicMin: profile.dailyTopicMin,
            topicMax: profile.dailyTopicMax,
            voteMin: profile.dailyVoteMin,
            voteMax: profile.dailyVoteMax,
            activeTimeWeights: activeTimeProfileSchema.parse(profile.activeTimeProfile),
          },
          { localDate, settingsVersion: settings.settingsVersion },
        ),
      }));
    if (generated.length === 0) {
      return { localDate, createdPlans: 0, existingPlans: existing.length, capacity: null };
    }
    const allPlanMetrics = [
      ...existing.map((plan) => ({
        runCount: plan.slots.length,
        entryMin: plan.slots.reduce((sum, slot) => sum + slot.desiredEntryMin, 0),
        entryMax: plan.slots.reduce((sum, slot) => sum + slot.desiredEntryMax, 0),
      })),
      ...generated.map(({ plan }) => ({
        runCount: plan.slots.length,
        entryMin: plan.slots.reduce((sum, slot) => sum + slot.desiredEntryMin, 0),
        entryMax: plan.slots.reduce((sum, slot) => sum + slot.desiredEntryMax, 0),
      })),
    ];
    const capacity = calculateRuntimeCapacity({
      capability,
      plannedRuns: allPlanMetrics.reduce((sum, item) => sum + item.runCount, 0),
      completedRuns: 0,
      estimatedPublishedMin: allPlanMetrics.reduce((sum, item) => sum + item.entryMin, 0),
      estimatedPublishedMax: allPlanMetrics.reduce((sum, item) => sum + item.entryMax, 0),
      configuredConcurrency: settings.codexConcurrency === 2 ? 2 : 1,
      degradedMode: settings.degradedMode,
      now: new Date(),
    });
    const snapshot = await createCapacitySnapshotRecord(transaction, {
      localDate,
      concurrency: capacity.effectiveConcurrency,
      availableMinutes: capacity.availableContentMinutes,
      reserveFactor: capacity.reserveFactor,
      plannedRuns: capacity.plannedRuns,
      p75DurationMs: capability?.p75DurationMs ?? 0,
      estimatedUtilization: capacity.estimatedUtilization ?? 0,
      estimatedPublishedMin: capacity.estimatedPublishedMin,
      estimatedPublishedMax: capacity.estimatedPublishedMax,
      capacityStatus: capacity.capacityStatus,
    });
    for (const item of generated) {
      await createDailyPlanRecords(transaction, {
        agentProfileId: item.profile.id,
        localDate,
        settingsVersion: settings.settingsVersion,
        capacitySnapshotId: snapshot.id,
        plan: item.plan,
      });
    }
    const metadata = {
      localDate: localDate.toISOString().slice(0, 10),
      createdPlans: generated.length,
      existingPlans: existing.length,
      plannedRuns: capacity.plannedRuns,
      capacityStatus: capacity.capacityStatus,
      capacitySnapshotId: snapshot.id,
    };
    await appendAuditLog(transaction, {
      actorId: actor.actorId,
      action: "agent.schedule.generated",
      entityType: "AgentCapacitySnapshot",
      entityId: snapshot.id,
      requestId: actor.requestId,
      metadata,
    });
    await appendOutboxEvent(transaction, {
      eventType: "agent.schedule.generated",
      aggregateType: "AgentCapacitySnapshot",
      aggregateId: snapshot.id,
      actorId: actor.actorId,
      actorKind: actor.actorKind,
      requestId: actor.requestId,
      payload: metadata,
    });
    await appendRuntimeEvent(transaction, {
      eventType: "schedule.generated",
      safeMessage: "Günlük agent planları deterministic olarak oluşturuldu.",
      metadata,
    });
    return { localDate, createdPlans: generated.length, existingPlans: existing.length, capacity };
  });
}
