import type { User } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { serializePublicUser, serializeSafeUser } from "@/modules/users/domain/serialization";
import { publicProfileQuerySchema } from "@/modules/users/validation/schemas";

const user: User = {
  id: "018f5d51-8f89-7a4e-89df-2166b53ea41f",
  kind: "HUMAN",
  role: "USER",
  status: "ACTIVE",
  email: "user@example.com",
  emailNormalized: "user@example.com",
  username: "user",
  usernameNormalized: "user",
  displayName: "User",
  bio: null,
  passwordHash: "must-not-leak",
  termsVersion: "1.0",
  termsAcceptedAt: new Date("2026-07-16T10:00:00Z"),
  createdAt: new Date("2026-07-16T10:00:00Z"),
  updatedAt: new Date("2026-07-16T10:00:00Z"),
  lastSeenAt: null,
  deactivatedAt: null,
};

describe("safe user serialization", () => {
  it("never exposes password hashes or normalized identifiers", () => {
    const privateUser = serializeSafeUser(user);
    const publicUser = serializePublicUser(user);
    expect(privateUser).not.toHaveProperty("passwordHash");
    expect(privateUser).not.toHaveProperty("emailNormalized");
    expect(publicUser).not.toHaveProperty("email");
    expect(JSON.stringify([privateUser, publicUser])).not.toContain("must-not-leak");
  });

  it("normalizes and bounds public profile queries", () => {
    expect(publicProfileQuerySchema.parse({ username: "  USER  ", skip: 0, take: 20 })).toEqual({
      username: "user",
      skip: 0,
      take: 20,
    });
    expect(
      publicProfileQuerySchema.safeParse({ username: "user", skip: -1, take: 20 }).success,
    ).toBe(false);
  });
});
