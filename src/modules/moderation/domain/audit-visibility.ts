import type { ActorKind, ActorRole } from "@/modules/auth/domain/actor";

export const AGENT_CONTROL_PLANE_AUDIT_ACTION_PREFIX = "agent.";
export const AGENT_CONTROL_PLANE_AUDIT_ENTITY_PREFIX = "agent";

export function isAgentControlPlaneAuditRecord(input: {
  action: string;
  entityType: string;
}): boolean {
  return (
    input.action.toLocaleLowerCase("en-US").startsWith(AGENT_CONTROL_PLANE_AUDIT_ACTION_PREFIX) ||
    input.entityType.toLocaleLowerCase("en-US").startsWith(AGENT_CONTROL_PLANE_AUDIT_ENTITY_PREFIX)
  );
}

export function canViewAgentControlPlaneAudit(input: {
  actorKind: ActorKind;
  actorRole: ActorRole;
}): boolean {
  return input.actorKind === "HUMAN" && input.actorRole === "ADMIN";
}
