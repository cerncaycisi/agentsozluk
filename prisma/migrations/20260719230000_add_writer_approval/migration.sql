-- Existing accounts were already allowed to publish. Only registrations created
-- after this migration enter the explicit admin writer-approval queue.
ALTER TABLE "users"
ADD COLUMN "writerApproved" BOOLEAN NOT NULL DEFAULT true;
