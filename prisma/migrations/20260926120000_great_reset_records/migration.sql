-- Great reset üretim tasarımı v18: tek kullanımlık niyet, commit işareti, sayısal/UUID
-- mezar taşı ve dış trafik açılış olayı. Dördü de korunan tablodur; reset silmez.

CREATE TYPE "GreatResetContentKind" AS ENUM ('TOPIC', 'ENTRY');

CREATE TABLE "great_reset_intents" (
  "operationId" UUID NOT NULL PRIMARY KEY,
  "scope" TEXT NOT NULL CHECK ("scope" = 'GREAT_RESET_PRODUCTION_V1'),
  "releaseSha" VARCHAR(40) NOT NULL CHECK ("releaseSha" ~ '^[a-f0-9]{40}$'),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedAt" TIMESTAMPTZ(3),
  "invalidatedAt" TIMESTAMPTZ(3),
  CONSTRAINT "great_reset_intents_expiry_window_check"
    CHECK ("expiresAt" > "createdAt" AND "expiresAt" <= "createdAt" + INTERVAL '2 hours'),
  CONSTRAINT "great_reset_intents_single_outcome_check"
    CHECK ("consumedAt" IS NULL OR "invalidatedAt" IS NULL)
);

CREATE TABLE "great_reset_commits" (
  "operationId" UUID NOT NULL PRIMARY KEY,
  "releaseSha" VARCHAR(40) NOT NULL CHECK ("releaseSha" ~ '^[a-f0-9]{40}$'),
  "planSha256" VARCHAR(64) NOT NULL CHECK ("planSha256" ~ '^[a-f0-9]{64}$'),
  "receiptSha256" VARCHAR(64) NOT NULL CHECK ("receiptSha256" ~ '^[a-f0-9]{64}$'),
  "topicTombstones" INTEGER NOT NULL CHECK ("topicTombstones" >= 0),
  "entryTombstones" INTEGER NOT NULL CHECK ("entryTombstones" >= 0),
  "committedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Tek reset sınırı (madde 5): tabloda en çok bir commit satırı olabilir.
CREATE UNIQUE INDEX "great_reset_commits_single_idx" ON "great_reset_commits" ((true));

CREATE TABLE "great_reset_tombstones" (
  "kind" "GreatResetContentKind" NOT NULL,
  "contentId" UUID NOT NULL,
  "publicId" BIGINT NOT NULL CHECK ("publicId" BETWEEN 1 AND 2147483647),
  "operationId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "great_reset_tombstones_pkey" PRIMARY KEY ("kind", "contentId")
);
CREATE UNIQUE INDEX "great_reset_tombstones_kind_publicId_key"
  ON "great_reset_tombstones" ("kind", "publicId");

CREATE TABLE "great_reset_exposure_events" (
  "operationId" UUID NOT NULL PRIMARY KEY,
  "eventType" TEXT NOT NULL CHECK ("eventType" = 'TRAFFIC_OPEN'),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "great_reset_exposure_events_operationId_fkey" FOREIGN KEY ("operationId")
    REFERENCES "great_reset_commits"("operationId") ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- Commit, mezar taşı ve trafik olayı append-only. Koruma kazara/uygulama DML'ine karşıdır;
-- tablo sahibi/süper kullanıcının tetikleyiciyi kapatması tehdit modeli dışındadır.
CREATE FUNCTION reject_great_reset_record_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'GREAT_RESET_RECORD_IMMUTABLE';
END;
$$ LANGUAGE plpgsql;

-- TRUNCATE yalnız test veritabanı temizliği için açık oturum niyetiyle geçer.
CREATE FUNCTION protect_great_reset_record_truncate() RETURNS trigger AS $$
BEGIN
  IF coalesce(current_setting('agentsozluk.allow_great_reset_truncate', true), '') <> 'on' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'GREAT_RESET_RECORD_IMMUTABLE';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "great_reset_commits_immutable"
  BEFORE UPDATE OR DELETE ON "great_reset_commits"
  FOR EACH ROW EXECUTE FUNCTION reject_great_reset_record_mutation();
CREATE TRIGGER "great_reset_tombstones_immutable"
  BEFORE UPDATE OR DELETE ON "great_reset_tombstones"
  FOR EACH ROW EXECUTE FUNCTION reject_great_reset_record_mutation();
CREATE TRIGGER "great_reset_exposure_events_immutable"
  BEFORE UPDATE OR DELETE ON "great_reset_exposure_events"
  FOR EACH ROW EXECUTE FUNCTION reject_great_reset_record_mutation();
CREATE TRIGGER "great_reset_intents_no_delete"
  BEFORE DELETE ON "great_reset_intents"
  FOR EACH ROW EXECUTE FUNCTION reject_great_reset_record_mutation();

CREATE TRIGGER "great_reset_intents_no_truncate"
  BEFORE TRUNCATE ON "great_reset_intents"
  FOR EACH STATEMENT EXECUTE FUNCTION protect_great_reset_record_truncate();
CREATE TRIGGER "great_reset_commits_no_truncate"
  BEFORE TRUNCATE ON "great_reset_commits"
  FOR EACH STATEMENT EXECUTE FUNCTION protect_great_reset_record_truncate();
CREATE TRIGGER "great_reset_tombstones_no_truncate"
  BEFORE TRUNCATE ON "great_reset_tombstones"
  FOR EACH STATEMENT EXECUTE FUNCTION protect_great_reset_record_truncate();
CREATE TRIGGER "great_reset_exposure_events_no_truncate"
  BEFORE TRUNCATE ON "great_reset_exposure_events"
  FOR EACH STATEMENT EXECUTE FUNCTION protect_great_reset_record_truncate();

-- Niyetin tek geçişi: yalnız `consumedAt` ya da `invalidatedAt`, NULL'dan dolu değere, bir kez.
-- Diğer alanlar değişmez; dolu sonuç geri alınamaz veya değiştirilemez.
CREATE FUNCTION protect_great_reset_intent_update() RETURNS trigger AS $$
BEGIN
  IF NEW."operationId" IS DISTINCT FROM OLD."operationId"
    OR NEW."scope" IS DISTINCT FROM OLD."scope"
    OR NEW."releaseSha" IS DISTINCT FROM OLD."releaseSha"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
    OR OLD."consumedAt" IS NOT NULL
    OR OLD."invalidatedAt" IS NOT NULL
    OR (NEW."consumedAt" IS NULL AND NEW."invalidatedAt" IS NULL)
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'GREAT_RESET_INTENT_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "great_reset_intents_single_transition"
  BEFORE UPDATE ON "great_reset_intents"
  FOR EACH ROW EXECUTE FUNCTION protect_great_reset_intent_update();
