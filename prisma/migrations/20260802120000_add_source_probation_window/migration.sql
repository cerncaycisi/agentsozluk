ALTER TABLE "agent_sources"
  ADD COLUMN "probationStartedAt" TIMESTAMPTZ(3);

UPDATE "agent_sources"
SET
  "status" = 'PROBATION',
  "probationStartedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'SEED'
  AND "adminBlocked" = false;
