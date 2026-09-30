import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { requireTestDatabaseUrl } from "../../scripts/test-database-safety";
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
  const line = result.stdout.trim().split("\n").at(-1) ?? "";
  return {
    status: result.status ?? -1,
    stderr: result.stderr,
    output: line.startsWith("{") ? (JSON.parse(line) as { status: number; body: unknown }) : null,
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

    // Her çağrı kendi oturumunu açar ve iptal eder; açık oturum kalmaz.
    const sessions = await integrationDatabase.session.findMany({
      where: { userId: admin.id },
      select: { revokedAt: true, userAgent: true },
    });
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    for (const session of sessions) {
      expect(session.userAgent).toBe("operator-admin-cli");
      expect(session.revokedAt).not.toBeNull();
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
});
