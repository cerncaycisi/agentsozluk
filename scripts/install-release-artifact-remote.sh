#!/usr/bin/env bash
set -Eeuo pipefail

report_unexpected_error() {
  local exit_status=$?
  printf 'RELEASE_ARTIFACT_INSTALL_FAIL code=UNEXPECTED line=%s status=%s\n' \
    "${BASH_LINENO[0]:-unknown}" "$exit_status" >&2
  exit "$exit_status"
}
trap report_unexpected_error ERR

mode="${1:-}"
candidate_sha="${2:-}"
image_config_digest="${3:-}"
runtime_abi="${4:-}"
image_tar_sha256="${5:-}"
archive_sha256="${6:-}"
archive_bytes="${7:-}"
app_root=/opt/agent-sozluk/app
runtime_root=/opt/agent-sozluk/runtime
candidate_image="agent-sozluk:$candidate_sha"
receipt_root="$runtime_root/artifact-receipts"
image_receipt="$receipt_root/$candidate_sha.env"

[[ "$mode" == image || "$mode" == runtime ||
   "$mode" == image-probe || "$mode" == runtime-probe ]] || {
  printf 'RELEASE_ARTIFACT_INSTALL_FAIL code=INVALID_MODE\n' >&2
  exit 90
}
[[ "$candidate_sha" =~ ^[0-9a-f]{40}$ ]] || {
  printf 'RELEASE_ARTIFACT_INSTALL_FAIL code=INVALID_SHA\n' >&2
  exit 90
}
[[ "$image_config_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || {
  printf 'RELEASE_ARTIFACT_INSTALL_FAIL code=INVALID_IMAGE_CONFIG_DIGEST\n' >&2
  exit 90
}
test "$runtime_abi" = linux-x64-glibc-node-abi-127 || {
  printf 'RELEASE_ARTIFACT_INSTALL_FAIL code=INVALID_RUNTIME_ABI\n' >&2
  exit 90
}
[[ "$image_tar_sha256" =~ ^[0-9a-f]{64}$ ]] || {
  printf 'RELEASE_ARTIFACT_INSTALL_FAIL code=INVALID_IMAGE_TAR_HASH\n' >&2
  exit 90
}
if [[ "$mode" == image || "$mode" == runtime ]]; then
  [[ "$archive_sha256" =~ ^[0-9a-f]{64}$ ]] || {
    printf 'RELEASE_ARTIFACT_INSTALL_FAIL code=INVALID_ARCHIVE_HASH\n' >&2
    exit 90
  }
  [[ "$archive_bytes" =~ ^[1-9][0-9]*$ ]] &&
    ((archive_bytes <= 251658240)) || {
    printf 'RELEASE_ARTIFACT_INSTALL_FAIL code=INVALID_ARCHIVE_SIZE\n' >&2
    exit 90
  }
  command -v zstd >/dev/null || {
    printf 'RELEASE_ARTIFACT_INSTALL_FAIL code=ZSTD_MISSING\n' >&2
    exit 94
  }
fi
test "$(hostname)" = agent-sozluk-prod || exit 91
test "$(git -C "$app_root" remote get-url origin)" = \
  https://github.com/cerncaycisi/agentsozluk.git || exit 92
test -f "$runtime_root/compose.production.yaml" || exit 93
test "$(git -C "$app_root" rev-parse HEAD)" = "$candidate_sha"
test -z "$(git -C "$app_root" status --porcelain=v1 --untracked-files=all)" || {
  printf 'RELEASE_ARTIFACT_INSTALL_FAIL code=REMOTE_WORKTREE_DIRTY\n' >&2
  exit 95
}

receipt_value() {
  local key="$1"
  awk -F= -v key="$key" \
    '$1 == key {print substr($0, length(key) + 2)}' "$image_receipt"
}

assert_image_receipt() {
  local loaded_image_id
  test -f "$image_receipt" || {
    printf 'RELEASE_ARTIFACT_INSTALL_FAIL code=IMAGE_RECEIPT_MISSING\n' >&2
    exit 96
  }
  test ! -L "$image_receipt"
  test "$(stat -c '%U|%G|%a' "$image_receipt")" = 'root|root|444'
  test "$(wc -l <"$image_receipt" | tr -d ' ')" = 5
  test "$(receipt_value format)" = agent-sozluk-artifact-image-v1
  test "$(receipt_value source_sha)" = "$candidate_sha"
  test "$(receipt_value image_config_digest)" = "$image_config_digest"
  test "$(receipt_value image_tar_sha256)" = "$image_tar_sha256"
  loaded_image_id="$(receipt_value loaded_image_id)"
  [[ "$loaded_image_id" =~ ^sha256:[0-9a-f]{64}$ ]]
  test "$(docker image inspect --format '{{.Id}}' "$candidate_image")" = "$loaded_image_id"
  test "$(
    docker image inspect \
      --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' \
      "$candidate_image"
  )" = "$candidate_sha"
  printf '%s\n' "$loaded_image_id"
}

release="$runtime_root/releases/$candidate_sha"
assert_runtime_release() {
  test -d "$release"
  test ! -L "$release"
  test "$(cat "$release/.release-sha")" = "$candidate_sha"
  test "$(cat "$release/.release-app-image-config-digest")" = \
    "$image_config_digest"
  test "$(cat "$release/.release-node-abi")" = "$runtime_abi"
  test -z "$(find "$release" -xdev ! -user root -print -quit)"
  test -z "$(
    find "$release" -xdev \( -type f -o -type d \) -perm /022 -print -quit
  )"
}

receive_archive() {
  local archive_stage="$1"
  head -c "$((archive_bytes + 1))" >"$archive_stage"
  test "$(wc -c <"$archive_stage" | tr -d ' ')" = "$archive_bytes" || {
    printf 'RELEASE_ARTIFACT_INSTALL_FAIL code=ARCHIVE_SIZE_MISMATCH\n' >&2
    exit 96
  }
  test "$(sha256sum "$archive_stage" | cut -d ' ' -f 1)" = "$archive_sha256" || {
    printf 'RELEASE_ARTIFACT_INSTALL_FAIL code=ARCHIVE_HASH_MISMATCH\n' >&2
    exit 96
  }
  zstd -q --test "$archive_stage" || {
    printf 'RELEASE_ARTIFACT_INSTALL_FAIL code=ARCHIVE_ZSTD_INVALID\n' >&2
    exit 96
  }
}

if test "$mode" = image-probe; then
  if ! docker image inspect "$candidate_image" >/dev/null 2>&1; then
    test ! -e "$image_receipt" || {
      printf 'RELEASE_ARTIFACT_INSTALL_FAIL code=IMAGE_RECEIPT_WITHOUT_IMAGE\n' >&2
      exit 96
    }
    printf 'RELEASE_ARTIFACT_IMAGE_MISSING sha=%s\n' "$candidate_sha"
    exit 42
  fi
  loaded_image_id="$(assert_image_receipt)"
  printf 'RELEASE_ARTIFACT_IMAGE_REUSED sha=%s config_digest=%s loaded_image_id=%s\n' \
    "$candidate_sha" "$image_config_digest" "$loaded_image_id"
  exit 0
fi

if test "$mode" = runtime-probe; then
  loaded_image_id="$(assert_image_receipt)"
  if test ! -e "$release"; then
    printf 'RELEASE_ARTIFACT_RUNTIME_MISSING sha=%s\n' "$candidate_sha"
    exit 42
  fi
  assert_runtime_release
  printf 'RELEASE_ARTIFACT_RUNTIME_REUSED sha=%s config_digest=%s loaded_image_id=%s\n' \
    "$candidate_sha" "$image_config_digest" "$loaded_image_id"
  exit 0
fi

if test "$mode" = image; then
  if docker image inspect "$candidate_image" >/dev/null 2>&1; then
    if test ! -f "$image_receipt"; then
      printf 'RELEASE_ARTIFACT_INSTALL_FAIL code=UNVERIFIED_EXISTING_IMAGE\n' >&2
      exit 96
    fi
    loaded_image_id="$(assert_image_receipt)"
    cat >/dev/null
    printf 'RELEASE_ARTIFACT_IMAGE_REUSED sha=%s config_digest=%s loaded_image_id=%s\n' \
      "$candidate_sha" "$image_config_digest" "$loaded_image_id"
    exit 0
  fi
  test ! -e "$image_receipt"
  test ! -L "$image_receipt"
  stream_stage="$(
    mktemp -d "$runtime_root/.release-staging/image-$candidate_sha.XXXXXXXX"
  )"
  stream_fifo="$stream_stage/image.tar"
  stream_hash="$stream_stage/image.tar.sha256"
  archive_stage="$stream_stage/app-image.tar.zst"
  receipt_stage="$stream_stage/receipt.env"
  cleanup_image_stream() {
    local exit_status=$?
    trap - EXIT INT TERM HUP
    set +e
    if test -d "$stream_stage"; then
      find "$stream_stage" -xdev -depth -delete
    fi
    exit "$exit_status"
  }
  trap cleanup_image_stream EXIT INT TERM HUP
  receive_archive "$archive_stage"
  mkfifo -m 0600 "$stream_fifo"
  sha256sum <"$stream_fifo" | cut -d ' ' -f 1 >"$stream_hash" &
  checksum_pid=$!
  load_output="$(zstd -q --decompress --stdout "$archive_stage" | tee "$stream_fifo" | docker load)"
  wait "$checksum_pid"
  test "$(cat "$stream_hash")" = "$image_tar_sha256" || {
    if docker image inspect "$candidate_image" >/dev/null 2>&1 &&
       test "$(
         docker ps -aq |
           xargs -r docker inspect --format '{{.Image}}' |
           awk -v image_id="$(docker image inspect --format '{{.Id}}' "$candidate_image")" \
             '$0 == image_id {count += 1} END {print count + 0}'
       )" = 0; then
      docker image rm "$candidate_image" >/dev/null
    fi
    printf 'RELEASE_ARTIFACT_INSTALL_FAIL code=IMAGE_TAR_HASH_MISMATCH\n' >&2
    exit 96
  }
  grep -Fq "Loaded image: $candidate_image" <<<"$load_output" || {
    printf 'RELEASE_ARTIFACT_INSTALL_FAIL code=IMAGE_LOAD_RECEIPT_MISMATCH\n' >&2
    exit 96
  }
  loaded_image_id="$(docker image inspect --format '{{.Id}}' "$candidate_image")"
  [[ "$loaded_image_id" =~ ^sha256:[0-9a-f]{64}$ ]]
  test "$(
    docker image inspect \
      --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' \
      "$candidate_image"
  )" = "$candidate_sha"
  docker run --rm --entrypoint /app/node_modules/.bin/tsx \
    "$candidate_image" scripts/release-smoke.ts </dev/null
  {
    printf 'format=agent-sozluk-artifact-image-v1\n'
    printf 'source_sha=%s\n' "$candidate_sha"
    printf 'image_config_digest=%s\n' "$image_config_digest"
    printf 'image_tar_sha256=%s\n' "$image_tar_sha256"
    printf 'loaded_image_id=%s\n' "$loaded_image_id"
  } >"$receipt_stage"
  sudo install -d -o root -g root -m 0555 "$receipt_root"
  sudo install -o root -g root -m 0444 "$receipt_stage" "$image_receipt"
  test "$(assert_image_receipt)" = "$loaded_image_id"
  trap - EXIT INT TERM HUP
  find "$stream_stage" -xdev -depth -delete
  printf 'RELEASE_ARTIFACT_IMAGE_READY sha=%s config_digest=%s loaded_image_id=%s\n' \
    "$candidate_sha" "$image_config_digest" "$loaded_image_id"
  exit 0
fi

loaded_image_id="$(assert_image_receipt)"
runtime_archive_stage="$runtime_root/.release-staging/runtime-$candidate_sha.$$.tar.zst"
runtime_stage="$(
  mktemp -d "$runtime_root/.release-staging/artifact-$candidate_sha.XXXXXXXX"
)"
runtime_publish="$runtime_root/releases/.artifact-$candidate_sha"
cleanup() {
  local exit_status=$?
  trap - EXIT INT TERM HUP
  set +e
  if test -n "${runtime_publish:-}" &&
     { test -e "$runtime_publish" || test -L "$runtime_publish"; }; then
    sudo find "$runtime_publish" -xdev -depth -delete
  fi
  if test -d "$runtime_stage"; then
    find "$runtime_stage" -xdev -depth -delete
  fi
  if test -f "${runtime_archive_stage:-}"; then
    find "$runtime_archive_stage" -xdev -delete
  fi
  exit "$exit_status"
}
trap cleanup EXIT INT TERM HUP

test ! -e "$runtime_archive_stage"
test ! -L "$runtime_archive_stage"
receive_archive "$runtime_archive_stage"
zstd -q --decompress --stdout "$runtime_archive_stage" |
  tar --extract --file=- --directory="$runtime_stage" \
  --no-same-owner --no-same-permissions
find "$runtime_archive_stage" -xdev -delete
test "$(cat "$runtime_stage/.release-sha")" = "$candidate_sha"
test "$(cat "$runtime_stage/.release-app-image-config-digest")" = \
  "$image_config_digest" || {
  printf 'RELEASE_ARTIFACT_INSTALL_FAIL code=RUNTIME_IMAGE_RECEIPT_MISMATCH\n' >&2
  exit 96
}
test "$(cat "$runtime_stage/.release-node-abi")" = "$runtime_abi"
test ! -e "$runtime_stage/.git"
test ! -e "$runtime_stage/.env"
test "$(/usr/bin/node -p 'process.platform + ":" + process.arch')" = linux:x64
test "$(/usr/bin/node -p 'process.versions.node.split(".")[0]')" = 22
test "$(/usr/bin/node -p 'process.versions.modules')" = 127
test -n "$(
  /usr/bin/node -p 'process.report.getReport().header.glibcVersionRuntime ?? ""'
)"
(
  cd "$runtime_stage"
  /usr/bin/node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const root = process.cwd();
const pending = [root];
while (pending.length > 0) {
  const current = pending.pop();
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const candidate = path.join(current, entry.name);
    if (entry.isDirectory()) pending.push(candidate);
    if (!entry.isSymbolicLink()) continue;
    const resolved = fs.realpathSync(candidate);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) process.exit(1);
  }
}
for (const relative of ["node_modules", "scripts/agent-runtime-worker.ts"]) {
  const resolved = fs.realpathSync(path.join(root, relative));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) process.exit(1);
}
const wrapperPath = require.resolve("@node-rs/argon2");
const wrapperRequire = createRequire(wrapperPath);
wrapperRequire.resolve("@node-rs/argon2-linux-x64-gnu");
const { hashSync, verifySync } = require("@node-rs/argon2");
const probe = "agent-sozluk-runtime-abi-probe";
const digest = hashSync(probe);
if (!verifySync(digest, probe)) process.exit(1);
const prismaClientPath = require.resolve("@prisma/client");
const prismaEnginePath = path.resolve(
  path.dirname(prismaClientPath),
  "../../.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node",
);
const prismaEngine = require(prismaEnginePath);
if (typeof prismaEngine.QueryEngine !== "function") process.exit(1);
const tsxPath = require.resolve("tsx");
createRequire(tsxPath).resolve("esbuild");
NODE
  ./node_modules/.bin/prisma -v |
    grep -Fq 'debian-openssl-3.0.x'
)

if test -d "$release"; then
  assert_runtime_release
  trap - EXIT INT TERM HUP
  find "$runtime_stage" -xdev -depth -delete
  printf 'RELEASE_ARTIFACT_RUNTIME_REUSED sha=%s config_digest=%s loaded_image_id=%s\n' \
    "$candidate_sha" "$image_config_digest" "$loaded_image_id"
  exit 0
fi
test ! -e "$release"
test ! -L "$release"
test ! -e "$runtime_publish"
test ! -L "$runtime_publish"
sudo install -d -o root -g root -m 0700 "$runtime_publish"
tar --create --hard-dereference --file=- --directory="$runtime_stage" . |
  sudo tar --extract --file=- --directory="$runtime_publish" \
    --no-same-owner --no-same-permissions
sudo chown -R root:root -- "$runtime_publish"
sudo find "$runtime_publish" -xdev -type d -exec chmod 0555 {} +
sudo find "$runtime_publish" -xdev -type f -perm /111 -exec chmod 0555 {} +
sudo find "$runtime_publish" -xdev -type f ! -perm /111 -exec chmod 0444 {} +
sudo mv -T "$runtime_publish" "$release"
runtime_publish=''
test -z "$(find "$release" -xdev ! -user root -print -quit)"
test -z "$(
  find "$release" -xdev \( -type f -o -type d \) -perm /022 -print -quit
)"
trap - EXIT INT TERM HUP
find "$runtime_stage" -xdev -depth -delete
printf 'RELEASE_ARTIFACT_RUNTIME_READY sha=%s config_digest=%s loaded_image_id=%s abi=%s\n' \
  "$candidate_sha" "$image_config_digest" "$loaded_image_id" "$runtime_abi"
