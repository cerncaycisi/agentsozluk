#!/bin/sh
# O3: PG16 konteynerinin İÇİNDE çalışır. SSH, deploy, karşılaştırma ve DROP yapmaz.
# Kullanım: sh run-owned.sh OP32 SOURCE_DB OWNER CONTROL DUMP_SHA256 VERIFY_SHA256 LIMIT_S
# /tmp/agentsozluk-o3-OP32/{backup.dump,verify.sql} önceden hash'li/özel staging'dir.
# İş bütçesi en çok 2700 s; hata sonrası hedefli oturum temizliği ayrıca en çok 30 s.
set -eu
umask 077
fail() { printf '%s\n' "$1" >&2; exit 1; }
[ "$#" -eq 7 ] || fail O3_ARGUMENTS_INVALID
op=$1 source_db=$2 owner=$3 control=$4 dump_sha=$5 verify_sha=$6 limit=$7
case "$op" in ''|*[!0-9a-f]*) fail O3_ARGUMENTS_INVALID ;; esac
[ "${#op}" -eq 32 ] || fail O3_ARGUMENTS_INVALID
for value in "$source_db" "$owner" "$control"; do
  case "$value" in ''|*[!a-z0-9_]*) fail O3_ARGUMENTS_INVALID ;; esac
  [ "${#value}" -le 63 ] || fail O3_ARGUMENTS_INVALID
done
for value in "$dump_sha" "$verify_sha"; do
  case "$value" in ''|*[!0-9a-f]*) fail O3_ARGUMENTS_INVALID ;; esac
  [ "${#value}" -eq 64 ] || fail O3_ARGUMENTS_INVALID
done
case "$limit" in ''|0*|*[!0-9]*) fail O3_ARGUMENTS_INVALID ;; esac
[ "${#limit}" -le 4 ] && [ "$limit" -ge 1 ] && [ "$limit" -le 2700 ] || fail O3_ARGUMENTS_INVALID
target="agent_sozluk_o3_$op"
[ "$source_db" != "$target" ] || fail O3_ARGUMENTS_INVALID
stage="/tmp/agentsozluk-o3-$op"
[ -d "$stage" ] && [ ! -L "$stage" ] || fail O3_STAGING_INVALID
[ "$(cd "$stage" && pwd -P)" = "$stage" ] || fail O3_STAGING_INVALID
for file in backup.dump verify.sql; do
  [ -f "$stage/$file" ] && [ ! -L "$stage/$file" ] || fail O3_STAGING_INVALID
done
# mkdir atomiktir: aynı işlem, başarı/hata sonrası bile ikinci kez çalıştırılmaz.
mkdir "$stage/run" 2>/dev/null || fail O3_OPERATION_ALREADY_USED
journal="$stage/run"
# Linux /proc/uptime monotonic; wall-clock düzeltmesi süreyi uzatamaz.
now() { read -r uptime ignored < /proc/uptime; printf '%s\n' "${uptime%%.*}"; }
started=$(now)
remaining() {
  left=$((started + limit - $(now)))
  [ "$left" -gt 0 ] || return 1
  printf '%s\n' "$left"
}
bounded() {
  seconds=$(remaining) || return 124
  # GNU ve BusyBox ortak biçimi; timeout DB konteynerinde, istemciyle aynı PID alanında.
  timeout -s KILL "$seconds" "$@"
}
unset PGDATABASE PGSERVICE PGSERVICEFILE PGOPTIONS PGAPPNAME
export PGUSER="$owner" PGCONNECT_TIMEOUT=5
control_app="o3-control-$op"
work_app="o3-$op"
expected_oid=''
finished=0
phase=prepare
cleanup() {
  original=$?
  trap - EXIT HUP INT TERM
  if [ "$finished" -ne 1 ] && [ -n "$expected_oid" ]; then
    # Ayrı kontrol bağlantısı; isim+OID+sahip+işaret tek sorguda doğrulanmadan KILL yok.
    # Yalnız bu çalışmanın kullanıcı/app adı ve hedef OID'si. Diğer oturumlar korunur.
    if ! timeout -s KILL 30 env PGUSER="$control" PGAPPNAME="$control_app" \
      PGOPTIONS='-c statement_timeout=20000 -c lock_timeout=5000' \
      psql -XAtq -v ON_ERROR_STOP=1 -d postgres \
      -v "target=$target" -v "owner=$owner" -v "marker=o3:$op" \
      -v "expected_oid=$expected_oid" -v "work_app=$work_app" \
      > "$journal/cleanup.stdout" 2> "$journal/cleanup.stderr" <<'SQL'
SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_database d
 WHERE d.datname = :'target' AND d.oid::text = :'expected_oid'
 AND pg_catalog.pg_get_userbyid(d.datdba) = :'owner'
 AND pg_catalog.shobj_description(d.oid, 'pg_database') = :'marker') AS owned \gset
\if :owned
SELECT pg_catalog.pg_terminate_backend(a.pid, 5000)
 FROM pg_catalog.pg_stat_activity a
 WHERE a.datid::text = :'expected_oid' AND a.datname = :'target'
 AND a.usename = :'owner' AND a.application_name = :'work_app';
SELECT NOT EXISTS (SELECT 1 FROM pg_catalog.pg_stat_activity
 WHERE datid::text = :'expected_oid' AND datname = :'target'
 AND usename = :'owner' AND application_name = :'work_app') AS gone \gset
\if :gone
SELECT 'O3_OWNED_SESSIONS_GONE';
\else
DO $$ BEGIN RAISE EXCEPTION 'O3_OWNED_SESSIONS_REMAIN'; END $$;
\endif
\else
DO $$ BEGIN RAISE EXCEPTION 'O3_CLEANUP_IDENTITY_MISMATCH'; END $$;
\endif
SQL
    then
      printf '%s\n' O3_CLEANUP_UNCONFIRMED >&2
      original=2
      printf '%s\n' O3_CLEANUP_UNCONFIRMED > "$journal/cleanup-status"
    else
      printf '%s\n' O3_OWNED_SESSIONS_GONE > "$journal/cleanup-status"
    fi
  fi
  if [ "$finished" -ne 1 ]; then
    printf 'O3_RESTORE_FAILED phase=%s elapsed_s=%s\n' "$phase" "$(($(now) - started))" \
      > "$journal/status"
    # Başarısız kopya, oluşturma/ham hata makbuzları korunur. Otomatik retry veya DROP yok.
    [ "$original" -ne 0 ] || original=1
  fi
  exit "$original"
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM
# Bu kabuk kendi çocukları dışında PID/grup sinyali üretmez; tekil PG istemcileri seri.
phase=hash
bounded sha256sum "$stage/backup.dump" > "$journal/dump.sha256" 2> "$journal/hash.stderr" || fail O3_HASH_FAILED
read -r actual ignored < "$journal/dump.sha256"
[ "$actual" = "$dump_sha" ] || fail O3_ARCHIVE_HASH_MISMATCH
bounded sha256sum "$stage/verify.sql" > "$journal/verify.sha256" 2>> "$journal/hash.stderr" || fail O3_HASH_FAILED
read -r actual ignored < "$journal/verify.sha256"
[ "$actual" = "$verify_sha" ] || fail O3_VERIFY_HASH_MISMATCH
phase=create
# timeout işlev değil gerçek psql sürecini sarmalar. control sorgusu dosyaya hazırlanır.
cat > "$journal/create.sql" <<'SQL'
SELECT current_user = :'control'
 AND (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user)
 AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = :'owner' AND rolcanlogin)
 AND current_setting('server_version_num')::int BETWEEN 160000 AND 169999
 AND EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datname = :'source'
   AND pg_catalog.pg_get_userbyid(datdba) = :'owner'
   AND datlocprovider = 'c' AND datcollversion IS NOT DISTINCT FROM
     pg_catalog.pg_database_collation_actual_version(oid))
 AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datname = :'target') AS safe \gset
\if :safe
SELECT format('CREATE DATABASE %I WITH TEMPLATE template0 OWNER %I ENCODING %L LOCALE_PROVIDER libc LC_COLLATE %L LC_CTYPE %L',
 :'target', :'owner', pg_encoding_to_char(encoding), datcollate, datctype)
 FROM pg_catalog.pg_database WHERE datname = :'source' \gexec
SELECT format('COMMENT ON DATABASE %I IS %L', :'target', :'marker') \gexec
SELECT oid FROM pg_catalog.pg_database WHERE datname = :'target'
 AND pg_catalog.pg_get_userbyid(datdba) = :'owner'
 AND pg_catalog.shobj_description(oid, 'pg_database') = :'marker';
\else
DO $$ BEGIN RAISE EXCEPTION 'O3_CREATE_GUARD_FAILED'; END $$;
\endif
SQL
bounded env PGUSER="$control" PGAPPNAME="$control_app" PGOPTIONS='-c statement_timeout=10000 -c lock_timeout=5000' \
  psql -XAtq -v ON_ERROR_STOP=1 -d postgres -v "target=$target" -v "source=$source_db" \
  -v "owner=$owner" -v "control=$control" -v "marker=o3:$op" < "$journal/create.sql" \
  > "$journal/create.stdout" 2> "$journal/create.stderr" || fail O3_CREATE_FAILED
expected_oid=$(cat "$journal/create.stdout")
case "$expected_oid" in ''|*[!0-9]*) expected_oid=''; fail O3_CREATE_RECEIPT_INVALID ;; esac
printf 'database=%s\noid=%s\nowner=%s\noperation=%s\n' "$target" "$expected_oid" "$owner" "$op" > "$journal/identity"
phase=restore
bounded env PGAPPNAME="$work_app" PGOPTIONS='-c lock_timeout=5000' \
  pg_restore --exit-on-error --no-owner --no-privileges --dbname "$target" "$stage/backup.dump" \
  > "$journal/restore.stdout" 2> "$journal/restore.stderr" || fail O3_RESTORE_CLIENT_FAILED
# CREATE'den sonra harici DDL olmadığı operatör kilidiyle sağlanır; tekrar kimlik kontrolü.
phase=identity
bounded env PGUSER="$control" PGAPPNAME="$control_app" PGOPTIONS='-c statement_timeout=10000 -c lock_timeout=5000' \
  psql -XAtq -v ON_ERROR_STOP=1 -d postgres -v "target=$target" -v "owner=$owner" \
  -v "marker=o3:$op" -v "expected_oid=$expected_oid" \
  > "$journal/identity-check.stdout" 2> "$journal/identity-check.stderr" <<'SQL'
SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_database d
 WHERE d.datname = :'target' AND d.oid::text = :'expected_oid'
 AND pg_catalog.pg_get_userbyid(d.datdba) = :'owner'
 AND pg_catalog.shobj_description(d.oid, 'pg_database') = :'marker');
SQL
[ "$(cat "$journal/identity-check.stdout")" = t ] || fail O3_TARGET_MISMATCH
phase=verify
bounded env PGAPPNAME="$work_app" psql -XAtq -v ON_ERROR_STOP=1 -d "$target" \
  -v "restore_database=$target" -v "restore_oid=$expected_oid" < "$stage/verify.sql" \
  > "$journal/verify.stdout" 2> "$journal/verify.stderr" || fail O3_VERIFY_CLIENT_FAILED
remaining > /dev/null || fail O3_DEADLINE_EXCEEDED
printf 'O3_RESTORE_READY elapsed_s=%s\n' "$(($(now) - started))" > "$journal/status"
finished=1
printf '%s\n' O3_RESTORE_READY
# READY yalnız başarılı restore+SQL exit demektir; metadata karşılaştırması/temizlik açık.
