import * as birthEvidence from "@/modules/agents/application/birth-evidence";
import * as birthRecords from "@/modules/agents/repository/birth-candidates";
import { runRuntimeStochasticTick } from "@/modules/agents/application/stochastic-scheduler";
import { NextRequest } from "next/server";
import { POST as inspectRoute } from "@/app/api/v1/admin/agent-births/inspect/route";
import { POST as prepareRoute } from "@/app/api/v1/admin/agent-births/prepare/route";
import { prepareBirthCandidate } from "@/modules/agents/application/birth-preparation";
import { changeAgentLifecycle } from "@/modules/agents/application/control-plane";
import { createManualAgentRun } from "@/modules/agents/application/manual-runs";
import {
  leaseRuntimeRun,
  getRuntimeRunContext,
  recordRuntimeSourceAttempt,
  recordRuntimeSourceResult,
  recordRuntimeActions,
  recordRuntimeMemories,
  completeRuntimeRun,
} from "@/modules/agents/application/runtime";
import { executeRuntimeAction } from "@/modules/agents/application/action-executor";
import {
  runtimeActionsSchema,
  runtimeCompleteSchema,
} from "@/modules/agents/validation/runtime-schemas";
import {
  getRuntimeCredentialRoster,
  acknowledgeRuntimeCredentialRoster,
} from "@/modules/agents/application/runtime-credentials";
import { manualAgentRunSchema } from "@/modules/agents/validation/scheduling-schemas";
import { SESSION_COOKIE_NAME, CSRF_COOKIE_NAME } from "@/config/app";
import { getEnvironment } from "@/config/env";
import { createOpaqueToken } from "@/lib/security/crypto";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  runRuntimeBirthTick,
  changeBirthMode,
  inspectBirthCandidate,
  rejectBirthCandidate,
} from "@/modules/agents/application/birth-candidates";
import {
  issueAuthorAssessmentPacket,
  submitAuthorAssessment,
  reverseAuthorAssessment,
  changeRewardMode,
} from "@/modules/agents/application/rewards";
import {
  authenticateRuntimeRequest,
  type RuntimePrincipal,
} from "@/modules/agents/application/runtime-auth";
import { unsealRuntimeCredential } from "@/modules/agents/domain/runtime-credential-enrollment";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { agentPersonaTemplates } from "@/modules/agents/personas/templates";
import { validatePersonaCandidate } from "@/modules/agents/domain/persona-validation";
import { sha256 } from "@/lib/security/crypto";
import {
  closeIntegrationDatabase,
  integrationDatabase as db,
  resetIntegrationDatabase,
} from "./database";

// Kontrollü tarihi kayıtlar; doğal haftalar veya canlı kalite değerlendirmesi değildir.
const now = new Date("2026-10-04T20:59:00.000Z");
async function fixture() {
  const persona = agentPersonaTemplates[0]!;
  const user = async (username: string, kind: "HUMAN" | "AGENT", role: "ADMIN" | "USER") =>
    db.user.create({
      data: {
        username,
        usernameNormalized: username,
        displayName: username,
        email: `${username}@integration.test`,
        emailNormalized: `${username}@integration.test`,
        passwordHash: "not-used",
        kind,
        role,
        loginDisabled: kind === "AGENT",
        status: "ACTIVE",
        termsVersion: "1",
        termsAcceptedAt: now,
      },
    });
  const admin = await user("birth_admin", "HUMAN", "ADMIN");
  const writer = await user(persona.username, "AGENT", "USER");
  const actor: ActorContext = {
    actorId: admin.id,
    actorKind: "HUMAN",
    actorRole: "ADMIN",
    origin: "API",
    requestId: randomUUID(),
  };
  const profile = await db.agentProfile.create({
    data: {
      userId: writer.id,
      lifecycleStatus: "ACTIVE",
      activeTimeProfile: {},
      createdById: admin.id,
      updatedById: admin.id,
    },
  });
  const validated = validatePersonaCandidate(persona, [], "Yerel doğum politikası testi.");
  const version = await db.agentPersonaVersion.create({
    data: {
      agentProfileId: profile.id,
      version: 1,
      persona,
      renderedPrompt: validated.renderedPrompt,
      changeOrigin: "INITIAL",
      changeSummary: "Yerel doğum testi",
      createdById: admin.id,
      validationReport: validated.report,
    },
  });
  await db.agentProfile.update({
    where: { id: profile.id },
    data: { currentPersonaVersionId: version.id },
  });
  const credential = await db.agentCredential.create({
    data: {
      agentProfileId: profile.id,
      tokenHash: sha256(randomUUID()),
      prefix: "test",
      scopes: ["runtime:plan"],
    },
  });
  const principal: RuntimePrincipal = {
    credentialId: credential.id,
    agentProfileId: profile.id,
    lifecycleStatus: "ACTIVE",
    actor: {
      actorId: writer.id,
      actorKind: "AGENT",
      actorRole: "USER",
      origin: "AGENT",
      requestId: randomUUID(),
    },
  };
  const run = await db.agentRun.create({
    data: {
      agentProfileId: profile.id,
      personaVersionId: version.id,
      runType: "NORMAL_WAKE",
      runStatus: "SUCCEEDED",
      queuePriority: "MANUAL_SINGLE",
      trigger: "TEST",
      idempotencyKey: randomUUID(),
      timeoutSeconds: 600,
      desiredEntryMin: 0,
      desiredEntryMax: 1,
    },
  });
  await changeRewardMode(db, actor, {
    mode: "SHADOW",
    expectedMode: "OFF",
    reason: "Yerel bağımsız kalite kanıtı.",
  });
  const entries: Array<{ entryId: string; assessmentId: string; sourceAt: Date }> = [];
  const assess = async (
    entryId: string,
    at: Date,
    verdict: "SUPPORTED" | "INSUFFICIENT" = "SUPPORTED",
  ) => {
    const packet = await issueAuthorAssessmentPacket(
      db,
      actor,
      { agentProfileId: profile.id, entryId },
      at,
    );
    return submitAuthorAssessment(
      db,
      actor,
      {
        packetId: packet.packetId,
        nonce: packet.nonce,
        packageHash: packet.packageHash,
        verdict,
        independentReviewConfirmed: true,
        reviewerModel: "independent-test-reviewer",
        reason: "Kontrollü yerel kalite kanıtı.",
      },
      at,
    );
  };
  for (const [i, time] of [
    "2026-09-27T12:00:00Z",
    "2026-09-30T12:00:00Z",
    "2026-10-03T12:00:00Z",
  ].entries()) {
    const sourceAt = new Date(time);
    const topic = await db.topic.create({
      data: {
        title: `Doğum kanıtı ${i}`,
        normalizedTitle: `dogum kaniti ${i}`,
        slug: `dogum-kaniti-${i}`,
        createdById: writer.id,
      },
    });
    const body = `Kontrollü bağımsız katkı ${i}; farklı bir gözlemi temellendirir.`;
    const entry = await db.entry.create({
      data: {
        topicId: topic.id,
        authorId: writer.id,
        body,
        normalizedBody: body,
        origin: "AGENT",
        createdAt: sourceAt,
        updatedAt: sourceAt,
      },
    });
    const action = await db.agentAction.create({
      data: {
        runId: run.id,
        agentProfileId: profile.id,
        sequence: i + 1,
        actionType: "CREATE_ENTRY",
        actionStatus: "SUCCEEDED",
        input: {},
        result: { entryId: entry.id },
        createdAt: sourceAt,
      },
    });
    await db.agentContentRecord.create({
      data: { entryId: entry.id, agentProfileId: profile.id, runId: run.id, actionId: action.id },
    });
    const assessment = await assess(entry.id, new Date(sourceAt.getTime() + 60000));
    expect(assessment.applied).toBe(false);
    entries.push({ entryId: entry.id, assessmentId: assessment.assessmentId, sourceAt });
  }
  const mode = async (value: "OFF" | "CANDIDATES", at = now) => {
    const settings = await db.agentGlobalSettings.findUniqueOrThrow({ where: { id: "global" } });
    return changeBirthMode(
      db,
      actor,
      { mode: value, expectedSettingsVersion: settings.settingsVersion },
      at,
    );
  };
  const tick = (at = now) => runRuntimeBirthTick(db, principal, { workerId: "birth-worker" }, at);
  const create = async () => {
    await mode("CANDIDATES");
    const result = await tick();
    expect(result).toMatchObject({ outcome: "PROPOSED" });
    if (!("candidateId" in result) || !result.candidateId)
      throw new Error("EXPECTED_BIRTH_CANDIDATE");
    return db.agentBirthCandidate.findUniqueOrThrow({ where: { id: result.candidateId } });
  };
  return {
    admin,
    actor,
    writer,
    profile,
    version,
    credential,
    principal,
    entries,
    assess,
    mode,
    tick,
    create,
    user,
  };
}

beforeEach(resetIntegrationDatabase);
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
afterAll(closeIntegrationDatabase);
describe("private birth candidates with PostgreSQL", () => {
  it("defaults off; one private candidate creates no account, source, entry, run or credential", async () => {
    const f = await fixture();
    expect(await f.tick()).toEqual({ outcome: "OFF", candidateId: null });
    const counts = async () =>
      Promise.all([
        db.user.count(),
        db.agentProfile.count(),
        db.agentCredential.count(),
        db.entry.count(),
        db.agentRun.count(),
        db.agentSource.count(),
      ]);
    const before = await counts();
    expect(await inspectBirthCandidate(db, f.actor, {}, now)).toBeNull();
    const candidate = await f.create();
    expect(await inspectBirthCandidate(db, f.actor, {}, now)).toMatchObject({
      id: candidate.id,
      status: "PROPOSED",
    });
    expect(candidate).toMatchObject({
      parentProfileId: f.profile.id,
      parentPersonaVersionId: f.version.id,
      policyVersion: 1,
      status: "PROPOSED",
      version: 1,
    });
    expect(candidate.expiresAt.getTime() - candidate.createdAt.getTime()).toBe(7 * 86400000);
    expect(await counts()).toEqual(before);
    expect(await f.tick()).toEqual({ outcome: "NOT_DUE", candidateId: null });
    expect(await db.agentBirthCandidate.count()).toBe(1);
    expect(await db.auditLog.count({ where: { action: "agent.birth.proposed" } })).toBe(1);
    expect(await db.agentRewardAssessment.count({ where: { applied: true } })).toBe(0);
  });
  it("serializes concurrent scans without duplicate candidates or duplicate seven-day credit", async () => {
    const f = await fixture();
    await f.mode("CANDIDATES");
    const preselection = vi.spyOn(birthEvidence, "currentBirthParentEvidence");
    try {
      const results = await Promise.all([f.tick(), f.tick()]);
      expect(
        results.filter((result) => "outcome" in result && result.outcome === "PROPOSED"),
      ).toHaveLength(1);
      // Tek ön seçim + kilitli son doğrulama; ikinci worker geçmişi yeniden taramaz.
      expect(preselection).toHaveBeenCalledTimes(2);
    } finally {
      preselection.mockRestore();
    }
    expect(await db.agentBirthCandidate.count()).toBe(1);
    expect(await db.agentGlobalSettings.findUnique({ where: { id: "global" } })).toMatchObject({
      lastBirthCandidateAt: now,
      lastBirthScanAt: now,
    });
  });
  it("bounds daily evidence work and records an overflowing parent pool", async () => {
    const f = await fixture();
    await f.mode("CANDIDATES");
    // 41 kimlikli kontrollü havuz; gerçek transaction/audit, maliyet sınırı için sahte kanıt okuyucu.
    const pool = vi
      .spyOn(birthRecords, "listBirthParentIds")
      .mockResolvedValue(Array.from({ length: 41 }, () => ({ id: randomUUID() })));
    const evidence = vi.spyOn(birthEvidence, "currentBirthParentEvidence").mockResolvedValue(null);
    try {
      expect(await f.tick()).toEqual({ outcome: "NO_ELIGIBLE_PARENT", candidateId: null });
      expect(evidence).toHaveBeenCalledTimes(8);
      const audit = await db.auditLog.findFirstOrThrow({ where: { action: "agent.birth.scan" } });
      expect(audit.metadata).toMatchObject({ parentPoolTruncated: true, parentPoolLimit: 40 });
      expect(await f.tick()).toEqual({ outcome: "NOT_DUE", candidateId: null });
      expect(evidence).toHaveBeenCalledTimes(8);
    } finally {
      evidence.mockRestore();
      pool.mockRestore();
    }
  });
  it("protects immutable snapshots and never reopens a closed candidate", async () => {
    const f = await fixture();
    const candidate = await f.create();
    await expect(
      db.agentBirthCandidate.update({ where: { id: candidate.id }, data: { persona: {} } }),
    ).rejects.toThrow(/AGENT_BIRTH_CANDIDATE_IMMUTABLE/u);
    await expect(db.agentBirthCandidate.delete({ where: { id: candidate.id } })).rejects.toThrow(
      /AGENT_BIRTH_CANDIDATE_IMMUTABLE/u,
    );
    await expect(db.$executeRaw`TRUNCATE "agent_birth_candidates"`).rejects.toThrow(
      /AGENT_BIRTH_CANDIDATE_IMMUTABLE/u,
    );
    expect(await db.agentBirthCandidate.count()).toBe(1);
    await rejectBirthCandidate(db, f.actor, { candidateId: candidate.id, expectedVersion: 1 }, now);
    await expect(
      db.agentBirthCandidate.update({
        where: { id: candidate.id },
        data: { status: "PROPOSED", version: 3, closedAt: null, closureReason: null },
      }),
    ).rejects.toThrow(/AGENT_BIRTH_CANDIDATE_IMMUTABLE/u);
  });
  it("withdraws on reversal and preserves the snapshot instead of replacing its evidence", async () => {
    const f = await fixture();
    const candidate = await f.create();
    await reverseAuthorAssessment(
      db,
      f.actor,
      {
        assessmentId: f.entries[0]!.assessmentId,
        reason: "Bağımsız karar yerel testte geri alındı.",
      },
      now,
    );
    const inspected = await inspectBirthCandidate(db, f.actor, { candidateId: candidate.id }, now);
    expect(inspected).toMatchObject({
      status: "WITHDRAWN",
      closureReason: "EVIDENCE_WITHDRAWN",
      version: 2,
      snapshotHash: candidate.snapshotHash,
      evidence: candidate.evidence,
    });
  });
  it.each(["body", "hidden"] as const)(
    "withdraws when a publication becomes %s-invalid",
    async (change) => {
      const f = await fixture();
      const candidate = await f.create();
      await db.entry.update({
        where: { id: f.entries[0]!.entryId },
        data:
          change === "body"
            ? { body: "Sonradan değişmiş farklı yazı." }
            : { status: "HIDDEN", hiddenAt: now },
      });
      expect(
        await inspectBirthCandidate(db, f.actor, { candidateId: candidate.id }, now),
      ).toMatchObject({ status: "WITHDRAWN", closureReason: "EVIDENCE_WITHDRAWN" });
    },
  );
  it("does not refund the rolling window across Sunday/Monday or OFF/ON changes", async () => {
    const f = await fixture();
    await f.create();
    const monday = new Date("2026-10-04T21:01:00Z");
    await f.mode("OFF", monday);
    await f.mode("CANDIDATES", monday);
    expect(await f.tick(monday)).toEqual({ outcome: "SEVEN_DAY_LIMIT", candidateId: null });
    expect(await db.agentBirthCandidate.count()).toBe(1);
    expect(await db.agentGlobalSettings.findUnique({ where: { id: "global" } })).toMatchObject({
      lastBirthCandidateAt: now,
      lastBirthScanAt: monday,
    });
  });
  it("consumes only the daily attempt for an insufficient parent and never falls back to older approval", async () => {
    const f = await fixture();
    await f.assess(f.entries[2]!.entryId, now, "INSUFFICIENT");
    await f.mode("CANDIDATES");
    expect(await f.tick()).toEqual({ outcome: "NO_ELIGIBLE_PARENT", candidateId: null });
    expect(await db.agentGlobalSettings.findUnique({ where: { id: "global" } })).toMatchObject({
      lastBirthCandidateAt: null,
      lastBirthScanAt: now,
    });
    expect(await f.tick()).toEqual({ outcome: "NOT_DUE", candidateId: null });
  });
  it("does not fall back behind a future-dated QUALITY decision in the actual repository", async () => {
    const f = await fixture();
    await f.assess(f.entries[2]!.entryId, new Date(now.getTime() + 86400000), "INSUFFICIENT");
    await f.mode("CANDIDATES");
    expect(await f.tick()).toEqual({ outcome: "NO_ELIGIBLE_PARENT", candidateId: null });
    expect(await db.agentBirthCandidate.count()).toBe(0);
  });
  it.each(["scope", "account", "profile"])(
    "rechecks the runtime %s before any candidate write",
    async (change) => {
      const f = await fixture();
      await f.mode("CANDIDATES");
      if (change === "scope")
        await db.agentCredential.update({
          where: { id: f.credential.id },
          data: { scopes: ["runtime:read"] },
        });
      if (change === "account")
        await db.user.update({ where: { id: f.writer.id }, data: { status: "SUSPENDED" } });
      if (change === "profile")
        await db.agentProfile.update({
          where: { id: f.profile.id },
          data: { lifecycleStatus: "SUSPENDED" },
        });
      await expect(f.tick()).rejects.toMatchObject({
        code: change === "account" ? "AUTH_REQUIRED" : "FORBIDDEN",
      });
      expect(await db.agentBirthCandidate.count()).toBe(0);
      expect(await db.agentGlobalSettings.findUnique({ where: { id: "global" } })).toMatchObject({
        lastBirthScanAt: null,
        lastBirthCandidateAt: null,
      });
    },
  );
  it("refuses to reuse names already held by accounts, without inventing another draft", async () => {
    const f = await fixture();
    await f.user("ayniyerde", "HUMAN", "USER");
    await f.user("tersolcek", "HUMAN", "USER");
    await f.mode("CANDIDATES");
    expect(await f.tick()).toEqual({ outcome: "NO_DRAFT_AVAILABLE", candidateId: null });
    expect(await db.agentBirthCandidate.count()).toBe(0);
  });
  it("refreshes inspection on idempotent HTTP replay and rechecks the admin session", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    try {
      const f = await fixture();
      const candidate = await f.create();
      const sessionToken = createOpaqueToken();
      const csrfToken = createOpaqueToken();
      const key = randomUUID();
      await db.session.create({
        data: {
          userId: f.admin.id,
          tokenHash: sha256(sessionToken),
          csrfTokenHash: sha256(csrfToken),
          expiresAt: new Date(now.getTime() + 3600000),
        },
      });
      const origin = new URL(getEnvironment().APP_URL).origin;
      const request = () =>
        new NextRequest(`${origin}/api/v1/admin/agent-births/inspect`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            "x-csrf-token": csrfToken,
            "idempotency-key": key,
            cookie: `${SESSION_COOKIE_NAME}=${sessionToken}; ${CSRF_COOKIE_NAME}=${csrfToken}`,
          },
          body: JSON.stringify({ candidateId: candidate.id }),
        });
      const crossOrigin = request();
      crossOrigin.headers.set("origin", "https://untrusted.invalid");
      expect((await inspectRoute(crossOrigin)).status).toBe(403);
      const first = await inspectRoute(request());
      expect(first.status).toBe(200);
      expect((await first.json()).data.status).toBe("PROPOSED");
      await reverseAuthorAssessment(
        db,
        f.actor,
        { assessmentId: f.entries[0]!.assessmentId, reason: "HTTP tekrarından önce geri alındı." },
        now,
      );
      const replay = await inspectRoute(request());
      expect(replay.status).toBe(200);
      expect(replay.headers.get("Idempotent-Replay")).toBe("true");
      expect((await replay.json()).data.status).toBe("WITHDRAWN");
      await db.user.update({ where: { id: f.admin.id }, data: { status: "SUSPENDED" } });
      const rejected = await inspectRoute(request());
      expect(rejected.status).toBe(403);
      expect(await rejected.json()).not.toHaveProperty("data");
    } finally {
      vi.useRealTimers();
    }
  });
  it("signals a separate birth scan even while the normal wake queue is busy", async () => {
    const f = await fixture();
    await db.agentRun.create({
      data: {
        agentProfileId: f.profile.id,
        personaVersionId: f.version.id,
        runType: "NORMAL_WAKE",
        runStatus: "QUEUED",
        queuePriority: "MANUAL_SINGLE",
        trigger: "TEST",
        idempotencyKey: randomUUID(),
        timeoutSeconds: 600,
        desiredEntryMin: 0,
        desiredEntryMax: 1,
      },
    });
    const off = await runRuntimeStochasticTick(db, f.principal, { workerId: "birth-worker" }, now);
    expect(off).not.toHaveProperty("birthScanDue");
    await f.mode("CANDIDATES");
    expect(
      await runRuntimeStochasticTick(db, f.principal, { workerId: "birth-worker" }, now),
    ).toMatchObject({ createdRuns: 0, skipReason: "QUEUE_NOT_EMPTY", birthScanDue: true });
    expect(await db.agentBirthCandidate.count()).toBe(0);
    expect(await f.tick()).toMatchObject({ outcome: "PROPOSED" });
    expect(
      await runRuntimeStochasticTick(db, f.principal, { workerId: "birth-worker" }, now),
    ).not.toHaveProperty("birthScanDue");
    expect(await db.agentRun.count({ where: { runStatus: "QUEUED" } })).toBe(1);
  });
  it("preserves candidate policy history while cleared assessment evidence withdraws a pending candidate", async () => {
    const f = await fixture();
    const candidate = await f.create();
    // Yalnız bu yerel fixture'ın türev kanıt tabloları; great-reset komutu çalıştırılmaz.
    await db.$executeRaw`TRUNCATE TABLE "agent_reward_reversals", "agent_reward_assessments", "agent_assessment_packets" RESTRICT`;
    expect(await db.agentBirthCandidate.count()).toBe(1);
    expect(
      await inspectBirthCandidate(db, f.actor, { candidateId: candidate.id }, now),
    ).toMatchObject({
      status: "WITHDRAWN",
      closureReason: "EVIDENCE_WITHDRAWN",
      evidence: candidate.evidence,
    });
  });
  it("accepts an enrolled paused scheduler while requiring a different ACTIVE parent", async () => {
    const f = await fixture();
    await f.mode("CANDIDATES");
    const planner = await f.user("paused_planner", "AGENT", "USER");
    const profile = await db.agentProfile.create({
      data: {
        userId: planner.id,
        lifecycleStatus: "PAUSED",
        activeTimeProfile: {},
        createdById: f.admin.id,
        updatedById: f.admin.id,
      },
    });
    const credential = await db.agentCredential.create({
      data: {
        agentProfileId: profile.id,
        tokenHash: sha256(randomUUID()),
        prefix: "test",
        scopes: ["runtime:plan"],
      },
    });
    const principal: RuntimePrincipal = {
      credentialId: credential.id,
      agentProfileId: profile.id,
      lifecycleStatus: "PAUSED",
      actor: {
        actorId: planner.id,
        actorKind: "AGENT",
        actorRole: "USER",
        origin: "AGENT",
        requestId: randomUUID(),
      },
    };
    expect(
      await runRuntimeBirthTick(db, principal, { workerId: "paused-planner-worker" }, now),
    ).toMatchObject({ outcome: "PROPOSED" });
    expect(await db.agentBirthCandidate.findFirst()).toMatchObject({
      parentProfileId: f.profile.id,
    });
  });
  it("expires a private candidate after seven actual days", async () => {
    const f = await fixture();
    const candidate = await f.create();
    expect(
      await inspectBirthCandidate(db, f.actor, { candidateId: candidate.id }, candidate.expiresAt),
    ).toMatchObject({ status: "EXPIRED", closureReason: "EXPIRED", evidence: candidate.evidence });
  });
  it("rechecks runtime credential and administrator authority plus exact settings version", async () => {
    const f = await fixture();
    await f.mode("CANDIDATES");
    await db.agentCredential.update({ where: { id: f.credential.id }, data: { revokedAt: now } });
    await expect(f.tick()).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    await expect(
      changeBirthMode(db, f.principal.actor, { mode: "OFF", expectedSettingsVersion: 1 }, now),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      changeBirthMode(db, f.actor, { mode: "OFF", expectedSettingsVersion: 1 }, now),
    ).rejects.toMatchObject({ code: "AGENT_BIRTH_CONFLICT" });
    expect(await db.agentBirthCandidate.count()).toBe(0);
  });
});

async function preparationFixture(method = "TEMPLATE") {
  const f = await fixture();
  const candidate = await f.create();
  // Kontrollü köken geçmişi; üretim bağımsızlığı veya tarihsel backfill iddiası değildir.
  const createdAt = f.profile.createdAt;
  await db.auditLog.create({
    data: {
      actorId: f.admin.id,
      requestId: randomUUID(),
      action: "agent.created",
      entityType: "AgentProfile",
      entityId: f.profile.id,
      metadata: { method, lifecycleStatus: "PAUSED", personaVersion: 1 },
      createdAt,
    },
  });
  await db.agentRuntimeEvent.create({
    data: {
      agentProfileId: f.profile.id,
      eventType: "LIFE_GENESIS_SNAPSHOT",
      safeMessage: "Yerel köken fixture'ı",
      metadata: { origin: "AGENT_CREATION", method, boundary: true },
      createdAt,
      occurredAt: createdAt,
    },
  });
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  vi.stubEnv(
    "AGENT_RUNTIME_ENROLLMENT_PUBLIC_KEY_B64",
    publicKey.export({ format: "der", type: "spki" }).toString("base64"),
  );
  const settings = await db.agentGlobalSettings.findUniqueOrThrow({ where: { id: "global" } });
  const input = {
    candidateId: candidate.id,
    expectedVersion: candidate.version,
    expectedSnapshotHash: candidate.snapshotHash,
    expectedSettingsVersion: settings.settingsVersion,
  };
  return {
    ...f,
    candidate,
    input,
    privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }),
    prepare: (at = now) => prepareBirthCandidate(db, f.actor, input, at),
  };
}

describe("birth account preparation with PostgreSQL", () => {
  it("creates exactly one PAUSED independent account without exposing a credential or copying memory", async () => {
    const f = await preparationFixture();
    const before = await db.user.count();
    const result = await f.prepare();
    expect(Object.keys(result).sort()).toEqual([
      "candidateId",
      "candidateVersion",
      "childProfileId",
      "preparationExpiresAt",
      "status",
    ]);
    expect(result.status).toBe("PREPARED");
    expect(result.candidateVersion).toBe(2);
    const child = await db.agentProfile.findUniqueOrThrow({
      where: { id: result.childProfileId },
      include: { user: true, currentPersonaVersion: true, credentials: true, sources: true },
    });
    expect(child.lifecycleStatus).toBe("PAUSED");
    expect(child.user).toMatchObject({
      kind: "AGENT",
      role: "USER",
      status: "ACTIVE",
      loginDisabled: true,
    });
    expect(child.currentPersonaVersion?.persona).toEqual(f.candidate.persona);
    expect(child.credentials).toHaveLength(1);
    expect(child.credentials[0]!.runtimeEnrollmentCipher).toBeTruthy();
    expect(child.sources).toHaveLength(12);
    expect(child.sources.every((source) => source.status === "SEED" && !source.adminPinned)).toBe(
      true,
    );
    expect(await db.user.count()).toBe(before + 1);
    expect(await db.agentMemoryEpisode.count({ where: { agentProfileId: child.id } })).toBe(0);
    expect(await db.agentBelief.count({ where: { agentProfileId: child.id } })).toBe(0);
    expect(await db.agentPurpose.count({ where: { agentProfileId: child.id } })).toBe(0);
    const prepared = await db.agentBirthCandidate.findUniqueOrThrow({
      where: { id: f.candidate.id },
    });
    expect(prepared).toMatchObject({
      status: "PREPARED",
      childProfileId: child.id,
      rootProfileId: f.profile.id,
      persona: f.candidate.persona,
      evidence: f.candidate.evidence,
      snapshotHash: f.candidate.snapshotHash,
    });
    expect(prepared.preparationExpiresAt!.getTime() - prepared.preparedAt!.getTime()).toBe(
      14 * 86400000,
    );
    expect(await inspectBirthCandidate(db, f.actor, {}, now)).toMatchObject({
      id: prepared.id,
      status: "PREPARED",
    });
    await expect(
      changeAgentLifecycle(
        db,
        f.actor,
        child.id,
        { status: "ACTIVE", reason: "Kapıyı atlama denemesi." },
        now,
      ),
    ).rejects.toMatchObject({ code: "AGENT_BIRTH_ACTIVATION_REQUIRED" });
    expect(await f.tick(new Date(now.getTime() + 86400000))).toMatchObject({
      outcome: "FIRST_PILOT_ALREADY_PREPARED",
    });
    expect(await db.agentBirthCandidate.count()).toBe(1);
    expect(await db.auditLog.count({ where: { action: "agent.birth.prepared" } })).toBe(1);
    await expect(
      db.agentBirthCandidate.update({
        where: { id: prepared.id },
        data: { preparationExpiresAt: new Date(now.getTime() + 20 * 86400000) },
      }),
    ).rejects.toThrow("AGENT_BIRTH_CANDIDATE_IMMUTABLE");
    await expect(
      db.agentBirthCandidate.update({
        where: { id: prepared.id },
        data: { preparationEvidence: { replaced: true } },
      }),
    ).rejects.toThrow("AGENT_BIRTH_CANDIDATE_IMMUTABLE");
  });
  it("serializes two preparations into one account and one immutable receipt", async () => {
    const f = await preparationFixture();
    const results = await Promise.allSettled([f.prepare(), f.prepare()]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toMatchObject([
      {
        status: "rejected",
        reason: { code: "AGENT_BIRTH_PREPARATION_BLOCKED", details: { reason: "STALE_PREVIEW" } },
      },
    ]);
    expect(await db.agentProfile.count()).toBe(2);
    expect(await db.agentCredential.count()).toBe(2);
    expect(await db.auditLog.count({ where: { action: "agent.birth.prepared" } })).toBe(1);
  });
  it("rolls back the complete new identity when managed enrollment is unavailable", async () => {
    const f = await preparationFixture();
    vi.stubEnv("AGENT_RUNTIME_ENROLLMENT_PUBLIC_KEY_B64", "");
    const users = await db.user.count();
    await expect(f.prepare()).rejects.toMatchObject({ code: "AGENT_BIRTH_PREPARATION_BLOCKED" });
    expect(await db.user.count()).toBe(users);
    expect(await db.agentProfile.count()).toBe(1);
    expect(await db.agentCredential.count()).toBe(1);
    expect(await db.agentSource.count()).toBe(0);
    expect(
      await db.agentBirthCandidate.findUnique({ where: { id: f.candidate.id } }),
    ).toMatchObject({ status: "PROPOSED", childProfileId: null });
  });
  it("enforces holder capacity after creation and rolls back its audit, credential and sources", async () => {
    const f = await preparationFixture();
    const persona = f.candidate.persona as { sources: Array<{ url: string }> };
    const url = persona.sources[0]!.url;
    for (let i = 0; i < 5; i++) {
      const holder = await f.user(`holder_${i}`, "AGENT", "USER");
      const profile = await db.agentProfile.create({
        data: {
          userId: holder.id,
          activeTimeProfile: {},
          createdById: f.admin.id,
          updatedById: f.admin.id,
        },
      });
      await db.agentSource.create({
        data: {
          agentProfileId: profile.id,
          url,
          normalizedDomain: new URL(url).hostname,
          sourceType: "HTML",
          topics: ["culture"],
          status: "SEED",
          trustScore: 0.5,
          interestScore: 0.5,
          noveltyScore: 0.5,
          usefulnessScore: 0.5,
          addedByOrigin: "INITIAL_PERSONA",
        },
      });
    }
    const counts = async () =>
      Promise.all([
        db.user.count(),
        db.agentProfile.count(),
        db.agentCredential.count(),
        db.agentSource.count(),
        db.auditLog.count(),
        db.agentRuntimeEvent.count(),
      ]);
    const before = await counts();
    await expect(f.prepare()).rejects.toMatchObject({ code: "AGENT_BIRTH_PREPARATION_BLOCKED" });
    expect(await counts()).toEqual(before);
    expect(
      await db.agentBirthCandidate.findUnique({ where: { id: f.candidate.id } }),
    ).toMatchObject({ status: "PROPOSED" });
  });
  it.each(["CUSTOM", "IMPORT", "CLONE"])(
    "refuses %s origin even when its initial persona matches a template",
    async (method) => {
      const f = await preparationFixture(method);
      await expect(f.prepare()).rejects.toMatchObject({ code: "AGENT_BIRTH_PREPARATION_BLOCKED" });
      expect(await db.agentProfile.count()).toBe(1);
    },
  );
  it.each(["version", "snapshot", "settings", "expired", "reversed", "mode", "admin"])(
    "rechecks %s before creating an account",
    async (kind) => {
      const f = await preparationFixture();
      if (kind === "version") f.input.expectedVersion++;
      if (kind === "snapshot") f.input.expectedSnapshotHash = "0".repeat(64);
      if (kind === "settings") f.input.expectedSettingsVersion++;
      if (kind === "mode") await f.mode("OFF");
      if (kind === "admin")
        await db.user.update({ where: { id: f.admin.id }, data: { status: "SUSPENDED" } });
      if (kind === "reversed")
        await reverseAuthorAssessment(
          db,
          f.actor,
          {
            assessmentId: f.entries[0]!.assessmentId,
            reason: "Hazırlık öncesi kanıt geri alındı.",
          },
          now,
        );
      await expect(
        f.prepare(kind === "expired" ? f.candidate.expiresAt : now),
      ).rejects.toBeDefined();
      expect(await db.agentProfile.count()).toBe(1);
      expect(await db.agentCredential.count()).toBe(1);
      expect(
        await db.agentBirthCandidate.findUnique({ where: { id: f.candidate.id } }),
      ).toMatchObject({ childProfileId: null });
    },
  );
});

describe("prepared writer HTTP and source collection boundaries", () => {
  it("replays preparation without another identity and rechecks the admin session and CSRF", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    try {
      const f = await preparationFixture();
      const sessionToken = createOpaqueToken();
      const csrfToken = createOpaqueToken();
      const key = randomUUID();
      await db.session.create({
        data: {
          userId: f.admin.id,
          tokenHash: sha256(sessionToken),
          csrfTokenHash: sha256(csrfToken),
          expiresAt: new Date(now.getTime() + 3600000),
        },
      });
      const origin = new URL(getEnvironment().APP_URL).origin;
      const request = () =>
        new NextRequest(`${origin}/api/v1/admin/agent-births/prepare`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            "x-csrf-token": csrfToken,
            "idempotency-key": key,
            cookie: `${SESSION_COOKIE_NAME}=${sessionToken}; ${CSRF_COOKIE_NAME}=${csrfToken}`,
          },
          body: JSON.stringify(f.input),
        });
      const missingCsrf = request();
      missingCsrf.headers.delete("x-csrf-token");
      expect((await prepareRoute(missingCsrf)).status).toBe(403);
      const first = await prepareRoute(request());
      expect(first.status).toBe(200);
      const firstBody = await first.json();
      expect(firstBody.data.status).toBe("PREPARED");
      const replay = await prepareRoute(request());
      expect(replay.status).toBe(200);
      expect(replay.headers.get("Idempotent-Replay")).toBe("true");
      expect((await replay.json()).data).toEqual(firstBody.data);
      expect(await db.agentProfile.count()).toBe(2);
      await db.user.update({ where: { id: f.admin.id }, data: { status: "SUSPENDED" } });
      expect((await prepareRoute(request())).status).toBe(403);
    } finally {
      vi.useRealTimers();
    }
  });
  it.each(["SUCCESS", "ATTACK"])(
    "authenticates and completes PAUSED SOURCE_REFRESH with %s boundaries",
    async (scenario) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(now);
      const f = await preparationFixture();
      const prepared = await f.prepare();
      const child = await db.agentProfile.findUniqueOrThrow({
        where: { id: prepared.childProfileId },
        include: { credentials: true },
      });
      const credential = child.credentials[0]!;
      const raw = unsealRuntimeCredential(credential.runtimeEnrollmentCipher!, {
        agentProfileId: child.id,
        credentialId: credential.id,
        privateKeyPem: f.privateKeyPem,
      });
      const principal = await authenticateRuntimeRequest(db, {
        authorization: `Bearer ${raw}`,
        hasBrowserSession: false,
        requiredScope: "runtime:write",
        requestId: randomUUID(),
      });
      expect(principal).toMatchObject({ agentProfileId: child.id, lifecycleStatus: "PAUSED" });
      const roster = await getRuntimeCredentialRoster(db, principal, "birth-source-worker", now);
      await acknowledgeRuntimeCredentialRoster(
        db,
        principal,
        {
          workerId: "birth-source-worker",
          desiredFingerprint: roster.desiredFingerprint,
          loadedCredentialIds: roster.entries.map((entry) => entry.credentialId),
        },
        now,
      );
      for (const runType of [
        "NORMAL_WAKE",
        "ENTRY_BURST",
        "REFLECTION",
        "DRY_RUN",
        "READ_ONLY",
      ] as const)
        await expect(
          createManualAgentRun(db, f.actor, child.id, manualAgentRunSchema.parse({ runType }), now),
        ).rejects.toMatchObject({ code: "AGENT_LIFECYCLE_INVALID" });
      await expect(
        createManualAgentRun(
          db,
          f.actor,
          child.id,
          manualAgentRunSchema.parse({ runType: "SOURCE_REFRESH", allowSourceReading: false }),
          now,
        ),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 422 });
      const sourceRun = await createManualAgentRun(
        db,
        f.actor,
        child.id,
        manualAgentRunSchema.parse({ runType: "SOURCE_REFRESH", allowSourceReading: true }),
        now,
      );
      expect(sourceRun).toMatchObject({
        runType: "SOURCE_REFRESH",
        trigger: "ADMIN_BIRTH_SOURCE",
        allowTopicCreation: false,
        allowVoting: false,
        allowFollowing: false,
        allowSourceReading: true,
      });
      // Veritabanına kontrollü yanlış iş eklenir: lease seçim kapısı bunu atlamalıdır.
      const publicRun = await db.agentRun.create({
        data: {
          agentProfileId: child.id,
          personaVersionId: child.currentPersonaVersionId!,
          runType: "NORMAL_WAKE",
          trigger: "ADMIN_MANUAL",
          runStatus: "QUEUED",
          queuePriority: "EMERGENCY_ADMIN",
          idempotencyKey: randomUUID(),
          timeoutSeconds: 600,
          desiredEntryMin: 0,
          desiredEntryMax: 1,
          availableAt: now,
        },
      });
      await db.agentGlobalSettings.update({
        where: { id: "global" },
        data: { runtimeEnabled: true, schedulerEnabled: true },
      });
      const lease = await leaseRuntimeRun(
        db,
        principal,
        { workerId: "birth-source-worker", leaseSeconds: 60 },
        { now, checkReadiness: async () => {} },
      );
      expect(lease.run).toMatchObject({ id: sourceRun.id, runType: "SOURCE_REFRESH" });
      expect(await db.agentRun.findUnique({ where: { id: publicRun.id } })).toMatchObject({
        runStatus: "QUEUED",
      });
      expect(
        await db.agentRun.count({ where: { agentProfileId: child.id, runType: "REFLECTION" } }),
      ).toBe(0);
      expect(await db.agentProfile.findUnique({ where: { id: child.id } })).toMatchObject({
        lifecycleStatus: "PAUSED",
      });
      const context = await getRuntimeRunContext(
        db,
        principal,
        sourceRun.id,
        "birth-source-worker",
        lease.run!.leaseToken,
      );
      expect(context.run.runType).toBe("SOURCE_REFRESH");
      const source = await db.agentSource.findFirstOrThrow({ where: { agentProfileId: child.id } });
      const attempt = {
        workerId: "birth-source-worker",
        leaseToken: lease.run!.leaseToken,
        sourceId: source.id,
        attemptId: randomUUID(),
      };
      await recordRuntimeSourceAttempt(db, principal, sourceRun.id, attempt);
      const safeText = "Kaynak hazırlığının PostgreSQL veri yolunu doğrulayan kontrollü metin.";
      await recordRuntimeSourceResult(db, principal, sourceRun.id, {
        ...attempt,
        items: [
          {
            canonicalUrl: new URL("/p8-test-item", source.url).href,
            title: "Kontrollü kaynak öğesi",
            contentHash: sha256(safeText),
            safeText,
          },
        ],
      });
      expect(
        await db.agentSourceItem.count({ where: { sourceId: source.id, fetchedAt: now } }),
      ).toBe(1);
      expect(await db.entry.count({ where: { authorId: child.userId } })).toBe(0);
      const owned = { workerId: "birth-source-worker", leaseToken: lease.run!.leaseToken };
      const completion = runtimeCompleteSchema.parse({
        ...owned,
        outcome: "SUCCEEDED",
        state: { curiosity: 0.5, confidence: 0.6, topicFatigue: {} },
        safeRunSummary: {
          operationSummary: "Kontrollü kaynak hazırlığı tamamlandı.",
          observedItemIds: [],
          proposedActionCount: 1,
          completedActionCount: 1,
          rejectedActionCount: 0,
          shortRationale: "Yalnız kaynak okundu.",
        },
        usageMetadata: { durationMs: 1, provider: "codex-cli" },
        performanceMetrics: {},
      });
      if (scenario === "ATTACK") {
        const memoriesBefore = await db.agentMemoryEpisode.count({
          where: { agentProfileId: child.id },
        });
        await expect(
          recordRuntimeMemories(db, principal, sourceRun.id, {
            ...owned,
            memories: [
              {
                sourceMemoryIds: [randomUUID()],
                summary: "Yetkisiz bellek denemesi.",
                salience: 0.5,
              },
            ],
          }),
        ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
        await expect(
          completeRuntimeRun(
            db,
            principal,
            sourceRun.id,
            runtimeCompleteSchema.parse({
              ...completion,
              reflectionDelta: {
                safeSummary: "Yetkisiz karakter değişikliği denemesi.",
                evidenceIds: [sourceRun.id],
                interestDeltas: [],
                sourceTrustDeltas: [],
                relationshipTrustDeltas: [],
                beliefConfidenceDeltas: [],
                temperamentDeltas: [{ key: "warmth", delta: 0.01 }],
                coreValueDeltas: [],
              },
            }),
          ),
        ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
        const attempts = [
          {
            actionType: "CREATE_TOPIC_WITH_ENTRY",
            input: { title: "deneme başlığı", body: "Yetkisiz yayın denemesi." },
          },
          { actionType: "VOTE_UP", input: { entryId: randomUUID() } },
          { actionType: "FOLLOW_USER", input: { userId: f.writer.id } },
          {
            actionType: "PROPOSE_SOURCE",
            input: { url: "https://example.com/feed", sourceType: "RSS", topics: ["kültür"] },
          },
          {
            actionType: "UPDATE_BELIEF",
            input: { topicKey: "deneme", statement: "Yetkisiz inanç değişimi.", confidence: 0.5 },
          },
        ];
        await recordRuntimeActions(
          db,
          principal,
          sourceRun.id,
          runtimeActionsSchema.parse({
            ...owned,
            actions: attempts.map((action, index) => ({
              ...action,
              sequence: index + 1,
              safeReason: "Kontrollü yetki sınırı denemesi.",
            })),
          }),
          now,
        );
        for (let sequence = 1; sequence <= attempts.length; sequence++) {
          expect(
            await executeRuntimeAction(
              db,
              principal,
              sourceRun.id,
              { ...owned, sequence },
              { checkReadiness: async () => {}, requireLifeLedger: false },
            ),
          ).toMatchObject({
            actionStatus: "REJECTED",
            rejectionCode: "AGENT_LIFECYCLE_NOT_ACTIVE",
          });
        }
        expect(await db.entry.count({ where: { authorId: child.userId } })).toBe(0);
        expect(await db.agentPersonaVersion.count({ where: { agentProfileId: child.id } })).toBe(1);
        expect(await db.agentMemoryEpisode.count({ where: { agentProfileId: child.id } })).toBe(
          memoriesBefore,
        );
        expect(
          await completeRuntimeRun(
            db,
            principal,
            sourceRun.id,
            runtimeCompleteSchema.parse({
              ...completion,
              purposeChanges: [
                {
                  operation: "CREATE",
                  kind: "UNDERSTAND_CONCEPT",
                  targetType: "TOPIC",
                  targetId: randomUUID(),
                  question: "Kaynak hazırlığında amaç yazılabilir mi?",
                },
              ],
            }),
          ),
        ).toMatchObject({
          runStatus: "PARTIAL",
          purposes: { status: "REJECTED", reasonCode: "PURPOSE_NORMAL_WAKE_REQUIRED" },
        });
        expect(await db.agentPurpose.count({ where: { agentProfileId: child.id } })).toBe(0);
      } else {
        await recordRuntimeActions(
          db,
          principal,
          sourceRun.id,
          runtimeActionsSchema.parse({
            ...owned,
            actions: [
              {
                sequence: 1,
                actionType: "NO_ACTION",
                safeReason: "Kaynak yenileme tamamlandı.",
                input: {},
              },
            ],
          }),
          now,
        );
        expect(
          await executeRuntimeAction(
            db,
            principal,
            sourceRun.id,
            { ...owned, sequence: 1 },
            { checkReadiness: async () => {}, requireLifeLedger: false },
          ),
        ).toMatchObject({ actionStatus: "SKIPPED" });
        await completeRuntimeRun(db, principal, sourceRun.id, completion);
        expect(await db.agentRun.findUnique({ where: { id: sourceRun.id } })).toMatchObject({
          runStatus: "SUCCEEDED",
          leaseOwner: null,
          leaseToken: null,
        });
        expect(await db.agentProfile.findUnique({ where: { id: child.id } })).toMatchObject({
          lifecycleStatus: "PAUSED",
        });
      }
    },
  );
  it.each(["OFF", "EXPIRED", "GLOBAL_PAUSED", "SUSPENDED", "ACTIVATED"])(
    "cannot lease preparation with %s",
    async (block) => {
      const f = await preparationFixture();
      const prepared = await f.prepare();
      const child = await db.agentProfile.findUniqueOrThrow({
        where: { id: prepared.childProfileId },
        include: { credentials: true },
      });
      const principal: RuntimePrincipal = {
        ...f.principal,
        agentProfileId: child.id,
        credentialId: child.credentials[0]!.id,
        lifecycleStatus: "PAUSED",
        actor: { ...f.principal.actor, actorId: child.userId },
      };
      await db.agentGlobalSettings.update({
        where: { id: "global" },
        data: { runtimeEnabled: block !== "GLOBAL_PAUSED" },
      });
      if (block === "ACTIVATED")
        await db.agentBirthCandidate.update({
          where: { id: prepared.candidateId },
          data: { status: "ACTIVATED", version: { increment: 1 }, activatedAt: now },
        });
      if (block === "OFF") await f.mode("OFF");
      if (block === "SUSPENDED")
        await db.agentProfile.update({
          where: { id: child.id },
          data: { lifecycleStatus: "SUSPENDED" },
        });
      const result = await leaseRuntimeRun(
        db,
        principal,
        { workerId: "birth-source-worker", leaseSeconds: 60 },
        {
          now: block === "EXPIRED" ? new Date(prepared.preparationExpiresAt) : now,
          checkReadiness: async () => {},
        },
      );
      expect(result.run).toBeNull();
      expect(result.reason).toBe(block === "GLOBAL_PAUSED" ? "PAUSED" : "NOT_ACTIVE");
    },
  );
  it("does not lease an ordinary PAUSED author without a birth record", async () => {
    const f = await fixture();
    await db.agentProfile.update({
      where: { id: f.profile.id },
      data: { lifecycleStatus: "PAUSED" },
    });
    await db.agentGlobalSettings.update({
      where: { id: "global" },
      data: { runtimeEnabled: true },
    });
    const runsBefore = await db.agentRun.count({ where: { agentProfileId: f.profile.id } });
    expect(
      await leaseRuntimeRun(
        db,
        { ...f.principal, lifecycleStatus: "PAUSED" },
        { workerId: "ordinary-paused", leaseSeconds: 60 },
        { now, checkReadiness: async () => {} },
      ),
    ).toMatchObject({ run: null, reason: "NOT_ACTIVE" });
    expect(await db.agentRun.count({ where: { agentProfileId: f.profile.id } })).toBe(runsBefore);
  });
});
