#!/usr/bin/env bash
# Agent Sözlük üretim yedek komutu — 24 Eylül 2026 (B9, Gökhan: gecelik yedek "ok").
#
# NEREDE ÇALIŞIR: üretimde, `deploy` kullanıcısının `authorized_keys` dosyasındaki YEDEK
# anahtarının zorunlu komutu olarak (`command="…",restrict`). O anahtarla bağlanan hiçbir
# istemci başka komut çalıştıramaz; istemcinin istediği komut (`SSH_ORIGINAL_COMMAND`)
# yok sayılır.
#
# NE YAPAR: veritabanını YALNIZ okur. Dışa aktarılmış tek bir anlık görüntü tutulur;
# `pg_dump -Fc` o anlık görüntüden stdout'a yazar, aynı anlık görüntüdeki tablo satır
# sayısı + içerik özeti stderr'e gider. Üretim diskine dosya yazılmaz.
#
# KANITLANMIŞ YOL: 24 Eylül tek seferlik yedek ve PostgreSQL 16.14 restore provası bu
# betiğin aynısıyla alındı (50/50 tablo sayı + özet eşit). Ders: `docker compose exec -T`
# stdin'i yutar; her exec'in stdin'i ayrı bağlanır.
set -euo pipefail
test "$(hostname)" = agent-sozluk-prod
compose=(docker compose --env-file /opt/agent-sozluk/app/.env
  -f /opt/agent-sozluk/runtime/compose.production.yaml)
coproc HOLDER {
  "${compose[@]}" exec -T -e 'PGOPTIONS=-c timezone=UTC -c extra_float_digits=3' db \
    psql -XAtq -v ON_ERROR_STOP=1 -U agent_sozluk -d agent_sozluk
}
echo "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT pg_export_snapshot();" >&"${HOLDER[1]}"
read -r -t 60 snapshot <&"${HOLDER[0]}"
[[ "$snapshot" =~ ^[0-9A-F]+-[0-9A-F]+-[0-9]+$ ]]
echo "SNAPSHOT_OK" >&2
"${compose[@]}" exec -T db pg_dump -U agent_sozluk -d agent_sozluk --snapshot="$snapshot" \
  --format=custom --no-owner --no-privileges </dev/null
echo "DUMP_DONE" >&2
"${compose[@]}" exec -T -e 'PGOPTIONS=-c timezone=UTC -c extra_float_digits=3' db \
  psql -XAtq -F '|' -v ON_ERROR_STOP=1 -U agent_sozluk -d agent_sozluk >&2 <<SQL
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET TRANSACTION SNAPSHOT '$snapshot';
SELECT 'server_version|' || current_setting('server_version');
SELECT 'table|' || c.relname || '|' || (xpath('/row/n/text()', x))[1]::text || '|' || (xpath('/row/h/text()', x))[1]::text
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL query_to_xml(format('SELECT count(*) AS n, coalesce(sum(hashtextextended(t::text, 0)), 0) AS h FROM %I.%I AS t', n.nspname, c.relname), false, true, '') AS x
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') ORDER BY c.relname;
SELECT 'sequence|' || sequencename || '|' || coalesce(last_value::text, 'null') FROM pg_sequences WHERE schemaname = 'public' ORDER BY sequencename;
COMMIT;
SQL
echo "COMMIT;" >&"${HOLDER[1]}"
exec {HOLDER[1]}>&-
wait "$HOLDER_PID" || true
echo "META_DONE" >&2
