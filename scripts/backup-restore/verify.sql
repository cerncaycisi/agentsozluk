-- O3: yalnız operatörün ad/OID ile belirttiği ayrı restore kopyasını okur.
-- psql -XAtq -v restore_database=... -v restore_oid=... ile yürütülür.
\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '600s';
SET LOCAL lock_timeout = '5s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SET LOCAL timezone = 'UTC';
SET LOCAL extra_float_digits = 3;
SELECT current_database() = :'restore_database'
  AND current_database() <> 'agent_sozluk'
  AND (SELECT oid::text FROM pg_database WHERE datname = current_database()) = :'restore_oid'
  AS target_ok \gset
\if :target_ok
\else
DO $$ BEGIN RAISE EXCEPTION 'O3_TARGET_MISMATCH'; END $$;
\endif
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('f', 'm')) THEN
    RAISE EXCEPTION 'O3_UNSUPPORTED_RELATION';
  END IF;
END $$;
SELECT 'RESTORE_BEGIN';
SELECT 'server_version|' || current_setting('server_version');
-- Göndericinin aynı PG16 / UTC / float ayarı ve satır metni özeti.
SELECT 'table|' || c.relname || '|' || (xpath('/row/n/text()', x))[1]::text
  || '|' || (xpath('/row/h/text()', x))[1]::text
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL query_to_xml(format(
  'SELECT count(*) AS n, coalesce(sum(hashtextextended(t::text, 0)), 0) AS h FROM %I.%I AS t',
  n.nspname, c.relname), false, true, '') AS x
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') ORDER BY c.relname;
-- Sahipsiz/çok sahipli sequence sessizce atlanmaz. nextval/setval çağrılmaz.
SELECT 'seqsafe|' || s.relname || '|bad'
FROM pg_class s JOIN pg_namespace n ON n.oid = s.relnamespace
WHERE n.nspname = 'public' AND s.relkind = 'S'
  AND (SELECT count(*) FROM pg_depend d
    JOIN pg_class t ON t.oid = d.refobjid AND t.relkind IN ('r', 'p')
    JOIN pg_namespace tn ON tn.oid = t.relnamespace AND tn.nspname = 'public'
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid AND NOT a.attisdropped
    WHERE d.classid = 'pg_class'::regclass AND d.refclassid = 'pg_class'::regclass
      AND d.objid = s.oid AND d.deptype IN ('a', 'i')) <> 1
ORDER BY s.relname;
SELECT format(
  'SELECT %L || CASE WHEN %s AND
    (CASE WHEN s.is_called THEN s.last_value::numeric + %s ELSE s.last_value::numeric END)
      > coalesce((SELECT max(%I)::numeric FROM %I.%I), %s::numeric - 1)
    AND (CASE WHEN s.is_called THEN s.last_value::numeric + %s ELSE s.last_value::numeric END)
      BETWEEN %s::numeric AND %s::numeric THEN ''ok'' ELSE ''bad'' END FROM %I.%I AS s',
  'seqsafe|' || s.relname || '|',
  CASE WHEN q.increment_by > 0 AND NOT q.cycle THEN 'TRUE' ELSE 'FALSE' END,
  q.increment_by, a.attname, tn.nspname, t.relname, q.min_value,
  q.increment_by, q.min_value, q.max_value, sn.nspname, s.relname)
FROM pg_depend d
JOIN pg_class s ON s.oid = d.objid AND s.relkind = 'S'
JOIN pg_namespace sn ON sn.oid = s.relnamespace
JOIN pg_sequences q ON q.schemaname = sn.nspname AND q.sequencename = s.relname
JOIN pg_class t ON t.oid = d.refobjid AND t.relkind IN ('r', 'p')
JOIN pg_namespace tn ON tn.oid = t.relnamespace AND tn.nspname = 'public'
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid AND NOT a.attisdropped
WHERE d.classid = 'pg_class'::regclass AND d.refclassid = 'pg_class'::regclass
  AND d.deptype IN ('a', 'i') AND sn.nspname = 'public'
ORDER BY s.relname \gexec
COMMIT;
SELECT 'RESTORE_DONE';
