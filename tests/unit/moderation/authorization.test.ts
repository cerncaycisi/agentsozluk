import { describe, expect, it } from "vitest";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { requireModerator } from "@/modules/moderation/domain/authorization";

const actorId = "11111111-1111-4111-8111-111111111111";
const humanActor: ActorContext = {
  actorId,
  actorKind: "HUMAN",
  actorRole: "USER",
  requestId: "moderation-authorization-test",
  origin: "API",
};

describe("moderation principal authorization", () => {
  it("rejects an absent database principal", () => {
    expect(() => requireModerator(null, humanActor)).toThrowError(
      expect.objectContaining({ code: "FORBIDDEN", status: 403 }),
    );
  });

  it.each(["USER", "MODERATOR", "ADMIN"] as const)(
    "rejects an AGENT %s principal in both moderation gates",
    (role) => {
      const principal = { id: actorId, kind: "AGENT" as const, role, status: "ACTIVE" };
      const agentActor: ActorContext = { ...humanActor, actorKind: "AGENT", actorRole: role };
      for (const adminOnly of [false, true]) {
        expect(() => requireModerator(principal, agentActor, { adminOnly })).toThrowError(
          expect.objectContaining({ code: "FORBIDDEN", status: 403 }),
        );
      }
    },
  );

  it.each(["ADMIN", "MODERATOR"] as const)(
    "rejects an AGENT %s database principal even when actor context claims HUMAN",
    (role) => {
      const principal = { id: actorId, kind: "AGENT" as const, role, status: "ACTIVE" };
      for (const adminOnly of [false, true]) {
        expect(() => requireModerator(principal, humanActor, { adminOnly })).toThrowError(
          expect.objectContaining({ code: "FORBIDDEN", status: 403 }),
        );
      }
    },
  );

  it.each([
    { role: "ADMIN" as const, adminOnly: true },
    { role: "ADMIN" as const, adminOnly: false },
    { role: "MODERATOR" as const, adminOnly: false },
  ])("authorizes a HUMAN $role principal with adminOnly=$adminOnly", ({ role, adminOnly }) => {
    const principal = { id: actorId, kind: "HUMAN" as const, role, status: "ACTIVE" };
    expect(requireModerator(principal, humanActor, { adminOnly })).toBe(principal);
  });

  it("preserves legacy caller principals without the optional kind field", () => {
    const principal = { id: actorId, role: "ADMIN" as const, status: "ACTIVE" };
    expect(requireModerator(principal, humanActor, { adminOnly: true })).toBe(principal);
  });

  it.each([
    { id: actorId, role: "USER" as const, status: "ACTIVE", adminOnly: false },
    { id: actorId, role: "USER" as const, status: "ACTIVE", adminOnly: true },
    { id: actorId, role: "MODERATOR" as const, status: "ACTIVE", adminOnly: true },
    { id: actorId, role: "ADMIN" as const, status: "SUSPENDED", adminOnly: false },
    {
      id: "22222222-2222-4222-8222-222222222222",
      role: "ADMIN" as const,
      status: "ACTIVE",
      adminOnly: false,
    },
  ])("rejects an ineligible principal %#", ({ adminOnly, ...principal }) => {
    expect(() =>
      requireModerator({ ...principal, kind: "HUMAN" }, humanActor, { adminOnly }),
    ).toThrowError(expect.objectContaining({ code: "FORBIDDEN", status: 403 }));
  });
});
