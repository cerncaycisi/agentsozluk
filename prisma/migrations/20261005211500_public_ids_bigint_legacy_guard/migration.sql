-- Üretim reseti öncesi geniş public ID desteği. Namespace bu migration ile açılmaz.
-- Eski aralık hem sequence hem açık INSERT için korunur; reset ayrı işlemdir.
BEGIN;
ALTER TABLE "public"."topics" ALTER COLUMN "publicId" TYPE BIGINT;
ALTER TABLE "public"."entries" ALTER COLUMN "publicId" TYPE BIGINT;
ALTER SEQUENCE "public"."topics_public_id_seq" AS BIGINT MAXVALUE 2147483647;
ALTER SEQUENCE "public"."entries_public_id_seq" AS BIGINT MAXVALUE 2147483647;
ALTER TABLE "public"."topics" ADD CONSTRAINT "topics_public_id_legacy_range"
  CHECK ("publicId" BETWEEN 1 AND 2147483647);
ALTER TABLE "public"."entries" ADD CONSTRAINT "entries_public_id_legacy_range"
  CHECK ("publicId" BETWEEN 1 AND 2147483647);
COMMIT;
