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
      "NATURAL PARTIAL SAFE REASONS",
      "LIFECYCLE WINDOW COHORT",
      "NATURAL COVERAGE BY AGENT",
      "NATURAL SELF-TOPIC REVISITS BY AGENT",
      "SOURCE HEALTH",
      "FULL-WINDOW FRESH SOURCE COVERAGE",
      "MEMORY EVENTS",
      "EVOLUTION COUNTS",
      "REFLECTION CHANGE / NO-CHANGE REASONS",
      "REFLECTION COVERAGE BY ACTIVE AGENT",
      "REFLECTION PARTIAL / FAILURE CODES",
      "DICTIONARY DISCOVERY EVENTS",
    ]) {
      expect(baseline).toContain(section);
    }
    for (const reason of [
      "APPLIED",
      "NO_DELTA",
      "PARTIAL_RUN",
      "FROZEN",
      "STALE_PERSONA",
      "REJECTED_PERSONA_DELTA",
      "UNKNOWN",
    ]) {
      expect(baseline).toContain(reason);
    }
    expect(baseline).toContain("active_agents_without_persona_reflection=");
    expect(baseline).toContain("current_active_agents_without_natural_wake=");
    expect(baseline).toContain("current_active_agents_with_natural_wake=");
    expect(baseline).toContain("full_window_active_agents_without_natural_wake=");
    expect(baseline).toContain("full_window_active_agents_with_natural_wake=");
    expect(baseline).toContain("full_window_active_agents_below_three_wakes=");
    expect(baseline).toContain("lifecycle_window.");
    expect(baseline).toContain("natural_runs.single_action=");
    expect(baseline).toContain("natural_runs.failed_or_timed_out_rate=");
    expect(baseline).toContain("natural_runs.cancelled=");
    expect(baseline).toContain("natural_runs.partial_without_safe_reason=");
    expect(baseline).toContain("natural_runs.cancelled_without_safe_reason=");
    expect(baseline).toContain("natural_runs.terminalized_after_window=");
    expect(baseline).toContain("natural_runs.terminalized_after_window_max_delay_seconds=");
    expect(baseline).toContain("coverage.singleActionRuns");
    expect(baseline).toContain("coverage.multiActionRuns");
    expect(baseline).toContain("coverageByAgent.set(username, emptyAgentCoverage())");
    expect(baseline).toContain("distributeEpisodeActions");
    expect(baseline).toContain("classifyLifecycleWindow");
    expect(baseline).toContain('eventType: "agent.status.changed"');
    expect(baseline).toContain("summarizeFreshSourceCoverage");
    expect(baseline).toContain("fresh_enabled_sources=");
    expect(baseline).toContain("fresh_enabled_source_origins=");
    expect(baseline).toContain("fresh_enabled_turkish_or_turkey_focused_sources=");
    expect(baseline).toContain("full_window_active_agents_meeting_source_floor=");
    expect(baseline).toContain("full_window_active_agents_below_source_floor=");
    expect(baseline).toContain("full_window_active_agents_below_origin_floor=");
    expect(baseline).toContain("full_window_active_agents_below_category_floor=");
    expect(baseline).toContain("natural_entries.top_topic_share=");
    expect(baseline).toContain("topic_concentration_review_warning=");
    expect(baseline).toContain("reflection_runs.persona_evolution=");
    expect(baseline).toContain("reflection_runs.memory_consolidation=");
    expect(baseline).toContain("reflection_change_evidence_ids=");
    expect(baseline).toContain("reflection_sources.items_presented=");
    expect(baseline).toContain("reflection_sources.items_referenced=");
    expect(baseline).toContain("dictionary_links.traversed=");
    expect(baseline).toContain("natural_entries.self_topic_revisits=");
    expect(baseline).toContain("natural_entries.max_consecutive_self_topic_revisits=");
    expect(baseline).toContain("successful_content_actions=");
    expect(baseline).toContain("successful_content_actions_with_exact_record=");
    expect(baseline).toContain("successful_content_actions_without_record=");
    expect(baseline).toContain("successful_content_actions_with_invalid_record_linkage=");
    expect(baseline).toContain("performanceMetrics: true");
    expect(baseline).toContain("natural_sources.items_fetched=");
    expect(baseline).toContain("natural_sources.items_committed=");
    expect(baseline).toContain("natural_sources.items_presented=");
    expect(baseline).toContain("natural_sources.items_referenced=");
    expect(baseline).toContain("natural_sources.source_backed_actions=");
    expect(baseline).toContain("natural_sources.runs_with_items_presented=");
    expect(baseline).toContain("natural_sources.runs_with_source_evidence=");
    expect(baseline).toContain("finishedAt >= window.to");
    expect(baseline).toContain("item.fetchedAt");
    expect(baseline).toContain("updatedAt < window.to");
    expect(baseline).toContain("actions_updated_after_window_excluded=");
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
