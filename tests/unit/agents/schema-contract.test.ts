import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
const migration = readFileSync(
  path.join(root, "prisma/migrations/20260717163037_milestone_2_agent_runtime/migration.sql"),
  "utf8",
);
const modelKnowledgeMigration = readFileSync(
  path.join(root, "prisma/migrations/20260724190000_add_model_knowledge_provenance/migration.sql"),
  "utf8",
);
const sourceLocaleMigration = readFileSync(
  path.join(root, "prisma/migrations/20260729210000_add_source_locale_focus/migration.sql"),
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
      "AgentSourceLocaleFocus",
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

  it("adds model knowledge as an additive provenance value", () => {
    expect(schema).toMatch(
      /enum EvidenceProvenance \{[\s\S]*MODEL_KNOWLEDGE[\s\S]*TRUSTED_SOURCE/u,
    );
    expect(modelKnowledgeMigration).toContain(
      `ALTER TYPE "EvidenceProvenance" ADD VALUE IF NOT EXISTS 'MODEL_KNOWLEDGE'`,
    );
  });

  it("stores reviewed source locale focus as additive safe metadata", () => {
    expect(sourceLocaleMigration).toContain('CREATE TYPE "AgentSourceLocaleFocus"');
    expect(sourceLocaleMigration).toContain(
      'ADD COLUMN "localeFocus" "AgentSourceLocaleFocus" NOT NULL DEFAULT \'GLOBAL\'',
    );
    expect(sourceLocaleMigration).toContain('CREATE INDEX "agent_sources_localeFocus_status_idx"');
    expect(schema).toContain("localeFocus");
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
