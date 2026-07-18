import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as createReportRoute } from "@/app/api/v1/reports/route";
import { POST as createEntryRoute } from "@/app/api/v1/topics/[topicId]/entries/route";
import { POST as createTopicRoute } from "@/app/api/v1/topics/route";
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/config/app";
import { canonicalRequestHash } from "@/lib/http/idempotency";
import { sha256 } from "@/lib/security/crypto";
import { lockUserStateForTransition } from "@/modules/auth/repository/users";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

const passwordHash = "idempotent-write-preflight-test-password-hash";

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

function writeRequest(
  path: string,
  session: { token: string; csrfToken: string },
  idempotencyKey: string,
  body: unknown,
): NextRequest {
  const origin = applicationOrigin();
  return new NextRequest(`${origin}${path}`, {
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
    body: JSON.stringify(body),
  });
}

async function waitForBlockedActiveActorPreflight(): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const [activity] = await integrationDatabase.$queryRaw<Array<{ blockedCount: number }>>`
      SELECT count(*)::integer AS "blockedCount"
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND wait_event_type = 'Lock'
        AND query ILIKE '%pg_advisory_xact_lock_shared%'
    `;
    if ((activity?.blockedCount ?? 0) > 0) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Expected idempotency active-actor preflight to wait on the user-state lock.");
}

beforeEach(async () => {
  await resetIntegrationDatabase();
});

afterAll(async () => {
  await closeIntegrationDatabase();
});

describe("idempotent write preflight", () => {
  it("charges every topic-create replay and returns 429 after the fifth accepted request", async () => {
    const writer = await createUser("topic_replay_limited_writer");
    const session = await createPersistedSession(writer.id);
    const idempotencyKey = randomUUID();
    const request = () =>
      writeRequest("/api/v1/topics", session, idempotencyKey, {
        title: "Topic replay rate sınırı",
        entryBody: "Replay sırasında ikinci kez yazılmaması gereken yeterli uzunlukta entry.",
      });

    expect((await createTopicRoute(request())).status).toBe(201);
    for (let replayIndex = 0; replayIndex < 4; replayIndex += 1) {
      const replay = await createTopicRoute(request());
      expect(replay.status).toBe(201);
      expect(replay.headers.get("Idempotent-Replay")).toBe("true");
    }
    const limited = await createTopicRoute(request());
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toMatchObject({ error: { code: "RATE_LIMITED" } });

    expect(
      await integrationDatabase.rateLimitBucket.findFirst({ where: { action: "topic.create" } }),
    ).toMatchObject({ count: 6 });
    expect(await integrationDatabase.topic.count()).toBe(1);
    expect(await integrationDatabase.entry.count()).toBe(1);
    expect(await integrationDatabase.idempotencyRecord.count()).toBe(1);
  });

  it("charges entry-create replay before the minimum-interval idempotency lookup", async () => {
    const writer = await createUser("entry_replay_limited_writer");
    const topic = await integrationDatabase.topic.create({
      data: {
        title: "Entry replay rate sınırı",
        normalizedTitle: "entry replay rate siniri",
        slug: "entry-replay-rate-siniri",
        createdById: writer.id,
      },
    });
    const session = await createPersistedSession(writer.id);
    const idempotencyKey = randomUUID();
    const request = () =>
      writeRequest(`/api/v1/topics/${topic.id}/entries`, session, idempotencyKey, {
        body: "Replay sırasında yalnızca bir kez oluşturulması gereken yeterli uzunlukta entry.",
      });

    const createdResponse = await createEntryRoute(request(), {
      params: Promise.resolve({ topicId: topic.id }),
    });
    expect(createdResponse.status).toBe(201);
    const createdPayload = await createdResponse.json();
    expect(createdPayload.data).not.toHaveProperty("origin");
    expect(createdPayload.data).not.toHaveProperty("normalizedBody");
    expect(createdPayload.data.topic).not.toHaveProperty("createdById");
    expect(createdPayload.data.author).not.toHaveProperty("kind");
    const replay = await createEntryRoute(request(), {
      params: Promise.resolve({ topicId: topic.id }),
    });
    expect(replay.status).toBe(429);
    expect(replay.headers.get("Idempotent-Replay")).toBeNull();

    expect(
      await integrationDatabase.rateLimitBucket.findFirst({ where: { action: "entry.create" } }),
    ).toMatchObject({ count: 2 });
    expect(await integrationDatabase.entry.count()).toBe(1);
    expect(await integrationDatabase.idempotencyRecord.count()).toBe(1);
  });

  it("re-serializes legacy entry idempotency replays before returning public JSON", async () => {
    const writer = await createUser("legacy_entry_replay_writer");
    const session = await createPersistedSession(writer.id);
    const topic = await integrationDatabase.topic.create({
      data: {
        title: "Legacy replay public sınırı",
        normalizedTitle: "legacy replay public siniri",
        slug: "legacy-replay-public-siniri",
        createdById: writer.id,
      },
    });
    const entry = await integrationDatabase.entry.create({
      data: {
        topicId: topic.id,
        authorId: writer.id,
        body: "Eski idempotency cevabı public allowlist üzerinden yeniden kurulmalıdır.",
        normalizedBody: "eski idempotency cevabı public allowlist üzerinden yeniden kurulmalıdır.",
        origin: "WEB",
      },
    });
    const idempotencyKey = randomUUID();
    const requestBody = {
      body: "Eski idempotency cevabı public allowlist üzerinden yeniden kurulmalıdır.",
    };
    const route = `/api/v1/topics/${topic.id}/entries`;
    await integrationDatabase.idempotencyRecord.create({
      data: {
        actorId: writer.id,
        key: idempotencyKey,
        route,
        requestHash: canonicalRequestHash(requestBody),
        responseStatus: 201,
        expiresAt: new Date(Date.now() + 60 * 60_000),
        responseBody: {
          requestId: "legacy-request-id",
          data: {
            id: entry.id,
            topicId: topic.id,
            authorId: writer.id,
            body: entry.body,
            normalizedBody: entry.normalizedBody,
            origin: "AGENT",
            status: "ACTIVE",
            score: 0,
            upvoteCount: 0,
            downvoteCount: 0,
            createdAt: entry.createdAt.toISOString(),
            updatedAt: entry.updatedAt.toISOString(),
            deletedAt: null,
            hiddenAt: null,
            topic: {
              id: topic.id,
              title: topic.title,
              slug: topic.slug,
              status: "ACTIVE",
              createdById: writer.id,
            },
            author: {
              id: writer.id,
              username: writer.username,
              displayName: writer.displayName,
              status: "ACTIVE",
              kind: "AGENT",
            },
            edited: false,
          },
        },
      },
    });

    const response = await createEntryRoute(
      writeRequest(route, session, idempotencyKey, requestBody),
      { params: Promise.resolve({ topicId: topic.id }) },
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("Idempotent-Replay")).toBe("true");
    const payload = await response.json();
    expect(payload.data).toMatchObject({ id: entry.id, body: entry.body });
    expect(payload.data).not.toHaveProperty("origin");
    expect(payload.data).not.toHaveProperty("normalizedBody");
    expect(payload.data).not.toHaveProperty("deletedAt");
    expect(payload.data).not.toHaveProperty("hiddenAt");
    expect(payload.data.topic).not.toHaveProperty("createdById");
    expect(payload.data.author).not.toHaveProperty("kind");
    expect(await integrationDatabase.entry.count()).toBe(1);
  });

  it("charges every report replay and returns 429 after the tenth accepted request", async () => {
    const reporter = await createUser("report_replay_limited_writer");
    const target = await createUser("report_replay_target");
    const session = await createPersistedSession(reporter.id);
    const idempotencyKey = randomUUID();
    const request = () =>
      writeRequest("/api/v1/reports", session, idempotencyKey, {
        targetType: "USER",
        targetId: target.id,
        reason: "HARASSMENT",
        details: "Replay rate limit doğrulaması için açıklama.",
      });

    expect((await createReportRoute(request())).status).toBe(201);
    for (let replayIndex = 0; replayIndex < 9; replayIndex += 1) {
      const replay = await createReportRoute(request());
      expect(replay.status).toBe(201);
      expect(replay.headers.get("Idempotent-Replay")).toBe("true");
    }
    const limited = await createReportRoute(request());
    expect(limited.status).toBe(429);

    expect(
      await integrationDatabase.rateLimitBucket.findFirst({ where: { action: "report.create" } }),
    ).toMatchObject({ count: 11 });
    expect(await integrationDatabase.report.count()).toBe(1);
    expect(await integrationDatabase.idempotencyRecord.count()).toBe(1);
  });

  it("rejects a replay when suspension commits after session auth but before lookup", async () => {
    const writer = await createUser("topic_replay_suspended_writer");
    const session = await createPersistedSession(writer.id);
    const idempotencyKey = randomUUID();
    const request = () =>
      writeRequest("/api/v1/topics", session, idempotencyKey, {
        title: "Replay suspension yarışı",
        entryBody: "Suspension yarışı boyunca tek kez kalması gereken yeterli uzunlukta entry.",
      });

    expect((await createTopicRoute(request())).status).toBe(201);

    let signalTransitionLock = () => {};
    const transitionLocked = new Promise<void>((resolve) => {
      signalTransitionLock = resolve;
    });
    let releaseTransition = () => {};
    const transitionRelease = new Promise<void>((resolve) => {
      releaseTransition = resolve;
    });
    const transition = integrationDatabase.$transaction(async (transaction) => {
      await lockUserStateForTransition(transaction, writer.id);
      signalTransitionLock();
      await transitionRelease;
      await transaction.user.update({
        where: { id: writer.id },
        data: { status: "SUSPENDED" },
      });
    });
    await transitionLocked;

    const replayPromise = createTopicRoute(request());
    let waitingError: unknown;
    try {
      await waitForBlockedActiveActorPreflight();
    } catch (error) {
      waitingError = error;
    } finally {
      releaseTransition();
      await transition;
    }
    const replay = await replayPromise;
    if (waitingError) throw waitingError;

    expect(replay.status).toBe(403);
    expect(replay.headers.get("Idempotent-Replay")).toBeNull();
    await expect(replay.json()).resolves.toMatchObject({
      error: { code: "ACCOUNT_SUSPENDED" },
    });
    expect(await integrationDatabase.topic.count()).toBe(1);
    expect(await integrationDatabase.entry.count()).toBe(1);
    expect(await integrationDatabase.idempotencyRecord.count()).toBe(1);
    expect(
      await integrationDatabase.rateLimitBucket.findFirst({ where: { action: "topic.create" } }),
    ).toMatchObject({ count: 2 });
  });
});
