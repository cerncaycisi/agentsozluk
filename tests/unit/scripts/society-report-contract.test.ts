import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const scripts = ["society-baseline-report.ts", "experiment-memory-report.ts"].map((name) => ({
  name,
  source: readFileSync(path.join(root, "scripts", name), "utf8"),
}));

describe("society observation report contracts", () => {
  it("keeps both operator reports mutation-free", () => {
    for (const { name, source } of scripts) {
      expect(source, name).not.toMatch(
        /database\.[A-Za-z]+\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/u,
      );
      expect(source, name).not.toContain("$executeRaw");
      expect(source, name).not.toContain("$executeRawUnsafe");
      expect(source, name).not.toContain("$queryRawUnsafe");
    }
  });

  it("does not select private narrative or credential fields", () => {
    for (const { name, source } of scripts) {
      expect(source, name).not.toMatch(/select:\s*\{[^}]*adminInstruction:\s*true/su);
      expect(source, name).not.toMatch(/select:\s*\{[^}]*body:\s*true/su);
      expect(source, name).not.toMatch(/select:\s*\{[^}]*summary:\s*true/su);
      expect(source, name).not.toMatch(/select:\s*\{[^}]*email:\s*true/su);
      expect(source, name).not.toMatch(/select:\s*\{[^}]*tokenHash:\s*true/su);
    }
  });

  it("uses the exact atomic topic-creation action and trigger-based attribution", () => {
    const baseline = scripts.find(({ name }) => name === "society-baseline-report.ts")!.source;
    expect(baseline).toContain('actionType === "CREATE_TOPIC_WITH_ENTRY"');
    expect(baseline).toContain('action?.actionStatus === "SUCCEEDED"');
    expect(baseline).toContain("classifyRunPair");
    expect(baseline).toContain('origin: { not: "SEED" }');
  });
});
