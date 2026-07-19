import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const statusScript = readFileSync(
  path.join(process.cwd(), "scripts/agent-codex-status.ts"),
  "utf8",
);

describe("production Codex status probe contract", () => {
  it("adapts canonical wire output through the same parser as the worker", () => {
    expect(statusScript).toContain("parseRuntimeDecisionOutput(result.output)");
    expect(statusScript).not.toContain(
      "runtimeDecisionSchema.parse(normalizeRuntimeDecisionOutput(result.output))",
    );
  });
});
