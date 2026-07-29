CREATE TYPE "EntryTrashSource" AS ENUM ('AUTHOR_DELETE', 'MODERATION_HIDE');
CREATE TYPE "EntryReviewOutcome" AS ENUM ('ACCEPTED', 'REJECTED');

CREATE TABLE "entry_trash_cases" (
  "id" UUID NOT NULL,
  "entryId" UUID NOT NULL,
  "authorId" UUID NOT NULL,
  "topicId" UUID NOT NULL,
  "source" "EntryTrashSource" NOT NULL,
  "sourceActionId" UUID,
  "sourceReason" VARCHAR(1000) NOT NULL,
  "openedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMPTZ(3),
  CONSTRAINT "entry_trash_cases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "entry_trash_cases_source_reason_length_check"
    CHECK (char_length("sourceReason") BETWEEN 10 AND 1000),
  CONSTRAINT "entry_trash_cases_source_action_check"
    CHECK (
      ("source" = 'AUTHOR_DELETE' AND "sourceActionId" IS NULL)
      OR ("source" = 'MODERATION_HIDE' AND "sourceActionId" IS NOT NULL)
    ),
  CONSTRAINT "entry_trash_cases_closed_after_opened_check"
    CHECK ("closedAt" IS NULL OR "closedAt" >= "openedAt")
);

CREATE TABLE "entry_revival_requests" (
  "id" UUID NOT NULL,
  "trashCaseId" UUID NOT NULL,
  "entryId" UUID NOT NULL,
  "requestedById" UUID NOT NULL,
  "previousRevisionId" UUID NOT NULL,
  "submittedBody" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "entry_revival_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "entry_revival_requests_body_length_check"
    CHECK (char_length("submittedBody") BETWEEN 10 AND 10000)
);

CREATE TABLE "entry_revival_decisions" (
  "id" UUID NOT NULL,
  "requestId" UUID NOT NULL,
  "deciderId" UUID NOT NULL,
  "outcome" "EntryReviewOutcome" NOT NULL,
  "constitutionalArticles" INTEGER[] NOT NULL,
  "rationale" VARCHAR(1000) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "entry_revival_decisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "entry_revival_decisions_articles_check"
    CHECK ("constitutionalArticles" = ARRAY[37, 38, 41]::INTEGER[]),
  CONSTRAINT "entry_revival_decisions_rationale_length_check"
    CHECK (char_length("rationale") BETWEEN 10 AND 1000)
);

CREATE TABLE "entry_appeals" (
  "id" UUID NOT NULL,
  "trashCaseId" UUID NOT NULL,
  "entryId" UUID NOT NULL,
  "topicId" UUID NOT NULL,
  "appellantId" UUID NOT NULL,
  "revivalRequestId" UUID NOT NULL,
  "moderationReason" VARCHAR(1000) NOT NULL,
  "topicTitleSnapshot" VARCHAR(120) NOT NULL,
  "bodySnapshot" TEXT NOT NULL,
  "correction" VARCHAR(1000) NOT NULL,
  "defense" VARCHAR(2000) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "entry_appeals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "entry_appeals_reason_length_check"
    CHECK (char_length("moderationReason") BETWEEN 10 AND 1000),
  CONSTRAINT "entry_appeals_topic_length_check"
    CHECK (char_length("topicTitleSnapshot") BETWEEN 2 AND 120),
  CONSTRAINT "entry_appeals_body_length_check"
    CHECK (char_length("bodySnapshot") BETWEEN 10 AND 10000),
  CONSTRAINT "entry_appeals_correction_length_check"
    CHECK (char_length("correction") BETWEEN 10 AND 1000),
  CONSTRAINT "entry_appeals_defense_length_check"
    CHECK (char_length("defense") BETWEEN 20 AND 2000)
);

CREATE TABLE "entry_appeal_decisions" (
  "id" UUID NOT NULL,
  "appealId" UUID NOT NULL,
  "deciderId" UUID NOT NULL,
  "outcome" "EntryReviewOutcome" NOT NULL,
  "constitutionalArticles" INTEGER[] NOT NULL,
  "rationale" VARCHAR(1000) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "entry_appeal_decisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "entry_appeal_decisions_articles_check"
    CHECK ("constitutionalArticles" = ARRAY[39, 40, 41, 42]::INTEGER[]),
  CONSTRAINT "entry_appeal_decisions_rationale_length_check"
    CHECK (char_length("rationale") BETWEEN 10 AND 1000)
);

CREATE UNIQUE INDEX "entry_trash_cases_sourceActionId_key"
  ON "entry_trash_cases" ("sourceActionId");
CREATE UNIQUE INDEX "entry_trash_cases_one_open_per_entry"
  ON "entry_trash_cases" ("entryId")
  WHERE "closedAt" IS NULL;
CREATE INDEX "entry_trash_cases_authorId_closedAt_openedAt_idx"
  ON "entry_trash_cases" ("authorId", "closedAt", "openedAt" DESC);
CREATE INDEX "entry_trash_cases_entryId_openedAt_idx"
  ON "entry_trash_cases" ("entryId", "openedAt" DESC);

CREATE INDEX "entry_revival_requests_trashCaseId_createdAt_idx"
  ON "entry_revival_requests" ("trashCaseId", "createdAt" DESC);
CREATE INDEX "entry_revival_requests_requestedById_createdAt_idx"
  ON "entry_revival_requests" ("requestedById", "createdAt" DESC);

CREATE UNIQUE INDEX "entry_revival_decisions_requestId_key"
  ON "entry_revival_decisions" ("requestId");
CREATE INDEX "entry_revival_decisions_deciderId_createdAt_idx"
  ON "entry_revival_decisions" ("deciderId", "createdAt" DESC);

CREATE UNIQUE INDEX "entry_appeals_trashCaseId_key"
  ON "entry_appeals" ("trashCaseId");
CREATE INDEX "entry_appeals_appellantId_createdAt_idx"
  ON "entry_appeals" ("appellantId", "createdAt" DESC);
CREATE INDEX "entry_appeals_revivalRequestId_idx"
  ON "entry_appeals" ("revivalRequestId");

CREATE UNIQUE INDEX "entry_appeal_decisions_appealId_key"
  ON "entry_appeal_decisions" ("appealId");
CREATE INDEX "entry_appeal_decisions_deciderId_createdAt_idx"
  ON "entry_appeal_decisions" ("deciderId", "createdAt" DESC);

ALTER TABLE "entry_trash_cases"
  ADD CONSTRAINT "entry_trash_cases_entryId_fkey"
    FOREIGN KEY ("entryId") REFERENCES "entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "entry_trash_cases_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "entry_trash_cases_topicId_fkey"
    FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "entry_trash_cases_sourceActionId_fkey"
    FOREIGN KEY ("sourceActionId") REFERENCES "moderation_actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "entry_revival_requests"
  ADD CONSTRAINT "entry_revival_requests_trashCaseId_fkey"
    FOREIGN KEY ("trashCaseId") REFERENCES "entry_trash_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "entry_revival_requests_entryId_fkey"
    FOREIGN KEY ("entryId") REFERENCES "entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "entry_revival_requests_requestedById_fkey"
    FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "entry_revival_requests_previousRevisionId_fkey"
    FOREIGN KEY ("previousRevisionId") REFERENCES "entry_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "entry_revival_decisions"
  ADD CONSTRAINT "entry_revival_decisions_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "entry_revival_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "entry_revival_decisions_deciderId_fkey"
    FOREIGN KEY ("deciderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "entry_appeals"
  ADD CONSTRAINT "entry_appeals_trashCaseId_fkey"
    FOREIGN KEY ("trashCaseId") REFERENCES "entry_trash_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "entry_appeals_entryId_fkey"
    FOREIGN KEY ("entryId") REFERENCES "entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "entry_appeals_topicId_fkey"
    FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "entry_appeals_appellantId_fkey"
    FOREIGN KEY ("appellantId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "entry_appeals_revivalRequestId_fkey"
    FOREIGN KEY ("revivalRequestId") REFERENCES "entry_revival_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "entry_appeal_decisions"
  ADD CONSTRAINT "entry_appeal_decisions_appealId_fkey"
    FOREIGN KEY ("appealId") REFERENCES "entry_appeals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "entry_appeal_decisions_deciderId_fkey"
    FOREIGN KEY ("deciderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION validate_entry_trash_case() RETURNS trigger AS $$
DECLARE
  entry_author_id UUID;
  entry_topic_id UUID;
  entry_status TEXT;
  action_type TEXT;
  action_target_type TEXT;
  action_target_id UUID;
  action_reason TEXT;
BEGIN
  SELECT "authorId", "topicId", "status"::text
  INTO entry_author_id, entry_topic_id, entry_status
  FROM "entries"
  WHERE "id" = NEW."entryId"
  FOR UPDATE;

  IF entry_author_id IS NULL
     OR entry_author_id <> NEW."authorId"
     OR entry_topic_id <> NEW."topicId" THEN
    RAISE EXCEPTION 'trash case entry identity mismatch';
  END IF;

  IF NEW."source" = 'AUTHOR_DELETE' THEN
    IF entry_status <> 'DELETED'
       OR NEW."sourceActionId" IS NOT NULL
       OR NEW."sourceReason" <> 'Yazar tarafından silindi.' THEN
      RAISE EXCEPTION 'author trash case does not match deleted entry';
    END IF;
  ELSE
    SELECT "actionType", "targetType", "targetId", "reason"
    INTO action_type, action_target_type, action_target_id, action_reason
    FROM "moderation_actions"
    WHERE "id" = NEW."sourceActionId";
    IF entry_status <> 'HIDDEN'
       OR action_type <> 'ENTRY_HIDDEN'
       OR action_target_type <> 'ENTRY'
       OR action_target_id <> NEW."entryId"
       OR action_reason <> NEW."sourceReason" THEN
      RAISE EXCEPTION 'moderation trash case does not match hidden action';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "entry_trash_cases_validate"
  BEFORE INSERT ON "entry_trash_cases"
  FOR EACH ROW EXECUTE FUNCTION validate_entry_trash_case();

CREATE FUNCTION protect_entry_trash_case() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'entry trash case history is immutable';
  END IF;
  IF OLD."id" <> NEW."id"
     OR OLD."entryId" <> NEW."entryId"
     OR OLD."authorId" <> NEW."authorId"
     OR OLD."topicId" <> NEW."topicId"
     OR OLD."source" <> NEW."source"
     OR OLD."sourceActionId" IS DISTINCT FROM NEW."sourceActionId"
     OR OLD."sourceReason" <> NEW."sourceReason"
     OR OLD."openedAt" <> NEW."openedAt"
     OR OLD."closedAt" IS NOT NULL
     OR NEW."closedAt" IS NULL
     OR NEW."closedAt" < OLD."openedAt" THEN
    RAISE EXCEPTION 'entry trash case permits only one close transition';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "entry_trash_cases_protect"
  BEFORE UPDATE OR DELETE ON "entry_trash_cases"
  FOR EACH ROW EXECUTE FUNCTION protect_entry_trash_case();

CREATE FUNCTION validate_entry_revival_request() RETURNS trigger AS $$
DECLARE
  case_entry_id UUID;
  case_author_id UUID;
  case_closed_at TIMESTAMPTZ;
  entry_status TEXT;
  entry_body TEXT;
  revision_entry_id UUID;
  revision_editor_id UUID;
BEGIN
  SELECT "entryId", "authorId", "closedAt"
  INTO case_entry_id, case_author_id, case_closed_at
  FROM "entry_trash_cases"
  WHERE "id" = NEW."trashCaseId"
  FOR UPDATE;

  SELECT "status"::text, "body"
  INTO entry_status, entry_body
  FROM "entries"
  WHERE "id" = NEW."entryId"
  FOR UPDATE;

  SELECT "entryId", "editedById"
  INTO revision_entry_id, revision_editor_id
  FROM "entry_revisions"
  WHERE "id" = NEW."previousRevisionId";

  IF case_closed_at IS NOT NULL
     OR case_entry_id <> NEW."entryId"
     OR case_author_id <> NEW."requestedById"
     OR entry_status NOT IN ('DELETED', 'HIDDEN')
     OR entry_body <> NEW."submittedBody"
     OR revision_entry_id <> NEW."entryId"
     OR revision_editor_id <> NEW."requestedById" THEN
    RAISE EXCEPTION 'revival request identity or entry state mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "entry_revival_requests" AS requests
    LEFT JOIN "entry_revival_decisions" AS decisions
      ON decisions."requestId" = requests."id"
    WHERE requests."trashCaseId" = NEW."trashCaseId"
      AND decisions."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'trash case already has an open revival request';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "entry_revival_requests_validate"
  BEFORE INSERT ON "entry_revival_requests"
  FOR EACH ROW EXECUTE FUNCTION validate_entry_revival_request();

CREATE FUNCTION validate_entry_review_decider(
  subject_user_id UUID,
  decision_user_id UUID
) RETURNS void AS $$
BEGIN
  IF subject_user_id = decision_user_id THEN
    RAISE EXCEPTION 'entry review conflict of interest';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM "users" AS users
    JOIN "user_moderation_capabilities" AS capabilities
      ON capabilities."userId" = users."id"
    WHERE users."id" = decision_user_id
      AND users."status" = 'ACTIVE'
      AND users."kind" = 'HUMAN'
      AND capabilities."capability" = 'APPEAL_DECIDER'
      AND capabilities."revokedAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'entry review decider lacks APPEAL_DECIDER';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION validate_entry_revival_decision() RETURNS trigger AS $$
DECLARE
  request_author_id UUID;
  request_entry_id UUID;
  request_body TEXT;
  case_closed_at TIMESTAMPTZ;
  entry_status TEXT;
  entry_body TEXT;
BEGIN
  SELECT requests."requestedById", requests."entryId", requests."submittedBody", cases."closedAt"
  INTO request_author_id, request_entry_id, request_body, case_closed_at
  FROM "entry_revival_requests" AS requests
  JOIN "entry_trash_cases" AS cases ON cases."id" = requests."trashCaseId"
  WHERE requests."id" = NEW."requestId"
  FOR UPDATE OF requests, cases;

  SELECT "status"::text, "body"
  INTO entry_status, entry_body
  FROM "entries"
  WHERE "id" = request_entry_id
  FOR UPDATE;

  IF request_author_id IS NULL
     OR case_closed_at IS NOT NULL
     OR entry_status NOT IN ('DELETED', 'HIDDEN')
     OR entry_body <> request_body THEN
    RAISE EXCEPTION 'revival decision requires an open trash case';
  END IF;
  PERFORM validate_entry_review_decider(request_author_id, NEW."deciderId");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "entry_revival_decisions_validate"
  BEFORE INSERT ON "entry_revival_decisions"
  FOR EACH ROW EXECUTE FUNCTION validate_entry_revival_decision();

CREATE FUNCTION validate_entry_appeal() RETURNS trigger AS $$
DECLARE
  case_entry_id UUID;
  case_author_id UUID;
  case_topic_id UUID;
  case_reason TEXT;
  case_closed_at TIMESTAMPTZ;
  request_case_id UUID;
  request_body TEXT;
  request_outcome "EntryReviewOutcome";
  entry_status TEXT;
  entry_body TEXT;
BEGIN
  SELECT "entryId", "authorId", "topicId", "sourceReason", "closedAt"
  INTO case_entry_id, case_author_id, case_topic_id, case_reason, case_closed_at
  FROM "entry_trash_cases"
  WHERE "id" = NEW."trashCaseId"
  FOR UPDATE;

  SELECT requests."trashCaseId", requests."submittedBody", decisions."outcome"
  INTO request_case_id, request_body, request_outcome
  FROM "entry_revival_requests" AS requests
  JOIN "entry_revival_decisions" AS decisions ON decisions."requestId" = requests."id"
  WHERE requests."id" = NEW."revivalRequestId";

  SELECT "status"::text, "body"
  INTO entry_status, entry_body
  FROM "entries"
  WHERE "id" = NEW."entryId"
  FOR UPDATE;

  IF case_closed_at IS NOT NULL
     OR case_entry_id <> NEW."entryId"
     OR case_author_id <> NEW."appellantId"
     OR case_topic_id <> NEW."topicId"
     OR case_reason <> NEW."moderationReason"
     OR request_case_id <> NEW."trashCaseId"
     OR request_body <> NEW."bodySnapshot"
     OR entry_status NOT IN ('DELETED', 'HIDDEN')
     OR entry_body <> NEW."bodySnapshot"
     OR request_outcome <> 'REJECTED' THEN
    RAISE EXCEPTION 'appeal must match a rejected revival request and open trash case';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "entry_appeals_validate"
  BEFORE INSERT ON "entry_appeals"
  FOR EACH ROW EXECUTE FUNCTION validate_entry_appeal();

CREATE FUNCTION validate_entry_appeal_decision() RETURNS trigger AS $$
DECLARE
  appeal_author_id UUID;
  appeal_entry_id UUID;
  appeal_body TEXT;
  case_closed_at TIMESTAMPTZ;
  entry_status TEXT;
  entry_body TEXT;
BEGIN
  SELECT appeals."appellantId", appeals."entryId", appeals."bodySnapshot", cases."closedAt"
  INTO appeal_author_id, appeal_entry_id, appeal_body, case_closed_at
  FROM "entry_appeals" AS appeals
  JOIN "entry_trash_cases" AS cases ON cases."id" = appeals."trashCaseId"
  WHERE appeals."id" = NEW."appealId"
  FOR UPDATE OF appeals, cases;

  SELECT "status"::text, "body"
  INTO entry_status, entry_body
  FROM "entries"
  WHERE "id" = appeal_entry_id
  FOR UPDATE;

  IF appeal_author_id IS NULL
     OR case_closed_at IS NOT NULL
     OR entry_status NOT IN ('DELETED', 'HIDDEN')
     OR entry_body <> appeal_body THEN
    RAISE EXCEPTION 'appeal decision requires an open trash case';
  END IF;
  PERFORM validate_entry_review_decider(appeal_author_id, NEW."deciderId");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "entry_appeal_decisions_validate"
  BEFORE INSERT ON "entry_appeal_decisions"
  FOR EACH ROW EXECUTE FUNCTION validate_entry_appeal_decision();

INSERT INTO "entry_trash_cases" (
  "id",
  "entryId",
  "authorId",
  "topicId",
  "source",
  "sourceActionId",
  "sourceReason",
  "openedAt"
)
SELECT
  md5('entry-trash-author-delete:' || entries."id"::text)::uuid,
  entries."id",
  entries."authorId",
  entries."topicId",
  'AUTHOR_DELETE'::"EntryTrashSource",
  NULL,
  'Yazar tarafından silindi.',
  COALESCE(entries."deletedAt", entries."updatedAt")
FROM "entries" AS entries
WHERE entries."status" = 'DELETED'
  AND entries."origin" <> 'SEED';

INSERT INTO "entry_trash_cases" (
  "id",
  "entryId",
  "authorId",
  "topicId",
  "source",
  "sourceActionId",
  "sourceReason",
  "openedAt"
)
SELECT
  md5('entry-trash-moderation-hide:' || entries."id"::text)::uuid,
  entries."id",
  entries."authorId",
  entries."topicId",
  'MODERATION_HIDE'::"EntryTrashSource",
  latest_action."id",
  latest_action."reason",
  latest_action."createdAt"
FROM "entries" AS entries
JOIN LATERAL (
  SELECT actions."id", actions."actionType", actions."reason", actions."createdAt"
  FROM "moderation_actions" AS actions
  WHERE actions."targetType" = 'ENTRY'
    AND actions."targetId" = entries."id"
    AND actions."actionType" IN ('ENTRY_HIDDEN', 'ENTRY_RESTORED')
  ORDER BY actions."createdAt" DESC, actions."id" DESC
  LIMIT 1
) AS latest_action ON latest_action."actionType" = 'ENTRY_HIDDEN'
WHERE entries."status" = 'HIDDEN'
  AND entries."origin" <> 'SEED';

CREATE TRIGGER "entry_revisions_immutable"
  BEFORE UPDATE OR DELETE ON "entry_revisions"
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_history_mutation();

CREATE TRIGGER "entry_revival_requests_immutable"
  BEFORE UPDATE OR DELETE ON "entry_revival_requests"
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_history_mutation();

CREATE TRIGGER "entry_revival_decisions_immutable"
  BEFORE UPDATE OR DELETE ON "entry_revival_decisions"
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_history_mutation();

CREATE TRIGGER "entry_appeals_immutable"
  BEFORE UPDATE OR DELETE ON "entry_appeals"
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_history_mutation();

CREATE TRIGGER "entry_appeal_decisions_immutable"
  BEFORE UPDATE OR DELETE ON "entry_appeal_decisions"
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_history_mutation();
