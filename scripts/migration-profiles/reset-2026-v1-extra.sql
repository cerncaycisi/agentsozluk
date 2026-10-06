-- Exact paket için yalnız katalog tanımları; satır gövdesi okunmaz/yazılmaz.
WITH wanted_tables AS (
  SELECT unnest(ARRAY['great_reset_intents', 'great_reset_commits',
    'great_reset_tombstones', 'great_reset_exposure_events', 'entries', 'topics']) AS name
), relations AS (
  SELECT c.oid, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname IN (SELECT name FROM wanted_tables)
), definitions AS (
  SELECT 'column:' || c.relname || ':' || a.attname AS key,
    jsonb_build_object('type', format_type(a.atttypid, a.atttypmod),
      'notNull', a.attnotnull, 'default', pg_get_expr(ad.adbin, ad.adrelid),
      'identity', a.attidentity, 'generated', a.attgenerated) AS value
  FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
  WHERE n.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped
    AND c.oid IN (SELECT oid FROM relations)
  UNION ALL
  SELECT 'constraint:' || c.relname || ':' || con.conname,
    jsonb_build_object('definition', pg_get_constraintdef(con.oid), 'validated', con.convalidated)
  FROM pg_constraint con JOIN relations c ON c.oid = con.conrelid
  UNION ALL
  SELECT 'index:' || ic.relname,
    jsonb_build_object('definition', pg_get_indexdef(i.indexrelid),
      'valid', i.indisvalid, 'ready', i.indisready, 'live', i.indislive)
  FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid
  JOIN pg_namespace n ON n.oid = ic.relnamespace
  WHERE n.nspname = 'public' AND (i.indrelid IN (SELECT oid FROM relations)
)
  UNION ALL
  SELECT 'trigger:' || c.relname || ':' || t.tgname,
    jsonb_build_object('definition', pg_get_triggerdef(t.oid), 'enabled', t.tgenabled)
  FROM pg_trigger t JOIN relations c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal
  UNION ALL
  SELECT 'function:' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
    jsonb_build_object('definition', pg_get_functiondef(p.oid))
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN ('protect_great_reset_intent', 'reject_great_reset_journal_mutation',
    'protect_great_reset_journal_insert', 'require_great_reset_commit_at_transaction_end')
  UNION ALL
  SELECT 'sequence:' || q.sequencename,
    jsonb_build_object('dataType',q.data_type::text,'start',q.start_value::text,
      'min',q.min_value::text,'max',q.max_value::text,'increment',q.increment_by::text,
      'cycle',q.cycle,'cache',q.cache_size::text,'persistence',c.relpersistence,
      'ownedBy', (SELECT jsonb_build_array(t.relname,a.attname,d.deptype)
        FROM pg_depend d JOIN pg_class t ON t.oid=d.refobjid
        JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid
        WHERE d.objid=c.oid AND d.classid='pg_class'::regclass AND d.deptype IN ('a','i')))
  FROM pg_sequences q JOIN pg_class c ON c.relname=q.sequencename AND c.relnamespace='public'::regnamespace
  WHERE q.schemaname='public' AND q.sequencename IN ('topics_public_id_seq','entries_public_id_seq')
)
SELECT jsonb_object_agg(key, value) FROM definitions;
