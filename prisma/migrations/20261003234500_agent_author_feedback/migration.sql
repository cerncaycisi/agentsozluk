-- CreateEnum
CREATE TYPE "AgentFeedbackChannel" AS ENUM ('INTRINSIC', 'QUALITY');

-- AlterTable
ALTER TABLE "agent_assessment_packets" ADD COLUMN     "channel" "AgentFeedbackChannel" NOT NULL DEFAULT 'INTRINSIC',
ADD COLUMN     "entryId" UUID,
ALTER COLUMN "purposeId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "agent_reward_assessments" ADD COLUMN     "channel" "AgentFeedbackChannel" NOT NULL DEFAULT 'INTRINSIC',
ADD COLUMN     "entryId" UUID,
ALTER COLUMN "purposeId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "agent_reward_assessments_agentProfileId_createdAt_idx" ON "agent_reward_assessments"("agentProfileId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "agent_assessment_packets" ADD CONSTRAINT "agent_assessment_packets_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_reward_assessments" ADD CONSTRAINT "agent_reward_assessments_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Tek hedef yeterli değildir: kanal ile hedef türü de aynı olmalıdır.
ALTER TABLE "agent_assessment_packets" ADD CONSTRAINT "agent_assessment_packet_channel_target" CHECK (
  ("channel" = 'INTRINSIC' AND "purposeId" IS NOT NULL AND "entryId" IS NULL)
  OR ("channel" = 'QUALITY' AND "entryId" IS NOT NULL AND "purposeId" IS NULL)
);
ALTER TABLE "agent_reward_assessments" ADD CONSTRAINT "agent_reward_assessment_channel_target" CHECK (
  ("channel" = 'INTRINSIC' AND "purposeId" IS NOT NULL AND "entryId" IS NULL)
  OR ("channel" = 'QUALITY' AND "entryId" IS NOT NULL AND "purposeId" IS NULL)
);
