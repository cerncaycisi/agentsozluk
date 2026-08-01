#!/usr/bin/env bash
set -Eeuo pipefail

report_unexpected_error() {
  local exit_status=$?
  printf 'SERVER_FETCH_FAIL code=UNEXPECTED line=%s status=%s\n' \
    "${BASH_LINENO[0]:-unknown}" "$exit_status" >&2
  exit "$exit_status"
}
trap report_unexpected_error ERR

candidate_sha="${1:?candidate sha required}"
artifact_id="${2:?artifact id required}"
artifact_zip_size="${3:?artifact zip size required}"
artifact_digest="${4:?artifact digest required}"

[[ "$candidate_sha" =~ ^[0-9a-f]{40}$ ]]
[[ "$artifact_id" =~ ^[1-9][0-9]*$ ]]
[[ "$artifact_zip_size" =~ ^[1-9][0-9]*$ ]]
[[ "$artifact_digest" =~ ^sha256:[0-9a-f]{64}$ ]]
test "$(hostname)" = agent-sozluk-prod
test "$(git -C /opt/agent-sozluk/app remote get-url origin)" = \
  https://github.com/cerncaycisi/agentsozluk.git
test "$(git -C /opt/agent-sozluk/app rev-parse HEAD)" = "$candidate_sha"
test -z "$(git -C /opt/agent-sozluk/app status --porcelain=v1 --untracked-files=all)"

for command_name in curl python3 zstd sha256sum node docker awk tar; do
  if ! command -v "$command_name" >/dev/null; then
    printf 'SERVER_FETCH_FAIL code=COMMAND_MISSING command=%s\n' "$command_name" >&2
    exit 90
  fi
done

free_bytes="$(df -Pk / | awk 'NR == 2 {printf "%.0f", $4 * 1024}')"
test "$free_bytes" -ge 8589934592 || {
  printf 'SERVER_FETCH_FAIL code=ROOT_HEADROOM_LOW free_bytes=%s\n' "$free_bytes" >&2
  exit 90
}

IFS= read -r signed_url
test -n "$signed_url" || {
  printf 'SERVER_FETCH_FAIL code=SIGNED_URL_REQUIRED\n' >&2
  exit 90
}
url_host="$(
  SIGNED_URL="$signed_url" node -e '
    const raw = process.env.SIGNED_URL ?? "";
    const value = new URL(raw);
    if (
      raw.includes("\"") ||
      raw.includes("\\\\") ||
      raw.includes("\r") ||
      raw.includes("\n") ||
      value.protocol !== "https:" ||
      value.username !== "" ||
      value.password !== "" ||
      !(
        value.hostname.endsWith(".blob.core.windows.net") ||
        value.hostname.endsWith(".actions.githubusercontent.com") ||
        value.hostname === "objects.githubusercontent.com"
      )
    ) process.exit(90);
    process.stdout.write(value.hostname);
  '
)"

runtime_root=/opt/agent-sozluk/runtime
app_root=/opt/agent-sozluk/app
stage="$(mktemp -d "$runtime_root/.artifact-download-$candidate_sha.XXXXXXXX")"
artifact_zip="$stage/artifact.zip"
artifact_files="$stage/files"
installer="$runtime_root/.operator-artifact-$candidate_sha.sh"
cleanup_stage() {
  local exit_status=$?
  trap - EXIT ERR
  set +e
  unset signed_url
  if test -d "${stage:-}"; then
    find "$stage" -xdev -depth -delete
  fi
  exit "$exit_status"
}
trap cleanup_stage EXIT
install -d -m 0700 "$artifact_files"
test -x "$installer"

# The signed URL arrives only through stdin. Feed it to curl as config input so
# it never appears in argv, shell trace or a persistent production file.
if ! (
  {
    printf 'url = "%s"\n' "$signed_url"
    printf 'output = "%s"\n' "$artifact_zip"
    printf '%s\n' \
      'fail' \
      'location' \
      'silent' \
      'proto = "=https"' \
      'tlsv1.2' \
      'max-redirs = 3' \
      'connect-timeout = 20' \
      'retry = 3' \
      'speed-limit = 1024' \
      'speed-time = 60'
  } | curl --config - 2>/dev/null
); then
  printf 'SERVER_FETCH_FAIL code=ARTIFACT_DOWNLOAD_FAILED\n' >&2
  exit 90
fi
unset signed_url

test "$(wc -c <"$artifact_zip" | tr -d ' ')" = "$artifact_zip_size" || {
  printf 'SERVER_FETCH_FAIL code=ARTIFACT_SIZE_MISMATCH\n' >&2
  exit 90
}
test "sha256:$(sha256sum "$artifact_zip" | awk '{print $1}')" = "$artifact_digest" || {
  printf 'SERVER_FETCH_FAIL code=ARTIFACT_DIGEST_MISMATCH\n' >&2
  exit 90
}
if ! python3 - "$artifact_zip" <<'PY' |
import sys
import zipfile

with zipfile.ZipFile(sys.argv[1]) as archive:
    for item in archive.infolist():
        print(item.filename)
PY
    awk -f "$app_root/scripts/validate-release-archive-paths.awk"; then
  printf 'SERVER_FETCH_FAIL code=ARTIFACT_ZIP_PATH_INVALID\n' >&2
  exit 90
fi
python3 - "$artifact_zip" "$artifact_files" <<'PY'
import shutil
import stat
import sys
import zipfile
from pathlib import Path, PurePosixPath

archive_path = Path(sys.argv[1])
destination = Path(sys.argv[2])
with zipfile.ZipFile(archive_path) as archive:
    for item in archive.infolist():
        parts = PurePosixPath(item.filename).parts
        if not parts or item.filename.startswith("/") or ".." in parts:
            raise SystemExit(90)
        file_type = (item.external_attr >> 16) & 0o170000
        if file_type not in (0, stat.S_IFREG, stat.S_IFDIR):
            raise SystemExit(90)
        target = destination.joinpath(*parts)
        if item.is_dir():
            target.mkdir(parents=True, exist_ok=True)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(item) as source, target.open("xb") as output:
            shutil.copyfileobj(source, output)
PY
printf '%s\n' "$artifact_id" >"$artifact_files/.artifact-id"
printf '%s\n' "$artifact_digest" >"$artifact_files/.artifact-digest"

artifact_receipt="$(
  node "$app_root/scripts/verify-release-bundle.mjs" \
    "$artifact_files" "$candidate_sha"
)"
receipt_value() {
  local key="$1"
  ARTIFACT_RECEIPT="$artifact_receipt" RECEIPT_KEY="$key" \
    node -p 'JSON.parse(process.env.ARTIFACT_RECEIPT)[process.env.RECEIPT_KEY]'
}
image_archive="$(receipt_value imagePath)"
runtime_archive="$(receipt_value runtimePath)"
image_config_digest="$(receipt_value imageConfigDigest)"
image_tar_sha256="$(receipt_value imageTarSha256)"
image_archive_sha256="$(receipt_value imageArchiveSha256)"
image_archive_bytes="$(receipt_value imageArchiveBytes)"
runtime_archive_sha256="$(receipt_value runtimeArchiveSha256)"
runtime_archive_bytes="$(receipt_value runtimeArchiveBytes)"
runtime_abi="$(receipt_value runtimeAbi)"

for archive in "$image_archive" "$runtime_archive"; do
  test -f "$archive"
  test ! -L "$archive"
  zstd -q --test "$archive"
  zstd -q --decompress --stdout "$archive" |
    tar --list --file=- |
    awk -f "$app_root/scripts/validate-release-archive-paths.awk"
done
test "$(
  zstd -q --decompress --stdout "$image_archive" |
    sha256sum |
    awk '{print $1}'
)" = "$image_tar_sha256" || {
  printf 'SERVER_FETCH_FAIL code=IMAGE_TAR_HASH_MISMATCH\n' >&2
  exit 90
}

if "$installer" image-probe \
  "$candidate_sha" "$image_config_digest" "$runtime_abi" "$image_tar_sha256"; then
  image_state=reused
else
  probe_status=$?
  test "$probe_status" = 42
  "$installer" image \
    "$candidate_sha" "$image_config_digest" "$runtime_abi" "$image_tar_sha256" \
    "$image_archive_sha256" "$image_archive_bytes" <"$image_archive"
  image_state=installed
fi

if "$installer" runtime-probe \
  "$candidate_sha" "$image_config_digest" "$runtime_abi" "$image_tar_sha256"; then
  runtime_state=reused
else
  probe_status=$?
  test "$probe_status" = 42
  "$installer" runtime \
    "$candidate_sha" "$image_config_digest" "$runtime_abi" "$image_tar_sha256" \
    "$runtime_archive_sha256" "$runtime_archive_bytes" <"$runtime_archive"
  runtime_state=installed
fi

find "$stage" -xdev -depth -delete
stage=''
trap - EXIT ERR
printf 'SERVER_FETCH_PASS sha=%s artifact=%s bytes=%s host=%s image=%s runtime=%s free_bytes=%s\n' \
  "$candidate_sha" "$artifact_id" "$artifact_zip_size" "$url_host" \
  "$image_state" "$runtime_state" "$free_bytes"
