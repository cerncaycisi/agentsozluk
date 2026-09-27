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
database="agent_sozluk_reset_rehearsal_$(date -u +%Y%m%d%H%M%S)_independent_test"
marker='agentsozluk:great-reset:synthetic:v1'
work="$(mktemp -d "${TMPDIR:-/tmp}/great-reset-operator-gate.XXXXXXXX")"
chmod 0700 "$work"
created=0

psql_local() {
  "$pg_bin/psql" -X -h 127.0.0.1 -p 5432 -U "$local_user" -v ON_ERROR_STOP=1 "$@" </dev/null
}

# SQL betiği stdin'den (tek oturum).
psql_script() {
  "$pg_bin/psql" -X -h 127.0.0.1 -p 5432 -U "$local_user" -v ON_ERROR_STOP=1 "$@"
}

cleanup() {
  local status=$?
  trap - EXIT
  set +e
  if ((created == 1)); then
    psql_script -d postgres -q -v "expected=${expected_cluster:-x}" -v "database=$database" \
      <<'SQL' >/dev/null || printf 'RESET_OPERATOR_GATE_WARN code=LOCAL_DATABASE_LEFT database=%s\n' "$database" >&2
SELECT system_identifier::text = :'expected' AS cluster_ok FROM pg_control_system() \gset
\if :cluster_ok
SELECT format('DROP DATABASE IF EXISTS %I WITH (FORCE)', :'database') \gexec
\else
DO $$ BEGIN RAISE EXCEPTION 'RESET_OPERATOR_GATE_LOCAL_CLUSTER_MISMATCH'; END $$;
\endif
SQL
  fi
  find "$work" -xdev -depth -delete
  exit "$status"
}
trap cleanup EXIT

# Yerel prova kümesinin exact kimliği; mutasyonlar kimliği doğrulayan AYNI oturumda yapılır
# (Astra, PR #240 2. tur P1: ayrı bağlantılar arasında küme değişimi TOCTOU'su).
expected_cluster="$(cd "$root" && "$tsx" scripts/great-reset-operation.ts local-identity)" ||
  fail LOCAL_IDENTITY_UNAVAILABLE
expected_cluster="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).clusterId)' "$expected_cluster")"
[[ "$expected_cluster" =~ ^[0-9]+$ ]] || fail LOCAL_IDENTITY_UNAVAILABLE

# Tek oturum: kimlik → rol (üretim bayraklarıyla: LOGIN, süper kullanıcı/CREATEDB/CREATEROLE/
# replikasyon/RLS aşımı yok, parola yok) → DB (sahibi agent_sozluk; makbuz DB sahibi = kullanıcı
# ister) → sentetik işaret. Kimlik tutmazsa hiçbir komut çalışmaz.
psql_script -d postgres -q -v "expected=$expected_cluster" -v "database=$database" \
  -v "marker=$marker" <<'SQL' || fail LOCAL_PREPARE_FAILED
SELECT system_identifier::text = :'expected' AS cluster_ok FROM pg_control_system() \gset
\if :cluster_ok
\else
-- `\quit` çıkış kodu vermez: ON_ERROR_STOP ile sıfır dışı çıkış için hata fırlatılır.
DO $$ BEGIN RAISE EXCEPTION 'RESET_OPERATOR_GATE_LOCAL_CLUSTER_MISMATCH'; END $$;
\endif
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_sozluk') THEN
    CREATE ROLE agent_sozluk;
  END IF;
END $$;
ALTER ROLE agent_sozluk LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION
  NOBYPASSRLS CONNECTION LIMIT -1 PASSWORD NULL;
SELECT format('CREATE DATABASE %I OWNER agent_sozluk TEMPLATE template0 ENCODING %L',
  :'database', 'UTF8') \gexec
SELECT format('COMMENT ON DATABASE %I IS %L', :'database', :'marker') \gexec
SQL
created=1
# Üretim scratch'i gibi `agent_sozluk` rolü altında: extension'lar üretimdeki sahiple kurulur.
"$pg_bin/pg_restore" -h 127.0.0.1 -p 5432 -U "$local_user" --role=agent_sozluk --exit-on-error \
  -d "$database" "$dump" </dev/null || fail LOCAL_RESTORE_FAILED
(cd "$root" && AGENT_GREAT_RESET_INDEPENDENT_DATABASE_URL="postgresql://agent_sozluk@127.0.0.1:5432/$database" \
  "$tsx" scripts/great-reset-operation.ts receipt "$work/independent.json" >/dev/null) ||
  fail LOCAL_RECEIPT_FAILED
# İki kümenin kurulum süper kullanıcısı: üretimde `postgres`, burada yerel initdb kullanıcısı.
production_bootstrap="${AGENTSOZLUK_PRODUCTION_BOOTSTRAP:-postgres}"
(cd "$root" && "$tsx" scripts/great-reset-operation.ts receipt-compare-independent "$receipt" \
  "$work/independent.json" "$production_bootstrap" "$local_user") >"$work/compare.json" || {
  cat "$work/compare.json" >&2
  fail INDEPENDENT_RESTORE_MISMATCH
}
printf 'RESET_OPERATOR_GATE_PASS operation=%s dump_sha256=%s %s\n' "$operation_id" "$dump_sha" \
  "$(cat "$work/compare.json")"
