CREATE TABLE "seed_entry_visibility" (
  "entryId" UUID NOT NULL,
  "suppressed" BOOLEAN NOT NULL DEFAULT true,
  "suppressionReason" VARCHAR(1000) NOT NULL,
  "suppressedById" UUID NOT NULL,
  "suppressedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "restorationReason" VARCHAR(1000),
  "restoredById" UUID,
  "restoredAt" TIMESTAMPTZ(3),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "seed_entry_visibility_pkey" PRIMARY KEY ("entryId"),
  CONSTRAINT "seed_entry_visibility_suppression_reason_check"
    CHECK (char_length("suppressionReason") BETWEEN 10 AND 1000),
  CONSTRAINT "seed_entry_visibility_restoration_reason_check"
    CHECK ("restorationReason" IS NULL OR char_length("restorationReason") BETWEEN 10 AND 1000),
  CONSTRAINT "seed_entry_visibility_state_check"
    CHECK (
      ("suppressed" = true
        AND "restorationReason" IS NULL
        AND "restoredById" IS NULL
        AND "restoredAt" IS NULL)
      OR
      ("suppressed" = false
        AND "restorationReason" IS NOT NULL
        AND "restoredById" IS NOT NULL
        AND "restoredAt" IS NOT NULL
        AND "restoredAt" >= "suppressedAt")
    )
);

CREATE INDEX "seed_entry_visibility_suppressed_suppressedAt_idx"
  ON "seed_entry_visibility" ("suppressed", "suppressedAt" DESC);
CREATE INDEX "seed_entry_visibility_suppressedById_suppressedAt_idx"
  ON "seed_entry_visibility" ("suppressedById", "suppressedAt" DESC);
CREATE INDEX "seed_entry_visibility_restoredById_restoredAt_idx"
  ON "seed_entry_visibility" ("restoredById", "restoredAt" DESC);

ALTER TABLE "seed_entry_visibility"
  ADD CONSTRAINT "seed_entry_visibility_entryId_fkey"
    FOREIGN KEY ("entryId") REFERENCES "entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "seed_entry_visibility_suppressedById_fkey"
    FOREIGN KEY ("suppressedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "seed_entry_visibility_restoredById_fkey"
    FOREIGN KEY ("restoredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION validate_seed_entry_visibility() RETURNS trigger AS $$
DECLARE
  entry_origin TEXT;
  suppressor_kind TEXT;
  suppressor_role TEXT;
  suppressor_status TEXT;
  restorer_kind TEXT;
  restorer_role TEXT;
  restorer_status TEXT;
BEGIN
  SELECT "origin"::text
  INTO entry_origin
  FROM "entries"
  WHERE "id" = NEW."entryId"
  FOR UPDATE;

  IF entry_origin IS DISTINCT FROM 'SEED' THEN
    RAISE EXCEPTION 'seed visibility target must be a canonical seed entry';
  END IF;

  IF TG_OP = 'INSERT' OR NEW."suppressed" = true THEN
    SELECT "kind"::text, "role"::text, "status"::text
    INTO suppressor_kind, suppressor_role, suppressor_status
    FROM "users"
    WHERE "id" = NEW."suppressedById";

    IF suppressor_kind IS DISTINCT FROM 'HUMAN'
       OR suppressor_role IS DISTINCT FROM 'ADMIN'
       OR suppressor_status IS DISTINCT FROM 'ACTIVE' THEN
      RAISE EXCEPTION 'seed visibility suppressor must be an active human admin';
    END IF;
  END IF;

  IF NEW."suppressed" = false THEN
    SELECT "kind"::text, "role"::text, "status"::text
    INTO restorer_kind, restorer_role, restorer_status
    FROM "users"
    WHERE "id" = NEW."restoredById";

    IF restorer_kind IS DISTINCT FROM 'HUMAN'
       OR restorer_role IS DISTINCT FROM 'ADMIN'
       OR restorer_status IS DISTINCT FROM 'ACTIVE' THEN
      RAISE EXCEPTION 'seed visibility restorer must be an active human admin';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."entryId" <> NEW."entryId" THEN
    RAISE EXCEPTION 'seed visibility target is immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "seed_entry_visibility_validate"
  BEFORE INSERT OR UPDATE ON "seed_entry_visibility"
  FOR EACH ROW EXECUTE FUNCTION validate_seed_entry_visibility();

CREATE FUNCTION protect_seed_entry_visibility_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'seed visibility history cannot be deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "seed_entry_visibility_no_delete"
  BEFORE DELETE ON "seed_entry_visibility"
  FOR EACH ROW EXECUTE FUNCTION protect_seed_entry_visibility_delete();
