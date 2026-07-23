#!/usr/bin/env bash
set -Eeuo pipefail

candidate_sha="${1:-}"
cleanup_requested="${2:-no-cleanup}"
app_root=/opt/agent-sozluk/app
runtime_root=/opt/agent-sozluk/runtime
compose_file="$runtime_root/compose.production.yaml"
env_file="$app_root/.env"
state_dir="$runtime_root/.release-op-$candidate_sha"
candidate_image="agent-sozluk:$candidate_sha"
override="$state_dir/no-migration-compose.yaml"

[[ "$candidate_sha" =~ ^[0-9a-f]{40}$ ]] || {
  printf 'RELEASE_FAIL code=INVALID_SHA\n' >&2
  exit 90
}
[[ "$cleanup_requested" == no-cleanup || "$cleanup_requested" == cleanup ]] || {
  printf 'RELEASE_FAIL code=INVALID_CLEANUP_MODE\n' >&2
  exit 90
}
test "$(hostname)" = agent-sozluk-prod || exit 91
test "$(git -C "$app_root" remote get-url origin)" = \
  https://github.com/cerncaycisi/agentsozluk.git || exit 92
test -f "$compose_file" || exit 93
test -f "$env_file" || exit 94
test "$(git -C "$app_root" rev-parse HEAD)" = "$candidate_sha"
test -z "$(git -C "$app_root" status --porcelain=v1 --untracked-files=all)"
install -d -m 0700 "$state_dir"

compose=(
  docker compose
  --env-file "$env_file"
  -f "$compose_file"
)

hash_stream() {
  sha256sum | cut -d ' ' -f 1
}

migration_snapshot() {
  "${compose[@]}" exec -T db psql -XAtq -v ON_ERROR_STOP=1 \
    -U agent_sozluk -d agent_sozluk \
    -c 'SELECT migration_name FROM "_prisma_migrations"
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
        ORDER BY migration_name;' </dev/null
}

candidate_migration_snapshot() {
  find "$app_root/prisma/migrations" -mindepth 1 -maxdepth 1 -type d \
    -printf '%f\n' |
    LC_ALL=C sort
}

settings_fingerprint() {
  "${compose[@]}" exec -T db psql -XAtq -v ON_ERROR_STOP=1 \
    -U agent_sozluk -d agent_sozluk \
    -c 'SELECT to_jsonb(s)::text FROM agent_global_settings s ORDER BY id;' \
    </dev/null |
    hash_stream
}

lifecycle_fingerprint() {
  "${compose[@]}" exec -T db psql -XAtq -v ON_ERROR_STOP=1 \
    -U agent_sozluk -d agent_sozluk \
    -c 'SELECT id::text || chr(124) || "lifecycleStatus"::text ||
               chr(124) || coalesce("currentPersonaVersionId"::text, chr(45)) ||
               chr(124) || "useGlobalEntryQuota"::text ||
               chr(124) || coalesce("dailyEntryMin"::text, chr(45)) ||
               chr(124) || coalesce("dailyEntryMax"::text, chr(45)) ||
               chr(124) || "dailyTopicMin"::text ||
               chr(124) || "dailyTopicMax"::text ||
               chr(124) || "dailyVoteMin"::text ||
               chr(124) || "dailyVoteMax"::text
        FROM agent_profiles ORDER BY id;' </dev/null |
    hash_stream
}

run_counts() {
  "${compose[@]}" exec -T db psql -XAtq -v ON_ERROR_STOP=1 \
    -U agent_sozluk -d agent_sozluk \
    -c "SELECT
          count(*) FILTER (WHERE \"runStatus\" = 'QUEUED')::text || chr(124) ||
          count(*) FILTER (WHERE \"runStatus\" = 'RUNNING')::text || chr(124) ||
          count(*) FILTER (WHERE \"runStatus\" = 'CANCEL_REQUESTED')::text || chr(124) ||
          count(*) FILTER (
            WHERE \"leaseToken\" IS NOT NULL AND \"leaseExpiresAt\" > now()
          )::text
        FROM agent_runs;" </dev/null
}

wait_for_no_active_work() {
  local attempt counts queued running cancel_requested leases
  for attempt in $(seq 1 80); do
    counts="$(run_counts)"
    IFS='|' read -r queued running cancel_requested leases <<<"$counts"
    printf 'RELEASE_DRAIN attempt=%s queued=%s running=%s cancel_requested=%s leases=%s\n' \
      "$attempt" "$queued" "$running" "$cancel_requested" "$leases"
    if ((running == 0 && cancel_requested == 0 && leases == 0)); then
      return 0
    fi
    sleep 15
  done
  printf 'RELEASE_FAIL code=RUN_DRAIN_TIMEOUT\n' >&2
  return 1
}

assert_state_fingerprints() {
  test "$(settings_fingerprint)" = "$(cat "$state_dir/settings-hash")"
  test "$(lifecycle_fingerprint)" = "$(cat "$state_dir/lifecycle-hash")"
}

assert_no_migration() {
  migration_snapshot >"$state_dir/applied-migrations"
  candidate_migration_snapshot >"$state_dir/candidate-migrations"
  cmp -s "$state_dir/applied-migrations" "$state_dir/candidate-migrations" || {
    printf 'RELEASE_FAIL code=MIGRATION_SET_CHANGED\n' >&2
    exit 95
  }
}

assert_health() {
  local path internal_status public_status
  for path in health ready; do
    internal_status="$(
      "${compose[@]}" exec -T app node -e \
        "fetch('http://127.0.0.1:3000/api/$path').then(r=>process.stdout.write(String(r.status))).catch(()=>process.exit(1))" \
        </dev/null
    )"
    public_status="$(
      curl -fsS -o /dev/null -w '%{http_code}' \
        "https://agentsozluk.com/api/$path"
    )"
    test "$internal_status" = 200
    test "$public_status" = 200
  done
}

assert_release() {
  local release="$runtime_root/releases/$candidate_sha"
  test -d "$release"
  test "$(cat "$release/.release-sha")" = "$candidate_sha"
  test "$(cat "$release/.release-app-image-id")" = "$(cat "$state_dir/candidate-image-id")"
  test -z "$(find "$release" -xdev ! -user root -print -quit)"
  test -z "$(
    find "$release" -xdev \( -type f -o -type d \) -perm /022 -print -quit
  )"
  test -L "$release/node_modules/tsx"
  test -L "$release/node_modules/.pnpm/tsx@4.23.1/node_modules/esbuild"
}

capture_initial_state() {
  local app_container previous_runtime
  app_container="$("${compose[@]}" ps --status running -q app)"
  test -n "$app_container"
  previous_runtime="$(readlink -e "$runtime_root/current")"
  [[ "$previous_runtime" =~ ^/opt/agent-sozluk/runtime/releases/[0-9a-f]{40}$ ]]
  printf '%s\n' "$previous_runtime" >"$state_dir/previous-runtime"
  docker inspect --format '{{.Image}}' "$app_container" >"$state_dir/previous-image-id"
  settings_fingerprint >"$state_dir/settings-hash"
  lifecycle_fingerprint >"$state_dir/lifecycle-hash"
  migration_snapshot >"$state_dir/applied-migrations"
  candidate_migration_snapshot >"$state_dir/candidate-migrations"
  cmp -s "$state_dir/applied-migrations" "$state_dir/candidate-migrations" || {
    printf 'RELEASE_FAIL code=MIGRATION_SET_CHANGED\n' >&2
    exit 95
  }
  docker volume ls -q |
    LC_ALL=C sort |
    hash_stream >"$state_dir/volume-hash"
  docker ps -aq |
    xargs -r docker inspect --format '{{.Image}}' |
    LC_ALL=C sort -u |
    hash_stream >"$state_dir/container-image-hash"
}

build_candidate_image() {
  local free_kib used_percent image_id
  free_kib="$(df -Pk / | awk 'NR == 2 {print $4}')"
  used_percent="$(df -Pk / | awk 'NR == 2 {gsub("%", "", $5); print $5}')"
  if ((free_kib < 8388608 || used_percent >= 90)); then
    printf 'RELEASE_FAIL code=DISK_HEADROOM used_percent=%s free_kib=%s\n' \
      "$used_percent" "$free_kib" >&2
    exit 96
  fi
  if docker image inspect "$candidate_image" >/dev/null 2>&1; then
    test "$(
      docker image inspect \
        --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' \
        "$candidate_image"
    )" = "$candidate_sha"
  else
    APP_IMAGE="$candidate_image" "${compose[@]}" build --pull=false \
      --build-arg "SOURCE_REVISION=$candidate_sha" app
  fi
  image_id="$(docker image inspect --format '{{.Id}}' "$candidate_image")"
  printf '%s\n' "$image_id" >"$state_dir/candidate-image-id"
  docker run --rm --entrypoint /app/node_modules/.bin/tsx \
    "$candidate_image" scripts/release-smoke.ts </dev/null
  printf 'RELEASE_IMAGE_READY sha=%s image_id=%s\n' "$candidate_sha" "$image_id"
}

build_runtime_release() {
  local release="$runtime_root/releases/$candidate_sha"
  local image_id runtime_stage runtime_publish runtime_abi
  image_id="$(cat "$state_dir/candidate-image-id")"
  if test -d "$release"; then
    assert_release
    printf 'RELEASE_RUNTIME_REUSED sha=%s\n' "$candidate_sha"
    return
  fi
  test ! -e "$release"
  test ! -L "$release"
  runtime_stage="$(
    mktemp -d "$runtime_root/.release-staging/release-$candidate_sha.XXXXXXXX"
  )"
  find "$runtime_stage" -xdev -depth -delete
  runtime_publish="$runtime_root/releases/.candidate-$candidate_sha"
  test ! -e "$runtime_publish"
  test ! -L "$runtime_publish"
  runtime_cleanup() {
    local status=$?
    trap - EXIT INT TERM HUP
    set +e
    if test -n "${runtime_publish:-}" &&
       { test -e "$runtime_publish" || test -L "$runtime_publish"; }; then
      sudo find "$runtime_publish" -xdev -depth -delete
    fi
    if test -n "${runtime_stage:-}" && test -d "$runtime_stage"; then
      find "$runtime_stage" -xdev -depth -delete
    fi
    exit "$status"
  }
  trap runtime_cleanup EXIT INT TERM HUP

  bash -n "$app_root/scripts/assemble-runtime-release.sh"
  install_env=(
    /usr/bin/env -i
    HOME=/home/deploy
    PATH=/usr/bin:/usr/local/bin:/bin
    CI=true
    NODE_ENV=production
    LANG=C.UTF-8
    LC_ALL=C.UTF-8
    NPM_CONFIG_USERCONFIG=/dev/null
    NODE_USE_SYSTEM_CA=1
    npm_config_update_notifier=false
  )
  "${install_env[@]}" /usr/bin/bash "$app_root/scripts/assemble-runtime-release.sh" \
    --sha "$candidate_sha" \
    --image-id "$image_id" \
    --output "$runtime_stage"
  runtime_abi="$(cat "$runtime_stage/.release-node-abi")"

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
  assert_release
  trap - EXIT INT TERM HUP
  find "$runtime_stage" -xdev -depth -delete
  printf 'RELEASE_RUNTIME_READY sha=%s abi=%s\n' "$candidate_sha" "$runtime_abi"
}

write_no_migration_override() {
  umask 077
  {
    printf '%s\n' \
      'services:' \
      '  app:' \
      '    entrypoint:' \
      '      - /bin/sh' \
      '      - -c' \
      '      - >-' \
      '        ./node_modules/.bin/tsx scripts/validate-environment.ts &&' \
      '        node ./scripts/wait-for-database.mjs &&' \
      '        exec node server.js'
  } >"$override"
  chmod 0600 "$override"
}

cutover() {
  local image_id app_container current_sha counts queued running cancel_requested leases
  local candidate_compose runtime_next entrypoint_json worker_state app_health
  image_id="$(cat "$state_dir/candidate-image-id")"
  assert_no_migration
  assert_state_fingerprints
  assert_release
  app_container="$("${compose[@]}" ps --all -q app)"
  current_sha="$(cat "$runtime_root/current/.release-sha")"
  app_health=''
  if test -n "$app_container" &&
     test "$(docker inspect --format '{{.Image}}' "$app_container")" = "$image_id"; then
    app_health="$(
      docker inspect \
        --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
        "$app_container"
    )"
  fi

  if test "$app_health" != healthy; then
    wait_for_no_active_work
    sudo systemctl stop agent-sozluk-runtime.service
    test "$(systemctl show agent-sozluk-runtime.service -p ActiveState --value)" = inactive
    counts="$(run_counts)"
    IFS='|' read -r queued running cancel_requested leases <<<"$counts"
    test "$running" = 0
    test "$cancel_requested" = 0
    test "$leases" = 0
    write_no_migration_override
    candidate_compose=(
      docker compose
      --env-file "$env_file"
      -f "$compose_file"
      -f "$override"
    )
    APP_IMAGE="$candidate_image" "${candidate_compose[@]}" config --quiet </dev/null
    APP_IMAGE="$candidate_image" "${candidate_compose[@]}" up -d \
      --no-deps --no-build --pull never --force-recreate app </dev/null
    for _ in $(seq 1 60); do
      app_container="$("${compose[@]}" ps --status running -q app)"
      if test -n "$app_container" &&
         app_health="$(
           docker inspect \
             --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
             "$app_container"
         )" &&
         test "$app_health" = healthy; then
        break
      fi
      sleep 2
    done
  fi

  app_container="$("${compose[@]}" ps --status running -q app)"
  test -n "$app_container"
  test "$(
    docker inspect \
      --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
      "$app_container"
  )" = healthy
  test "$(docker inspect --format '{{.Image}}' "$app_container")" = "$image_id"
  test "$(
    docker inspect \
      --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' \
      "$app_container"
  )" = "$candidate_sha"
  entrypoint_json="$(
    docker inspect --format '{{json .Config.Entrypoint}}' "$app_container"
  )"
  ENTRYPOINT_JSON="$entrypoint_json" /usr/bin/node <<'NODE'
const value = JSON.parse(process.env.ENTRYPOINT_JSON ?? "null");
if (!Array.isArray(value) || value[0] !== "/bin/sh" || value[1] !== "-c") process.exit(1);
const command = value.slice(2).join(" ");
if (!command.includes("validate-environment.ts") ||
    !command.includes("wait-for-database.mjs") ||
    !command.includes("node server.js") ||
    command.includes("prisma migrate")) process.exit(1);
NODE
  "${compose[@]}" exec -T app ./node_modules/.bin/tsx \
    scripts/release-smoke.ts --base-url http://127.0.0.1:3000 </dev/null
  assert_no_migration
  assert_state_fingerprints

  if test "$current_sha" != "$candidate_sha"; then
    worker_state="$(
      systemctl show agent-sozluk-runtime.service -p ActiveState --value
    )"
    if test "$worker_state" = active; then
      wait_for_no_active_work
      sudo systemctl stop agent-sozluk-runtime.service
    fi
    test "$(
      systemctl show agent-sozluk-runtime.service -p ActiveState --value
    )" = inactive
    test "$(
      systemctl show agent-sozluk-runtime.service -p SubState --value
    )" = dead
    test "$(
      readlink -e "$runtime_root/current"
    )" = "$(cat "$state_dir/previous-runtime")"
    runtime_next="$runtime_root/.current-$candidate_sha"
    test ! -e "$runtime_next"
    test ! -L "$runtime_next"
    sudo ln -s "releases/$candidate_sha" "$runtime_next"
    sudo chown -h root:root "$runtime_next"
    sudo mv -Tf "$runtime_next" "$runtime_root/current"
  fi
  test "$(cat "$runtime_root/current/.release-sha")" = "$candidate_sha"

  sudo systemctl start agent-sozluk-runtime.service
  for _ in $(seq 1 30); do
    if test "$(
      systemctl show agent-sozluk-runtime.service -p ActiveState --value
    )" = active &&
       test "$(
         systemctl show agent-sozluk-runtime.service -p SubState --value
       )" = running; then
      break
    fi
    sleep 2
  done
  test "$(systemctl show agent-sozluk-runtime.service -p ActiveState --value)" = active
  test "$(systemctl show agent-sozluk-runtime.service -p SubState --value)" = running
  test "$(systemctl show agent-sozluk-runtime.service -p NRestarts --value)" = 0
  find "$state_dir" -maxdepth 1 -type f -name 'no-migration-compose.yaml' -delete
}

verify_release() {
  local image_id app_container volume_hash container_hash
  image_id="$(cat "$state_dir/candidate-image-id")"
  app_container="$("${compose[@]}" ps --status running -q app)"
  test -n "$app_container"
  test "$(docker inspect --format '{{.Image}}' "$app_container")" = "$image_id"
  test "$(cat "$runtime_root/current/.release-sha")" = "$candidate_sha"
  assert_release
  assert_no_migration
  assert_state_fingerprints
  assert_health
  "${compose[@]}" exec -T app ./node_modules/.bin/tsx \
    scripts/release-smoke.ts --base-url http://127.0.0.1:3000 </dev/null
  test "$(systemctl show agent-sozluk-runtime.service -p ActiveState --value)" = active
  test "$(systemctl show agent-sozluk-runtime.service -p SubState --value)" = running
  test "$(systemctl show agent-sozluk-runtime.service -p NRestarts --value)" = 0
  volume_hash="$(
    docker volume ls -q |
      LC_ALL=C sort |
      hash_stream
  )"
  container_hash="$(
    docker ps -aq |
      xargs -r docker inspect --format '{{.Image}}' |
      LC_ALL=C sort -u |
      hash_stream
  )"
  test "$volume_hash" = "$(cat "$state_dir/volume-hash")"
  printf '%s\n' "$container_hash" >"$state_dir/post-container-image-hash"
  printf 'RELEASE_VERIFY PASS sha=%s image_id=%s worker=active/running health=200 ready=200\n' \
    "$candidate_sha" "$image_id"
}

cleanup_images() {
  local candidate_id previous_id volume_hash_before volume_hash_after
  local container_hash_before container_hash_after disk_before disk_after
  local previous_runtime current_runtime release release_name
  local container_id record ref image_id removed=0 removed_releases=0
  local -a container_ids app_refs
  candidate_id="$(cat "$state_dir/candidate-image-id")"
  previous_id="$(cat "$state_dir/previous-image-id")"
  previous_runtime="$(cat "$state_dir/previous-runtime")"
  current_runtime="$(readlink -e "$runtime_root/current")"
  test "$current_runtime" = "$runtime_root/releases/$candidate_sha"
  [[ "$previous_runtime" =~ ^/opt/agent-sozluk/runtime/releases/[0-9a-f]{40}$ ]]
  volume_hash_before="$(
    docker volume ls -q |
      LC_ALL=C sort |
      hash_stream
  )"
  container_hash_before="$(
    docker ps -aq |
      xargs -r docker inspect --format '{{.Image}}' |
      LC_ALL=C sort -u |
      hash_stream
  )"
  disk_before="$(df -Pk / | awk 'NR == 2 {print $5 "|" $4}')"
  mapfile -t container_ids < <(
    docker ps -aq |
      xargs -r docker inspect --format '{{.Image}}' |
      LC_ALL=C sort -u
  )
  mapfile -t app_refs < <(
    docker image ls --no-trunc \
      --filter 'reference=agent-sozluk:*' \
      --format '{{.Repository}}:{{.Tag}}|{{.ID}}' |
      LC_ALL=C sort
  )
  for record in "${app_refs[@]}"; do
    ref="${record%%|*}"
    image_id="${record#*|}"
    if test "$image_id" = "$candidate_id" || test "$image_id" = "$previous_id"; then
      continue
    fi
    for container_id in "${container_ids[@]}"; do
      if test "$image_id" = "$container_id"; then
        image_id=''
        break
      fi
    done
    test -n "$image_id" || continue
    docker image rm "$ref"
    removed=$((removed + 1))
  done
  docker builder prune --force --filter 'until=24h'
  for release in "$runtime_root"/releases/*; do
    test -d "$release" || continue
    test ! -L "$release"
    release_name="${release##*/}"
    [[ "$release_name" =~ ^[0-9a-f]{40}$ ]] || continue
    if test "$release" = "$current_runtime" || test "$release" = "$previous_runtime"; then
      continue
    fi
    sudo find "$release" -xdev -depth -delete
    removed_releases=$((removed_releases + 1))
  done
  test -d "$current_runtime"
  test -d "$previous_runtime"
  test "$(docker image inspect --format '{{.Id}}' "$candidate_image")" = "$candidate_id"
  docker image inspect "$previous_id" >/dev/null
  volume_hash_after="$(
    docker volume ls -q |
      LC_ALL=C sort |
      hash_stream
  )"
  container_hash_after="$(
    docker ps -aq |
      xargs -r docker inspect --format '{{.Image}}' |
      LC_ALL=C sort -u |
      hash_stream
  )"
  disk_after="$(df -Pk / | awk 'NR == 2 {print $5 "|" $4}')"
  test "$volume_hash_after" = "$volume_hash_before"
  test "$volume_hash_after" = "$(cat "$state_dir/volume-hash")"
  test "$container_hash_after" = "$container_hash_before"
  verify_release
  printf 'RELEASE_CLEANUP PASS removed_app_images=%s removed_runtime_releases=%s disk_before=%s disk_after=%s volume_hash=%s container_hash=%s\n' \
    "$removed" \
    "$removed_releases" \
    "$disk_before" \
    "$disk_after" \
    "$volume_hash_after" \
    "$container_hash_after"
}

if test ! -f "$state_dir/settings-hash"; then
  capture_initial_state
else
  assert_state_fingerprints
fi
build_candidate_image
build_runtime_release
cutover
verify_release
if test "$cleanup_requested" = cleanup; then cleanup_images; fi
printf 'RELEASE_COMPLETE PASS sha=%s cleanup=%s\n' \
  "$candidate_sha" "$cleanup_requested"
