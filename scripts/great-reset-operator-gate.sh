#!/usr/bin/env bash
# Great reset — operatör sunucusunda bağımsız restore kapısı (runbook v20 A5 reset modu, 4. adım).
#
#   great-reset-operator-gate.sh <operationId> <dump> <dumpSha256> <üretim-makbuzu.json> <makbuzSha256>
#
# Reset-anı yedeği (sahiplik/ACL dahil) kişisel operatör sunucusundaki PostgreSQL 16 prova
# kümesinde yeni bir sentetik adlı DB'ye restore edilir; makbuzu üretim makbuzuyla bağımsız restore
# kuralıyla karşılaştırılır (içerik/şema/sequence ve nesne sahiplik/yetkileri birebir; yalnız
# küme ortamı farkı). Geçerse 0; aksi hâlde güvenli kodla durur. DB her durumda düşürülür.
# Üretime bağlanmaz. Yalnız yerel prova guard'ının izin verdiği host ve adlar.
set -Eeuo pipefail

fail() {
  printf 'RESET_OPERATOR_GATE_FAIL code=%s\n' "$1" >&2
  exit "${2:-97}"
}

operation_id="${1:-}"
dump="${2:-}"
dump_sha="${3:-}"
receipt="${4:-}"
receipt_sha="${5:-}"
[[ "$operation_id" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]] ||
  fail INVALID_ARGUMENTS 90
[[ "$dump_sha" =~ ^[0-9a-f]{64}$ && "$receipt_sha" =~ ^[0-9a-f]{64}$ ]] || fail INVALID_ARGUMENTS 90
[[ "$dump" == /* && "$receipt" == /* ]] || fail INVALID_ARGUMENTS 90
test -f "$dump" && test ! -L "$dump" || fail DUMP_MISSING
test -f "$receipt" && test ! -L "$receipt" || fail RECEIPT_MISSING
test "$(sha256sum "$dump" | cut -d ' ' -f 1)" = "$dump_sha" || fail DUMP_SHA_MISMATCH
root="$(cd "$(dirname "$0")/.." && pwd)"
tsx="$root/node_modules/.bin/tsx"
test -x "$tsx" || fail OPERATOR_DEPENDENCIES_MISSING
test "$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).sha256)' \
  "$receipt")" = "$receipt_sha" || fail RECEIPT_SHA_MISMATCH

pg_bin="${AGENTSOZLUK_LOCAL_PG_BIN:-/home/agent/pg16/root/usr/lib/postgresql/16/bin}"
export LD_LIBRARY_PATH="${AGENTSOZLUK_LOCAL_PG_LIB:-/home/agent/pg16/root/usr/lib/x86_64-linux-gnu}"
local_user=agent
database="agent_sozluk_reset_rehearsal_$(date -u +%Y%m%d%H%M%S)_restored_test"
marker='agentsozluk:great-reset:synthetic:v1'
work="$(mktemp -d "${TMPDIR:-/tmp}/great-reset-operator-gate.XXXXXXXX")"
chmod 0700 "$work"
created=0

psql_local() {
  "$pg_bin/psql" -X -h 127.0.0.1 -p 5432 -U "$local_user" -v ON_ERROR_STOP=1 "$@" </dev/null
}

cleanup() {
  local status=$?
  trap - EXIT
  set +e
  if ((created == 1)); then
    psql_local -d postgres -q -c "DROP DATABASE IF EXISTS \"$database\" WITH (FORCE)" >/dev/null ||
      printf 'RESET_OPERATOR_GATE_WARN code=LOCAL_DATABASE_LEFT database=%s\n' "$database" >&2
  fi
  find "$work" -xdev -depth -delete
  exit "$status"
}
trap cleanup EXIT

# Üretimdeki nesne sahibi rol yerelde de bulunmalı (giriş yetkisi olmadan); restore sahipliği korur.
psql_local -d postgres -q -c \
  "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_sozluk') THEN
     CREATE ROLE agent_sozluk NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE; END IF; END \$\$" ||
  fail LOCAL_ROLE_FAILED
psql_local -d postgres -q -c "CREATE DATABASE \"$database\" OWNER \"$local_user\" TEMPLATE template0 ENCODING 'UTF8'" ||
  fail LOCAL_DATABASE_CREATE_FAILED
created=1
psql_local -d postgres -q -c "COMMENT ON DATABASE \"$database\" IS '$marker'" || fail LOCAL_MARKER_FAILED
"$pg_bin/pg_restore" -h 127.0.0.1 -p 5432 -U "$local_user" --exit-on-error -d "$database" "$dump" \
  </dev/null || fail LOCAL_RESTORE_FAILED
(cd "$root" && AGENT_GREAT_RESET_DATABASE_URL="postgresql://$local_user@127.0.0.1:5432/$database" \
  "$tsx" scripts/great-reset-operation.ts receipt "$work/independent.json" >/dev/null) ||
  fail LOCAL_RECEIPT_FAILED
(cd "$root" && "$tsx" scripts/great-reset-operation.ts receipt-compare-independent "$receipt" \
  "$work/independent.json") >"$work/compare.json" || {
  cat "$work/compare.json" >&2
  fail INDEPENDENT_RESTORE_MISMATCH
}
printf 'RESET_OPERATOR_GATE_PASS operation=%s dump_sha256=%s %s\n' "$operation_id" "$dump_sha" \
  "$(cat "$work/compare.json")"
