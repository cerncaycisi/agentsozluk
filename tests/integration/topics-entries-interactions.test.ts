import { randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET as getHealth } from "@/app/api/health/route";
import { GET as getReady } from "@/app/api/ready/route";
import { GET as getSessionResponse } from "@/app/api/v1/auth/session/route";
import { PUT as putVoteResponse } from "@/app/api/v1/entries/[entryId]/vote/route";
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/config/app";
import { sha256 } from "@/lib/security/crypto";
import type { ActorContext } from "@/modules/auth/domain/actor";
import {
  changeEmail,
  changePassword,
  deactivateAccount,
  updateProfile,
} from "@/modules/auth/application/accounts";
import { loginHuman, registerHuman } from "@/modules/auth/application/authenticate";
import {
  activeSessions,
  authenticateSession,
  endOwnedSession,
  endOtherSessions,
  endSession,
  requireSession,
  rotateCsrfToken,
} from "@/modules/auth/application/sessions";
import { hashPassword } from "@/modules/auth/domain/password";
import { registrationSchema } from "@/modules/auth/validation/schemas";
import { getDebe, getRandomTopic, getTopicFeed } from "@/modules/feeds/application/feeds";
import { calculateTrendScore } from "@/modules/feeds/domain/trending";
import {
  createEntry,
  deleteEntry,
  editEntry,
  getEntry,
  getTopicEntries,
} from "@/modules/entries/application/entries";
import {
  deleteBlock,
  deleteBookmark,
  deleteFollow,
  getBlocks,
  getBookmarks,
  putBlock,
  putBookmark,
  putFollow,
  removeVote,
  setVote,
} from "@/modules/interactions/application/interactions";
import { executeIdempotently } from "@/modules/idempotency/application/idempotency";
import {
  createTopicWithFirstEntry,
  getSitemapTopicCount,
  getSitemapTopics,
  getTopic,
} from "@/modules/topics/application/topics";
import { normalizeTopicTitle } from "@/modules/topics/domain/normalization";
import { searchAll } from "@/modules/search/application/search";
import { buildSearchQuery } from "@/modules/search/repository/search";
import { getPublicProfile } from "@/modules/users/application/profiles";
import {
  mergeTopic,
  moveEntry,
  renameTopic,
  setEntryVisibility,
  setModeratorRole,
  setTopicVisibility,
  setUserSuspension,
} from "@/modules/moderation/application/actions";
import {
  createReport,
  decideReport,
  getModerationReport,
  getModerationReports,
} from "@/modules/moderation/application/reports";
import { getAuditLogs, getModerationDashboard } from "@/modules/moderation/application/queries";
import { enforceRateLimit } from "@/modules/rate-limit/application/rate-limit";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

const passwordHash = "integration-test-password-hash";

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

function actor(userId: string): ActorContext {
  return {
    actorId: userId,
    actorKind: "HUMAN",
    actorRole: "USER",
    requestId: randomUUID(),
    origin: "API",
  };
}

async function createTopic(userId: string, title = "Gerçek PostgreSQL başlığı") {
  return createTopicWithFirstEntry(integrationDatabase, actor(userId), {
    title,
    entryBody: "İlk entry transaction içinde oluşturulan yeterince uzun bir metindir.",
  });
}

async function holdUserWriteLock(): Promise<{ release: () => Promise<void> }> {
  let releaseLock!: () => void;
  let resolveAcquired!: () => void;
  let rejectAcquired!: (error: unknown) => void;
  const releaseSignal = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  const acquired = new Promise<void>((resolve, reject) => {
    resolveAcquired = resolve;
    rejectAcquired = reject;
  });
  const transaction = integrationDatabase.$transaction(
    async (client) => {
      await client.$executeRaw`LOCK TABLE "users" IN SHARE MODE`;
      resolveAcquired();
      await releaseSignal;
    },
    { timeout: 15_000 },
  );
  void transaction.catch(rejectAcquired);
  await acquired;

  let released = false;
  return {
    release: async () => {
      if (!released) {
        released = true;
        releaseLock();
      }
      await transaction;
    },
  };
}

async function waitForBlockedUserWrites(expectedCount: number): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const [activity] = await integrationDatabase.$queryRaw<Array<{ blockedCount: number }>>`
      SELECT count(*)::integer AS "blockedCount"
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND wait_event_type = 'Lock'
        AND (
          query ILIKE '%INSERT INTO%users%'
          OR query ILIKE '%UPDATE%users%'
        )
    `;
    if ((activity?.blockedCount ?? 0) >= expectedCount) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Expected ${expectedCount} user writes to wait on the table lock.`);
}

async function waitForBlockedReportUpdates(expectedCount: number): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const [activity] = await integrationDatabase.$queryRaw<Array<{ blockedCount: number }>>`
      SELECT count(*)::integer AS "blockedCount"
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND wait_event_type = 'Lock'
        AND query ILIKE '%UPDATE%reports%'
    `;
    if ((activity?.blockedCount ?? 0) >= expectedCount) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Expected ${expectedCount} report updates to wait on the row lock.`);
}

async function holdUserRowLock(userId: string): Promise<{ release: () => Promise<void> }> {
  let releaseRow!: () => void;
  let resolveAcquired!: () => void;
  let rejectAcquired!: (error: unknown) => void;
  const releaseSignal = new Promise<void>((resolve) => {
    releaseRow = resolve;
  });
  const acquired = new Promise<void>((resolve, reject) => {
    resolveAcquired = resolve;
    rejectAcquired = reject;
  });
  const transaction = integrationDatabase.$transaction(
    async (client) => {
      await client.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "users"
        WHERE "id" = ${userId}::uuid
        FOR UPDATE
      `;
      resolveAcquired();
      await releaseSignal;
    },
    { timeout: 10_000 },
  );
  void transaction.catch(rejectAcquired);
  await acquired;

  let released = false;
  return {
    release: async () => {
      if (!released) {
        released = true;
        releaseRow();
      }
      await transaction;
    },
  };
}

async function waitForBlockedUserUpdate(): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const [activity] = await integrationDatabase.$queryRaw<Array<{ blockedCount: number }>>`
      SELECT count(*)::integer AS "blockedCount"
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND wait_event_type = 'Lock'
        AND query ILIKE '%UPDATE%users%'
    `;
    if ((activity?.blockedCount ?? 0) >= 1) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Expected a user-state transition to wait on the user row lock.");
}

async function waitForBlockedUserMutationLock(): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const [activity] = await integrationDatabase.$queryRaw<Array<{ blockedCount: number }>>`
      SELECT count(*)::integer AS "blockedCount"
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND wait_event_type = 'Lock'
        AND query ILIKE '%pg_advisory_xact_lock_shared%'
    `;
    if ((activity?.blockedCount ?? 0) >= 1) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Expected an authenticated mutation to wait on the user-state lock.");
}

async function holdAdvisoryLock(key: string): Promise<{ release: () => Promise<void> }> {
  let releaseLock!: () => void;
  let resolveAcquired!: () => void;
  let rejectAcquired!: (error: unknown) => void;
  const releaseSignal = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  const acquired = new Promise<void>((resolve, reject) => {
    resolveAcquired = resolve;
    rejectAcquired = reject;
  });
  const transaction = integrationDatabase.$transaction(
    async (client) => {
      await client.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))
      `;
      resolveAcquired();
      await releaseSignal;
    },
    { timeout: 10_000 },
  );
  void transaction.catch(rejectAcquired);
  await acquired;

  let released = false;
  return {
    release: async () => {
      if (!released) {
        released = true;
        releaseLock();
      }
      await transaction;
    },
  };
}

async function waitForBlockedAdvisoryLocks(expectedCount: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const [activity] = await integrationDatabase.$queryRaw<Array<{ blockedCount: number }>>`
      SELECT count(*)::integer AS "blockedCount"
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND wait_event_type = 'Lock'
        AND query ILIKE '%pg_advisory_xact_lock%'
    `;
    if ((activity?.blockedCount ?? 0) >= expectedCount) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Expected ${expectedCount} content-state operations to wait on advisory locks.`);
}

async function expectExactTopicCounter(topicId: string): Promise<void> {
  const [topic, activeCount, lastActiveEntry] = await Promise.all([
    integrationDatabase.topic.findUniqueOrThrow({ where: { id: topicId } }),
    integrationDatabase.entry.count({ where: { topicId, status: "ACTIVE" } }),
    integrationDatabase.entry.findFirst({
      where: { topicId, status: "ACTIVE" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { createdAt: true },
    }),
  ]);
  expect(topic.entryCount).toBe(activeCount);
  expect(topic.lastEntryAt).toEqual(lastActiveEntry?.createdAt ?? null);
}

function assertRouteDatabaseIsIntegrationDatabase(): void {
  if (
    !process.env.DATABASE_URL ||
    !process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL
  ) {
    throw new Error(
      "Route integration tests require DATABASE_URL and TEST_DATABASE_URL to reference the same test database.",
    );
  }
}

async function createPersistedSession(userId: string) {
  const token = `session-${randomUUID()}`;
  const csrfToken = `csrf-${randomUUID()}`;
  const session = await integrationDatabase.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      csrfTokenHash: sha256(csrfToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  return { ...session, token, csrfToken };
}

function applicationOrigin(): string {
  return new URL(process.env.APP_URL ?? "http://localhost:3000").origin;
}

function sessionCookie(token: string, csrfToken?: string): string {
  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    ...(csrfToken ? [`${CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken)}`] : []),
  ].join("; ");
}

beforeEach(async () => {
  await resetIntegrationDatabase();
});

afterAll(async () => {
  await closeIntegrationDatabase();
});

describe("authentication and accounts with PostgreSQL", () => {
  const registration = (suffix: string) =>
    registrationSchema.parse({
      email: `${suffix}@Integration.Test`,
      username: suffix,
      displayName: `Test ${suffix}`,
      password: "IntegrationPassword123!",
      passwordConfirmation: "IntegrationPassword123!",
      termsAccepted: true,
    });

  it("registers a human and rejects case-insensitive email and username conflicts", async () => {
    const input = registration("register_writer");
    const registered = await registerHuman(
      integrationDatabase,
      { ...input, role: "ADMIN", kind: "AGENT" } as typeof input,
      { userAgent: "integration-browser", ip: "203.0.113.10" },
      randomUUID(),
    );

    expect(registered.user).toMatchObject({
      email: "register_writer@integration.test",
      username: "register_writer",
      role: "USER",
      kind: "HUMAN",
    });
    expect(registered.user).not.toHaveProperty("passwordHash");
    expect(await authenticateSession(integrationDatabase, registered.session.token)).toMatchObject({
      userId: registered.user.id,
    });
    await expect(
      registerHuman(
        integrationDatabase,
        registrationSchema.parse({
          ...registration("different_writer"),
          email: input.email.toUpperCase(),
        }),
        { userAgent: null, ip: null },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "EMAIL_TAKEN", status: 409 });
    await expect(
      registerHuman(
        integrationDatabase,
        registrationSchema.parse({
          ...registration("register_writer"),
          email: "unique@integration.test",
        }),
        { userAgent: null, ip: null },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "USERNAME_TAKEN", status: 409 });
    expect(await integrationDatabase.user.count()).toBe(1);
  });

  it("maps a concurrent registration email race to EMAIL_TAKEN after rollback", async () => {
    const sharedEmail = "registration_email_race@integration.test";
    const inputs = [
      registrationSchema.parse({ ...registration("email_race_one"), email: sharedEmail }),
      registrationSchema.parse({ ...registration("email_race_two"), email: sharedEmail }),
    ];
    const heldWrites = await holdUserWriteLock();
    const outcomesPromise = Promise.allSettled(
      inputs.map((input) =>
        registerHuman(integrationDatabase, input, { userAgent: null, ip: null }, randomUUID()),
      ),
    );

    try {
      await waitForBlockedUserWrites(2);
    } finally {
      await heldWrites.release();
    }
    const outcomes = await outcomesPromise;

    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(outcomes.find((outcome) => outcome.status === "rejected")).toMatchObject({
      reason: { code: "EMAIL_TAKEN", status: 409 },
    });
    expect(await integrationDatabase.user.count({ where: { emailNormalized: sharedEmail } })).toBe(
      1,
    );
    expect(await integrationDatabase.session.count()).toBe(1);
    expect(await integrationDatabase.auditLog.count({ where: { action: "user.registered" } })).toBe(
      1,
    );
  });

  it("maps a concurrent registration username race to USERNAME_TAKEN after rollback", async () => {
    const sharedUsername = "registration_username_race";
    const inputs = [
      registrationSchema.parse({
        ...registration("username_race_email_one"),
        username: sharedUsername,
      }),
      registrationSchema.parse({
        ...registration("username_race_email_two"),
        username: sharedUsername,
      }),
    ];
    const heldWrites = await holdUserWriteLock();
    const outcomesPromise = Promise.allSettled(
      inputs.map((input) =>
        registerHuman(integrationDatabase, input, { userAgent: null, ip: null }, randomUUID()),
      ),
    );

    try {
      await waitForBlockedUserWrites(2);
    } finally {
      await heldWrites.release();
    }
    const outcomes = await outcomesPromise;

    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(outcomes.find((outcome) => outcome.status === "rejected")).toMatchObject({
      reason: { code: "USERNAME_TAKEN", status: 409 },
    });
    expect(
      await integrationDatabase.user.count({ where: { usernameNormalized: sharedUsername } }),
    ).toBe(1);
    expect(await integrationDatabase.session.count()).toBe(1);
    expect(await integrationDatabase.auditLog.count({ where: { action: "user.registered" } })).toBe(
      1,
    );
  });

  it("maps concurrent email changes to one success and one EMAIL_TAKEN conflict", async () => {
    const password = "EmailChangeRacePassword123!";
    const [first, second] = await Promise.all([
      createUser("email_change_race_one"),
      createUser("email_change_race_two"),
    ]);
    await integrationDatabase.user.updateMany({
      where: { id: { in: [first.id, second.id] } },
      data: { passwordHash: await hashPassword(password) },
    });
    const sharedEmail = "email_change_race_shared@integration.test";
    const heldWrites = await holdUserWriteLock();
    const outcomesPromise = Promise.allSettled(
      [first.id, second.id].map((userId) =>
        changeEmail(
          integrationDatabase,
          userId,
          { email: sharedEmail, currentPassword: password },
          randomUUID(),
        ),
      ),
    );

    try {
      await waitForBlockedUserWrites(2);
    } finally {
      await heldWrites.release();
    }
    const outcomes = await outcomesPromise;

    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(outcomes.find((outcome) => outcome.status === "rejected")).toMatchObject({
      reason: { code: "EMAIL_TAKEN", status: 409 },
    });
    expect(await integrationDatabase.user.count({ where: { emailNormalized: sharedEmail } })).toBe(
      1,
    );
    expect(
      await integrationDatabase.auditLog.count({ where: { action: "user.email_changed" } }),
    ).toBe(1);
  });

  it("logs in with a generic invalid-credential response and creates a new session", async () => {
    const input = registration("login_writer");
    const registered = await registerHuman(
      integrationDatabase,
      input,
      { userAgent: null, ip: null },
      randomUUID(),
    );
    await integrationDatabase.user.update({
      where: { id: registered.user.id },
      data: {
        passwordHash: await hash(input.password, {
          algorithm: 2,
          memoryCost: 8192,
          timeCost: 1,
          parallelism: 1,
          outputLen: 32,
        }),
      },
    });
    const loggedIn = await loginHuman(
      integrationDatabase,
      { email: input.email, password: input.password },
      { userAgent: "login-agent", ip: "198.51.100.5" },
      randomUUID(),
    );
    expect(loggedIn.user.id).toBe(registered.user.id);
    expect(loggedIn.session.id).not.toBe(registered.session.id);
    expect(
      (await integrationDatabase.user.findUniqueOrThrow({ where: { id: registered.user.id } }))
        .passwordHash,
    ).toContain("m=65536,t=3,p=1");

    for (const invalid of [
      { email: input.email, password: "WrongPassword123!" },
      { email: "missing@integration.test", password: "WrongPassword123!" },
    ]) {
      await expect(
        loginHuman(integrationDatabase, invalid, { userAgent: null, ip: null }, randomUUID()),
      ).rejects.toMatchObject({
        code: "INVALID_CREDENTIALS",
        status: 401,
        message: "E-posta veya şifre hatalı.",
      });
    }
  });

  it("serializes login behind a password change and rejects the stale password", async () => {
    const input = registration("login_password_race");
    const registered = await registerHuman(
      integrationDatabase,
      input,
      { userAgent: "current-session", ip: null },
      randomUUID(),
    );
    const newPassword = "LoginRaceNewPassword456!";
    const heldUserState = await holdAdvisoryLock(`user-state:${registered.user.id}`);
    const passwordOutcome = changePassword(
      integrationDatabase,
      registered.user.id,
      registered.session.id,
      {
        currentPassword: input.password,
        newPassword,
        newPasswordConfirmation: newPassword,
      },
      randomUUID(),
    ).then(
      () => ({ status: "fulfilled" as const }),
      (reason: unknown) => ({ status: "rejected" as const, reason }),
    );

    try {
      await waitForBlockedAdvisoryLocks(1);
      const loginOutcome = loginHuman(
        integrationDatabase,
        { email: input.email, password: input.password },
        { userAgent: "stale-login", ip: null },
        randomUUID(),
      ).then(
        () => ({ status: "fulfilled" as const }),
        (reason: unknown) => ({ status: "rejected" as const, reason }),
      );
      await waitForBlockedAdvisoryLocks(2);
      await heldUserState.release();

      expect(await passwordOutcome).toEqual({ status: "fulfilled" });
      expect(await loginOutcome).toMatchObject({
        status: "rejected",
        reason: {
          code: "INVALID_CREDENTIALS",
          status: 401,
          message: "E-posta veya şifre hatalı.",
        },
      });
    } finally {
      await heldUserState.release();
    }

    expect(
      await integrationDatabase.session.count({
        where: { userId: registered.user.id, revokedAt: null },
      }),
    ).toBe(1);
    expect(
      await integrationDatabase.auditLog.count({
        where: { actorId: registered.user.id, action: "session.created" },
      }),
    ).toBe(0);
    await expect(
      loginHuman(
        integrationDatabase,
        { email: input.email, password: newPassword },
        { userAgent: "fresh-login", ip: null },
        randomUUID(),
      ),
    ).resolves.toMatchObject({ user: { id: registered.user.id } });
  });

  it("lists, rotates and revokes owned sessions", async () => {
    const input = registration("session_writer");
    const registered = await registerHuman(
      integrationDatabase,
      input,
      { userAgent: "first-agent", ip: null },
      randomUUID(),
    );
    const second = await loginHuman(
      integrationDatabase,
      { email: input.email, password: input.password },
      { userAgent: "second-agent", ip: null },
      randomUUID(),
    );
    expect(
      await activeSessions(integrationDatabase, registered.user.id, registered.session.id),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: registered.session.id, current: true }),
        expect.objectContaining({ id: second.session.id, current: false }),
      ]),
    );
    const csrfToken = await rotateCsrfToken(integrationDatabase, registered.session.id);
    expect(csrfToken.length).toBeGreaterThan(40);
    await expect(
      endOwnedSession(integrationDatabase, randomUUID(), second.session.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await endOwnedSession(integrationDatabase, registered.user.id, second.session.id);
    expect(await authenticateSession(integrationDatabase, second.session.token)).toBeNull();
    await endSession(integrationDatabase, registered.session.id);
    await expect(
      requireSession(integrationDatabase, registered.session.token),
    ).rejects.toMatchObject({
      code: "AUTH_REQUIRED",
      status: 401,
    });
  });

  it("changes profile, email and password while revoking only other sessions", async () => {
    const input = registration("account_writer");
    const registered = await registerHuman(
      integrationDatabase,
      input,
      { userAgent: "first-agent", ip: null },
      randomUUID(),
    );
    const second = await loginHuman(
      integrationDatabase,
      { email: input.email, password: input.password },
      { userAgent: "second-agent", ip: null },
      randomUUID(),
    );
    expect(
      await updateProfile(
        integrationDatabase,
        registered.user.id,
        { displayName: "Yeni Görünen Ad", bio: "PostgreSQL profil testi" },
        randomUUID(),
      ),
    ).toMatchObject({ displayName: "Yeni Görünen Ad", bio: "PostgreSQL profil testi" });
    const changedEmail = "changed_account@integration.test";
    expect(
      await changeEmail(
        integrationDatabase,
        registered.user.id,
        { email: changedEmail, currentPassword: input.password },
        randomUUID(),
      ),
    ).toMatchObject({ email: changedEmail });
    const newPassword = "ChangedIntegrationPassword456!";
    await changePassword(
      integrationDatabase,
      registered.user.id,
      registered.session.id,
      {
        currentPassword: input.password,
        newPassword,
        newPasswordConfirmation: newPassword,
      },
      randomUUID(),
    );
    expect(await authenticateSession(integrationDatabase, registered.session.token)).not.toBeNull();
    expect(await authenticateSession(integrationDatabase, second.session.token)).toBeNull();
    await endOtherSessions(integrationDatabase, registered.user.id, registered.session.id);
    expect(
      await loginHuman(
        integrationDatabase,
        { email: changedEmail, password: newPassword },
        { userAgent: null, ip: null },
        randomUUID(),
      ),
    ).toMatchObject({ user: { id: registered.user.id } });
  });

  it("serializes password and email changes so a stale current password is rejected", async () => {
    const input = registration("sensitive_account_race");
    const registered = await registerHuman(
      integrationDatabase,
      input,
      { userAgent: "current-session", ip: null },
      randomUUID(),
    );
    const otherSession = await loginHuman(
      integrationDatabase,
      { email: input.email, password: input.password },
      { userAgent: "other-session", ip: null },
      randomUUID(),
    );
    const newPassword = "SerializedPasswordChange456!";
    const heldUserState = await holdAdvisoryLock(`user-state:${registered.user.id}`);
    const passwordOutcome = changePassword(
      integrationDatabase,
      registered.user.id,
      registered.session.id,
      {
        currentPassword: input.password,
        newPassword,
        newPasswordConfirmation: newPassword,
      },
      randomUUID(),
    ).then(
      () => ({ status: "fulfilled" as const }),
      (reason: unknown) => ({ status: "rejected" as const, reason }),
    );

    try {
      await waitForBlockedAdvisoryLocks(1);
      const emailOutcome = changeEmail(
        integrationDatabase,
        registered.user.id,
        { email: "stale_password_must_not_win@integration.test", currentPassword: input.password },
        randomUUID(),
      ).then(
        () => ({ status: "fulfilled" as const }),
        (reason: unknown) => ({ status: "rejected" as const, reason }),
      );
      await waitForBlockedAdvisoryLocks(2);
      await heldUserState.release();

      expect(await passwordOutcome).toEqual({ status: "fulfilled" });
      expect(await emailOutcome).toMatchObject({
        status: "rejected",
        reason: { code: "INVALID_CREDENTIALS", status: 401 },
      });
    } finally {
      await heldUserState.release();
    }

    expect(
      await integrationDatabase.user.findUniqueOrThrow({ where: { id: registered.user.id } }),
    ).toMatchObject({ email: input.email, emailNormalized: input.email });
    expect(await authenticateSession(integrationDatabase, registered.session.token)).not.toBeNull();
    expect(await authenticateSession(integrationDatabase, otherSession.session.token)).toBeNull();
    await expect(
      loginHuman(
        integrationDatabase,
        { email: input.email, password: input.password },
        { userAgent: null, ip: null },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", status: 401 });
    await expect(
      loginHuman(
        integrationDatabase,
        { email: input.email, password: newPassword },
        { userAgent: null, ip: null },
        randomUUID(),
      ),
    ).resolves.toMatchObject({ user: { id: registered.user.id } });
    expect(
      await integrationDatabase.auditLog.count({
        where: { actorId: registered.user.id, action: "user.password_changed" },
      }),
    ).toBe(1);
    expect(
      await integrationDatabase.auditLog.count({
        where: { actorId: registered.user.id, action: "user.email_changed" },
      }),
    ).toBe(0);
  });

  it("anonymizes a normal account and deletes private interactions", async () => {
    const input = registration("deactivate_writer");
    const registered = await registerHuman(
      integrationDatabase,
      input,
      { userAgent: null, ip: null },
      randomUUID(),
    );
    const other = await createUser("deactivate_other");
    const topic = await createTopic(other.id, "Anonimleştirme başlığı");
    await putBookmark(integrationDatabase, actor(registered.user.id), topic.entry.id);
    await putFollow(integrationDatabase, actor(registered.user.id), topic.topic.id);
    await putBlock(integrationDatabase, actor(registered.user.id), other.id);

    await deactivateAccount(
      integrationDatabase,
      registered.user.id,
      { currentPassword: input.password, usernameConfirmation: input.username },
      randomUUID(),
    );

    expect(
      await integrationDatabase.user.findUniqueOrThrow({ where: { id: registered.user.id } }),
    ).toMatchObject({
      status: "DEACTIVATED",
      displayName: "silinmiş hesap",
      bio: null,
    });
    expect(
      await integrationDatabase.entryBookmark.count({ where: { userId: registered.user.id } }),
    ).toBe(0);
    expect(
      await integrationDatabase.topicFollow.count({ where: { userId: registered.user.id } }),
    ).toBe(0);
    expect(
      await integrationDatabase.userBlock.count({ where: { blockerId: registered.user.id } }),
    ).toBe(0);
    await expect(
      loginHuman(
        integrationDatabase,
        { email: input.email, password: input.password },
        { userAgent: null, ip: null },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", status: 401 });
  });

  it("serializes deactivation vote cleanup with a concurrent vote and recalculates only affected entries", async () => {
    const input = registration("deactivation_vote_race");
    const registered = await registerHuman(
      integrationDatabase,
      input,
      { userAgent: null, ip: null },
      randomUUID(),
    );
    const author = await createUser("deactivation_vote_author");
    const concurrentVoter = await createUser("deactivation_concurrent_voter");
    const affected = await createTopic(author.id, "Deactivation vote counter race");
    const unrelated = await createTopic(author.id, "Unrelated counter must remain untouched");
    await setVote(integrationDatabase, actor(registered.user.id), affected.entry.id, 1);
    await integrationDatabase.entry.update({
      where: { id: unrelated.entry.id },
      data: { upvoteCount: 41, downvoteCount: 12, score: 29 },
    });

    const heldVoteCounter = await holdAdvisoryLock(`entry-vote:${affected.entry.id}`);
    const deactivationOutcome = deactivateAccount(
      integrationDatabase,
      registered.user.id,
      { currentPassword: input.password, usernameConfirmation: input.username },
      randomUUID(),
    ).then(
      () => ({ status: "fulfilled" as const }),
      (reason: unknown) => ({ status: "rejected" as const, reason }),
    );

    try {
      await waitForBlockedAdvisoryLocks(1);
      const voteOutcome = setVote(
        integrationDatabase,
        actor(concurrentVoter.id),
        affected.entry.id,
        -1,
      ).then(
        () => ({ status: "fulfilled" as const }),
        (reason: unknown) => ({ status: "rejected" as const, reason }),
      );
      await waitForBlockedAdvisoryLocks(2);
      await heldVoteCounter.release();

      expect(await deactivationOutcome).toEqual({ status: "fulfilled" });
      expect(await voteOutcome).toEqual({ status: "fulfilled" });
    } finally {
      await heldVoteCounter.release();
    }

    expect(
      await integrationDatabase.entryVote.count({ where: { userId: registered.user.id } }),
    ).toBe(0);
    expect(
      await integrationDatabase.entry.findUniqueOrThrow({ where: { id: affected.entry.id } }),
    ).toMatchObject({ upvoteCount: 0, downvoteCount: 1, score: -1 });
    expect(
      await integrationDatabase.entry.findUniqueOrThrow({ where: { id: unrelated.entry.id } }),
    ).toMatchObject({ upvoteCount: 41, downvoteCount: 12, score: 29 });
  });

  it("serializes account deactivation ahead of a concurrent authenticated write", async () => {
    const input = registration("deactivation_write_race");
    const registered = await registerHuman(
      integrationDatabase,
      input,
      { userAgent: null, ip: null },
      randomUUID(),
    );
    const heldRow = await holdUserRowLock(registered.user.id);
    const deactivationOutcome = deactivateAccount(
      integrationDatabase,
      registered.user.id,
      { currentPassword: input.password, usernameConfirmation: input.username },
      randomUUID(),
    ).then(
      () => ({ status: "fulfilled" as const }),
      (reason: unknown) => ({ status: "rejected" as const, reason }),
    );

    try {
      await waitForBlockedUserUpdate();
      const profileOutcome = updateProfile(
        integrationDatabase,
        registered.user.id,
        { displayName: "Yarış sonrası yazılmamalı", bio: "Bu profil mutasyonu reddedilmeli." },
        randomUUID(),
      ).then(
        () => ({ status: "fulfilled" as const }),
        (reason: unknown) => ({ status: "rejected" as const, reason }),
      );
      await waitForBlockedUserMutationLock();
      await heldRow.release();

      expect(await deactivationOutcome).toEqual({ status: "fulfilled" });
      expect(await profileOutcome).toMatchObject({
        status: "rejected",
        reason: { code: "AUTH_REQUIRED", status: 401 },
      });
    } finally {
      await heldRow.release();
    }

    expect(
      await integrationDatabase.user.findUniqueOrThrow({ where: { id: registered.user.id } }),
    ).toMatchObject({ status: "DEACTIVATED", displayName: "silinmiş hesap", bio: null });
    expect(
      await integrationDatabase.auditLog.count({
        where: { actorId: registered.user.id, action: "user.profile_updated" },
      }),
    ).toBe(0);
  });

  it("lets a suspended user manage profile, security and sessions before deactivation", async () => {
    const input = registration("suspended_account_settings");
    const registered = await registerHuman(
      integrationDatabase,
      input,
      { userAgent: "initial-session", ip: null },
      randomUUID(),
    );
    await integrationDatabase.user.update({
      where: { id: registered.user.id },
      data: { status: "SUSPENDED" },
    });

    const loggedIn = await loginHuman(
      integrationDatabase,
      { email: input.email, password: input.password },
      { userAgent: "suspended-login", ip: null },
      randomUUID(),
    );
    expect(loggedIn.user.status).toBe("SUSPENDED");

    const profile = await updateProfile(
      integrationDatabase,
      registered.user.id,
      { displayName: "Askıdayken Ayarlanabilir", bio: "Hesap ayarları erişilebilir kalır." },
      randomUUID(),
    );
    expect(profile).toMatchObject({
      status: "SUSPENDED",
      displayName: "Askıdayken Ayarlanabilir",
    });

    const changedEmail = "suspended_account_settings_new@integration.test";
    await expect(
      changeEmail(
        integrationDatabase,
        registered.user.id,
        { email: changedEmail, currentPassword: input.password },
        randomUUID(),
      ),
    ).resolves.toMatchObject({ email: changedEmail, status: "SUSPENDED" });

    const newPassword = "SuspendedSettingsPassword456!";
    await changePassword(
      integrationDatabase,
      registered.user.id,
      loggedIn.session.id,
      {
        currentPassword: input.password,
        newPassword,
        newPasswordConfirmation: newPassword,
      },
      randomUUID(),
    );
    const sessionsAfterPassword = await activeSessions(
      integrationDatabase,
      registered.user.id,
      loggedIn.session.id,
    );
    expect(sessionsAfterPassword).toEqual([
      expect.objectContaining({ id: loggedIn.session.id, current: true }),
    ]);

    const relogged = await loginHuman(
      integrationDatabase,
      { email: changedEmail, password: newPassword },
      { userAgent: "suspended-relogin", ip: null },
      randomUUID(),
    );
    expect(relogged.user.status).toBe("SUSPENDED");
    await endOtherSessions(integrationDatabase, registered.user.id, relogged.session.id);
    expect(
      await activeSessions(integrationDatabase, registered.user.id, relogged.session.id),
    ).toEqual([expect.objectContaining({ id: relogged.session.id, current: true })]);

    await deactivateAccount(
      integrationDatabase,
      registered.user.id,
      { currentPassword: newPassword, usernameConfirmation: input.username },
      randomUUID(),
    );
    expect(
      await integrationDatabase.user.findUniqueOrThrow({ where: { id: registered.user.id } }),
    ).toMatchObject({ status: "DEACTIVATED", displayName: "silinmiş hesap" });
  });

  it("enforces an atomic PostgreSQL fixed-window rate limit", async () => {
    const identifier = "203.0.113.77";
    const rule = { action: "integration:limit", limit: 2, windowMs: 60_000 };
    const now = new Date("2026-07-17T09:00:30.000Z");
    await enforceRateLimit(integrationDatabase, identifier, rule, now);
    await enforceRateLimit(integrationDatabase, identifier, rule, now);
    await expect(
      enforceRateLimit(integrationDatabase, identifier, rule, now),
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
      headers: { "Retry-After": "30" },
    });
    const bucket = await integrationDatabase.rateLimitBucket.findFirstOrThrow();
    expect(bucket.keyHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(bucket.keyHash).not.toContain(identifier);
    expect(await integrationDatabase.rateLimitBucket.count()).toBe(1);
  });

  it("enforces the strict entry interval atomically across fixed-window boundaries", async () => {
    const identifier = "user:65ddf4d2-ce2e-40cc-af27-d7d479696540";
    const rule = {
      action: "integration:minimum-interval",
      minimumIntervalMs: 10_000,
      strategy: "minimum-interval" as const,
    };
    const first = new Date("2026-07-17T09:00:09.999Z");
    await enforceRateLimit(integrationDatabase, identifier, rule, first);

    await expect(
      enforceRateLimit(integrationDatabase, identifier, rule, new Date(first.getTime() + 9_999)),
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
      headers: { "Retry-After": "10" },
    });

    await enforceRateLimit(
      integrationDatabase,
      identifier,
      rule,
      new Date(first.getTime() + 10_000),
    );
    const concurrent = await Promise.allSettled([
      enforceRateLimit(integrationDatabase, identifier, rule, new Date(first.getTime() + 20_000)),
      enforceRateLimit(integrationDatabase, identifier, rule, new Date(first.getTime() + 20_000)),
    ]);
    expect(concurrent.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(concurrent.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "RATE_LIMITED", status: 429 },
    });

    const bucket = await integrationDatabase.rateLimitBucket.findFirstOrThrow({
      where: { action: rule.action },
    });
    expect(bucket.count).toBe(3);
    expect(bucket.windowStart).toEqual(new Date(0));
    expect(bucket.keyHash).not.toContain(identifier);
  });
});

describe("topics and entries with PostgreSQL", () => {
  it("creates a topic and first entry atomically and rejects normalized duplicates", async () => {
    const writer = await createUser("writer_one");
    const created = await createTopic(writer.id, "  İyi   Bir\nBaşlık  ");

    expect(created.topic.title).toBe("İyi Bir Başlık");
    expect(created.topic.normalizedTitle).toBe("iyi bir başlık");
    expect(created.topic.entryCount).toBe(1);
    expect(created.entry.body).toContain("transaction içinde");
    await expect(createTopic(writer.id, "iyi bir başlık")).rejects.toMatchObject({
      code: "TOPIC_EXISTS",
      status: 409,
      details: {
        canonicalTopic: {
          id: created.topic.id,
          title: created.topic.title,
          url: created.topic.url,
        },
      },
    });
    expect(await integrationDatabase.topic.count()).toBe(1);
    expect(await integrationDatabase.entry.count()).toBe(1);
  });

  it("returns topic visibility, follow, merge and paginated sitemap contracts", async () => {
    const owner = await createUser("topic_contract_owner");
    const follower = await createUser("topic_contract_follower");
    const moderator = await createUser("topic_contract_moderator");
    await integrationDatabase.user.update({
      where: { id: moderator.id },
      data: { role: "MODERATOR" },
    });
    const source = await createTopic(owner.id, "Görünürlük ve sitemap başlığı");
    const target = await createTopic(owner.id, "Birleşme hedefi başlığı");
    await integrationDatabase.agentGlobalSettings.update({
      where: { id: "global" },
      data: { sitemapDelayMinutes: 0 },
    });
    await putFollow(integrationDatabase, actor(follower.id), source.topic.id);

    await expect(
      getTopic(integrationDatabase, source.topic.id, {
        userId: follower.id,
        role: "USER",
        status: "ACTIVE",
      }),
    ).resolves.toMatchObject({ id: source.topic.id, following: true, status: "ACTIVE" });
    expect(await getSitemapTopicCount(integrationDatabase)).toBe(2);
    await expect(
      getSitemapTopics(integrationDatabase, { page: 0, pageSize: 1 }),
    ).resolves.toHaveLength(1);
    await expect(
      getSitemapTopics(integrationDatabase, { page: 1, pageSize: 1 }),
    ).resolves.toHaveLength(1);

    const reason = { reason: "Topic görünürlük sözleşmesini doğrulayan yeterli test gerekçesi." };
    await setTopicVisibility(
      integrationDatabase,
      actor(moderator.id),
      source.topic.id,
      true,
      reason,
    );
    await expect(getTopic(integrationDatabase, source.topic.id, null)).rejects.toMatchObject({
      code: "TOPIC_NOT_FOUND",
      status: 404,
    });
    await expect(
      getTopic(integrationDatabase, source.topic.id, {
        userId: owner.id,
        role: "USER",
        status: "ACTIVE",
      }),
    ).resolves.toMatchObject({ status: "HIDDEN" });
    await expect(
      getTopic(integrationDatabase, source.topic.id, {
        userId: moderator.id,
        role: "MODERATOR",
        status: "ACTIVE",
      }),
    ).resolves.toMatchObject({ status: "HIDDEN" });
    await setTopicVisibility(
      integrationDatabase,
      actor(moderator.id),
      source.topic.id,
      false,
      reason,
    );
    await mergeTopic(integrationDatabase, actor(moderator.id), source.topic.id, {
      targetTopicId: target.topic.id,
      reason: "Topic canonical birleşme sözleşmesini doğrulayan yeterli test gerekçesi.",
    });
    await expect(getTopic(integrationDatabase, source.topic.id, null)).rejects.toMatchObject({
      code: "TOPIC_MERGED",
      status: 409,
      details: {
        canonicalTopic: expect.objectContaining({ id: target.topic.id, url: target.topic.url }),
      },
    });
  });

  it("prevents a topic title that conflicts with an alias", async () => {
    const writer = await createUser("writer_two");
    const created = await createTopic(writer.id);
    await integrationDatabase.topicAlias.create({
      data: {
        topicId: created.topic.id,
        title: "Eski Başlık",
        normalizedTitle: normalizeTopicTitle("Eski Başlık"),
        slug: "eski-baslik",
      },
    });

    await expect(createTopic(writer.id, "ESKİ BAŞLIK")).rejects.toMatchObject({
      code: "TOPIC_EXISTS",
      status: 409,
    });
  });

  it("serializes a duplicate topic race with the advisory lock", async () => {
    const firstWriter = await createUser("race_writer_one");
    const secondWriter = await createUser("race_writer_two");
    const results = await Promise.allSettled([
      createTopic(firstWriter.id, "Yarış Koşulu Başlığı"),
      createTopic(secondWriter.id, "yarış koşulu başlığı"),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: { code: "TOPIC_EXISTS", status: 409 },
    });
    expect(await integrationDatabase.topic.count()).toBe(1);
    expect(await integrationDatabase.entry.count()).toBe(1);
  });

  it("leaves no entry or follow under a merged topic when create and follow race the merge", async () => {
    const author = await createUser("topic_state_race_author");
    const writer = await createUser("topic_state_race_writer");
    const follower = await createUser("topic_state_race_follower");
    const moderator = await createUser("topic_state_race_moderator");
    await integrationDatabase.user.update({
      where: { id: moderator.id },
      data: { role: "MODERATOR" },
    });
    const source = await createTopic(author.id, "Birleşme ile oluşturma yarışı kaynağı");
    const target = await createTopic(author.id, "Birleşme ile oluşturma yarışı hedefi");
    const heldLock = await holdAdvisoryLock(`topic-state:${source.topic.id}`);

    const operations = [
      createEntry(integrationDatabase, actor(writer.id), source.topic.id, {
        body: "Birleşmeyle aynı anda oluşturulup canonical başlıkta kalması gereken entry metni.",
      }),
      putFollow(integrationDatabase, actor(follower.id), source.topic.id),
      mergeTopic(integrationDatabase, actor(moderator.id), source.topic.id, {
        targetTopicId: target.topic.id,
        reason: "Create ve follow yarışında source topic boş kalmalıdır.",
      }),
    ] as const;
    const outcomesPromise = Promise.allSettled(operations);
    try {
      await waitForBlockedAdvisoryLocks(3);
    } finally {
      await heldLock.release();
    }
    const outcomes = await outcomesPromise;

    expect(outcomes[2]).toMatchObject({ status: "fulfilled" });
    if (outcomes[0]?.status === "rejected") {
      expect(outcomes[0].reason).toMatchObject({ code: "TOPIC_MERGED", status: 409 });
    }
    expect(
      await integrationDatabase.entry.count({
        where: { topic: { status: "MERGED" } },
      }),
    ).toBe(0);
    expect(
      await integrationDatabase.topicFollow.count({
        where: { topic: { status: "MERGED" } },
      }),
    ).toBe(0);
    await expect(
      integrationDatabase.topic.findUniqueOrThrow({ where: { id: source.topic.id } }),
    ).resolves.toMatchObject({
      status: "MERGED",
      mergedIntoId: target.topic.id,
      entryCount: 0,
      lastEntryAt: null,
    });
    await expectExactTopicCounter(source.topic.id);
    await expectExactTopicCounter(target.topic.id);
  });

  it("keeps deletion final when an entry hide races the author delete", async () => {
    const author = await createUser("entry_state_race_author");
    const moderator = await createUser("entry_state_race_moderator");
    await integrationDatabase.user.update({
      where: { id: moderator.id },
      data: { role: "MODERATOR" },
    });
    const created = await createTopic(author.id, "Entry delete ve hide yarış başlığı");
    const heldLock = await holdAdvisoryLock(`entry-state:${created.entry.id}`);
    const deleteOutcome = deleteEntry(integrationDatabase, actor(author.id), created.entry.id).then(
      (value) => ({ status: "fulfilled" as const, value }),
      (reason: unknown) => ({ status: "rejected" as const, reason }),
    );

    try {
      await waitForBlockedAdvisoryLocks(1);
      const hideOutcome = setEntryVisibility(
        integrationDatabase,
        actor(moderator.id),
        created.entry.id,
        true,
        { reason: "Silme ile gizleme yarışında silinen entry yeniden görünmemelidir." },
      ).then(
        (value) => ({ status: "fulfilled" as const, value }),
        (reason: unknown) => ({ status: "rejected" as const, reason }),
      );
      await waitForBlockedAdvisoryLocks(2);
      await heldLock.release();

      expect(await deleteOutcome).toMatchObject({
        status: "fulfilled",
        value: { status: "DELETED" },
      });
      expect(await hideOutcome).toMatchObject({
        status: "rejected",
        reason: { code: "ENTRY_NOT_EDITABLE" },
      });
    } finally {
      await heldLock.release();
    }

    await expect(
      integrationDatabase.entry.findUniqueOrThrow({ where: { id: created.entry.id } }),
    ).resolves.toMatchObject({ status: "DELETED", hiddenAt: null });
    expect(
      (await integrationDatabase.entry.findUniqueOrThrow({ where: { id: created.entry.id } }))
        .deletedAt,
    ).not.toBeNull();
    await expect(
      setEntryVisibility(integrationDatabase, actor(moderator.id), created.entry.id, false, {
        reason: "Silinen entry restore edilmemelidir.",
      }),
    ).rejects.toMatchObject({ code: "ENTRY_NOT_EDITABLE", status: 409 });
    await expectExactTopicCounter(created.topic.id);
  });

  it("serializes overlapping topic merges and preserves every topic counter", async () => {
    const author = await createUser("overlapping_merge_author");
    const moderator = await createUser("overlapping_merge_moderator");
    await integrationDatabase.user.update({
      where: { id: moderator.id },
      data: { role: "MODERATOR" },
    });
    const first = await createTopic(author.id, "Örtüşen merge ilk başlık");
    const middle = await createTopic(author.id, "Örtüşen merge orta başlık");
    const last = await createTopic(author.id, "Örtüşen merge son başlık");
    const heldLock = await holdAdvisoryLock(`topic-state:${middle.topic.id}`);
    const mergeOutcomesPromise = Promise.allSettled([
      mergeTopic(integrationDatabase, actor(moderator.id), first.topic.id, {
        targetTopicId: middle.topic.id,
        reason: "Örtüşen A-B merge işlemi ortak topic lock kullanmalıdır.",
      }),
      mergeTopic(integrationDatabase, actor(moderator.id), middle.topic.id, {
        targetTopicId: last.topic.id,
        reason: "Örtüşen B-C merge işlemi ortak topic lock kullanmalıdır.",
      }),
    ]);
    try {
      await waitForBlockedAdvisoryLocks(2);
    } finally {
      await heldLock.release();
    }
    const mergeOutcomes = await mergeOutcomesPromise;

    expect(
      mergeOutcomes.filter((outcome) => outcome.status === "fulfilled").length,
    ).toBeGreaterThan(0);
    for (const outcome of mergeOutcomes) {
      if (outcome.status === "rejected") {
        expect(outcome.reason).toMatchObject({ code: "TOPIC_HIDDEN", status: 409 });
      }
    }
    expect(await integrationDatabase.entry.count({ where: { topic: { status: "MERGED" } } })).toBe(
      0,
    );
    expect(
      await integrationDatabase.topicFollow.count({ where: { topic: { status: "MERGED" } } }),
    ).toBe(0);
    await Promise.all(
      [first.topic.id, middle.topic.id, last.topic.id].map((topicId) =>
        expectExactTopicCounter(topicId),
      ),
    );
  });

  it("creates, revises, leaves unchanged and soft-deletes an entry with exact counters", async () => {
    const writer = await createUser("writer_three");
    const created = await createTopic(writer.id);
    const second = await createEntry(integrationDatabase, actor(writer.id), created.topic.id, {
      body: "Düzenlenecek ikinci entry için yeterince uzun başlangıç metni.",
    });
    expect(
      (await integrationDatabase.topic.findUniqueOrThrow({ where: { id: created.topic.id } }))
        .entryCount,
    ).toBe(2);

    const updated = await editEntry(
      integrationDatabase,
      actor(writer.id),
      { body: "Düzenlenmiş ikinci entry ve doğrulanmış yeni içerik metni." },
      second.id,
    );
    expect(updated.body).toContain("Düzenlenmiş");
    expect(await integrationDatabase.entryRevision.count({ where: { entryId: second.id } })).toBe(
      1,
    );

    await editEntry(
      integrationDatabase,
      actor(writer.id),
      { body: "Düzenlenmiş ikinci entry ve doğrulanmış yeni içerik metni." },
      second.id,
    );
    expect(await integrationDatabase.entryRevision.count({ where: { entryId: second.id } })).toBe(
      1,
    );

    const deleted = await deleteEntry(integrationDatabase, actor(writer.id), second.id);
    expect(deleted.status).toBe("DELETED");
    expect(deleted.body).toContain("Düzenlenmiş");
    expect(
      (await integrationDatabase.topic.findUniqueOrThrow({ where: { id: created.topic.id } }))
        .entryCount,
    ).toBe(1);
    expect(await integrationDatabase.entry.count({ where: { id: second.id } })).toBe(1);
    expect(
      await integrationDatabase.outboxEvent.count({ where: { eventType: "entry.deleted" } }),
    ).toBe(1);
    await expect(getEntry(integrationDatabase, second.id, null)).resolves.toMatchObject({
      body: "bu entry yazar tarafından silindi",
      status: "DELETED",
    });
    await expect(
      getEntry(integrationDatabase, second.id, {
        userId: writer.id,
        role: "USER",
        status: "ACTIVE",
      }),
    ).resolves.toMatchObject({ body: deleted.body, status: "DELETED" });
  });

  it("keeps canonical seed entries immutable while allowing votes", async () => {
    const author = await createUser("seed_corpus_author");
    const voter = await createUser("seed_corpus_voter");
    const moderator = await createUser("seed_corpus_moderator");
    await integrationDatabase.user.update({
      where: { id: moderator.id },
      data: { role: "MODERATOR" },
    });
    const source = await createTopic(author.id, "Korunan Seed Başlığı");
    const target = await createTopic(author.id, "Korunan Seed Hedefi");
    const body = "Production boyunca özgün kalacak korunan seed entry içeriği.";
    const protectedEntry = await createEntry(
      integrationDatabase,
      { ...actor(author.id), origin: "SEED" },
      source.topic.id,
      { body },
    );

    await expect(
      editEntry(
        integrationDatabase,
        actor(author.id),
        { body: "Korunan seed entry için değiştirilmiş içerik denemesi." },
        protectedEntry.id,
      ),
    ).rejects.toMatchObject({ code: "ENTRY_NOT_EDITABLE", status: 409 });
    await expect(
      deleteEntry(integrationDatabase, actor(author.id), protectedEntry.id),
    ).rejects.toMatchObject({ code: "ENTRY_NOT_EDITABLE", status: 409 });
    await expect(
      setEntryVisibility(integrationDatabase, actor(moderator.id), protectedEntry.id, true, {
        reason: "Korunan seed içeriği gizleme denemesi.",
      }),
    ).rejects.toMatchObject({ code: "ENTRY_NOT_EDITABLE", status: 409 });
    await expect(
      moveEntry(integrationDatabase, actor(moderator.id), protectedEntry.id, {
        targetTopicId: target.topic.id,
        reason: "Korunan seed içeriği taşıma denemesi.",
      }),
    ).rejects.toMatchObject({ code: "ENTRY_NOT_EDITABLE", status: 409 });
    await expect(
      mergeTopic(integrationDatabase, actor(moderator.id), source.topic.id, {
        targetTopicId: target.topic.id,
        reason: "Korunan seed içeren başlığı birleştirme denemesi.",
      }),
    ).rejects.toMatchObject({ code: "ENTRY_NOT_EDITABLE", status: 409 });

    await expect(
      setVote(integrationDatabase, actor(voter.id), protectedEntry.id, 1),
    ).resolves.toMatchObject({ score: 1, upvoteCount: 1 });
    await expect(
      integrationDatabase.entry.update({
        where: { id: protectedEntry.id },
        data: { body: "Doğrudan veri katmanı değişiklik denemesi." },
      }),
    ).rejects.toThrow(/Canonical SEED entries are immutable/u);
    await expect(
      integrationDatabase.entry.delete({ where: { id: protectedEntry.id } }),
    ).rejects.toThrow(/Canonical SEED entries are immutable/u);
    await expect(
      integrationDatabase.entry.findUniqueOrThrow({ where: { id: protectedEntry.id } }),
    ).resolves.toMatchObject({
      body,
      status: "ACTIVE",
      origin: "SEED",
      topicId: source.topic.id,
      score: 1,
    });
  });
});

describe("interactions with PostgreSQL", () => {
  it("creates, repeats, changes and removes a vote atomically", async () => {
    const author = await createUser("vote_author");
    const voter = await createUser("vote_voter");
    const created = await createTopic(author.id);

    expect(await setVote(integrationDatabase, actor(voter.id), created.entry.id, 1)).toMatchObject({
      value: 1,
      score: 1,
      upvoteCount: 1,
      downvoteCount: 0,
    });
    expect(await setVote(integrationDatabase, actor(voter.id), created.entry.id, 1)).toMatchObject({
      value: 1,
      score: 1,
    });
    expect(await setVote(integrationDatabase, actor(voter.id), created.entry.id, -1)).toMatchObject(
      {
        value: -1,
        score: -1,
        upvoteCount: 0,
        downvoteCount: 1,
      },
    );
    expect(await removeVote(integrationDatabase, actor(voter.id), created.entry.id)).toMatchObject({
      value: null,
      score: 0,
      upvoteCount: 0,
      downvoteCount: 0,
    });
    expect(
      await integrationDatabase.outboxEvent.count({ where: { eventType: "entry.voted" } }),
    ).toBe(3);
  });

  it("rejects voting on an own entry", async () => {
    const author = await createUser("own_vote_author");
    const created = await createTopic(author.id);
    await expect(
      setVote(integrationDatabase, actor(author.id), created.entry.id, 1),
    ).rejects.toMatchObject({
      code: "CANNOT_VOTE_OWN_ENTRY",
      status: 403,
    });
  });

  it("rejects writes on hidden content and returns the target for merged follows", async () => {
    const author = await createUser("state_author");
    const viewer = await createUser("state_viewer");
    const source = await createTopic(author.id, "Birleştirilecek Başlık");
    const target = await createTopic(author.id, "Hedef Başlık");
    await integrationDatabase.entry.update({
      where: { id: source.entry.id },
      data: { status: "HIDDEN", hiddenAt: new Date() },
    });
    await expect(
      setVote(integrationDatabase, actor(viewer.id), source.entry.id, 1),
    ).rejects.toMatchObject({ code: "ENTRY_NOT_EDITABLE", status: 409 });
    await expect(
      putBookmark(integrationDatabase, actor(viewer.id), source.entry.id),
    ).rejects.toMatchObject({ code: "ENTRY_NOT_EDITABLE", status: 409 });

    await integrationDatabase.topic.update({
      where: { id: source.topic.id },
      data: { status: "HIDDEN" },
    });
    await expect(
      createEntry(integrationDatabase, actor(viewer.id), source.topic.id, {
        body: "Gizlenmiş başlığa yazılmaması gereken yeterince uzun entry.",
      }),
    ).rejects.toMatchObject({ code: "TOPIC_HIDDEN", status: 409 });

    await integrationDatabase.topic.update({
      where: { id: source.topic.id },
      data: { status: "MERGED", mergedIntoId: target.topic.id },
    });
    await expect(
      createEntry(integrationDatabase, actor(viewer.id), source.topic.id, {
        body: "Birleştirilmiş başlığa yazılmaması gereken yeterince uzun entry.",
      }),
    ).rejects.toMatchObject({ code: "TOPIC_MERGED", status: 409 });
    await expect(
      putFollow(integrationDatabase, actor(viewer.id), source.topic.id),
    ).resolves.toMatchObject({
      followed: false,
      canonicalTopic: { id: target.topic.id },
    });
  });

  it("serializes topic hiding ahead of vote and bookmark creation", async () => {
    const author = await createUser("topic_race_author");
    const viewer = await createUser("topic_race_viewer");
    const moderator = await createUser("topic_race_moderator");
    await integrationDatabase.user.update({
      where: { id: moderator.id },
      data: { role: "MODERATOR" },
    });
    const created = await createTopic(author.id, "Topic görünürlüğü ve etkileşim yarışı");
    const heldTopic = await holdAdvisoryLock(`topic-state:${created.topic.id}`);
    const hideOutcome = setTopicVisibility(
      integrationDatabase,
      actor(moderator.id),
      created.topic.id,
      true,
      { reason: "Topic gizleme ile etkileşim yazıları aynı state kilidini kullanmalıdır." },
    ).then(
      (value) => ({ status: "fulfilled" as const, value }),
      (reason: unknown) => ({ status: "rejected" as const, reason }),
    );

    try {
      await waitForBlockedAdvisoryLocks(1);
      const voteOutcome = setVote(integrationDatabase, actor(viewer.id), created.entry.id, 1).then(
        (value) => ({ status: "fulfilled" as const, value }),
        (reason: unknown) => ({ status: "rejected" as const, reason }),
      );
      await waitForBlockedAdvisoryLocks(2);
      await heldTopic.release();

      expect(await hideOutcome).toMatchObject({
        status: "fulfilled",
        value: { status: "HIDDEN" },
      });
      expect(await voteOutcome).toMatchObject({
        status: "rejected",
        reason: { code: "TOPIC_HIDDEN", status: 409 },
      });
    } finally {
      await heldTopic.release();
    }

    await expect(
      putBookmark(integrationDatabase, actor(viewer.id), created.entry.id),
    ).rejects.toMatchObject({ code: "TOPIC_HIDDEN", status: 409 });
    expect(await integrationDatabase.entryVote.count({ where: { userId: viewer.id } })).toBe(0);
    expect(await integrationDatabase.entryBookmark.count({ where: { userId: viewer.id } })).toBe(0);
  });

  it("keeps bookmark, follow and block writes idempotent and exposes block collapse data", async () => {
    const author = await createUser("blocked_author");
    const viewer = await createUser("block_viewer");
    await integrationDatabase.user.update({
      where: { id: author.id },
      data: { role: "MODERATOR" },
    });
    const created = await createTopic(author.id);
    const viewerContent = await createTopic(viewer.id, "Engellenen Moderatör Yetkisi");

    await putBookmark(integrationDatabase, actor(viewer.id), created.entry.id);
    await putBookmark(integrationDatabase, actor(viewer.id), created.entry.id);
    expect(await integrationDatabase.entryBookmark.count()).toBe(1);
    await integrationDatabase.entry.update({
      where: { id: created.entry.id },
      data: { status: "HIDDEN", hiddenAt: new Date() },
    });
    expect((await getBookmarks(integrationDatabase, viewer.id, 0, 20))[0]).toHaveLength(0);
    await integrationDatabase.entry.update({
      where: { id: created.entry.id },
      data: { status: "ACTIVE", hiddenAt: null },
    });
    await deleteBookmark(integrationDatabase, actor(viewer.id), created.entry.id);
    await deleteBookmark(integrationDatabase, actor(viewer.id), created.entry.id);
    expect(await integrationDatabase.entryBookmark.count()).toBe(0);

    await putFollow(integrationDatabase, actor(viewer.id), created.topic.id);
    await putFollow(integrationDatabase, actor(viewer.id), created.topic.id);
    expect(await integrationDatabase.topicFollow.count()).toBe(1);

    await putBlock(integrationDatabase, actor(viewer.id), author.id);
    await putBlock(integrationDatabase, actor(viewer.id), author.id);
    expect(await integrationDatabase.userBlock.count()).toBe(1);
    await expect(putBlock(integrationDatabase, actor(viewer.id), viewer.id)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      status: 422,
    });
    const result = await getTopicEntries(integrationDatabase, {
      topicId: created.topic.id,
      viewer: { userId: viewer.id, role: "USER", status: "ACTIVE" },
      page: 1,
      pageSize: 20,
      skip: 0,
      sort: "oldest",
    });
    expect(result.entries[0]).toMatchObject({
      id: created.entry.id,
      blockedByViewer: true,
    });
    const [blocks, totalBlocks] = await getBlocks(integrationDatabase, viewer.id, 0, 20);
    expect(totalBlocks).toBe(1);
    expect(blocks[0]?.blocked).toMatchObject({ id: author.id, username: author.username });

    await setEntryVisibility(integrationDatabase, actor(author.id), viewerContent.entry.id, true, {
      reason: "Kullanıcı engeli moderasyon yetkisini etkilememelidir.",
    });
    expect(
      await integrationDatabase.entry.findUniqueOrThrow({ where: { id: viewerContent.entry.id } }),
    ).toMatchObject({ status: "HIDDEN" });

    await deleteBlock(integrationDatabase, actor(viewer.id), author.id);
    await deleteBlock(integrationDatabase, actor(viewer.id), author.id);
    expect(await integrationDatabase.userBlock.count()).toBe(0);
  });

  it("does not leave a block relation when the target deactivates concurrently", async () => {
    const blocker = await createUser("deactivation_block_race_actor");
    const target = await createUser("deactivation_block_race_target");
    const targetPassword = "DeactivationBlockRacePassword123!";
    await integrationDatabase.user.update({
      where: { id: target.id },
      data: { passwordHash: await hashPassword(targetPassword) },
    });
    const heldRow = await holdUserRowLock(target.id);
    const deactivationOutcome = deactivateAccount(
      integrationDatabase,
      target.id,
      { currentPassword: targetPassword, usernameConfirmation: target.username },
      randomUUID(),
    ).then(
      () => ({ status: "fulfilled" as const }),
      (reason: unknown) => ({ status: "rejected" as const, reason }),
    );

    try {
      await waitForBlockedUserUpdate();
      const blockOutcome = putBlock(integrationDatabase, actor(blocker.id), target.id).then(
        (value) => ({ status: "fulfilled" as const, value }),
        (reason: unknown) => ({ status: "rejected" as const, reason }),
      );
      await waitForBlockedUserMutationLock();
      await heldRow.release();

      expect(await deactivationOutcome).toEqual({ status: "fulfilled" });
      expect(await blockOutcome).toMatchObject({
        status: "rejected",
        reason: { code: "USER_NOT_FOUND", status: 404 },
      });
    } finally {
      await heldRow.release();
    }

    expect(await integrationDatabase.userBlock.count({ where: { blockedId: target.id } })).toBe(0);
    expect(
      await integrationDatabase.auditLog.count({
        where: { actorId: blocker.id, action: "user.blocked", entityId: target.id },
      }),
    ).toBe(0);
  });

  it("blocks suspended content writes while keeping profile settings available", async () => {
    const writer = await createUser("suspended_writer");
    const author = await createUser("suspended_target_author");
    const blockTarget = await createUser("suspended_block_target");
    const topic = await createTopic(author.id, "Askıya alınmış kullanıcı sınırı");
    const targetEntry = topic.entry;
    const ownEntry = await createEntry(integrationDatabase, actor(writer.id), topic.topic.id, {
      body: "Askıya alma öncesinde oluşturulan ve sonradan değiştirilmeye çalışılan entry metni.",
    });

    await setVote(integrationDatabase, actor(writer.id), targetEntry.id, 1);
    await putBookmark(integrationDatabase, actor(writer.id), targetEntry.id);
    await putFollow(integrationDatabase, actor(writer.id), topic.topic.id);
    await putBlock(integrationDatabase, actor(writer.id), blockTarget.id);
    await integrationDatabase.user.update({
      where: { id: writer.id },
      data: { status: "SUSPENDED" },
    });

    const writes = [
      () =>
        createTopicWithFirstEntry(integrationDatabase, actor(writer.id), {
          title: "Askıdayken oluşturulamayan başlık",
          entryBody: "Bu ilk entry transaction tamamlanmadan reddedilmelidir.",
        }),
      () =>
        createEntry(integrationDatabase, actor(writer.id), topic.topic.id, {
          body: "Askıdayken mevcut başlığa eklenemeyen yeterince uzun entry metni.",
        }),
      () =>
        editEntry(
          integrationDatabase,
          actor(writer.id),
          { body: "Askıdayken değiştirilemeyen yeterince uzun entry metni." },
          ownEntry.id,
        ),
      () => deleteEntry(integrationDatabase, actor(writer.id), ownEntry.id),
      () => setVote(integrationDatabase, actor(writer.id), targetEntry.id, -1),
      () => removeVote(integrationDatabase, actor(writer.id), targetEntry.id),
      () => putBookmark(integrationDatabase, actor(writer.id), targetEntry.id),
      () => deleteBookmark(integrationDatabase, actor(writer.id), targetEntry.id),
      () => putFollow(integrationDatabase, actor(writer.id), topic.topic.id),
      () => deleteFollow(integrationDatabase, actor(writer.id), topic.topic.id),
      () => putBlock(integrationDatabase, actor(writer.id), blockTarget.id),
      () => deleteBlock(integrationDatabase, actor(writer.id), blockTarget.id),
      () =>
        createReport(integrationDatabase, actor(writer.id), {
          targetType: "ENTRY" as const,
          targetId: targetEntry.id,
          reason: "OTHER" as const,
          details: "Askıdaki kullanıcı bu bildirimi oluşturamamalıdır.",
        }),
    ];

    for (const write of writes) {
      await expect(write()).rejects.toMatchObject({ code: "ACCOUNT_SUSPENDED", status: 403 });
    }
    await expect(
      updateProfile(
        integrationDatabase,
        writer.id,
        { displayName: "Askıdayken Ayarlanabilir", bio: null },
        randomUUID(),
      ),
    ).resolves.toMatchObject({
      status: "SUSPENDED",
      displayName: "Askıdayken Ayarlanabilir",
    });

    expect(
      await integrationDatabase.entry.findUniqueOrThrow({ where: { id: ownEntry.id } }),
    ).toMatchObject({
      body: ownEntry.body,
      status: "ACTIVE",
    });
    expect(await integrationDatabase.entryVote.count({ where: { userId: writer.id } })).toBe(1);
    expect(await integrationDatabase.entryBookmark.count({ where: { userId: writer.id } })).toBe(1);
    expect(await integrationDatabase.topicFollow.count({ where: { userId: writer.id } })).toBe(1);
    expect(await integrationDatabase.userBlock.count({ where: { blockerId: writer.id } })).toBe(1);
    expect(await integrationDatabase.report.count({ where: { reporterId: writer.id } })).toBe(0);
  });
});

describe("search, feeds and profiles with PostgreSQL", () => {
  it("searches topics, aliases, users and active entries with stable result contracts", async () => {
    const writer = await createUser("acikkaynakci");
    await integrationDatabase.user.update({
      where: { id: writer.id },
      data: { displayName: "İstanbul Açık Kaynak Topluluğu" },
    });
    const created = await createTopic(writer.id, "Açık Kaynak Kültürü");
    await integrationDatabase.topicAlias.create({
      data: {
        topicId: created.topic.id,
        title: "Özgür Yazılım",
        normalizedTitle: normalizeTopicTitle("Özgür Yazılım"),
        slug: "ozgur-yazilim",
      },
    });
    await integrationDatabase.entry.update({
      where: { id: created.entry.id },
      data: {
        body: "Güvenli veri arama için benzersiz bir PostgreSQL entry içeriği.",
        normalizedBody: "güvenli veri arama için benzersiz bir postgresql entry içeriği.",
      },
    });

    const topicResults = await searchAll(integrationDatabase, {
      query: "AÇIK KAYNAK",
      type: "topics",
      page: 1,
      pageSize: 20,
      skip: 0,
    });
    expect(topicResults.results[0]).toMatchObject({ type: "topic", id: created.topic.id });
    expect(
      (
        await searchAll(integrationDatabase, {
          query: "özgür yazılım",
          type: "topics",
          page: 1,
          pageSize: 20,
          skip: 0,
        })
      ).results[0],
    ).toMatchObject({ type: "topic", id: created.topic.id });
    const displayNamePrefix = await searchAll(integrationDatabase, {
      query: "istanbul açık",
      type: "users",
      page: 1,
      pageSize: 20,
      skip: 0,
    });
    expect(displayNamePrefix.results[0]).toMatchObject({ type: "user", id: writer.id });
    expect(displayNamePrefix.results[0]?.rank).toBeGreaterThanOrEqual(2_000);
    const displayNameExact = await searchAll(integrationDatabase, {
      query: "İstanbul Açık Kaynak Topluluğu",
      type: "users",
      page: 1,
      pageSize: 20,
      skip: 0,
    });
    expect(displayNameExact.results[0]).toMatchObject({ type: "user", id: writer.id });
    expect(displayNameExact.results[0]?.rank).toBeGreaterThanOrEqual(3_000);
    const entryResults = await searchAll(integrationDatabase, {
      query: "benzersiz postgresql",
      type: "entries",
      page: 1,
      pageSize: 20,
      skip: 0,
    });
    expect(entryResults.results[0]).toMatchObject({ type: "entry", id: created.entry.id });
    expect(entryResults.results[0]?.snippet.length).toBeLessThanOrEqual(180);

    const slash = String.fromCharCode(92);
    const literalQuery = `literal%_${slash}arama`;
    const literalTopic = await createTopic(
      writer.id,
      `Yalnızca ${literalQuery} işaretlerini içeren başlık`,
    );
    const literalResults = await searchAll(integrationDatabase, {
      query: literalQuery,
      type: "topics",
      page: 1,
      pageSize: 20,
      skip: 0,
    });
    expect(literalResults.results).toHaveLength(1);
    expect(literalResults.results[0]).toMatchObject({ type: "topic", id: literalTopic.topic.id });
    const emptyLiteralPage = await searchAll(integrationDatabase, {
      query: literalQuery,
      type: "topics",
      page: 2,
      pageSize: 20,
      skip: 20,
    });
    expect(emptyLiteralPage).toMatchObject({ results: [], totalItems: 1 });

    const topicPlanRows = await integrationDatabase.$transaction(async (transaction) => {
      await transaction.$executeRaw`SET LOCAL enable_seqscan = off`;
      return transaction.$queryRaw<Array<{ "QUERY PLAN": string }>>(Prisma.sql`
        EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
        ${buildSearchQuery({ query: "özgür yazılım", type: "topics", skip: 0, take: 20 })}
      `);
    });
    const topicPlan = topicPlanRows.map((row) => row["QUERY PLAN"]).join("\n");
    expect(topicPlan).toContain("topic_aliases_normalized_title_trgm_idx");
    expect(topicPlan).not.toMatch(/entries|users/u);

    await integrationDatabase.entry.update({
      where: { id: created.entry.id },
      data: { status: "HIDDEN", hiddenAt: new Date() },
    });
    expect(
      (
        await searchAll(integrationDatabase, {
          query: "benzersiz postgresql",
          type: "entries",
          page: 1,
          pageSize: 20,
          skip: 0,
        })
      ).results,
    ).toHaveLength(0);
  });

  it("calculates rolling and Istanbul-day feeds, DEBE and randomKey selection", async () => {
    const now = new Date("2026-07-16T12:00:00.000Z");
    const author = await createUser("feed_author");
    const secondAuthor = await createUser("feed_second");
    const voter = await createUser("feed_voter");
    const first = await createTopic(author.id, "Akış Formülü Başlığı");
    const secondEntry = await createEntry(
      integrationDatabase,
      actor(secondAuthor.id),
      first.topic.id,
      {
        body: "Akış formülünde ikinci yazarı temsil eden yeterince uzun entry.",
      },
    );
    const previousDayEntryAt = new Date("2026-07-15T20:00:00.000Z");
    const todayEntryAt = new Date("2026-07-16T10:00:00.000Z");
    await integrationDatabase.entry.update({
      where: { id: first.entry.id },
      data: {
        createdAt: previousDayEntryAt,
        score: 1,
        upvoteCount: 1,
      },
    });
    await integrationDatabase.entry.update({
      where: { id: secondEntry.id },
      data: {
        createdAt: todayEntryAt,
        score: 1,
        upvoteCount: 1,
      },
    });
    await integrationDatabase.topic.update({
      where: { id: first.topic.id },
      data: { lastEntryAt: todayEntryAt },
    });
    await integrationDatabase.entryVote.createMany({
      data: [
        {
          entryId: first.entry.id,
          userId: voter.id,
          value: 1,
          createdAt: previousDayEntryAt,
          updatedAt: previousDayEntryAt,
        },
        {
          entryId: secondEntry.id,
          userId: voter.id,
          value: 1,
          createdAt: todayEntryAt,
          updatedAt: todayEntryAt,
        },
      ],
    });

    const trending = await getTopicFeed(integrationDatabase, {
      feed: "trending",
      page: 1,
      pageSize: 30,
      skip: 0,
      now,
    });
    const trendTopic = trending.topics.find((topic) => topic.id === first.topic.id);
    expect(trendTopic).toMatchObject({
      activeEntryCount: 2,
      uniqueAuthorCount: 2,
      positiveVotes: 2,
      negativeVotes: 0,
    });
    expect(trendTopic?.trendScore).toBe(
      calculateTrendScore({
        activeEntryCount: 2,
        uniqueAuthorCount: 2,
        positiveVotes: 2,
        negativeVotes: 0,
        hoursSinceLastActiveEntry: 2,
      }),
    );
    const popular = await getTopicFeed(integrationDatabase, {
      feed: "popular",
      page: 1,
      pageSize: 30,
      skip: 0,
      now,
    });
    expect(popular.topics.find((topic) => topic.id === first.topic.id)).toMatchObject({
      activeEntryCount: 1,
      positiveVotes: 1,
    });
    expect((await getDebe(integrationDatabase, now)).map((entry) => entry.id)).toEqual([
      first.entry.id,
    ]);

    const second = await createTopic(author.id, "Rastgele İkinci Başlık");
    await integrationDatabase.topic.update({
      where: { id: first.topic.id },
      data: { randomKey: 0.2 },
    });
    await integrationDatabase.topic.update({
      where: { id: second.topic.id },
      data: { randomKey: 0.8 },
    });
    await expect(getRandomTopic(integrationDatabase, 0.5)).resolves.toMatchObject({
      id: second.topic.id,
    });
    await integrationDatabase.topic.update({
      where: { id: second.topic.id },
      data: { status: "HIDDEN" },
    });
    await expect(getRandomTopic(integrationDatabase, 0.5)).resolves.toMatchObject({
      id: first.topic.id,
    });

    await integrationDatabase.topic.update({
      where: { id: first.topic.id },
      data: { createdAt: new Date("2026-07-14T10:00:00.000Z"), lastEntryAt: todayEntryAt },
    });
    await integrationDatabase.topic.update({
      where: { id: second.topic.id },
      data: { status: "ACTIVE", createdAt: now, lastEntryAt: previousDayEntryAt },
    });
    const recent = await getTopicFeed(integrationDatabase, {
      feed: "recent",
      page: 1,
      pageSize: 30,
      skip: 0,
      now,
    });
    expect(recent.topics.slice(0, 2).map((topic) => topic.id)).toEqual([
      first.topic.id,
      second.topic.id,
    ]);
    const newest = await getTopicFeed(integrationDatabase, {
      feed: "new",
      page: 1,
      pageSize: 30,
      skip: 0,
      now,
    });
    expect(newest.topics[0]?.id).toBe(second.topic.id);

    for (const feed of ["trending", "new"] as const) {
      const emptyPage = await getTopicFeed(integrationDatabase, {
        feed,
        page: 3,
        pageSize: 20,
        skip: 40,
        now,
      });
      expect(emptyPage).toMatchObject({ topics: [], totalItems: 2 });
    }

    await integrationDatabase.topic.createMany({
      data: Array.from({ length: 31 }, (_, index) => ({
        title: `Akış sınırı ${index}`,
        normalizedTitle: `akış sınırı ${index}`,
        slug: `akis-siniri-${index}`,
        createdById: author.id,
      })),
    });
    const capped = await getTopicFeed(integrationDatabase, {
      feed: "new",
      page: 1,
      pageSize: 50,
      skip: 0,
      now,
    });
    expect(capped.topics).toHaveLength(30);
    expect(capped.totalItems).toBe(30);
  });

  it("returns paginated public profiles without private email fields", async () => {
    const writer = await createUser("profile_writer");
    const created = await createTopic(writer.id, "Profil Başlığı");
    await createEntry(integrationDatabase, actor(writer.id), created.topic.id, {
      body: "Profil sayfalamasında ikinci sırada duran yeterince uzun entry.",
    });
    await integrationDatabase.user.update({
      where: { id: writer.id },
      data: { status: "SUSPENDED", bio: "Güvenli ve herkese açık profil açıklaması." },
    });

    const result = await getPublicProfile(integrationDatabase, {
      username: "PROFILE_WRITER",
      skip: 0,
      take: 1,
    });
    expect(result.profile).toMatchObject({
      id: writer.id,
      status: "SUSPENDED",
      activeEntryCount: 2,
      openedActiveTopicCount: 1,
    });
    expect(Object.keys(result.profile)).not.toContain("email");
    expect(result.entries).toHaveLength(1);
    expect(result.totalItems).toBe(2);

    await integrationDatabase.user.update({
      where: { id: writer.id },
      data: {
        username: `deleted_${writer.id.replaceAll("-", "").slice(0, 12)}`,
        usernameNormalized: `deleted_${writer.id.replaceAll("-", "").slice(0, 12)}`,
        displayName: "silinmiş hesap",
        bio: null,
        status: "DEACTIVATED",
        deactivatedAt: new Date(),
      },
    });
    const anonymous = await getPublicProfile(integrationDatabase, {
      username: `deleted_${writer.id.replaceAll("-", "").slice(0, 12)}`,
      skip: 0,
      take: 20,
    });
    expect(anonymous.profile).toMatchObject({
      displayName: "silinmiş hesap",
      bio: null,
      status: "DEACTIVATED",
    });
    expect(anonymous.entries).toHaveLength(2);
  });
});

describe("reports and moderation with PostgreSQL", () => {
  it("hides every agent control-plane audit record from moderators but keeps it for HUMAN ADMIN", async () => {
    const moderator = await createUser("agent_audit_moderator");
    const admin = await createUser("agent_audit_admin");
    await Promise.all([
      integrationDatabase.user.update({
        where: { id: moderator.id },
        data: { role: "MODERATOR" },
      }),
      integrationDatabase.user.update({
        where: { id: admin.id },
        data: { role: "ADMIN" },
      }),
    ]);
    await integrationDatabase.auditLog.createMany({
      data: [
        {
          actorId: admin.id,
          action: "moderation.completed",
          entityType: "Report",
          entityId: null,
          requestId: randomUUID(),
          metadata: { result: "RESOLVED" },
        },
        {
          actorId: admin.id,
          action: "agent.settings.changed",
          entityType: "AgentGlobalSettings",
          entityId: null,
          requestId: randomUUID(),
          metadata: { agentProfileId: randomUUID(), runtimeProvider: "protected" },
        },
        {
          actorId: admin.id,
          action: "maintenance.completed",
          entityType: "AgentFutureControlRecord",
          entityId: null,
          requestId: randomUUID(),
          metadata: { agentProfileId: randomUUID() },
        },
      ],
    });

    const [moderatorLogs, moderatorTotal] = await getAuditLogs(
      integrationDatabase,
      actor(moderator.id),
      { skip: 0, take: 20 },
    );
    expect(moderatorTotal).toBe(1);
    expect(moderatorLogs.map(({ action }) => action)).toEqual(["moderation.completed"]);

    const [explicitAgentLogs, explicitAgentTotal] = await getAuditLogs(
      integrationDatabase,
      actor(moderator.id),
      { action: "agent.settings.changed", skip: 0, take: 20 },
    );
    expect(explicitAgentLogs).toEqual([]);
    expect(explicitAgentTotal).toBe(0);

    const [adminLogs, adminTotal] = await getAuditLogs(integrationDatabase, actor(admin.id), {
      skip: 0,
      take: 20,
    });
    expect(adminTotal).toBe(3);
    expect(adminLogs.map(({ action }) => action)).toEqual(
      expect.arrayContaining([
        "moderation.completed",
        "agent.settings.changed",
        "maintenance.completed",
      ]),
    );
  });

  it("creates a report atomically and rejects own, duplicate and suspended reports", async () => {
    const reporter = await createUser("reporter_one");
    const author = await createUser("reported_author");
    const created = await createTopic(author.id, "Bildirilecek Başlık");
    const report = await createReport(integrationDatabase, actor(reporter.id), {
      targetType: "ENTRY",
      targetId: created.entry.id,
      reason: "SPAM",
      details: "Tekrarlanan tanıtım içeriği bulunuyor.",
    });
    expect(report).toMatchObject({ reporterId: reporter.id, status: "OPEN" });
    await createReport(integrationDatabase, actor(reporter.id), {
      targetType: "TOPIC",
      targetId: created.topic.id,
      reason: "OFF_TOPIC",
    });
    await createReport(integrationDatabase, actor(reporter.id), {
      targetType: "USER",
      targetId: author.id,
      reason: "HARASSMENT",
    });
    expect(
      await integrationDatabase.outboxEvent.count({ where: { eventType: "report.created" } }),
    ).toBe(3);
    expect(await integrationDatabase.auditLog.count({ where: { action: "report.created" } })).toBe(
      3,
    );
    await expect(
      createReport(integrationDatabase, actor(reporter.id), {
        targetType: "ENTRY",
        targetId: created.entry.id,
        reason: "OFF_TOPIC",
      }),
    ).rejects.toMatchObject({ code: "REPORT_ALREADY_OPEN", status: 409 });
    await expect(
      createReport(integrationDatabase, actor(author.id), {
        targetType: "TOPIC",
        targetId: created.topic.id,
        reason: "OTHER",
        details: "Kendi başlığını bildirmeyi deniyor.",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(
      createReport(integrationDatabase, actor(reporter.id), {
        targetType: "USER",
        targetId: reporter.id,
        reason: "HARASSMENT",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await integrationDatabase.user.update({
      where: { id: reporter.id },
      data: { status: "SUSPENDED" },
    });
    await expect(
      createReport(integrationDatabase, actor(reporter.id), {
        targetType: "USER",
        targetId: author.id,
        reason: "HARASSMENT",
      }),
    ).rejects.toMatchObject({ code: "ACCOUNT_SUSPENDED", status: 403 });
  });

  it("lists, inspects and resolves reports with immutable history and dashboard counts", async () => {
    const reporter = await createUser("reporter_two");
    const author = await createUser("report_target");
    const moderator = await createUser("moderator_one");
    await integrationDatabase.user.update({
      where: { id: moderator.id },
      data: { role: "MODERATOR" },
    });
    const created = await createTopic(author.id, "Moderasyon Bildirimi");
    const report = await createReport(integrationDatabase, actor(reporter.id), {
      targetType: "TOPIC",
      targetId: created.topic.id,
      reason: "OFF_TOPIC",
      details: "Başlık kategori dışında değerlendiriliyor.",
    });
    const moderatorActor = actor(moderator.id);
    const [reports, total] = await getModerationReports(integrationDatabase, moderatorActor, {
      status: "OPEN",
      targetType: "TOPIC",
      reporterUsername: reporter.usernameNormalized,
      skip: 0,
      take: 20,
    });
    expect(total).toBe(1);
    expect(reports[0]?.id).toBe(report.id);
    await expect(
      getModerationReport(integrationDatabase, moderatorActor, report.id),
    ).resolves.toMatchObject({ report: { id: report.id }, target: { id: created.topic.id } });
    await expect(
      decideReport(integrationDatabase, moderatorActor, report.id, "RESOLVED", {
        resolutionNote: "İçerik incelendi ve gerekli işlem tamamlandı.",
      }),
    ).resolves.toMatchObject({ status: "RESOLVED", handledById: moderator.id });
    const rejectedReport = await createReport(integrationDatabase, actor(reporter.id), {
      targetType: "TOPIC",
      targetId: created.topic.id,
      reason: "SPAM",
    });
    await expect(
      decideReport(integrationDatabase, moderatorActor, rejectedReport.id, "REJECTED", {
        resolutionNote: "İnceleme sonucunda bildirim gerekçesi doğrulanamadı.",
      }),
    ).resolves.toMatchObject({ status: "REJECTED", handledById: moderator.id });
    expect(
      await integrationDatabase.moderationAction.count({ where: { targetId: created.topic.id } }),
    ).toBe(2);
    expect(
      await integrationDatabase.outboxEvent.count({ where: { eventType: "moderation.completed" } }),
    ).toBe(2);
    const dashboard = await getModerationDashboard(integrationDatabase, moderatorActor);
    expect(dashboard).toMatchObject({ openReports: 0, reports24h: 2, actions24h: 2 });
    const [auditLogs, auditTotal] = await getAuditLogs(integrationDatabase, moderatorActor, {
      action: "moderation.completed",
      skip: 0,
      take: 20,
    });
    expect(auditTotal).toBe(2);
    expect(auditLogs.map((log) => log.entityId)).toEqual(
      expect.arrayContaining([report.id, rejectedReport.id]),
    );
    const action = await integrationDatabase.moderationAction.findFirstOrThrow();
    await expect(
      integrationDatabase.moderationAction.update({
        where: { id: action.id },
        data: { reason: "Bu kayıt değiştirilemez olmalıdır." },
      }),
    ).rejects.toThrow(/append-only/);
  });

  it("commits exactly one decision when resolve and reject race", async () => {
    const reporter = await createUser("decision_race_reporter");
    const author = await createUser("decision_race_author");
    const resolver = await createUser("decision_race_resolver");
    const rejecter = await createUser("decision_race_rejecter");
    await integrationDatabase.user.updateMany({
      where: { id: { in: [resolver.id, rejecter.id] } },
      data: { role: "MODERATOR" },
    });
    const created = await createTopic(author.id, "Eşzamanlı Bildirim Kararı");
    const report = await createReport(integrationDatabase, actor(reporter.id), {
      targetType: "TOPIC",
      targetId: created.topic.id,
      reason: "OFF_TOPIC",
    });

    let signalRowLocked = () => {};
    const rowLocked = new Promise<void>((resolve) => {
      signalRowLocked = resolve;
    });
    let releaseRowLock = () => {};
    const rowLockRelease = new Promise<void>((resolve) => {
      releaseRowLock = resolve;
    });
    const blocker = integrationDatabase.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "reports"
        WHERE "id" = CAST(${report.id} AS uuid)
        FOR UPDATE
      `;
      signalRowLocked();
      await rowLockRelease;
    });
    await rowLocked;

    const decisionPromises = [
      decideReport(integrationDatabase, actor(resolver.id), report.id, "RESOLVED", {
        resolutionNote: "Eşzamanlı incelemede bildirim doğrulandı.",
      }),
      decideReport(integrationDatabase, actor(rejecter.id), report.id, "REJECTED", {
        resolutionNote: "Eşzamanlı incelemede bildirim reddedildi.",
      }),
    ];
    const decisionsResult = Promise.allSettled(decisionPromises);
    let blockingError: unknown;
    try {
      await waitForBlockedReportUpdates(2);
    } catch (error) {
      blockingError = error;
    } finally {
      releaseRowLock();
      await blocker;
    }
    const decisions = await decisionsResult;
    if (blockingError) throw blockingError;

    const fulfilled = decisions.filter(
      (decision): decision is PromiseFulfilledResult<Awaited<(typeof decisionPromises)[number]>> =>
        decision.status === "fulfilled",
    );
    expect(fulfilled).toHaveLength(1);
    const winner = fulfilled[0];
    if (!winner) throw new Error("Expected one report decision to commit.");
    expect(decisions.find((decision) => decision.status === "rejected")).toMatchObject({
      reason: { code: "REPORT_ALREADY_OPEN", status: 409 },
    });
    const stored = await integrationDatabase.report.findUniqueOrThrow({
      where: { id: report.id },
    });
    expect(stored).toMatchObject({
      status: winner.value.status,
      handledById: winner.value.handledById,
      resolutionNote: winner.value.resolutionNote,
    });
    expect(
      await integrationDatabase.moderationAction.count({
        where: {
          targetId: created.topic.id,
          actionType: { in: ["REPORT_RESOLVED", "REPORT_REJECTED"] },
        },
      }),
    ).toBe(1);
    expect(
      await integrationDatabase.auditLog.count({
        where: { action: "moderation.completed", entityId: report.id },
      }),
    ).toBe(1);
    expect(
      await integrationDatabase.outboxEvent.count({
        where: {
          eventType: "moderation.completed",
          aggregateType: "Report",
          aggregateId: report.id,
        },
      }),
    ).toBe(1);
  });

  it("hides, restores, renames, moves and merges content with exact counters and events", async () => {
    const author = await createUser("moderated_writer");
    const reporter = await createUser("content_reporter");
    const moderator = await createUser("moderator_two");
    await integrationDatabase.user.update({
      where: { id: moderator.id },
      data: { role: "MODERATOR" },
    });
    const moderatorActor = actor(moderator.id);
    const source = await createTopic(author.id, "Kaynak Moderasyon Başlığı");
    const target = await createTopic(author.id, "Hedef Moderasyon Başlığı");
    const reason = { reason: "Moderasyon politikası gereği yapılan işlem." };
    const report = await createReport(integrationDatabase, actor(reporter.id), {
      targetType: "TOPIC",
      targetId: source.topic.id,
      reason: "OFF_TOPIC",
    });

    await setEntryVisibility(integrationDatabase, moderatorActor, source.entry.id, true, reason);
    expect(
      await integrationDatabase.topic.findUniqueOrThrow({ where: { id: source.topic.id } }),
    ).toMatchObject({ entryCount: 0, lastEntryAt: null });
    await setEntryVisibility(integrationDatabase, moderatorActor, source.entry.id, false, reason);
    expect(
      await integrationDatabase.topic.findUniqueOrThrow({ where: { id: source.topic.id } }),
    ).toMatchObject({ entryCount: 1 });

    await setTopicVisibility(integrationDatabase, moderatorActor, source.topic.id, true, reason);
    await setTopicVisibility(integrationDatabase, moderatorActor, source.topic.id, false, reason);
    await renameTopic(integrationDatabase, moderatorActor, source.topic.id, {
      title: "Yeniden Adlandırılan Başlık",
      ...reason,
    });
    expect(
      await integrationDatabase.topicAlias.findUnique({
        where: { normalizedTitle: "kaynak moderasyon başlığı" },
      }),
    ).toMatchObject({ topicId: source.topic.id });

    await moveEntry(integrationDatabase, moderatorActor, source.entry.id, {
      targetTopicId: target.topic.id,
      ...reason,
    });
    expect(
      await integrationDatabase.topic.findUniqueOrThrow({ where: { id: source.topic.id } }),
    ).toMatchObject({ entryCount: 0 });
    expect(
      await integrationDatabase.topic.findUniqueOrThrow({ where: { id: target.topic.id } }),
    ).toMatchObject({ entryCount: 2 });

    await mergeTopic(integrationDatabase, moderatorActor, source.topic.id, {
      targetTopicId: target.topic.id,
      ...reason,
    });
    expect(
      await integrationDatabase.topic.findUniqueOrThrow({ where: { id: source.topic.id } }),
    ).toMatchObject({ status: "MERGED", mergedIntoId: target.topic.id, entryCount: 0 });
    expect(
      await integrationDatabase.outboxEvent.findMany({
        where: {
          eventType: {
            in: [
              "entry.hidden",
              "entry.restored",
              "topic.hidden",
              "topic.restored",
              "topic.renamed",
              "entry.moved",
              "topic.merged",
            ],
          },
        },
      }),
    ).toHaveLength(7);
    const hideAudit = await integrationDatabase.auditLog.findFirstOrThrow({
      where: { action: "entry.hidden", entityId: source.entry.id },
    });
    expect(hideAudit).toMatchObject({
      actorId: moderatorActor.actorId,
      requestId: moderatorActor.requestId,
      createdAt: expect.any(Date),
      metadata: {
        actorKind: "HUMAN",
        before: { status: "ACTIVE" },
        after: { status: "HIDDEN" },
        reason: reason.reason,
        topicId: source.topic.id,
      },
    });
    await expect(
      integrationDatabase.outboxEvent.findFirstOrThrow({
        where: { eventType: "entry.hidden", aggregateId: source.entry.id },
      }),
    ).resolves.toMatchObject({
      actorId: moderatorActor.actorId,
      actorKind: "HUMAN",
      requestId: moderatorActor.requestId,
      payload: {
        before: { status: "ACTIVE" },
        after: { status: "HIDDEN" },
        reason: reason.reason,
      },
    });
    expect(
      (await getModerationReport(integrationDatabase, moderatorActor, report.id)).moderationActions
        .length,
    ).toBeGreaterThanOrEqual(4);
  });

  it("enforces moderator/admin object authorization, revokes sessions and changes roles", async () => {
    const moderator = await createUser("moderator_three");
    const admin = await createUser("admin_one");
    const user = await createUser("moderated_user");
    const secondModerator = await createUser("moderator_target");
    await integrationDatabase.user.update({
      where: { id: moderator.id },
      data: { role: "MODERATOR" },
    });
    await integrationDatabase.user.update({
      where: { id: secondModerator.id },
      data: { role: "MODERATOR" },
    });
    await integrationDatabase.user.update({ where: { id: admin.id }, data: { role: "ADMIN" } });
    await integrationDatabase.session.create({
      data: {
        userId: user.id,
        tokenHash: "moderation-session-token-hash",
        csrfTokenHash: "moderation-session-csrf-hash",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const reason = { reason: "Kullanıcı davranışı moderasyon politikasını ihlal ediyor." };
    await setUserSuspension(integrationDatabase, actor(moderator.id), user.id, true, reason);
    expect(
      await integrationDatabase.session.findFirstOrThrow({ where: { userId: user.id } }),
    ).toMatchObject({ revokedAt: expect.any(Date) });
    await setUserSuspension(integrationDatabase, actor(moderator.id), user.id, false, reason);
    await expect(
      setUserSuspension(integrationDatabase, actor(moderator.id), admin.id, true, reason),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(
      setUserSuspension(integrationDatabase, actor(moderator.id), secondModerator.id, true, reason),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await setUserSuspension(integrationDatabase, actor(admin.id), secondModerator.id, true, reason);
    await setUserSuspension(
      integrationDatabase,
      actor(admin.id),
      secondModerator.id,
      false,
      reason,
    );

    await setModeratorRole(integrationDatabase, actor(admin.id), user.id, true, reason);
    expect(
      await integrationDatabase.user.findUniqueOrThrow({ where: { id: user.id } }),
    ).toMatchObject({ role: "MODERATOR" });
    await setModeratorRole(integrationDatabase, actor(admin.id), user.id, false, reason);
    expect(
      await integrationDatabase.user.findUniqueOrThrow({ where: { id: user.id } }),
    ).toMatchObject({ role: "USER" });
    await expect(
      setModeratorRole(integrationDatabase, actor(moderator.id), user.id, true, reason),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(
      setModeratorRole(integrationDatabase, actor(admin.id), admin.id, true, reason),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(getModerationDashboard(integrationDatabase, actor(user.id))).rejects.toMatchObject(
      { code: "FORBIDDEN", status: 403 },
    );
    expect(
      await integrationDatabase.outboxEvent.count({ where: { eventType: "user.role_changed" } }),
    ).toBe(2);
    expect(
      await integrationDatabase.outboxEvent.count({ where: { eventType: "user.suspended" } }),
    ).toBe(2);
    expect(
      await integrationDatabase.outboxEvent.count({ where: { eventType: "user.unsuspended" } }),
    ).toBe(2);
  });

  it("serializes moderator-role revocation ahead of a concurrent moderation write", async () => {
    const admin = await createUser("role_race_admin");
    const moderator = await createUser("role_race_moderator");
    const author = await createUser("role_race_author");
    await integrationDatabase.user.update({
      where: { id: admin.id },
      data: { role: "ADMIN" },
    });
    await integrationDatabase.user.update({
      where: { id: moderator.id },
      data: { role: "MODERATOR" },
    });
    const created = await createTopic(author.id, "Rol iptali yarış başlığı");
    const reason = { reason: "Rol geçişi ile moderasyon yazısı birlikte serileştirilmelidir." };
    const heldRow = await holdUserRowLock(moderator.id);
    const revocationOutcome = setModeratorRole(
      integrationDatabase,
      actor(admin.id),
      moderator.id,
      false,
      reason,
    ).then(
      () => ({ status: "fulfilled" as const }),
      (rejection: unknown) => ({ status: "rejected" as const, reason: rejection }),
    );

    try {
      await waitForBlockedUserUpdate();
      const moderationOutcome = setTopicVisibility(
        integrationDatabase,
        actor(moderator.id),
        created.topic.id,
        true,
        reason,
      ).then(
        () => ({ status: "fulfilled" as const }),
        (rejection: unknown) => ({ status: "rejected" as const, reason: rejection }),
      );
      await waitForBlockedUserMutationLock();
      await heldRow.release();

      expect(await revocationOutcome).toEqual({ status: "fulfilled" });
      expect(await moderationOutcome).toMatchObject({
        status: "rejected",
        reason: { code: "FORBIDDEN", status: 403 },
      });
    } finally {
      await heldRow.release();
    }

    expect(
      await integrationDatabase.user.findUniqueOrThrow({ where: { id: moderator.id } }),
    ).toMatchObject({ role: "USER", status: "ACTIVE" });
    expect(
      await integrationDatabase.topic.findUniqueOrThrow({ where: { id: created.topic.id } }),
    ).toMatchObject({ status: "ACTIVE" });
    expect(
      await integrationDatabase.moderationAction.count({
        where: { moderatorId: moderator.id, actionType: "TOPIC_HIDDEN" },
      }),
    ).toBe(0);
    expect(
      await integrationDatabase.outboxEvent.count({
        where: { actorId: moderator.id, eventType: "topic.hidden" },
      }),
    ).toBe(0);
  });

  it("stores and replays the first idempotent response without executing twice", async () => {
    const writer = await createUser("idempotent_writer");
    const input = {
      actorId: writer.id,
      route: "/api/v1/topics",
      key: randomUUID(),
      requestBody: { title: "Tekrarsız Başlık", entryBody: "Yeterince uzun bir ilk entry." },
    };
    let executions = 0;
    const execute = async () => {
      executions += 1;
      return { status: 201, body: { topicId: randomUUID() } } as const;
    };

    const first = await executeIdempotently(integrationDatabase, input, execute);
    const replay = await executeIdempotently(integrationDatabase, input, execute);

    expect(first).toMatchObject({ status: 201, replayed: false });
    expect(replay).toEqual({ ...first, replayed: true });
    expect(executions).toBe(1);
    expect(await integrationDatabase.idempotencyRecord.count()).toBe(1);
  });

  it("serializes concurrent idempotent requests and rejects key reuse with another body", async () => {
    const writer = await createUser("idempotent_race_writer");
    const key = randomUUID();
    const input = {
      actorId: writer.id,
      route: "/api/v1/reports",
      key,
      requestBody: { targetType: "ENTRY", targetId: randomUUID(), reason: "OTHER" },
    };
    let executions = 0;
    const execute = async () => {
      executions += 1;
      return { status: 201, body: { reportId: randomUUID() } } as const;
    };

    const results = await Promise.all([
      executeIdempotently(integrationDatabase, input, execute),
      executeIdempotently(integrationDatabase, input, execute),
    ]);

    expect(executions).toBe(1);
    expect(results.filter((result) => result.replayed)).toHaveLength(1);
    expect(results[0]?.body).toEqual(results[1]?.body);
    await expect(
      executeIdempotently(
        integrationDatabase,
        { ...input, requestBody: { ...input.requestBody, reason: "SPAM" } },
        execute,
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    expect(executions).toBe(1);
  });

  it("expires an idempotency record after 24 hours", async () => {
    const writer = await createUser("idempotent_expiry_writer");
    const now = new Date("2026-07-17T09:00:00.000Z");
    const input = {
      actorId: writer.id,
      route: "/api/v1/topics",
      key: randomUUID(),
      requestBody: { title: "Süreli kayıt" },
      now,
    };
    let executions = 0;
    const execute = async () => {
      executions += 1;
      return { status: 201, body: { execution: executions } } as const;
    };

    await executeIdempotently(integrationDatabase, input, execute);
    const afterExpiry = await executeIdempotently(
      integrationDatabase,
      { ...input, now: new Date(now.getTime() + 24 * 60 * 60 * 1000 + 1) },
      execute,
    );

    expect(afterExpiry).toEqual({ status: 201, body: { execution: 2 }, replayed: false });
    expect(executions).toBe(2);
    expect(await integrationDatabase.idempotencyRecord.count()).toBe(1);
  });

  it("rolls back the domain mutation when idempotency persistence fails", async () => {
    const writer = await createUser("idempotency_atomic_writer");
    const key = randomUUID();
    const route = "/api/v1/topics";
    const windowStart = new Date("2026-07-17T10:00:00.000Z");
    const keyHash = `atomic-${randomUUID()}`;

    await expect(
      executeIdempotently(
        integrationDatabase,
        {
          actorId: writer.id,
          route,
          key,
          requestBody: { title: "Atomic rollback" },
        },
        async (transaction) => {
          await transaction.rateLimitBucket.create({
            data: {
              keyHash,
              action: "idempotency_atomic_test",
              windowStart,
              count: 1,
              expiresAt: new Date(windowStart.getTime() + 60_000),
            },
          });
          await transaction.idempotencyRecord.create({
            data: {
              actorId: writer.id,
              key,
              route,
              requestHash: "forced-duplicate",
              responseStatus: 201,
              responseBody: { forced: true },
              expiresAt: new Date(Date.now() + 60_000),
            },
          });
          return { status: 201, body: { created: true } };
        },
      ),
    ).rejects.toMatchObject({ code: "P2002" });

    expect(await integrationDatabase.rateLimitBucket.count({ where: { keyHash } })).toBe(0);
    expect(
      await integrationDatabase.idempotencyRecord.count({
        where: { actorId: writer.id, key, route },
      }),
    ).toBe(0);
  });

  it("serializes concurrent last-admin deactivation attempts", async () => {
    const password = "AdminRacePassword123!";
    const passwordHash = await hashPassword(password);
    const firstAdmin = await createUser("race_admin_one");
    const secondAdmin = await createUser("race_admin_two");
    await integrationDatabase.user.updateMany({
      where: { id: { in: [firstAdmin.id, secondAdmin.id] } },
      data: { role: "ADMIN", passwordHash },
    });

    const results = await Promise.allSettled([
      deactivateAccount(
        integrationDatabase,
        firstAdmin.id,
        { currentPassword: password, usernameConfirmation: firstAdmin.username },
        randomUUID(),
      ),
      deactivateAccount(
        integrationDatabase,
        secondAdmin.id,
        { currentPassword: password, usernameConfirmation: secondAdmin.username },
        randomUUID(),
      ),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      status: "rejected",
      reason: { code: "LAST_ADMIN_GUARD", status: 409 },
    });
    expect(
      await integrationDatabase.user.count({ where: { role: "ADMIN", status: "ACTIVE" } }),
    ).toBe(1);
    expect(
      await integrationDatabase.outboxEvent.count({ where: { eventType: "user.deactivated" } }),
    ).toBe(1);
  });
});

describe("HTTP security and operational routes with PostgreSQL", () => {
  it("rejects a real authenticated write route when the CSRF header is missing", async () => {
    assertRouteDatabaseIsIntegrationDatabase();
    const author = await createUser("csrf_route_author");
    const voter = await createUser("csrf_route_voter");
    const created = await createTopic(author.id, "CSRF route kanıtı");
    const session = await createPersistedSession(voter.id);
    const origin = applicationOrigin();

    const response = await putVoteResponse(
      new NextRequest(`${origin}/api/v1/entries/${created.entry.id}/vote`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionCookie(session.token, session.csrfToken),
          Origin: origin,
        },
        body: JSON.stringify({ value: 1 }),
      }),
      { params: Promise.resolve({ entryId: created.entry.id }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "CSRF_INVALID", message: "Güvenlik doğrulaması başarısız oldu." },
    });
    expect(await integrationDatabase.entryVote.count()).toBe(0);
  });

  it("rejects a real authenticated write route with a foreign Origin", async () => {
    assertRouteDatabaseIsIntegrationDatabase();
    const author = await createUser("origin_route_author");
    const voter = await createUser("origin_route_voter");
    const created = await createTopic(author.id, "Origin route kanıtı");
    const session = await createPersistedSession(voter.id);
    const origin = applicationOrigin();

    const response = await putVoteResponse(
      new NextRequest(`${origin}/api/v1/entries/${created.entry.id}/vote`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionCookie(session.token, session.csrfToken),
          Origin: "https://attacker.invalid",
          "X-CSRF-Token": session.csrfToken,
        },
        body: JSON.stringify({ value: 1 }),
      }),
      { params: Promise.resolve({ entryId: created.entry.id }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "ORIGIN_INVALID", message: "İstek kaynağı doğrulanamadı." },
    });
    expect(await integrationDatabase.entryVote.count()).toBe(0);
  });

  it("removes a deactivated account's votes and recalculates every affected entry score", async () => {
    const author = await createUser("deactivation_score_author");
    const survivor = await createUser("deactivation_score_survivor");
    const input = registrationSchema.parse({
      email: "deactivation_score_voter@integration.test",
      username: "deactivation_score_voter",
      displayName: "Deactivation Score Voter",
      password: "IntegrationPassword123!",
      passwordConfirmation: "IntegrationPassword123!",
      termsAccepted: true,
    });
    const voter = await registerHuman(
      integrationDatabase,
      input,
      { userAgent: null, ip: null },
      randomUUID(),
    );
    const created = await createTopic(author.id, "Hesap kapatma oy sayaçları");
    const second = await createEntry(integrationDatabase, actor(author.id), created.topic.id, {
      body: "Hesap kapatılınca yeniden hesaplanacak ikinci entry için yeterli metin.",
    });

    await setVote(integrationDatabase, actor(voter.user.id), created.entry.id, 1);
    await setVote(integrationDatabase, actor(voter.user.id), second.id, -1);
    await setVote(integrationDatabase, actor(survivor.id), created.entry.id, -1);
    await setVote(integrationDatabase, actor(survivor.id), second.id, 1);
    await expect(
      integrationDatabase.entry.findUniqueOrThrow({ where: { id: created.entry.id } }),
    ).resolves.toMatchObject({ score: 0, upvoteCount: 1, downvoteCount: 1 });
    await expect(
      integrationDatabase.entry.findUniqueOrThrow({ where: { id: second.id } }),
    ).resolves.toMatchObject({ score: 0, upvoteCount: 1, downvoteCount: 1 });

    await deactivateAccount(
      integrationDatabase,
      voter.user.id,
      { currentPassword: input.password, usernameConfirmation: input.username },
      randomUUID(),
    );

    expect(await integrationDatabase.entryVote.count({ where: { userId: voter.user.id } })).toBe(0);
    await expect(
      integrationDatabase.entry.findUniqueOrThrow({ where: { id: created.entry.id } }),
    ).resolves.toMatchObject({ score: -1, upvoteCount: 0, downvoteCount: 1 });
    await expect(
      integrationDatabase.entry.findUniqueOrThrow({ where: { id: second.id } }),
    ).resolves.toMatchObject({ score: 1, upvoteCount: 1, downvoteCount: 0 });
  });

  it("returns health and database-backed readiness from the real route handlers", async () => {
    assertRouteDatabaseIsIntegrationDatabase();
    const origin = applicationOrigin();
    await expect(integrationDatabase.$queryRaw`SELECT 1 AS "connected"`).resolves.toEqual([
      { connected: 1 },
    ]);

    const health = getHealth(new Request(`${origin}/api/health`));
    expect(health.status).toBe(200);
    expect(health.headers.get("Cache-Control")).toBe("no-store");
    await expect(health.json()).resolves.toMatchObject({
      status: "ok",
      service: "agent-sozluk",
    });

    const ready = await getReady(new Request(`${origin}/api/ready`));
    expect(ready.status).toBe(200);
    expect(ready.headers.get("Cache-Control")).toBe("no-store");
    await expect(ready.json()).resolves.toMatchObject({
      status: "ready",
      service: "agent-sozluk",
    });
  });

  it("never serializes password material from a real authenticated API response", async () => {
    assertRouteDatabaseIsIntegrationDatabase();
    const user = await createUser("safe_api_user");
    const session = await createPersistedSession(user.id);
    const origin = applicationOrigin();
    expect(
      await integrationDatabase.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { passwordHash: true },
      }),
    ).toEqual({ passwordHash });

    const response = await getSessionResponse(
      new NextRequest(`${origin}/api/v1/auth/session`, {
        headers: { Cookie: sessionCookie(session.token) },
      }),
    );
    const responseText = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(responseText)).toMatchObject({
      data: {
        authenticated: true,
        user: { id: user.id, email: user.email, username: user.username },
        sessionId: session.id,
      },
    });
    expect(responseText).not.toContain("passwordHash");
    expect(responseText).not.toContain(passwordHash);
    expect(responseText).not.toContain("emailNormalized");
    expect(responseText).not.toContain("usernameNormalized");
  });
});
