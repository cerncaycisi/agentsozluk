import { createHash } from "node:crypto";
import { z } from "zod";

// Native PG16 custom dump/restore'da ölçülen exact yazım çiftleri.
// Yalnız aynı nesne ve tam original tanım eşleşirse canonical yazım kullanılır.
// Bilinmeyen tanım, eşik, operand veya bayrak değişikliği korunur ve hash'i değiştirir.
export const resetRestoreConstraintAliases = [
  {
    table: "agent_global_settings",
    name: "agent_global_settings_default_quota_check",
    original:
      'CHECK (((("defaultDailyEntryMin" >= 0) AND ("defaultDailyEntryMin" <= 100)) AND (("defaultDailyEntryMax" >= "defaultDailyEntryMin") AND ("defaultDailyEntryMax" <= 100))))',
    canonical:
      'CHECK ((("defaultDailyEntryMin" >= 0) AND ("defaultDailyEntryMin" <= 100) AND (("defaultDailyEntryMax" >= "defaultDailyEntryMin") AND ("defaultDailyEntryMax" <= 100))))',
  },
  {
    table: "agent_global_settings",
    name: "agent_global_settings_global_quota_check",
    original:
      'CHECK (((("globalDailyEntryMin" >= 0) AND ("globalDailyEntryMin" <= 5000)) AND (("globalDailyEntryMax" >= "globalDailyEntryMin") AND ("globalDailyEntryMax" <= 5000))))',
    canonical:
      'CHECK ((("globalDailyEntryMin" >= 0) AND ("globalDailyEntryMin" <= 5000) AND (("globalDailyEntryMax" >= "globalDailyEntryMin") AND ("globalDailyEntryMax" <= 5000))))',
  },
  {
    table: "agent_profiles",
    name: "agent_profiles_entry_quota_check",
    original:
      'CHECK (((("dailyEntryMin" IS NULL) AND ("dailyEntryMax" IS NULL)) OR ((("dailyEntryMin" >= 0) AND ("dailyEntryMin" <= 100)) AND (("dailyEntryMax" >= "dailyEntryMin") AND ("dailyEntryMax" <= 100)))))',
    canonical:
      'CHECK (((("dailyEntryMin" IS NULL) AND ("dailyEntryMax" IS NULL)) OR (("dailyEntryMin" >= 0) AND ("dailyEntryMin" <= 100) AND (("dailyEntryMax" >= "dailyEntryMin") AND ("dailyEntryMax" <= 100)))))',
  },
  {
    table: "agent_profiles",
    name: "agent_profiles_topic_quota_check",
    original:
      'CHECK (((("dailyTopicMin" >= 0) AND ("dailyTopicMin" <= 100)) AND (("dailyTopicMax" >= "dailyTopicMin") AND ("dailyTopicMax" <= 100))))',
    canonical:
      'CHECK ((("dailyTopicMin" >= 0) AND ("dailyTopicMin" <= 100) AND (("dailyTopicMax" >= "dailyTopicMin") AND ("dailyTopicMax" <= 100))))',
  },
  {
    table: "agent_profiles",
    name: "agent_profiles_vote_quota_check",
    original:
      'CHECK (((("dailyVoteMin" >= 0) AND ("dailyVoteMin" <= 100)) AND (("dailyVoteMax" >= "dailyVoteMin") AND ("dailyVoteMax" <= 100))))',
    canonical:
      'CHECK ((("dailyVoteMin" >= 0) AND ("dailyVoteMin" <= 100) AND (("dailyVoteMax" >= "dailyVoteMin") AND ("dailyVoteMax" <= 100))))',
  },
  {
    table: "agent_relationships",
    name: "agent_relationship_scores_check",
    original:
      "CHECK ((((familiarity >= (0)::double precision) AND (familiarity <= (1)::double precision)) AND ((trust >= (0)::double precision) AND (trust <= (1)::double precision)) AND ((interest >= (0)::double precision) AND (interest <= (1)::double precision)) AND ((disagreement >= (0)::double precision) AND (disagreement <= (1)::double precision))))",
    canonical:
      "CHECK (((familiarity >= (0)::double precision) AND (familiarity <= (1)::double precision) AND ((trust >= (0)::double precision) AND (trust <= (1)::double precision)) AND ((interest >= (0)::double precision) AND (interest <= (1)::double precision)) AND ((disagreement >= (0)::double precision) AND (disagreement <= (1)::double precision))))",
  },
  {
    table: "agent_runs",
    name: "agent_runs_desired_entry_check",
    original:
      'CHECK (((("desiredEntryMin" >= 0) AND ("desiredEntryMin" <= 10)) AND (("desiredEntryMax" >= "desiredEntryMin") AND ("desiredEntryMax" <= 10))))',
    canonical:
      'CHECK ((("desiredEntryMin" >= 0) AND ("desiredEntryMin" <= 10) AND (("desiredEntryMax" >= "desiredEntryMin") AND ("desiredEntryMax" <= 10))))',
  },
  {
    table: "agent_schedule_slots",
    name: "agent_schedule_slots_desired_entry_check",
    original:
      'CHECK (((("desiredEntryMin" >= 0) AND ("desiredEntryMin" <= 4)) AND (("desiredEntryMax" >= "desiredEntryMin") AND ("desiredEntryMax" <= 4))))',
    canonical:
      'CHECK ((("desiredEntryMin" >= 0) AND ("desiredEntryMin" <= 4) AND (("desiredEntryMax" >= "desiredEntryMin") AND ("desiredEntryMax" <= 4))))',
  },
  {
    table: "agent_sources",
    name: "agent_sources_scores_check",
    original:
      'CHECK (((("trustScore" >= (0)::double precision) AND ("trustScore" <= (1)::double precision)) AND (("interestScore" >= (0)::double precision) AND ("interestScore" <= (1)::double precision)) AND (("noveltyScore" >= (0)::double precision) AND ("noveltyScore" <= (1)::double precision)) AND (("usefulnessScore" >= (0)::double precision) AND ("usefulnessScore" <= (1)::double precision))))',
    canonical:
      'CHECK ((("trustScore" >= (0)::double precision) AND ("trustScore" <= (1)::double precision) AND (("interestScore" >= (0)::double precision) AND ("interestScore" <= (1)::double precision)) AND (("noveltyScore" >= (0)::double precision) AND ("noveltyScore" <= (1)::double precision)) AND (("usefulnessScore" >= (0)::double precision) AND ("usefulnessScore" <= (1)::double precision))))',
  },
  {
    table: "great_reset_tombstones",
    name: "great_reset_tombstones_kind_check",
    original:
      "CHECK (((kind)::text = ANY ((ARRAY['TOPIC'::character varying, 'ENTRY'::character varying])::text[])))",
    canonical:
      "CHECK (((kind)::text = ANY (ARRAY[('TOPIC'::character varying)::text, ('ENTRY'::character varying)::text])))",
  },
] as const;

export const resetRestoreIndexAliases = [
  {
    name: "agent_runtime_events_rollout_attempt_terminal_unique",
    original:
      "CREATE UNIQUE INDEX agent_runtime_events_rollout_attempt_terminal_unique ON public.agent_runtime_events USING btree (((metadata ->> 'attemptId'::text))) WHERE (((\"eventType\")::text = ANY ((ARRAY['runtime.production.rollout_attempt.aborted'::character varying, 'runtime.production.rollout_attempt.completed'::character varying])::text[])) AND (\"agentProfileId\" IS NULL) AND (\"runId\" IS NULL) AND (\"actionId\" IS NULL) AND ((metadata ->> 'attemptId'::text) IS NOT NULL))",
    canonical:
      "CREATE UNIQUE INDEX agent_runtime_events_rollout_attempt_terminal_unique ON public.agent_runtime_events USING btree (((metadata ->> 'attemptId'::text))) WHERE (((\"eventType\")::text = ANY (ARRAY[('runtime.production.rollout_attempt.aborted'::character varying)::text, ('runtime.production.rollout_attempt.completed'::character varying)::text])) AND (\"agentProfileId\" IS NULL) AND (\"runId\" IS NULL) AND (\"actionId\" IS NULL) AND ((metadata ->> 'attemptId'::text) IS NOT NULL))",
  },
  {
    name: "agent_runtime_events_rollout_checkpoint_unique",
    original:
      "CREATE UNIQUE INDEX agent_runtime_events_rollout_checkpoint_unique ON public.agent_runtime_events USING btree (((metadata ->> 'attemptId'::text)), \"eventType\", COALESCE((metadata ->> 'checkpointMinute'::text), ''::text)) WHERE (((\"eventType\")::text = ANY ((ARRAY['runtime.production.rollout_gate9.completed'::character varying, 'runtime.production.rollout_gate10.started'::character varying, 'runtime.production.rollout_gate10.checkpoint'::character varying, 'runtime.production.rollout_gate10.completed'::character varying, 'runtime.production.rollout_gate11.started'::character varying, 'runtime.production.rollout_gate11.completed'::character varying, 'runtime.production.rollout_gate12.pre_reboot'::character varying, 'runtime.production.rollout_gate12.post_reboot'::character varying, 'runtime.production.rollout_gate12.completed'::character varying])::text[])) AND (\"agentProfileId\" IS NULL) AND (\"runId\" IS NULL) AND (\"actionId\" IS NULL) AND ((metadata ->> 'attemptId'::text) IS NOT NULL))",
    canonical:
      "CREATE UNIQUE INDEX agent_runtime_events_rollout_checkpoint_unique ON public.agent_runtime_events USING btree (((metadata ->> 'attemptId'::text)), \"eventType\", COALESCE((metadata ->> 'checkpointMinute'::text), ''::text)) WHERE (((\"eventType\")::text = ANY (ARRAY[('runtime.production.rollout_gate9.completed'::character varying)::text, ('runtime.production.rollout_gate10.started'::character varying)::text, ('runtime.production.rollout_gate10.checkpoint'::character varying)::text, ('runtime.production.rollout_gate10.completed'::character varying)::text, ('runtime.production.rollout_gate11.started'::character varying)::text, ('runtime.production.rollout_gate11.completed'::character varying)::text, ('runtime.production.rollout_gate12.pre_reboot'::character varying)::text, ('runtime.production.rollout_gate12.post_reboot'::character varying)::text, ('runtime.production.rollout_gate12.completed'::character varying)::text])) AND (\"agentProfileId\" IS NULL) AND (\"runId\" IS NULL) AND (\"actionId\" IS NULL) AND ((metadata ->> 'attemptId'::text) IS NOT NULL))",
  },
] as const;

const metadataKeys = [
  "database",
  "settings",
  "schemas",
  "columns",
  "relations",
  "constraints",
  "indexes",
  "triggers",
  "rules",
  "functions",
  "enums",
  "extensions",
  "roles",
  "memberships",
  "defaultPrivileges",
] as const;
const metadataSchema = z
  .object({
    parts: z
      .record(z.string(), z.string().regex(/^[a-f0-9]{64}$/u))
      .refine(
        (parts) =>
          JSON.stringify(Object.keys(parts).sort()) === JSON.stringify([...metadataKeys].sort()),
      ),
    constraints: z
      .array(
        z.tuple([
          z.string(),
          z.string(),
          z.string(),
          z.string(),
          z.boolean(),
          z.boolean(),
          z.boolean(),
        ]),
      )
      .nullable(),
    indexes: z
      .array(z.tuple([z.string(), z.string(), z.boolean(), z.boolean(), z.boolean(), z.boolean()]))
      .nullable(),
  })
  .strict();
function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
/** Tam katalog bileşenleri hash'lenir; yalnız ölçülen PG yazım çiftleri eşlenir. */
export function digestResetRestoreMetadata(value: unknown) {
  const parsed = metadataSchema.safeParse(value);
  if (!parsed.success) throw new Error("GREAT_RESET_CATALOG_FORMAT_UNSUPPORTED");
  const { parts, constraints, indexes } = parsed.data;
  const normalizedConstraints =
    constraints?.map((row) => {
      const [table, name, kind, definition] = row;
      const alias =
        kind === "c"
          ? resetRestoreConstraintAliases.find(
              (a) => a.table === table && a.name === name && a.original === definition,
            )
          : undefined;
      return [table, name, kind, alias?.canonical ?? definition, ...row.slice(4)];
    }) ?? null;
  const normalizedIndexes =
    indexes?.map((row) => {
      const [name, definition] = row;
      const alias = resetRestoreIndexAliases.find(
        (a) => a.name === name && a.original === definition,
      );
      return [name, alias?.canonical ?? definition, ...row.slice(2)];
    }) ?? null;
  const normalizedParts = {
    ...parts,
    constraints: digest(normalizedConstraints),
    indexes: digest(normalizedIndexes),
  };
  const ordered = Object.fromEntries(
    Object.entries(normalizedParts).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  return { sha256: digest(ordered), parts: ordered };
}
