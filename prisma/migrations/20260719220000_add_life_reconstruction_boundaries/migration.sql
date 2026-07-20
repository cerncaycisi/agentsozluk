-- A canonical, privacy-safe projection used both by the one-time migration
-- boundary and by newly-created agent genesis events. Free-form values that can
-- contain URLs, credentials, prompts or model-authored text are represented only
-- by a deterministic hash after the relevant safety predicate passes. Secret-classified
-- scalar values and unproven legacy JSON are neither copied nor hash-derived.
CREATE OR REPLACE FUNCTION agent_life_snapshot_hash(value TEXT)
RETURNS VARCHAR(64) AS $$
  SELECT encode(digest(convert_to(value, 'UTF8'), 'sha256'), 'hex')::VARCHAR(64);
$$ LANGUAGE SQL IMMUTABLE STRICT;

CREATE OR REPLACE FUNCTION agent_life_snapshot_has_non_ascii_whitespace(value TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      133, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198,
      8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279
    ]) AS codepoint(code)
    WHERE strpos(value, chr(codepoint.code)) > 0
  );
$$ LANGUAGE SQL IMMUTABLE STRICT;

CREATE OR REPLACE FUNCTION agent_life_snapshot_safe_text(value TEXT)
RETURNS TEXT AS $$
DECLARE
  token_candidate TEXT;
BEGIN
  IF value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR value ~* '^([a-f0-9]{40}|[a-f0-9]{64})$'
    OR value ~ '[[:cntrl:]]'
    OR agent_life_snapshot_has_non_ascii_whitespace(value)
    OR value ~* '</?[a-z][^>]*>'
    OR value ~* '(https?://|www\.)'
    OR value ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'
    OR value ~* '(^|[^[:alnum:]_])(sk-|agt_|Bearer[[:space:]])'
    OR value ~* '-----BEGIN [A-Z ]*PRIVATE KEY-----'
    OR value ~ '(^|[^A-Za-z0-9_])eyJ[A-Za-z0-9_-]{10,}[.][A-Za-z0-9_-]{10,}[.][A-Za-z0-9_-]{8,}($|[^A-Za-z0-9_])'
    OR value ~* '(api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)[[:space:]]*[:=]'
    OR value ~* '[?&](token|key|sig|signature|credential|x-amz-[^=]+|x-goog-[^=]+)='
    OR value ~* '(^|[^a-f0-9])([a-f0-9]{64}|[a-f0-9]{40})($|[^a-f0-9])'
    OR value ~ '^[[:space:]]*[0-9]{6}[[:space:]]*$'
    OR value ~* '(otp|one[- ]?time([[:space:]]+(password|code))?|verification([[:space:]]+code)?|doğrulama([[:space:]]+kodu)?|giriş[[:space:]]+kodu)[^0-9]{0,32}[0-9]{6}'
  THEN
    RETURN NULL;
  END IF;

  FOR token_candidate IN
    SELECT match[1]
    FROM regexp_matches(value, '([A-Za-z0-9_-]{24,})', 'g') AS match
  LOOP
    IF token_candidate !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND token_candidate ~ '[a-z]'
      AND token_candidate ~ '[A-Z]'
      AND token_candidate ~ '[0-9]'
    THEN
      RETURN NULL;
    END IF;
  END LOOP;
  RETURN value;
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

CREATE OR REPLACE FUNCTION agent_life_snapshot_safe_hash(value TEXT)
RETURNS VARCHAR(64) AS $$
  SELECT CASE
    WHEN agent_life_snapshot_safe_text(value) IS NULL THEN NULL
    ELSE agent_life_snapshot_hash(value)
  END;
$$ LANGUAGE SQL IMMUTABLE STRICT;

CREATE OR REPLACE FUNCTION agent_life_snapshot_safe_url_hash(value TEXT)
RETURNS VARCHAR(64) AS $$
  SELECT CASE
    WHEN value !~* '^https?://'
      OR value ~ '[[:cntrl:]]'
      OR value ~* '^https?://[^/?#[:space:]]*@'
      OR value ~ '#'
      OR value ~* '[?&](access[_-]?token|api[_-]?key|auth|authorization|aws[_-]?access[_-]?key[_-]?id|credential|expires|google[_-]?access[_-]?id|key|password|policy|refresh[_-]?token|secret|sig|signature|token|x-amz-[^=]+|x-goog-[^=]+)='
    THEN NULL
    ELSE agent_life_snapshot_hash(value)
  END;
$$ LANGUAGE SQL IMMUTABLE STRICT;

CREATE OR REPLACE FUNCTION agent_life_snapshot_safe_fast_state(value JSONB)
RETURNS JSONB AS $$
DECLARE
  curiosity_value JSONB;
  confidence_value JSONB;
  safe_topic_fatigue JSONB;
BEGIN
  IF jsonb_typeof(value) IS DISTINCT FROM 'object'
    OR jsonb_typeof(value -> 'curiosity') IS DISTINCT FROM 'number'
    OR jsonb_typeof(value -> 'confidence') IS DISTINCT FROM 'number'
    OR jsonb_typeof(value -> 'topicFatigue') IS DISTINCT FROM 'object'
  THEN
    RETURN NULL;
  END IF;

  curiosity_value := value -> 'curiosity';
  confidence_value := value -> 'confidence';
  IF (curiosity_value #>> '{}')::NUMERIC NOT BETWEEN 0 AND 1
    OR (confidence_value #>> '{}')::NUMERIC NOT BETWEEN 0 AND 1
  THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(
    jsonb_object_agg(topic."key", topic."value" ORDER BY topic."key" COLLATE "C"),
    '{}'::JSONB
  )
  INTO safe_topic_fatigue
  FROM (
    SELECT ranked.normalized_key AS "key", ranked.candidate_value AS "value"
    FROM (
      SELECT
        btrim(candidate."key") AS normalized_key,
        candidate."key" AS original_key,
        candidate."value" AS candidate_value,
        row_number() OVER (
          PARTITION BY btrim(candidate."key")
          ORDER BY
            (candidate."key" = btrim(candidate."key")) DESC,
            candidate."key" COLLATE "C"
        ) AS key_rank
      FROM jsonb_each(value -> 'topicFatigue') AS candidate("key", "value")
      WHERE char_length(btrim(candidate."key")) BETWEEN 1 AND 100
        AND agent_life_snapshot_safe_text(btrim(candidate."key")) IS NOT NULL
        AND CASE
          WHEN jsonb_typeof(candidate."value") = 'number'
          THEN (candidate."value" #>> '{}')::NUMERIC BETWEEN 0 AND 1
          ELSE FALSE
        END
    ) AS ranked
    WHERE ranked.key_rank = 1
    ORDER BY ranked.normalized_key COLLATE "C"
    LIMIT 50
  ) AS topic;

  RETURN jsonb_build_object(
    'curiosity', curiosity_value,
    'confidence', confidence_value,
    'topicFatigue', safe_topic_fatigue
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

CREATE OR REPLACE FUNCTION agent_life_snapshot_uuid_array(value JSONB)
RETURNS JSONB AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(candidate."id") ORDER BY candidate."id"), '[]'::JSONB)
  FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(value) = 'array' THEN value ELSE '[]'::JSONB END
  ) AS candidate("id")
  WHERE candidate."id" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
$$ LANGUAGE SQL IMMUTABLE;

CREATE OR REPLACE FUNCTION agent_life_reconstruction_snapshot(agent_id UUID)
RETURNS JSONB AS $$
  SELECT jsonb_build_object(
    'reconstructionVersion', 1,
    'profile', jsonb_build_object(
      'userId', profile."userId",
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
      'currentPersonaVersionId', profile."currentPersonaVersionId",
      'personaVersion', persona."version",
      'retiredAt', profile."retiredAt"
    ),
    'runtime', CASE
      WHEN runtime_state."id" IS NULL THEN NULL
      ELSE jsonb_build_object(
        'runtimeStatus', runtime_state."runtimeStatus",
        'currentRunId', runtime_state."currentRunId",
        'lastHeartbeatAt', runtime_state."lastHeartbeatAt",
        'lastRunAt', runtime_state."lastRunAt",
        'lastSuccessfulRunAt', runtime_state."lastSuccessfulRunAt",
        'nextScheduledAt', runtime_state."nextScheduledAt",
        'consecutiveFailures', runtime_state."consecutiveFailures",
        'lastErrorCode', agent_life_snapshot_safe_text(runtime_state."lastErrorCode"),
        'lastErrorSummaryHash', agent_life_snapshot_safe_hash(runtime_state."lastErrorSummary"),
        'todayDate', runtime_state."todayDate",
        'todayEntryTarget', runtime_state."todayEntryTarget",
        'todayPublishedEntries', runtime_state."todayPublishedEntries",
        'todayTopicTarget', runtime_state."todayTopicTarget",
        'todayCreatedTopics', runtime_state."todayCreatedTopics",
        'todayVoteTarget', runtime_state."todayVoteTarget",
        'todayVotes', runtime_state."todayVotes",
        'todaySourceReads', runtime_state."todaySourceReads",
        'fastState', agent_life_snapshot_safe_fast_state(
          runtime_state."runtimeMetadata" -> 'fastState'
        ),
        'runtimeMetadataHash', NULL::TEXT
      )
    END,
    'beliefs', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', belief."id",
          'topicKey', agent_life_snapshot_safe_text(belief."topicKey"),
          'topicKeyHash', agent_life_snapshot_safe_hash(belief."topicKey"),
          'statement', agent_life_snapshot_safe_text(belief."statement"),
          'statementHash', agent_life_snapshot_safe_hash(belief."statement"),
          'confidence', belief."confidence",
          'evidenceSummary', agent_life_snapshot_safe_text(belief."evidenceSummary"),
          'evidenceSummaryHash', agent_life_snapshot_safe_hash(belief."evidenceSummary"),
          'evidenceType', belief."evidenceProvenance" ->> 'evidenceType',
          'evidenceIds', agent_life_snapshot_uuid_array(
            belief."evidenceProvenance" -> 'evidenceIds'
          ),
          'evidenceProvenanceHash', NULL::TEXT,
          'firstFormedAt', belief."firstFormedAt",
          'lastUpdatedAt', belief."lastUpdatedAt",
          'version', belief."version",
          'status', belief."status"
        ) ORDER BY belief."topicKey", belief."id"
      )
      FROM (
        SELECT DISTINCT ON (candidate."topicKey") candidate.*
        FROM "agent_beliefs" AS candidate
        WHERE candidate."agentProfileId" = profile."id"
        ORDER BY candidate."topicKey", candidate."version" DESC, candidate."id" DESC
      ) AS belief
    ), '[]'::JSONB),
    'relationships', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', relationship."id",
          'targetUserId', relationship."targetUserId",
          'familiarity', relationship."familiarity",
          'trust', relationship."trust",
          'interest', relationship."interest",
          'disagreement', relationship."disagreement",
          'summary', agent_life_snapshot_safe_text(relationship."summary"),
          'summaryHash', agent_life_snapshot_safe_hash(relationship."summary"),
          'lastInteractionAt', relationship."lastInteractionAt",
          'updatedAt', relationship."updatedAt"
        ) ORDER BY relationship."targetUserId", relationship."id"
      )
      FROM "agent_relationships" AS relationship
      WHERE relationship."agentProfileId" = profile."id"
    ), '[]'::JSONB),
    'sources', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', source."id",
          'urlHash', agent_life_snapshot_safe_url_hash(source."url"),
          'normalizedDomain', source."normalizedDomain",
          'sourceType', source."sourceType",
          'status', source."status",
          'topics', COALESCE((
            SELECT jsonb_agg(to_jsonb(topic."value") ORDER BY topic."value")
            FROM jsonb_array_elements_text(source."topics") AS topic("value")
            WHERE agent_life_snapshot_safe_text(topic."value") IS NOT NULL
          ), '[]'::JSONB),
          'topicsHash', NULL::TEXT,
          'trustScore', source."trustScore",
          'interestScore', source."interestScore",
          'noveltyScore', source."noveltyScore",
          'usefulnessScore', source."usefulnessScore",
          'adminPinned', source."adminPinned",
          'adminBlocked', source."adminBlocked",
          'discoveredFromHash', agent_life_snapshot_safe_hash(source."discoveredFrom"),
          'addedByOrigin', source."addedByOrigin",
          'lastFetchedAt', source."lastFetchedAt",
          'lastUsefulAt', source."lastUsefulAt",
          'consecutiveFailures', source."consecutiveFailures"
        ) ORDER BY source."id"
      )
      FROM "agent_sources" AS source
      WHERE source."agentProfileId" = profile."id"
    ), '[]'::JSONB),
    'memories', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', memory."id",
          'runId', memory."runId",
          'eventType', memory."eventType",
          'subjectType', memory."subjectType",
          'subjectId', memory."subjectId",
          'summary', agent_life_snapshot_safe_text(memory."summary"),
          'summaryHash', agent_life_snapshot_safe_hash(memory."summary"),
          'salience', memory."salience",
          'provenance', memory."provenance",
          'sourceMemoryIds', agent_life_snapshot_uuid_array(memory."evidence" -> 'sourceMemoryIds'),
          'evidenceIds', agent_life_snapshot_uuid_array(memory."evidence" -> 'evidenceIds'),
          'actionId', CASE
            WHEN memory."evidence" ->> 'actionId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN memory."evidence" ->> 'actionId'
            ELSE NULL
          END,
          'evidenceHash', NULL::TEXT,
          'status', CASE WHEN memory."invalidatedAt" IS NULL THEN 'ACTIVE' ELSE 'INVALIDATED' END,
          'invalidatedAt', memory."invalidatedAt",
          'occurredAt', memory."occurredAt"
        ) ORDER BY memory."occurredAt", memory."id"
      )
      FROM "agent_memory_episodes" AS memory
      WHERE memory."agentProfileId" = profile."id"
    ), '[]'::JSONB),
    'socialState', jsonb_build_object(
      'followedTopicIds', COALESCE((
        SELECT jsonb_agg(to_jsonb(topic_follow."topicId") ORDER BY topic_follow."topicId")
        FROM "topic_follows" AS topic_follow
        WHERE topic_follow."userId" = profile."userId"
      ), '[]'::JSONB),
      'followedUserIds', COALESCE((
        SELECT jsonb_agg(to_jsonb(user_follow."followedId") ORDER BY user_follow."followedId")
        FROM "user_follows" AS user_follow
        WHERE user_follow."followerId" = profile."userId"
      ), '[]'::JSONB),
      'bookmarkedEntryIds', COALESCE((
        SELECT jsonb_agg(to_jsonb(bookmark."entryId") ORDER BY bookmark."entryId")
        FROM "entry_bookmarks" AS bookmark
        WHERE bookmark."userId" = profile."userId"
      ), '[]'::JSONB),
      'votes', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object('entryId', vote."entryId", 'value', vote."value")
          ORDER BY vote."entryId"
        )
        FROM "entry_votes" AS vote
        WHERE vote."userId" = profile."userId"
      ), '[]'::JSONB),
      'blockedUserIds', COALESCE((
        SELECT jsonb_agg(to_jsonb(blocked."blockedId") ORDER BY blocked."blockedId")
        FROM "user_blocks" AS blocked
        WHERE blocked."blockerId" = profile."userId"
      ), '[]'::JSONB),
      'blockingUserIds', COALESCE((
        SELECT jsonb_agg(to_jsonb(blocking."blockerId") ORDER BY blocking."blockerId")
        FROM "user_blocks" AS blocking
        WHERE blocking."blockedId" = profile."userId"
      ), '[]'::JSONB),
      'ownEntries', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object('id', entry."id", 'topicId', entry."topicId", 'status', entry."status")
          ORDER BY entry."id"
        )
        FROM "entries" AS entry
        WHERE entry."authorId" = profile."userId"
      ), '[]'::JSONB),
      'ownTopics', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object('id', topic."id", 'status', topic."status")
          ORDER BY topic."id"
        )
        FROM "topics" AS topic
        WHERE topic."createdById" = profile."userId"
      ), '[]'::JSONB)
    ),
    'actions', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', action."id",
          'runId', action."runId",
          'sequence', action."sequence",
          'actionType', action."actionType",
          'status', action."actionStatus",
          'targetType', action."targetType",
          'targetId', action."targetId",
          'inputHash', NULL::TEXT,
          'provenanceHash', NULL::TEXT,
          'validationResultHash', NULL::TEXT,
          'result', NULL::JSONB,
          'resultHash', NULL::TEXT,
          'rejectionCode', action."rejectionCode",
          'rejectionReasonHash', agent_life_snapshot_safe_hash(action."rejectionReason")
        ) ORDER BY action."runId", action."sequence", action."id"
      )
      FROM "agent_actions" AS action
      WHERE action."agentProfileId" = profile."id"
    ), '[]'::JSONB)
  )
  FROM "agent_profiles" AS profile
  LEFT JOIN "agent_persona_versions" AS persona
    ON persona."id" = profile."currentPersonaVersionId"
  LEFT JOIN "agent_runtime_states" AS runtime_state
    ON runtime_state."agentProfileId" = profile."id"
  WHERE profile."id" = agent_id;
$$ LANGUAGE SQL STABLE STRICT;

-- This helper is deliberately idempotent so the migration path can be exercised
-- against populated integration fixtures without hand-authoring an ideal event.
CREATE OR REPLACE FUNCTION append_agent_life_reconstruction_boundary(agent_id UUID)
RETURNS BIGINT AS $$
DECLARE
  boundary_id BIGINT;
  boundary_snapshot JSONB;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('agent-life-reconstruction-boundary:' || agent_id::TEXT, 0)
  );

  SELECT event."id"
    INTO boundary_id
  FROM "agent_runtime_events" AS event
  WHERE event."agentProfileId" = agent_id
    AND event."eventType" = 'LIFE_GENESIS_SNAPSHOT'
    AND event."metadata" ->> 'origin' = 'LIFE_LEDGER_RECONSTRUCTION_MIGRATION'
    AND event."metadata" ->> 'reconstructionVersion' = '1'
  ORDER BY event."id"
  LIMIT 1;

  IF boundary_id IS NOT NULL THEN
    RETURN boundary_id;
  END IF;

  boundary_snapshot := agent_life_reconstruction_snapshot(agent_id);
  IF boundary_snapshot IS NULL THEN
    RAISE EXCEPTION 'agent profile not found for life reconstruction boundary'
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO "agent_runtime_events" (
    "agentProfileId",
    "eventType",
    "subject",
    "safeMessage",
    "afterState",
    "metadata",
    "occurredAt",
    "createdAt"
  ) VALUES (
    agent_id,
    'LIFE_GENESIS_SNAPSHOT',
    jsonb_build_object('type', 'AGENT_PROFILE', 'id', agent_id),
    'Authoritative life reconstruction boundary snapshot created.',
    boundary_snapshot,
    jsonb_build_object(
      'origin', 'LIFE_LEDGER_RECONSTRUCTION_MIGRATION',
      'boundary', true,
      'reconstructionVersion', 1
    ),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  RETURNING "id" INTO boundary_id;

  RETURN boundary_id;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  agent_record RECORD;
BEGIN
  FOR agent_record IN
    SELECT profile."id"
    FROM "agent_profiles" AS profile
    ORDER BY profile."id"
  LOOP
    PERFORM append_agent_life_reconstruction_boundary(agent_record."id");
  END LOOP;
END;
$$;

-- Rollout lifecycle rows use immutable runtime events as their aggregate log.
-- Partial expression indexes make retries idempotent even if two operators race.
CREATE UNIQUE INDEX "agent_runtime_events_rollout_attempt_start_unique"
ON "agent_runtime_events" (("metadata" ->> 'attemptId'))
WHERE "eventType" = 'runtime.production.rollout_attempt.started'
  AND "agentProfileId" IS NULL
  AND "runId" IS NULL
  AND "actionId" IS NULL
  AND "metadata" ->> 'attemptId' IS NOT NULL;

CREATE UNIQUE INDEX "agent_runtime_events_rollout_attempt_terminal_unique"
ON "agent_runtime_events" (("metadata" ->> 'attemptId'))
WHERE "eventType" IN (
  'runtime.production.rollout_attempt.aborted',
  'runtime.production.rollout_attempt.completed'
)
  AND "agentProfileId" IS NULL
  AND "runId" IS NULL
  AND "actionId" IS NULL
  AND "metadata" ->> 'attemptId' IS NOT NULL;

CREATE UNIQUE INDEX "agent_runtime_events_rollout_command_unique"
ON "agent_runtime_events" (("metadata" ->> 'commandId'))
WHERE "eventType" LIKE 'runtime.production.rollout%'
  AND "agentProfileId" IS NULL
  AND "runId" IS NULL
  AND "actionId" IS NULL
  AND "metadata" ->> 'commandId' IS NOT NULL;

CREATE UNIQUE INDEX "agent_runtime_events_rollout_checkpoint_unique"
ON "agent_runtime_events" (
  ("metadata" ->> 'attemptId'),
  "eventType",
  (COALESCE("metadata" ->> 'checkpointMinute', ''))
)
WHERE "eventType" IN (
  'runtime.production.rollout_gate9.completed',
  'runtime.production.rollout_gate10.started',
  'runtime.production.rollout_gate10.checkpoint',
  'runtime.production.rollout_gate10.completed',
  'runtime.production.rollout_gate11.started',
  'runtime.production.rollout_gate11.completed',
  'runtime.production.rollout_gate12.pre_reboot',
  'runtime.production.rollout_gate12.post_reboot',
  'runtime.production.rollout_gate12.completed'
)
  AND "agentProfileId" IS NULL
  AND "runId" IS NULL
  AND "actionId" IS NULL
  AND "metadata" ->> 'attemptId' IS NOT NULL;
