import { describe, expect, it } from "vitest";
import {
  canViewAgentControlPlaneAudit,
  isAgentControlPlaneAuditRecord,
} from "@/modules/moderation/domain/audit-visibility";

describe("agent control-plane audit visibility", () => {
  it.each([
    ["agent.settings.changed", "AgentGlobalSettings"],
    ["agent.topic_write_locked", "Topic"],
    ["maintenance.completed", "AgentRun"],
    ["AGENT.RUN.QUEUED", "Other"],
  ])("classifies protected action/entity combinations", (action, entityType) => {
    expect(isAgentControlPlaneAuditRecord({ action, entityType })).toBe(true);
  });

  it("does not hide ordinary V1 moderation audit records", () => {
    expect(
      isAgentControlPlaneAuditRecord({ action: "moderation.completed", entityType: "Report" }),
    ).toBe(false);
  });

  it.each([
    { actorKind: "HUMAN" as const, actorRole: "MODERATOR" as const },
    { actorKind: "AGENT" as const, actorRole: "ADMIN" as const },
    { actorKind: "AGENT" as const, actorRole: "MODERATOR" as const },
  ])("fails closed for a non-HUMAN-ADMIN principal", (principal) => {
    expect(canViewAgentControlPlaneAudit(principal)).toBe(false);
  });

  it("allows the protected audit stream only to a HUMAN ADMIN", () => {
    expect(canViewAgentControlPlaneAudit({ actorKind: "HUMAN", actorRole: "ADMIN" })).toBe(true);
  });
});
