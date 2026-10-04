-- Exact paket için yalnız katalog tanımları; satır gövdesi okunmaz/yazılmaz.
WITH wanted_tables AS (
  SELECT unnest(ARRAY['agent_purposes', 'agent_assessment_packets',
    'agent_reward_assessments', 'agent_reward_reversals',
    'agent_birth_candidates', 'ukte_requests']) AS name
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
    AND (c.oid IN (SELECT oid FROM relations)
      OR (c.relname = 'agent_global_settings'
        AND a.attname IN ('rewardMode', 'birthMode', 'lastBirthScanAt', 'lastBirthCandidateAt')))
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
    OR ic.relname IN ('agent_actions_feedback_idx', 'agent_runtime_events_feedback_presented_idx',
      'audit_reward_assessment_lookup', 'audit_agent_creation_lookup'))
  UNION ALL
  SELECT 'trigger:' || c.relname || ':' || t.tgname,
    jsonb_build_object('definition', pg_get_triggerdef(t.oid), 'enabled', t.tgenabled)
  FROM pg_trigger t JOIN relations c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal
  UNION ALL
  SELECT 'function:' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
    jsonb_build_object('definition', pg_get_functiondef(p.oid))
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN ('protect_agent_birth_candidate',
    'protect_agent_birth_candidate_truncate', 'reject_immutable_history_mutation')
)
SELECT jsonb_object_agg(key, value) FROM definitions;
