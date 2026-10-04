import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const admin = vi.hoisted(() => vi.fn());
const runtime = vi.hoisted(() => vi.fn());
const actions = vi.hoisted(() => ({
  runRuntimeBirthTick: vi.fn(),
  changeBirthMode: vi.fn(),
  inspectBirthCandidate: vi.fn(),
  rejectBirthCandidate: vi.fn(),
}));
vi.mock("@/lib/http/agent-admin-action", () => ({ runAgentAdminAction: admin }));
vi.mock("@/lib/http/agent-runtime-action", () => ({ runAgentRuntimeAction: runtime }));
vi.mock("@/modules/agents/application/birth-candidates", () => actions);
import { POST as tick } from "@/app/api/v1/internal/agent-runtime/birth-candidates/tick/route";
import { POST as mode } from "@/app/api/v1/admin/agent-births/mode/route";
import { POST as inspect } from "@/app/api/v1/admin/agent-births/inspect/route";
import { POST as reject } from "@/app/api/v1/admin/agent-births/reject/route";
import {
  birthTickSchema,
  birthModeSchema,
  inspectBirthCandidateSchema,
  rejectBirthCandidateSchema,
} from "@/modules/agents/validation/birth-schemas";
const request = new Request("http://localhost/birth", { method: "POST" }) as NextRequest;
beforeEach(() => vi.clearAllMocks());
describe("private birth route authorization boundaries", () => {
  it("requires runtime plan authority and accepts no worker-selected parent or persona", () => {
    tick(request);
    expect(runtime).toHaveBeenCalledWith(
      request,
      birthTickSchema,
      "runtime:plan",
      actions.runRuntimeBirthTick,
    );
    expect(
      birthTickSchema.safeParse({ workerId: "worker", parentProfileId: "chosen" }).success,
    ).toBe(false);
    expect(birthTickSchema.safeParse({ workerId: "worker", persona: {} }).success).toBe(false);
  });
  it("keeps configuration and rejection behind the human admin CSRF gateway", () => {
    mode(request);
    reject(request);
    expect(admin).toHaveBeenCalledWith(request, birthModeSchema, actions.changeBirthMode);
    expect(admin).toHaveBeenCalledWith(
      request,
      rejectBirthCandidateSchema,
      actions.rejectBirthCandidate,
    );
    expect(birthModeSchema.safeParse({ mode: "ACTIVE", expectedSettingsVersion: 1 }).success).toBe(
      false,
    );
    expect(
      rejectBirthCandidateSchema.safeParse({ candidateId: "00000000-0000-4000-8000-000000000001" })
        .success,
    ).toBe(false);
  });
  it("refreshes private evidence on inspection replay instead of serving cached acceptance", () => {
    inspect(request);
    expect(admin).toHaveBeenCalledWith(
      request,
      inspectBirthCandidateSchema,
      actions.inspectBirthCandidate,
      { refreshOnReplay: true },
    );
  });
});
