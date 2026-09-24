#!/usr/bin/env bash
# Agent Sözlük gecelik sunucu dışı yedek — 24 Eylül 2026 (B9).
#
# NEREDE ÇALIŞIR: kişisel operatör sunucusunda, kullanıcı systemd zamanlayıcısıyla
# (`agentsozluk-yedek.timer`). Üretime YALNIZ yedek anahtarıyla bağlanır; o anahtarın
# üretimdeki zorunlu komutu `uretim-yedek-komutu.sh`'tir, başka bir şey çalıştıramaz.
#
# KABUL: çıkış 0, stderr'de SNAPSHOT_OK/DUMP_DONE/META_DONE, en az 40 tablo satırı ve
# `pg_restore --list` geçmeli. Ancak o zaman geçici dosya kalıcı adına taşınır. Son
# ${KEEP} kopya kalır, eskiler silinir. Başarısızlıkta ntfy bildirimi denenir; kısmi dosya
# silinir, önceki kopyalara dokunulmaz.
set -euo pipefail
umask 077
DIR="${AGENTSOZLUK_BACKUP_DIR:-$HOME/agentsozluk-backups}"
KEEP="${AGENTSOZLUK_BACKUP_KEEP:-7}"
KEY="${AGENTSOZLUK_BACKUP_KEY:-$HOME/.ssh/agentsozluk_backup}"
KNOWN_HOSTS="${AGENTSOZLUK_KNOWN_HOSTS:-$HOME/.ssh/agentsozluk_known_hosts}"
PG_RESTORE="${AGENTSOZLUK_PG_RESTORE:-$HOME/.local/pgclient/bin/pg_restore}"
HOST=deploy@46.225.20.177
MIN_FREE_BYTES="${AGENTSOZLUK_BACKUP_MIN_FREE_BYTES:-5368709120}"

fail() {
  echo "YEDEK_FAIL code=$1" >&2
  rm -f "${tmp_dump:-}" "${tmp_meta:-}"
  "$HOME/ping.sh" "Agent Sözlük yedek" "Gecelik yedek başarısız: $1" >/dev/null 2>&1 || true
  exit 1
}

[[ "$KEEP" =~ ^[1-9][0-9]?$ ]] || fail KEEP_INVALID
[[ "$MIN_FREE_BYTES" =~ ^[0-9]+$ ]] || fail MIN_FREE_INVALID
install -d -m 0700 "$DIR"
free=$(df -Pk "$DIR" | awk 'NR == 2 { printf "%.0f", $4 * 1024 }')
[[ "$free" =~ ^[0-9]+$ ]] && ((free >= MIN_FREE_BYTES)) || fail DISK_LOW

ts=$(date -u +%Y%m%dT%H%M%SZ)
tmp_dump="$DIR/.agent-sozluk-$ts.dump.partial"
tmp_meta="$DIR/.agent-sozluk-$ts.meta.partial"
timeout 3600 ssh -i "$KEY" -o IdentitiesOnly=yes -o IdentityAgent=none \
  -o "UserKnownHostsFile=$KNOWN_HOSTS" -o StrictHostKeyChecking=yes -o BatchMode=yes \
  "$HOST" yedek </dev/null >"$tmp_dump" 2>"$tmp_meta" || fail SSH_OR_DUMP

for marker in SNAPSHOT_OK DUMP_DONE META_DONE; do
  grep -qx "$marker" "$tmp_meta" || fail "MARKER_MISSING_$marker"
done
tables=$(grep -c '^table|' "$tmp_meta" || true)
((tables >= 40)) || fail TABLES_TOO_FEW
test -s "$tmp_dump" || fail DUMP_EMPTY
if test -x "$PG_RESTORE"; then
  "$PG_RESTORE" --list "$tmp_dump" >/dev/null 2>&1 || fail ARCHIVE_UNREADABLE
else
  fail PG_RESTORE_MISSING
fi

final="$DIR/agent-sozluk-$ts.dump"
mv "$tmp_meta" "$DIR/agent-sozluk-$ts.meta"
sha256sum "$tmp_dump" | sed "s#$tmp_dump#$final#" >"$final.sha256"
mv "$tmp_dump" "$final"

# Yalnız bu betiğin adlandırdığı tam kopyalar döndürülür; en yenisi hiç silinmez.
mapfile -t dumps < <(find "$DIR" -maxdepth 1 -type f -name 'agent-sozluk-[0-9]*T[0-9]*Z.dump' | sort)
excess=$((${#dumps[@]} - KEEP))
for ((i = 0; i < excess; i++)); do
  old="${dumps[$i]}"
  rm -f "$old" "$old.sha256" "${old%.dump}.meta"
done
echo "YEDEK_OK file=$(basename "$final") bytes=$(stat -c %s "$final") tables=$tables kept=$((${#dumps[@]} - (excess > 0 ? excess : 0)))"
