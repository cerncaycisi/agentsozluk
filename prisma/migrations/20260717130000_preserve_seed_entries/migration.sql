CREATE OR REPLACE FUNCTION protect_canonical_seed_entries()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' AND OLD."origin" = 'SEED' THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'Canonical SEED entries are immutable.';
    END IF;

    IF TG_OP = 'UPDATE' AND OLD."origin" = 'SEED' AND (
        NEW."id" IS DISTINCT FROM OLD."id"
        OR NEW."topicId" IS DISTINCT FROM OLD."topicId"
        OR NEW."authorId" IS DISTINCT FROM OLD."authorId"
        OR NEW."body" IS DISTINCT FROM OLD."body"
        OR NEW."normalizedBody" IS DISTINCT FROM OLD."normalizedBody"
        OR NEW."origin" IS DISTINCT FROM OLD."origin"
        OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
        OR NEW."status" IS DISTINCT FROM 'ACTIVE'
        OR NEW."deletedAt" IS NOT NULL
        OR NEW."hiddenAt" IS NOT NULL
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'Canonical SEED entries are immutable.';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "entries_protect_canonical_seed"
BEFORE UPDATE OR DELETE ON "entries"
FOR EACH ROW
EXECUTE FUNCTION protect_canonical_seed_entries();
