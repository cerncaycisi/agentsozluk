import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/http/errors";
import {
  assertLifecycleTransition,
  requireHumanAdmin,
} from "@/modules/agents/domain/authorization";
import { redactCreationCredential } from "@/modules/agents/domain/credential";
import { validatePersonaCandidate } from "@/modules/agents/domain/persona-validation";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
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

  it("defaults new agents to PAUSED without daily target inputs", () => {
    const parsed = createAgentSchema.parse({ persona: originalPersonaPack.personas[0] });
    expect(parsed).toMatchObject({
      lifecycleStatus: "PAUSED",
      activeTimeProfile: defaultActiveTimeProfile,
      scheduledTimeoutSeconds: 360,
      manualTimeoutSeconds: 600,
    });
    expect(parsed).not.toHaveProperty("useGlobalEntryQuota");
    expect(parsed).not.toHaveProperty("dailyEntry");
    expect(parsed).not.toHaveProperty("dailyTopic");
    expect(parsed).not.toHaveProperty("dailyVote");
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

  it("bounds global settings and preserves retired fields only as 410 tombstones", () => {
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
    expect(parse({ quotaApplyMode: "NEXT_DAY" })).toBe(true);
    expect(parse({ defaultDailyEntryMin: 15 })).toBe(true);
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
