#!/usr/bin/env bash
set -Eeuo pipefail

candidate_sha=''
output=''

usage() {
  printf '%s\n' \
    'Usage:' \
    '  build-release-bundle.sh --sha <40-char-sha> --output <new-dir>'
}

while (($# > 0)); do
  case "$1" in
    --sha)
      candidate_sha="${2:-}"
      shift 2
      ;;
    --output)
      output="${2:-}"
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      printf 'RELEASE_BUNDLE_FAIL code=UNKNOWN_ARGUMENT\n' >&2
      usage >&2
      exit 90
      ;;
  esac
done

[[ "$candidate_sha" =~ ^[0-9a-f]{40}$ ]] || {
  printf 'RELEASE_BUNDLE_FAIL code=INVALID_SHA\n' >&2
  exit 90
}
test -n "$output" || {
  printf 'RELEASE_BUNDLE_FAIL code=OUTPUT_REQUIRED\n' >&2
  exit 90
}
root="$(git rev-parse --show-toplevel)"
test "$(git -C "$root" rev-parse HEAD)" = "$candidate_sha"
test -z "$(git -C "$root" status --porcelain=v1 --untracked-files=all)"
test ! -e "$output"
test ! -L "$output"
command -v docker >/dev/null
command -v zstd >/dev/null
command -v sha256sum >/dev/null

image_ref="agent-sozluk:$candidate_sha"
runtime_stage="$(
  mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/agent-sozluk-runtime.XXXXXXXX"
)"
find "$runtime_stage" -xdev -depth -delete
output_created=0
cleanup() {
  local exit_status=$?
  trap - EXIT INT TERM HUP
  set +e
  if test -d "$runtime_stage"; then
    find "$runtime_stage" -xdev -depth -delete
  fi
  if ((exit_status != 0 && output_created == 1)) && test -d "$output"; then
    find "$output" -xdev -depth -delete
  fi
  exit "$exit_status"
}
trap cleanup EXIT INT TERM HUP

docker buildx build \
  --load \
  --tag "$image_ref" \
  --build-arg "SOURCE_REVISION=$candidate_sha" \
  "$root"
test "$(
  docker image inspect \
    --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' \
    "$image_ref"
)" = "$candidate_sha"
image_id="$(docker image inspect --format '{{.Id}}' "$image_ref")"
[[ "$image_id" =~ ^sha256:[0-9a-f]{64}$ ]]
docker run --rm --entrypoint /app/node_modules/.bin/tsx \
  "$image_ref" scripts/release-smoke.ts </dev/null

"$root/scripts/assemble-runtime-release.sh" \
  --sha "$candidate_sha" \
  --image-id "$image_id" \
  --output "$runtime_stage"

install -d -m 0700 "$output"
output_created=1
image_archive="$output/app-image.tar.zst"
runtime_archive="$output/runtime-release.tar.zst"
docker save "$image_ref" |
  zstd -q -T0 -19 -o "$image_archive"
tar --create --file=- --directory="$runtime_stage" . |
  zstd -q -T0 -19 -o "$runtime_archive"

(
  cd "$output"
  sha256sum app-image.tar.zst runtime-release.tar.zst >SHA256SUMS
)
image_sha256="$(sha256sum "$image_archive" | cut -d ' ' -f 1)"
runtime_sha256="$(sha256sum "$runtime_archive" | cut -d ' ' -f 1)"
runtime_abi="$(cat "$runtime_stage/.release-node-abi")"
image_bytes="$(wc -c <"$image_archive" | tr -d ' ')"
runtime_bytes="$(wc -c <"$runtime_archive" | tr -d ' ')"
total_bytes=$((image_bytes + runtime_bytes))
maximum_bytes="${RELEASE_BUNDLE_MAX_BYTES:-167772160}"
((total_bytes <= maximum_bytes)) || {
  printf 'RELEASE_BUNDLE_FAIL code=BUNDLE_SIZE_LIMIT total_bytes=%s maximum_bytes=%s\n' \
    "$total_bytes" "$maximum_bytes" >&2
  exit 96
}

{
  printf 'format=agent-sozluk-release-v1\n'
  printf 'source_sha=%s\n' "$candidate_sha"
  printf 'image_ref=%s\n' "$image_ref"
  printf 'image_id=%s\n' "$image_id"
  printf 'runtime_abi=%s\n' "$runtime_abi"
  printf 'image_archive=app-image.tar.zst\n'
  printf 'image_sha256=%s\n' "$image_sha256"
  printf 'image_bytes=%s\n' "$image_bytes"
  printf 'runtime_archive=runtime-release.tar.zst\n'
  printf 'runtime_sha256=%s\n' "$runtime_sha256"
  printf 'runtime_bytes=%s\n' "$runtime_bytes"
  printf 'total_bytes=%s\n' "$total_bytes"
} >"$output/manifest.env"

trap - EXIT INT TERM HUP
find "$runtime_stage" -xdev -depth -delete
printf 'RELEASE_BUNDLE_READY sha=%s image_id=%s total_bytes=%s\n' \
  "$candidate_sha" "$image_id" "$total_bytes"
