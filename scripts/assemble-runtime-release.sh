#!/usr/bin/env bash
set -Eeuo pipefail

candidate_sha=''
image_id=''
output=''

usage() {
  printf '%s\n' \
    'Usage:' \
    '  assemble-runtime-release.sh --sha <40-char-sha> --image-id <sha256:id> --output <new-dir>'
}

while (($# > 0)); do
  case "$1" in
    --sha)
      candidate_sha="${2:-}"
      shift 2
      ;;
    --image-id)
      image_id="${2:-}"
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
      printf 'RUNTIME_ASSEMBLY_FAIL code=UNKNOWN_ARGUMENT\n' >&2
      usage >&2
      exit 90
      ;;
  esac
done

[[ "$candidate_sha" =~ ^[0-9a-f]{40}$ ]] || {
  printf 'RUNTIME_ASSEMBLY_FAIL code=INVALID_SHA\n' >&2
  exit 90
}
[[ "$image_id" =~ ^sha256:[0-9a-f]{64}$ ]] || {
  printf 'RUNTIME_ASSEMBLY_FAIL code=INVALID_IMAGE_ID\n' >&2
  exit 90
}
test -n "$output" || {
  printf 'RUNTIME_ASSEMBLY_FAIL code=OUTPUT_REQUIRED\n' >&2
  exit 90
}

root="$(git rev-parse --show-toplevel)"
test "$(git -C "$root" rev-parse HEAD)" = "$candidate_sha"
test -z "$(git -C "$root" status --porcelain=v1 --untracked-files=all)"
test ! -e "$output"
test ! -L "$output"
node_bin="$(command -v node)"
pnpm_bin="$(command -v pnpm)"
test -n "$node_bin"
test -n "$pnpm_bin"
test "$("$node_bin" -p 'process.platform + ":" + process.arch')" = linux:x64
test "$("$node_bin" -p 'process.versions.node.split(".")[0]')" = 22
test "$("$node_bin" -p 'process.versions.modules')" = 127
test -n "$(
  "$node_bin" -p 'process.report.getReport().header.glibcVersionRuntime ?? ""'
)"
test "$("$pnpm_bin" --version | cut -d. -f1)" = 10

dependency_stage="$(
  mktemp -d "${TMPDIR:-/tmp}/agent-sozluk-runtime-dependencies.XXXXXXXX"
)"
output_created=0
cleanup() {
  local exit_status=$?
  trap - EXIT INT TERM HUP
  set +e
  if test -d "$dependency_stage"; then
    find "$dependency_stage" -xdev -depth -delete
  fi
  if ((exit_status != 0 && output_created == 1)) && test -d "$output"; then
    find "$output" -xdev -depth -delete
  fi
  exit "$exit_status"
}
trap cleanup EXIT INT TERM HUP

"$pnpm_bin" \
  --config.inject-workspace-packages=true \
  --filter @agent-sozluk/runtime-release \
  deploy --prod "$dependency_stage"

install -d -m 0700 "$output"
output_created=1
git -C "$root" archive --format=tar "$candidate_sha" |
  tar --extract --file=- --directory="$output" \
    --no-same-owner --no-same-permissions
test ! -e "$output/.git"
test ! -e "$output/.env"
test -d "$dependency_stage/node_modules"
tar --create --file=- --directory="$dependency_stage" node_modules |
  tar --extract --file=- --directory="$output" \
    --no-same-owner --no-same-permissions

(
  cd "$output"
  ./node_modules/.bin/prisma generate --schema prisma/schema.prisma
  "$node_bin" <<'NODE'
const { createRequire } = require("node:module");
const path = require("node:path");
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

runtime_abi="$(
  "$node_bin" -e \
    "const h=process.report.getReport().header;if(!h.glibcVersionRuntime)process.exit(1);process.stdout.write('linux-x64-glibc-node-abi-'+process.versions.modules)"
)"
printf '%s\n' "$candidate_sha" >"$output/.release-sha"
printf '%s\n' "$image_id" >"$output/.release-app-image-id"
printf '%s\n' "$runtime_abi" >"$output/.release-node-abi"

for required in \
  package.json \
  pnpm-lock.yaml \
  tsconfig.json \
  scripts/agent-runtime-worker.ts \
  node_modules/tsx/dist/cli.mjs \
  node_modules/.bin/tsx \
  node_modules/.bin/prisma; do
  test -e "$output/$required" || test -L "$output/$required"
done
for runtime_dependency in \
  @node-rs/argon2 \
  @prisma/client \
  dotenv \
  linkify-it \
  prisma \
  tsx \
  zod; do
  test -e "$output/node_modules/$runtime_dependency" ||
    test -L "$output/node_modules/$runtime_dependency"
done
test -L "$output/node_modules/tsx"
test -L "$output/node_modules/.pnpm/tsx@4.23.1/node_modules/esbuild"
test -n "$(
  find "$output/node_modules/.pnpm" -type f \
    -path '*/node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node' \
    -print -quit
)"

trap - EXIT INT TERM HUP
find "$dependency_stage" -xdev -depth -delete
printf 'RUNTIME_ASSEMBLY_READY sha=%s image_id=%s abi=%s\n' \
  "$candidate_sha" "$image_id" "$runtime_abi"
