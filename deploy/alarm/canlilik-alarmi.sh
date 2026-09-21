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
# `--kesim-oncesi` bildirim göndermez; ntfy konusu yalnız diğer kiplerde zorunlu.
if [[ "${1:-}" == "--kesim-oncesi" ]]; then KONU="${ALARM_NTFY_KONU:-}"; KESIM=1
else KONU="${ALARM_NTFY_KONU:?ALARM_NTFY_KONU gerekli}"; KESIM=0; fi
SUNUCU="${ALARM_NTFY_SUNUCU:-https://ntfy.sh}"
DURUM="${ALARM_DURUM_DOSYASI:-/var/lib/agent-sozluk-alarm/durum}"
LEASE_UYARI_MS="${ALARM_LEASE_UYARI_MS:-2500}"
LEASE_KRITIK_MS="${ALARM_LEASE_KRITIK_MS:-4000}"
LEASE_UYARI_ADET="${ALARM_LEASE_UYARI_ADET:-3}"
LEASE_ILK_PENCERE_SN=900     # imleç yokken (ilk koşu) geriye bakılan süre
LEASE_ORTUSME_SN=60          # docker tarafında imleçten bu kadar geriden oku
LEASE_ZAMAN_ASIMI="${ALARM_LEASE_ZAMAN_ASIMI:-50}"       # sn; log 25 + kimlik 5+5 + gönderim 10
CANLILIK_ZAMAN_ASIMI="${ALARM_CANLILIK_ZAMAN_ASIMI:-30}" # sn; docker/exec takılırsa
# En kötü duvar saati: canlılık 30+5 + curl 20 + lease 50+5 = 110 sn; birimin
# TimeoutStartSec=2min sınırının altında.
LEASE_DURUM="${DURUM}-lease"
LEASE_IMLEC="${DURUM}-lease-imlec"
LEASE_MAKBUZ="${DURUM}-lease-kesim"
LEASE_KILIT="${DURUM}-lease.kilit"
LEASE_YAVAS="${DURUM}-lease-yavas"
APP=/opt/agent-sozluk/app
RUNTIME=/opt/agent-sozluk/runtime

mkdir -p "$(dirname "$DURUM")" 2>/dev/null || true

# Başarısızsa sıfır dışı döner; çağıran durumu YALNIZ başarıda yazar, yoksa
# gönderilemeyen bir alarm "gönderildi" sayılıp 6 saat bastırılırdı.
bildir() { # $1 baslik, $2 oncelik, $3 etiket, $4 govde, $5 azami sn (20)
  curl -sS --fail -m "${5:-20}" \
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
# Tasarım (Sol ve Astra, 21 Eylül; sekiz tur):
#  - TARAMA yarı açık aralıktır: [imleç, şimdi), milisaniye hassasiyetinde.
#    Tarama sırasında gelen kayıt bir sonrakine kalır; hiçbir kayıt iki kez
#    sayılmaz. Docker'dan 60 sn örtüşme + 15 dk tarihçe okunur; imleçten eski
#    kayıtlar YALNIZ kayan 15 dk'lık uyarı penceresinin tarihçesidir.
#  - İMLEÇ her başarılı log okumasından VE durumun kalıcılaşmasından sonra
#    `şimdi`ye ilerler; aksi hâlde ilerlemez. Geçersiz ya da gelecekteyse hemen
#    düzeltilip yazılır. Geriye sınır yoktur: uzun log körlüğünden sonra imleçten
#    itibaren ne varsa okunur (json-file rotasyonu 10 MB × 5; ondan eskisi zaten
#    yoktur).
#  - TESLİM kuyruksuz: durum tek satırdır — `hal an teslim en_kotu olcum`. Karar
#    değişince `teslim=0` olur; her koşu teslim edilmemiş kararı EN FAZLA BİR
#    kez (10 sn) dener. Gönderilemeden yeni karar gelirse arada görülen en ağır
#    hal (`en_kotu`) saklanır ve sonraki bildirime eklenir: "arada kritik
#    yaşandı, şimdi düzeldi". Hiçbir karar silinmez; sıra/sınır sorunu yoktur.
#    `olcum` son GERÇEK ölçümün halidir: log okunamayıp sonra kayıtsız düzelirse
#    "temiz" varsayılmaz, son ölçülen hal geri gelir.
#  - KONTEYNER DEĞİŞİMİ (Sol, onuncu ve on birinci tur): dağıtım
#    `--force-recreate app` ile eski konteyneri ve logunu siler. İmleç, taranan
#    konteynerin KİMLİĞİNİ de tutar. Dağıtım, worker'ı durdurduktan sonra aday
#    sürümün bu betiğini `--kesim-oncesi` ile koşturur: yalnız lease taranır,
#    bildirim gönderilmez (karar teslim bekler, sonraki timer koşusu gönderir),
#    başarıda "bu konteyner şu ana kadar tamamen tarandı" MAKBUZU yazılır ve
#    çıkış kodu sonucu söyler. Konteyner değişmişse ve eski konteyner için
#    imleçle birebir eşleşen makbuz yoksa sonuç en az `belirsiz` olur.
#    Durum yazılamazsa imleç ilerlemez ve aynı bildirim her koşuda yeniden
#    gidebilir (kayıptansa tekrar; journal'a hata düşer).

hata_yaz() { echo "agent-sozluk-alarm: $*" >&2; }

iso() { date -u -d "@$1" +%Y-%m-%dT%H:%M:%SZ; }

agirlik() { case "$1" in kritik) echo 3 ;; uyari) echo 2 ;; belirsiz|okunamiyor) echo 1 ;; *) echo 0 ;; esac; }

# Dosyaya atomik yazar (geçici dosya + mv); başarısızsa journal'a yazar.
atomik_yaz() { # $1 dosya, $2 içerik
  local gecici="$1.yeni.$$"
  # -T: hedef bir dizinse içine taşıyıp "başarılı" dönmesin.
  if printf '%s\n' "$2" >"$gecici" 2>/dev/null && mv -fT "$gecici" "$1" 2>/dev/null; then
    return 0
  fi
  rm -f "$gecici" 2>/dev/null
  hata_yaz "$(basename "$1") yazılamadı"
  return 1
}

# Timer ile dağıtımın kesim öncesi taraması aynı durumu okuyup yazar: bütün
# `oku → tara → yaz` bölümü tek kilit altında seri çalışır (Sol, on ikinci tur).
# Timer en fazla 5 sn bekler, alamazsa turu atlar (imleç ilerlemediği için bir
# şey kaybolmaz); kesim taraması 55 sn'ye kadar bekler.
lease_kontrol() {
  local kfd bekle r
  if (( KESIM )); then bekle=55; else bekle=5; fi
  if ! exec {kfd}>>"$LEASE_KILIT"; then
    hata_yaz "lease kilit dosyası açılamadı"
    (( KESIM )) && return 1
    return 0
  fi
  if ! flock -w "$bekle" "$kfd"; then
    hata_yaz "lease kilidi ${bekle} sn içinde alınamadı; bu tur atlandı"
    exec {kfd}>&-
    (( KESIM )) && return 1
    return 0
  fi
  # Kesim taraması eski makbuzu önce siler: başarısız kesim eski makbuzu
  # geçerli bırakmasın (Astra, 22 Eylül).
  if (( KESIM )); then rm -f "$LEASE_MAKBUZ" 2>/dev/null; fi
  lease_kontrol_kilitli
  r=$?
  exec {kfd}>&-
  return "$r"
}

lease_kontrol_kilitli() {
  local ham rc kayitlar toplam yavas kritik maks baslamayan okunamayan pencerede p2028
  local simdi simdi_ms imlec imlec_kimlik imlec_gecerli=0 esik baslangic pencere_dk yeni_hal govde
  local kimlik makbuz_kimlik makbuz_ms bosluk="" basari=0 gecmis yeni_yavas="" yavas_yaz="" tohum=0
  local islenemedi=0 gdosya=""
  local olusma olusma_ms
  local hal an teslim en_kotu olcum baslik oncelik etiket durum_yazildi
  # ALARM_SIMDI (sn) yalnız testler içindir; üretimde tanımlı değildir.
  if [[ -n "${ALARM_SIMDI:-}" ]]; then simdi_ms=$(( ALARM_SIMDI * 1000 )); else simdi_ms="$(date +%s%3N)"; fi
  simdi=$(( simdi_ms / 1000 ))

  # Durum: hal an teslim en_kotu olcum. Bozuk ya da tanınmayan içerik güvenli varsayılan.
  read -r hal an teslim en_kotu olcum 2>/dev/null <"$LEASE_DURUM" || true
  [[ "${hal:-}" =~ ^(temiz|uyari|kritik|okunamiyor|belirsiz)$ ]] || hal=temiz
  [[ "${an:-}" =~ ^(0|[1-9][0-9]{0,11})$ ]] && (( an <= simdi )) || an=0
  [[ "${teslim:-}" =~ ^[01]$ ]] || teslim=1
  [[ "${en_kotu:-}" =~ ^(temiz|uyari|kritik|okunamiyor|belirsiz)$ ]] || en_kotu=temiz
  if [[ ! "${olcum:-}" =~ ^(temiz|uyari|kritik|belirsiz)$ ]]; then
    # Eski biçim ya da bozuk: son ölçüm bilinmiyor; mevcut hal ölçümse onu al.
    if [[ "$hal" =~ ^(temiz|uyari|kritik|belirsiz)$ ]]; then olcum="$hal"; else olcum=temiz; fi
  fi

  # İmleç (ms). Geçersiz/gelecekteyse düzeltilir ve HEMEN yazılır: log bu koşuda
  # okunamasa da sonraki koşu buradan başlar (Sol, sekizinci tur).
  imlec=""; imlec_kimlik=""
  read -r imlec imlec_kimlik 2>/dev/null <"$LEASE_IMLEC" || true
  [[ "$imlec_kimlik" =~ ^[0-9a-f]{12,64}$ ]] || imlec_kimlik=""
  if [[ "$imlec" =~ ^[1-9][0-9]{0,15}$ ]] && (( imlec <= simdi_ms )); then
    esik="$imlec"; imlec_gecerli=1
  else
    [[ -n "$imlec" ]] && hata_yaz "imleç geçersiz ya da gelecekte ($imlec); son 15 dk taranıyor"
    esik=$(( simdi_ms - LEASE_ILK_PENCERE_SN * 1000 ))
    atomik_yaz "$LEASE_IMLEC" "$esik" || true
  fi

  # Taranacak konteynerin kimliği: imleçle birlikte saklanır.
  kimlik="$(timeout 5 docker compose --env-file "$APP/.env" -f "$RUNTIME/compose.production.yaml" \
    ps -q app 2>/dev/null | head -1)"
  [[ "$kimlik" =~ ^[0-9a-f]{12,64}$ ]] || kimlik=""
  baslangic=$(( esik / 1000 - LEASE_ORTUSME_SN ))

  # Kayan 15 dk'lık uyarı penceresinin tarihçesi DİSKTEN gelir, logdan değil:
  # konteyner değişince eski log gider ama tarihçe kalmalı (Astra, 22 Eylül).
  # Son 15 dk'nın yavaş kayıt zamanları (ms, virgülle).
  gecmis=""
  if [[ -e "$LEASE_YAVAS" ]]; then
    read -r gecmis 2>/dev/null <"$LEASE_YAVAS" || true
    [[ "$gecmis" =~ ^[0-9,]*$ ]] || gecmis=""
    # awk tarihçeyi DOSYADAN okur: argüman boyu sınırına takılmaz (Sol).
    gdosya="$LEASE_YAVAS"
  else
    # Tarihçe dosyası yok (ilk kurulum ya da silinmiş): son 15 dk'yı logdan
    # TOHUMLA — eski sürümün işlediği yavaş kayıtlar pencereden düşmesin (Sol).
    tohum=1
    baslangic=$(( baslangic - 900 ))
  fi
  pencere_dk=$(( (simdi_ms - esik + 59999) / 60000 ))

  ham="$(timeout 25 docker compose --env-file "$APP/.env" -f "$RUNTIME/compose.production.yaml" \
    logs --no-log-prefix --since "$(iso "$baslangic")" app 2>/dev/null)"
  rc=$?
  govde=""

  if (( rc != 0 )); then
    yeni_hal=okunamiyor
    govde="Uygulama logu okunamadı (çıkış $rc); lease süresi izlenemiyor.
Canlılık kontrolü bundan bağımsız çalışıyor."
  else
    kayitlar="$(grep -E '"event": *"db\.transaction\.duration"' <<<"$ham" \
      | grep -E '"label": *"runtime\.lease"')"

    # Satır başına: `time` yoksa ya da satır `}` ile bitmiyorsa ayrıştırılamaz.
    # Zaman ms'dir. [e, s) dışındaki kayıt sayılmaz; e'den önceki YALNIZ yavaşsa
    # kayan pencere tarihçesine girer. activeMs sayısı `,`/`}` ile kapanmalı;
    # `null` = callback hiç başlamadı. `pencerede`: YENİ bir yavaş kayıtla biten
    # herhangi bir 15 dk'lık pencerede en çok kaç yavaş kayıt var.
    read -r toplam yavas kritik maks baslamayan okunamayan pencerede p2028 yeni_yavas < <(awk \
      -v u="$LEASE_UYARI_MS" -v k="$LEASE_KRITIK_MS" -v e="$esik" -v s="$simdi_ms" -v gdosya="$gdosya" -v tohum="$tohum" '
      function ep(z,  y,m,d,H,M,S,mp,ms) {
        y=substr(z,1,4)+0; m=substr(z,6,2)+0; d=substr(z,9,2)+0
        H=substr(z,12,2)+0; M=substr(z,15,2)+0; S=substr(z,18,2)+0
        ms = 0
        if (substr(z,20,1) == ".") ms = substr(substr(z,21) "000", 1, 3) + 0
        if (m<=2) y--; mp=(m+9)%12
        return ((365*y+int(y/4)-int(y/100)+int(y/400)+int((153*mp+2)/5)+d-1-719468)*86400+H*3600+M*60+S)*1000+ms }
      BEGIN {
        # Diskteki tarihçe: imleçten önceki ve İMLEÇTEN 15 dakika geriye kadar
        # olanlar. Sınır "şimdi" değil imleçtir: taranan en eski yeni kaydın
        # penceresi imleçten 15 dakika geriye uzanır (Astra: 15 dakikalık timer
        # aralığında şimdi eksi 15 dakika sınırı önceki taramanın yavaşlarını
        # düşürüyordu).
        if (gdosya != "") {
          while ((getline satir < gdosya) > 0) {
            ng = split(satir, gg, ",")
            for (i = 1; i <= ng; i++)
              if (gg[i] ~ /^[0-9]+$/ && gg[i] + 0 < e && gg[i] + 0 >= e - 900000) { ny++; yt[ny] = gg[i] + 0; yn[ny] = 0 }
          }
          close(gdosya)
        }
      }
      NF == 0 { next }
      {
        if ($0 !~ /}[[:space:]]*$/ || !match($0, /"time": *"[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9](\.[0-9]+)?/)) { n++; b++; next }
        z = substr($0, RSTART, RLENGTH); sub(/^"time": *"/, "", z); t = ep(z)
        if (t >= s) next
        if (t < e) {
          # Yalnız tohumlamada: imleçten eski ama son 15 dakikadaki yavaş kayıt tarihçedir.
          if (tohum && t >= e - 900000 && match($0, /"activeMs": *[0-9]+ *[,}]/)) {
            v = substr($0, RSTART, RLENGTH); gsub(/[^0-9]/, "", v)
            if (v + 0 >= u) { ny++; yt[ny] = t; yn[ny] = 0; yy = yy (yy == "" ? "" : ",") t }
          }
          next
        }
        n++
        if ($0 ~ /"outcome": *"failed"/ && $0 ~ /"errorCode": *"P2028"/) p++
        if (match($0, /"activeMs": *[0-9]+ *[,}]/)) {
          v = substr($0, RSTART, RLENGTH); gsub(/[^0-9]/, "", v); v += 0
          if (v >= u) { y++; ny++; yt[ny] = t; yn[ny] = 1; yy = yy (yy == "" ? "" : ",") t }
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
          while (yt[i] - yt[lo] > 900000) lo++
          if (yn[i] && i - lo + 1 > w) w = i - lo + 1 }
        print n+0, y+0, c+0, m+0, nl+0, b+0, w+0, p+0, (yy == "" ? "-" : yy) }' <<<"$kayitlar")
    # Ayrıştırma çıktısı sayısal değilse (awk hatası) sonuç "kayıt yok" SAYILMAZ:
    # işlenemedi → okunamıyor gibi; imleç ilerlemez (Sol, on yedinci tur).
    [[ "${toplam:-}" =~ ^[0-9]+$ && "${pencerede:-}" =~ ^[0-9]+$ && "${p2028:-}" =~ ^[0-9]+$ ]] || islenemedi=1
    [[ "$yeni_yavas" == "-" ]] && yeni_yavas=""
    # Yazılacak tarihçe SINIRLI iki aralıktır: [imleç−15 dk, imleç) — imleç
    # ilerlemezse sonraki tarama bunu ister — ve [şimdi−15 dk, şimdi) — ilerlerse.
    # Boyut gecikmeden bağımsızdır (Sol: sınırsız liste argüman boyunu aşıyordu).
    yavas_yaz="$(tr ',' '\n' <<<"${gecmis},${yeni_yavas}" | awk -v e="$esik" -v s="$simdi_ms" '
      /^[0-9]+$/ && (($1 + 0 >= e - 900000 && $1 + 0 < e) || ($1 + 0 >= s - 900000 && $1 + 0 < s)) && !gorulen[$1]++ { o = o (o == "" ? "" : ",") $1 }
      END { print o }')" || islenemedi=1

    if (( islenemedi )); then
      hata_yaz "lease kayıtları işlenemedi (ayrıştırma hatası)"
      rc=98
      yeni_hal=okunamiyor
      govde="Lease kayıtları okundu ama işlenemedi (ayrıştırma hatası); lease süresi izlenemiyor.
Canlılık kontrolü bundan bağımsız çalışıyor."
    elif (( toplam == 0 )); then
      # Yeni kayıt yok (worker boşta): süre hakkında YENİ karar yok; son hal sürer.
      # Tek istisna: log yeniden okunabiliyor, `okunamiyor` kapanır — ama "temiz"
      # varsayılmaz, SON ÖLÇÜLEN hal geri gelir (Sol, dokuzuncu tur).
      if [[ "$hal" == "okunamiyor" ]]; then
        yeni_hal="$olcum"
        govde="Uygulama logu yeniden okunabiliyor; son ${pencere_dk} dk içinde yeni lease kaydı yok. Son ölçülen durum: ${olcum}."
      else
        yeni_hal="$hal"
        govde="Son ${pencere_dk} dk içinde yeni lease kaydı yok; son bilinen durum sürüyor: ${hal}."
      fi
    else
      if (( p2028 > 0 || kritik > 0 )); then yeni_hal=kritik
      elif (( pencerede >= LEASE_UYARI_ADET || baslamayan > 0 )); then yeni_hal=uyari
      elif (( okunamayan > 0 )); then yeni_hal=belirsiz  # "temiz" demek için kanıt yok
      else yeni_hal=temiz
      fi
      olcum="$yeni_hal"
      govde="Son ${pencere_dk} dk: ${toplam} yeni lease kaydı, en uzun activeMs ${maks} ms (Prisma sınırı 5000).
>= ${LEASE_UYARI_MS} ms: ${yavas} (15 dk içinde en çok ${pencerede}) · >= ${LEASE_KRITIK_MS} ms: ${kritik} · P2028: ${p2028} · başlamayan: ${baslamayan}
Ayrıştırılamayan: ${okunamayan}. Bak: docker compose logs app | grep db.transaction.duration"
    fi

    # Konteyner son taramadan beri değiştiyse eski konteynerin logu (ve belki
    # bir olay) gitmiştir — o konteyner için imleçle eşleşen kesim makbuzu yoksa.
    # İmleçte kimlik yoksa (ilk koşu ya da eski biçim) karşılaştırma yapılamaz.
    if [[ -z "$kimlik" ]]; then
      bosluk="app konteynerinin kimliği okunamadı; taramanın bütünlüğü doğrulanamadı."
    elif (( imlec_gecerli )) && [[ -n "$imlec_kimlik" && "$kimlik" != "$imlec_kimlik" ]]; then
      makbuz_kimlik=""; makbuz_ms=""
      read -r makbuz_kimlik makbuz_ms 2>/dev/null <"$LEASE_MAKBUZ" || true
      # Makbuz: eski konteyner worker durduktan sonra `makbuz_ms`e kadar tamamen
      # tarandı. Geçerli olması için: eski konteynerin son taraması (imleç) ondan
      # eski değil VE yeni konteyner makbuzdan sonra, en geç 10 dk içinde yaratıldı
      # (dağıtım yeniden yaratmayı taramadan saniyeler sonra yapar). İptal edilmiş
      # bir dağıtımın makbuzu sonraki bir değişimi örtemez (Sol, on dördüncü tur).
      olusma_ms=""
      olusma="$(timeout 5 docker inspect -f '{{.Created}}' "$kimlik" 2>/dev/null)"
      [[ -n "$olusma" ]] && olusma_ms="$(date -u -d "$olusma" +%s%3N 2>/dev/null)"
      if [[ "$makbuz_kimlik" != "$imlec_kimlik" || ! "$makbuz_ms" =~ ^[1-9][0-9]{0,15}$ ]] \
         || [[ ! "$olusma_ms" =~ ^[1-9][0-9]*$ ]] \
         || (( makbuz_ms > imlec || olusma_ms < makbuz_ms || olusma_ms - makbuz_ms > 600000 )); then
        bosluk="app konteyneri son taramadan sonra değişmiş (${imlec_kimlik:0:12} → ${kimlik:0:12}) ve eski konteyner kesimden önce taranmamış; $(iso $(( esik / 1000 ))) sonrasındaki eski log kayboldu."
      fi
    fi
    if [[ -n "$bosluk" ]]; then
      (( $(agirlik "$yeni_hal") >= 1 )) || yeni_hal=belirsiz
      govde="${bosluk}
${govde}"
    fi
  fi

  # Karar: değişim ya da 6 saatlik hatırlatma bildirimi GEREKTİRİR (teslim=0).
  # Teslim edilmemiş eski karar varsa onun ağırlığı en_kotu'da korunur.
  if [[ "$yeni_hal" != "$hal" ]]; then
    # Teslim edilmemiş eski karar kaybolmasın: saklanan halden ağırsa saklanır.
    # (Teslim edilmeden üst üste gelen AYNI ağırlıkta iki ara karardan yalnız
    # ilki anılır; ikisi de bilgi düzeyidir.)
    if (( teslim == 0 )) && (( $(agirlik "$hal") > $(agirlik "$en_kotu") )); then
      en_kotu="$hal"
    fi
    hal="$yeni_hal"; teslim=0; an="$simdi"
  elif [[ "$hal" != temiz ]] && (( teslim == 1 )) && (( simdi - an > SESSIZLIK_SN )); then
    teslim=0
  fi

  # Kesim öncesi kip bildirim göndermez: karar teslim bekler, timer gönderir.
  if (( teslim == 0 && ! KESIM )); then
    case "$hal" in
      kritik)     baslik="Agent Sözlük: lease 5 sn sınırına dayandı"; oncelik=urgent;  etiket=rotating_light ;;
      uyari)      baslik="Agent Sözlük: lease yavaşlıyor";            oncelik=high;    etiket=warning ;;
      okunamiyor) baslik="Agent Sözlük: lease logu okunamıyor";       oncelik=default; etiket=warning ;;
      belirsiz)   baslik="Agent Sözlük: lease kaydı ayrıştırılamıyor"; oncelik=default; etiket=warning ;;
      temiz)      baslik="Agent Sözlük: lease süresi normale döndü";  oncelik=default; etiket=white_check_mark ;;
    esac
    [[ -n "$govde" ]] || govde="Durum: ${hal} (tespit $(date -u -d "@$an" '+%H:%M UTC'))."
    if [[ "$en_kotu" != temiz && "$en_kotu" != "$hal" ]] && (( $(agirlik "$en_kotu") > $(agirlik "$hal") )); then
      # Arada gönderilemeyen daha ağır bir hal vardı: kaybolmasın, öne çıksın.
      baslik="Agent Sözlük: arada lease ${en_kotu} yaşandı (şimdi: ${hal})"
      (( $(agirlik "$en_kotu") >= 3 )) && { oncelik=urgent; etiket=rotating_light; }
      (( $(agirlik "$en_kotu") == 2 )) && { oncelik=high; etiket=warning; }
      govde="Gönderilemeyen önceki bildirim: ${en_kotu}.
${govde}"
    elif [[ "$en_kotu" != temiz && "$en_kotu" != "$hal" ]]; then
      # Eşit ya da daha hafif ama FARKLI bir karar gönderilemedi: gövdede söylenir.
      govde="Gönderilemeyen önceki bildirim: ${en_kotu}.
${govde}"
    fi
    if bildir "$baslik" "$oncelik" "$etiket" "$govde" 10; then
      teslim=1; en_kotu=temiz; an="$simdi"
    fi
  fi
  # İmleç YALNIZ durum kalıcılaştıysa ilerler: yoksa bulunan karar hem durumda
  # hem logda kaybolurdu (Sol, dokuzuncu tur).
  if atomik_yaz "$LEASE_DURUM" "$hal $an $teslim $en_kotu $olcum"; then
    # Kimlik bilinmiyorsa imleç ilerlemez: sonraki koşu konteyner değişimini
    # ancak kimlikli bir imleçle doğrulayabilir.
    # Sıra: durum → tarihçe → imleç. Tarihçe yazılamazsa imleç ilerlemez: yeni
    # yavaş kayıtlar sonraki taramada yeniden okunur (Sol, on dördüncü tur).
    if (( rc == 0 )) && [[ -n "$kimlik" ]] \
       && atomik_yaz "$LEASE_YAVAS" "$yavas_yaz" \
       && atomik_yaz "$LEASE_IMLEC" "$simdi_ms $kimlik"; then
      basari=1
      # Yeni lease kaydı görüldüyse worker çalışıyor: eski kesim makbuzu artık
      # bir kesimi kanıtlamaz (Astra, 22 Eylül). Konteyner kontrolü bu koşuda
      # makbuzu zaten kullandı.
      if (( ! KESIM && ${toplam:-0} > 0 )); then rm -f "$LEASE_MAKBUZ" 2>/dev/null; fi
    fi
  fi
  # Makbuz: bu konteyner `simdi_ms`e kadar eksiksiz tarandı ve karar kalıcı.
  if (( KESIM )); then
    (( basari )) && atomik_yaz "$LEASE_MAKBUZ" "$kimlik $simdi_ms" && return 0
    return 1
  fi
  return 0
}

if [[ "${1:-}" == "--yalniz-lease" ]]; then
  lease_kontrol
  exit 0
fi
if (( KESIM )); then
  # Dağıtım betiği çağırır; sonucu çıkış koduyla söyler (0 = makbuz yazıldı).
  lease_kontrol
  exit $?
fi

canlilik_kontrol
kod=$?
timeout --kill-after=5 "$LEASE_ZAMAN_ASIMI" "$BASH" "$0" --yalniz-lease || true
exit "$kod"
