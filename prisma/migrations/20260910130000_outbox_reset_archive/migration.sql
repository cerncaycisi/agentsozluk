-- Eski olaylar yerinde ve işlenmemiş kalır; yalnız küme üyeliği eklenir.
CREATE TABLE "outbox_reset_archives" (
  "id" UUID NOT NULL PRIMARY KEY,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "formatVersion" INTEGER NOT NULL DEFAULT 1 CHECK ("formatVersion" = 1),
  "planSha256" VARCHAR(64) NOT NULL CHECK ("planSha256" ~ '^[a-f0-9]{64}$'),
  "eventCount" INTEGER NOT NULL CHECK ("eventCount" > 0),
  "eventsSha256" VARCHAR(64) NOT NULL CHECK ("eventsSha256" ~ '^[a-f0-9]{64}$')
);
CREATE TABLE "outbox_reset_archive_events" (
  "eventId" UUID NOT NULL PRIMARY KEY,
  "archiveId" UUID NOT NULL,
  CONSTRAINT "outbox_reset_archive_events_eventId_fkey" FOREIGN KEY ("eventId")
    REFERENCES "outbox_events"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "outbox_reset_archive_events_archiveId_fkey" FOREIGN KEY ("archiveId")
    REFERENCES "outbox_reset_archives"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "outbox_reset_archive_events_archiveId_idx"
  ON "outbox_reset_archive_events"("archiveId");

CREATE FUNCTION reject_outbox_reset_archive_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'OUTBOX_RESET_ARCHIVE_IMMUTABLE';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "outbox_reset_archives_immutable"
  BEFORE UPDATE OR DELETE ON "outbox_reset_archives"
  FOR EACH ROW EXECUTE FUNCTION reject_outbox_reset_archive_mutation();
CREATE TRIGGER "outbox_reset_archive_events_immutable"
  BEFORE UPDATE OR DELETE ON "outbox_reset_archive_events"
  FOR EACH ROW EXECUTE FUNCTION reject_outbox_reset_archive_mutation();

-- Manifest sayısı sabitken üyelik kümesi büyüyebiliyordu: normal INSERT yetkisiyle
-- yeni bir olay tamamlanmış arşive bağlanıp aday sorgusundan sessizce düşüyordu.
-- Üyelik yalnız arşiv başlığını yazan transaction içinde eklenebilir.
-- Niyet kapısı GUC ile: satır görünürlüğüne bakan her kontrol, arşivden ÖNCE snapshot
-- almış bir oturumda sessizce açılıyordu; GUC snapshot'a bağlı değildir.
-- Kapı boolean değil HEDEF archiveId taşır ve yalnız üyelik INSERT'i boyunca açıktır:
-- aynı transaction'da sonradan başka bir arşive yazmak da reddedilir.
-- SINIRLAR: (1) GUC'yi herhangi bir oturum ayarlayabilir, yani bu kazara/yarışan yazıcıya
-- karşıdır, kararlı SQL operatörüne karşı değil. (2) SET LOCAL savepoint'ten BAĞIMSIZ
-- DEĞİLDİR; ayardan önceki bir savepoint'e rollback kapıyı geri alır (meşru yol düşer,
-- açık kalmaz).
CREATE FUNCTION protect_sealed_outbox_reset_archive() RETURNS trigger AS $$
BEGIN
  IF coalesce(current_setting('agentsozluk.archiving', true), '') <> NEW."archiveId"::text THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'OUTBOX_RESET_ARCHIVE_SEALED';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "outbox_reset_archive_events_sealed"
  BEFORE INSERT ON "outbox_reset_archive_events"
  FOR EACH ROW EXECUTE FUNCTION protect_sealed_outbox_reset_archive();

CREATE FUNCTION protect_archived_outbox_event() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.outbox_reset_archive_events WHERE "eventId" = OLD.id) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'OUTBOX_RESET_ARCHIVED_EVENT_IMMUTABLE';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "outbox_archived_event_immutable"
  BEFORE UPDATE OR DELETE ON "outbox_events"
  FOR EACH ROW EXECUTE FUNCTION protect_archived_outbox_event();

-- Eskiden "tablolar boşsa serbest" idi; eski snapshot'lı oturum dolu arşivi de boş görüp
-- TRUNCATE edebiliyordu (başlık kalır, üyelikler silinir, olaylar yeniden aday olur).
-- Artık açık niyet gerekir; test temizliği bunu bilerek ayarlar.
CREATE FUNCTION protect_outbox_reset_archive_truncate() RETURNS trigger AS $$
BEGIN
  IF coalesce(current_setting('agentsozluk.allow_archive_truncate', true), '') <> 'on' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'OUTBOX_RESET_ARCHIVE_IMMUTABLE';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "outbox_reset_archives_no_truncate"
  BEFORE TRUNCATE ON "outbox_reset_archives"
  FOR EACH STATEMENT EXECUTE FUNCTION protect_outbox_reset_archive_truncate();
CREATE TRIGGER "outbox_reset_archive_events_no_truncate"
  BEFORE TRUNCATE ON "outbox_reset_archive_events"
  FOR EACH STATEMENT EXECUTE FUNCTION protect_outbox_reset_archive_truncate();
