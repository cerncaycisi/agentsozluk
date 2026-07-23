#!/usr/bin/env bash
set -Eeuo pipefail

mode="${1:-}"
candidate_sha="${2:-}"
image_id="${3:-}"
runtime_abi="${4:-}"
app_root=/opt/agent-sozluk/app
runtime_root=/opt/agent-sozluk/runtime
candidate_image="agent-sozluk:$candidate_sha"

[[ "$mode" == image || "$mode" == runtime ]] || {
  printf 'RELEASE_ARTIFACT_INSTALL_FAIL code=INVALID_MODE\n' >&2
  exit 90
}
[[ "$candidate_sha" =~ ^[0-9a-f]{40}$ ]] || {
  printf 'RELEASE_ARTIFACT_INSTALL_FAIL code=INVALID_SHA\n' >&2
  exit 90
}
[[ "$image_id" =~ ^sha256:[0-9a-f]{64}$ ]] || {
  printf 'RELEASE_ARTIFACT_INSTALL_FAIL code=INVALID_IMAGE_ID\n' >&2
  exit 90
}
test "$runtime_abi" = linux-x64-glibc-node-abi-127 || {
  printf 'RELEASE_ARTIFACT_INSTALL_FAIL code=INVALID_RUNTIME_ABI\n' >&2
  exit 90
}
test "$(hostname)" = agent-sozluk-prod || exit 91
test "$(git -C "$app_root" remote get-url origin)" = \
  https://github.com/cerncaycisi/agentsozluk.git || exit 92
test -f "$runtime_root/compose.production.yaml" || exit 93
test "$(git -C "$app_root" rev-parse HEAD)" = "$candidate_sha"
test -z "$(git -C "$app_root" status --porcelain=v1 --untracked-files=all)"

assert_image() {
  test "$(docker image inspect --format '{{.Id}}' "$candidate_image")" = "$image_id"
  test "$(
    docker image inspect \
      --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' \
      "$candidate_image"
  )" = "$candidate_sha"
}

if test "$mode" = image; then
  if docker image inspect "$candidate_image" >/dev/null 2>&1; then
    assert_image
    cat >/dev/null
    printf 'RELEASE_ARTIFACT_IMAGE_REUSED sha=%s image_id=%s\n' \
      "$candidate_sha" "$image_id"
    exit 0
  fi
  docker load >/dev/null
  assert_image
  docker run --rm --entrypoint /app/node_modules/.bin/tsx \
    "$candidate_image" scripts/release-smoke.ts </dev/null
  printf 'RELEASE_ARTIFACT_IMAGE_READY sha=%s image_id=%s\n' \
    "$candidate_sha" "$image_id"
  exit 0
fi

release="$runtime_root/releases/$candidate_sha"
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
  exit "$exit_status"
}
trap cleanup EXIT INT TERM HUP

tar --extract --file=- --directory="$runtime_stage" \
  --no-same-owner --no-same-permissions
test "$(cat "$runtime_stage/.release-sha")" = "$candidate_sha"
test "$(cat "$runtime_stage/.release-app-image-id")" = "$image_id"
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
  test "$(cat "$release/.release-sha")" = "$candidate_sha"
  test "$(cat "$release/.release-app-image-id")" = "$image_id"
  test "$(cat "$release/.release-node-abi")" = "$runtime_abi"
  trap - EXIT INT TERM HUP
  find "$runtime_stage" -xdev -depth -delete
  printf 'RELEASE_ARTIFACT_RUNTIME_REUSED sha=%s image_id=%s\n' \
    "$candidate_sha" "$image_id"
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
printf 'RELEASE_ARTIFACT_RUNTIME_READY sha=%s image_id=%s abi=%s\n' \
  "$candidate_sha" "$image_id" "$runtime_abi"
