import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { AppError } from "@/lib/http/errors";
import { cancelAgentRun, createAgent, createAgentSchema } from "@/modules/agents";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

/*
  Great reset boşaltma CLI'si (Astra ile ortak karar, 27 Eylül "A+B"): gerçek PostgreSQL'de,
  panelle aynı uygulama servisleriyle. Bayraklar kapalı değilse hiçbir şey yapmaz; sıradaki BÜTÜN
  koşu türlerini iptal eder; süren koşu bitmezse süre sınırında durur; bittiğinde hazır der.
*/

beforeEach(resetIntegrationDatabase);
afterAll(closeIntegrationDatabase);

async function createAdmin() {
  const suffix = randomUUID().replaceAll("-", "");
  return integrationDatabase.user.create({
    data: {
      kind: "HUMAN",
      role: "ADMIN",
      status: "ACTIVE",
      email: `drain-${suffix}@integration.test`,
      emailNormalized: `drain-${suffix}@integration.test`,
      username: `drain_${suffix.slice(0, 16)}`,
      usernameNormalized: `drain_${suffix.slice(0, 16)}`,
      displayName: "Drain admin",
      passwordHash: "not-used",
      termsVersion: "1.0",
      termsAcceptedAt: new Date(),
    },
  });
}

function actor(id: string): ActorContext {
  return {
    actorId: id,
    actorKind: "HUMAN",
    actorRole: "ADMIN",
    requestId: randomUUID(),
    origin: "API",
  };
}

function drain(
  command: "status" | "drain",
  adminId: string,
  timeoutSeconds = 10,
  extraEnv: Record<string, string> = {},
) {
  return spawnSync("node_modules/.bin/tsx", ["scripts/great-reset-drain.ts", command], {
    encoding: "utf8",
    timeout: 120_000,
    env: {
      ...process.env,
      AGENT_OPERATOR_ADMIN_ID: adminId,
      AGENT_FLOW_REASON: "great reset boşaltma testi",
      AGENT_DRAIN_TIMEOUT_SECONDS: String(timeoutSeconds),
      AGENT_DRAIN_POLL_SECONDS: "1",
      ...extraEnv,
    },
  });
}

async function setFlags(enabled: boolean) {
  await integrationDatabase.agentGlobalSettings.update({
    where: { id: "global" },
    data: {
      runtimeEnabled: enabled,
      schedulerEnabled: enabled,
      publicWriteEnabled: enabled,
      publishEnabled: enabled,
    },
  });
}

describe("great reset boşaltması", () => {
  it("bayraklar açıkken durur; sıradaki bütün türleri iptal eder; süren koşuyu bekler", async () => {
    const admin = await createAdmin();
    const created = await createAgent(
      integrationDatabase,
      actor(admin.id),
      createAgentSchema.parse({
        persona: originalPersonaPack.personas[0],
        creation: {
          method: "TEMPLATE",
          templateUsername: originalPersonaPack.personas[0]!.username,
        },
      }),
    );
    const agentProfileId = created.agent.profile.id;
    const personaVersionId = created.agent.personaVersion.id;
    const run = (
      runType: "NORMAL_WAKE" | "REFLECTION" | "SOURCE_REFRESH",
      queuePriority: "SCHEDULED_CONTENT" | "REFLECTION" | "SOURCE_REFRESH",
      running = false,
    ) =>
      integrationDatabase.agentRun.create({
        data: {
          agentProfileId,
          personaVersionId,
          runType,
          queuePriority,
          runStatus: running ? "RUNNING" : "QUEUED",
          trigger: "DRAIN_TEST",
          idempotencyKey: randomUUID(),
          timeoutSeconds: 600,
          desiredEntryMin: 0,
          desiredEntryMax: 0,
          ...(running
            ? {
                leaseOwner: "worker-test",
                leaseToken: "a".repeat(43),
                leaseExpiresAt: new Date(Date.now() + 600_000),
                startedAt: new Date(),
              }
            : {}),
        },
      });
    const queued = [
      await run("NORMAL_WAKE", "SCHEDULED_CONTENT"),
      await run("REFLECTION", "REFLECTION"),
      await run("SOURCE_REFRESH", "SOURCE_REFRESH"),
    ];
    const active = await run("NORMAL_WAKE", "SCHEDULED_CONTENT", true);

    // Hedef guard'ı (Astra #243 P1): üretim host'u değilse yalnız test/loopback/_test hedefi;
    // `_test` olmayan bir DB'ye hiçbir okuma/yazma yapılmadan ret.
    const foreignUrl = new URL(process.env.DATABASE_URL!);
    foreignUrl.pathname = "/postgres";
    const foreign = drain("drain", admin.id, 10, { DATABASE_URL: foreignUrl.toString() });
    expect(foreign.status).toBe(3);
    expect(foreign.stderr).toContain("code=GREAT_RESET_OPERATOR_TARGET_INVALID");
    expect(await integrationDatabase.agentRun.count({ where: { runStatus: "QUEUED" } })).toBe(3);

    // Yalnız sıradaki koşu (Astra #243 P2): kilit altında RUNNING ise iptal edilmez.
    await expect(
      cancelAgentRun(
        integrationDatabase,
        actor(admin.id),
        active.id,
        { reason: "great reset boşaltma testi" },
        { requireQueued: true },
      ),
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof AppError && error.code === "AGENT_RUN_LEASE_INVALID",
    );
    expect(
      (await integrationDatabase.agentRun.findUniqueOrThrow({ where: { id: active.id } }))
        .runStatus,
    ).toBe("RUNNING");

    // Bayraklar açıkken hiçbir koşuya dokunmaz.
    await setFlags(true);
    const refused = drain("drain", admin.id);
    expect(refused.status).toBe(3);
    expect(refused.stderr).toContain("RESET_DRAIN_FAIL code=DRAIN_FLAGS_NOT_FROZEN");
    expect(await integrationDatabase.agentRun.count({ where: { runStatus: "QUEUED" } })).toBe(3);

    await setFlags(false);
    const status = drain("status", admin.id);
    expect(status.status).toBe(3);
    expect(status.stdout).toContain("blockers=RUNS_OR_LEASES_PRESENT");

    // Süren koşu bitmez: sıradakiler (her tür) iptal, süre sınırında durur.
    const timedOut = drain("drain", admin.id, 10);
    expect(timedOut.status).toBe(3);
    expect(timedOut.stderr).toContain("RESET_DRAIN_FAIL code=DRAIN_TIMEOUT");
    expect(timedOut.stdout).toContain("queued=0 active=1 cancelled=3");
    for (const { id } of queued)
      expect(
        (await integrationDatabase.agentRun.findUniqueOrThrow({ where: { id } })).runStatus,
      ).toBe("CANCELLED");
    expect(
      (await integrationDatabase.agentRun.findUniqueOrThrow({ where: { id: active.id } }))
        .runStatus,
    ).toBe("RUNNING");
    expect(
      await integrationDatabase.auditLog.count({ where: { action: "agent.run.cancel_requested" } }),
    ).toBe(3);

    // Worker süren koşuyu bitirip kirayı bırakınca hazır.
    await integrationDatabase.agentRun.update({
      where: { id: active.id },
      data: {
        runStatus: "SUCCEEDED",
        finishedAt: new Date(),
        leaseOwner: null,
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
    const ready = drain("drain", admin.id, 10);
    expect(ready.stderr).not.toContain("RESET_DRAIN_FAIL");
    expect(ready.status).toBe(0);
    expect(ready.stdout).toContain("ready=true blockers=-");
    // Bayraklar kapalı kalır; açılış elle.
    expect(
      await integrationDatabase.agentGlobalSettings.findUniqueOrThrow({
        where: { id: "global" },
        select: { runtimeEnabled: true, schedulerEnabled: true },
      }),
    ).toEqual({ runtimeEnabled: false, schedulerEnabled: false });
  }, 180_000);
});
