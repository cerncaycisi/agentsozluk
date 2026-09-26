-- Great reset üretim tasarımı v18, madde 3: public ID namespace'i BIGINT'e taşınır.
-- Reset öncesinde yeni üst aralık (>= 2147483648) veritabanı düzeyinde kapalı kalır:
-- sequence üst sınırı ve doğrulanmış CHECK kısıtı ikisi birlikte korur. Üst aralığı
-- yalnız great reset transaction'ı, tablolar boşaldıktan sonra açar.

-- Kolona bağlı `BEFORE UPDATE OF "publicId"` tetikleyicileri tip değişimini engeller.
DROP TRIGGER "topics_public_id_immutable" ON "topics";
DROP TRIGGER "entries_public_id_immutable" ON "entries";

ALTER TABLE "topics" ALTER COLUMN "publicId" TYPE BIGINT;
ALTER TABLE "entries" ALTER COLUMN "publicId" TYPE BIGINT;

-- `AS bigint` tek başına varsayılan üst sınırı büyütebilir; MAXVALUE aynı ifadede açık.
ALTER SEQUENCE "topics_public_id_seq" AS BIGINT MAXVALUE 2147483647 NO CYCLE CACHE 1;
ALTER SEQUENCE "entries_public_id_seq" AS BIGINT MAXVALUE 2147483647 NO CYCLE CACHE 1;

ALTER TABLE "topics"
  ADD CONSTRAINT "topics_public_id_legacy_range_check" CHECK ("publicId" <= 2147483647);
ALTER TABLE "entries"
  ADD CONSTRAINT "entries_public_id_legacy_range_check" CHECK ("publicId" <= 2147483647);

CREATE TRIGGER "topics_public_id_immutable"
BEFORE UPDATE OF "publicId" ON "topics"
FOR EACH ROW EXECUTE FUNCTION prevent_public_id_update();

CREATE TRIGGER "entries_public_id_immutable"
BEFORE UPDATE OF "publicId" ON "entries"
FOR EACH ROW EXECUTE FUNCTION prevent_public_id_update();
