#!/usr/bin/env bash
# Kullanım: run.sh <worktree> <db> <çıktı> <tur> <eşzamanlılık> [ajan-sınırı]
set -euo pipefail
cd "$1"
export DATABASE_URL="postgresql://agent@127.0.0.1:5432/$2" NODE_ENV=development PATH=/home/agent/.local/node22/bin:$PATH
[ -n "${6:-}" ] && export SIM_AGENT_LIMIT="$6"; [ -n "${7:-}" ] && export SIM_SOURCE_READING="$7"
exec node --env-file=/tmp/wt-lab/.env --import tsx scripts/sim/society.ts "$3" "$4" "$5"
