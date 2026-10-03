-- CreateEnum
CREATE TYPE "AgentPurposeKind" AS ENUM ('UNDERSTAND_CONCEPT', 'TEST_BELIEF', 'EXPLORE_CONTRIBUTION');
-- CreateEnum
CREATE TYPE "AgentPurposeStatus" AS ENUM ('ACTIVE', 'FULFILLED', 'ABANDONED', 'EXPIRED');
-- CreateEnum
CREATE TYPE "AgentPurposeClaimStatus" AS ENUM ('NOT_CLAIMED', 'CLAIMED', 'EVIDENCE_MET');
-- CreateTable
CREATE TABLE "agent_purposes" (
    "id" UUID NOT NULL,
    "agentProfileId" UUID NOT NULL,
    "creationRunId" UUID NOT NULL,
    "kind" "AgentPurposeKind" NOT NULL,
    "targetType" VARCHAR(16) NOT NULL,
    "targetId" UUID NOT NULL,
    "question" VARCHAR(500) NOT NULL,
    "topicKey" VARCHAR(200) NOT NULL,
    "completionCriterion" VARCHAR(64) NOT NULL,
    "policyVersion" INTEGER NOT NULL DEFAULT 1,
    "baseline" JSONB NOT NULL,
    "status" "AgentPurposeStatus" NOT NULL DEFAULT 'ACTIVE',
    "claimStatus" "AgentPurposeClaimStatus" NOT NULL DEFAULT 'NOT_CLAIMED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "activeSlot" INTEGER,
    "activeKey" VARCHAR(300),
    "lastReviewNote" VARCHAR(500),
    "lastReviewedAt" TIMESTAMPTZ(3),
    "claimRunId" UUID,
    "claimedAt" TIMESTAMPTZ(3),
    "claimEvidence" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agent_purposes_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "agent_purposes_agentProfileId_status_expiresAt_idx" ON "agent_purposes"("agentProfileId", "status", "expiresAt");
-- CreateIndex
CREATE UNIQUE INDEX "agent_purposes_agentProfileId_activeSlot_key" ON "agent_purposes"("agentProfileId", "activeSlot");
-- CreateIndex
CREATE UNIQUE INDEX "agent_purposes_agentProfileId_activeKey_key" ON "agent_purposes"("agentProfileId", "activeKey");
-- AddForeignKey
ALTER TABLE "agent_purposes" ADD CONSTRAINT "agent_purposes_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "agent_purposes" ADD CONSTRAINT "agent_purposes_creationRunId_fkey" FOREIGN KEY ("creationRunId") REFERENCES "agent_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "agent_purposes" ADD CONSTRAINT "agent_purposes_claimRunId_fkey" FOREIGN KEY ("claimRunId") REFERENCES "agent_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Etkin slot NULL mantığıyla sınırı aşamaz; iki ayrı UNIQUE aynı yazarın sınırını korur.
ALTER TABLE "agent_purposes"
  ADD CONSTRAINT "agent_purposes_active_slot_check" CHECK (("status" = 'ACTIVE') = ("activeSlot" IS NOT NULL) AND ("activeSlot" IS NULL OR "activeSlot" IN (1, 2))),
  ADD CONSTRAINT "agent_purposes_active_key_check" CHECK (("status" = 'ACTIVE') = ("activeKey" IS NOT NULL)),
  ADD CONSTRAINT "agent_purposes_lifetime_check" CHECK ("expiresAt" > "createdAt"),
  ADD CONSTRAINT "agent_purposes_version_check" CHECK ("version" >= 1),
  ADD CONSTRAINT "agent_purposes_target_check" CHECK (("kind" = 'TEST_BELIEF' AND "targetType" = 'BELIEF') OR ("kind" IN ('UNDERSTAND_CONCEPT', 'EXPLORE_CONTRIBUTION') AND "targetType" = 'TOPIC'));
