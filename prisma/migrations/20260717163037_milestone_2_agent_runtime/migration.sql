-- CreateEnum
CREATE TYPE "AgentLifecycleStatus" AS ENUM ('DRAFT', 'PAUSED', 'ACTIVE', 'SUSPENDED', 'RETIRED');

-- CreateEnum
CREATE TYPE "AgentRuntimeStatus" AS ENUM ('IDLE', 'QUEUED', 'STARTING', 'READING', 'THINKING', 'VALIDATING', 'EXECUTING', 'REFLECTING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLING', 'CANCELLED', 'TIMED_OUT');

-- CreateEnum
CREATE TYPE "AgentRunType" AS ENUM ('SCHEDULED_WAKE', 'NORMAL_WAKE', 'ENTRY_BURST', 'DAILY_CATCH_UP', 'READ_ONLY', 'DRY_RUN', 'REFLECTION', 'SOURCE_REFRESH', 'CAPACITY_BENCHMARK', 'CONCURRENCY_TEST');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCEL_REQUESTED', 'CANCELLED', 'TIMED_OUT');

-- CreateEnum
CREATE TYPE "AgentQueuePriority" AS ENUM ('EMERGENCY_ADMIN', 'MANUAL_SINGLE', 'SCHEDULED_CONTENT', 'DAILY_CATCH_UP', 'REFLECTION', 'SOURCE_REFRESH');

-- CreateEnum
CREATE TYPE "AgentActionType" AS ENUM ('NO_ACTION', 'CREATE_ENTRY', 'CREATE_TOPIC_WITH_ENTRY', 'EDIT_OWN_ENTRY', 'VOTE_UP', 'VOTE_DOWN', 'REMOVE_VOTE', 'FOLLOW_TOPIC', 'UNFOLLOW_TOPIC', 'FOLLOW_USER', 'UNFOLLOW_USER', 'BOOKMARK_ENTRY', 'REMOVE_BOOKMARK', 'PROPOSE_SOURCE', 'UPDATE_BELIEF', 'UPDATE_RELATIONSHIP_NOTE');

-- CreateEnum
CREATE TYPE "AgentActionStatus" AS ENUM ('PROPOSED', 'VALIDATING', 'ACCEPTED', 'REJECTED', 'EXECUTING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AgentSourceStatus" AS ENUM ('SEED', 'DISCOVERED', 'PROBATION', 'TRUSTED', 'DORMANT', 'REJECTED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "PersonaChangeOrigin" AS ENUM ('INITIAL', 'ADMIN', 'REFLECTION', 'ROLLBACK', 'IMPORT');

-- CreateEnum
CREATE TYPE "ScheduleSlotStatus" AS ENUM ('PLANNED', 'QUEUED', 'RUNNING', 'COMPLETED', 'MISSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgentDailyPlanStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'MISSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuotaMode" AS ENUM ('PER_AGENT', 'GLOBAL_TOTAL', 'HYBRID');

-- CreateEnum
CREATE TYPE "AgentCapacityStatus" AS ENUM ('UNKNOWN', 'HEALTHY', 'AT_RISK', 'DEGRADED', 'OVERLOADED');

-- CreateEnum
CREATE TYPE "EvidenceProvenance" AS ENUM ('PLATFORM_EVENT', 'USER_ENTRY', 'TRUSTED_SOURCE', 'PROBATION_SOURCE', 'MULTIPLE_SOURCES', 'AGENT_MEMORY');

-- CreateEnum
CREATE TYPE "IndexingMode" AS ENUM ('INDEX_ALL', 'NOINDEX_AGENT_CONTENT', 'NOINDEX_ALL_DYNAMIC');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "loginDisabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "agent_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "lifecycleStatus" "AgentLifecycleStatus" NOT NULL DEFAULT 'PAUSED',
    "currentPersonaVersionId" UUID,
    "useGlobalEntryQuota" BOOLEAN NOT NULL DEFAULT true,
    "dailyEntryMin" INTEGER,
    "dailyEntryMax" INTEGER,
    "dailyTopicMin" INTEGER NOT NULL DEFAULT 0,
    "dailyTopicMax" INTEGER NOT NULL DEFAULT 2,
    "dailyVoteMin" INTEGER NOT NULL DEFAULT 0,
    "dailyVoteMax" INTEGER NOT NULL DEFAULT 10,
    "activeTimeProfile" JSONB NOT NULL,
    "personaEvolutionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sourceEvolutionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "scheduledTimeoutSeconds" INTEGER NOT NULL DEFAULT 360,
    "manualTimeoutSeconds" INTEGER NOT NULL DEFAULT 600,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "retiredAt" TIMESTAMPTZ(3),

    CONSTRAINT "agent_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_persona_versions" (
    "id" UUID NOT NULL,
    "agentProfileId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "persona" JSONB NOT NULL,
    "renderedPrompt" TEXT NOT NULL,
    "changeOrigin" "PersonaChangeOrigin" NOT NULL,
    "changeSummary" VARCHAR(1000) NOT NULL,
    "previousVersionId" UUID,
    "createdById" UUID,
    "validationReport" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_persona_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runtime_states" (
    "id" UUID NOT NULL,
    "agentProfileId" UUID NOT NULL,
    "runtimeStatus" "AgentRuntimeStatus" NOT NULL DEFAULT 'IDLE',
    "currentRunId" UUID,
    "lastHeartbeatAt" TIMESTAMPTZ(3),
    "lastRunAt" TIMESTAMPTZ(3),
    "lastSuccessfulRunAt" TIMESTAMPTZ(3),
    "nextScheduledAt" TIMESTAMPTZ(3),
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" VARCHAR(100),
    "lastErrorSummary" VARCHAR(1000),
    "todayDate" DATE NOT NULL,
    "todayEntryTarget" INTEGER NOT NULL DEFAULT 0,
    "todayPublishedEntries" INTEGER NOT NULL DEFAULT 0,
    "todayTopicTarget" INTEGER NOT NULL DEFAULT 0,
    "todayCreatedTopics" INTEGER NOT NULL DEFAULT 0,
    "todayVoteTarget" INTEGER NOT NULL DEFAULT 0,
    "todayVotes" INTEGER NOT NULL DEFAULT 0,
    "todaySourceReads" INTEGER NOT NULL DEFAULT 0,
    "runtimeMetadata" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agent_runtime_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_global_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "settingsVersion" INTEGER NOT NULL DEFAULT 1,
    "runtimeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "publishEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sourceReadingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "votingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "topicCreationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "userFollowingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "personaEvolutionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sourceEvolutionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "schedulerEnabled" BOOLEAN NOT NULL DEFAULT true,
    "quotaMode" "QuotaMode" NOT NULL DEFAULT 'HYBRID',
    "defaultDailyEntryMin" INTEGER NOT NULL DEFAULT 15,
    "defaultDailyEntryMax" INTEGER NOT NULL DEFAULT 20,
    "globalDailyEntryMin" INTEGER NOT NULL DEFAULT 150,
    "globalDailyEntryMax" INTEGER NOT NULL DEFAULT 200,
    "activeTimeWeights" JSONB NOT NULL,
    "maxEntriesPerHour" INTEGER NOT NULL DEFAULT 4,
    "maxEntriesPerThreeHours" INTEGER NOT NULL DEFAULT 9,
    "codexConcurrency" INTEGER NOT NULL DEFAULT 1,
    "scheduledTimeoutSeconds" INTEGER NOT NULL DEFAULT 360,
    "manualTimeoutSeconds" INTEGER NOT NULL DEFAULT 600,
    "reflectionTimeoutSeconds" INTEGER NOT NULL DEFAULT 600,
    "sourceRefreshTimeoutSeconds" INTEGER NOT NULL DEFAULT 300,
    "maxRetryCount" INTEGER NOT NULL DEFAULT 2,
    "duplicateSimilarityThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.82,
    "circuitBreakerConfig" JSONB NOT NULL,
    "degradedMode" BOOLEAN NOT NULL DEFAULT false,
    "indexingMode" "IndexingMode" NOT NULL DEFAULT 'INDEX_ALL',
    "sitemapDelayMinutes" INTEGER NOT NULL DEFAULT 360,
    "debugRetentionHours" INTEGER NOT NULL DEFAULT 0,
    "updatedById" UUID,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agent_global_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_daily_plans" (
    "id" UUID NOT NULL,
    "agentProfileId" UUID NOT NULL,
    "localDate" DATE NOT NULL,
    "entryTarget" INTEGER NOT NULL,
    "topicTarget" INTEGER NOT NULL,
    "voteTarget" INTEGER NOT NULL,
    "generatedFromSettingsVersion" INTEGER NOT NULL,
    "randomSeed" VARCHAR(128) NOT NULL,
    "capacitySnapshotId" UUID,
    "status" "AgentDailyPlanStatus" NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agent_daily_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_schedule_slots" (
    "id" UUID NOT NULL,
    "dailyPlanId" UUID NOT NULL,
    "agentProfileId" UUID NOT NULL,
    "scheduledAt" TIMESTAMPTZ(3) NOT NULL,
    "runType" "AgentRunType" NOT NULL,
    "queuePriority" "AgentQueuePriority" NOT NULL,
    "desiredEntryMin" INTEGER NOT NULL,
    "desiredEntryMax" INTEGER NOT NULL,
    "status" "ScheduleSlotStatus" NOT NULL DEFAULT 'PLANNED',
    "runId" UUID,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agent_schedule_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" UUID NOT NULL,
    "agentProfileId" UUID NOT NULL,
    "runType" "AgentRunType" NOT NULL,
    "runStatus" "AgentRunStatus" NOT NULL DEFAULT 'QUEUED',
    "queuePriority" "AgentQueuePriority" NOT NULL,
    "trigger" VARCHAR(64) NOT NULL,
    "requestedById" UUID,
    "parentRunId" UUID,
    "scheduleSlotId" UUID,
    "personaVersionId" UUID NOT NULL,
    "idempotencyKey" VARCHAR(200) NOT NULL,
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseOwner" VARCHAR(200),
    "leaseExpiresAt" TIMESTAMPTZ(3),
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),
    "heartbeatAt" TIMESTAMPTZ(3),
    "cancelRequestedAt" TIMESTAMPTZ(3),
    "timeoutSeconds" INTEGER NOT NULL,
    "desiredEntryMin" INTEGER NOT NULL,
    "desiredEntryMax" INTEGER NOT NULL,
    "allowTopicCreation" BOOLEAN NOT NULL DEFAULT true,
    "allowVoting" BOOLEAN NOT NULL DEFAULT true,
    "allowFollowing" BOOLEAN NOT NULL DEFAULT true,
    "allowSourceReading" BOOLEAN NOT NULL DEFAULT true,
    "saturationOverride" BOOLEAN NOT NULL DEFAULT false,
    "dailyMaximumOverride" BOOLEAN NOT NULL DEFAULT false,
    "adminInstruction" VARCHAR(1000),
    "perceptionSummary" JSONB,
    "safeRunSummary" JSONB,
    "usageMetadata" JSONB,
    "performanceMetrics" JSONB,
    "errorCode" VARCHAR(100),
    "errorSummary" VARCHAR(1000),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_run_events" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "agentProfileId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "eventType" VARCHAR(100) NOT NULL,
    "safeMessage" VARCHAR(1000) NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_run_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_actions" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "agentProfileId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "actionType" "AgentActionType" NOT NULL,
    "actionStatus" "AgentActionStatus" NOT NULL DEFAULT 'PROPOSED',
    "targetType" VARCHAR(64),
    "targetId" UUID,
    "input" JSONB NOT NULL,
    "provenance" JSONB,
    "validationResult" JSONB,
    "result" JSONB,
    "rejectionCode" VARCHAR(100),
    "rejectionReason" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agent_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_sources" (
    "id" UUID NOT NULL,
    "agentProfileId" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "normalizedDomain" VARCHAR(253) NOT NULL,
    "sourceType" VARCHAR(64) NOT NULL,
    "status" "AgentSourceStatus" NOT NULL,
    "topics" JSONB NOT NULL,
    "trustScore" DOUBLE PRECISION NOT NULL,
    "interestScore" DOUBLE PRECISION NOT NULL,
    "noveltyScore" DOUBLE PRECISION NOT NULL,
    "usefulnessScore" DOUBLE PRECISION NOT NULL,
    "adminPinned" BOOLEAN NOT NULL DEFAULT false,
    "adminBlocked" BOOLEAN NOT NULL DEFAULT false,
    "discoveredFrom" TEXT,
    "addedByOrigin" VARCHAR(64) NOT NULL,
    "lastFetchedAt" TIMESTAMPTZ(3),
    "lastUsefulAt" TIMESTAMPTZ(3),
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agent_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_source_items" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "publishedAt" TIMESTAMPTZ(3),
    "fetchedAt" TIMESTAMPTZ(3) NOT NULL,
    "contentHash" VARCHAR(128) NOT NULL,
    "safeText" TEXT NOT NULL,
    "summary" TEXT,
    "topics" JSONB NOT NULL,
    "processedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),

    CONSTRAINT "agent_source_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_memory_episodes" (
    "id" UUID NOT NULL,
    "agentProfileId" UUID NOT NULL,
    "runId" UUID,
    "eventType" VARCHAR(100) NOT NULL,
    "subjectType" VARCHAR(64),
    "subjectId" UUID,
    "summary" VARCHAR(2000) NOT NULL,
    "salience" DOUBLE PRECISION NOT NULL,
    "provenance" "EvidenceProvenance" NOT NULL,
    "evidence" JSONB NOT NULL,
    "invalidatedAt" TIMESTAMPTZ(3),
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_memory_episodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_beliefs" (
    "id" UUID NOT NULL,
    "agentProfileId" UUID NOT NULL,
    "topicKey" VARCHAR(200) NOT NULL,
    "statement" VARCHAR(2000) NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "evidenceSummary" VARCHAR(2000) NOT NULL,
    "evidenceProvenance" JSONB NOT NULL,
    "firstFormedAt" TIMESTAMPTZ(3) NOT NULL,
    "lastUpdatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL,
    "status" VARCHAR(64) NOT NULL,

    CONSTRAINT "agent_beliefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_relationships" (
    "id" UUID NOT NULL,
    "agentProfileId" UUID NOT NULL,
    "targetUserId" UUID NOT NULL,
    "familiarity" DOUBLE PRECISION NOT NULL,
    "trust" DOUBLE PRECISION NOT NULL,
    "interest" DOUBLE PRECISION NOT NULL,
    "disagreement" DOUBLE PRECISION NOT NULL,
    "summary" VARCHAR(2000) NOT NULL,
    "lastInteractionAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agent_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_credentials" (
    "id" UUID NOT NULL,
    "agentProfileId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "prefix" VARCHAR(24) NOT NULL,
    "scopes" TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "lastUsedAt" TIMESTAMPTZ(3),

    CONSTRAINT "agent_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runtime_capabilities" (
    "id" UUID NOT NULL,
    "codexVersion" VARCHAR(200) NOT NULL,
    "promptProfileHash" VARCHAR(128) NOT NULL,
    "benchmarkRunCount" INTEGER NOT NULL,
    "p50DurationMs" INTEGER NOT NULL,
    "p75DurationMs" INTEGER NOT NULL,
    "p95DurationMs" INTEGER NOT NULL,
    "maxDurationMs" INTEGER NOT NULL,
    "singleProcessPeakRssMb" INTEGER NOT NULL,
    "dualProcessPeakRssMb" INTEGER,
    "dualConcurrencySupported" BOOLEAN NOT NULL DEFAULT false,
    "appLatencyImpact" JSONB NOT NULL,
    "databaseLatencyImpact" JSONB NOT NULL,
    "availableMemoryMb" INTEGER NOT NULL,
    "capacityStatus" "AgentCapacityStatus" NOT NULL,
    "measuredAt" TIMESTAMPTZ(3) NOT NULL,
    "staleAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agent_runtime_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_capacity_snapshots" (
    "id" UUID NOT NULL,
    "localDate" DATE NOT NULL,
    "concurrency" INTEGER NOT NULL,
    "availableMinutes" INTEGER NOT NULL,
    "reserveFactor" DOUBLE PRECISION NOT NULL,
    "plannedRuns" INTEGER NOT NULL,
    "p75DurationMs" INTEGER NOT NULL,
    "estimatedUtilization" DOUBLE PRECISION NOT NULL,
    "estimatedPublishedMin" INTEGER NOT NULL,
    "estimatedPublishedMax" INTEGER NOT NULL,
    "capacityStatus" "AgentCapacityStatus" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_capacity_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_follows" (
    "followerId" UUID NOT NULL,
    "followedId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_follows_pkey" PRIMARY KEY ("followerId","followedId")
);

-- CreateTable
CREATE TABLE "agent_runtime_events" (
    "id" BIGSERIAL NOT NULL,
    "agentProfileId" UUID,
    "runId" UUID,
    "eventType" VARCHAR(100) NOT NULL,
    "safeMessage" VARCHAR(1000) NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_runtime_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_content_records" (
    "id" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "agentProfileId" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "actionId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_content_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_topic_write_locks" (
    "id" UUID NOT NULL,
    "topicId" UUID NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3),

    CONSTRAINT "agent_topic_write_locks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_profiles_userId_key" ON "agent_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_profiles_currentPersonaVersionId_key" ON "agent_profiles"("currentPersonaVersionId");

-- CreateIndex
CREATE INDEX "agent_profiles_lifecycleStatus_createdAt_idx" ON "agent_profiles"("lifecycleStatus", "createdAt");

-- CreateIndex
CREATE INDEX "agent_persona_versions_agentProfileId_createdAt_idx" ON "agent_persona_versions"("agentProfileId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "agent_persona_versions_agentProfileId_version_key" ON "agent_persona_versions"("agentProfileId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "agent_runtime_states_agentProfileId_key" ON "agent_runtime_states"("agentProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_runtime_states_currentRunId_key" ON "agent_runtime_states"("currentRunId");

-- CreateIndex
CREATE INDEX "agent_runtime_states_runtimeStatus_lastHeartbeatAt_idx" ON "agent_runtime_states"("runtimeStatus", "lastHeartbeatAt");

-- CreateIndex
CREATE INDEX "agent_daily_plans_localDate_status_idx" ON "agent_daily_plans"("localDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "agent_daily_plans_agentProfileId_localDate_key" ON "agent_daily_plans"("agentProfileId", "localDate");

-- CreateIndex
CREATE UNIQUE INDEX "agent_schedule_slots_runId_key" ON "agent_schedule_slots"("runId");

-- CreateIndex
CREATE INDEX "agent_schedule_slots_status_scheduledAt_idx" ON "agent_schedule_slots"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "agent_schedule_slots_agentProfileId_scheduledAt_idx" ON "agent_schedule_slots"("agentProfileId", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "agent_schedule_slots_dailyPlanId_scheduledAt_key" ON "agent_schedule_slots"("dailyPlanId", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "agent_runs_idempotencyKey_key" ON "agent_runs"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "agent_runs_scheduleSlotId_key" ON "agent_runs"("scheduleSlotId");

-- CreateIndex
CREATE INDEX "agent_runs_runStatus_queuePriority_availableAt_createdAt_idx" ON "agent_runs"("runStatus", "queuePriority", "availableAt", "createdAt");

-- CreateIndex
CREATE INDEX "agent_runs_agentProfileId_runStatus_createdAt_idx" ON "agent_runs"("agentProfileId", "runStatus", "createdAt");

-- CreateIndex
CREATE INDEX "agent_runs_leaseExpiresAt_idx" ON "agent_runs"("leaseExpiresAt");

-- CreateIndex
CREATE INDEX "agent_run_events_agentProfileId_createdAt_idx" ON "agent_run_events"("agentProfileId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "agent_run_events_runId_sequence_key" ON "agent_run_events"("runId", "sequence");

-- CreateIndex
CREATE INDEX "agent_actions_agentProfileId_actionType_createdAt_idx" ON "agent_actions"("agentProfileId", "actionType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "agent_actions_runId_sequence_key" ON "agent_actions"("runId", "sequence");

-- CreateIndex
CREATE INDEX "agent_sources_agentProfileId_status_normalizedDomain_idx" ON "agent_sources"("agentProfileId", "status", "normalizedDomain");

-- CreateIndex
CREATE UNIQUE INDEX "agent_sources_agentProfileId_url_key" ON "agent_sources"("agentProfileId", "url");

-- CreateIndex
CREATE INDEX "agent_source_items_sourceId_fetchedAt_idx" ON "agent_source_items"("sourceId", "fetchedAt" DESC);

-- CreateIndex
CREATE INDEX "agent_source_items_expiresAt_idx" ON "agent_source_items"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "agent_source_items_sourceId_contentHash_key" ON "agent_source_items"("sourceId", "contentHash");

-- CreateIndex
CREATE INDEX "agent_memory_episodes_agentProfileId_invalidatedAt_occurred_idx" ON "agent_memory_episodes"("agentProfileId", "invalidatedAt", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "agent_beliefs_agentProfileId_topicKey_lastUpdatedAt_idx" ON "agent_beliefs"("agentProfileId", "topicKey", "lastUpdatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "agent_beliefs_agentProfileId_topicKey_version_key" ON "agent_beliefs"("agentProfileId", "topicKey", "version");

-- CreateIndex
CREATE INDEX "agent_relationships_targetUserId_idx" ON "agent_relationships"("targetUserId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_relationships_agentProfileId_targetUserId_key" ON "agent_relationships"("agentProfileId", "targetUserId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_credentials_tokenHash_key" ON "agent_credentials"("tokenHash");

-- CreateIndex
CREATE INDEX "agent_credentials_agentProfileId_revokedAt_idx" ON "agent_credentials"("agentProfileId", "revokedAt");

-- CreateIndex
CREATE INDEX "agent_credentials_prefix_idx" ON "agent_credentials"("prefix");

-- CreateIndex
CREATE INDEX "agent_runtime_capabilities_measuredAt_idx" ON "agent_runtime_capabilities"("measuredAt" DESC);

-- CreateIndex
CREATE INDEX "agent_capacity_snapshots_localDate_createdAt_idx" ON "agent_capacity_snapshots"("localDate", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "user_follows_followedId_createdAt_idx" ON "user_follows"("followedId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "agent_runtime_events_createdAt_idx" ON "agent_runtime_events"("createdAt");

-- CreateIndex
CREATE INDEX "agent_runtime_events_agentProfileId_id_idx" ON "agent_runtime_events"("agentProfileId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_content_records_entryId_key" ON "agent_content_records"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_content_records_actionId_key" ON "agent_content_records"("actionId");

-- CreateIndex
CREATE INDEX "agent_content_records_agentProfileId_createdAt_idx" ON "agent_content_records"("agentProfileId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "agent_content_records_runId_idx" ON "agent_content_records"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_topic_write_locks_topicId_key" ON "agent_topic_write_locks"("topicId");

-- CreateIndex
CREATE INDEX "agent_topic_write_locks_expiresAt_idx" ON "agent_topic_write_locks"("expiresAt");

-- AddForeignKey
ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_currentPersonaVersionId_fkey" FOREIGN KEY ("currentPersonaVersionId") REFERENCES "agent_persona_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_persona_versions" ADD CONSTRAINT "agent_persona_versions_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_persona_versions" ADD CONSTRAINT "agent_persona_versions_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "agent_persona_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_persona_versions" ADD CONSTRAINT "agent_persona_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runtime_states" ADD CONSTRAINT "agent_runtime_states_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runtime_states" ADD CONSTRAINT "agent_runtime_states_currentRunId_fkey" FOREIGN KEY ("currentRunId") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_global_settings" ADD CONSTRAINT "agent_global_settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_daily_plans" ADD CONSTRAINT "agent_daily_plans_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_daily_plans" ADD CONSTRAINT "agent_daily_plans_capacitySnapshotId_fkey" FOREIGN KEY ("capacitySnapshotId") REFERENCES "agent_capacity_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_schedule_slots" ADD CONSTRAINT "agent_schedule_slots_dailyPlanId_fkey" FOREIGN KEY ("dailyPlanId") REFERENCES "agent_daily_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_schedule_slots" ADD CONSTRAINT "agent_schedule_slots_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_schedule_slots" ADD CONSTRAINT "agent_schedule_slots_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_parentRunId_fkey" FOREIGN KEY ("parentRunId") REFERENCES "agent_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_scheduleSlotId_fkey" FOREIGN KEY ("scheduleSlotId") REFERENCES "agent_schedule_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_personaVersionId_fkey" FOREIGN KEY ("personaVersionId") REFERENCES "agent_persona_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_run_events" ADD CONSTRAINT "agent_run_events_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sources" ADD CONSTRAINT "agent_sources_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_source_items" ADD CONSTRAINT "agent_source_items_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "agent_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_memory_episodes" ADD CONSTRAINT "agent_memory_episodes_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_memory_episodes" ADD CONSTRAINT "agent_memory_episodes_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_beliefs" ADD CONSTRAINT "agent_beliefs_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_relationships" ADD CONSTRAINT "agent_relationships_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_relationships" ADD CONSTRAINT "agent_relationships_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_credentials" ADD CONSTRAINT "agent_credentials_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_followedId_fkey" FOREIGN KEY ("followedId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runtime_events" ADD CONSTRAINT "agent_runtime_events_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runtime_events" ADD CONSTRAINT "agent_runtime_events_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_content_records" ADD CONSTRAINT "agent_content_records_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_content_records" ADD CONSTRAINT "agent_content_records_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_content_records" ADD CONSTRAINT "agent_content_records_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_content_records" ADD CONSTRAINT "agent_content_records_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "agent_actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_topic_write_locks" ADD CONSTRAINT "agent_topic_write_locks_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_topic_write_locks" ADD CONSTRAINT "agent_topic_write_locks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Runtime invariants
ALTER TABLE "users"
  ADD CONSTRAINT "users_agent_role_check" CHECK ("kind" <> 'AGENT' OR "role" = 'USER'),
  ADD CONSTRAINT "users_agent_login_disabled_check" CHECK ("kind" <> 'AGENT' OR "loginDisabled" = true);

ALTER TABLE "user_follows"
  ADD CONSTRAINT "user_follows_no_self_check" CHECK ("followerId" <> "followedId");

ALTER TABLE "agent_profiles"
  ADD CONSTRAINT "agent_profiles_entry_quota_check" CHECK (
    ("dailyEntryMin" IS NULL AND "dailyEntryMax" IS NULL)
    OR (
      "dailyEntryMin" BETWEEN 0 AND 100
      AND "dailyEntryMax" BETWEEN "dailyEntryMin" AND 100
    )
  ),
  ADD CONSTRAINT "agent_profiles_topic_quota_check" CHECK (
    "dailyTopicMin" BETWEEN 0 AND 100
    AND "dailyTopicMax" BETWEEN "dailyTopicMin" AND 100
  ),
  ADD CONSTRAINT "agent_profiles_vote_quota_check" CHECK (
    "dailyVoteMin" BETWEEN 0 AND 100
    AND "dailyVoteMax" BETWEEN "dailyVoteMin" AND 100
  ),
  ADD CONSTRAINT "agent_profiles_scheduled_timeout_check" CHECK ("scheduledTimeoutSeconds" BETWEEN 180 AND 600),
  ADD CONSTRAINT "agent_profiles_manual_timeout_check" CHECK ("manualTimeoutSeconds" BETWEEN 120 AND 1200);

ALTER TABLE "agent_global_settings"
  ADD CONSTRAINT "agent_global_settings_singleton_check" CHECK ("id" = 'global'),
  ADD CONSTRAINT "agent_global_settings_default_quota_check" CHECK (
    "defaultDailyEntryMin" BETWEEN 0 AND 100
    AND "defaultDailyEntryMax" BETWEEN "defaultDailyEntryMin" AND 100
  ),
  ADD CONSTRAINT "agent_global_settings_global_quota_check" CHECK (
    "globalDailyEntryMin" BETWEEN 0 AND 5000
    AND "globalDailyEntryMax" BETWEEN "globalDailyEntryMin" AND 5000
  ),
  ADD CONSTRAINT "agent_global_settings_concurrency_check" CHECK ("codexConcurrency" IN (1, 2)),
  ADD CONSTRAINT "agent_global_settings_scheduled_timeout_check" CHECK ("scheduledTimeoutSeconds" BETWEEN 180 AND 600),
  ADD CONSTRAINT "agent_global_settings_manual_timeout_check" CHECK ("manualTimeoutSeconds" BETWEEN 120 AND 1200),
  ADD CONSTRAINT "agent_global_settings_similarity_check" CHECK ("duplicateSimilarityThreshold" BETWEEN 0 AND 1),
  ADD CONSTRAINT "agent_global_settings_sitemap_delay_check" CHECK ("sitemapDelayMinutes" BETWEEN 0 AND 10080),
  ADD CONSTRAINT "agent_global_settings_debug_retention_check" CHECK ("debugRetentionHours" BETWEEN 0 AND 24);

ALTER TABLE "agent_runs"
  ADD CONSTRAINT "agent_runs_desired_entry_check" CHECK (
    "desiredEntryMin" BETWEEN 0 AND 10
    AND "desiredEntryMax" BETWEEN "desiredEntryMin" AND 10
  ),
  ADD CONSTRAINT "agent_runs_timeout_check" CHECK ("timeoutSeconds" BETWEEN 120 AND 1200),
  ADD CONSTRAINT "agent_runs_lease_check" CHECK (
    ("leaseOwner" IS NULL AND "leaseExpiresAt" IS NULL)
    OR ("leaseOwner" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL)
  );

ALTER TABLE "agent_schedule_slots"
  ADD CONSTRAINT "agent_schedule_slots_desired_entry_check" CHECK (
    "desiredEntryMin" BETWEEN 0 AND 4
    AND "desiredEntryMax" BETWEEN "desiredEntryMin" AND 4
  );

ALTER TABLE "agent_sources"
  ADD CONSTRAINT "agent_sources_scores_check" CHECK (
    "trustScore" BETWEEN 0 AND 1
    AND "interestScore" BETWEEN 0 AND 1
    AND "noveltyScore" BETWEEN 0 AND 1
    AND "usefulnessScore" BETWEEN 0 AND 1
  ),
  ADD CONSTRAINT "agent_sources_block_check" CHECK (NOT ("adminPinned" AND "adminBlocked"));

ALTER TABLE "agent_memory_episodes"
  ADD CONSTRAINT "agent_memory_salience_check" CHECK ("salience" BETWEEN 0 AND 1);

ALTER TABLE "agent_beliefs"
  ADD CONSTRAINT "agent_belief_confidence_check" CHECK ("confidence" BETWEEN 0 AND 1),
  ADD CONSTRAINT "agent_belief_version_check" CHECK ("version" > 0);

ALTER TABLE "agent_relationships"
  ADD CONSTRAINT "agent_relationship_scores_check" CHECK (
    "familiarity" BETWEEN 0 AND 1
    AND "trust" BETWEEN 0 AND 1
    AND "interest" BETWEEN 0 AND 1
    AND "disagreement" BETWEEN 0 AND 1
  );

ALTER TABLE "agent_runtime_capabilities"
  ADD CONSTRAINT "agent_capability_run_count_check" CHECK ("benchmarkRunCount" >= 0),
  ADD CONSTRAINT "agent_capability_percentiles_check" CHECK (
    "p50DurationMs" <= "p75DurationMs"
    AND "p75DurationMs" <= "p95DurationMs"
    AND "p95DurationMs" <= "maxDurationMs"
  );

ALTER TABLE "agent_capacity_snapshots"
  ADD CONSTRAINT "agent_capacity_reserve_check" CHECK ("reserveFactor" BETWEEN 0 AND 1),
  ADD CONSTRAINT "agent_capacity_estimate_check" CHECK (
    "estimatedPublishedMin" >= 0
    AND "estimatedPublishedMax" >= "estimatedPublishedMin"
  );

CREATE UNIQUE INDEX "agent_runs_one_active_per_agent_idx"
  ON "agent_runs"("agentProfileId")
  WHERE "runStatus" IN ('RUNNING', 'CANCEL_REQUESTED');

CREATE OR REPLACE FUNCTION prevent_agent_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "agent_persona_versions_append_only"
  BEFORE UPDATE OR DELETE ON "agent_persona_versions"
  FOR EACH ROW EXECUTE FUNCTION prevent_agent_append_only_mutation();

CREATE TRIGGER "agent_run_events_append_only"
  BEFORE UPDATE OR DELETE ON "agent_run_events"
  FOR EACH ROW EXECUTE FUNCTION prevent_agent_append_only_mutation();

CREATE TRIGGER "agent_runtime_events_append_only"
  BEFORE UPDATE OR DELETE ON "agent_runtime_events"
  FOR EACH ROW EXECUTE FUNCTION prevent_agent_append_only_mutation();

CREATE OR REPLACE FUNCTION prevent_agent_action_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'agent_actions cannot be deleted' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "agent_actions_no_delete"
  BEFORE DELETE ON "agent_actions"
  FOR EACH ROW EXECUTE FUNCTION prevent_agent_action_delete();

CREATE OR REPLACE FUNCTION protect_agent_action_immutable_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."runId" IS DISTINCT FROM OLD."runId"
    OR NEW."agentProfileId" IS DISTINCT FROM OLD."agentProfileId"
    OR NEW."sequence" IS DISTINCT FROM OLD."sequence"
    OR NEW."actionType" IS DISTINCT FROM OLD."actionType"
    OR NEW."targetType" IS DISTINCT FROM OLD."targetType"
    OR NEW."targetId" IS DISTINCT FROM OLD."targetId"
    OR NEW."input" IS DISTINCT FROM OLD."input"
    OR NEW."provenance" IS DISTINCT FROM OLD."provenance"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'agent_actions proposal fields are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "agent_actions_immutable_proposal"
  BEFORE UPDATE ON "agent_actions"
  FOR EACH ROW EXECUTE FUNCTION protect_agent_action_immutable_fields();

INSERT INTO "agent_global_settings" (
  "id",
  "activeTimeWeights",
  "circuitBreakerConfig",
  "updatedAt"
) VALUES (
  'global',
  '{"07:00-10:00":0.15,"10:00-14:00":0.30,"14:00-19:00":0.35,"19:00-23:00":0.17,"23:00-07:00":0.03}'::jsonb,
  '{"errorRateWindowMinutes":15,"errorRateThreshold":0.5,"consecutiveCodexFailures":5,"duplicateWindowSize":50,"duplicateThreshold":0.4,"duplicateCooldownMinutes":60,"utilizationWindowMinutes":120,"utilizationThreshold":0.9}'::jsonb,
  CURRENT_TIMESTAMP
);
