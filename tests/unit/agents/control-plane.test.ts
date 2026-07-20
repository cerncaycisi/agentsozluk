import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/http/errors";
import {
  assertLifecycleTransition,
  requireHumanAdmin,
} from "@/modules/agents/domain/authorization";
import { redactCreationCredential } from "@/modules/agents/domain/credential";
import { validatePersonaCandidate } from "@/modules/agents/domain/persona-validation";
import {
  assertQuotaConsistency,
  nextIstanbulQuotaLocalDate,
  resolveQuotaSettings,
} from "@/modules/agents/domain/quota";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import { promotePendingQuotaSettingsRecord } from "@/modules/agents/repository/control-plane";
import {
  createAgentSchema,
  defaultActiveTimeProfile,
  globalSettingsUpdateSchema,
  updateAgentSchema,
} from "@/modules/agents/validation/schemas";
import type { ActorContext } from "@/modules/auth/domain/actor";

const humanAdmin: ActorContext = {
  actorId: "admin",
  actorKind: "HUMAN",
  actorRole: "ADMIN",
  requestId: "request",
  origin: "API",
};

describe("agent control-plane domain", () => {
  it("admits only an active HUMAN ADMIN principal", () => {
    expect(
      requireHumanAdmin(
        { id: "admin", kind: "HUMAN", role: "ADMIN", status: "ACTIVE" },
        humanAdmin,
      ),
    ).toMatchObject({ id: "admin" });
    for (const principal of [
      { id: "admin", kind: "AGENT" as const, role: "ADMIN" as const, status: "ACTIVE" },
      { id: "admin", kind: "HUMAN" as const, role: "MODERATOR" as const, status: "ACTIVE" },
      { id: "admin", kind: "HUMAN" as const, role: "ADMIN" as const, status: "SUSPENDED" },
    ]) {
      expect(() => requireHumanAdmin(principal, humanAdmin)).toThrowError(AppError);
    }
    expect(() =>
      requireHumanAdmin(
        { id: "admin", kind: "AGENT", role: "ADMIN", status: "ACTIVE" },
        { ...humanAdmin, actorKind: "AGENT" },
      ),
    ).toThrowError(AppError);
  });

  it("enforces the non-destructive lifecycle state machine", () => {
    expect(() => assertLifecycleTransition("PAUSED", "ACTIVE")).not.toThrow();
    expect(() => assertLifecycleTransition("ACTIVE", "PAUSED")).not.toThrow();
    expect(() => assertLifecycleTransition("RETIRED", "ACTIVE")).toThrow(/RETIRED.*ACTIVE/iu);
    expect(() => assertLifecycleTransition("DRAFT", "ACTIVE")).toThrow(/DRAFT.*ACTIVE/iu);
  });

  it("defaults new agents to PAUSED with measured quota and timeout defaults", () => {
    const parsed = createAgentSchema.parse({ persona: originalPersonaPack.personas[0] });
    expect(parsed).toMatchObject({
      lifecycleStatus: "PAUSED",
      useGlobalEntryQuota: true,
      dailyTopic: { min: 0, max: 2 },
      dailyVote: { min: 0, max: 10 },
      activeTimeProfile: defaultActiveTimeProfile,
      scheduledTimeoutSeconds: 360,
      manualTimeoutSeconds: 600,
    });
  });

  it("validates global and effective per-agent quota mathematics", () => {
    const settings = {
      defaultDailyEntryMin: 15,
      defaultDailyEntryMax: 20,
      globalDailyEntryMin: 150,
      globalDailyEntryMax: 200,
    };
    const tenAgents = Array.from({ length: 10 }, () => ({
      useGlobalEntryQuota: true,
      dailyEntryMin: null,
      dailyEntryMax: null,
    }));
    expect(() => assertQuotaConsistency(settings, tenAgents)).not.toThrow();
    expect(() =>
      assertQuotaConsistency({ ...settings, globalDailyEntryMax: 140 }, tenAgents),
    ).toThrow(/global maksimum/iu);
    expect(() =>
      assertQuotaConsistency({ ...settings, globalDailyEntryMin: 201 }, tenAgents),
    ).toThrow(/global minimum/iu);
    expect(() => assertQuotaConsistency(settings, [])).not.toThrow();
  });

  it("rejects ontology violations and clone-like pairwise personas", () => {
    const original = originalPersonaPack.personas[0]!;
    expect(() => validatePersonaCandidate(original, [original], "Clone attempt")).toThrow(
      /mevcut bir agent personasına/iu,
    );
    expect(() =>
      validatePersonaCandidate(
        {
          ...original,
          publicBio: "Ben bir insanım ve dijital kültür üzerine düşünüyorum.",
        },
        [],
        "Unsafe initial claim",
      ),
    ).toThrow(/varlık türü/iu);
  });

  it("rejects inconsistent or out-of-range global settings input", () => {
    const commandMetadata = {
      expectedSettingsVersion: 1,
      changeReason: "Update global settings through the admin control plane.",
    };
    const parse = (input: Record<string, unknown>) =>
      globalSettingsUpdateSchema.safeParse({ ...commandMetadata, ...input }).success;
    expect(parse({ defaultDailyEntryMin: 101, quotaApplyMode: "NEXT_DAY" })).toBe(false);
    expect(parse({ codexConcurrency: 3 })).toBe(false);
    expect(parse({ scheduledTimeoutSeconds: 179 })).toBe(false);
    expect(parse({ scheduledTimeoutSeconds: 600 })).toBe(true);
    expect(parse({ manualTimeoutSeconds: 1201 })).toBe(false);
    expect(parse({ debugRetentionHours: 0 })).toBe(true);
    expect(parse({ debugRetentionHours: 24 })).toBe(true);
    expect(parse({ debugRetentionHours: 25 })).toBe(false);
    expect(parse({ sitemapDelayMinutes: 10_081 })).toBe(false);
    expect(globalSettingsUpdateSchema.safeParse({}).success).toBe(false);
    expect(parse({ quotaApplyMode: "NEXT_DAY" })).toBe(false);
    expect(parse({ defaultDailyEntryMin: 15 })).toBe(false);
    expect(parse({ defaultDailyEntryMin: 15, quotaApplyMode: "NEXT_DAY" })).toBe(true);
    expect(parse({ schedulerEnabled: false })).toBe(true);
    expect(parse({ runtimeEnabled: true })).toBe(false);
    expect(globalSettingsUpdateSchema.safeParse({ schedulerEnabled: false }).success).toBe(false);
    expect(
      globalSettingsUpdateSchema.safeParse({
        schedulerEnabled: false,
        expectedSettingsVersion: 1,
      }).success,
    ).toBe(false);
    expect(
      globalSettingsUpdateSchema.safeParse({
        schedulerEnabled: false,
        changeReason: commandMetadata.changeReason,
      }).success,
    ).toBe(false);
    expect(globalSettingsUpdateSchema.safeParse({ publicWriteEnabled: false }).success).toBe(false);
    expect(parse({ publicWriteEnabled: false })).toBe(true);
    expect(
      globalSettingsUpdateSchema.safeParse({ runtimeOperatingMode: "MAINTENANCE" }).success,
    ).toBe(false);
    expect(parse({ runtimeOperatingMode: "MAINTENANCE" })).toBe(true);
    expect(parse({ runtimeOperatingMode: "READ_ONLY" })).toBe(false);
    expect(parse({ sourceFetchLimit: 0 })).toBe(false);
    expect(parse({ sourceFetchLimit: 1 })).toBe(true);
    expect(parse({ sourceFetchLimit: 50 })).toBe(true);
    expect(parse({ sourceFetchLimit: 51 })).toBe(false);
    const circuitBreakerConfig = {
      errorRateWindowMinutes: 30,
      errorRateThreshold: 0.25,
      consecutiveCodexFailures: 3,
      duplicateWindowSize: 20,
      duplicateThreshold: 0.3,
      duplicateCooldownMinutes: 30,
      utilizationWindowMinutes: 120,
      utilizationThreshold: 0.8,
    };
    expect(parse({ circuitBreakerConfig })).toBe(true);
    expect(
      parse({
        circuitBreakerConfig: { ...circuitBreakerConfig, unknownThreshold: 1 },
      }),
    ).toBe(false);
  });

  it("keeps a pending quota snapshot inactive today and resolves it on the Istanbul effective day", () => {
    const now = new Date("2026-07-18T12:00:00.000Z");
    const effectiveDate = nextIstanbulQuotaLocalDate(now);
    const stored = {
      quotaMode: "HYBRID" as const,
      defaultDailyEntryMin: 15,
      defaultDailyEntryMax: 20,
      globalDailyEntryMin: 150,
      globalDailyEntryMax: 200,
      pendingQuotaEffectiveDate: effectiveDate,
      pendingQuotaSettings: {
        quotaMode: "GLOBAL_TOTAL",
        defaultDailyEntryMin: 10,
        defaultDailyEntryMax: 12,
        globalDailyEntryMin: 100,
        globalDailyEntryMax: 120,
      },
    };
    expect(resolveQuotaSettings(stored, new Date("2026-07-18T00:00:00.000Z"))).toMatchObject({
      quotaMode: "HYBRID",
      defaultDailyEntryMax: 20,
      globalDailyEntryMax: 200,
    });
    expect(resolveQuotaSettings(stored, effectiveDate)).toMatchObject({
      quotaMode: "GLOBAL_TOTAL",
      defaultDailyEntryMin: 10,
      defaultDailyEntryMax: 12,
      globalDailyEntryMin: 100,
      globalDailyEntryMax: 120,
    });
  });

  it("promotes due pending quota settings as one versioned audit and outbox change", async () => {
    const pendingQuotaEffectiveDate = new Date("2026-07-19T00:00:00.000Z");
    const stored = {
      id: "global",
      settingsVersion: 7,
      quotaMode: "HYBRID" as const,
      defaultDailyEntryMin: 15,
      defaultDailyEntryMax: 20,
      globalDailyEntryMin: 150,
      globalDailyEntryMax: 200,
      pendingQuotaEffectiveDate,
      pendingQuotaSettings: {
        quotaMode: "GLOBAL_TOTAL",
        defaultDailyEntryMin: 16,
        defaultDailyEntryMax: 20,
        globalDailyEntryMin: 160,
        globalDailyEntryMax: 200,
      },
      updatedById: "admin",
    };
    const updated = {
      ...stored,
      settingsVersion: 8,
      quotaMode: "GLOBAL_TOTAL" as const,
      defaultDailyEntryMin: 16,
      globalDailyEntryMin: 160,
      pendingQuotaEffectiveDate: null,
      pendingQuotaSettings: null,
    };
    const transaction = {
      agentGlobalSettings: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(stored),
        update: vi.fn().mockResolvedValue(updated),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      outboxEvent: { create: vi.fn().mockResolvedValue({}) },
      agentRuntimeEvent: { create: vi.fn().mockResolvedValue({}) },
    };

    await expect(
      promotePendingQuotaSettingsRecord(
        transaction as unknown as Prisma.TransactionClient,
        pendingQuotaEffectiveDate,
        { actorId: "admin", actorKind: "HUMAN", requestId: "promotion-request" },
      ),
    ).resolves.toEqual({ settings: updated, promoted: true });
    expect(transaction.agentGlobalSettings.update).toHaveBeenCalledWith({
      where: { id: "global" },
      data: expect.objectContaining({
        settingsVersion: { increment: 1 },
        quotaMode: "GLOBAL_TOTAL",
        defaultDailyEntryMin: 16,
        pendingQuotaEffectiveDate: null,
      }),
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: "admin",
        action: "agent.settings.changed",
        requestId: "promotion-request",
        metadata: expect.objectContaining({
          actorKind: "HUMAN",
          before: expect.objectContaining({ defaultDailyEntryMin: 15 }),
          after: expect.objectContaining({ defaultDailyEntryMin: 16 }),
          quotaApplyMode: "PROMOTE_PENDING",
          previousSettingsVersion: 7,
          settingsVersion: 8,
        }),
      }),
    });
    expect(transaction.outboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "agent.settings.changed",
        actorKind: "HUMAN",
        requestId: "promotion-request",
        payload: expect.objectContaining({
          quotaApplyMode: "PROMOTE_PENDING",
          settingsVersion: 8,
        }),
      }),
    });
    expect(transaction.agentRuntimeEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "quota.changed",
        metadata: expect.objectContaining({ settingsVersion: 8 }),
      }),
    });
  });

  it("requires an audit summary for every public persona identity change", () => {
    expect(updateAgentSchema.safeParse({ displayName: "Yeni Agent Adı" }).success).toBe(false);
    expect(
      updateAgentSchema.safeParse({
        publicBio: "Yeni ve yeterince uzun bir halka açık agent biyografisi.",
      }).success,
    ).toBe(false);
    expect(
      updateAgentSchema.safeParse({
        displayName: "Yeni Agent Adı",
        changeSummary: "Agent görünen adı kontrollü olarak güncellendi.",
      }).success,
    ).toBe(true);
    expect(updateAgentSchema.safeParse({ scheduledTimeoutSeconds: 300 }).success).toBe(true);
  });

  it("redacts one-time credentials from durable idempotency responses", () => {
    const redacted = redactCreationCredential({
      data: {
        credential: "must-not-persist",
        credentialShownOnce: true,
        agent: { id: "agent" },
      },
      requestId: "request",
    });
    expect(redacted).toEqual({
      data: { credential: null, credentialShownOnce: false, agent: { id: "agent" } },
      requestId: "request",
    });
    expect(JSON.stringify(redacted)).not.toContain("must-not-persist");
  });
});
