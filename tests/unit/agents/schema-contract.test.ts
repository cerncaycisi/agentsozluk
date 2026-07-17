import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
const migration = readFileSync(
  path.join(root, "prisma/migrations/20260717163037_milestone_2_agent_runtime/migration.sql"),
  "utf8",
);

describe("Milestone 2 agent database contract", () => {
  it("declares every required runtime enum", () => {
    for (const enumName of [
      "AgentLifecycleStatus",
      "AgentRuntimeStatus",
      "AgentRunType",
      "AgentRunStatus",
      "AgentQueuePriority",
      "AgentActionType",
      "AgentActionStatus",
      "AgentSourceStatus",
      "PersonaChangeOrigin",
      "ScheduleSlotStatus",
      "QuotaMode",
      "AgentCapacityStatus",
      "EvidenceProvenance",
      "IndexingMode",
    ]) {
      expect(schema).toContain(`enum ${enumName} {`);
    }
  });

  it("declares the control-plane, runtime, memory and provenance models", () => {
    for (const model of [
      "AgentProfile",
      "AgentPersonaVersion",
      "AgentRuntimeState",
      "AgentGlobalSettings",
      "AgentDailyPlan",
      "AgentScheduleSlot",
      "AgentRun",
      "AgentRunEvent",
      "AgentAction",
      "AgentSource",
      "AgentSourceItem",
      "AgentMemoryEpisode",
      "AgentBelief",
      "AgentRelationship",
      "AgentCredential",
      "AgentRuntimeCapability",
      "AgentCapacitySnapshot",
      "UserFollow",
      "AgentRuntimeEvent",
      "AgentContentRecord",
      "AgentTopicWriteLock",
    ]) {
      expect(schema).toContain(`model ${model} {`);
    }
  });

  it("enforces queue, identity, quota and append-only invariants in PostgreSQL", () => {
    for (const invariant of [
      "users_agent_role_check",
      "users_agent_login_disabled_check",
      "user_follows_no_self_check",
      "agent_profiles_entry_quota_check",
      "agent_global_settings_concurrency_check",
      "agent_runs_lease_check",
      "agent_runs_one_active_per_agent_idx",
      "agent_persona_versions_append_only",
      "agent_run_events_append_only",
      "agent_runtime_events_append_only",
      "agent_actions_no_delete",
      "agent_actions_immutable_proposal",
    ]) {
      expect(migration).toContain(invariant);
    }
  });

  it("creates safe production defaults without a credential", () => {
    expect(migration).toContain('INSERT INTO "agent_global_settings"');
    expect(migration).toContain('"codexConcurrency" INTEGER NOT NULL DEFAULT 1');
    expect(migration).toContain('"degradedMode" BOOLEAN NOT NULL DEFAULT false');
    expect(migration).not.toMatch(/tokenHash[^\n]*DEFAULT/iu);
  });
});
