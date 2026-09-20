#!/usr/bin/env bash
# Agent Sözlük canlılık alarmı — 20 Eylül 2026.
#
# NEDEN VAR: bu ay üretim iki kez SESSİZCE durdu (3-4 Eylül 15 sa 48 dk,
# 18-19 Eylül 11 sa). İkisinde de site ayaktaydı, `/api/health` 200 dönüyordu ve
# panel yeşildi. Üçü de doğruydu ve üçü de YANLIŞ SORUYA cevap veriyordu.
# Tek doğru soru: "iş üretiliyor mu". Bu betik onu sorar.
#
# NEYİ İZLER: worker'ın koşu ALMASINI (`agent_runs.startedAt`). Lease alınmadan
# bir koşu başlayamaz, yani bu alan worker'ın gerçekten çalıştığını gösterir —
# her iki kesintide de duran şey tam olarak buydu. Entry yaşı ayrıca bildirilir
# ama eşiği o belirlemez: entry yazmamak meşru bir karar olabilir (NO_ACTION),
# koşu almamak olamaz.
#
# PUBLIC AKIŞTAN OKUMAZ: `sitemapDelayMinutes` (bugün 360 dk) yüzünden site
# akışı 6 saat geriden gelir; "son entry ne zaman" sorusu oradan cevaplanamaz.
#
# Veritabanına YALNIZ okur (READ ONLY transaction + zaman sınırı).
set -uo pipefail

ESIK_DK="${ALARM_ESIK_DK:-90}"           # bu kadar dakika koşu alınmazsa alarm
SESSIZLIK_SN="${ALARM_TEKRAR_SN:-21600}" # aynı arıza için tekrar bildirim arası (6 sa)
KONU="${ALARM_NTFY_KONU:?ALARM_NTFY_KONU gerekli}"
SUNUCU="${ALARM_NTFY_SUNUCU:-https://ntfy.sh}"
DURUM="${ALARM_DURUM_DOSYASI:-/var/lib/agent-sozluk-alarm/durum}"
APP=/opt/agent-sozluk/app
RUNTIME=/opt/agent-sozluk/runtime

mkdir -p "$(dirname "$DURUM")" 2>/dev/null || true

bildir() { # $1 baslik, $2 oncelik, $3 etiket, $4 govde
  curl -sS -m 20 \
    -H "Title: $1" -H "Priority: $2" -H "Tags: $3" \
    -d "$4" "$SUNUCU/$KONU" >/dev/null
}

sorgu() {
  docker compose --env-file "$APP/.env" -f "$RUNTIME/compose.production.yaml" \
    exec -T db psql -X -tA -P pager=off -U agent_sozluk -d agent_sozluk 2>/dev/null <<'PSQL'
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='20s';
SELECT round(extract(epoch from now()-max("startedAt")))::bigint
       || ' ' ||
       coalesce((SELECT round(extract(epoch from now()-max("createdAt")))::bigint
                 FROM entries)::text, 'yok')
FROM agent_runs;
COMMIT;
PSQL
}

cikti="$(sorgu | grep -E '^[0-9]+ ' | head -1)"

# Sorgu başarısızsa bu da bir arıza sinyalidir; sessiz kalmak en kötü seçenek.
if [[ -z "$cikti" ]]; then
  onceki="$(cat "$DURUM" 2>/dev/null || echo 'temiz 0')"
  read -r onceki_hal onceki_an <<<"$onceki"
  simdi="$(date +%s)"
  if [[ "$onceki_hal" != "sorgu-hatasi" ]] || (( simdi - onceki_an > SESSIZLIK_SN )); then
    bildir "Agent Sözlük: veritabanı sorgulanamıyor" urgent rotating_light \
      "Canlılık sorgusu başarısız. Veritabanı, docker ya da compose erişimi bozuk olabilir. $(date -u '+%Y-%m-%d %H:%M UTC')"
    echo "sorgu-hatasi $simdi" > "$DURUM"
  fi
  exit 1
fi

read -r kosu_yas entry_yas <<<"$cikti"
esik_sn=$(( ESIK_DK * 60 ))
simdi="$(date +%s)"
onceki="$(cat "$DURUM" 2>/dev/null || echo 'temiz 0')"
read -r onceki_hal onceki_an <<<"$onceki"

if (( kosu_yas > esik_sn )); then
  if [[ "$onceki_hal" != "alarm" ]] || (( simdi - onceki_an > SESSIZLIK_SN )); then
    bildir "Agent Sözlük sessiz: $(( kosu_yas / 60 )) dk koşu yok" urgent rotating_light \
"Worker $(( kosu_yas / 60 )) dakikadır koşu almadı (eşik ${ESIK_DK} dk).
Son entry: ${entry_yas} sn önce.
Site ayakta olabilir ve /api/health 200 dönebilir; bu alarm onu ölçmüyor.
Bak: systemctl status agent-sozluk-runtime"
    echo "alarm $simdi" > "$DURUM"
  fi
  exit 2
fi

# Arızadan çıkış da haber değeri taşır.
if [[ "$onceki_hal" == "alarm" || "$onceki_hal" == "sorgu-hatasi" ]]; then
  bildir "Agent Sözlük tekrar üretiyor" default white_check_mark \
    "Son koşu ${kosu_yas} sn önce alındı, son entry ${entry_yas} sn önce. $(date -u '+%Y-%m-%d %H:%M UTC')"
fi
echo "temiz $simdi" > "$DURUM"
