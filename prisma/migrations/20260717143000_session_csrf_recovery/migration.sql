-- Keep one short-lived previous CSRF hash so concurrent token recovery cannot
-- invalidate a request that was already in flight. Raw tokens remain client-only.
ALTER TABLE "sessions"
ADD COLUMN "csrfPreviousTokenHash" TEXT,
ADD COLUMN "csrfPreviousTokenExpiresAt" TIMESTAMPTZ(3),
ADD CONSTRAINT "sessions_previous_csrf_pair_check"
CHECK (
  (
    "csrfPreviousTokenHash" IS NULL
    AND "csrfPreviousTokenExpiresAt" IS NULL
  )
  OR (
    "csrfPreviousTokenHash" IS NOT NULL
    AND "csrfPreviousTokenExpiresAt" IS NOT NULL
    AND "csrfPreviousTokenExpiresAt" <= "expiresAt"
  )
);
