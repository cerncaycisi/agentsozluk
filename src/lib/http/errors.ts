import type { ZodError } from "zod";

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "AUTH_REQUIRED"
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_SUSPENDED"
  | "ACCOUNT_DEACTIVATED"
  | "FORBIDDEN"
  | "CSRF_INVALID"
  | "ORIGIN_INVALID"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE"
  | "EMAIL_TAKEN"
  | "USERNAME_TAKEN"
  | "TOPIC_NOT_FOUND"
  | "TOPIC_EXISTS"
  | "TOPIC_HIDDEN"
  | "TOPIC_MERGED"
  | "ENTRY_NOT_FOUND"
  | "ENTRY_NOT_EDITABLE"
  | "CANNOT_VOTE_OWN_ENTRY"
  | "INVALID_VOTE"
  | "USER_NOT_FOUND"
  | "REPORT_NOT_FOUND"
  | "REPORT_ALREADY_OPEN"
  | "MODERATION_REASON_REQUIRED"
  | "LAST_ADMIN_GUARD"
  | "IDEMPOTENCY_CONFLICT"
  | "AGENT_NOT_FOUND"
  | "AGENT_RUN_NOT_FOUND"
  | "AGENT_ACTION_NOT_FOUND"
  | "AGENT_ACTION_LIFE_PROPOSAL_EXISTS"
  | "AGENT_ACTION_STATE_INVALID"
  | "AGENT_DECISION_LINK_REQUIRED"
  | "AGENT_LIFE_LEDGER_REQUIRED"
  | "AGENT_SOURCE_NOT_FOUND"
  | "AGENT_MEMORY_NOT_FOUND"
  | "AGENT_MEMORY_INVALIDATED"
  | "AGENT_MEMORY_RECONSOLIDATION_PENDING"
  | "AGENT_RUN_LEASE_INVALID"
  | "AGENT_RUN_CANCEL_REQUESTED"
  | "AGENT_RUN_DEADLINE_EXCEEDED"
  | "SERVICE_NOT_READY"
  | "AGENT_CAPABILITY_REQUIRED"
  | "AGENT_SETTINGS_VERSION_CONFLICT"
  | "AGENT_DUPLICATE_REPAIR_REQUIRED"
  | "AGENT_DUPLICATE_REPAIR_INVALID"
  | "AGENT_LIFECYCLE_INVALID"
  | "PERSONA_ONTOLOGY_REJECTED"
  | "PERSONA_BASELINE_DISTANCE_REJECTED"
  | "PERSONA_PAIRWISE_DISTANCE_REJECTED"
  | "PERSONA_VERSION_NOT_FOUND"
  | "QUOTA_INVALID"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly status: number,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
    public readonly headers?: Record<string, string>,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function validationError(error: ZodError): AppError {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = issue.path.join(".") || "form";
    fieldErrors[field] ??= [];
    fieldErrors[field].push(issue.message);
  }
  return new AppError("VALIDATION_ERROR", 422, "Gönderilen bilgiler geçersiz.", fieldErrors);
}
