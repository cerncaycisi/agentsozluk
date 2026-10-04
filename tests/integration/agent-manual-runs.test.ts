import { NextRequest } from "next/server";
import { POST as previewRoute } from "@/app/api/v1/admin/agent-runs/bulk/preview/route";
import { POST as bulkRoute } from "@/app/api/v1/admin/agent-runs/bulk/route";
import { SESSION_COOKIE_NAME, CSRF_COOKIE_NAME } from "@/config/app";
import { getEnvironment } from "@/config/env";
import { createOpaqueToken, sha256 } from "@/lib/security/crypto";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ActorContext } from "@/modules/auth/domain/actor";
import {
  bulkAgentRunPreviewSchema,
  bulkAgentRunSchema,
  cancelAgentRun,
  changeAgentLifecycle,
  createAgent,
  createAgentSchema,
  createBulkAgentRuns,
  createManualAgentRun,
  getAgentRunDetail,
  lifecycleChangeSchema,
  listAgentRuns,
  manualAgentRunSchema,
  previewBulkAgentRun,
  retryAgentRun,
  updateAgent,
  updateAgentSchema,
} from "@/modules/agents";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

async function createAdmin() {
  const suffix = randomUUID().replaceAll("-", "");
  return integrationDatabase.user.create({
    data: {
      kind: "HUMAN",
      role: "ADMIN",
      status: "ACTIVE",
      email: `manual-admin-${suffix}@integration.test`,
      emailNormalized: `manual-admin-${suffix}@integration.test`,
      username: `manual_${suffix.slice(0, 16)}`,
      usernameNormalized: `manual_${suffix.slice(0, 16)}`,
      displayName: "Manual run admin",
      passwordHash: "not-used",
      termsVersion: "1.0",
      termsAcceptedAt: new Date(),
    },
  });
}

function actor(adminId: string): ActorContext {
  return {
    actorId: adminId,
    actorKind: "HUMAN",
    actorRole: "ADMIN",
    requestId: randomUUID(),
    origin: "API",
  };
}

async function createActiveAgent(adminId: string, personaIndex: number) {
  const created = await createAgent(
    integrationDatabase,
    actor(adminId),
    createAgentSchema.parse({ persona: originalPersonaPack.personas[personaIndex] }),
  );
  await changeAgentLifecycle(
    integrationDatabase,
    actor(adminId),
    created.agent.profile.id,
    lifecycleChangeSchema.parse({
      status: "ACTIVE",
      reason: "Activate the manual-run integration fixture.",
    }),
  );
  return created;
}

beforeEach(resetIntegrationDatabase);
afterAll(closeIntegrationDatabase);

describe("continuous-flow manual runs with PostgreSQL", () => {
  it("queues normal, burst and read-only work with mode-specific boundaries", async () => {
    const admin = await createAdmin();
    const created = await createActiveAgent(admin.id, 0);

    const normal = await createManualAgentRun(
      integrationDatabase,
      actor(admin.id),
      created.agent.profile.id,
      manualAgentRunSchema.parse({
        runType: "NORMAL_WAKE",
        priority: "EMERGENCY",
        adminInstruction: "Focus on current public platform context only.",
      }),
    );
    expect(normal.run).toMatchObject({
      runStatus: "QUEUED",
      queuePriority: "EMERGENCY_ADMIN",
      desiredEntryMin: 0,
      desiredEntryMax: 0,
      saturationOverride: false,
      dailyMaximumOverride: false,
    });

    const entryBurst = await createManualAgentRun(
      integrationDatabase,
      actor(admin.id),
      created.agent.profile.id,
      manualAgentRunSchema.parse({
        runType: "ENTRY_BURST",
        priority: "NORMAL",
      }),
    );
    expect(entryBurst.run).toMatchObject({
      runType: "ENTRY_BURST",
      runStatus: "QUEUED",
      queuePriority: "MANUAL_SINGLE",
      desiredEntryMin: 0,
      desiredEntryMax: 0,
    });

    const readOnly = await createManualAgentRun(
      integrationDatabase,
      actor(admin.id),
      created.agent.profile.id,
      manualAgentRunSchema.parse({
        runType: "READ_ONLY",
        allowTopicCreation: true,
        allowVoting: true,
        allowFollowing: true,
      }),
    );
    expect(readOnly.run).toMatchObject({
      desiredEntryMin: 0,
      desiredEntryMax: 0,
      allowTopicCreation: false,
      allowVoting: false,
      allowFollowing: false,
      allowSourceReading: true,
    });
    expect(
      await listAgentRuns(integrationDatabase, actor(admin.id), created.agent.profile.id),
    ).toHaveLength(3);
    expect(
      await integrationDatabase.auditLog.count({ where: { action: "agent.run.queued" } }),
    ).toBe(3);
  });

  it("previews and queues confirmed bulk work without daily projections", async () => {
    const admin = await createAdmin();
    const agents = await Promise.all([0, 1].map((index) => createActiveAgent(admin.id, index)));
    const run = {
      runType: "NORMAL_WAKE" as const,
      allowTopicCreation: true,
      allowVoting: true,
      allowFollowing: true,
      allowSourceReading: true,
      provocationOverride: false,
      priority: "NORMAL" as const,
    };

    const preview = await previewBulkAgentRun(
      integrationDatabase,
      actor(admin.id),
      bulkAgentRunPreviewSchema.parse({ allActive: true, run }),
    );
    expect(preview).toMatchObject({
      runCount: 2,
      existingQueueLength: 0,
      measuredP75DurationMs: null,
      estimateStatus: "UNKNOWN",
      estimatedStartAt: null,
      estimatedCompleteAt: null,
      concurrency: 1,
    });
    expect(preview).not.toHaveProperty("targetMissRiskChange");
    expect(preview).not.toHaveProperty("saturationOverride");
    expect(preview).not.toHaveProperty("dailyMaximumOverride");
    expect(() =>
      bulkAgentRunSchema.parse({
        allActive: true,
        run,
        confirmation: "RUN_SELECTED_AGENTS",
      }),
    ).toThrow();

    const queued = await createBulkAgentRuns(
      integrationDatabase,
      actor(admin.id),
      bulkAgentRunSchema.parse({
        allActive: true,
        run,
        confirmation: "RUN_ALL_ACTIVE_AGENTS",
        previewToken: preview.previewToken,
      }),
    );
    expect(queued.count).toBe(2);
    expect(
      queued.runs.every(
        (item) =>
          item.runStatus === "QUEUED" &&
          item.queuePriority === "SCHEDULED_CONTENT" &&
          item.trigger === "ADMIN_BULK",
      ),
    ).toBe(true);

    const emergencyActor = actor(admin.id);
    const emergencySelection = bulkAgentRunPreviewSchema.parse({
      agentIds: [agents[0]!.agent.profile.id],
      run: { ...run, priority: "EMERGENCY" },
    });
    const emergencyPreview = await previewBulkAgentRun(
      integrationDatabase,
      emergencyActor,
      emergencySelection,
    );
    const emergency = await createBulkAgentRuns(
      integrationDatabase,
      emergencyActor,
      bulkAgentRunSchema.parse({
        allActive: false,
        agentIds: [agents[0]!.agent.profile.id],
        run: { ...run, priority: "EMERGENCY" },
        confirmation: "RUN_SELECTED_AGENTS",
        previewToken: emergencyPreview.previewToken,
      }),
    );
    expect(emergency.runs[0]).toMatchObject({
      trigger: "ADMIN_BULK",
      queuePriority: "EMERGENCY_ADMIN",
    });
    await expect(
      integrationDatabase.auditLog.findFirstOrThrow({
        where: { action: "agent.run.bulk_queued", requestId: emergencyActor.requestId },
      }),
    ).resolves.toMatchObject({ metadata: { queuePriority: "EMERGENCY_ADMIN" } });
  });

  it.each(["payload", "date", "settings", "profile", "persona", "roster"] as const)(
    "rejects a changed %s after preview without creating any work",
    async (change) => {
      const admin = await createAdmin();
      const created = await createActiveAgent(admin.id, 0);
      const selection = bulkAgentRunPreviewSchema.parse({
        allActive: true,
        run: { runType: "NORMAL_WAKE", availableAt: "2026-10-10T12:00:00.000Z" },
      });
      const preview = await previewBulkAgentRun(integrationDatabase, actor(admin.id), selection);
      const input = bulkAgentRunSchema.parse({
        ...selection,
        previewToken: preview.previewToken,
        confirmation: "RUN_ALL_ACTIVE_AGENTS",
      });
      if (change === "payload") input.run.allowVoting = false;
      if (change === "date") input.run.availableAt = new Date("2026-10-11T12:00:00.000Z");
      if (change === "settings")
        await integrationDatabase.agentGlobalSettings.update({
          where: { id: "global" },
          data: { settingsVersion: { increment: 1 } },
        });
      if (change === "profile")
        await updateAgent(
          integrationDatabase,
          actor(admin.id),
          created.agent.profile.id,
          updateAgentSchema.parse({ manualTimeoutSeconds: 720 }),
        );
      if (change === "persona")
        await updateAgent(
          integrationDatabase,
          actor(admin.id),
          created.agent.profile.id,
          updateAgentSchema.parse({
            persona: originalPersonaPack.personas[0],
            expectedPersonaVersion: 1,
            changeSummary: "Preview must bind the exact current persona version.",
          }),
        );
      if (change === "roster") await createActiveAgent(admin.id, 1);
      await expect(
        createBulkAgentRuns(integrationDatabase, actor(admin.id), input),
      ).rejects.toMatchObject({ code: "BULK_PREVIEW_CHANGED", status: 409 });
      expect(await integrationDatabase.agentRun.count({ where: { trigger: "ADMIN_BULK" } })).toBe(
        0,
      );
      expect(
        await integrationDatabase.auditLog.count({ where: { action: "agent.run.bulk_queued" } }),
      ).toBe(0);
    },
  );

  it("consumes one preview once even with a new request id, keeping audit free of its token", async () => {
    const admin = await createAdmin();
    await createActiveAgent(admin.id, 0);
    const selection = bulkAgentRunPreviewSchema.parse({
      allActive: true,
      run: { runType: "DRY_RUN" },
    });
    const preview = await previewBulkAgentRun(integrationDatabase, actor(admin.id), selection);
    const input = bulkAgentRunSchema.parse({
      ...selection,
      previewToken: preview.previewToken,
      confirmation: "RUN_ALL_ACTIVE_AGENTS",
    });
    const outcomes = await Promise.allSettled([
      createBulkAgentRuns(integrationDatabase, actor(admin.id), input),
      createBulkAgentRuns(integrationDatabase, actor(admin.id), input),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find((outcome) => outcome.status === "rejected")).toMatchObject({
      reason: { code: "BULK_PREVIEW_USED", status: 409 },
    });
    expect(await integrationDatabase.agentRun.count({ where: { trigger: "ADMIN_BULK" } })).toBe(1);
    const audit = await integrationDatabase.auditLog.findFirstOrThrow({
      where: { action: "agent.run.bulk_queued" },
    });
    expect(audit.metadata).toMatchObject({ previewId: preview.previewId });
    expect(JSON.stringify(audit)).not.toContain(preview.previewToken);
  });

  it("rejects another admin's receipt and an expired receipt with no queued runs", async () => {
    const admin = await createAdmin();
    const otherAdmin = await createAdmin();
    await createActiveAgent(admin.id, 0);
    const now = new Date();
    const selection = bulkAgentRunPreviewSchema.parse({
      allActive: true,
      run: { runType: "DRY_RUN" },
    });
    const preview = await previewBulkAgentRun(integrationDatabase, actor(admin.id), selection, now);
    const input = bulkAgentRunSchema.parse({
      ...selection,
      previewToken: preview.previewToken,
      confirmation: "RUN_ALL_ACTIVE_AGENTS",
    });
    await expect(
      createBulkAgentRuns(integrationDatabase, actor(otherAdmin.id), input, now),
    ).rejects.toMatchObject({ code: "BULK_PREVIEW_INVALID" });
    await expect(
      createBulkAgentRuns(
        integrationDatabase,
        actor(admin.id),
        input,
        new Date(now.getTime() + 600_000),
      ),
    ).rejects.toMatchObject({ code: "BULK_PREVIEW_EXPIRED" });
    expect(await integrationDatabase.agentRun.count({ where: { trigger: "ADMIN_BULK" } })).toBe(0);
  });

  it("refreshes preview on HTTP replay, preserves submission replay and rechecks authorization", async () => {
    const admin = await createAdmin();
    await createActiveAgent(admin.id, 0);
    const sessionToken = createOpaqueToken();
    const csrfToken = createOpaqueToken();
    await integrationDatabase.session.create({
      data: {
        userId: admin.id,
        tokenHash: sha256(sessionToken),
        csrfTokenHash: sha256(csrfToken),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    const origin = new URL(getEnvironment().APP_URL).origin;
    const request = (path: string, body: unknown, key: string) =>
      new NextRequest(`${origin}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin,
          "x-csrf-token": csrfToken,
          "idempotency-key": key,
          cookie: `${SESSION_COOKIE_NAME}=${sessionToken}; ${CSRF_COOKIE_NAME}=${csrfToken}`,
        },
        body: JSON.stringify(body),
      });
    const path = "/api/v1/admin/agent-runs/bulk";
    const previewKey = randomUUID();
    const selection = {
      allActive: true,
      run: { runType: "DRY_RUN", availableAt: "2026-10-10T12:00:00.000Z" },
    };
    const first = await previewRoute(request(`${path}/preview`, selection, previewKey));
    expect(first.status).toBe(200);
    const firstPreview = (await first.json()).data;
    await integrationDatabase.agentGlobalSettings.update({
      where: { id: "global" },
      data: { settingsVersion: { increment: 1 } },
    });
    const refreshed = await previewRoute(request(`${path}/preview`, selection, previewKey));
    expect(refreshed.headers.get("Idempotent-Replay")).toBe("true");
    const preview = (await refreshed.json()).data;
    expect(preview.settingsVersion).toBe(firstPreview.settingsVersion + 1);
    expect(preview.previewToken).not.toBe(firstPreview.previewToken);
    const stored = await integrationDatabase.idempotencyRecord.findFirstOrThrow({
      where: { key: previewKey },
    });
    expect(JSON.stringify(stored.responseBody)).not.toContain(firstPreview.previewToken);
    const payload = {
      ...selection,
      previewToken: preview.previewToken,
      confirmation: "RUN_ALL_ACTIVE_AGENTS",
    };
    const submitKey = randomUUID();
    const crossOrigin = request(path, payload, submitKey);
    crossOrigin.headers.set("origin", "https://untrusted.invalid");
    expect((await bulkRoute(crossOrigin)).status).toBe(403);
    const submitted = await bulkRoute(request(path, payload, submitKey));
    expect(submitted.status).toBe(200);
    const created = (await submitted.json()).data;
    const changedDate = {
      ...payload,
      run: { ...payload.run, availableAt: "2026-10-11T12:00:00.000Z" },
    };
    const conflict = await bulkRoute(request(path, changedDate, submitKey));
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error.code).toBe("IDEMPOTENCY_CONFLICT");
    const replayed = await bulkRoute(request(path, payload, submitKey));
    expect(replayed.headers.get("Idempotent-Replay")).toBe("true");
    expect((await replayed.json()).data.runs[0].id).toBe(created.runs[0].id);
    expect(await integrationDatabase.agentRun.count({ where: { trigger: "ADMIN_BULK" } })).toBe(1);
    await integrationDatabase.user.update({
      where: { id: admin.id },
      data: { status: "SUSPENDED" },
    });
    expect((await bulkRoute(request(path, payload, submitKey))).status).toBe(403);
  });

  it("cancels queued/running work and retries terminal work with immutable lineage", async () => {
    const admin = await createAdmin();
    const created = await createActiveAgent(admin.id, 0);
    const first = await createManualAgentRun(
      integrationDatabase,
      actor(admin.id),
      created.agent.profile.id,
      manualAgentRunSchema.parse({ runType: "NORMAL_WAKE" }),
    );
    const cancelled = await cancelAgentRun(integrationDatabase, actor(admin.id), first.run!.id, {
      reason: "Cancel queued run during integration verification.",
    });
    expect(cancelled).toMatchObject({
      runStatus: "CANCELLED",
      leaseOwner: null,
      errorCode: "ADMIN_CANCELLED",
    });
    expect(cancelled.finishedAt).not.toBeNull();

    const second = await createManualAgentRun(
      integrationDatabase,
      actor(admin.id),
      created.agent.profile.id,
      manualAgentRunSchema.parse({ runType: "NORMAL_WAKE" }),
    );
    await integrationDatabase.agentRun.update({
      where: { id: second.run!.id },
      data: {
        runStatus: "RUNNING",
        leaseOwner: "integration-worker",
        leaseExpiresAt: new Date(Date.now() + 60_000),
        startedAt: new Date(),
      },
    });
    const cancelling = await cancelAgentRun(integrationDatabase, actor(admin.id), second.run!.id, {
      reason: "Request graceful running cancellation in integration verification.",
    });
    expect(cancelling).toMatchObject({
      runStatus: "CANCEL_REQUESTED",
      leaseOwner: "integration-worker",
    });
    expect(cancelling.finishedAt).toBeNull();

    await integrationDatabase.agentRun.update({
      where: { id: second.run!.id },
      data: {
        runStatus: "FAILED",
        leaseOwner: null,
        leaseExpiresAt: null,
        finishedAt: new Date(),
        errorCode: "INTEGRATION_FAILURE",
        errorSummary: "Synthetic terminal state for retry verification.",
      },
    });
    const retry = await retryAgentRun(integrationDatabase, actor(admin.id), second.run!.id, {
      reason: "Retry failed run after synthetic integration failure.",
    });
    expect(retry.id).not.toBe(second.run!.id);
    expect(retry).toMatchObject({
      parentRunId: second.run!.id,
      runStatus: "QUEUED",
      trigger: "ADMIN_RETRY",
      queuePriority: "MANUAL_SINGLE",
    });
    const detail = await getAgentRunDetail(integrationDatabase, actor(admin.id), retry.id);
    expect(detail.parentRunId).toBe(second.run!.id);
    await expect(
      integrationDatabase.outboxEvent.findFirstOrThrow({
        where: { eventType: "agent.run.queued", aggregateId: retry.id },
      }),
    ).resolves.toMatchObject({
      aggregateType: "AgentRun",
      payload: expect.objectContaining({
        runId: retry.id,
        parentRunId: second.run!.id,
        trigger: "ADMIN_RETRY",
      }),
    });
  });

  it.each(["NIGHTLY_MEMORY_CONSOLIDATION", "ADMIN_MEMORY_RECONSOLIDATE"])(
    "preserves memory-consolidation semantics when retrying a %s reflection",
    async (parentTrigger) => {
      const admin = await createAdmin();
      const created = await createActiveAgent(admin.id, 0);
      const parent = await createManualAgentRun(
        integrationDatabase,
        actor(admin.id),
        created.agent.profile.id,
        manualAgentRunSchema.parse({ runType: "REFLECTION" }),
      );
      await integrationDatabase.agentRun.update({
        where: { id: parent.run!.id },
        data: {
          trigger: parentTrigger,
          runStatus: "FAILED",
          finishedAt: new Date(),
          errorCode: "CONTROL_PLANE_MEMORY_RECORD_FAILED",
          errorSummary: "Synthetic memory-consolidation failure for retry verification.",
        },
      });

      const retry = await retryAgentRun(integrationDatabase, actor(admin.id), parent.run!.id, {
        reason: "Retry memory consolidation without changing its runtime semantics.",
      });

      expect(retry).toMatchObject({
        parentRunId: parent.run!.id,
        runType: "REFLECTION",
        runStatus: "QUEUED",
        trigger: "ADMIN_MEMORY_RECONSOLIDATE",
        queuePriority: "MANUAL_SINGLE",
      });
      await expect(
        integrationDatabase.outboxEvent.findFirstOrThrow({
          where: { eventType: "agent.run.queued", aggregateId: retry.id },
        }),
      ).resolves.toMatchObject({
        payload: expect.objectContaining({
          runId: retry.id,
          parentRunId: parent.run!.id,
          trigger: "ADMIN_MEMORY_RECONSOLIDATE",
        }),
      });
    },
  );
});
