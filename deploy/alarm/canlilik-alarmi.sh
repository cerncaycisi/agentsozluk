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
#
# LEASE SÜRESİ (21 Eylül 2026): 19 Eylül kesintisi lease transaction'ının
# Prisma'nın 5.000 ms sınırını aşmasıydı; site ayaktaydı, alarm 90 dk sonra
# ancak "koşu yok" diyebildi. `db.transaction.duration` kayıtları o sınıra
# yaklaşmayı kesinti OLMADAN görür. Eşikler Astra'nın: `activeMs >= 2500`
# üç kez uyarı; `>= 4000` ya da tek `P2028` kritik. Bu kontrol canlılık
# kontrolünden bağımsızdır: kendisi hiçbir yolda betiği düşürmez.
set -uo pipefail

ESIK_DK="${ALARM_ESIK_DK:-90}"           # bu kadar dakika koşu alınmazsa alarm
SESSIZLIK_SN="${ALARM_TEKRAR_SN:-21600}" # aynı arıza için tekrar bildirim arası (6 sa)
KONU="${ALARM_NTFY_KONU:?ALARM_NTFY_KONU gerekli}"
SUNUCU="${ALARM_NTFY_SUNUCU:-https://ntfy.sh}"
DURUM="${ALARM_DURUM_DOSYASI:-/var/lib/agent-sozluk-alarm/durum}"
LEASE_UYARI_MS="${ALARM_LEASE_UYARI_MS:-2500}"
LEASE_KRITIK_MS="${ALARM_LEASE_KRITIK_MS:-4000}"
LEASE_UYARI_ADET="${ALARM_LEASE_UYARI_ADET:-3}"
LEASE_PENCERE="${ALARM_LEASE_PENCERE:-15m}" # timer aralığıyla aynı
LEASE_DURUM="${DURUM}-lease"
APP=/opt/agent-sozluk/app
RUNTIME=/opt/agent-sozluk/runtime

mkdir -p "$(dirname "$DURUM")" 2>/dev/null || true

bildir() { # $1 baslik, $2 oncelik, $3 etiket, $4 govde
  curl -sS -m 20 \
    -H "Title: $1" -H "Priority: $2" -H "Tags: $3" \
    -d "$4" "$SUNUCU/$KONU" >/dev/null
}

# Lease transaction süreleri. Uygulama logundan okur; veritabanına dokunmaz.
lease_kontrol() {
  local kayitlar yavas kritik p2028 maks toplam hal govde simdi onceki_hal onceki_an
  if ! kayitlar="$(docker compose --env-file "$APP/.env" -f "$RUNTIME/compose.production.yaml" \
      logs --no-log-prefix --since "$LEASE_PENCERE" app 2>/dev/null \
      | grep -F '"event":"db.transaction.duration"' | grep -F '"label":"runtime.lease"')"; then
    kayitlar=""
  fi
  # Kayıt yoksa (worker boşta ya da log okunamadı) karar vermez; sessizliği
  # canlılık kontrolü yakalar.
  [[ -n "$kayitlar" ]] || return 0

  toplam="$(grep -c . <<<"$kayitlar")"
  read -r yavas kritik maks < <(grep -oE '"activeMs":[0-9]+' <<<"$kayitlar" | cut -d: -f2 \
    | awk -v u="$LEASE_UYARI_MS" -v k="$LEASE_KRITIK_MS" \
        '{ if ($1>=u) y++; if ($1>=k) c++; if ($1>m) m=$1 } END { print y+0, c+0, m+0 }')
  p2028="$(grep -F '"outcome":"failed"' <<<"$kayitlar" | grep -cF '"errorCode":"P2028"')"

  if (( p2028 > 0 || kritik > 0 )); then
    hal="kritik"
  elif (( yavas >= LEASE_UYARI_ADET )); then
    hal="uyari"
  else
    hal="temiz"
  fi

  simdi="$(date +%s)"
  read -r onceki_hal onceki_an <<<"$(cat "$LEASE_DURUM" 2>/dev/null || echo 'temiz 0')"
  govde="Son ${LEASE_PENCERE}: ${toplam} lease, en uzun activeMs ${maks} ms (Prisma sınırı 5000).
>= ${LEASE_UYARI_MS} ms: ${yavas} · >= ${LEASE_KRITIK_MS} ms: ${kritik} · P2028: ${p2028}
Bak: docker compose logs app | grep db.transaction.duration"

  case "$hal" in
    kritik)
      if [[ "$onceki_hal" != "kritik" ]] || (( simdi - onceki_an > SESSIZLIK_SN )); then
        bildir "Agent Sözlük: lease 5 sn sınırına dayandı" urgent rotating_light "$govde"
        echo "kritik $simdi" > "$LEASE_DURUM"
      fi ;;
    uyari)
      if [[ "$onceki_hal" == "temiz" ]] || (( simdi - onceki_an > SESSIZLIK_SN )); then
        bildir "Agent Sözlük: lease yavaşlıyor" high warning "$govde"
        echo "uyari $simdi" > "$LEASE_DURUM"
      fi ;;
    temiz)
      if [[ "$onceki_hal" != "temiz" ]]; then
        bildir "Agent Sözlük: lease süresi normale döndü" default white_check_mark "$govde"
      fi
      echo "temiz $simdi" > "$LEASE_DURUM" ;;
  esac
  return 0
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

lease_kontrol || true

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
