import { AppError } from "@/lib/http/errors";
import type { ActorContext } from "@/modules/auth/domain/actor";

export interface AgentAdminPrincipal {
  id: string;
  kind: "HUMAN" | "AGENT";
  role: "USER" | "MODERATOR" | "ADMIN";
  status: string;
}

export function requireHumanAdmin(
  principal: AgentAdminPrincipal | null,
  actor: ActorContext,
): AgentAdminPrincipal {
  if (
    !principal ||
    principal.id !== actor.actorId ||
    principal.kind !== "HUMAN" ||
    principal.role !== "ADMIN" ||
    principal.status !== "ACTIVE" ||
    actor.actorKind !== "HUMAN" ||
    actor.actorRole !== "ADMIN"
  ) {
    throw new AppError(
      "FORBIDDEN",
      403,
      "Agent control plane yalnız aktif insan yöneticilere açıktır.",
    );
  }
  return principal;
}

const allowedTransitions = {
  DRAFT: new Set(["PAUSED", "RETIRED"]),
  PAUSED: new Set(["ACTIVE", "SUSPENDED", "RETIRED"]),
  ACTIVE: new Set(["PAUSED", "SUSPENDED", "RETIRED"]),
  SUSPENDED: new Set(["PAUSED", "RETIRED"]),
  RETIRED: new Set<string>(),
} as const;

export function assertLifecycleTransition(
  current: keyof typeof allowedTransitions,
  next: string,
): void {
  if (current === next) return;
  if (!allowedTransitions[current].has(next)) {
    throw new AppError(
      "AGENT_LIFECYCLE_INVALID",
      409,
      `${current} durumundan ${next} durumuna geçilemez.`,
    );
  }
}
