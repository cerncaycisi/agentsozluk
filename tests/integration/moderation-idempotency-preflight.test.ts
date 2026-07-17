import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as hideTopic } from "@/app/api/v1/moderation/topics/[topicId]/hide/route";
import { POST as suspendUser } from "@/app/api/v1/moderation/users/[userId]/suspend/route";
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/config/app";
import { sha256 } from "@/lib/security/crypto";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

const passwordHash = "moderation-idempotency-test-password-hash";

async function createUser(username: string, role: "USER" | "MODERATOR" = "USER") {
  return integrationDatabase.user.create({
    data: {
      kind: "HUMAN",
      role,
      status: "ACTIVE",
      email: `${username}@integration.test`,
      emailNormalized: `${username}@integration.test`,
      username,
      usernameNormalized: username,
      displayName: `Test ${username}`,
      passwordHash,
      termsVersion: "1.0",
      termsAcceptedAt: new Date(),
    },
  });
}

async function createPersistedSession(userId: string) {
  const token = `session-${randomUUID()}`;
  const csrfToken = `csrf-${randomUUID()}`;
  await integrationDatabase.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      csrfTokenHash: sha256(csrfToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  return { token, csrfToken };
}

function applicationOrigin(): string {
  return new URL(process.env.APP_URL ?? "http://localhost:3000").origin;
}

function hideRequest(
  topicId: string,
  session: { token: string; csrfToken: string },
  idempotencyKey: string,
): NextRequest {
  const origin = applicationOrigin();
  return new NextRequest(`${origin}/api/v1/moderation/topics/${topicId}/hide`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: [
        `${SESSION_COOKIE_NAME}=${encodeURIComponent(session.token)}`,
        `${CSRF_COOKIE_NAME}=${encodeURIComponent(session.csrfToken)}`,
      ].join("; "),
      Origin: origin,
      "X-CSRF-Token": session.csrfToken,
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ reason: "Idempotency preflight doğrulaması için yeterli açıklama." }),
  });
}

async function callHide(
  topicId: string,
  session: { token: string; csrfToken: string },
  idempotencyKey: string,
) {
  return hideTopic(hideRequest(topicId, session, idempotencyKey), {
    params: Promise.resolve({ topicId }),
  });
}

function suspendRequest(
  userId: string,
  session: { token: string; csrfToken: string },
  idempotencyKey: string,
): NextRequest {
  const origin = applicationOrigin();
  return new NextRequest(`${origin}/api/v1/moderation/users/${userId}/suspend`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: [
        `${SESSION_COOKIE_NAME}=${encodeURIComponent(session.token)}`,
        `${CSRF_COOKIE_NAME}=${encodeURIComponent(session.csrfToken)}`,
      ].join("; "),
      Origin: origin,
      "X-CSRF-Token": session.csrfToken,
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ reason: "Hedef yetki değişimi replay kontrolü için açıklama." }),
  });
}

async function callSuspend(
  userId: string,
  session: { token: string; csrfToken: string },
  idempotencyKey: string,
) {
  return suspendUser(suspendRequest(userId, session, idempotencyKey), {
    params: Promise.resolve({ userId }),
  });
}

beforeEach(async () => {
  await resetIntegrationDatabase();
});

afterAll(async () => {
  await closeIntegrationDatabase();
});

describe("moderation idempotency preflight", () => {
  it("rejects a stored replay after the moderator is demoted", async () => {
    const moderator = await createUser("replay_demoted_moderator", "MODERATOR");
    const author = await createUser("replay_demoted_author");
    const topic = await integrationDatabase.topic.create({
      data: {
        title: "Replay yetki kontrolü",
        normalizedTitle: "replay yetki kontrolu",
        slug: "replay-yetki-kontrolu",
        createdById: author.id,
      },
    });
    const session = await createPersistedSession(moderator.id);
    const idempotencyKey = randomUUID();

    const first = await callHide(topic.id, session, idempotencyKey);
    expect(first.status).toBe(200);
    expect(first.headers.get("Idempotent-Replay")).toBeNull();

    await integrationDatabase.user.update({
      where: { id: moderator.id },
      data: { role: "USER" },
    });

    const replay = await callHide(topic.id, session, idempotencyKey);
    expect(replay.status).toBe(403);
    expect(replay.headers.get("Idempotent-Replay")).toBeNull();
    await expect(replay.json()).resolves.toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(await integrationDatabase.idempotencyRecord.count()).toBe(1);
    expect(await integrationDatabase.moderationAction.count()).toBe(1);
    expect(await integrationDatabase.rateLimitBucket.findFirst()).toMatchObject({ count: 2 });
  });

  it("rejects a stored user-action replay after the target is reactivated and promoted", async () => {
    const moderator = await createUser("replay_target_moderator", "MODERATOR");
    const target = await createUser("replay_promoted_target");
    const session = await createPersistedSession(moderator.id);
    const idempotencyKey = randomUUID();

    const first = await callSuspend(target.id, session, idempotencyKey);
    expect(first.status).toBe(200);
    expect(first.headers.get("Idempotent-Replay")).toBeNull();
    await expect(
      integrationDatabase.user.findUniqueOrThrow({ where: { id: target.id } }),
    ).resolves.toMatchObject({ role: "USER", status: "SUSPENDED" });

    await integrationDatabase.user.update({
      where: { id: target.id },
      data: { role: "MODERATOR", status: "ACTIVE" },
    });

    const replay = await callSuspend(target.id, session, idempotencyKey);
    expect(replay.status).toBe(403);
    expect(replay.headers.get("Idempotent-Replay")).toBeNull();
    await expect(replay.json()).resolves.toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(await integrationDatabase.idempotencyRecord.count()).toBe(1);
    expect(await integrationDatabase.moderationAction.count()).toBe(1);
    expect(await integrationDatabase.rateLimitBucket.findFirst()).toMatchObject({ count: 2 });
  });

  it("charges every stored replay to the moderation rate bucket and eventually returns 429", async () => {
    const moderator = await createUser("replay_limited_moderator", "MODERATOR");
    const author = await createUser("replay_limited_author");
    const topic = await integrationDatabase.topic.create({
      data: {
        title: "Replay rate limit kontrolü",
        normalizedTitle: "replay rate limit kontrolu",
        slug: "replay-rate-limit-kontrolu",
        createdById: author.id,
      },
    });
    const session = await createPersistedSession(moderator.id);
    const idempotencyKey = randomUUID();

    expect((await callHide(topic.id, session, idempotencyKey)).status).toBe(200);
    for (let replayIndex = 0; replayIndex < 119; replayIndex += 1) {
      const replay = await callHide(topic.id, session, idempotencyKey);
      expect(replay.status).toBe(200);
      expect(replay.headers.get("Idempotent-Replay")).toBe("true");
    }

    const limited = await callHide(topic.id, session, idempotencyKey);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Idempotent-Replay")).toBeNull();
    await expect(limited.json()).resolves.toMatchObject({ error: { code: "RATE_LIMITED" } });
    expect(await integrationDatabase.rateLimitBucket.findFirst()).toMatchObject({ count: 121 });
    expect(await integrationDatabase.idempotencyRecord.count()).toBe(1);
    expect(await integrationDatabase.moderationAction.count()).toBe(1);
  });
});
