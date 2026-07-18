-- CreateEnum
CREATE TYPE "AgentRuntimeOperatingMode" AS ENUM ('NORMAL', 'MAINTENANCE');

-- AlterTable
ALTER TABLE "agent_global_settings"
  ADD COLUMN "publicWriteEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "runtimeOperatingMode" "AgentRuntimeOperatingMode" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "sourceFetchLimit" INTEGER NOT NULL DEFAULT 8;

-- AddConstraint
ALTER TABLE "agent_global_settings"
  ADD CONSTRAINT "agent_global_settings_source_fetch_limit_check"
  CHECK ("sourceFetchLimit" BETWEEN 1 AND 50);
