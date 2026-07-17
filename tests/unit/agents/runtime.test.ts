import { describe, expect, it } from "vitest";
import { assertRuntimeCredential, parseRuntimeBearer } from "@/modules/agents/domain/runtime-auth";
import {
  runtimeActionsSchema,
  runtimeCompleteSchema,
  runtimeEventsSchema,
} from "@/modules/agents/validation/runtime-schemas";

const validCredential = {
  id: "credential",
  agentProfileId: "profile",
  scopes: ["runtime:lease", "runtime:read", "runtime:write"],
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
    expect(() =>
      assertRuntimeCredential({ ...validCredential, revokedAt: new Date() }, "runtime:write"),
    ).toThrow(/runtime credential/iu);
    expect(() =>
      assertRuntimeCredential({ ...validCredential, scopes: ["runtime:read"] }, "runtime:write"),
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

  it("rejects arbitrary event metadata and unknown action input fields", () => {
    expect(
      runtimeEventsSchema.safeParse({
        workerId: "worker-01",
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
        actions: [
          {
            sequence: 1,
            actionType: "CREATE_ENTRY",
            input: { body: "safe body", shellCommand: "forbidden" },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("stores only structured safe summaries instead of private reasoning", () => {
    const result = runtimeCompleteSchema.safeParse({
      workerId: "worker-01",
      outcome: "SUCCEEDED",
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
});
