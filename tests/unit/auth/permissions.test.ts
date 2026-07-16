import { describe, expect, it } from "vitest";
import {
  canActOnUser,
  canAdminister,
  canEditEntry,
  canModerate,
  canViewRevision,
  canWrite,
  type ActorState,
} from "@/modules/auth/domain/permissions";

const user: ActorState = { id: "user", role: "USER", status: "ACTIVE" };
const moderator: ActorState = { id: "moderator", role: "MODERATOR", status: "ACTIVE" };
const admin: ActorState = { id: "admin", role: "ADMIN", status: "ACTIVE" };

describe("permission matrix", () => {
  it("allows only active accounts to write", () => {
    expect(canWrite(user, "entry:create")).toBe(true);
    expect(canWrite({ ...user, status: "SUSPENDED" }, "entry:create")).toBe(false);
    expect(canWrite({ ...user, status: "DEACTIVATED" }, "vote")).toBe(false);
  });

  it("separates moderator and admin authority", () => {
    expect(canModerate(moderator)).toBe(true);
    expect(canAdminister(moderator)).toBe(false);
    expect(canAdminister(admin)).toBe(true);
  });

  it("lets owners edit active entries and privileged actors view revisions", () => {
    expect(canEditEntry(user, user.id, "ACTIVE")).toBe(true);
    expect(canEditEntry(user, "other", "ACTIVE")).toBe(false);
    expect(canEditEntry(user, user.id, "HIDDEN")).toBe(false);
    expect(canViewRevision(user, user.id)).toBe(true);
    expect(canViewRevision(moderator, user.id)).toBe(true);
  });

  it("enforces object-level user moderation boundaries", () => {
    expect(canActOnUser(moderator, user)).toBe(true);
    expect(canActOnUser(moderator, admin)).toBe(false);
    expect(canActOnUser(moderator, { ...moderator, id: "other-mod" })).toBe(false);
    expect(canActOnUser(admin, moderator)).toBe(true);
    expect(canActOnUser(admin, admin)).toBe(false);
  });
});
