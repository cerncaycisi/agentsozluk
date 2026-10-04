CREATE TYPE "AgentBirthMode" AS ENUM ('OFF', 'CANDIDATES');
CREATE TYPE "AgentBirthCandidateStatus" AS ENUM ('PROPOSED', 'EXPIRED', 'WITHDRAWN', 'REJECTED');
ALTER TABLE "agent_global_settings"
  ADD COLUMN "birthMode" "AgentBirthMode" NOT NULL DEFAULT 'OFF',
  ADD COLUMN "lastBirthScanAt" TIMESTAMPTZ(3),
  ADD COLUMN "lastBirthCandidateAt" TIMESTAMPTZ(3);

CREATE TABLE "agent_birth_candidates" (
  "id" UUID NOT NULL,
  "parentProfileId" UUID NOT NULL,
  "parentPersonaVersionId" UUID NOT NULL,
  "draftKey" VARCHAR(32) NOT NULL,
  "draftVersion" INTEGER NOT NULL,
  "policyVersion" INTEGER NOT NULL,
  "weekStart" TIMESTAMPTZ(3) NOT NULL,
  "persona" JSONB NOT NULL,
  "evidence" JSONB NOT NULL,
  "snapshotHash" VARCHAR(64) NOT NULL,
  "status" "AgentBirthCandidateStatus" NOT NULL DEFAULT 'PROPOSED',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "closedAt" TIMESTAMPTZ(3),
  "closureReason" VARCHAR(100),
  CONSTRAINT "agent_birth_candidates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_birth_candidates_parentProfileId_fkey" FOREIGN KEY ("parentProfileId") REFERENCES "agent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "agent_birth_candidates_parentPersonaVersionId_fkey" FOREIGN KEY ("parentPersonaVersionId") REFERENCES "agent_persona_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "agent_birth_candidates_shape_check" CHECK (
    "draftVersion" > 0 AND "policyVersion" > 0 AND "version" > 0
    AND "snapshotHash" ~ '^[a-f0-9]{64}$'
    AND "expiresAt" > "createdAt"
    AND "expiresAt" <= "createdAt" + interval '7 days'
    AND jsonb_typeof("persona") = 'object' AND jsonb_typeof("evidence") = 'object'
    AND (("status" = 'PROPOSED' AND "closedAt" IS NULL AND "closureReason" IS NULL)
      OR ("status" <> 'PROPOSED' AND "closedAt" IS NOT NULL AND "closedAt" >= "createdAt" AND "closureReason" IS NOT NULL))
  )
);
CREATE UNIQUE INDEX "agent_birth_candidates_parent_week_policy_key"
  ON "agent_birth_candidates"("parentProfileId", "weekStart", "policyVersion");
CREATE INDEX "agent_birth_candidates_status_createdAt_idx" ON "agent_birth_candidates"("status", "createdAt");
CREATE UNIQUE INDEX "agent_birth_candidates_one_proposed" ON "agent_birth_candidates"((true)) WHERE "status" = 'PROPOSED';

CREATE FUNCTION protect_agent_birth_candidate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'AGENT_BIRTH_CANDIDATE_IMMUTABLE';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status', 'version', 'closedAt', 'closureReason']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status', 'version', 'closedAt', 'closureReason'])
     OR OLD."status" <> 'PROPOSED' OR NEW."status" = 'PROPOSED'
     OR NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'AGENT_BIRTH_CANDIDATE_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "agent_birth_candidates_immutable"
  BEFORE UPDATE OR DELETE ON "agent_birth_candidates"
  FOR EACH ROW EXECUTE FUNCTION protect_agent_birth_candidate();

-- Sadece bağımsız değerlendirme audit'lerinin bounded kimlik okuması.
CREATE INDEX "audit_reward_assessment_lookup" ON "audit_logs"("entityId")
  WHERE "action" = 'agent.reward.assessed' AND "entityType" = 'AgentRewardAssessment';
