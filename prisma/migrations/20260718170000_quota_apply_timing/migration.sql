ALTER TABLE "agent_global_settings"
  ADD COLUMN "pendingQuotaSettings" JSONB,
  ADD COLUMN "pendingQuotaEffectiveDate" DATE;

ALTER TABLE "agent_global_settings"
  ADD CONSTRAINT "agent_global_settings_pending_quota_pair_check"
  CHECK (
    ("pendingQuotaSettings" IS NULL AND "pendingQuotaEffectiveDate" IS NULL)
    OR
    ("pendingQuotaSettings" IS NOT NULL AND "pendingQuotaEffectiveDate" IS NOT NULL)
  );
