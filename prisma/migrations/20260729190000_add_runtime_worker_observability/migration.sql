ALTER TABLE "agent_runtime_credential_sync"
  ADD COLUMN "workerBootId" UUID,
  ADD COLUMN "processingLanes" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "codexVersion" VARCHAR(200),
  ADD COLUMN "promptProfileHash" VARCHAR(128),
  ADD COLUMN "workerStartedAt" TIMESTAMPTZ(3),
  ADD COLUMN "workerRestartCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "agent_runtime_credential_sync"
  ADD CONSTRAINT "agent_runtime_credential_sync_processing_lanes_check"
  CHECK ("processingLanes" BETWEEN 1 AND 2),
  ADD CONSTRAINT "agent_runtime_credential_sync_restart_count_check"
  CHECK ("workerRestartCount" >= 0);
