ALTER TABLE "agent_runs"
ADD COLUMN "leaseToken" VARCHAR(43);

ALTER TABLE "agent_runs"
ADD CONSTRAINT "agent_runs_lease_token_shape"
CHECK (
  "leaseToken" IS NULL
  OR "leaseToken" ~ '^[A-Za-z0-9_-]{43}$'
);
