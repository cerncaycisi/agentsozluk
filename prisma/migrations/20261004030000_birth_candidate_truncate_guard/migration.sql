-- İlk migration yerel DB’de uygulanmıştır; değişmez geçmişi yeniden yazma.
-- Yalnız tam test temizliği mevcut açık-niyet bayrağını transaction-local verir.
CREATE FUNCTION protect_agent_birth_candidate_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('agentsozluk.allow_archive_truncate', true), '') <> 'on' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'AGENT_BIRTH_CANDIDATE_IMMUTABLE';
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER "agent_birth_candidates_no_truncate"
  BEFORE TRUNCATE ON "agent_birth_candidates"
  FOR EACH STATEMENT EXECUTE FUNCTION protect_agent_birth_candidate_truncate();
