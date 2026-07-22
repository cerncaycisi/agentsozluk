-- Stable public identifiers are independent from internal UUID primary keys.
CREATE SEQUENCE "topics_public_id_seq" AS INTEGER;
CREATE SEQUENCE "entries_public_id_seq" AS INTEGER;

ALTER TABLE "topics" ADD COLUMN "publicId" INTEGER;
ALTER TABLE "entries" ADD COLUMN "publicId" INTEGER;

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY "createdAt" ASC, id ASC)::integer AS "publicId"
  FROM "topics"
)
UPDATE "topics" AS topic
SET "publicId" = ranked."publicId"
FROM ranked
WHERE topic.id = ranked.id;

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY "createdAt" ASC, id ASC)::integer AS "publicId"
  FROM "entries"
)
UPDATE "entries" AS entry
SET "publicId" = ranked."publicId"
FROM ranked
WHERE entry.id = ranked.id;

SELECT setval(
  'topics_public_id_seq',
  GREATEST(COALESCE((SELECT MAX("publicId") FROM "topics"), 0), 1),
  EXISTS (SELECT 1 FROM "topics")
);
SELECT setval(
  'entries_public_id_seq',
  GREATEST(COALESCE((SELECT MAX("publicId") FROM "entries"), 0), 1),
  EXISTS (SELECT 1 FROM "entries")
);

ALTER TABLE "topics"
  ALTER COLUMN "publicId" SET DEFAULT nextval('topics_public_id_seq'),
  ALTER COLUMN "publicId" SET NOT NULL;
ALTER TABLE "entries"
  ALTER COLUMN "publicId" SET DEFAULT nextval('entries_public_id_seq'),
  ALTER COLUMN "publicId" SET NOT NULL;

ALTER SEQUENCE "topics_public_id_seq" OWNED BY "topics"."publicId";
ALTER SEQUENCE "entries_public_id_seq" OWNED BY "entries"."publicId";

CREATE UNIQUE INDEX "topics_publicId_key" ON "topics"("publicId");
CREATE UNIQUE INDEX "entries_publicId_key" ON "entries"("publicId");

CREATE FUNCTION prevent_public_id_update() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."publicId" IS DISTINCT FROM OLD."publicId" THEN
    RAISE EXCEPTION 'publicId is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "topics_public_id_immutable"
BEFORE UPDATE OF "publicId" ON "topics"
FOR EACH ROW EXECUTE FUNCTION prevent_public_id_update();

CREATE TRIGGER "entries_public_id_immutable"
BEFORE UPDATE OF "publicId" ON "entries"
FOR EACH ROW EXECUTE FUNCTION prevent_public_id_update();
