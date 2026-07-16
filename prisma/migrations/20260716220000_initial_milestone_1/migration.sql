-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- Required PostgreSQL search extensions
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- CreateEnum
CREATE TYPE "UserKind" AS ENUM ('HUMAN', 'AGENT');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "TopicStatus" AS ENUM ('ACTIVE', 'HIDDEN', 'MERGED');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('ACTIVE', 'DELETED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('TOPIC', 'ENTRY', 'USER');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'HARASSMENT', 'HATE', 'ILLEGAL_CONTENT', 'PERSONAL_DATA', 'COPYRIGHT', 'OFF_TOPIC', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ContentOrigin" AS ENUM ('WEB', 'API', 'SEED', 'AGENT');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "kind" "UserKind" NOT NULL DEFAULT 'HUMAN',
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "email" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "usernameNormalized" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "bio" VARCHAR(500),
    "passwordHash" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "termsAcceptedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3),
    "deactivatedAt" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfTokenHash" TEXT NOT NULL,
    "userAgent" VARCHAR(500),
    "ipHash" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topics" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "TopicStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" UUID NOT NULL,
    "mergedIntoId" UUID,
    "entryCount" INTEGER NOT NULL DEFAULT 0,
    "lastEntryAt" TIMESTAMPTZ(3),
    "randomKey" DOUBLE PRECISION NOT NULL DEFAULT random(),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_aliases" (
    "id" UUID NOT NULL,
    "topicId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topic_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entries" (
    "id" UUID NOT NULL,
    "topicId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "normalizedBody" TEXT NOT NULL,
    "status" "EntryStatus" NOT NULL DEFAULT 'ACTIVE',
    "score" INTEGER NOT NULL DEFAULT 0,
    "upvoteCount" INTEGER NOT NULL DEFAULT 0,
    "downvoteCount" INTEGER NOT NULL DEFAULT 0,
    "origin" "ContentOrigin" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "hiddenAt" TIMESTAMPTZ(3),

    CONSTRAINT "entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entry_revisions" (
    "id" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "editedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entry_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entry_votes" (
    "entryId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "entry_votes_pkey" PRIMARY KEY ("entryId","userId")
);

-- CreateTable
CREATE TABLE "entry_bookmarks" (
    "entryId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entry_bookmarks_pkey" PRIMARY KEY ("entryId","userId")
);

-- CreateTable
CREATE TABLE "topic_follows" (
    "topicId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topic_follows_pkey" PRIMARY KEY ("topicId","userId")
);

-- CreateTable
CREATE TABLE "user_blocks" (
    "blockerId" UUID NOT NULL,
    "blockedId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("blockerId","blockedId")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "reporterId" UUID NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" UUID NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "details" VARCHAR(1000),
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "handledById" UUID,
    "handledAt" TIMESTAMPTZ(3),
    "resolutionNote" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_actions" (
    "id" UUID NOT NULL,
    "moderatorId" UUID NOT NULL,
    "actionType" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" UUID NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID,
    "requestId" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventVersion" INTEGER NOT NULL DEFAULT 1,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" UUID NOT NULL,
    "actorId" UUID,
    "actorKind" "UserKind",
    "requestId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_buckets" (
    "id" UUID NOT NULL,
    "keyHash" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "windowStart" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "key" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_emailNormalized_key" ON "users"("emailNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "users_usernameNormalized_key" ON "users"("usernameNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_expiresAt_idx" ON "sessions"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "topics_normalizedTitle_key" ON "topics"("normalizedTitle");

-- CreateIndex
CREATE INDEX "topics_status_lastEntryAt_idx" ON "topics"("status", "lastEntryAt" DESC);

-- CreateIndex
CREATE INDEX "topics_status_createdAt_idx" ON "topics"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "topics_randomKey_idx" ON "topics"("randomKey");

-- CreateIndex
CREATE UNIQUE INDEX "topic_aliases_normalizedTitle_key" ON "topic_aliases"("normalizedTitle");

-- CreateIndex
CREATE INDEX "entries_topicId_status_createdAt_idx" ON "entries"("topicId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "entries_topicId_status_score_createdAt_idx" ON "entries"("topicId", "status", "score" DESC, "createdAt");

-- CreateIndex
CREATE INDEX "entries_authorId_status_createdAt_idx" ON "entries"("authorId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "entry_revisions_entryId_createdAt_idx" ON "entry_revisions"("entryId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "entry_votes_entryId_idx" ON "entry_votes"("entryId");

-- CreateIndex
CREATE INDEX "entry_votes_userId_updatedAt_idx" ON "entry_votes"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "entry_bookmarks_userId_createdAt_idx" ON "entry_bookmarks"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "topic_follows_userId_createdAt_idx" ON "topic_follows"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "user_blocks_blockedId_idx" ON "user_blocks"("blockedId");

-- CreateIndex
CREATE INDEX "reports_status_createdAt_idx" ON "reports"("status", "createdAt");

-- CreateIndex
CREATE INDEX "reports_targetType_targetId_idx" ON "reports"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "moderation_actions_targetType_targetId_createdAt_idx" ON "moderation_actions"("targetType", "targetId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_requestId_idx" ON "audit_logs"("requestId");

-- CreateIndex
CREATE INDEX "outbox_events_processedAt_createdAt_idx" ON "outbox_events"("processedAt", "createdAt");

-- CreateIndex
CREATE INDEX "rate_limit_buckets_expiresAt_idx" ON "rate_limit_buckets"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_buckets_keyHash_action_windowStart_key" ON "rate_limit_buckets"("keyHash", "action", "windowStart");

-- CreateIndex
CREATE INDEX "idempotency_records_expiresAt_idx" ON "idempotency_records"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_actorId_key_route_key" ON "idempotency_records"("actorId", "key", "route");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_aliases" ADD CONSTRAINT "topic_aliases_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entries" ADD CONSTRAINT "entries_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entries" ADD CONSTRAINT "entries_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_revisions" ADD CONSTRAINT "entry_revisions_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_revisions" ADD CONSTRAINT "entry_revisions_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_votes" ADD CONSTRAINT "entry_votes_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_votes" ADD CONSTRAINT "entry_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_bookmarks" ADD CONSTRAINT "entry_bookmarks_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_bookmarks" ADD CONSTRAINT "entry_bookmarks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_follows" ADD CONSTRAINT "topic_follows_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_follows" ADD CONSTRAINT "topic_follows_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Domain integrity constraints that Prisma cannot express
ALTER TABLE "users"
  ADD CONSTRAINT "users_username_format_check"
  CHECK ("username" ~ '^[a-z0-9_]{3,30}$'),
  ADD CONSTRAINT "users_username_normalized_check"
  CHECK ("username" = "usernameNormalized"),
  ADD CONSTRAINT "users_display_name_length_check"
  CHECK (char_length("displayName") BETWEEN 2 AND 50);

ALTER TABLE "topics"
  ADD CONSTRAINT "topics_normalized_title_length_check"
  CHECK (char_length("normalizedTitle") BETWEEN 2 AND 100),
  ADD CONSTRAINT "topics_entry_count_nonnegative_check"
  CHECK ("entryCount" >= 0),
  ADD CONSTRAINT "topics_random_key_range_check"
  CHECK ("randomKey" >= 0 AND "randomKey" <= 1),
  ADD CONSTRAINT "topics_merge_target_check"
  CHECK ("mergedIntoId" IS NULL OR "mergedIntoId" <> "id");

ALTER TABLE "entries"
  ADD CONSTRAINT "entries_body_length_check"
  CHECK (char_length("body") BETWEEN 10 AND 10000),
  ADD CONSTRAINT "entries_vote_counters_nonnegative_check"
  CHECK ("upvoteCount" >= 0 AND "downvoteCount" >= 0),
  ADD CONSTRAINT "entries_score_consistency_check"
  CHECK ("score" = "upvoteCount" - "downvoteCount");

ALTER TABLE "entry_votes"
  ADD CONSTRAINT "entry_votes_value_check" CHECK ("value" IN (-1, 1));

ALTER TABLE "user_blocks"
  ADD CONSTRAINT "user_blocks_not_self_check" CHECK ("blockerId" <> "blockedId");

ALTER TABLE "reports"
  ADD CONSTRAINT "reports_other_details_check"
  CHECK (
    "reason" <> 'OTHER'
    OR ("details" IS NOT NULL AND char_length("details") BETWEEN 10 AND 1000)
  );

ALTER TABLE "moderation_actions"
  ADD CONSTRAINT "moderation_actions_reason_length_check"
  CHECK (char_length("reason") BETWEEN 10 AND 1000);

ALTER TABLE "outbox_events"
  ADD CONSTRAINT "outbox_events_version_positive_check" CHECK ("eventVersion" > 0);

ALTER TABLE "rate_limit_buckets"
  ADD CONSTRAINT "rate_limit_buckets_count_nonnegative_check" CHECK ("count" >= 0);

-- A reporter can have only one open report for a target at a time.
CREATE UNIQUE INDEX "reports_unique_open_target_per_reporter"
  ON "reports" ("reporterId", "targetType", "targetId")
  WHERE "status" = 'OPEN';

-- Trigram indexes used by Turkish/unaccented search.
CREATE INDEX "topics_normalized_title_trgm_idx"
  ON "topics" USING GIN ("normalizedTitle" gin_trgm_ops);
CREATE INDEX "topic_aliases_normalized_title_trgm_idx"
  ON "topic_aliases" USING GIN ("normalizedTitle" gin_trgm_ops);
CREATE INDEX "entries_normalized_body_trgm_idx"
  ON "entries" USING GIN ("normalizedBody" gin_trgm_ops);

-- Audit and moderation history are append-only at the database boundary.
CREATE FUNCTION reject_immutable_history_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_logs_immutable"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_history_mutation();

CREATE TRIGGER "moderation_actions_immutable"
  BEFORE UPDATE OR DELETE ON "moderation_actions"
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_history_mutation();
