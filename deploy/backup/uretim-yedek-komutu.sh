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

# Tek çalışma (Astra, PR #204 P1): yedek anahtarıyla açılan paralel bağlantılar ikinci bir
# tam dump başlatamaz. Kilit dosyası üretimde yazılan tek dosyadır ve veri içermez.
exec 9>/tmp/agentsozluk-yedek.lock
flock -n 9 || { echo "YEDEK_BUSY" >&2; exit 75; }

compose=(docker compose --env-file /opt/agent-sozluk/app/.env
  -f /opt/agent-sozluk/runtime/compose.production.yaml)
APP=agentsozluk-yedek
# Toplam süre üst sınırı. `docker exec` istemcisi ölse bile konteynerdeki süreç yaşar; bu
# yüzden kesin kapanış PostgreSQL tarafında: anlık görüntüyü tutan oturum en çok LIMIT_S
# boşta kalabilir, bekçi süre dolunca bütün yedek oturumlarını sonlandırır.
LIMIT_S=3000
pg_env=(-e "PGAPPNAME=$APP"
  -e "PGOPTIONS=-c timezone=UTC -c extra_float_digits=3 -c idle_in_transaction_session_timeout=${LIMIT_S}s")
terminate_backup_sessions() {
  "${compose[@]}" exec -T db psql -XAtq -U agent_sozluk -d agent_sozluk -c \
    "SELECT count(pg_terminate_backend(pid)) FROM pg_stat_activity WHERE application_name = '$APP' AND pid <> pg_backend_pid()" \
    </dev/null >/dev/null 2>&1 || true
}
# Bekçi kilidi ve stdout'u devralmaz: yoksa betik bitse de `sleep` SSH oturumunu ve kilidi
# açık tutardı. Çıkışta önce çocuğu (`sleep`), sonra bekçinin kendisi öldürülür.
exec 8>&2
(
  exec 9>&-
  sleep "$LIMIT_S" 8>&-
  echo "YEDEK_TIMEOUT" >&8
  terminate_backup_sessions
) </dev/null >/dev/null 2>/dev/null &
watchdog=$!
disown "$watchdog"
trap 'pkill -P "$watchdog" 2>/dev/null || true; kill "$watchdog" 2>/dev/null || true; terminate_backup_sessions' EXIT

coproc HOLDER {
  "${compose[@]}" exec -T "${pg_env[@]}" db \
    psql -XAtq -v ON_ERROR_STOP=1 -U agent_sozluk -d agent_sozluk
}
# PID hemen saklanır: coprocess bitince Bash `HOLDER_PID`'i siler, `set -u` altında
# sonraki `wait` betiği düşürüyordu (Astra: 250 koşuda 10).
holder_pid=$HOLDER_PID
echo "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT pg_export_snapshot();" >&"${HOLDER[1]}"
read -r -t 60 snapshot <&"${HOLDER[0]}"
[[ "$snapshot" =~ ^[0-9A-F]+-[0-9A-F]+-[0-9]+$ ]]
echo "SNAPSHOT_OK" >&2
# İstemci akışı okumayı bırakırsa `pg_dump` yazarken bloklanır ve PostgreSQL oturumunun
# kapanması onu uyandırmaz; bu yüzden istemci süreci de süreyle sınırlı. Ölünce betik hata
# ile çıkar ve kilit bırakılır (Astra, PR #204 2. tur P1).
timeout --kill-after=30 "$LIMIT_S" "${compose[@]}" exec -T "${pg_env[@]}" db pg_dump \
  -U agent_sozluk -d agent_sozluk --snapshot="$snapshot" --format=custom --no-owner \
  --no-privileges </dev/null
echo "DUMP_DONE" >&2
# Sequence değerleri anlık görüntüye bağlı değildir (PostgreSQL davranışı); bilgi amaçlı.
timeout --kill-after=30 600 "${compose[@]}" exec -T "${pg_env[@]}" db \
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
wait "$holder_pid" || true
echo "META_DONE" >&2
