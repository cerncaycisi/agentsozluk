#!/usr/bin/env bash
#
# Great reset: yalnız ajan bayraklarını boşaltma kaydındaki bakım öncesi değerlerine döndürür.
# Sarmalayıcı başarılı bir bakımdan sonra geri açılışı üç denemede tamamlayamazsa
# (`RESET_FLAGS_RESTORE_PENDING`) bu komut aynı gövdeyle bitirir (Astra #243 2. tur P2; Gökhan,
# 27 Eylül: "elle bir şey açamam, halledin").
#
#   AGENT_SOZLUK_GREAT_RESET_APPROVED=<operationId> \
#     scripts/great-reset-restore-flags.sh <operationId> <aday-sha>
#
# Sınırlar: üretim sürüm kilidini kendisi alır (başka dağıtım sürüyorsa durur) ve yalnız kendi
# sahipliğindeyse bırakır; bayraklar yalnız uzaktaki olumlu kanıtla (dondurma tutucusu yok, bakım
# yok ya da dondurma öncesinde) ve hedef guard'ı doğrulanmış aynı servislerle geri yazılır.
# Bakım, migration, site veya worker'a dokunmaz.
set -Eeuo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
operation="${1:-}"
candidate_sha="${2:-}"
[[ "$operation" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]] || {
  printf 'RESET_FLAGS_FAIL code=INVALID_OPERATION\n' >&2
  exit 90
}
[[ "$candidate_sha" =~ ^[0-9a-f]{40}$ ]] || {
  printf 'RESET_FLAGS_FAIL code=INVALID_SHA\n' >&2
  exit 90
}
test "${AGENT_SOZLUK_GREAT_RESET_APPROVED:-}" = "$operation" || {
  printf 'RESET_FLAGS_FAIL code=EXACT_RESET_APPROVAL_REQUIRED\n' >&2
  exit 90
}
if command -v timeout >/dev/null 2>&1; then
  local_timeout=timeout
elif command -v gtimeout >/dev/null 2>&1; then
  local_timeout=gtimeout
else
  printf 'RESET_FLAGS_FAIL code=TIMEOUT_TOOL_MISSING\n' >&2
  exit 90
fi

# Sarmalayıcıyla birebir aynı hedef (birim testi eşitliği denetler).
expected_ip=46.225.20.177
expected_host=agent-sozluk-prod
expected_fingerprint=SHA256:BVirvnH5qPzzK18ZGLhO90LObtFze38qicLybEwQ5fI
known_hosts=/private/tmp/agent-sozluk-known_hosts
identity=/Users/gokhannihalgul/.ssh/id_ed25519
test "$(dig +short A agentsozluk.com)" = "$expected_ip"
test "$(
  ssh-keygen -F "$expected_ip" -f "$known_hosts" |
    ssh-keygen -lf - -E sha256 |
    awk '$NF == "(ED25519)" {print $2}'
)" = "$expected_fingerprint"
ssh_options=(
  -i "$identity"
  -o IdentitiesOnly=yes
  -o IdentityAgent=none
  -o "UserKnownHostsFile=$known_hosts"
  -o StrictHostKeyChecking=yes
)
lock_dir=/opt/agent-sozluk/runtime/.release-lock
lock_owner="restore-flags-${operation:0:8}-$(date -u +%Y%m%dT%H%M%SZ)-$$"
lock_check="test \"\$(cat $lock_dir/owner 2>/dev/null)\" = '$lock_owner' || exit 97"
# shellcheck disable=SC2016
scope_check='scope_path=$(sed -n "s/^0:://p" /proc/self/cgroup)
   case "$scope_path" in
     "/user.slice/user-$(id -u).slice/session-"*.scope) ;;
     *) printf "RELEASE_WRAPPER_FAIL code=SESSION_SCOPE_UNVERIFIED\n" >&2; exit 98 ;;
   esac
   session_id=${scope_path##*/session-}
   session_id=${session_id%.scope}
   test "$(loginctl show-session "$session_id" -p Scope --value)" = "session-$session_id.scope" || exit 98
   test "$(loginctl show-session "$session_id" -p Name --value)" = deploy || exit 98'
# shellcheck source=scripts/great-reset-flags-remote.sh
source "$root/scripts/great-reset-flags-remote.sh"

"$local_timeout" 60 ssh "${ssh_options[@]}" deploy@"$expected_ip" \
  "set -euo pipefail
   test \"\$(hostname)\" = '$expected_host' || exit 91
   $scope_check
   if ! mkdir -m 0700 '$lock_dir' 2>/dev/null; then
     printf 'RESET_FLAGS_FAIL code=RELEASE_LOCKED owner=%s\\n' \"\$(cat '$lock_dir/owner' 2>/dev/null)\" >&2
     exit 96
   fi
   printf '%s\\n' '$lock_owner' >'$lock_dir/owner'
   chmod 0600 '$lock_dir/owner'"

release_lock() {
  "$local_timeout" 300 ssh "${ssh_options[@]}" deploy@"$expected_ip" \
    "set -euo pipefail
     test \"\$(hostname)\" = '$expected_host' || exit 91
     $scope_check
     $lock_check
     $(reset_flags_writer_idle_guard)
     find '$lock_dir' -xdev -depth -delete" ||
    printf 'RESET_FLAGS_WARN release lock owned by %s kept; writer may still run\n' "$lock_owner" >&2
}

status=0
output="$(
  "$local_timeout" 240 ssh "${ssh_options[@]}" deploy@"$expected_ip" \
    "set -euo pipefail
     test \"\$(hostname)\" = '$expected_host' || exit 91
     $scope_check
     $lock_check
     $(reset_operator_remote_prelude "$candidate_sha")
     $(reset_flags_restore_body "$operation" "$lock_check")"
)" || status=$?
printf '%s\n' "$output"
# Kendi kilidimiz yalnız uzak yazıcının bittiği (süreç kilidi alınabildi) kanıtlanınca bırakılır;
# SSH sonucu belirsiz olsa da yazıcı en çok ~190 sn yaşar (Astra #243 3. tur P1).
release_lock
if ((status != 0)) || ! grep -Eq '^RELEASE_RESET_FLAGS_(RESTORED$|RESTORE_SKIPPED )' <<<"$output"; then
  printf 'RESET_FLAGS_FAIL code=RESET_FLAGS_RESTORE_FAILED flags stay frozen\n' >&2
  exit 97
fi
