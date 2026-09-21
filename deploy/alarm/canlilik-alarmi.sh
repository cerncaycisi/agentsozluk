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
# üç kez uyarı; `>= 4000` ya da tek `P2028` kritik.
#
# SIRA BİLEREK BÖYLE (Sol, 21 Eylül): önce canlılık, sonra lease. Lease
# kontrolü `timeout` ile sınırlı AYRI bir alt süreçte koşar; takılsa, çökse ya
# da durum dosyası bozuk olsa bile canlılık sonucu çoktan verilmiştir ve
# betiğin çıkış kodu canlılığınkidir.
set -uo pipefail

ESIK_DK="${ALARM_ESIK_DK:-90}"           # bu kadar dakika koşu alınmazsa alarm
SESSIZLIK_SN="${ALARM_TEKRAR_SN:-21600}" # aynı arıza için tekrar bildirim arası (6 sa)
KONU="${ALARM_NTFY_KONU:?ALARM_NTFY_KONU gerekli}"
SUNUCU="${ALARM_NTFY_SUNUCU:-https://ntfy.sh}"
DURUM="${ALARM_DURUM_DOSYASI:-/var/lib/agent-sozluk-alarm/durum}"
LEASE_UYARI_MS="${ALARM_LEASE_UYARI_MS:-2500}"
LEASE_KRITIK_MS="${ALARM_LEASE_KRITIK_MS:-4000}"
LEASE_UYARI_ADET="${ALARM_LEASE_UYARI_ADET:-3}"
LEASE_PENCERE="${ALARM_LEASE_PENCERE:-15m}"        # timer aralığıyla aynı
LEASE_ZAMAN_ASIMI="${ALARM_LEASE_ZAMAN_ASIMI:-45}"       # sn
CANLILIK_ZAMAN_ASIMI="${ALARM_CANLILIK_ZAMAN_ASIMI:-30}" # sn; docker/exec takılırsa
# En kötü duvar saati: canlılık 30+5 + curl 20 + lease 45+5 = 105 sn; birimin
# TimeoutStartSec=2min sınırının altında.
LEASE_DURUM="${DURUM}-lease"
APP=/opt/agent-sozluk/app
RUNTIME=/opt/agent-sozluk/runtime

mkdir -p "$(dirname "$DURUM")" 2>/dev/null || true

# Başarısızsa sıfır dışı döner; çağıran durumu YALNIZ başarıda yazar, yoksa
# gönderilemeyen bir alarm "gönderildi" sayılıp 6 saat bastırılırdı.
bildir() { # $1 baslik, $2 oncelik, $3 etiket, $4 govde
  curl -sS --fail -m 20 \
    -H "Title: $1" -H "Priority: $2" -H "Tags: $3" \
    -d "$4" "$SUNUCU/$KONU" >/dev/null
}

# Durum dosyasını okur; bozuk ya da tanınmayan içerik `temiz 0` sayılır.
# Zaman damgası baştaki sıfırsız bir tamsayı olmalı ve gelecekte olmamalı:
# `0009` Bash'te geçersiz sekizlik sayıdır, gelecekteki bir an ise tekrar
# bildirimini süresiz bastırırdı (Sol, ikinci tur). $1 dosya, $2 izinli
# haller (| ile), $3 şimdi. Çıktı: "hal an".
durum_oku() {
  local hal an
  read -r hal an 2>/dev/null <"$1" || true
  [[ "${hal:-}" =~ ^($2)$ ]] || hal=temiz
  if [[ ! "${an:-}" =~ ^(0|[1-9][0-9]{0,11})$ ]] || (( an > ${3:-0} )); then
    hal=temiz; an=0
  fi
  echo "$hal $an"
}

# ---------------------------------------------------------------- canlılık
canlilik_sorgu() {
  timeout --kill-after=5 "$CANLILIK_ZAMAN_ASIMI" \
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

canlilik_kontrol() {
  local cikti kosu_yas entry_yas esik_sn simdi onceki_hal onceki_an
  cikti="$(canlilik_sorgu | grep -E '^[0-9]+ ' | head -1)"
  simdi="$(date +%s)"
  read -r onceki_hal onceki_an <<<"$(durum_oku "$DURUM" 'temiz|alarm|sorgu-hatasi' "$simdi")"

  # Sorgu başarısızsa bu da bir arıza sinyalidir; sessiz kalmak en kötü seçenek.
  if [[ -z "$cikti" ]]; then
    if [[ "$onceki_hal" != "sorgu-hatasi" ]] || (( simdi - onceki_an > SESSIZLIK_SN )); then
      bildir "Agent Sözlük: veritabanı sorgulanamıyor" urgent rotating_light \
        "Canlılık sorgusu başarısız. Veritabanı, docker ya da compose erişimi bozuk olabilir. $(date -u '+%Y-%m-%d %H:%M UTC')" \
        && echo "sorgu-hatasi $simdi" >"$DURUM"
    fi
    return 1
  fi

  read -r kosu_yas entry_yas <<<"$cikti"
  esik_sn=$(( ESIK_DK * 60 ))

  if (( kosu_yas > esik_sn )); then
    if [[ "$onceki_hal" != "alarm" ]] || (( simdi - onceki_an > SESSIZLIK_SN )); then
      bildir "Agent Sözlük sessiz: $(( kosu_yas / 60 )) dk koşu yok" urgent rotating_light \
"Worker $(( kosu_yas / 60 )) dakikadır koşu almadı (eşik ${ESIK_DK} dk).
Son entry: ${entry_yas} sn önce.
Site ayakta olabilir ve /api/health 200 dönebilir; bu alarm onu ölçmüyor.
Bak: systemctl status agent-sozluk-runtime" \
        && echo "alarm $simdi" >"$DURUM"
    fi
    return 2
  fi

  # Arızadan çıkış da haber değeri taşır; gönderilemezse bir sonraki koşu dener.
  if [[ "$onceki_hal" == "alarm" || "$onceki_hal" == "sorgu-hatasi" ]]; then
    bildir "Agent Sözlük tekrar üretiyor" default white_check_mark \
      "Son koşu ${kosu_yas} sn önce alındı, son entry ${entry_yas} sn önce. $(date -u '+%Y-%m-%d %H:%M UTC')" \
      || return 0
  fi
  echo "temiz $simdi" >"$DURUM"
  return 0
}

# ------------------------------------------------------------ lease süresi
# Uygulama logundan okur; veritabanına dokunmaz. Yalnız `--yalniz-lease` ile,
# `timeout` altındaki alt süreçte çağrılır.
lease_kontrol() {
  local ham rc kayitlar toplam yavas kritik maks baslamayan okunamayan p2028 hal govde baslik oncelik etiket
  local simdi onceki_hal onceki_an
  ham="$(timeout 30 docker compose --env-file "$APP/.env" -f "$RUNTIME/compose.production.yaml" \
    logs --no-log-prefix --since "$LEASE_PENCERE" app 2>/dev/null)"
  rc=$?
  simdi="$(date +%s)"
  read -r onceki_hal onceki_an <<<"$(durum_oku "$LEASE_DURUM" 'temiz|uyari|kritik|okunamiyor' "$simdi")"

  if (( rc != 0 )); then
    # Log okunamıyorsa lease kör kalır; bu canlılıktan ayrı bir arızadır.
    hal=okunamiyor
    govde="Uygulama logu okunamadı (çıkış $rc); lease süresi izlenemiyor.
Canlılık kontrolü bundan bağımsız çalışıyor."
  else
    kayitlar="$(grep -E '"event": *"db\.transaction\.duration"' <<<"$ham" \
      | grep -E '"label": *"runtime\.lease"')"
    # Kayıt yoksa (worker boşta) süre hakkında karar yok; önceki durum kalır.
    # Tek istisna: log yeniden okunabiliyorsa `okunamiyor` kapanmalı.
    if [[ -z "$kayitlar" ]]; then
      [[ "$onceki_hal" == "okunamiyor" ]] || return 0
      bildir "Agent Sözlük: lease logu yeniden okunuyor" default white_check_mark \
        "Uygulama logu yeniden okunabiliyor; son ${LEASE_PENCERE} içinde lease kaydı yok." \
        && echo "temiz $simdi" >"$LEASE_DURUM"
      return 0
    fi

    # Satır başına YALNIZ ilk activeMs. `activeMs: null` callback'in hiç
    # başlamadığı (bağlantı alınamayan) transaction'dır: kötü haber, ayrı
    # sayılır (Sol, üçüncü tur). Kesilmiş satır ne iyi ne kötü sayılır.
    read -r toplam yavas kritik maks baslamayan okunamayan < <(awk -v u="$LEASE_UYARI_MS" -v k="$LEASE_KRITIK_MS" '
      { n++
        if (match($0, /"activeMs": *[0-9]+/)) {
          v = substr($0, RSTART, RLENGTH); sub(/^[^0-9]*/, "", v); v += 0
          if (v >= u) y++; if (v >= k) c++; if (v > m) m = v
        } else if ($0 ~ /"activeMs": *null/) z++
        else b++ }
      END { print n+0, y+0, c+0, m+0, z+0, b+0 }' <<<"$kayitlar")
    p2028="$(grep -E '"outcome": *"failed"' <<<"$kayitlar" | grep -cE '"errorCode": *"P2028"')"

    if (( p2028 > 0 || kritik > 0 )); then hal=kritik
    elif (( yavas >= LEASE_UYARI_ADET || baslamayan > 0 )); then hal=uyari
    elif (( okunamayan > 0 )); then
      # Ayrıştırılamayan bir satır bile varsa "temiz" demek için kanıt yok:
      # o satır yavaş, kritik ya da başlamamış olabilir (Sol, dördüncü tur).
      # Kötü kararlar yukarıda görülen kanıtla verilir; iyi karar verilmez.
      return 0
    else hal=temiz
    fi
    govde="Son ${LEASE_PENCERE}: ${toplam} lease, en uzun activeMs ${maks} ms (Prisma sınırı 5000).
>= ${LEASE_UYARI_MS} ms: ${yavas} · >= ${LEASE_KRITIK_MS} ms: ${kritik} · P2028: ${p2028} · başlamayan: ${baslamayan}
Okunamayan satır: ${okunamayan}. Bak: docker compose logs app | grep db.transaction.duration"
  fi

  case "$hal" in
    kritik)     baslik="Agent Sözlük: lease 5 sn sınırına dayandı"; oncelik=urgent;  etiket=rotating_light ;;
    uyari)      baslik="Agent Sözlük: lease yavaşlıyor";            oncelik=high;    etiket=warning ;;
    okunamiyor) baslik="Agent Sözlük: lease logu okunamıyor";       oncelik=default; etiket=warning ;;
    temiz)      baslik="Agent Sözlük: lease süresi normale döndü";  oncelik=default; etiket=white_check_mark ;;
  esac

  # Her hal DEĞİŞİMİ bildirilir (kritik→uyarı dahil); aynı arıza 6 saatte bir
  # tekrarlanır; temizken tekrar yok. Durum yalnız gönderim başarılıysa yazılır.
  if [[ "$hal" != "$onceki_hal" ]] \
     || { [[ "$hal" != temiz ]] && (( simdi - onceki_an > SESSIZLIK_SN )); }; then
    bildir "$baslik" "$oncelik" "$etiket" "$govde" && echo "$hal $simdi" >"$LEASE_DURUM"
  fi
  return 0
}

if [[ "${1:-}" == "--yalniz-lease" ]]; then
  lease_kontrol
  exit 0
fi

canlilik_kontrol
kod=$?
timeout --kill-after=5 "$LEASE_ZAMAN_ASIMI" "$BASH" "$0" --yalniz-lease || true
exit "$kod"
