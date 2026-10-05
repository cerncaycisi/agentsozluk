-- Kalıcı commit/exposure kronolojisi DB saatidir; geçmiş migrationlar değişmez.
BEGIN;
SET LOCAL lock_timeout='1s'; SET LOCAL statement_timeout='300s';
LOCK TABLE ONLY public.great_reset_intents, ONLY public.great_reset_commits,
  ONLY public.great_reset_tombstones, ONLY public.great_reset_exposure_events IN ACCESS EXCLUSIVE MODE NOWAIT;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.great_reset_intents WHERE "createdAt">clock_timestamp())
    OR EXISTS (SELECT 1 FROM public.great_reset_intents i WHERE "consumedAt" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.great_reset_commits c WHERE c."operationId"=i."operationId"))
    OR EXISTS (SELECT 1 FROM public.great_reset_tombstones t
      WHERE NOT EXISTS (SELECT 1 FROM public.great_reset_commits c WHERE c."operationId"=t."operationId")) THEN
    RAISE EXCEPTION 'GREAT_RESET_LEGACY_JOURNAL_UNSAFE' USING ERRCODE='55000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.great_reset_intents'::regclass
    AND tgname='great_reset_intents_require_atomic_commit' AND tgenabled='O' AND tgdeferrable AND tginitdeferred
    AND tgfoid='public.require_great_reset_commit_at_transaction_end()'::regprocedure) THEN
    RAISE EXCEPTION 'GREAT_RESET_ATOMIC_GUARD_REQUIRED' USING ERRCODE='55000';
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.protect_great_reset_journal_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE intent public.great_reset_intents%ROWTYPE; commit_time timestamptz;
BEGIN
  IF coalesce(current_setting('agentsozluk.reset_operation', true), '') <> NEW."operationId"::text THEN
    RAISE EXCEPTION 'GREAT_RESET_OPERATION_REQUIRED' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO intent FROM public.great_reset_intents WHERE "operationId" = NEW."operationId" FOR UPDATE;
  IF NOT FOUND OR intent."consumedAt" IS NULL OR intent."invalidatedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'GREAT_RESET_INTENT_NOT_CONSUMED' USING ERRCODE = '55000';
  END IF;
  IF TG_TABLE_NAME = 'great_reset_tombstones' AND intent."expiresAt" <= clock_timestamp() THEN
    RAISE EXCEPTION 'GREAT_RESET_INTENT_INVALID' USING ERRCODE = '55000';
  END IF;
  IF TG_TABLE_NAME = 'great_reset_tombstones' AND EXISTS (SELECT 1 FROM public.great_reset_commits) THEN
    RAISE EXCEPTION 'GREAT_RESET_TOMBSTONES_SEALED' USING ERRCODE = '55000';
  END IF;
  IF TG_TABLE_NAME = 'great_reset_commits' THEN
    NEW."committedAt" := clock_timestamp();
    IF NEW."committedAt" < intent."consumedAt" THEN
      RAISE EXCEPTION 'GREAT_RESET_CLOCK_UNSAFE' USING ERRCODE='55000';
    END IF;
    IF intent."releaseSha" <> NEW."releaseSha" OR intent."expiresAt" <= clock_timestamp() THEN
      RAISE EXCEPTION 'GREAT_RESET_INTENT_INVALID' USING ERRCODE = '55000';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'great_reset_exposure_events' THEN
    NEW."occurredAt" := clock_timestamp();
    SELECT "committedAt" INTO commit_time FROM public.great_reset_commits WHERE "operationId"=NEW."operationId";
    IF commit_time IS NULL OR NEW."occurredAt" < commit_time THEN
      RAISE EXCEPTION 'GREAT_RESET_CLOCK_UNSAFE' USING ERRCODE='55000';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
-- Tüketim aynı transaction'da commit ister; sonraki transaction mühürlü kümeye yazamaz.
-- Bu nedenle her tombstone için tekrarlanan deferred EXISTS kuyruğu gereksizdir.
DROP TRIGGER great_reset_tombstones_require_atomic_commit ON public.great_reset_tombstones;
COMMIT;
