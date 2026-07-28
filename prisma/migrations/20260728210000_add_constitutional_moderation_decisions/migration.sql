CREATE TYPE "ModerationReviewTrack" AS ENUM ('FORMAT', 'LEGAL');
CREATE TYPE "GammazDecisionOutcome" AS ENUM ('ACCEPTED', 'REJECTED');

CREATE TABLE "gammaz_decisions" (
  "id" UUID NOT NULL,
  "reportId" UUID NOT NULL,
  "moderatorId" UUID NOT NULL,
  "reviewTrack" "ModerationReviewTrack" NOT NULL,
  "outcome" "GammazDecisionOutcome" NOT NULL,
  "constitutionalArticles" INTEGER[] NOT NULL,
  "rationale" VARCHAR(1000) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gammaz_decisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gammaz_decisions_articles_check"
    CHECK (
      cardinality("constitutionalArticles") > 0
      AND "constitutionalArticles" <@ ARRAY[
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
        14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26,
        27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39,
        40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52
      ]::INTEGER[]
    ),
  CONSTRAINT "gammaz_decisions_rationale_length_check"
    CHECK (char_length("rationale") BETWEEN 10 AND 1000)
);

CREATE UNIQUE INDEX "gammaz_decisions_reportId_key"
  ON "gammaz_decisions" ("reportId");

CREATE INDEX "gammaz_decisions_reviewTrack_outcome_createdAt_idx"
  ON "gammaz_decisions" ("reviewTrack", "outcome", "createdAt" DESC);

CREATE INDEX "gammaz_decisions_moderatorId_createdAt_idx"
  ON "gammaz_decisions" ("moderatorId", "createdAt" DESC);

ALTER TABLE "gammaz_decisions"
  ADD CONSTRAINT "gammaz_decisions_reportId_fkey"
  FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "gammaz_decisions_moderatorId_fkey"
  FOREIGN KEY ("moderatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "moderation_actions"
  ADD COLUMN "reportId" UUID,
  ADD COLUMN "decisionId" UUID,
  ADD CONSTRAINT "moderation_actions_report_decision_pair_check"
    CHECK (
      ("reportId" IS NULL AND "decisionId" IS NULL)
      OR ("reportId" IS NOT NULL AND "decisionId" IS NOT NULL)
    ),
  ADD CONSTRAINT "moderation_actions_reportId_fkey"
    FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "moderation_actions_decisionId_fkey"
    FOREIGN KEY ("decisionId") REFERENCES "gammaz_decisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "moderation_actions_reportId_createdAt_idx"
  ON "moderation_actions" ("reportId", "createdAt" DESC);

CREATE INDEX "moderation_actions_decisionId_createdAt_idx"
  ON "moderation_actions" ("decisionId", "createdAt" DESC);

CREATE UNIQUE INDEX "moderation_actions_one_content_action_per_decision"
  ON "moderation_actions" ("decisionId")
  WHERE "decisionId" IS NOT NULL AND "targetType" <> 'REPORT';

CREATE FUNCTION validate_gammaz_decision() RETURNS trigger AS $$
DECLARE
  report_reason TEXT;
  report_target_type TEXT;
  report_target_id UUID;
  report_status TEXT;
  expected_track "ModerationReviewTrack";
  expected_capability "ModerationCapability";
  expected_articles INTEGER[];
  target_owner_id UUID;
BEGIN
  SELECT
    "reason"::text,
    "targetType"::text,
    "targetId",
    "status"::text
  INTO
    report_reason,
    report_target_type,
    report_target_id,
    report_status
  FROM "reports"
  WHERE "id" = NEW."reportId"
  FOR UPDATE;

  IF report_reason IS NULL OR report_status <> 'OPEN' THEN
    RAISE EXCEPTION 'gammaz decision requires an open report';
  END IF;

  expected_track :=
    CASE report_reason
      WHEN 'GAMMAZ_7_LEGAL_OR_COMMERCIAL_RISK' THEN 'LEGAL'::"ModerationReviewTrack"
      ELSE 'FORMAT'::"ModerationReviewTrack"
    END;

  expected_capability :=
    CASE expected_track
      WHEN 'LEGAL' THEN 'LEGAL_REVIEWER'::"ModerationCapability"
      ELSE 'FORMAT_MODERATOR'::"ModerationCapability"
    END;

  expected_articles :=
    CASE report_reason
      WHEN 'GAMMAZ_1_NOT_DICTIONARY_FUNCTION' THEN ARRAY[6, 17]
      WHEN 'GAMMAZ_2_NON_TURKISH_NON_QUOTE' THEN ARRAY[12]
      WHEN 'GAMMAZ_3_MISSING_CONTINUATION_CONTEXT' THEN ARRAY[8, 37]
      WHEN 'GAMMAZ_4_PHYSICAL_ENTRY_REFERENCE' THEN ARRAY[15]
      WHEN 'GAMMAZ_5_DICTIONARY_META' THEN ARRAY[14]
      WHEN 'GAMMAZ_7_LEGAL_OR_COMMERCIAL_RISK' THEN ARRAY[23]
      WHEN 'GAMMAZ_8_DUPLICATE_ENTRY' THEN ARRAY[16]
      WHEN 'GAMMAZ_9_DELETED_BKZ_TARGET' THEN ARRAY[11, 37]
      WHEN 'TOPIC_CANONICALIZATION_REQUEST' THEN ARRAY[27, 34, 35]
      ELSE NULL
    END;

  IF expected_articles IS NULL THEN
    RAISE EXCEPTION 'legacy report cannot receive a constitutional gammaz decision';
  END IF;

  IF NEW."reviewTrack" <> expected_track OR NEW."constitutionalArticles" <> expected_articles THEN
    RAISE EXCEPTION 'gammaz decision track or constitutional articles do not match report reason';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "users" AS users
    JOIN "user_moderation_capabilities" AS capabilities
      ON capabilities."userId" = users."id"
    WHERE users."id" = NEW."moderatorId"
      AND users."status" = 'ACTIVE'
      AND users."kind" = 'HUMAN'
      AND capabilities."capability" = expected_capability
      AND capabilities."revokedAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'moderator lacks the required active review capability';
  END IF;

  IF report_target_type = 'ENTRY' THEN
    SELECT "authorId" INTO target_owner_id FROM "entries" WHERE "id" = report_target_id;
  ELSIF report_target_type = 'TOPIC' THEN
    SELECT "createdById" INTO target_owner_id FROM "topics" WHERE "id" = report_target_id;
  ELSE
    RAISE EXCEPTION 'constitutional gammaz decision target must be entry or topic';
  END IF;

  IF target_owner_id IS NULL OR target_owner_id = NEW."moderatorId" THEN
    RAISE EXCEPTION 'moderator conflict of interest';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "gammaz_decisions_validate"
  BEFORE INSERT ON "gammaz_decisions"
  FOR EACH ROW EXECUTE FUNCTION validate_gammaz_decision();

CREATE FUNCTION validate_constitutional_content_action() RETURNS trigger AS $$
DECLARE
  decision_report_id UUID;
  decision_outcome "GammazDecisionOutcome";
  report_reason TEXT;
  report_target_type TEXT;
  report_target_id UUID;
  expected_capability "ModerationCapability";
  target_owner_id UUID;
BEGIN
  SELECT
    decisions."reportId",
    decisions."outcome",
    reports."reason"::text,
    reports."targetType"::text,
    reports."targetId"
  INTO
    decision_report_id,
    decision_outcome,
    report_reason,
    report_target_type,
    report_target_id
  FROM "gammaz_decisions" AS decisions
  JOIN "reports" AS reports ON reports."id" = decisions."reportId"
  WHERE decisions."id" = NEW."decisionId";

  IF decision_report_id IS NULL
     OR decision_outcome <> 'ACCEPTED'
     OR NEW."reportId" <> decision_report_id THEN
    RAISE EXCEPTION 'content action requires its accepted gammaz decision';
  END IF;

  IF NEW."targetType" <> report_target_type OR NEW."targetId" <> report_target_id THEN
    RAISE EXCEPTION 'content action target does not match gammaz decision';
  END IF;

  IF report_reason = 'GAMMAZ_7_LEGAL_OR_COMMERCIAL_RISK' THEN
    expected_capability := 'LEGAL_REVIEWER'::"ModerationCapability";
    IF (report_target_type = 'ENTRY' AND NEW."actionType" <> 'ENTRY_HIDDEN')
       OR (report_target_type = 'TOPIC' AND NEW."actionType" <> 'TOPIC_HIDDEN')
       OR report_target_type NOT IN ('ENTRY', 'TOPIC') THEN
      RAISE EXCEPTION 'content action is not allowed for legal review';
    END IF;
  ELSE
    expected_capability := 'FORMAT_MODERATOR'::"ModerationCapability";
    IF report_reason = 'TOPIC_CANONICALIZATION_REQUEST' THEN
      IF report_target_type <> 'TOPIC'
         OR NEW."actionType" NOT IN ('TOPIC_RENAMED', 'TOPIC_MERGED') THEN
        RAISE EXCEPTION 'content action is not allowed for topic canonicalization';
      END IF;
    ELSIF report_target_type <> 'ENTRY'
          OR NEW."actionType" NOT IN ('ENTRY_HIDDEN', 'ENTRY_MOVED') THEN
      RAISE EXCEPTION 'content action is not allowed for format review';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "users" AS users
    JOIN "user_moderation_capabilities" AS capabilities
      ON capabilities."userId" = users."id"
    WHERE users."id" = NEW."moderatorId"
      AND users."status" = 'ACTIVE'
      AND users."kind" = 'HUMAN'
      AND capabilities."capability" = expected_capability
      AND capabilities."revokedAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'content moderator lacks the required active review capability';
  END IF;

  IF report_target_type = 'ENTRY' THEN
    SELECT "authorId" INTO target_owner_id FROM "entries" WHERE "id" = report_target_id;
  ELSE
    SELECT "createdById" INTO target_owner_id FROM "topics" WHERE "id" = report_target_id;
  END IF;

  IF target_owner_id IS NULL OR target_owner_id = NEW."moderatorId" THEN
    RAISE EXCEPTION 'content moderator conflict of interest';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "moderation_actions_validate_constitutional"
  BEFORE INSERT ON "moderation_actions"
  FOR EACH ROW
  WHEN (NEW."decisionId" IS NOT NULL AND NEW."targetType" <> 'REPORT')
  EXECUTE FUNCTION validate_constitutional_content_action();

CREATE TRIGGER "gammaz_decisions_immutable"
  BEFORE UPDATE OR DELETE ON "gammaz_decisions"
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_history_mutation();
