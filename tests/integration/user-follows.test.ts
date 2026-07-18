import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ActorContext } from "@/modules/auth/domain/actor";
import {
  deleteUserFollowByUsername,
  getFollowedUsers,
  getUserFollowState,
  putUserFollowByUsername,
} from "@/modules/interactions";
import { createTopicWithFirstEntry } from "@/modules/topics";
import { getPublicProfile } from "@/modules/users";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

async function createUser(username: string) {
  return integrationDatabase.user.create({
    data: {
      kind: "HUMAN",
      role: "USER",
      status: "ACTIVE",
      email: `${username}@integration.test`,
      emailNormalized: `${username}@integration.test`,
      username,
      usernameNormalized: username,
      displayName: username.replaceAll("_", " "),
      passwordHash: "not-used",
      termsVersion: "1.0",
      termsAcceptedAt: new Date(),
    },
  });
}

function actor(userId: string): ActorContext {
  return {
    actorId: userId,
    actorKind: "HUMAN",
    actorRole: "USER",
    requestId: randomUUID(),
    origin: "API",
  };
}

beforeEach(resetIntegrationDatabase);
afterAll(closeIntegrationDatabase);

describe("user follow and followed-author feed with PostgreSQL", () => {
  it("follows by normalized username idempotently without exposing account kind", async () => {
    const follower = await createUser("follow_reader");
    const author = await createUser("follow_writer");
    await createTopicWithFirstEntry(integrationDatabase, actor(author.id), {
      title: "takip edilen yazar akışı",
      entryBody: "Takip edilen yazar listesindeki görünür ve aktif entry içeriği.",
    });
    await expect(
      putUserFollowByUsername(integrationDatabase, actor(follower.id), " FOLLOW_WRITER "),
    ).resolves.toMatchObject({ followed: true, user: { id: author.id } });
    await expect(
      putUserFollowByUsername(integrationDatabase, actor(follower.id), "follow_writer"),
    ).resolves.toMatchObject({ followed: true });
    expect(await integrationDatabase.userFollow.count()).toBe(1);
    await expect(getUserFollowState(integrationDatabase, follower.id, author.id)).resolves.toEqual({
      followed: true,
    });
    const [items, total] = await getFollowedUsers(integrationDatabase, follower.id, 0, 20);
    expect(total).toBe(1);
    expect(items[0]).toMatchObject({
      followed: {
        id: author.id,
        username: author.username,
        entries: [expect.objectContaining({ body: expect.stringContaining("görünür") })],
      },
    });
    expect(JSON.stringify(items)).not.toMatch(/"kind"|"role"|"email"/u);
    const profile = await getPublicProfile(integrationDatabase, {
      username: author.username,
      skip: 0,
      take: 20,
    });
    expect(profile.profile).not.toHaveProperty("kind");
    expect(profile.profile).not.toHaveProperty("role");
    expect(profile.profile).not.toHaveProperty("email");
  });

  it("rejects self/deactivated targets and unfollows idempotently", async () => {
    const follower = await createUser("follow_self");
    const target = await createUser("follow_inactive");
    await expect(
      putUserFollowByUsername(integrationDatabase, actor(follower.id), follower.username),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await integrationDatabase.user.update({
      where: { id: target.id },
      data: { status: "DEACTIVATED", deactivatedAt: new Date() },
    });
    await expect(
      putUserFollowByUsername(integrationDatabase, actor(follower.id), target.username),
    ).rejects.toMatchObject({ code: "USER_NOT_FOUND" });
    await expect(
      deleteUserFollowByUsername(integrationDatabase, actor(follower.id), target.username),
    ).resolves.toEqual({ followed: false });
    await expect(
      deleteUserFollowByUsername(integrationDatabase, actor(follower.id), target.username),
    ).resolves.toEqual({ followed: false });
  });
});
