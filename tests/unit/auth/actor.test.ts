import { describe, expect, it } from "vitest";
import { actorFromSession } from "@/modules/auth/domain/actor";
import type { SessionWithUser } from "@/modules/auth/repository/sessions";

describe("actor context", () => {
  it("copies identity and authority from the authenticated session", () => {
    const session = {
      userId: "018f5d51-8f89-7a4e-89df-2166b53ea41f",
      user: { kind: "HUMAN", role: "MODERATOR" },
    } as unknown as SessionWithUser;
    expect(actorFromSession(session, "request-id", "API")).toEqual({
      actorId: session.userId,
      actorKind: "HUMAN",
      actorRole: "MODERATOR",
      requestId: "request-id",
      origin: "API",
    });
  });
});
