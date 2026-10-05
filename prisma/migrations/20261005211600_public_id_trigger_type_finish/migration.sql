-- publicId değişmezlik kontrolü tüm adımlarda korunur; geçmiş migration değiştirilmez.
BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '300s';
LOCK TABLE ONLY public.topics, public.entries IN ACCESS EXCLUSIVE MODE NOWAIT;

DO $public_id_guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'public.prevent_public_id_update()'::regprocedure
      AND prosrc = $expected_body$
BEGIN
  IF NEW."publicId" IS DISTINCT FROM OLD."publicId" THEN
    RAISE EXCEPTION 'publicId is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$expected_body$
      AND NOT prosecdef
  ) THEN
    RAISE EXCEPTION 'PUBLIC_ID_IMMUTABLE_FUNCTION_CHANGED';
  END IF;
  IF (
    SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relname IN ('topics', 'entries')
      AND t.tgname = c.relname || '_public_id_immutable'
      AND t.tgenabled = 'O' AND t.tgtype = 19 AND NOT t.tgisinternal
      AND t.tgfoid = 'public.prevent_public_id_update()'::regprocedure
      AND t.tgnargs = 0 AND t.tgqual IS NULL
      AND t.tgattr::text = ''
  ) <> 2 THEN
    RAISE EXCEPTION 'PUBLIC_ID_IMMUTABLE_TRIGGER_CHANGED';
  END IF;
END;
$public_id_guard$;

CREATE OR REPLACE TRIGGER topics_public_id_immutable
BEFORE UPDATE OF "publicId" ON public.topics
FOR EACH ROW EXECUTE FUNCTION public.prevent_public_id_update();

CREATE OR REPLACE TRIGGER entries_public_id_immutable
BEFORE UPDATE OF "publicId" ON public.entries
FOR EACH ROW EXECUTE FUNCTION public.prevent_public_id_update();
COMMIT;
