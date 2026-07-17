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
  "user.deactivated",
  "agent.created",
  "agent.updated",
  "agent.lifecycle_changed",
  "agent.persona_version_created",
  "agent.credential_rotated",
  "agent.capacity.measured",
  "agent.schedule.generated",
  "agent.run.queued",
  "agent.settings_changed",
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
