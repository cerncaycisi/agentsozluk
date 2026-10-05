-- İlk journal migration değişmez; tüketim ve tombstone yalnız aynı commit ile kalıcılaşır.
BEGIN;
SET LOCAL lock_timeout='1s';
SET LOCAL statement_timeout='300s';
LOCK TABLE ONLY public.great_reset_intents, ONLY public.great_reset_commits,
  ONLY public.great_reset_tombstones, ONLY public.great_reset_exposure_events IN ACCESS EXCLUSIVE MODE NOWAIT;
CREATE OR REPLACE FUNCTION public.protect_great_reset_intent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'GREAT_RESET_JOURNAL_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  IF coalesce(current_setting('agentsozluk.reset_operation', true), '') <> NEW."operationId"::text THEN
    RAISE EXCEPTION 'GREAT_RESET_OPERATION_REQUIRED' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW."createdAt" := clock_timestamp();
    IF NEW."consumedAt" IS NOT NULL OR NEW."invalidatedAt" IS NOT NULL
      OR NEW."expiresAt" <= clock_timestamp() THEN
      RAISE EXCEPTION 'GREAT_RESET_INTENT_INVALID' USING ERRCODE = '55000';
    END IF;
  ELSE
    IF (to_jsonb(OLD) - ARRAY['consumedAt','invalidatedAt']) IS DISTINCT FROM
       (to_jsonb(NEW) - ARRAY['consumedAt','invalidatedAt'])
       OR OLD."consumedAt" IS NOT NULL OR OLD."invalidatedAt" IS NOT NULL
       OR (NEW."consumedAt" IS NULL AND NEW."invalidatedAt" IS NULL)
       OR (NEW."consumedAt" IS NOT NULL AND NEW."expiresAt" <= clock_timestamp()) THEN
      RAISE EXCEPTION 'GREAT_RESET_INTENT_TRANSITION_INVALID' USING ERRCODE = '55000';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW."consumedAt" IS NOT NULL THEN NEW."consumedAt" := clock_timestamp(); END IF;
    IF NEW."invalidatedAt" IS NOT NULL THEN NEW."invalidatedAt" := clock_timestamp(); END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.protect_great_reset_journal_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE intent public.great_reset_intents%ROWTYPE;
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
    IF intent."releaseSha" <> NEW."releaseSha" OR intent."expiresAt" <= clock_timestamp() THEN
      RAISE EXCEPTION 'GREAT_RESET_INTENT_INVALID' USING ERRCODE = '55000';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE FUNCTION public.require_great_reset_commit_at_transaction_end() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'great_reset_intents' THEN
    IF NEW."consumedAt" IS NULL THEN RETURN NULL; END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.great_reset_commits WHERE "operationId"=NEW."operationId") THEN
    RAISE EXCEPTION 'GREAT_RESET_ATOMIC_COMMIT_REQUIRED' USING ERRCODE='55000';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER great_reset_intents_require_atomic_commit
  AFTER UPDATE ON public.great_reset_intents DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.require_great_reset_commit_at_transaction_end();
CREATE CONSTRAINT TRIGGER great_reset_tombstones_require_atomic_commit
  AFTER INSERT ON public.great_reset_tombstones DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.require_great_reset_commit_at_transaction_end();
COMMIT;
