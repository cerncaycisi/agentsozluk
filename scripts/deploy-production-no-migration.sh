#!/usr/bin/env bash
set -Eeuo pipefail

report_unexpected_error() {
  local exit_status=$?
  printf 'RELEASE_WRAPPER_FAIL code=UNEXPECTED line=%s status=%s\n' \
    "${BASH_LINENO[0]:-unknown}" "$exit_status" >&2
  exit "$exit_status"
}
trap report_unexpected_error ERR

candidate_sha=''
execute=0
cleanup=no-cleanup
artifact_run=''
build_on_host=0
keep_artifact=0
pause_society_flow=0
artifact_transport=server-fetch
approved_migrations=''

usage() {
  printf '%s\n' \
    'Usage:' \
    '  AGENT_SOZLUK_PRODUCTION_APPROVED_SHA=<40-char-sha> \' \
    '    pnpm release:production:no-migration \' \
    '      --sha <40-char-sha> --artifact-run <run-id> --execute [--cleanup]' \
    '' \
    'A release that adds migrations (additive only, A5) additionally needs the exact approved list:' \
    '  AGENT_SOZLUK_PRODUCTION_APPROVED_MIGRATIONS=<name1,name2> ... --apply-migrations <name1,name2>' \
    '' \
    'The default artifact path passes a short-lived GitHub redirect to the pinned server; the' \
    'artifact never transits the operator Mac. Use --operator-transfer only as an explicit fallback.' \
    '' \
    '--pause-society-flow pauses the society flow (same service and audit as the admin panel)' \
    'from the candidate release before the release script captures settings; resume after' \
    'acceptance with pnpm agent:flow resume. Not available with --build-on-host.' \
    '' \
    'Fallback only when the exact approval explicitly permits a production-host build:' \
    '  ... --sha <40-char-sha> --build-on-host --execute [--cleanup]' \
    '' \
    'Requires explicit user approval for this exact SHA and scope before invocation.'
}

while (($# > 0)); do
  case "$1" in
    --)
      # Some pnpm versions forward the conventional argument separator to the
      # script. Treat that separator as syntax, not as a release argument.
      shift
      ;;
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
    --artifact-run)
      artifact_run="${2:-}"
      shift 2
      ;;
    --build-on-host)
      build_on_host=1
      shift
      ;;
    --apply-migrations)
      approved_migrations="${2:-}"
      shift 2
      ;;
    --keep-artifact)
      keep_artifact=1
      shift
      ;;
    --pause-society-flow)
      pause_society_flow=1
      shift
      ;;
    --server-fetch)
      artifact_transport=server-fetch
      shift
      ;;
    --operator-transfer)
      artifact_transport=operator-transfer
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
if test "$pause_society_flow" = 1 && test "$build_on_host" = 1; then
  printf 'RELEASE_WRAPPER_FAIL code=PAUSE_REQUIRES_ARTIFACT_RELEASE\n' >&2
  exit 90
fi
# Yerel süre sınırlayıcı İLK uzak işlemden önce seçilir: macOS'ta GNU `timeout` yok,
# Homebrew coreutils `gtimeout` verir. Yoksa kilit alınmadan durulur (Astra, #186).
local_timeout=""
if test "$pause_society_flow" = 1; then
  if command -v timeout >/dev/null 2>&1; then
    local_timeout=timeout
  elif command -v gtimeout >/dev/null 2>&1; then
    local_timeout=gtimeout
  else
    printf 'RELEASE_WRAPPER_FAIL code=PAUSE_TIMEOUT_TOOL_MISSING\n' >&2
    exit 90
  fi
fi
# Migration listesi SHA onayından ayrı, birebir onaylanır (A5).
migration_mode=no-migration
if test -n "$approved_migrations"; then
  [[ "$approved_migrations" =~ ^[0-9]{14}_[a-z0-9_]+(,[0-9]{14}_[a-z0-9_]+)*$ ]] || {
    printf 'RELEASE_WRAPPER_FAIL code=INVALID_MIGRATION_LIST\n' >&2
    exit 90
  }
  test "${AGENT_SOZLUK_PRODUCTION_APPROVED_MIGRATIONS:-}" = "$approved_migrations" || {
    printf 'RELEASE_WRAPPER_FAIL code=EXACT_MIGRATION_APPROVAL_REQUIRED\n' >&2
    exit 90
  }
  test "$build_on_host" = 0 || {
    printf 'RELEASE_WRAPPER_FAIL code=MIGRATION_WITH_HOST_BUILD\n' >&2
    exit 90
  }
  migration_mode="apply:$approved_migrations"
elif test -n "${AGENT_SOZLUK_PRODUCTION_APPROVED_MIGRATIONS:-}"; then
  printf 'RELEASE_WRAPPER_FAIL code=MIGRATION_APPROVAL_WITHOUT_FLAG\n' >&2
  exit 90
fi
if test "$build_on_host" = 1; then
  test -z "$artifact_run" || {
    printf 'RELEASE_WRAPPER_FAIL code=AMBIGUOUS_RELEASE_SOURCE\n' >&2
    exit 90
  }
  test "$keep_artifact" = 0 || {
    printf 'RELEASE_WRAPPER_FAIL code=ARTIFACT_OPTION_WITH_HOST_BUILD\n' >&2
    exit 90
  }
else
  [[ "$artifact_run" =~ ^[1-9][0-9]*$ ]] || {
    printf 'RELEASE_WRAPPER_FAIL code=ARTIFACT_RUN_REQUIRED\n' >&2
    exit 90
  }
  if test "$artifact_transport" = server-fetch && test "$keep_artifact" = 1; then
    printf 'RELEASE_WRAPPER_FAIL code=SERVER_FETCH_KEEP_UNSUPPORTED\n' >&2
    exit 90
  fi
fi

root="$(git rev-parse --show-toplevel)"
test "$(git -C "$root" remote get-url origin)" = \
  https://github.com/cerncaycisi/agentsozluk.git
test "$(git -C "$root" rev-parse HEAD)" = "$candidate_sha"
test -z "$(git -C "$root" status --porcelain=v1 --untracked-files=all)"
bash -n "$root/scripts/production-release-remote.sh"
bash -n "$root/scripts/install-release-artifact-remote.sh"
bash -n "$root/scripts/install-release-artifact-from-github-remote.sh"
bash -n "$root/scripts/production-migration-phase.sh"
op_id="$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"
[[ "$op_id" =~ ^[0-9a-f]{16}$ ]]
lock_owner="$candidate_sha:$op_id"

artifact_dir=''
artifact_receipt=''
artifact_download_stage=''
redirect_header_stage=''
cleanup_download_stage() {
  local exit_status=$?
  trap - EXIT
  set +e
  unset github_token signed_url
  if test -n "${artifact_download_stage:-}" &&
     test -d "$artifact_download_stage"; then
    find "$artifact_download_stage" -xdev -depth -delete
  fi
  if test -n "${redirect_header_stage:-}" &&
     test -d "$redirect_header_stage"; then
    find "$redirect_header_stage" -xdev -depth -delete
  fi
  exit "$exit_status"
}
trap cleanup_download_stage EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP
if test "$build_on_host" = 0; then
  command -v gh >/dev/null
  command -v node >/dev/null
  command -v curl >/dev/null
  if test "$artifact_transport" = operator-transfer; then
    command -v zstd >/dev/null
    command -v shasum >/dev/null
    command -v unzip >/dev/null
  fi
  successful_ci="$(
    CANDIDATE_SHA="$candidate_sha" gh run list \
      --repo cerncaycisi/agentsozluk \
      --workflow CI \
      --commit "$candidate_sha" \
      --event push \
      --status success \
      --limit 20 \
      --json headSha,conclusion,event,workflowName \
      --jq '[.[] | select(
        .headSha == env.CANDIDATE_SHA and
        .conclusion == "success" and
        .event == "push" and
        .workflowName == "CI"
      )] | length'
  )"
  test "$successful_ci" -ge 1 || {
    printf 'RELEASE_WRAPPER_FAIL code=EXACT_CI_NOT_GREEN\n' >&2
    exit 90
  }
  artifact_run_receipt="$(
    gh run view "$artifact_run" \
      --repo cerncaycisi/agentsozluk \
      --json databaseId,workflowName,event,status,conclusion,headSha
  )"
  ARTIFACT_RUN_RECEIPT="$artifact_run_receipt" \
    CANDIDATE_SHA="$candidate_sha" \
    ARTIFACT_RUN="$artifact_run" \
    node <<'NODE'
const value = JSON.parse(process.env.ARTIFACT_RUN_RECEIPT ?? "null");
if (
  value?.databaseId !== Number(process.env.ARTIFACT_RUN) ||
  value?.workflowName !== "Release Candidate Bundle" ||
  value?.event !== "workflow_dispatch" ||
  value?.status !== "completed" ||
  value?.conclusion !== "success" ||
  value?.headSha !== process.env.CANDIDATE_SHA
) {
  process.stderr.write("RELEASE_WRAPPER_FAIL code=ARTIFACT_RUN_MISMATCH\n");
  process.exit(90);
}
NODE
  artifact_api_receipt="$(
    gh api \
      -H 'Accept: application/vnd.github+json' \
      "repos/cerncaycisi/agentsozluk/actions/runs/$artifact_run/artifacts"
  )"
  artifact_metadata="$(
    ARTIFACT_API_RECEIPT="$artifact_api_receipt" \
      CANDIDATE_SHA="$candidate_sha" \
      node <<'NODE'
const value = JSON.parse(process.env.ARTIFACT_API_RECEIPT ?? "null");
const expectedName = `release-candidate-${process.env.CANDIDATE_SHA}`;
const matching = value?.artifacts?.filter((artifact) => artifact?.name === expectedName) ?? [];
if (
  matching.length !== 1 ||
  matching[0].expired !== false ||
  !Number.isSafeInteger(matching[0].id) ||
  !Number.isSafeInteger(matching[0].size_in_bytes) ||
  matching[0].size_in_bytes <= 0 ||
  matching[0].size_in_bytes > 252706816 ||
  !/^sha256:[0-9a-f]{64}$/u.test(matching[0].digest ?? "")
) {
  process.stderr.write("RELEASE_WRAPPER_FAIL code=ARTIFACT_API_MISMATCH\n");
  process.exit(90);
}
process.stdout.write(
  JSON.stringify({
    digest: matching[0].digest,
    id: matching[0].id,
    size: matching[0].size_in_bytes,
  }),
);
NODE
  )"
  artifact_id="$(
    ARTIFACT_METADATA="$artifact_metadata" \
      node -p 'JSON.parse(process.env.ARTIFACT_METADATA).id'
  )"
  artifact_digest="$(
    ARTIFACT_METADATA="$artifact_metadata" \
      node -p 'JSON.parse(process.env.ARTIFACT_METADATA).digest'
  )"
  artifact_zip_size="$(
    ARTIFACT_METADATA="$artifact_metadata" \
      node -p 'JSON.parse(process.env.ARTIFACT_METADATA).size'
  )"
  if test "$artifact_transport" = operator-transfer; then
  artifact_root=/Volumes/GB/agent-sozluk-release-artifacts
  artifact_dir="$artifact_root/$candidate_sha/run-$artifact_run"
  test ! -L "$artifact_root"
  install -d -m 0700 "$artifact_root"
  if test ! -f "$artifact_dir/manifest.env"; then
    test ! -e "$artifact_dir"
    artifact_download_stage="$(
      mktemp -d "$artifact_root/.download-$candidate_sha-$artifact_run.XXXXXXXX"
    )"
    artifact_zip="$artifact_download_stage/artifact.zip"
    artifact_files="$artifact_download_stage/files"
    install -d -m 0700 "$artifact_files"
    gh api \
      -H 'Accept: application/vnd.github+json' \
      "repos/cerncaycisi/agentsozluk/actions/artifacts/$artifact_id/zip" \
      >"$artifact_zip"
    test "$(wc -c <"$artifact_zip" | tr -d ' ')" = "$artifact_zip_size"
    test "sha256:$(shasum -a 256 "$artifact_zip" | awk '{print $1}')" = \
      "$artifact_digest"
    if ! unzip -Z1 "$artifact_zip" |
        awk -f "$root/scripts/validate-release-archive-paths.awk"; then
      printf 'RELEASE_WRAPPER_FAIL code=ARTIFACT_ZIP_PATH_INVALID\n' >&2
      exit 90
    fi
    unzip -q "$artifact_zip" -d "$artifact_files"
    printf '%s\n' "$artifact_id" >"$artifact_files/.artifact-id"
    printf '%s\n' "$artifact_digest" >"$artifact_files/.artifact-digest"
    install -d -m 0700 "$(dirname "$artifact_dir")"
    mv "$artifact_files" "$artifact_dir"
    find "$artifact_download_stage" -xdev -depth -delete
    artifact_download_stage=''
  fi
  test ! -L "$artifact_dir"
  test "$(cat "$artifact_dir/.artifact-id")" = "$artifact_id"
  test "$(cat "$artifact_dir/.artifact-digest")" = "$artifact_digest"
  artifact_receipt="$(
    node "$root/scripts/verify-release-bundle.mjs" \
      "$artifact_dir" "$candidate_sha"
  )"
  image_archive="$(
    ARTIFACT_RECEIPT="$artifact_receipt" \
      node -p 'JSON.parse(process.env.ARTIFACT_RECEIPT).imagePath'
  )"
  runtime_archive="$(
    ARTIFACT_RECEIPT="$artifact_receipt" \
      node -p 'JSON.parse(process.env.ARTIFACT_RECEIPT).runtimePath'
  )"
  artifact_image_config_digest="$(
    ARTIFACT_RECEIPT="$artifact_receipt" \
      node -p 'JSON.parse(process.env.ARTIFACT_RECEIPT).imageConfigDigest'
  )"
  artifact_image_tar_sha256="$(
    ARTIFACT_RECEIPT="$artifact_receipt" \
      node -p 'JSON.parse(process.env.ARTIFACT_RECEIPT).imageTarSha256'
  )"
  artifact_image_archive_sha256="$(
    ARTIFACT_RECEIPT="$artifact_receipt" \
      node -p 'JSON.parse(process.env.ARTIFACT_RECEIPT).imageArchiveSha256'
  )"
  artifact_image_archive_bytes="$(
    ARTIFACT_RECEIPT="$artifact_receipt" \
      node -p 'JSON.parse(process.env.ARTIFACT_RECEIPT).imageArchiveBytes'
  )"
  artifact_runtime_archive_sha256="$(
    ARTIFACT_RECEIPT="$artifact_receipt" \
      node -p 'JSON.parse(process.env.ARTIFACT_RECEIPT).runtimeArchiveSha256'
  )"
  artifact_runtime_archive_bytes="$(
    ARTIFACT_RECEIPT="$artifact_receipt" \
      node -p 'JSON.parse(process.env.ARTIFACT_RECEIPT).runtimeArchiveBytes'
  )"
  artifact_runtime_abi="$(
    ARTIFACT_RECEIPT="$artifact_receipt" \
      node -p 'JSON.parse(process.env.ARTIFACT_RECEIPT).runtimeAbi'
  )"
  for archive in "$image_archive" "$runtime_archive"; do
    test -f "$archive"
    test ! -L "$archive"
    zstd -q --test "$archive" || {
      printf 'RELEASE_WRAPPER_FAIL code=ARCHIVE_ZSTD_INVALID\n' >&2
      exit 90
    }
    if ! zstd -q --decompress --stdout "$archive" |
        tar --list --file=- |
        awk -f "$root/scripts/validate-release-archive-paths.awk"; then
      printf 'RELEASE_WRAPPER_FAIL code=ARCHIVE_PATH_INVALID\n' >&2
      exit 90
    fi
  done
  test "$(
    zstd -q --decompress --stdout "$image_archive" |
      shasum -a 256 |
      awk '{print $1}'
  )" = "$artifact_image_tar_sha256" || {
    printf 'RELEASE_WRAPPER_FAIL code=IMAGE_TAR_HASH_MISMATCH\n' >&2
    exit 90
  }
  fi
fi

expected_ip=46.225.20.177
expected_host=agent-sozluk-prod
expected_origin=https://github.com/cerncaycisi/agentsozluk.git
expected_fingerprint=SHA256:BVirvnH5qPzzK18ZGLhO90LObtFze38qicLybEwQ5fI
known_hosts=/private/tmp/agent-sozluk-known_hosts
identity=/Users/gokhannihalgul/.ssh/id_ed25519
remote_script="/opt/agent-sozluk/runtime/.operator-release-$candidate_sha.sh"
remote_artifact_installer="/opt/agent-sozluk/runtime/.operator-artifact-$candidate_sha.sh"
remote_github_fetcher="/opt/agent-sozluk/runtime/.operator-github-fetch-$candidate_sha.sh"
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

# Kilit İLK uzak mutasyondan önce alınır ve yalnız tam başarıda bırakılır;
# başka her çıkışta kalır (elle temizlik ölçütü runbook'ta).
lock_dir=/opt/agent-sozluk/runtime/.release-lock
lock_check="test \"\$(cat $lock_dir/owner 2>/dev/null)\" = '$lock_owner' || exit 97"
# Her uzak adım, hiçbir şeyi değiştirmeden önce, kendi cgroup'unun logind'e
# kayıtlı bir `deploy` oturum scope'u olduğunu kanıtlar. Böylece `sudo` ile root'a
# geçen torunlar dahil her süreç o scope'ta kalır ve elle kilit temizliği onu
# görebilir; kayıtsız (ör. `pam_systemd` sessizce başarısız) oturum hiç başlamaz
# (Astra, 23 Eylül).
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
ssh "${ssh_options[@]}" deploy@"$expected_ip" \
  "set -euo pipefail
   test \"\$(hostname)\" = '$expected_host' || exit 91
   $scope_check
   test -f /opt/agent-sozluk/runtime/compose.production.yaml || exit 93
   if ! mkdir -m 0700 '$lock_dir' 2>/dev/null; then
     printf 'RELEASE_WRAPPER_FAIL code=RELEASE_LOCKED owner=%s\\n' \"\$(cat '$lock_dir/owner' 2>/dev/null)\" >&2
     exit 96
   fi
   printf '%s\\n' '$lock_owner' >'$lock_dir/owner'
   chmod 0600 '$lock_dir/owner'"

ssh "${ssh_options[@]}" deploy@"$expected_ip" \
  "set -euo pipefail
   test \"\$(hostname)\" = '$expected_host' || exit 91
   $scope_check
   $lock_check
   test \"\$(git -C /opt/agent-sozluk/app remote get-url origin)\" = '$expected_origin' || exit 92
   test -f /opt/agent-sozluk/runtime/compose.production.yaml || exit 93
   install -m 0700 /dev/stdin '$remote_script'
   bash -n '$remote_script'" \
  <"$root/scripts/production-release-remote.sh"

if test "$build_on_host" = 0; then
  ssh "${ssh_options[@]}" deploy@"$expected_ip" \
    "set -euo pipefail
     test \"\$(hostname)\" = '$expected_host' || exit 91
     $scope_check
     $lock_check
     test \"\$(git -C /opt/agent-sozluk/app remote get-url origin)\" = '$expected_origin' || exit 92
     test -f /opt/agent-sozluk/runtime/compose.production.yaml || exit 93
     install -m 0700 /dev/stdin '$remote_artifact_installer'
     bash -n '$remote_artifact_installer'" \
    <"$root/scripts/install-release-artifact-remote.sh"
  if test "$artifact_transport" = server-fetch; then
    ssh "${ssh_options[@]}" deploy@"$expected_ip" \
      "set -euo pipefail
       test \"\$(hostname)\" = '$expected_host' || exit 91
       $scope_check
       $lock_check
       test \"\$(git -C /opt/agent-sozluk/app remote get-url origin)\" = '$expected_origin' || exit 92
       test -f /opt/agent-sozluk/runtime/compose.production.yaml || exit 93
       install -m 0700 /dev/stdin '$remote_github_fetcher'
       bash -n '$remote_github_fetcher'" \
      <"$root/scripts/install-release-artifact-from-github-remote.sh"
  fi
fi

ssh "${ssh_options[@]}" deploy@"$expected_ip" \
  "set -euo pipefail
   test \"\$(hostname)\" = '$expected_host' || exit 91
   $scope_check
   $lock_check
   test \"\$(git -C /opt/agent-sozluk/app remote get-url origin)\" = '$expected_origin' || exit 92
   test -f /opt/agent-sozluk/runtime/compose.production.yaml || exit 93
   # GitHub kimliksiz trafigi kisitliyor ve bu fetch deploy'un ilk uzak adimi.
   # 3 Eylul 2026'da iki deploy bu yuzden dustu; host'a Contents:Read tokeni
   # kuruldu ama gecici ag hatasi ve throttle hala mumkun. Sinirli yeniden
   # deneme, tek seferlik bir hatanin butun deploy'u iptal etmesini onluyor.
   # Guvenlik ozelligi zayiflamiyor: asil sart olan origin/main == aday SHA
   # kontrolu asagida aynen duruyor.
   fetch_attempt=1
   while :; do
     git -C /opt/agent-sozluk/app fetch --prune origin main && break
     test \"\$fetch_attempt\" -lt 3 || exit 94
     sleep \$((fetch_attempt * 15))
     fetch_attempt=\$((fetch_attempt + 1))
   done
   test \"\$(git -C /opt/agent-sozluk/app rev-parse origin/main)\" = '$candidate_sha'
   git -C /opt/agent-sozluk/app checkout --detach '$candidate_sha'
   test \"\$(git -C /opt/agent-sozluk/app rev-parse HEAD)\" = '$candidate_sha'
   test -z \"\$(git -C /opt/agent-sozluk/app status --porcelain=v1 --untracked-files=all)\""

if test "$build_on_host" = 0; then
  remote_artifact_command="set -euo pipefail
   test \"\$(hostname)\" = '$expected_host' || exit 91
   $scope_check
   $lock_check
   test \"\$(git -C /opt/agent-sozluk/app remote get-url origin)\" = '$expected_origin' || exit 92
   test \"\$(git -C /opt/agent-sozluk/app rev-parse HEAD)\" = '$candidate_sha'
   test -f /opt/agent-sozluk/runtime/compose.production.yaml || exit 93"

  if test "$artifact_transport" = server-fetch; then
    redirect_header_stage="$(
      mktemp -d "/private/tmp/agent-sozluk-artifact-redirect-$candidate_sha.XXXXXXXX"
    )"
    redirect_header_file="$redirect_header_stage/headers"
    install -m 0600 /dev/null "$redirect_header_file"
    github_token="$(gh auth token)"
    redirect_status="$({
      printf 'url = "https://api.github.com/repos/cerncaycisi/agentsozluk/actions/artifacts/%s/zip"\n' \
        "$artifact_id"
      printf 'header = "Accept: application/vnd.github+json"\n'
      printf 'header = "X-GitHub-Api-Version: 2022-11-28"\n'
      printf 'header = "Authorization: Bearer %s"\n' "$github_token"
      printf '%s\n' 'silent' 'show-error' 'max-redirs = 0'
    } | curl --config - --dump-header "$redirect_header_file" \
      --output /dev/null --write-out '%{http_code}')"
    unset github_token
    test "$redirect_status" = 302 || {
      printf 'RELEASE_WRAPPER_FAIL code=ARTIFACT_REDIRECT_MISSING\n' >&2
      exit 90
    }
    signed_url="$(
      HEADER_FILE="$redirect_header_file" node -e '
        const fs = require("node:fs");
        const value = fs.readFileSync(process.env.HEADER_FILE, "utf8");
        const matches = [...value.matchAll(/^location:\s*(\S+)\s*$/gimu)];
        if (matches.length !== 1) process.exit(90);
        process.stdout.write(matches[0][1]);
      '
    )"
    find "$redirect_header_stage" -xdev -depth -delete
    redirect_header_stage=''
    printf '%s\n' "$signed_url" |
      ssh "${ssh_options[@]}" deploy@"$expected_ip" \
        "$remote_artifact_command
         exec '$remote_github_fetcher' '$candidate_sha' '$artifact_id' '$artifact_zip_size' '$artifact_digest'"
    unset signed_url
  else
  image_reused=0
  if ssh "${ssh_options[@]}" deploy@"$expected_ip" \
      "$remote_artifact_command
       exec '$remote_artifact_installer' image-probe '$candidate_sha' '$artifact_image_config_digest' '$artifact_runtime_abi' '$artifact_image_tar_sha256'"; then
    image_reused=1
  else
    probe_status=$?
    test "$probe_status" = 42 || exit "$probe_status"
  fi
  if test "$image_reused" = 0; then
    ssh "${ssh_options[@]}" deploy@"$expected_ip" \
      "$remote_artifact_command
       exec '$remote_artifact_installer' image '$candidate_sha' '$artifact_image_config_digest' '$artifact_runtime_abi' '$artifact_image_tar_sha256' '$artifact_image_archive_sha256' '$artifact_image_archive_bytes'" \
      <"$image_archive"
  fi

  runtime_reused=0
  if ssh "${ssh_options[@]}" deploy@"$expected_ip" \
      "$remote_artifact_command
       exec '$remote_artifact_installer' runtime-probe '$candidate_sha' '$artifact_image_config_digest' '$artifact_runtime_abi' '$artifact_image_tar_sha256'"; then
    runtime_reused=1
  else
    probe_status=$?
    test "$probe_status" = 42 || exit "$probe_status"
  fi
  if test "$runtime_reused" = 0; then
    ssh "${ssh_options[@]}" deploy@"$expected_ip" \
      "$remote_artifact_command
       exec '$remote_artifact_installer' runtime '$candidate_sha' '$artifact_image_config_digest' '$artifact_runtime_abi' '$artifact_image_tar_sha256' '$artifact_runtime_archive_sha256' '$artifact_runtime_archive_bytes'" \
      <"$runtime_archive"
  fi
  fi
fi

# Genel duraklatma (runbook "Deploy-day failure modes" 2-3): uzak betik ayar parmak
# izini almadan ÖNCE, adayın kendi release'indeki operatör betiğiyle; panelle aynı
# uygulama servisi ve denetim kaydı. İdempotent: yeniden denemede zaten duraklatılmışsa
# hiçbir şey yazmaz, parmak izi değişmez. Devam ettirme otomatik DEĞİL: kabulden sonra
# operatör `agent:flow resume` ile yapar. Süre sınırlı: uzakta 120 sn (süreç
# sonlandırılır), yerelde SSH 180 sn; aşılırsa dağıtım durur, kilit kalır ve operatör
# aynı release'ten `status` ile gerçek durumu okur (runbook).
if test "$pause_society_flow" = 1; then
  "$local_timeout" 180 ssh "${ssh_options[@]}" deploy@"$expected_ip" \
    "set -euo pipefail
     test \"\$(hostname)\" = '$expected_host' || exit 91
     $scope_check
     $lock_check
     release=/opt/agent-sozluk/runtime/releases/$candidate_sha
     test -f \"\$release/scripts/agent-society-flow.ts\"
     test \"\$(cat \"\$release/.release-sha\")\" = '$candidate_sha'
     db_container=\"\$(docker compose --env-file /opt/agent-sozluk/app/.env -f /opt/agent-sozluk/runtime/compose.production.yaml ps -q db)\"
     db_ip=\"\$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' \"\$db_container\")\"
     test -n \"\$db_ip\"
     cd \"\$release\"
     AGENT_OPERATOR_ENV_FILE=/opt/agent-sozluk/app/.env AGENT_DB_IP=\"\$db_ip\" \\
       AGENT_FLOW_REASON='deploy ${candidate_sha:0:12} op $op_id' \\
       timeout --kill-after=10 120 ./node_modules/.bin/tsx scripts/agent-society-flow.ts pause"
fi

trap - EXIT INT TERM HUP
ssh -tt "${ssh_options[@]}" deploy@"$expected_ip" \
  "set -euo pipefail
   test \"\$(hostname)\" = '$expected_host' || exit 91
   $scope_check
   $lock_check
   test \"\$(git -C /opt/agent-sozluk/app remote get-url origin)\" = '$expected_origin' || exit 92
   test \"\$(git -C /opt/agent-sozluk/app rev-parse HEAD)\" = '$candidate_sha'
   exec '$remote_script' '$candidate_sha' '$cleanup' '$migration_mode' '$op_id'"

if test "$build_on_host" = 0 && test "$artifact_transport" = server-fetch; then
  ssh "${ssh_options[@]}" deploy@"$expected_ip" \
    "set -euo pipefail
     test \"\$(hostname)\" = '$expected_host' || exit 91
     $scope_check
     $lock_check
     test \"\$(git -C /opt/agent-sozluk/app remote get-url origin)\" = '$expected_origin' || exit 92
     test \"\$(git -C /opt/agent-sozluk/app rev-parse HEAD)\" = '$candidate_sha'
     test -f '$remote_github_fetcher'
     find '$remote_github_fetcher' -xdev -delete"
fi

if test "$build_on_host" = 0 &&
   test "$artifact_transport" = operator-transfer &&
   test "$keep_artifact" = 0; then
  expected_artifact_dir="/Volumes/GB/agent-sozluk-release-artifacts/$candidate_sha/run-$artifact_run"
  test "$artifact_dir" = "$expected_artifact_dir"
  test -d "$artifact_dir"
  test ! -L "$artifact_dir"
  find "$artifact_dir" -xdev -depth -delete
fi

# Yalnız uzak betik `RELEASE_COMPLETE PASS` ile 0 döndüyse buraya gelinir
# (`set -e`); kilit yalnız bu yolda ve sahibi bizsek bırakılır.
ssh "${ssh_options[@]}" deploy@"$expected_ip" \
  "set -euo pipefail
   test \"\$(hostname)\" = '$expected_host' || exit 91
   $scope_check
   $lock_check
   find '$lock_dir' -xdev -depth -delete"
