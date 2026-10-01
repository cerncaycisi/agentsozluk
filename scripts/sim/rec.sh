#!/bin/bash
# kullanım: rec.sh <db>
export LD_LIBRARY_PATH=/home/agent/pg16/root/usr/lib/x86_64-linux-gnu
P="/home/agent/pg16/root/usr/lib/postgresql/16/bin/psql -h 127.0.0.1 -U agent -XAtq -d $1"
$P -c "update agent_global_settings set \"runtimeEnabled\"=false"
ADMIN=$($P -c "select id from users where kind='HUMAN' and role='ADMIN' and status='ACTIVE' and username='bootstrap_admin'")
cd /tmp/wt-src && DATABASE_URL="postgresql://agent@127.0.0.1:5432/$1" AGENT_OPERATOR_ADMIN_ID="$ADMIN" AGENT_SOURCE_RECONCILE_CONFIRMATION=RECONCILE_VERIFIED_PERSONA_SOURCES timeout 900 node --env-file=/tmp/wt-lab/.env --import tsx scripts/reconcile-persona-sources.ts 2>&1 | tail -n 3
$P -c "select 'maxholders', max(n) from (select s.url, count(distinct s.\"agentProfileId\") n from agent_sources s join agent_profiles p on p.id=s.\"agentProfileId\" where p.\"lifecycleStatus\"='ACTIVE' and not s.\"adminBlocked\" and s.status not in ('REJECTED','BLOCKED') group by 1) x"
$P -c "select url, count(distinct s.\"agentProfileId\") n from agent_sources s join agent_profiles p on p.id=s.\"agentProfileId\" where p.\"lifecycleStatus\"='ACTIVE' and not s.\"adminBlocked\" and s.status not in ('REJECTED','BLOCKED') group by 1 having count(distinct s.\"agentProfileId\")>5"
