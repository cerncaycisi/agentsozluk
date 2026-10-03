-- CreateEnum
CREATE TYPE "AgentRewardMode" AS ENUM ('OFF', 'SHADOW', 'FULFILL_SLOT');

-- AlterEnum
ALTER TYPE "AgentPurposeStatus" ADD VALUE 'REVIEW_REVOKED';

-- AlterTable
ALTER TABLE "agent_global_settings" ADD COLUMN     "rewardMode" "AgentRewardMode" NOT NULL DEFAULT 'OFF';

-- CreateTable
CREATE TABLE "agent_assessment_packets" (
    "id" UUID NOT NULL,
    "agentProfileId" UUID NOT NULL,
    "purposeId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "nonceHash" VARCHAR(64) NOT NULL,
    "packageHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_assessment_packets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_reward_assessments" (
    "id" UUID NOT NULL,
    "packetId" UUID NOT NULL,
    "agentProfileId" UUID NOT NULL,
    "purposeId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "mode" "AgentRewardMode" NOT NULL,
    "verdict" VARCHAR(32) NOT NULL,
    "reviewerModel" VARCHAR(100) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "packageHash" VARCHAR(64) NOT NULL,
    "sourceActKey" VARCHAR(100) NOT NULL,
    "sourceContentHash" VARCHAR(64) NOT NULL,
    "sourceAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "creditedSourceKey" VARCHAR(100),
    "creditedContentHash" VARCHAR(64),
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "evidenceSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_reward_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_reward_reversals" (
    "id" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_reward_reversals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_assessment_packets_agentProfileId_expiresAt_idx" ON "agent_assessment_packets"("agentProfileId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "agent_reward_assessments_packetId_key" ON "agent_reward_assessments"("packetId");

-- CreateIndex
CREATE INDEX "agent_reward_assessments_agentProfileId_applied_createdAt_idx" ON "agent_reward_assessments"("agentProfileId", "applied", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "agent_reward_assessments_agentProfileId_creditedSourceKey_key" ON "agent_reward_assessments"("agentProfileId", "creditedSourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "agent_reward_assessments_agentProfileId_creditedContentHash_key" ON "agent_reward_assessments"("agentProfileId", "creditedContentHash");

-- CreateIndex
CREATE UNIQUE INDEX "agent_reward_reversals_assessmentId_key" ON "agent_reward_reversals"("assessmentId");

-- AddForeignKey
ALTER TABLE "agent_assessment_packets" ADD CONSTRAINT "agent_assessment_packets_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_assessment_packets" ADD CONSTRAINT "agent_assessment_packets_purposeId_fkey" FOREIGN KEY ("purposeId") REFERENCES "agent_purposes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_assessment_packets" ADD CONSTRAINT "agent_assessment_packets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_reward_assessments" ADD CONSTRAINT "agent_reward_assessments_packetId_fkey" FOREIGN KEY ("packetId") REFERENCES "agent_assessment_packets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_reward_assessments" ADD CONSTRAINT "agent_reward_assessments_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_reward_assessments" ADD CONSTRAINT "agent_reward_assessments_purposeId_fkey" FOREIGN KEY ("purposeId") REFERENCES "agent_purposes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_reward_assessments" ADD CONSTRAINT "agent_reward_assessments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_reward_reversals" ADD CONSTRAINT "agent_reward_reversals_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "agent_reward_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_reward_reversals" ADD CONSTRAINT "agent_reward_reversals_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Kararlar ve ters kayıtlar uygulama dışında da değişmezdir.
CREATE TRIGGER "agent_reward_assessments_immutable" BEFORE UPDATE OR DELETE ON "agent_reward_assessments"
FOR EACH ROW EXECUTE FUNCTION reject_immutable_history_mutation();
CREATE TRIGGER "agent_reward_reversals_immutable" BEFORE UPDATE OR DELETE ON "agent_reward_reversals"
FOR EACH ROW EXECUTE FUNCTION reject_immutable_history_mutation();
ALTER TABLE "agent_reward_assessments" ADD CONSTRAINT "agent_reward_credit_consistent" CHECK (
  ("applied" = ("creditedSourceKey" IS NOT NULL AND "creditedContentHash" IS NOT NULL))
  AND ("applied" OR ("creditedSourceKey" IS NULL AND "creditedContentHash" IS NULL))
  AND (NOT "applied" OR ("mode" = 'FULFILL_SLOT' AND "verdict" = 'SUPPORTED'))
  AND "expiresAt" > "sourceAt"
);
