#!/usr/bin/env bash
# Agent Sözlük gecelik sunucu dışı yedek — 24 Eylül 2026 (B9).
#
# NEREDE ÇALIŞIR: kişisel operatör sunucusunda, kullanıcı systemd zamanlayıcısıyla
# (`agentsozluk-yedek.timer`). Üretime YALNIZ yedek anahtarıyla bağlanır; o anahtarın
# üretimdeki zorunlu komutu `uretim-yedek-komutu.sh`'tir, başka bir şey çalıştıramaz.
#
# ÇIKIŞ: 0 = yerel + Drive doğrulandı; 3 = yalnız yerel (Drive yok); 1 = başarısız.
# KABUL: stderr'de SNAPSHOT_OK/DUMP_DONE/META_DONE, en az 40 tablo satırı ve
# `pg_restore --list` ve bütün veri bloklarının decode kontrolü geçmeli. Ancak o zaman
# geçici dosya kalıcı adına yayımlanır. (KEEP artık kullanılmıyor; aşağıdaki YEREL KOPYA YOK
# bölümüne bakın.) Decode SQL'i DB'ye uygulamaz; tam geri yükleme provası
# runbook'taki elle, periyodik adımdır.
#
# YEREL KOPYA YOK (Gökhan onayı, 21 Ekim 2026: "Olur"; operatör diski %93 dolunca 21 Ekim
# yedeği DISK_LOW ile alınamadı). Yedek yalnız doğrulama için geçici olarak buraya iner; Drive
# kopyası yüklenip `rclone check` ile doğrulanınca bu çalışmanın yerel dosyaları silinir ve
# döndürme çalışmaz. Drive doğrulanamazsa yerel kopya kalır, döndürme yapılmaz ve
# çıkış 3 olur. Eski yerel kopyalar bu betikçe silinmez (silmek ayrı onay + 24 saat kuralı).
# Gerekli boş alan yalnız tek dump + decode payıdır: varsayılan eşik 2,5 GiB (dump ~0,9–1,4 GB).
#
# DAYANIKLILIK (Astra, PR #204): tek çalışma kilidi; her çalışmanın kendi benzersiz geçici
# dosyaları; var olan kalıcı yedeğin üzerine yazılmaz; her hata ve TERM/INT tek yakalayıcıdan
# geçer (bildirim denenir, yalnız bu çalışmanın geçici dosyaları silinir); döndürme yalnız
# tam adlandırma biçimine uyan dosyaları seçer ve bu çalışmanın yedeğini asla silmez.
# `set -E` BİLEREK yok: ERR yakalayıcısı alt kabuklara (komut/süreç ikamesi) geçerse orada
# `fail` çalışıp ana betik devam ediyor, hem YEDEK_FAIL hem YEDEK_OK basıp 0 ile çıkıyordu
# (Astra, PR #204 2. tur P2). Alt kabuk hataları ana kabukta açıkça ele alınır.
set -euo pipefail
umask 077
DIR="${AGENTSOZLUK_BACKUP_DIR:-$HOME/agentsozluk-backups}"
KEEP="${AGENTSOZLUK_BACKUP_KEEP:-3}"
KEY="${AGENTSOZLUK_BACKUP_KEY:-$HOME/.ssh/agentsozluk_backup}"
KNOWN_HOSTS="${AGENTSOZLUK_KNOWN_HOSTS:-$HOME/.ssh/agentsozluk_known_hosts}"
PG_RESTORE="${AGENTSOZLUK_PG_RESTORE:-$HOME/.local/pgclient/bin/pg_restore}"
MIN_FREE_BYTES="${AGENTSOZLUK_BACKUP_MIN_FREE_BYTES:-2684354560}"
UPLOAD_TIMEOUT="${AGENTSOZLUK_BACKUP_UPLOAD_TIMEOUT_SEC:-2700}"
DRIVE_CHUNK_SIZE="${AGENTSOZLUK_BACKUP_DRIVE_CHUNK_SIZE:-32M}"
NOTIFY="${AGENTSOZLUK_BACKUP_NOTIFY:-1}"
# Üretim hedefi (`kullanıcı@adres`) depoda tutulmaz: depo herkese açık (17 Ekim 2026). Önce
# ortamdaki AGENTSOZLUK_BACKUP_HOST, yoksa operatörün izlenmeyen ayar dosyasının ilk satırı.
HOST_FILE="${AGENTSOZLUK_BACKUP_HOST_FILE:-$HOME/.config/agentsozluk-yedek/hedef}"
HOST="${AGENTSOZLUK_BACKUP_HOST:-}"
NAME_PATTERN='^agent-sozluk-[0-9]{8}T[0-9]{6}Z\.dump$'

tmp_dump=""
tmp_meta=""
manifest=""
final=""
stage="baslangic"

# Bildirim hatası sessiz kalmaz (17 Ekim 2026): ntfy günlük sınırı (429) uyarıları yutuyordu.
# Hata stderr'e (journal) `YEDEK_NOTIFY_FAIL` olarak düşer ve sıfır dışı döner; çağıran çıkış
# kodunu zaten başarısız seçtiği için bildirim hatası sonucu değiştirmez.
notify() {
  local r=0
  if [[ "$NOTIFY" = 1 ]]; then
    "$HOME/ping.sh" "Agent Sözlük yedek" "$1" >/dev/null || r=$?
    if ((r != 0)); then
      echo "YEDEK_NOTIFY_FAIL exit=$r" >&2
    fi
  fi
  return "$r"
}

fail() {
  trap - ERR INT TERM
  echo "YEDEK_FAIL code=$1" >&2
  rm -f -- "$tmp_dump" "$tmp_meta" "$manifest" 2>/dev/null || true
  # Yayımlama yarıda kaldıysa bu çalışmanın yetim yan dosyaları da gider; başka yedeğe dokunmaz.
  if [[ -n "${final:-}" && ! -e "$final" ]]; then
    rm -f -- "$final.sha256" "${final%.dump}.meta" 2>/dev/null || true
  fi
  notify "Gecelik yedek başarısız: $1" || true
  exit 1
}

trap 'fail "UNEXPECTED_${stage}"' ERR
trap 'fail SIGNAL' INT TERM

stage="ayarlar"
[[ "$NOTIFY" =~ ^[01]$ ]] || { NOTIFY=1; fail NOTIFY_INVALID; }
[[ "$KEEP" =~ ^[1-9][0-9]?$ ]] || fail KEEP_INVALID
[[ "$MIN_FREE_BYTES" =~ ^[0-9]+$ ]] || fail MIN_FREE_INVALID
[[ "$UPLOAD_TIMEOUT" =~ ^[1-9][0-9]{0,3}$ ]] &&
  ((UPLOAD_TIMEOUT >= 1 && UPLOAD_TIMEOUT <= 3600)) || fail UPLOAD_TIMEOUT_INVALID
[[ "$DRIVE_CHUNK_SIZE" =~ ^(8|16|32|64|128)M$ ]] || fail DRIVE_CHUNK_SIZE_INVALID
if [[ -z "$HOST" && -f "$HOST_FILE" ]]; then
  IFS= read -r HOST <"$HOST_FILE" || [[ -n "$HOST" ]] || fail HOST_FILE_UNREADABLE
fi
[[ -n "$HOST" ]] || fail HOST_UNSET
[[ "$HOST" =~ ^[a-z_][a-z0-9_-]{0,31}@[A-Za-z0-9.:-]{1,253}$ ]] || fail HOST_INVALID
install -d -m 0700 "$DIR" || fail DIR_UNAVAILABLE

stage="kilit"
exec 9>"$DIR/.lock"
flock -n 9 || fail BUSY

stage="disk"
free=$(df -Pk "$DIR" | awk 'NR == 2 { printf "%.0f", $4 * 1024 }') || fail DISK_UNREADABLE
[[ "$free" =~ ^[0-9]+$ ]] && ((free >= MIN_FREE_BYTES)) || fail DISK_LOW

stage="indirme"
ts=$(date -u +%Y%m%dT%H%M%SZ)
final="$DIR/agent-sozluk-$ts.dump"
test ! -e "$final" || fail FINAL_EXISTS
tmp_dump=$(mktemp "$DIR/.agent-sozluk-$ts.dump.XXXXXX")
tmp_meta=$(mktemp "$DIR/.agent-sozluk-$ts.meta.XXXXXX")
timeout 3600 ssh -i "$KEY" -o IdentitiesOnly=yes -o IdentityAgent=none \
  -o "UserKnownHostsFile=$KNOWN_HOSTS" -o StrictHostKeyChecking=yes -o BatchMode=yes \
  "$HOST" yedek </dev/null >"$tmp_dump" 2>"$tmp_meta" || fail SSH_OR_DUMP

stage="dogrulama"
for marker in SNAPSHOT_OK DUMP_DONE META_DONE; do
  grep -qx "$marker" "$tmp_meta" || fail "MARKER_MISSING_$marker"
done
tables=$(grep -c '^table|' "$tmp_meta" || true)
((tables >= 40)) || fail TABLES_TOO_FEW
test -s "$tmp_dump" || fail DUMP_EMPTY
test -x "$PG_RESTORE" || fail PG_RESTORE_MISSING
"$PG_RESTORE" --list "$tmp_dump" >/dev/null 2>&1 || fail ARCHIVE_UNREADABLE
# TOC tek başına codec desteğini/veri bloklarını sınamaz. Aynı restore ikilisiyle
# bütün arşivi çöz; SQL dosyası yaratma veya DB'ye uygulama. Başarısızsa yayımlama/
# retention başlamaz, önceki kopyalar korunur. Büyük/bozuk arşivde sınırsız bekleme yok.
timeout --kill-after=30 600 "$PG_RESTORE" --exit-on-error --file=/dev/null "$tmp_dump" \
  >/dev/null 2>&1 || fail ARCHIVE_DATA_UNREADABLE

# Boyut okuması başarı makbuzunun bir parçası; echo içindeki command substitution
# hata kodunu yutmasın. Yayımlamadan önce doğrula, önceki kopyaları koru.
bytes=$(stat -c %s "$tmp_dump") || fail DUMP_SIZE_UNREADABLE
[[ "$bytes" =~ ^[0-9]+$ ]] && ((bytes > 0)) || fail DUMP_SIZE_INVALID

stage="yayimlama"
# Önce yan dosyalar, en son yedeğin kendisi: yedek görünür olduğunda sağlaması ve özeti hazır.
checksum=$(sha256sum "$tmp_dump" | awk '{print $1}')
[[ "$checksum" =~ ^[0-9a-f]{64}$ ]] || fail CHECKSUM_INVALID
printf '%s  %s\n' "$checksum" "$final" >"$final.sha256"
mv -n -- "$tmp_meta" "${final%.dump}.meta"
test ! -e "$tmp_meta" || fail META_PUBLISH
mv -n -- "$tmp_dump" "$final"
test ! -e "$tmp_dump" || fail DUMP_PUBLISH
tmp_dump=""
tmp_meta=""

# Google Drive ikincil kopyadır. Başarısızlık yerel kabulü geri almaz.
# Ortak Google client_id 2026 kapanışı nedeniyle kişisel client_id gerekebilir.
# Remote kimliği/config burada kopyalanmaz veya loglanmaz; mevcut gdrive kullanılır.
stage="drive"
rclone_bin="${AGENTSOZLUK_RCLONE:-$HOME/.local/bin/rclone}"
drive_target="gdrive:agentic-server-yedekler/agentsozluk-backups"
drive_status="LOCAL_ONLY"
manifest=""
if [[ -x "$rclone_bin" ]] && manifest=$(mktemp "$DIR/.drive-files.XXXXXX") &&
  printf '%s\n' "${final##*/}" "${final##*/}.sha256" "$(basename "${final%.dump}.meta")" >"$manifest"; then
  # Yalnız bu üç dosya; copy/sync-delete yok. Toplam upload bütçesi TimeoutStartSec içinde kalır.
  if timeout --kill-after=15 "$UPLOAD_TIMEOUT" "$rclone_bin" copy "$DIR" "$drive_target" \
    --files-from-raw "$manifest" --transfers 1 --checkers 2 \
    --drive-chunk-size "$DRIVE_CHUNK_SIZE" \
    --retries 1 --low-level-retries 3 --contimeout 30s --timeout 2m; then
    # one-way ve üç dosya filtresi, Drive'daki eski yedekleri silmez/sapma saymaz.
    if timeout --kill-after=15 300 "$rclone_bin" check "$DIR" "$drive_target" \
      --files-from-raw "$manifest" --one-way --checkers 2 \
      --retries 1 --low-level-retries 3 --contimeout 30s --timeout 2m; then
      # Drive aynı adda birden çok nesneye izin verir; rclone mükerreri "ignoring" ile atlayıp
      # doğru kopya üzerinden check geçebilir (Sol 6.1, 21 Ekim, P2). Her ad tam bir kez olmalı;
      # değilse doğrulanmış sayılmaz ve yerel kopya korunur.
      dup_ok=1
      while IFS= read -r want; do
        count=$(timeout --kill-after=15 120 "$rclone_bin" lsf "$drive_target" --files-only \
          --include "/$want" --contimeout 30s --timeout 2m | grep -cxF -- "$want") || count=-1
        [[ "$count" == 1 ]] || { dup_ok=0; echo "DRIVE_FAIL stage=unique name=$want count=$count" >&2; }
      done <"$manifest"
      if ((dup_ok == 1)); then
        drive_status="VERIFIED"
        echo "DRIVE_OK file=${final##*/} files=3 verified=check unique=1"
      else
        drive_status="CHECK_FAILED"
      fi
    else
      drive_exit=$?
      drive_status="CHECK_FAILED"
      echo "DRIVE_FAIL stage=check exit=$drive_exit localBackupAccepted=true" >&2
    fi
  else
    drive_exit=$?
    drive_status="UPLOAD_FAILED"
    echo "DRIVE_FAIL stage=upload exit=$drive_exit localBackupAccepted=true" >&2
  fi
else
  drive_status="SETUP_FAILED"
  echo "DRIVE_FAIL stage=setup localBackupAccepted=true" >&2
fi
# Yerel yedek yayımlandı. Drive yardımcı dosyası hatası başarıyı geçersiz saymaz.
if [[ -n "$manifest" ]]; then
  rm -f -- "$manifest" || echo "DRIVE_FAIL stage=manifest_cleanup localBackupAccepted=true" >&2
fi

# Drive doğrulandıysa yerel kopyaya gerek yok: bu çalışmanın üç dosyası silinir, döndürme
# çalışmaz (yeni yerel kopya eklenmedi, eskilere dokunulmaz). Silme hatası Drive başarısını
# geçersiz kılmaz ama ayrı satırla görünür.
if [[ "$drive_status" == VERIFIED ]]; then
  stage="yerel_temizlik"
  if ! rm -f -- "$final" "$final.sha256" "${final%.dump}.meta"; then
    # Drive kopyası sağlam ama disk boşalmadı: başarı sayılmaz, sağlık denetimi uyarır (Sol P2).
    echo "YEDEK_TEMIZLIK_FAIL file=${final##*/} bytes=$bytes tables=$tables drive=VERIFIED"
    notify "Gecelik yedek Drive'da ama yerel temizlik başarısız (${final##*/})" || true
    exit 3
  fi
  echo "YEDEK_OK file=${final##*/} bytes=$bytes tables=$tables local=deleted drive=VERIFIED"
  exit 0
fi

# Drive doğrulanamadı: yeni yerel kopya kalır; eski yerel kopyalara DOKUNULMAZ (Sol 6.1, 21 Ekim,
# P1: eski döndürme, Drive'da olup olmadığını bilmeden en eski kopyayı silebiliyordu). Disk dolarsa
# sonraki gece DISK_LOW ile görünür; eski kopya silmek ayrı onay + 24 saat kuralı.
echo "YEDEK_OK_YEREL file=${final##*/} bytes=$bytes tables=$tables local=kept drive=$drive_status"
notify "Gecelik yedek yalnız yerelde: Drive kopyası $drive_status (${final##*/})" || true
exit 3
