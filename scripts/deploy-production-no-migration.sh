#!/usr/bin/env bash
set -Eeuo pipefail

candidate_sha=''
execute=0
cleanup=no-cleanup

usage() {
  printf '%s\n' \
    'Usage:' \
    '  AGENT_SOZLUK_PRODUCTION_APPROVED_SHA=<40-char-sha> \' \
    '    pnpm release:production:no-migration -- --sha <40-char-sha> --execute [--cleanup]' \
    '' \
    'Requires explicit user approval for this exact SHA and scope before invocation.'
}

while (($# > 0)); do
  case "$1" in
    --sha)
      candidate_sha="${2:-}"
      shift 2
      ;;
    --execute)
      execute=1
      shift
      ;;
    --cleanup)
      cleanup=cleanup
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      printf 'RELEASE_WRAPPER_FAIL code=UNKNOWN_ARGUMENT\n' >&2
      usage >&2
      exit 90
      ;;
  esac
done

[[ "$candidate_sha" =~ ^[0-9a-f]{40}$ ]] || {
  printf 'RELEASE_WRAPPER_FAIL code=INVALID_SHA\n' >&2
  exit 90
}
test "$execute" = 1 || {
  printf 'RELEASE_WRAPPER_FAIL code=EXECUTE_FLAG_REQUIRED\n' >&2
  exit 90
}
test "${AGENT_SOZLUK_PRODUCTION_APPROVED_SHA:-}" = "$candidate_sha" || {
  printf 'RELEASE_WRAPPER_FAIL code=EXACT_APPROVAL_RECEIPT_REQUIRED\n' >&2
  exit 90
}

root="$(git rev-parse --show-toplevel)"
test "$(git -C "$root" remote get-url origin)" = \
  https://github.com/cerncaycisi/agentsozluk.git
test "$(git -C "$root" rev-parse HEAD)" = "$candidate_sha"
test -z "$(git -C "$root" status --porcelain=v1 --untracked-files=all)"
bash -n "$root/scripts/production-release-remote.sh"

expected_ip=46.225.20.177
expected_host=agent-sozluk-prod
expected_origin=https://github.com/cerncaycisi/agentsozluk.git
expected_fingerprint=SHA256:BVirvnH5qPzzK18ZGLhO90LObtFze38qicLybEwQ5fI
known_hosts=/private/tmp/agent-sozluk-known_hosts
identity=/Users/gokhannihalgul/.ssh/id_ed25519
remote_script="/opt/agent-sozluk/runtime/.operator-release-$candidate_sha.sh"
domain_ipv4="$(dig +short A agentsozluk.com)"
test "$domain_ipv4" = "$expected_ip"
known_host_fingerprint="$(
  ssh-keygen -F "$expected_ip" -f "$known_hosts" |
    ssh-keygen -lf - -E sha256 |
    awk '$NF == "(ED25519)" {print $2}'
)"
test "$known_host_fingerprint" = "$expected_fingerprint"

ssh_options=(
  -i "$identity"
  -o IdentitiesOnly=yes
  -o IdentityAgent=none
  -o "UserKnownHostsFile=$known_hosts"
  -o StrictHostKeyChecking=yes
)

ssh "${ssh_options[@]}" deploy@"$expected_ip" \
  "set -euo pipefail
   test \"\$(hostname)\" = '$expected_host' || exit 91
   test \"\$(git -C /opt/agent-sozluk/app remote get-url origin)\" = '$expected_origin' || exit 92
   test -f /opt/agent-sozluk/runtime/compose.production.yaml || exit 93
   install -m 0700 /dev/stdin '$remote_script'
   bash -n '$remote_script'" \
  <"$root/scripts/production-release-remote.sh"

ssh "${ssh_options[@]}" deploy@"$expected_ip" \
  "set -euo pipefail
   test \"\$(hostname)\" = '$expected_host' || exit 91
   test \"\$(git -C /opt/agent-sozluk/app remote get-url origin)\" = '$expected_origin' || exit 92
   test -f /opt/agent-sozluk/runtime/compose.production.yaml || exit 93
   git -C /opt/agent-sozluk/app fetch --prune origin main
   test \"\$(git -C /opt/agent-sozluk/app rev-parse origin/main)\" = '$candidate_sha'
   git -C /opt/agent-sozluk/app checkout --detach '$candidate_sha'
   test \"\$(git -C /opt/agent-sozluk/app rev-parse HEAD)\" = '$candidate_sha'
   test -z \"\$(git -C /opt/agent-sozluk/app status --porcelain=v1 --untracked-files=all)\""

ssh -tt "${ssh_options[@]}" deploy@"$expected_ip" \
  "set -euo pipefail
   test \"\$(hostname)\" = '$expected_host' || exit 91
   test \"\$(git -C /opt/agent-sozluk/app remote get-url origin)\" = '$expected_origin' || exit 92
   test \"\$(git -C /opt/agent-sozluk/app rev-parse HEAD)\" = '$candidate_sha'
   exec '$remote_script' '$candidate_sha' '$cleanup'"
