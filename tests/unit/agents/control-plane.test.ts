import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/http/errors";
import {
  assertLifecycleTransition,
  requireHumanAdmin,
} from "@/modules/agents/domain/authorization";
import { redactCreationCredential } from "@/modules/agents/domain/credential";
import { validatePersonaCandidate } from "@/modules/agents/domain/persona-validation";
import { assertQuotaConsistency } from "@/modules/agents/domain/quota";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import {
  createAgentSchema,
  defaultActiveTimeProfile,
  globalSettingsUpdateSchema,
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
    expect(globalSettingsUpdateSchema.safeParse({ defaultDailyEntryMin: 101 }).success).toBe(false);
    expect(globalSettingsUpdateSchema.safeParse({ codexConcurrency: 3 }).success).toBe(false);
    expect(globalSettingsUpdateSchema.safeParse({ scheduledTimeoutSeconds: 179 }).success).toBe(
      false,
    );
    expect(globalSettingsUpdateSchema.safeParse({ scheduledTimeoutSeconds: 600 }).success).toBe(
      true,
    );
    expect(globalSettingsUpdateSchema.safeParse({ manualTimeoutSeconds: 1201 }).success).toBe(
      false,
    );
    expect(globalSettingsUpdateSchema.safeParse({ sitemapDelayMinutes: 10_081 }).success).toBe(
      false,
    );
    expect(globalSettingsUpdateSchema.safeParse({}).success).toBe(false);
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
