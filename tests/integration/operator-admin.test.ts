import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { requireTestDatabaseUrl } from "../../scripts/test-database-safety";
import { authenticateSession, issueSession } from "@/modules/auth/application/sessions";
import { operatorSessionUserAgent } from "@/modules/auth/domain/session";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

/*
  Operatör yönetici komutu gerçek PostgreSQL ile (30 Eylül 2026): panelin rotasını aynı
  denetimlerle çağırır, mutasyonda tam `METOD yol` onayı ister, oturumu her durumda iptal
  eder ve izin dışı yolları reddeder.
*/
const databaseUrl = requireTestDatabaseUrl(process.env.TEST_DATABASE_URL, "Integration tests");

async function createAdmin() {
  const suffix = randomUUID().replaceAll("-", "");
  return integrationDatabase.user.create({
    data: {
      kind: "HUMAN",
      role: "ADMIN",
      status: "ACTIVE",
      email: `admin-${suffix}@integration.test`,
      emailNormalized: `admin-${suffix}@integration.test`,
      username: `admin_${suffix.slice(0, 16)}`,
      usernameNormalized: `admin_${suffix.slice(0, 16)}`,
      displayName: "ADMIN principal",
      passwordHash: "not-used",
      termsVersion: "1.0",
      termsAcceptedAt: new Date(),
    },
  });
}

function operator(adminId: string, args: string[], extra: Record<string, string> = {}) {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/operator-admin.ts", ...args],
    {
      encoding: "utf8",
      timeout: 120_000,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        AGENT_OPERATOR_ADMIN_ID: adminId,
        ...extra,
      },
    },
  );
  const lines = result.stdout.trim().split("\n").filter(Boolean);
  // stdout yalnız sonuç JSON satırıdır; uygulama logları stderr'e gider.
  expect(lines.length).toBeLessThanOrEqual(1);
  const line = lines.at(-1) ?? "";
  return {
    status: result.status ?? -1,
    stderr: result.stderr,
    output: line.startsWith("{")
      ? (JSON.parse(line) as { status: number; body: unknown; idempotencyKey?: string })
      : null,
  };
}

beforeEach(resetIntegrationDatabase);
afterAll(closeIntegrationDatabase);

describe("operatör yönetici komutu", () => {
  it("okur, onaysız mutasyonu reddeder, onaylı mutasyonu panel denetimleriyle uygular", async () => {
    const admin = await createAdmin();
    const read = operator(admin.id, ["GET", "/api/v1/admin/agent-settings"]);
    expect(read.status, read.stderr).toBe(0);
    expect(read.output?.status).toBe(200);

    const settingsVersion = (
      await integrationDatabase.agentGlobalSettings.findUniqueOrThrow({ where: { id: "global" } })
    ).settingsVersion;
    const patch = [
      "PATCH",
      "/api/v1/admin/agent-settings",
      JSON.stringify({
        expectedSettingsVersion: settingsVersion,
        votingEnabled: false,
        changeReason: "Operatör komutu entegrasyon denemesi.",
      }),
    ];
    const refused = operator(admin.id, patch);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain("OPERATOR_ADMIN_CONFIRMATION_REQUIRED");
    expect(
      (await integrationDatabase.agentGlobalSettings.findUniqueOrThrow({ where: { id: "global" } }))
        .votingEnabled,
    ).toBe(true);

    const applied = operator(admin.id, patch, {
      AGENT_ADMIN_CONFIRMATION: "PATCH /api/v1/admin/agent-settings",
    });
    expect(applied.output, JSON.stringify(applied.output)).toMatchObject({ status: 200 });
    expect(applied.status).toBe(0);
    // Anahtar işleyiciden önce stderr'e yazılır; çıktıdaki ile aynıdır.
    expect(applied.stderr).toContain(
      `OPERATOR_ADMIN_IDEMPOTENCY_KEY=${applied.output!.idempotencyKey!}`,
    );
    expect(applied.output?.status).toBe(200);
    expect(
      (await integrationDatabase.agentGlobalSettings.findUniqueOrThrow({ where: { id: "global" } }))
        .votingEnabled,
    ).toBe(false);
    expect(
      await integrationDatabase.auditLog.count({
        where: { actorId: admin.id, action: { contains: "settings" } },
      }),
    ).toBeGreaterThan(0);

    // Aynı idempotency anahtarıyla yeniden deneme mutasyonu tekrarlamaz.
    const versionAfter = (
      await integrationDatabase.agentGlobalSettings.findUniqueOrThrow({ where: { id: "global" } })
    ).settingsVersion;
    const retried = operator(admin.id, patch, {
      AGENT_ADMIN_CONFIRMATION: "PATCH /api/v1/admin/agent-settings",
      AGENT_ADMIN_IDEMPOTENCY_KEY: applied.output!.idempotencyKey!,
    });
    expect(retried.output?.status).toBe(200);
    expect(
      (await integrationDatabase.agentGlobalSettings.findUniqueOrThrow({ where: { id: "global" } }))
        .settingsVersion,
    ).toBe(versionAfter);

    // Her çağrı kendi oturumunu açar ve iptal eder; açık oturum kalmaz, ömür kısa kalır.
    const sessions = await integrationDatabase.session.findMany({
      where: { userId: admin.id },
      select: { revokedAt: true, userAgent: true, createdAt: true, expiresAt: true },
    });
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    for (const session of sessions) {
      expect(session.userAgent).toBe("operator-admin-cli");
      expect(session.revokedAt).not.toBeNull();
      expect(session.expiresAt.getTime() - session.createdAt.getTime()).toBeLessThanOrEqual(
        11 * 60 * 1000,
      );
    }
  }, 300_000);

  it("izin dışı yolu reddeder ve oturum açmaz", async () => {
    const admin = await createAdmin();
    for (const target of ["/api/v1/internal/agent-runtime/lease", "/api/v1/auth/login"]) {
      const result = operator(admin.id, ["POST", target, "{}"], {
        AGENT_ADMIN_CONFIRMATION: `POST ${target}`,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("OPERATOR_ADMIN_PATH_NOT_ALLOWED");
    }
    expect(await integrationDatabase.session.count({ where: { userId: admin.id } })).toBe(0);
  }, 300_000);

  it("operatör oturumu doğrulamada uzatılmaz; normal oturum uzatılır", async () => {
    const admin = await createAdmin();
    const soon = new Date(Date.now() + 5 * 60 * 1000);
    const issue = async (userAgent: string) => {
      const issued = await integrationDatabase.$transaction((transaction) =>
        issueSession(transaction, admin.id, { userAgent, ip: null }),
      );
      await integrationDatabase.session.update({
        where: { id: issued.id },
        data: { expiresAt: soon },
      });
      return issued;
    };
    const operatorSession = await issue(operatorSessionUserAgent);
    const browserSession = await issue("Mozilla/5.0");
    const authenticatedOperator = await authenticateSession(
      integrationDatabase,
      operatorSession.token,
    );
    const authenticatedBrowser = await authenticateSession(
      integrationDatabase,
      browserSession.token,
    );
    expect(authenticatedOperator?.expiresAt.getTime()).toBe(soon.getTime());
    expect(authenticatedBrowser?.expiresAt.getTime()).toBeGreaterThan(soon.getTime());
  });

  it("canlı olay akışını reddeder ve takılı kalmaz", async () => {
    const admin = await createAdmin();
    const stream = operator(admin.id, ["GET", "/api/v1/admin/agent-runtime/events"]);
    expect(stream.status).toBe(1);
    expect(stream.stderr).toContain("OPERATOR_ADMIN_STREAM_NOT_SUPPORTED");
    const poll = operator(admin.id, ["GET", "/api/v1/admin/agent-runtime/events?poll=1"]);
    expect(poll.output?.status).toBe(200);
    expect(
      await integrationDatabase.session.count({ where: { userId: admin.id, revokedAt: null } }),
    ).toBe(0);
  }, 300_000);
});
