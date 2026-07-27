import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const scripts = ["society-baseline-report.ts", "experiment-memory-report.ts"].map((name) => ({
  name,
  source: readFileSync(path.join(root, "scripts", name), "utf8"),
}));
const dockerfile = readFileSync(path.join(root, "Dockerfile"), "utf8");

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
      expect(source, name).not.toMatch(/select:\s*\{[^}]*rejectionReason:\s*true/su);
      expect(source, name).not.toMatch(/select:\s*\{[^}]*statement:\s*true/su);
      expect(source, name).not.toMatch(/select:\s*\{[^}]*evidenceSummary:\s*true/su);
      expect(source, name).not.toMatch(/select:\s*\{[^}]*safeText:\s*true/su);
    }
  });

  it("uses the exact atomic topic-creation action and trigger-based attribution", () => {
    const baseline = scripts.find(({ name }) => name === "society-baseline-report.ts")!.source;
    expect(baseline).toContain('actionType === "CREATE_TOPIC_WITH_ENTRY"');
    expect(baseline).toContain('action?.actionStatus === "SUCCEEDED"');
    expect(baseline).toContain("classifyRunPair");
    expect(baseline).toContain('origin: { not: "SEED" }');
  });

  it("covers natural action, source and evolution outcomes without narrative fields", () => {
    const baseline = scripts.find(({ name }) => name === "society-baseline-report.ts")!.source;
    for (const query of [
      "database.agentAction.findMany",
      "database.agentSource.findMany",
      "database.agentSourceItem.findMany",
      "database.agentRuntimeEvent.findMany",
      "database.agentMemoryEpisode.findMany",
      "database.agentBelief.findMany",
      "database.agentRelationship.findMany",
      "database.agentPersonaVersion.findMany",
    ]) {
      expect(baseline).toContain(query);
    }
    for (const section of [
      "ACTION MATRIX",
      "NATURAL EPISODE OUTCOMES",
      "NATURAL COVERAGE BY AGENT",
      "NATURAL SELF-TOPIC REVISITS BY AGENT",
      "SOURCE HEALTH",
      "MEMORY EVENTS",
      "EVOLUTION COUNTS",
    ]) {
      expect(baseline).toContain(section);
    }
    expect(baseline).toContain("natural_entries.self_topic_revisits=");
    expect(baseline).toContain("natural_entries.max_consecutive_self_topic_revisits=");
  });

  it("packages both read-only reports and their helper in the production image", () => {
    for (const filename of [
      "society-baseline-report.ts",
      "experiment-memory-report.ts",
      "society-report-helpers.ts",
    ]) {
      expect(dockerfile).toContain(
        `COPY --chown=nextjs:nodejs scripts/${filename} ./scripts/${filename}`,
      );
    }
  });
});
