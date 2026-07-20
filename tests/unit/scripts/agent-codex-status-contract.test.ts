import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const statusScript = readFileSync(
  path.join(process.cwd(), "scripts/agent-codex-status.ts"),
  "utf8",
);

describe("production Codex status probe contract", () => {
  it("uses the capacity path's single structured repair before parsing canonical output", () => {
    expect(statusScript).toContain("invokeWithStructuredRepair(provider, {");
    expect(statusScript).toContain("parseRuntimeDecisionOutput(result.output)");
    expect(statusScript).not.toContain("await provider.invoke({");
    expect(statusScript).not.toContain(
      "runtimeDecisionSchema.parse(normalizeRuntimeDecisionOutput(result.output))",
    );
  });
});
