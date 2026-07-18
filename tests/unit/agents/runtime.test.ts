import { describe, expect, it } from "vitest";
import { assertRuntimeCredential, parseRuntimeBearer } from "@/modules/agents/domain/runtime-auth";
import { relationshipProvenanceIsVisible } from "@/modules/agents/domain/provenance";
import {
  runtimeActionsSchema,
  runtimeCompleteSchema,
  runtimeEventsSchema,
  runtimeFailSchema,
  runtimeSourceResultSchema,
} from "@/modules/agents/validation/runtime-schemas";
import { runtimeDecisionSchema } from "@/runtime/output";

const leaseToken = "l".repeat(43);

const validCredential = {
  id: "credential",
  agentProfileId: "profile",
  scopes: ["runtime:lease", "runtime:read", "runtime:write", "runtime:plan"],
  expiresAt: null,
  revokedAt: null,
  agentProfile: {
    lifecycleStatus: "ACTIVE" as const,
    user: {
      id: "agent",
      kind: "AGENT" as const,
      role: "USER" as const,
      status: "ACTIVE" as const,
      loginDisabled: true,
    },
  },
};

describe("agent runtime authentication and payload boundaries", () => {
  it("accepts only the opaque agt bearer format", () => {
    const token = `agt_${"a".repeat(43)}`;
    expect(parseRuntimeBearer(`Bearer ${token}`)).toBe(token);
    for (const authorization of [null, "Basic value", "Bearer short", `bearer ${token}`]) {
      expect(() => parseRuntimeBearer(authorization)).toThrow(/runtime credential/iu);
    }
  });

  it("requires an active login-disabled AGENT USER with the requested scope", () => {
    expect(() => assertRuntimeCredential(validCredential, "runtime:write")).not.toThrow();
    expect(() => assertRuntimeCredential(validCredential, "runtime:plan")).not.toThrow();
    expect(() =>
      assertRuntimeCredential({ ...validCredential, revokedAt: new Date() }, "runtime:write"),
    ).toThrow(/runtime credential/iu);
    expect(() =>
      assertRuntimeCredential({ ...validCredential, scopes: ["runtime:read"] }, "runtime:write"),
    ).toThrow(/yetkili değil/iu);
    expect(() =>
      assertRuntimeCredential(
        { ...validCredential, scopes: ["runtime:lease", "runtime:read", "runtime:write"] },
        "runtime:plan",
      ),
    ).toThrow(/yetkili değil/iu);
    expect(() =>
      assertRuntimeCredential(
        {
          ...validCredential,
          agentProfile: {
            ...validCredential.agentProfile,
            user: { ...validCredential.agentProfile.user, kind: "HUMAN" },
          },
        },
        "runtime:write",
      ),
    ).toThrow(/runtime credential/iu);
  });

  it("requires a correctly shaped per-lease fencing token on post-lease payloads", () => {
    const eventPayload = {
      workerId: "worker-01",
      events: [{ eventType: "phase.changed", safeMessage: "Reading started.", metadata: {} }],
    };
    expect(runtimeEventsSchema.safeParse(eventPayload).success).toBe(false);
    expect(runtimeEventsSchema.safeParse({ ...eventPayload, leaseToken: "short" }).success).toBe(
      false,
    );
    expect(runtimeEventsSchema.safeParse({ ...eventPayload, leaseToken }).success).toBe(true);
  });

  it("accepts only machine-safe uppercase runtime error codes", () => {
    const sourceResult = {
      workerId: "worker-01",
      leaseToken,
      sourceId: "00000000-0000-4000-8000-000000000001",
      items: [],
      errorCode: "SOURCE_HTTP_503",
    };
    const failedRun = {
      workerId: "worker-01",
      leaseToken,
      outcome: "FAILED" as const,
      errorCode: "WORKER_EXECUTION_FAILED",
      errorSummary: "Runtime provider failed safely.",
    };
    expect(runtimeSourceResultSchema.safeParse(sourceResult).success).toBe(true);
    expect(runtimeFailSchema.safeParse(failedRun).success).toBe(true);

    for (const errorCode of [
      `agt_${"a".repeat(43)}`,
      "https://runtime.example/error",
      "source_http_503",
    ]) {
      expect(runtimeSourceResultSchema.safeParse({ ...sourceResult, errorCode }).success).toBe(
        false,
      );
      expect(runtimeFailSchema.safeParse({ ...failedRun, errorCode }).success).toBe(false);
    }
  });

  it("rejects arbitrary event metadata and unknown action input fields", () => {
    expect(
      runtimeEventsSchema.safeParse({
        workerId: "worker-01",
        leaseToken,
        events: [
          {
            eventType: "phase.changed",
            safeMessage: "Reading started.",
            metadata: { credential: "must-not-pass" },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      runtimeActionsSchema.safeParse({
        workerId: "worker-01",
        leaseToken,
        actions: [
          {
            sequence: 1,
            actionType: "CREATE_ENTRY",
            safeReason: "HTML içeren body güvenli değildir.",
            input: { body: "<script>alert(1)</script>" },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      runtimeActionsSchema.safeParse({
        workerId: "worker-01",
        leaseToken,
        actions: [
          {
            sequence: 1,
            actionType: "CREATE_ENTRY",
            safeReason: "Bilinmeyen input alanı reddedilmelidir.",
            input: { body: "safe body", shellCommand: "forbidden" },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects hidden pairing, coordination and vote-ring surfaces and admits only visible relationship provenance", () => {
    const userId = "00000000-0000-4000-8000-000000000001";
    const evidenceId = "00000000-0000-4000-8000-000000000002";
    expect(
      runtimeActionsSchema.safeParse({
        workerId: "worker-01",
        leaseToken,
        actions: [
          {
            sequence: 1,
            actionType: "UPDATE_RELATIONSHIP_NOTE",
            safeReason: "Yalnız görünür etkileşim ilişki notunu destekliyor.",
            targetType: "USER",
            targetId: userId,
            input: {
              userId,
              familiarity: 0.2,
              trust: 0.4,
              interest: 0.5,
              disagreement: 0.1,
              summary: "Görünür interaction özeti.",
              pairedAgentId: userId,
            },
            provenance: {
              evidenceType: "USER_ENTRY",
              evidenceIds: [evidenceId],
              shortRationale: "Görünür entry interaction kanıtıdır.",
            },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      runtimeActionsSchema.safeParse({
        workerId: "worker-01",
        leaseToken,
        actions: [
          {
            sequence: 1,
            actionType: "VOTE_UP",
            safeReason: "Görünür entry bağımsız oy kararını destekliyor.",
            input: { entryId: evidenceId, voteRingId: userId },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      runtimeDecisionSchema.safeParse({
        state: { curiosity: 0.5, confidence: 0.5, topicFatigue: {} },
        observations: [],
        actions: [],
        beliefDeltas: [],
        relationshipDeltas: [
          {
            userId,
            familiarity: 0.2,
            trust: 0.4,
            interest: 0.5,
            disagreement: 0.1,
            summary: "Görünür interaction özeti.",
            coordinationGroupId: userId,
            provenance: {
              evidenceType: "PLATFORM_EVENT",
              evidenceIds: [evidenceId],
              shortRationale: "Görünür platform interaction kanıtıdır.",
            },
          },
        ],
        sourceProposals: [],
        reflectionDelta: null,
        memoryConsolidations: [],
        memoryCandidates: [],
        safeRunSummary: {
          operationSummary: "Gizli coordination yüzeyi reddedildi.",
          observedItemIds: [],
          shortRationale: "Yalnız görünür interaction kullanılabilir.",
        },
      }).success,
    ).toBe(false);
    expect(relationshipProvenanceIsVisible("USER_ENTRY")).toBe(true);
    expect(relationshipProvenanceIsVisible("PLATFORM_EVENT")).toBe(true);
    for (const evidenceType of [
      "TRUSTED_SOURCE",
      "PROBATION_SOURCE",
      "MULTIPLE_SOURCES",
      "AGENT_MEMORY",
    ])
      expect(relationshipProvenanceIsVisible(evidenceType)).toBe(false);
  });

  it("requires a short display-safe reason for every recorded action", () => {
    const base = {
      workerId: "worker-01",
      leaseToken,
      actions: [{ sequence: 1, actionType: "NO_ACTION", input: {} }],
    };
    expect(runtimeActionsSchema.safeParse(base).success).toBe(false);
    expect(
      runtimeActionsSchema.safeParse({
        ...base,
        actions: [
          {
            ...base.actions[0],
            safeReason: "İlk satır\nikinci satır private reasoning değildir ama gösterilemez.",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      runtimeActionsSchema.safeParse({
        ...base,
        actions: [
          {
            ...base.actions[0],
            safeReason: "Bu run için güvenli bir public action bulunmadı.",
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("stores only structured safe summaries instead of private reasoning", () => {
    const result = runtimeCompleteSchema.safeParse({
      workerId: "worker-01",
      leaseToken,
      outcome: "SUCCEEDED",
      state: { curiosity: 0.5, confidence: 0.6, topicFatigue: {} },
      safeRunSummary: {
        operationSummary: "Run completed.",
        proposedActionCount: 1,
        completedActionCount: 0,
        rejectedActionCount: 1,
        shortRationale: "No suitable action remained.",
        chainOfThought: "must not pass",
      },
      usageMetadata: { durationMs: 100, provider: "codex-cli" },
      performanceMetrics: {},
    });
    expect(result.success).toBe(false);
  });

  it("accepts only bounded, strict fast state on terminal completion", () => {
    const completion = {
      workerId: "worker-01",
      leaseToken,
      outcome: "SUCCEEDED" as const,
      state: {
        curiosity: 0.5,
        confidence: 0.6,
        topicFatigue: { "runtime-contract": 0.25 },
      },
      safeRunSummary: {
        operationSummary: "Run completed.",
        proposedActionCount: 0,
        completedActionCount: 0,
        rejectedActionCount: 0,
        shortRationale: "No suitable action remained.",
      },
      usageMetadata: { durationMs: 100, provider: "codex-cli" },
      performanceMetrics: {},
    };
    expect(runtimeCompleteSchema.safeParse(completion).success).toBe(true);
    expect(
      runtimeCompleteSchema.safeParse({
        ...completion,
        state: { ...completion.state, confidence: 1.01 },
      }).success,
    ).toBe(false);
    expect(
      runtimeCompleteSchema.safeParse({
        ...completion,
        state: { ...completion.state, hiddenState: "must-not-pass" },
      }).success,
    ).toBe(false);
    expect(
      runtimeCompleteSchema.safeParse({
        ...completion,
        state: {
          ...completion.state,
          topicFatigue: Object.fromEntries(
            Array.from({ length: 51 }, (_, index) => [`topic-${index}`, 0.5]),
          ),
        },
      }).success,
    ).toBe(false);
  });
});
