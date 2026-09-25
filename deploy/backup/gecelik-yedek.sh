#!/usr/bin/env bash
# Agent Sözlük gecelik sunucu dışı yedek — 24 Eylül 2026 (B9).
#
# NEREDE ÇALIŞIR: kişisel operatör sunucusunda, kullanıcı systemd zamanlayıcısıyla
# (`agentsozluk-yedek.timer`). Üretime YALNIZ yedek anahtarıyla bağlanır; o anahtarın
# üretimdeki zorunlu komutu `uretim-yedek-komutu.sh`'tir, başka bir şey çalıştıramaz.
#
# KABUL: çıkış 0, stderr'de SNAPSHOT_OK/DUMP_DONE/META_DONE, en az 40 tablo satırı ve
# `pg_restore --list` geçmeli. Ancak o zaman geçici dosya kalıcı adına yayımlanır. Son
# ${KEEP} kopya kalır. `--list` yalnız içindekiler listesini okur; tam geri yükleme provası
# runbook'taki elle, periyodik adımdır.
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
KEEP="${AGENTSOZLUK_BACKUP_KEEP:-7}"
KEY="${AGENTSOZLUK_BACKUP_KEY:-$HOME/.ssh/agentsozluk_backup}"
KNOWN_HOSTS="${AGENTSOZLUK_KNOWN_HOSTS:-$HOME/.ssh/agentsozluk_known_hosts}"
PG_RESTORE="${AGENTSOZLUK_PG_RESTORE:-$HOME/.local/pgclient/bin/pg_restore}"
MIN_FREE_BYTES="${AGENTSOZLUK_BACKUP_MIN_FREE_BYTES:-5368709120}"
HOST=deploy@46.225.20.177
NAME_PATTERN='^agent-sozluk-[0-9]{8}T[0-9]{6}Z\.dump$'

tmp_dump=""
tmp_meta=""
final=""
stage="baslangic"

notify() {
  "$HOME/ping.sh" "Agent Sözlük yedek" "$1" >/dev/null 2>&1 || true
}

fail() {
  trap - ERR INT TERM
  echo "YEDEK_FAIL code=$1" >&2
  rm -f -- "$tmp_dump" "$tmp_meta" 2>/dev/null || true
  # Yayımlama yarıda kaldıysa bu çalışmanın yetim yan dosyaları da gider; başka yedeğe dokunmaz.
  if [[ -n "${final:-}" && ! -e "$final" ]]; then
    rm -f -- "$final.sha256" "${final%.dump}.meta" 2>/dev/null || true
  fi
  notify "Gecelik yedek başarısız: $1"
  exit 1
}

trap 'fail "UNEXPECTED_${stage}"' ERR
trap 'fail SIGNAL' INT TERM

stage="ayarlar"
[[ "$KEEP" =~ ^[1-9][0-9]?$ ]] || fail KEEP_INVALID
[[ "$MIN_FREE_BYTES" =~ ^[0-9]+$ ]] || fail MIN_FREE_INVALID
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

stage="yayimlama"
# Önce yan dosyalar, en son yedeğin kendisi: yedek görünür olduğunda sağlaması ve özeti hazır.
checksum=$(sha256sum "$tmp_dump" | awk '{print $1}')
printf '%s  %s\n' "$checksum" "$final" >"$final.sha256"
mv -n -- "$tmp_meta" "${final%.dump}.meta"
test ! -e "$tmp_meta" || fail META_PUBLISH
mv -n -- "$tmp_dump" "$final"
test ! -e "$tmp_dump" || fail DUMP_PUBLISH
tmp_dump=""
tmp_meta=""

stage="dondurme"
# Bu çalışmanın yedeği listeden baştan çıkarılır: saat geri alınsa bile sayım doğru kalır
# ve yeni yedek hiçbir koşulda silinmez (Astra P3).
listing=$(find "$DIR" -maxdepth 1 -type f -name 'agent-sozluk-*.dump' -printf '%f\n') ||
  fail ROTATION_LIST
others=()
while IFS= read -r name; do
  if [[ -n "$name" && "$name" =~ $NAME_PATTERN && "$DIR/$name" != "$final" ]]; then
    others+=("$name")
  fi
done < <(printf '%s\n' "$listing" | sort)
excess=$((${#others[@]} + 1 - KEEP))
removed=0
for ((i = 0; i < excess; i++)); do
  old="$DIR/${others[$i]}"
  rm -f -- "$old" "$old.sha256" "${old%.dump}.meta" || fail ROTATION_DELETE
  removed=$((removed + 1))
done
echo "YEDEK_OK file=$(basename "$final") bytes=$(stat -c %s "$final") tables=$tables kept=$((${#others[@]} + 1 - removed))"
