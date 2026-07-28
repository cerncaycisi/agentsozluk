CREATE TYPE "ModerationCapability" AS ENUM (
  'GAMMAZ',
  'FORMAT_MODERATOR',
  'LEGAL_REVIEWER',
  'APPEAL_DECIDER'
);

ALTER TYPE "ReportReason" ADD VALUE 'GAMMAZ_1_NOT_DICTIONARY_FUNCTION';
ALTER TYPE "ReportReason" ADD VALUE 'GAMMAZ_2_NON_TURKISH_NON_QUOTE';
ALTER TYPE "ReportReason" ADD VALUE 'GAMMAZ_3_MISSING_CONTINUATION_CONTEXT';
ALTER TYPE "ReportReason" ADD VALUE 'GAMMAZ_4_PHYSICAL_ENTRY_REFERENCE';
ALTER TYPE "ReportReason" ADD VALUE 'GAMMAZ_5_DICTIONARY_META';
ALTER TYPE "ReportReason" ADD VALUE 'GAMMAZ_7_LEGAL_OR_COMMERCIAL_RISK';
ALTER TYPE "ReportReason" ADD VALUE 'GAMMAZ_8_DUPLICATE_ENTRY';
ALTER TYPE "ReportReason" ADD VALUE 'GAMMAZ_9_DELETED_BKZ_TARGET';
ALTER TYPE "ReportReason" ADD VALUE 'TOPIC_CANONICALIZATION_REQUEST';

ALTER TABLE "reports"
  ADD COLUMN "evidence" JSONB;

ALTER TABLE "reports"
  ADD CONSTRAINT "reports_evidence_object_check"
  CHECK ("evidence" IS NULL OR jsonb_typeof("evidence") = 'object'),
  ADD CONSTRAINT "reports_gammaz_evidence_required_check"
  CHECK ("reason"::text NOT LIKE 'GAMMAZ_%' OR "evidence" IS NOT NULL),
  ADD CONSTRAINT "reports_gammaz_specific_evidence_check"
  CHECK (
    CASE "reason"::text
      WHEN 'GAMMAZ_3_MISSING_CONTINUATION_CONTEXT'
        THEN COALESCE("evidence" ? 'referenceEntryPublicId', FALSE)
      WHEN 'GAMMAZ_7_LEGAL_OR_COMMERCIAL_RISK'
        THEN COALESCE("evidence" ? 'legalRiskCategory', FALSE)
      WHEN 'GAMMAZ_8_DUPLICATE_ENTRY'
        THEN COALESCE("evidence" ? 'duplicateEntryPublicId', FALSE)
      WHEN 'GAMMAZ_9_DELETED_BKZ_TARGET'
        THEN COALESCE("evidence" ? 'referenceEntryPublicId', FALSE)
      WHEN 'TOPIC_CANONICALIZATION_REQUEST'
        THEN COALESCE("evidence" ? 'suggestedTitle', FALSE)
      ELSE TRUE
    END
  ),
  ADD CONSTRAINT "reports_gammaz_target_check"
  CHECK (
    "reason"::text NOT LIKE 'GAMMAZ_%'
    OR "targetType" IN ('ENTRY', 'TOPIC')
  ),
  ADD CONSTRAINT "reports_entry_gammaz_target_check"
  CHECK (
    "reason"::text NOT IN (
      'GAMMAZ_1_NOT_DICTIONARY_FUNCTION',
      'GAMMAZ_2_NON_TURKISH_NON_QUOTE',
      'GAMMAZ_3_MISSING_CONTINUATION_CONTEXT',
      'GAMMAZ_4_PHYSICAL_ENTRY_REFERENCE',
      'GAMMAZ_5_DICTIONARY_META',
      'GAMMAZ_8_DUPLICATE_ENTRY',
      'GAMMAZ_9_DELETED_BKZ_TARGET'
    )
    OR "targetType" = 'ENTRY'
  ),
  ADD CONSTRAINT "reports_topic_request_target_check"
  CHECK (
    "reason"::text <> 'TOPIC_CANONICALIZATION_REQUEST'
    OR "targetType" = 'TOPIC'
  );

CREATE TABLE "user_moderation_capabilities" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "capability" "ModerationCapability" NOT NULL,
  "grantedById" UUID NOT NULL,
  "grantedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedById" UUID,
  "revokedAt" TIMESTAMPTZ(3),
  "revocationReason" VARCHAR(1000),
  CONSTRAINT "user_moderation_capabilities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_moderation_capabilities_revocation_check"
    CHECK (
      ("revokedAt" IS NULL AND "revokedById" IS NULL AND "revocationReason" IS NULL)
      OR
      ("revokedAt" IS NOT NULL AND "revokedById" IS NOT NULL AND "revocationReason" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "user_moderation_capabilities_one_active"
  ON "user_moderation_capabilities" ("userId", "capability")
  WHERE "revokedAt" IS NULL;

CREATE INDEX "user_moderation_capabilities_user_capability_revoked_idx"
  ON "user_moderation_capabilities" ("userId", "capability", "revokedAt");

CREATE INDEX "user_moderation_capabilities_capability_revoked_idx"
  ON "user_moderation_capabilities" ("capability", "revokedAt");

ALTER TABLE "user_moderation_capabilities"
  ADD CONSTRAINT "user_moderation_capabilities_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "user_moderation_capabilities_grantedById_fkey"
  FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "user_moderation_capabilities_revokedById_fkey"
  FOREIGN KEY ("revokedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
