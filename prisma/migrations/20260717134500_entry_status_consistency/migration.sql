ALTER TABLE "entries"
  ADD CONSTRAINT "entries_status_timestamps_consistent_check"
  CHECK (
    (
      "status" = 'ACTIVE'
      AND "deletedAt" IS NULL
      AND "hiddenAt" IS NULL
    )
    OR (
      "status" = 'HIDDEN'
      AND "deletedAt" IS NULL
      AND "hiddenAt" IS NOT NULL
    )
    OR (
      "status" = 'DELETED'
      AND "deletedAt" IS NOT NULL
      AND "hiddenAt" IS NULL
    )
  );
