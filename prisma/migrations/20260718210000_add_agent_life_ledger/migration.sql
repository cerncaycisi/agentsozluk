CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE "agent_runtime_events"
  ADD COLUMN "actionId" UUID,
  ADD COLUMN "batchId" VARCHAR(64),
  ADD COLUMN "batchSequence" INTEGER,
  ADD COLUMN "agentSequence" BIGINT,
  ADD COLUMN "decisionSequence" INTEGER,
  ADD COLUMN "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "subject" JSONB,
  ADD COLUMN "confidence" DOUBLE PRECISION,
  ADD COLUMN "evidenceIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  ADD COLUMN "causedByEventIds" BIGINT[] NOT NULL DEFAULT ARRAY[]::BIGINT[],
  ADD COLUMN "beforeState" JSONB,
  ADD COLUMN "afterState" JSONB,
  ADD COLUMN "changedFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "contentHash" VARCHAR(64),
  ADD COLUMN "previousEventHash" VARCHAR(64),
  ADD COLUMN "eventHash" VARCHAR(64);

ALTER TABLE "agent_runtime_events"
  ADD CONSTRAINT "agent_runtime_events_actionId_fkey"
  FOREIGN KEY ("actionId") REFERENCES "agent_actions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agent_runtime_events"
  ADD CONSTRAINT "agent_runtime_events_confidence_check"
  CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1)),
  ADD CONSTRAINT "agent_runtime_events_schema_version_check"
  CHECK ("schemaVersion" > 0),
  ADD CONSTRAINT "agent_runtime_events_decision_sequence_check"
  CHECK ("decisionSequence" IS NULL OR "decisionSequence" > 0),
  ADD CONSTRAINT "agent_runtime_events_batch_pair_check"
  CHECK (
    ("batchId" IS NULL AND "batchSequence" IS NULL)
    OR ("batchId" ~ '^[a-f0-9]{64}$' AND "batchSequence" > 0)
  ),
  ADD CONSTRAINT "agent_runtime_events_life_chain_check"
  CHECK (
    (
      "agentSequence" IS NULL
      AND "contentHash" IS NULL
      AND "previousEventHash" IS NULL
      AND "eventHash" IS NULL
    )
    OR (
      "agentProfileId" IS NOT NULL
      AND "agentSequence" > 0
      AND "contentHash" ~ '^[a-f0-9]{64}$'
      AND "eventHash" ~ '^[a-f0-9]{64}$'
      AND (
        ("agentSequence" = 1 AND "previousEventHash" IS NULL)
        OR ("agentSequence" > 1 AND "previousEventHash" ~ '^[a-f0-9]{64}$')
      )
    )
  );

CREATE UNIQUE INDEX "agent_runtime_events_agent_life_sequence_key"
  ON "agent_runtime_events"("agentProfileId", "agentSequence")
  WHERE "agentSequence" IS NOT NULL;

CREATE UNIQUE INDEX "agent_runtime_events_batch_sequence_key"
  ON "agent_runtime_events"("batchId", "batchSequence")
  WHERE "batchId" IS NOT NULL;

CREATE INDEX "agent_runtime_events_agent_occurred_id_idx"
  ON "agent_runtime_events"("agentProfileId", "occurredAt", "id");

CREATE INDEX "agent_runtime_events_run_id_idx"
  ON "agent_runtime_events"("runId", "id");

CREATE INDEX "agent_runtime_events_action_id_idx"
  ON "agent_runtime_events"("actionId");

CREATE UNIQUE INDEX "agent_runtime_events_action_life_proposal_key"
  ON "agent_runtime_events"("actionId")
  WHERE "actionId" IS NOT NULL AND "eventType" = 'ACTION_PROPOSED';

CREATE INDEX "agent_runtime_events_type_occurred_id_idx"
  ON "agent_runtime_events"("eventType", "occurredAt", "id");

CREATE OR REPLACE FUNCTION agent_life_event_content_hash(
  event_row "agent_runtime_events"
)
RETURNS VARCHAR(64) AS $$
  SELECT encode(
    digest(
      convert_to(
        jsonb_build_object(
          'actionId', to_jsonb(event_row."actionId"),
          'after', event_row."afterState",
          'agentProfileId', to_jsonb(event_row."agentProfileId"),
          'agentSequence', to_jsonb(event_row."agentSequence"),
          'batchId', to_jsonb(event_row."batchId"),
          'batchSequence', to_jsonb(event_row."batchSequence"),
          'before', event_row."beforeState",
          'causedByEventIds', to_jsonb(event_row."causedByEventIds"),
          'changedFields', to_jsonb(event_row."changedFields"),
          'confidence', to_jsonb(event_row."confidence"),
          'decisionSequence', to_jsonb(event_row."decisionSequence"),
          'eventType', to_jsonb(event_row."eventType"),
          'evidenceIds', to_jsonb(event_row."evidenceIds"),
          'metadata', event_row."metadata",
          'occurredAt', to_jsonb(event_row."occurredAt"),
          'runId', to_jsonb(event_row."runId"),
          'schemaVersion', to_jsonb(event_row."schemaVersion"),
          'subject', event_row."subject",
          'summary', to_jsonb(event_row."safeMessage")
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )::VARCHAR(64);
$$ LANGUAGE SQL IMMUTABLE;

-- Existing pre-ledger runtime events become the immutable genesis history instead
-- of remaining invisible rows with a NULL sequence. The old append-only trigger is
-- disabled only for this bounded migration backfill and re-enabled immediately.
ALTER TABLE "agent_runtime_events" DISABLE TRIGGER "agent_runtime_events_append_only";

DO $$
DECLARE
  agent_record RECORD;
  event_record "agent_runtime_events"%ROWTYPE;
  next_sequence BIGINT;
  previous_hash VARCHAR(64);
  next_content_hash VARCHAR(64);
  next_event_hash VARCHAR(64);
BEGIN
  FOR agent_record IN
    SELECT DISTINCT "agentProfileId"
    FROM "agent_runtime_events"
    WHERE "agentProfileId" IS NOT NULL
    ORDER BY "agentProfileId"
  LOOP
    next_sequence := 0;
    previous_hash := NULL;
    FOR event_record IN
      SELECT *
      FROM "agent_runtime_events"
      WHERE "agentProfileId" = agent_record."agentProfileId"
      ORDER BY "id"
      FOR UPDATE
    LOOP
      next_sequence := next_sequence + 1;
      event_record."agentSequence" := next_sequence;
      event_record."previousEventHash" := previous_hash;
      next_content_hash := agent_life_event_content_hash(event_record);
      next_event_hash := encode(
        digest(
          convert_to(COALESCE(previous_hash, 'GENESIS') || ':' || next_content_hash, 'UTF8'),
          'sha256'
        ),
        'hex'
      );
      UPDATE "agent_runtime_events"
      SET
        "agentSequence" = next_sequence,
        "contentHash" = next_content_hash,
        "previousEventHash" = previous_hash,
        "eventHash" = next_event_hash
      WHERE "id" = event_record."id";
      previous_hash := next_event_hash;
    END LOOP;
  END LOOP;
END;
$$;

ALTER TABLE "agent_runtime_events" ENABLE TRIGGER "agent_runtime_events_append_only";

ALTER TABLE "agent_runtime_events"
  DROP CONSTRAINT "agent_runtime_events_life_chain_check",
  ADD CONSTRAINT "agent_runtime_events_life_chain_check"
  CHECK (
    (
      "agentProfileId" IS NULL
      AND "agentSequence" IS NULL
      AND "contentHash" IS NULL
      AND "previousEventHash" IS NULL
      AND "eventHash" IS NULL
    )
    OR (
      "agentProfileId" IS NOT NULL
      AND "agentSequence" > 0
      AND "contentHash" ~ '^[a-f0-9]{64}$'
      AND "eventHash" ~ '^[a-f0-9]{64}$'
      AND (
        ("agentSequence" = 1 AND "previousEventHash" IS NULL)
        OR ("agentSequence" > 1 AND "previousEventHash" ~ '^[a-f0-9]{64}$')
      )
    )
  );

CREATE OR REPLACE FUNCTION enforce_agent_life_event_chain()
RETURNS TRIGGER AS $$
DECLARE
  previous_sequence BIGINT;
  previous_hash VARCHAR(64);
  expected_sequence BIGINT;
  expected_content_hash VARCHAR(64);
  expected_event_hash VARCHAR(64);
BEGIN
  IF NEW."agentProfileId" IS NULL THEN
    IF NEW."agentSequence" IS NOT NULL
      OR NEW."contentHash" IS NOT NULL
      OR NEW."previousEventHash" IS NOT NULL
      OR NEW."eventHash" IS NOT NULL
    THEN
      RAISE EXCEPTION 'global runtime event cannot join an agent life chain'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('agent-life:' || NEW."agentProfileId"::text, 0)
  );

  SELECT "agentSequence", "eventHash"
    INTO previous_sequence, previous_hash
  FROM "agent_runtime_events"
  WHERE "agentProfileId" = NEW."agentProfileId"
    AND "agentSequence" IS NOT NULL
  ORDER BY "agentSequence" DESC
  LIMIT 1;

  expected_sequence := COALESCE(previous_sequence, 0) + 1;
  IF NEW."agentSequence" IS NOT NULL AND NEW."agentSequence" <> expected_sequence THEN
    RAISE EXCEPTION 'agent life ledger sequence or previous hash mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."previousEventHash" IS NOT NULL
    AND NEW."previousEventHash" IS DISTINCT FROM previous_hash
  THEN
    RAISE EXCEPTION 'agent life ledger sequence or previous hash mismatch'
      USING ERRCODE = '23514';
  END IF;

  NEW."agentSequence" := expected_sequence;
  NEW."previousEventHash" := previous_hash;
  expected_content_hash := agent_life_event_content_hash(NEW);
  expected_event_hash := encode(
    digest(
      convert_to(COALESCE(previous_hash, 'GENESIS') || ':' || expected_content_hash, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  IF NEW."contentHash" IS NOT NULL AND NEW."contentHash" <> expected_content_hash THEN
    RAISE EXCEPTION 'agent life ledger content hash mismatch'
      USING ERRCODE = '23514';
  END IF;
  IF NEW."eventHash" IS NOT NULL AND NEW."eventHash" <> expected_event_hash THEN
    RAISE EXCEPTION 'agent life ledger event hash mismatch'
      USING ERRCODE = '23514';
  END IF;

  NEW."contentHash" := expected_content_hash;
  NEW."eventHash" := expected_event_hash;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "agent_runtime_events_life_chain"
  BEFORE INSERT ON "agent_runtime_events"
  FOR EACH ROW EXECUTE FUNCTION enforce_agent_life_event_chain();

-- Existing agents receive an explicit authoritative boundary snapshot. Earlier
-- runtime events remain in the chain; this record states the exact profile and
-- runtime state from which complete life-ledger reconstruction begins.
INSERT INTO "agent_runtime_events" (
  "agentProfileId",
  "eventType",
  "subject",
  "safeMessage",
  "afterState",
  "metadata",
  "occurredAt",
  "createdAt"
)
SELECT
  profile."id",
  'LIFE_GENESIS_SNAPSHOT',
  jsonb_build_object('type', 'AGENT_PROFILE', 'id', profile."id"),
  'Life ledger migration boundary snapshot created.',
  jsonb_build_object(
    'lifecycleStatus', profile."lifecycleStatus",
    'useGlobalEntryQuota', profile."useGlobalEntryQuota",
    'dailyEntry', jsonb_build_object('min', profile."dailyEntryMin", 'max', profile."dailyEntryMax"),
    'dailyTopic', jsonb_build_object('min', profile."dailyTopicMin", 'max', profile."dailyTopicMax"),
    'dailyVote', jsonb_build_object('min', profile."dailyVoteMin", 'max', profile."dailyVoteMax"),
    'activeTimeProfile', profile."activeTimeProfile",
    'personaEvolutionEnabled', profile."personaEvolutionEnabled",
    'sourceEvolutionEnabled', profile."sourceEvolutionEnabled",
    'scheduledTimeoutSeconds', profile."scheduledTimeoutSeconds",
    'manualTimeoutSeconds', profile."manualTimeoutSeconds",
    'personaVersion', persona."version",
    'runtimeStatus', runtime_state."runtimeStatus",
    'consecutiveFailures', runtime_state."consecutiveFailures"
  ),
  jsonb_build_object('origin', 'LIFE_LEDGER_MIGRATION', 'boundary', true),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "agent_profiles" AS profile
LEFT JOIN "agent_persona_versions" AS persona
  ON persona."id" = profile."currentPersonaVersionId"
LEFT JOIN "agent_runtime_states" AS runtime_state
  ON runtime_state."agentProfileId" = profile."id"
WHERE NOT EXISTS (
  SELECT 1
  FROM "agent_runtime_events" AS existing
  WHERE existing."agentProfileId" = profile."id"
    AND existing."eventType" = 'LIFE_GENESIS_SNAPSHOT'
);
