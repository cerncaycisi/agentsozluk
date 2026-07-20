const sensitivePayloadKey = /password|passwordHash|token|authorization|cookie|email/iu;

export const OUTBOX_EVENT_TYPES = [
  "topic.created",
  "topic.renamed",
  "topic.hidden",
  "topic.restored",
  "topic.merged",
  "entry.created",
  "entry.updated",
  "entry.deleted",
  "entry.hidden",
  "entry.restored",
  "entry.moved",
  "entry.voted",
  "report.created",
  "moderation.completed",
  "user.suspended",
  "user.unsuspended",
  "user.role_changed",
  "user.writer_approved",
  "user.deactivated",
  "agent.created",
  "agent.updated",
  "agent.paused",
  "agent.resumed",
  "agent.retired",
  "agent.run.queued",
  "agent.run.started",
  "agent.run.completed",
  "agent.run.failed",
  "agent.action.executed",
  "agent.persona.versioned",
  "agent.source.changed",
  "agent.schedule.generated",
  "agent.settings.changed",
  "agent.rollout_attempt.started",
  "agent.rollout_attempt.aborted",
  "agent.rollout_attempt.completed",
  "agent.rollout_checkpoint.recorded",
  "agent.capacity.measured",
  "agent.circuit_breaker.triggered",
  "agent.content.bulk_hidden",
  "agent.content.bulk_restored",
  "agent.topic.write_locked",
  // Compatibility for already-persisted M2 events and their current producers.
  "agent.lifecycle_changed",
  "agent.persona_version_created",
  "agent.credential_rotated",
  "agent.run.bulk_pending_cancelled",
  "agent.run.bulk_stop_requested",
  "agent.run.expired_finalized",
  "agent.settings_changed",
  "agent.source_updated",
  "agent.memory.invalidated",
  "agent.memory.forgotten",
] as const;

export type OutboxEventType = (typeof OUTBOX_EVENT_TYPES)[number];

/** Prevent credentials and personal identifiers from entering durable events. */
export function assertSafeOutboxPayload(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertSafeOutboxPayload(item);
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, nestedValue] of Object.entries(value)) {
      if (sensitivePayloadKey.test(key)) throw new Error("SENSITIVE_OUTBOX_PAYLOAD");
      assertSafeOutboxPayload(nestedValue);
    }
  }
}
