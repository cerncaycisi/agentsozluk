-- Reset kanıtları korunan ayrı nesnelerdir. Bu migration veri silmez veya namespace açmaz.
BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '300s';
CREATE TABLE public.great_reset_intents (
  "operationId" UUID PRIMARY KEY,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "releaseSha" VARCHAR(40) NOT NULL CHECK ("releaseSha" ~ '^[a-f0-9]{40}$'),
  scope VARCHAR(80) NOT NULL CHECK (scope = 'ALL_DICTIONARY_AND_AGENT_STATE_KEEP_IDENTITIES_V1'),
  "sourceDatabaseOid" BIGINT NOT NULL CHECK ("sourceDatabaseOid" > 0),
  "sourceClusterId" VARCHAR(20) NOT NULL CHECK ("sourceClusterId" ~ '^[0-9]{1,20}$'),
  "consumedAt" TIMESTAMPTZ(3),
  "invalidatedAt" TIMESTAMPTZ(3),
  CONSTRAINT great_reset_intents_expiry CHECK (
    "expiresAt" > "createdAt" AND "expiresAt" <= "createdAt" + INTERVAL '2 hours'
  ),
  CONSTRAINT great_reset_intents_terminal_state CHECK (
    NOT ("consumedAt" IS NOT NULL AND "invalidatedAt" IS NOT NULL)
    AND ("consumedAt" IS NULL OR ("consumedAt" >= "createdAt" AND "consumedAt" < "expiresAt"))
    AND ("invalidatedAt" IS NULL OR "invalidatedAt" >= "createdAt")
  )
);
CREATE UNIQUE INDEX great_reset_intents_one_open
  ON public.great_reset_intents ((true))
  WHERE "consumedAt" IS NULL AND "invalidatedAt" IS NULL;

CREATE TABLE public.great_reset_commits (
  "operationId" UUID PRIMARY KEY REFERENCES public.great_reset_intents("operationId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  singleton BOOLEAN NOT NULL DEFAULT true CHECK (singleton),
  "committedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "formatVersion" INTEGER NOT NULL DEFAULT 1 CHECK ("formatVersion" = 1),
  "releaseSha" VARCHAR(40) NOT NULL CHECK ("releaseSha" ~ '^[a-f0-9]{40}$'),
  "manifestSha256" VARCHAR(64) NOT NULL CHECK ("manifestSha256" ~ '^[a-f0-9]{64}$'),
  "planSha256" VARCHAR(64) NOT NULL CHECK ("planSha256" ~ '^[a-f0-9]{64}$'),
  "protectedSha256" VARCHAR(64) NOT NULL CHECK ("protectedSha256" ~ '^[a-f0-9]{64}$'),
  "clearedCounts" JSONB NOT NULL CHECK (jsonb_typeof("clearedCounts") = 'object')
);
CREATE UNIQUE INDEX great_reset_commits_singleton_key ON public.great_reset_commits(singleton);

CREATE TABLE public.great_reset_tombstones (
  kind VARCHAR(5) NOT NULL CHECK (kind IN ('TOPIC','ENTRY')),
  uuid UUID NOT NULL,
  "publicId" BIGINT NOT NULL CHECK ("publicId" BETWEEN 1 AND 2147483647),
  "operationId" UUID NOT NULL REFERENCES public.great_reset_intents("operationId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  PRIMARY KEY (kind, uuid)
);
CREATE UNIQUE INDEX great_reset_tombstones_kind_publicId_key ON public.great_reset_tombstones(kind,"publicId");

CREATE TABLE public.great_reset_exposure_events (
  "operationId" UUID PRIMARY KEY REFERENCES public.great_reset_commits("operationId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "journalSha256" VARCHAR(64) NOT NULL CHECK ("journalSha256" ~ '^[a-f0-9]{64}$')
);

CREATE FUNCTION public.protect_great_reset_intent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'GREAT_RESET_JOURNAL_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  IF coalesce(current_setting('agentsozluk.reset_operation', true), '') <> NEW."operationId"::text THEN
    RAISE EXCEPTION 'GREAT_RESET_OPERATION_REQUIRED' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'INSERT' THEN
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
  RETURN NEW;
END;
$$;
CREATE TRIGGER great_reset_intents_state_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.great_reset_intents
  FOR EACH ROW EXECUTE FUNCTION public.protect_great_reset_intent();

CREATE FUNCTION public.reject_great_reset_journal_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'GREAT_RESET_JOURNAL_IMMUTABLE' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER great_reset_intents_no_truncate BEFORE TRUNCATE ON public.great_reset_intents
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_great_reset_journal_mutation();
CREATE TRIGGER great_reset_commits_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.great_reset_commits
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_great_reset_journal_mutation();
CREATE TRIGGER great_reset_tombstones_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.great_reset_tombstones
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_great_reset_journal_mutation();
CREATE TRIGGER great_reset_exposure_events_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.great_reset_exposure_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_great_reset_journal_mutation();

-- GUC kazara app yazılarını sınırlar; sahibi/root/kararlı SQL operatörüne karşı yetki izolasyonu değildir.
CREATE FUNCTION public.protect_great_reset_journal_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE intent public.great_reset_intents%ROWTYPE;
BEGIN
  IF coalesce(current_setting('agentsozluk.reset_operation', true), '') <> NEW."operationId"::text THEN
    RAISE EXCEPTION 'GREAT_RESET_OPERATION_REQUIRED' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO intent FROM public.great_reset_intents WHERE "operationId" = NEW."operationId" FOR SHARE;
  IF NOT FOUND OR intent."consumedAt" IS NULL OR intent."invalidatedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'GREAT_RESET_INTENT_NOT_CONSUMED' USING ERRCODE = '55000';
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
CREATE TRIGGER great_reset_commits_insert_guard BEFORE INSERT ON public.great_reset_commits
  FOR EACH ROW EXECUTE FUNCTION public.protect_great_reset_journal_insert();
CREATE TRIGGER great_reset_tombstones_insert_guard BEFORE INSERT ON public.great_reset_tombstones
  FOR EACH ROW EXECUTE FUNCTION public.protect_great_reset_journal_insert();
CREATE TRIGGER great_reset_exposure_events_insert_guard BEFORE INSERT ON public.great_reset_exposure_events
  FOR EACH ROW EXECUTE FUNCTION public.protect_great_reset_journal_insert();
COMMIT;
