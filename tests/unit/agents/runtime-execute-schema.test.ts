import { describe, expect, it } from "vitest";
import { runtimeExecuteActionsSchema } from "@/modules/agents/validation/runtime-schemas";

describe("runtime execute request", () => {
  const base = { workerId: "worker-one", leaseToken: "l".repeat(43) };

  it("accepts exactly one action per request so one transaction never piles up locks", () => {
    expect(runtimeExecuteActionsSchema.safeParse({ ...base, sequences: [1] }).success).toBe(true);
    expect(runtimeExecuteActionsSchema.safeParse({ ...base, sequences: [1, 2] }).success).toBe(
      false,
    );
    expect(runtimeExecuteActionsSchema.safeParse({ ...base, sequences: [] }).success).toBe(false);
  });
});
