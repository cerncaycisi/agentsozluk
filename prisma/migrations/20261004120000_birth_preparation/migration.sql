ALTER TYPE "AgentBirthCandidateStatus" ADD VALUE 'PREPARED';
ALTER TYPE "AgentBirthCandidateStatus" ADD VALUE 'ACTIVATED';

ALTER TABLE "agent_birth_candidates"
  ADD COLUMN "childProfileId" UUID,
  ADD COLUMN "rootProfileId" UUID,
  ADD COLUMN "preparedAt" TIMESTAMPTZ(3),
  ADD COLUMN "preparationExpiresAt" TIMESTAMPTZ(3),
  ADD COLUMN "preparationEvidence" JSONB,
  ADD COLUMN "activatedAt" TIMESTAMPTZ(3),
  ADD CONSTRAINT "agent_birth_candidates_childProfileId_fkey" FOREIGN KEY ("childProfileId") REFERENCES "agent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "agent_birth_candidates_rootProfileId_fkey" FOREIGN KEY ("rootProfileId") REFERENCES "agent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "agent_birth_candidates_preparation_check" CHECK (
    ("childProfileId" IS NULL AND "rootProfileId" IS NULL AND "preparedAt" IS NULL
      AND "preparationExpiresAt" IS NULL AND "preparationEvidence" IS NULL AND "activatedAt" IS NULL
      AND "status"::text NOT IN ('PREPARED', 'ACTIVATED'))
    OR
    ("childProfileId" IS NOT NULL AND "rootProfileId" IS NOT NULL AND "preparedAt" IS NOT NULL
      AND "preparationExpiresAt" IS NOT NULL AND "preparationEvidence" IS NOT NULL
      AND "childProfileId" <> "parentProfileId" AND "childProfileId" <> "rootProfileId"
      AND "preparedAt" >= "createdAt" AND "preparedAt" < "expiresAt"
      AND "closedAt" = "preparedAt" AND "closureReason" = 'PREPARED'
      AND "preparationExpiresAt" > "preparedAt"
      AND "preparationExpiresAt" <= "preparedAt" + interval '14 days'
      AND jsonb_typeof("preparationEvidence") = 'object'
      AND (("status"::text = 'PREPARED' AND "activatedAt" IS NULL)
        OR ("status"::text = 'ACTIVATED' AND "activatedAt" IS NOT NULL AND "activatedAt" >= "preparedAt"
          AND "activatedAt" < "preparationExpiresAt")))
  );
CREATE UNIQUE INDEX "agent_birth_candidates_childProfileId_key" ON "agent_birth_candidates"("childProfileId");
CREATE INDEX "agent_birth_candidates_rootProfileId_idx" ON "agent_birth_candidates"("rootProfileId");
CREATE UNIQUE INDEX "agent_birth_candidates_one_prepared" ON "agent_birth_candidates"((true))
  WHERE "childProfileId" IS NOT NULL AND "activatedAt" IS NULL;

CREATE OR REPLACE FUNCTION protect_agent_birth_candidate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  mutable_fields text[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'AGENT_BIRTH_CANDIDATE_IMMUTABLE';
  END IF;
  IF OLD."status"::text = 'PROPOSED' AND NEW."status"::text = 'PREPARED' THEN
    mutable_fields := ARRAY['status', 'version', 'closedAt', 'closureReason', 'childProfileId',
      'rootProfileId', 'preparedAt', 'preparationExpiresAt', 'preparationEvidence'];
  ELSIF OLD."status"::text = 'PREPARED' AND NEW."status"::text = 'ACTIVATED' THEN
    mutable_fields := ARRAY['status', 'version', 'activatedAt'];
  ELSIF OLD."status"::text = 'PROPOSED' AND NEW."status"::text IN ('EXPIRED', 'WITHDRAWN', 'REJECTED') THEN
    mutable_fields := ARRAY['status', 'version', 'closedAt', 'closureReason'];
  ELSE
    RAISE EXCEPTION 'AGENT_BIRTH_CANDIDATE_IMMUTABLE';
  END IF;
  IF (to_jsonb(NEW) - mutable_fields) IS DISTINCT FROM (to_jsonb(OLD) - mutable_fields)
     OR NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'AGENT_BIRTH_CANDIDATE_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

-- Köken okuması sınırlı kimliklerle yapılır. Genel yazma dondurması/indeks süresi kapısı sürer.
CREATE INDEX "audit_agent_creation_lookup" ON "audit_logs"("entityId")
  WHERE "action" = 'agent.created' AND "entityType" = 'AgentProfile';
