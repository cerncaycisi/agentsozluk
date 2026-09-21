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
LEASE_ILK_PENCERE_SN=900     # imleç yokken (ilk koşu) geriye bakılan süre
LEASE_ORTUSME_SN=60          # imleçten bu kadar geriden başla; sınır kaydı kaçmaz
LEASE_AZAMI_GERI_SN=21600    # gönderim uzun süre başarısızsa en fazla 6 sa geri
LEASE_ZAMAN_ASIMI="${ALARM_LEASE_ZAMAN_ASIMI:-45}"       # sn
CANLILIK_ZAMAN_ASIMI="${ALARM_CANLILIK_ZAMAN_ASIMI:-30}" # sn; docker/exec takılırsa
# En kötü duvar saati: canlılık 30+5 + curl 20 + lease 45+5 = 105 sn; birimin
# TimeoutStartSec=2min sınırının altında.
LEASE_DURUM="${DURUM}-lease"
LEASE_IMLEC="${DURUM}-lease-imlec"
LEASE_KUYRUK="${DURUM}-lease-kuyruk"
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
#
# TESPİT ile TESLİM ayrıdır (Sol ve Astra, 21 Eylül; yedi tur):
#  - İMLEÇ: tarama en son başarıyla OKUNAN andan başlar; docker tarafında 60 sn
#    örtüşme, ama yalnız pino `time` alanı imleçten sonraki kayıtlar sayılır
#    (örtüşme kayıt kaçırmaz, çift saymaz). Log okunduysa imleç ilerler; okunamadıysa
#    ilerlemez. En fazla 6 sa geri bakılır; o kadar uzun okunamayan log zaten
#    `okunamiyor` alarmıdır.
#  - KUYRUK: bildirim gerektiren karar önce gönderilir; gönderilemezse diske
#    kuyruğa yazılır ve her koşunun başında önce kuyruk boşaltılır. Tespit edilmiş
#    bir alarm, log ne kadar eskirse eskisin kaybolmaz.
#  - UYARI: "3 yavaş kayıt" gerçek bir 15 dk'lık kayan pencerede aranır; tarama
#    uzasa da (log kesintisi sonrası) saatler arayla gelen kayıtlar birleşmez.

hata_yaz() { echo "agent-sozluk-alarm: $*" >&2; }

iso() { date -u -d "@$1" +%Y-%m-%dT%H:%M:%SZ; }

# Kuyruktaki bildirimleri eskiden yeniye gönderir; ilk başarısızlıkta durur.
kuyrugu_bosalt() {
  local f baslik oncelik etiket govde
  [[ -d "$LEASE_KUYRUK" ]] || return 0
  for f in $(ls -1 "$LEASE_KUYRUK" 2>/dev/null | sort); do
    f="$LEASE_KUYRUK/$f"
    { read -r baslik; read -r oncelik; read -r etiket; govde="$(cat)"; } <"$f" || continue
    bildir "$baslik" "$oncelik" "$etiket" "$govde" || return 1
    rm -f "$f"
  done
  return 0
}

# Bildirir; gönderilemezse kuyruğa yazar. Karar kalıcılaştıysa (gönderildi ya da
# kuyruğa yazıldı) 0 döner; ikisi de olmadıysa 1 — çağıran durumu yazmaz.
teslim_et() { # $1 baslik, $2 oncelik, $3 etiket, $4 govde
  local ad
  if [[ ! -d "$LEASE_KUYRUK" ]] || [[ -z "$(ls -A "$LEASE_KUYRUK" 2>/dev/null)" ]]; then
    bildir "$@" && return 0
  fi
  # Kuyruk doluysa sıra bozulmasın diye doğrudan gönderilmez, arkaya eklenir.
  mkdir -p "$LEASE_KUYRUK" 2>/dev/null || { hata_yaz "kuyruk dizini yok"; return 1; }
  ad="$LEASE_KUYRUK/$(printf '%012d' "$simdi")-$$-$RANDOM"
  if printf '%s\n%s\n%s\n%s' "[gecikmeli $(date -u -d "@$simdi" '+%H:%M UTC')] $1" "$2" "$3" "$4" >"$ad"; then
    # Sınır: en fazla 50 bekleyen; fazlası en eskiden silinir (ntfy uzun kesintide).
    ls -1 "$LEASE_KUYRUK" | sort | head -n -50 | while read -r x; do rm -f "$LEASE_KUYRUK/$x"; done
    return 0
  fi
  hata_yaz "bildirim kuyruğa yazılamadı"
  return 1
}

lease_kontrol() {
  local ham rc kayitlar toplam yavas kritik maks baslamayan okunamayan pencerede p2028
  local hal govde baslik oncelik etiket simdi onceki_hal onceki_an imlec baslangic esik pencere_dk
  # ALARM_SIMDI yalnız testler içindir; üretimde tanımlı değildir.
  simdi="${ALARM_SIMDI:-$(date +%s)}"
  read -r onceki_hal onceki_an <<<"$(durum_oku "$LEASE_DURUM" 'temiz|uyari|kritik|okunamiyor|belirsiz' "$simdi")"

  kuyrugu_bosalt || true

  read -r imlec 2>/dev/null <"$LEASE_IMLEC" || imlec=""
  if [[ "$imlec" =~ ^[1-9][0-9]{0,11}$ ]] && (( imlec <= simdi )); then
    esik="$imlec"
    (( esik < simdi - LEASE_AZAMI_GERI_SN )) && esik=$(( simdi - LEASE_AZAMI_GERI_SN ))
  else
    # İlk koşu, bozuk imleç ya da saat geri kaydı: son 15 dk.
    [[ -n "$imlec" ]] && hata_yaz "imleç geçersiz ya da gelecekte ($imlec); son 15 dk taranıyor"
    esik=$(( simdi - LEASE_ILK_PENCERE_SN ))
  fi
  # Kayan 15 dk'lık uyarı penceresi için eşikten 15 dk daha geriye bakılır; o
  # eski kayıtlar YALNIZ pencere tarihçesidir, yeniden sayılmaz.
  baslangic=$(( esik - LEASE_ORTUSME_SN - 900 ))
  pencere_dk=$(( (simdi - esik + 59) / 60 ))

  ham="$(timeout 30 docker compose --env-file "$APP/.env" -f "$RUNTIME/compose.production.yaml" \
    logs --no-log-prefix --since "$(iso "$baslangic")" app 2>/dev/null)"
  rc=$?

  if (( rc != 0 )); then
    # Log okunamıyorsa lease kör kalır; bu canlılıktan ayrı bir arızadır.
    hal=okunamiyor
    govde="Uygulama logu okunamadı (çıkış $rc); lease süresi izlenemiyor.
Canlılık kontrolü bundan bağımsız çalışıyor."
    # İmleç ilerlemez; hiç yoksa bu taramanın eşiği yazılır ki sonraki oradan başlasın.
    [[ "$imlec" =~ ^[1-9][0-9]{0,11}$ ]] || echo "$esik" >"$LEASE_IMLEC" || hata_yaz "imleç yazılamadı"
  else
    kayitlar="$(grep -E '"event": *"db\.transaction\.duration"' <<<"$ham" \
      | grep -E '"label": *"runtime\.lease"')"

    # Satır başına: `time` yoksa ya da satır `}` ile bitmiyorsa kesik (ayrıştırılamaz).
    # `time` eşikten önceyse önceki taramada sayılmıştır: YALNIZ yavaşsa kayan
    # pencere tarihçesine girer, başka hiçbir sayıma girmez. activeMs sayısı
    # `,`/`}` ile kapanmalı (`"activeMs":4` aslında 4500 olabilir). `null` =
    # callback hiç başlamadı. `pencerede`: YENİ bir yavaş kayıtla biten herhangi
    # bir 15 dk'lık pencerede en çok kaç yavaş kayıt var — taramalara bölünen
    # seri de yakalanır, eski seri yeniden alarm üretmez.
    read -r toplam yavas kritik maks baslamayan okunamayan pencerede p2028 < <(awk \
      -v u="$LEASE_UYARI_MS" -v k="$LEASE_KRITIK_MS" -v e="$esik" '
      function ep(s,  y,m,d,H,M,S,mp) {
        y=substr(s,1,4)+0; m=substr(s,6,2)+0; d=substr(s,9,2)+0
        H=substr(s,12,2)+0; M=substr(s,15,2)+0; S=substr(s,18,2)+0
        if (m<=2) y--; mp=(m+9)%12
        return (365*y+int(y/4)-int(y/100)+int(y/400)+int((153*mp+2)/5)+d-1-719468)*86400+H*3600+M*60+S }
      NF == 0 { next }
      {
        if ($0 !~ /}[[:space:]]*$/ || !match($0, /"time": *"[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]/)) { n++; b++; next }
        z = substr($0, RSTART, RLENGTH); sub(/^"time": *"/, "", z); t = ep(z)
        if (t < e) {
          if (match($0, /"activeMs": *[0-9]+ *[,}]/)) {
            v = substr($0, RSTART, RLENGTH); gsub(/[^0-9]/, "", v)
            if (v + 0 >= u) { ny++; yt[ny] = t; yn[ny] = 0 }
          }
          next
        }
        n++
        if ($0 ~ /"outcome": *"failed"/ && $0 ~ /"errorCode": *"P2028"/) p++
        if (match($0, /"activeMs": *[0-9]+ *[,}]/)) {
          v = substr($0, RSTART, RLENGTH); gsub(/[^0-9]/, "", v); v += 0
          if (v >= u) { y++; ny++; yt[ny] = t; yn[ny] = 1 }
          if (v >= k) c++; if (v > m) m = v
        } else if ($0 ~ /"activeMs": *null *[,}]/) nl++
        else b++
      }
      END {
        for (i = 2; i <= ny; i++) {
          x = yt[i]; xn = yn[i]; j = i - 1
          while (j >= 1 && yt[j] > x) { yt[j+1] = yt[j]; yn[j+1] = yn[j]; j-- }
          yt[j+1] = x; yn[j+1] = xn }
        w = 0; lo = 1
        for (i = 1; i <= ny; i++) {
          while (yt[i] - yt[lo] > 900) lo++
          if (yn[i] && i - lo + 1 > w) w = i - lo + 1 }
        print n+0, y+0, c+0, m+0, nl+0, b+0, w+0, p+0 }' <<<"$kayitlar")

    if (( toplam == 0 )); then
      # Yeni kayıt yok (worker boşta): süre hakkında YENİ karar yok.
      case "$onceki_hal" in
        temiz) echo "$simdi" >"$LEASE_IMLEC" || hata_yaz "imleç yazılamadı"; return 0 ;;
        okunamiyor)
          if teslim_et "Agent Sözlük: lease logu yeniden okunuyor" default white_check_mark \
            "Uygulama logu yeniden okunabiliyor; son ${pencere_dk} dk içinde lease kaydı yok."; then
            echo "temiz $simdi" >"$LEASE_DURUM" || hata_yaz "durum yazılamadı"
          fi
          echo "$simdi" >"$LEASE_IMLEC" || hata_yaz "imleç yazılamadı"
          return 0 ;;
        *)
          # Son bilinen kötü hal SÜRER ve durum akışından geçer: değişim yok,
          # ama 6 saatlik hatırlatma kesilmez (Sol, altıncı tur).
          hal="$onceki_hal"
          govde="Son ${pencere_dk} dk içinde yeni lease kaydı yok; son bilinen durum sürüyor: ${onceki_hal}." ;;
      esac
    else
      if (( p2028 > 0 || kritik > 0 )); then hal=kritik
      elif (( pencerede >= LEASE_UYARI_ADET || baslamayan > 0 )); then hal=uyari
      elif (( okunamayan > 0 )); then
        # Ayrıştırılamayan bir satır bile varsa "temiz" demek için kanıt yok; bu
        # ayrı bir haldir ve bildirilir (Sol, dördüncü ve beşinci tur).
        hal=belirsiz
      else hal=temiz
      fi
      govde="Son ${pencere_dk} dk: ${toplam} yeni lease kaydı, en uzun activeMs ${maks} ms (Prisma sınırı 5000).
>= ${LEASE_UYARI_MS} ms: ${yavas} (15 dk içinde en çok ${pencerede}) · >= ${LEASE_KRITIK_MS} ms: ${kritik} · P2028: ${p2028} · başlamayan: ${baslamayan}
Ayrıştırılamayan: ${okunamayan}. Bak: docker compose logs app | grep db.transaction.duration"
    fi
  fi

  case "$hal" in
    kritik)     baslik="Agent Sözlük: lease 5 sn sınırına dayandı"; oncelik=urgent;  etiket=rotating_light ;;
    uyari)      baslik="Agent Sözlük: lease yavaşlıyor";            oncelik=high;    etiket=warning ;;
    okunamiyor) baslik="Agent Sözlük: lease logu okunamıyor";       oncelik=default; etiket=warning ;;
    belirsiz)   baslik="Agent Sözlük: lease kaydı ayrıştırılamıyor"; oncelik=default; etiket=warning ;;
    temiz)      baslik="Agent Sözlük: lease süresi normale döndü";  oncelik=default; etiket=white_check_mark ;;
  esac

  # Her hal DEĞİŞİMİ bildirilir (kritik→uyarı dahil); aynı arıza 6 saatte bir
  # tekrarlanır; temizken tekrar yok. Durum, karar kalıcılaştıysa yazılır.
  if [[ "$hal" != "$onceki_hal" ]] \
     || { [[ "$hal" != temiz ]] && (( simdi - onceki_an > SESSIZLIK_SN )); }; then
    if teslim_et "$baslik" "$oncelik" "$etiket" "$govde"; then
      echo "$hal $simdi" >"$LEASE_DURUM" || hata_yaz "durum yazılamadı"
    else
      # Ne gönderildi ne kuyruğa yazıldı: imleç ilerlemez, sonraki koşu yeniden okur.
      return 0
    fi
  fi
  if (( rc == 0 )); then echo "$simdi" >"$LEASE_IMLEC" || hata_yaz "imleç yazılamadı"; fi
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
