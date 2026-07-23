#!/usr/bin/env bash
set -Eeuo pipefail

candidate_sha=''
execute=0
cleanup=no-cleanup
artifact_run=''
build_on_host=0
keep_artifact=0

usage() {
  printf '%s\n' \
    'Usage:' \
    '  AGENT_SOZLUK_PRODUCTION_APPROVED_SHA=<40-char-sha> \' \
    '    pnpm release:production:no-migration -- \' \
    '      --sha <40-char-sha> --artifact-run <run-id> --execute [--cleanup] [--keep-artifact]' \
    '' \
    'Fallback only when the exact approval explicitly permits a production-host build:' \
    '  ... --sha <40-char-sha> --build-on-host --execute [--cleanup]' \
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
    --artifact-run)
      artifact_run="${2:-}"
      shift 2
      ;;
    --build-on-host)
      build_on_host=1
      shift
      ;;
    --keep-artifact)
      keep_artifact=1
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
fi

root="$(git rev-parse --show-toplevel)"
test "$(git -C "$root" remote get-url origin)" = \
  https://github.com/cerncaycisi/agentsozluk.git
test "$(git -C "$root" rev-parse HEAD)" = "$candidate_sha"
test -z "$(git -C "$root" status --porcelain=v1 --untracked-files=all)"
bash -n "$root/scripts/production-release-remote.sh"
bash -n "$root/scripts/install-release-artifact-remote.sh"

artifact_dir=''
artifact_receipt=''
artifact_download_stage=''
cleanup_download_stage() {
  local exit_status=$?
  trap - EXIT
  set +e
  if test -n "${artifact_download_stage:-}" &&
     test -d "$artifact_download_stage"; then
    find "$artifact_download_stage" -xdev -depth -delete
  fi
  exit "$exit_status"
}
trap cleanup_download_stage EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP
if test "$build_on_host" = 0; then
  command -v gh >/dev/null
  command -v zstd >/dev/null
  command -v node >/dev/null
  command -v shasum >/dev/null
  command -v unzip >/dev/null
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
  matching[0].size_in_bytes > 170000000 ||
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
        awk '
          /^\// { exit 1 }
          {
            count = split($0, parts, "/")
            for (index = 1; index <= count; index += 1) {
              if (parts[index] == "..") exit 1
            }
          }
        '; then
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
  artifact_image_id="$(
    ARTIFACT_RECEIPT="$artifact_receipt" \
      node -p 'JSON.parse(process.env.ARTIFACT_RECEIPT).imageId'
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
        awk '
          /^\// { exit 1 }
          {
            count = split($0, parts, "/")
            for (index = 1; index <= count; index += 1) {
              if (parts[index] == "..") exit 1
            }
          }
        '; then
      printf 'RELEASE_WRAPPER_FAIL code=ARCHIVE_PATH_INVALID\n' >&2
      exit 90
    fi
  done
fi

expected_ip=46.225.20.177
expected_host=agent-sozluk-prod
expected_origin=https://github.com/cerncaycisi/agentsozluk.git
expected_fingerprint=SHA256:BVirvnH5qPzzK18ZGLhO90LObtFze38qicLybEwQ5fI
known_hosts=/private/tmp/agent-sozluk-known_hosts
identity=/Users/gokhannihalgul/.ssh/id_ed25519
remote_script="/opt/agent-sozluk/runtime/.operator-release-$candidate_sha.sh"
remote_artifact_installer="/opt/agent-sozluk/runtime/.operator-artifact-$candidate_sha.sh"
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

if test "$build_on_host" = 0; then
  ssh "${ssh_options[@]}" deploy@"$expected_ip" \
    "set -euo pipefail
     test \"\$(hostname)\" = '$expected_host' || exit 91
     test \"\$(git -C /opt/agent-sozluk/app remote get-url origin)\" = '$expected_origin' || exit 92
     test -f /opt/agent-sozluk/runtime/compose.production.yaml || exit 93
     install -m 0700 /dev/stdin '$remote_artifact_installer'
     bash -n '$remote_artifact_installer'" \
    <"$root/scripts/install-release-artifact-remote.sh"
fi

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

if test "$build_on_host" = 0; then
  zstd -q --decompress --stdout "$image_archive" |
    ssh "${ssh_options[@]}" deploy@"$expected_ip" \
      "set -euo pipefail
       test \"\$(hostname)\" = '$expected_host' || exit 91
       test \"\$(git -C /opt/agent-sozluk/app remote get-url origin)\" = '$expected_origin' || exit 92
       test \"\$(git -C /opt/agent-sozluk/app rev-parse HEAD)\" = '$candidate_sha'
       test -f /opt/agent-sozluk/runtime/compose.production.yaml || exit 93
       exec '$remote_artifact_installer' image '$candidate_sha' '$artifact_image_id' '$artifact_runtime_abi'"
  zstd -q --decompress --stdout "$runtime_archive" |
    ssh "${ssh_options[@]}" deploy@"$expected_ip" \
      "set -euo pipefail
       test \"\$(hostname)\" = '$expected_host' || exit 91
       test \"\$(git -C /opt/agent-sozluk/app remote get-url origin)\" = '$expected_origin' || exit 92
       test \"\$(git -C /opt/agent-sozluk/app rev-parse HEAD)\" = '$candidate_sha'
       test -f /opt/agent-sozluk/runtime/compose.production.yaml || exit 93
       exec '$remote_artifact_installer' runtime '$candidate_sha' '$artifact_image_id' '$artifact_runtime_abi'"
fi

trap - EXIT INT TERM HUP
ssh -tt "${ssh_options[@]}" deploy@"$expected_ip" \
  "set -euo pipefail
   test \"\$(hostname)\" = '$expected_host' || exit 91
   test \"\$(git -C /opt/agent-sozluk/app remote get-url origin)\" = '$expected_origin' || exit 92
   test \"\$(git -C /opt/agent-sozluk/app rev-parse HEAD)\" = '$candidate_sha'
   exec '$remote_script' '$candidate_sha' '$cleanup'"

if test "$build_on_host" = 0 && test "$keep_artifact" = 0; then
  expected_artifact_dir="/Volumes/GB/agent-sozluk-release-artifacts/$candidate_sha/run-$artifact_run"
  test "$artifact_dir" = "$expected_artifact_dir"
  test -d "$artifact_dir"
  test ! -L "$artifact_dir"
  find "$artifact_dir" -xdev -depth -delete
fi
