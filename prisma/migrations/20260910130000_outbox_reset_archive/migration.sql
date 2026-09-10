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

-- Boş test şemasının normal temizliği serbest; dolu arşiv CASCADE ile de kaybolamaz.
CREATE FUNCTION protect_outbox_reset_archive_truncate() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.outbox_reset_archives)
     OR EXISTS (SELECT 1 FROM public.outbox_reset_archive_events) THEN
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
