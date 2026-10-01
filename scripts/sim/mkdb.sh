#!/usr/bin/env bash
set -euo pipefail
export LD_LIBRARY_PATH=/home/agent/pg16/root/usr/lib/x86_64-linux-gnu; B=/home/agent/pg16/root/usr/lib/postgresql/16/bin
d="$1"
$B/psql -h 127.0.0.1 -U agent -XAtq -d postgres -c "DROP DATABASE IF EXISTS $d" -c "CREATE DATABASE $d TEMPLATE sim_tpl OWNER agent_sozluk"
P="$B/psql -h 127.0.0.1 -U agent -Xq -v ON_ERROR_STOP=1 -d $d"
H=$($P -At -c "select floor(extract(epoch from (now() - max(\"createdAt\")))/3600) from entries")
$P <<SQL
SET session_replication_role = replica;
BEGIN;
DO \$\$
DECLARE r record;
BEGIN
  FOR r IN SELECT table_name, string_agg(format('%I = %I + %s', column_name, column_name,
             CASE WHEN data_type = 'date' THEN 'interval ''100000 days''' ELSE 'interval ''$H hours''' END), ', ') AS s
    FROM information_schema.columns WHERE table_schema='public' AND table_name <> '_prisma_migrations'
      AND (data_type LIKE 'timestamp%' OR data_type='date') AND table_name <> 'agent_runtime_capabilities' GROUP BY table_name
  LOOP EXECUTE format('UPDATE %I SET %s', r.table_name, r.s); END LOOP;
  FOR r IN SELECT table_name, string_agg(format('%I = %I - interval ''99999 days''', column_name, column_name), ', ') AS s
    FROM information_schema.columns WHERE table_schema='public' AND data_type='date' GROUP BY table_name
  LOOP EXECUTE format('UPDATE %I SET %s', r.table_name, r.s); END LOOP;
END \$\$;
COMMIT;
SQL
$P -c "update agent_runtime_capabilities set \"codexVersion\"='codex-cli 0.156.0', \"promptProfileHash\"='5b806b38d9e85a39e92d083eff4ab91200029b1c5b8026f11b4a162f715d3e27', \"staleAt\"=now()+interval '2 days' where id='b510d9f0-6298-4e84-bf32-501d1b59bff7'"
$P -c "update agent_runs set \"runStatus\"='CANCELLED', \"leaseOwner\"=null, \"leaseToken\"=null, \"leaseExpiresAt\"=null, \"finishedAt\"=now() where \"runStatus\" in ('QUEUED','RUNNING')"
echo "$d hazır (kaydırma ${H}s)"
