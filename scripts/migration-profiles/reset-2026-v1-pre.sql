-- Yalnız exact reset paketinin mevcut iki ID alanı; içerik/credential çıkmaz.
WITH wanted AS (SELECT unnest(ARRAY['entries','topics']) AS name), columns AS (
 SELECT c.relname AS "table", format_type(a.atttypid,a.atttypmod) AS type,
   a.attnotnull AS "notNull", pg_get_expr(ad.adbin,ad.adrelid) AS "default",
   pg_get_userbyid(c.relowner)=current_user AS "ownerMatches",
   (SELECT count(*) FROM pg_constraint x WHERE x.conrelid=c.oid AND x.conname=c.relname||'_public_id_legacy_range') AS "legacyRangeCount",
   CASE c.relname WHEN 'entries' THEN (SELECT count(*) FROM public.entries WHERE "publicId" NOT BETWEEN 1 AND 2147483647)
    ELSE (SELECT count(*) FROM public.topics WHERE "publicId" NOT BETWEEN 1 AND 2147483647) END AS "invalidRows"
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='publicId' AND NOT a.attisdropped
 LEFT JOIN pg_attrdef ad ON ad.adrelid=c.oid AND ad.adnum=a.attnum
 WHERE n.nspname='public' AND c.relkind='r' AND c.relname IN(SELECT name FROM wanted)
), sequences AS (
 SELECT q.sequencename AS name,q.data_type::text AS type,q.start_value::text AS start,
   q.min_value::text AS min,q.max_value::text AS max,q.increment_by::text AS increment,
   q.cycle,q.cache_size::text AS cache,c.relpersistence AS persistence,
   pg_get_userbyid(c.relowner)=current_user AS "ownerMatches",
   t.relname AS "ownedByTable",a.attname AS "ownedByColumn",d.deptype AS dependency
 FROM pg_sequences q JOIN pg_class c ON c.relname=q.sequencename AND c.relnamespace='public'::regnamespace
 JOIN pg_depend d ON d.objid=c.oid AND d.classid='pg_class'::regclass AND d.deptype IN('a','i')
 JOIN pg_class t ON t.oid=d.refobjid AND t.relnamespace='public'::regnamespace
 JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid
 WHERE q.schemaname='public' AND q.sequencename IN('entries_public_id_seq','topics_public_id_seq')
)
SELECT jsonb_build_object('columns',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x."table") FROM columns x),
 'sequences',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.name) FROM sequences x),
 'journalsPresent',(SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN('great_reset_intents','great_reset_commits','great_reset_tombstones','great_reset_exposure_events')),
 'journalFunctionsPresent',(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('protect_great_reset_intent','reject_great_reset_journal_mutation','protect_great_reset_journal_insert','require_great_reset_commit_at_transaction_end')));
