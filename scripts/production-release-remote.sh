#!/usr/bin/env bash
set -Eeuo pipefail

report_unexpected_error() {
  local exit_status=$?
  printf 'RELEASE_FAIL code=UNEXPECTED line=%s status=%s\n' \
    "${BASH_LINENO[0]:-unknown}" "$exit_status" >&2
  exit "$exit_status"
}
trap report_unexpected_error ERR

candidate_sha="${1:-}"
cleanup_requested="${2:-no-cleanup}"
# `no-migration`, `apply:<liste>` veya `reviewed:october-2026-v1|october-2026-v2|reset-2026-v1:<liste>`.
migration_mode="${3:-}"
# Sarmalayıcının kilit sahipliği için ürettiği operasyon kimliği.
op_id="${4:-}"
app_root=/opt/agent-sozluk/app
runtime_root=/opt/agent-sozluk/runtime
compose_file="$runtime_root/compose.production.yaml"
env_file="$app_root/.env"
state_dir="$runtime_root/.release-op-$candidate_sha"
candidate_image="agent-sozluk:$candidate_sha"
override="$state_dir/no-migration-compose.yaml"
artifact_image_receipt="$runtime_root/artifact-receipts/$candidate_sha.env"
runtime_unit_source="$app_root/deploy/systemd/agent-sozluk-runtime.service"
runtime_unit_target=/etc/systemd/system/agent-sozluk-runtime.service

[[ "$candidate_sha" =~ ^[0-9a-f]{40}$ ]] || {
  printf 'RELEASE_FAIL code=INVALID_SHA\n' >&2
  exit 90
}
[[ "$cleanup_requested" == no-cleanup || "$cleanup_requested" == cleanup ]] || {
  printf 'RELEASE_FAIL code=INVALID_CLEANUP_MODE\n' >&2
  exit 90
}
approved_migrations=''
reviewed_migration_profile=''
if test "$migration_mode" != no-migration; then
  if [[ "$migration_mode" =~ ^reviewed:(october-2026-v1|october-2026-v2|reset-2026-v1):([0-9]{14}_[a-z0-9_]+)(,[0-9]{14}_[a-z0-9_]+)*$ ]]; then
    reviewed_migration_profile="${BASH_REMATCH[1]}"
    approved_migrations="${migration_mode#reviewed:$reviewed_migration_profile:}"
  elif [[ "$migration_mode" =~ ^apply:([0-9]{14}_[a-z0-9_]+)(,[0-9]{14}_[a-z0-9_]+)*$ ]]; then
    approved_migrations="${migration_mode#apply:}"
  else
    printf 'RELEASE_FAIL code=INVALID_MIGRATION_MODE\n' >&2
    exit 90
  fi
fi
[[ "$op_id" =~ ^[0-9a-f]{16}$ ]] || {
  printf 'RELEASE_FAIL code=INVALID_OPERATION_ID\n' >&2
  exit 90
}
test "$(hostname)" = agent-sozluk-prod || exit 91
# /opt/agent-sozluk/reset root:root 0700'dür; deploy kullanıcısının sudo'suz
# `test -e` sorgusu her yolda "yok" der. 6 Ekim'de nesil overlay'i bu yüzden
# atlandı ve aday açılış kabulünde düştü. Reset yolları yalnız sudo ile okunur;
# sudo veya sorgu hatası hiçbir zaman "yok" sayılmaz: yalnız açık `absent` kabul.
reset_root=/opt/agent-sozluk/reset
root_path_result=''
root_path_state() {
  local state
  state="$(
    sudo -n sh -c 'if test -L "$1"; then echo link; elif test -e "$1"; then echo present; else echo absent; fi' \
      root-path-probe "$1" </dev/null
  )" || state=''
  case "$state" in
    present | absent | link) root_path_result="$state" ;;
    *)
      printf 'RELEASE_FAIL code=ROOT_PROBE_UNAVAILABLE\n' >&2
      exit 97
      ;;
  esac
}
root_path_state "$reset_root/maintenance-hold"
if test "$root_path_result" != absent; then
  printf 'RELEASE_FAIL code=RESET_MAINTENANCE_HOLD\n' >&2
  exit 97
fi
test "$(git -C "$app_root" remote get-url origin)" = \
  https://github.com/cerncaycisi/agentsozluk.git || exit 92
test -f "$compose_file" || exit 93
test -f "$env_file" || exit 94
test "$(git -C "$app_root" rev-parse HEAD)" = "$candidate_sha"
test -z "$(git -C "$app_root" status --porcelain=v1 --untracked-files=all)"
# Kilit sarmalayıcının ilk uzak adımında alındı; bu koşu onun sahibi olmalı.
test "$(cat "$runtime_root/.release-lock/owner" 2>/dev/null)" = "$candidate_sha:$op_id" || {
  printf 'RELEASE_FAIL code=RELEASE_LOCK_NOT_OWNED\n' >&2
  exit 97
}
compose=(
  docker compose
  --env-file "$env_file"
  -f "$compose_file"
)

# DB backup dışında kalıcı root nesil latch'i bütün sonraki cutover'larda bağlanır.
# İlk reset hazırlığı bu dizini yaratır; latch henüz yokken legacy boot mümkündür.
generation_dir="$reset_root/generation"
generation_override="$runtime_root/reset-generation-compose.yaml"
generation_required=0
generation_overlay=0
resolve_reset_generation() {
  local mirror_json
  root_path_state "$generation_dir"
  if test "$root_path_result" != absent; then
    test "$root_path_result" = present
    test "$(sudo -n stat -c '%U|%G|%a' "$generation_dir")" = 'root|root|755'
    test "$(sudo -n readlink -e "$generation_dir")" = "$generation_dir"
    test ! -L "$generation_override"
    test "$(stat -c '%U|%G|%a' "$generation_override")" = 'root|root|444'
    compose+=(-f "$generation_override")
    generation_overlay=1
    root_path_state "$generation_dir/required.json"
    if test "$root_path_result" != absent; then
      test "$root_path_result" = present
      generation_required=1
      mirror_json="$(sudo -n cat "$generation_dir/current.json")"
      MIRROR_JSON="$mirror_json" node - <<'NODE'
try {
  const mirror = JSON.parse(process.env.MIRROR_JSON ?? "");
  if (!["TRAFFIC_OPEN", "ROLLED_BACK"].includes(mirror.state)) throw new Error();
} catch {
  process.stderr.write("RELEASE_FAIL code=RESET_MAINTENANCE_HOLD\n");
  process.exit(97);
}
NODE
    fi
  elif test -e "$generation_override" || test -L "$generation_override"; then
    # Overlay kurulmuş ama nesil dizini görülemiyor: legacy boot'a düşülmez.
    printf 'RELEASE_FAIL code=RESET_GENERATION_UNRESOLVED\n' >&2
    exit 97
  fi
}
resolve_reset_generation

# Tamamlanmamış bir migration operasyonu varken migration'sız dağıtım olmaz.
# `cutover-done` yazılıp işaret silinemeden kesilen bir koşu tamamlanmıştır:
# işaret kaldırılır (Sol, 23 Eylül).
if test -e "$runtime_root/.migration-operation" && test "$migration_mode" = no-migration; then
  if test "$(cat "$runtime_root/.migration-operation/phase" 2>/dev/null)" = cutover-done; then
    find "$runtime_root/.migration-operation" -xdev -depth -delete
    printf 'RELEASE_MIGRATION_MARKER_CLEARED phase=cutover-done\n'
  else
    printf 'RELEASE_FAIL code=MIGRATION_OPERATION_INCOMPLETE\n' >&2
    exit 97
  fi
fi
install -d -m 0700 "$state_dir"

hash_stream() {
  sha256sum | cut -d ' ' -f 1
}

artifact_receipt_value() {
  local key="$1"
  awk -F= -v key="$key" \
    '$1 == key {print substr($0, length(key) + 2)}' "$artifact_image_receipt"
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
  # Exact Ekim profilleri dört ayarı OFF/NULL ile ekler. Eksik sütunları
  # aynı başlangıç değerleriyle tamamla; mevcut (eski/yeni) değerleri koru.
  # Eksik sütun ve başlangıç değeri bu özette eşittir; varlık/tip katalogda sınanır.
  "${compose[@]}" exec -T db psql -XAtq -v ON_ERROR_STOP=1 \
    -v "profile=$reviewed_migration_profile" -U agent_sozluk -d agent_sozluk <<'SQL' | hash_stream
SET TimeZone = 'UTC';
SELECT (CASE WHEN :'profile' IN ('october-2026-v1', 'october-2026-v2')
  THEN jsonb_build_object('rewardMode', 'OFF', 'birthMode', 'OFF',
    'lastBirthScanAt', NULL, 'lastBirthCandidateAt', NULL) || to_jsonb(s)
  ELSE to_jsonb(s) END)::text
FROM agent_global_settings s ORDER BY id;
SQL
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

install_runtime_unit() {
  local counts queued running cancel_requested leases
  local source_hash target_hash worker_state unit_stage
  test -f "$runtime_unit_source"
  test ! -L "$runtime_unit_source"
  source_hash="$(sha256sum "$runtime_unit_source" | cut -d ' ' -f 1)"
  target_hash=''
  if sudo test -f "$runtime_unit_target" &&
     ! sudo test -L "$runtime_unit_target"; then
    target_hash="$(
      sudo sha256sum "$runtime_unit_target" |
        cut -d ' ' -f 1
    )"
  fi
  if test "$target_hash" = "$source_hash"; then
    printf 'RELEASE_RUNTIME_UNIT_REUSED sha256=%s\n' "$source_hash"
    return
  fi

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
  counts="$(run_counts)"
  IFS='|' read -r queued running cancel_requested leases <<<"$counts"
  test "$running" = 0
  test "$cancel_requested" = 0
  test "$leases" = 0

  unit_stage="$(
    sudo mktemp /etc/systemd/system/.agent-sozluk-runtime.service.XXXXXXXX
  )"
  if ! sudo install -o root -g root -m 0644 "$runtime_unit_source" "$unit_stage"; then
    sudo rm -f "$unit_stage"
    return 1
  fi
  if ! sudo mv -f "$unit_stage" "$runtime_unit_target"; then
    sudo rm -f "$unit_stage"
    return 1
  fi
  sudo systemctl daemon-reload
  test "$(
    sudo sha256sum "$runtime_unit_target" |
      cut -d ' ' -f 1
  )" = "$source_hash"
  printf 'RELEASE_RUNTIME_UNIT_READY sha256=%s\n' "$source_hash"
}

assert_runtime_unit() {
  local source_hash target_hash main_pid main_args
  source_hash="$(sha256sum "$runtime_unit_source" | cut -d ' ' -f 1)"
  target_hash="$(
    sudo sha256sum "$runtime_unit_target" |
      cut -d ' ' -f 1
  )"
  test "$target_hash" = "$source_hash"
  test "$(
    systemctl show agent-sozluk-runtime.service -p TimeoutStopUSec --value
  )" = 21min
  main_pid="$(
    systemctl show agent-sozluk-runtime.service -p MainPID --value
  )"
  [[ "$main_pid" =~ ^[1-9][0-9]*$ ]]
  main_args="$(ps -p "$main_pid" -o args=)"
  test "$main_args" = \
    '/usr/bin/node --require /opt/agent-sozluk/runtime/current/node_modules/tsx/dist/preflight.cjs --import file:///opt/agent-sozluk/runtime/current/node_modules/tsx/dist/loader.mjs scripts/agent-runtime-worker.ts'
}

assert_state_fingerprints() {
  if ! test -f "$state_dir/settings-profile" ||
     ! test "$reviewed_migration_profile" = "$(cat "$state_dir/settings-profile")"; then
    printf 'RELEASE_FAIL code=SETTINGS_PROFILE_CHANGED\n' >&2
    exit 97
  fi
  test "$(settings_fingerprint)" = "$(cat "$state_dir/settings-hash")"
  test "$(lifecycle_fingerprint)" = "$(cat "$state_dir/lifecycle-hash")"
}

# Başlangıç kaydı (`baseline-*`) değişmez; her kontrol kendi dosyasına yazar.
assert_no_migration() {
  migration_snapshot >"$state_dir/check-applied-migrations"
  candidate_migration_snapshot >"$state_dir/check-candidate-migrations"
  cmp -s "$state_dir/check-applied-migrations" "$state_dir/check-candidate-migrations" || {
    printf 'RELEASE_FAIL code=MIGRATION_SET_CHANGED\n' >&2
    exit 95
  }
}

assert_internal_health() {
  local path internal_status
  for path in health ready; do
    internal_status="$(
      timeout 20 "${compose[@]}" exec -T app node -e \
        "fetch('http://127.0.0.1:3000/api/$path').then(r=>process.stdout.write(String(r.status))).catch(()=>process.exit(1))" \
        </dev/null
    )" || return 1
    test "$internal_status" = 200 || return 1
  done
}

assert_public_health() {
  local path public_status
  for path in health ready; do
    public_status="$(
      curl -fsS --connect-timeout 5 --max-time 10 -o /dev/null -w '%{http_code}' \
        "https://agentsozluk.com/api/$path"
    )" || return 1
    test "$public_status" = 200 || return 1
  done
}

# Caddy yeni başlatıldığında ilk dış istek düşebilir: 23 Eylül'deki ilk A5
# koşusunda site gerçekte açıldığı hâlde tek denemelik kontrol "geri açılamadı"
# dedi. Sınırlı sayıda (60 sn) yeniden dener.
wait_public_health() {
  local deadline_at
  # Gerçek son zaman: her istek en çok 10 sn; toplam en çok ~80 sn (60 sn son zaman +
  # son denemenin iki isteği). Astra, 23 Eylül.
  deadline_at=$(($(date +%s) + 60))
  while (($(date +%s) < deadline_at)); do
    if assert_public_health; then return 0; fi
    sleep 2
  done
  return 1
}

assert_health() {
  assert_internal_health || return 1
  assert_public_health || return 1
}

assert_release() {
  local release="$runtime_root/releases/$candidate_sha"
  test -d "$release"
  test "$(cat "$release/.release-sha")" = "$candidate_sha"
  test "$(cat "$release/.release-app-image-config-digest")" = \
    "$(cat "$state_dir/candidate-image-config-digest")"
  test -z "$(find "$release" -xdev ! -user root -print -quit)"
  test -z "$(
    find "$release" -xdev \( -type f -o -type d \) -perm /022 -print -quit
  )"
  test -L "$release/node_modules/tsx"
  # tsx sürümü sabit yazılmaz (#282 4.23.1 → 4.23.15 paketlemeyi kırıyordu): kurulu tsx
  # paketinin .pnpm dizinini çöz, esbuild bağlantısı onun yanında olmalı.
  test -L "$(dirname "$(readlink -f "$release/node_modules/tsx")")/esbuild"
  case "$(readlink -f "$release/node_modules/tsx")" in
    "$(readlink -f "$release/node_modules")"/.pnpm/tsx@*/node_modules/tsx) ;;
    *) false ;;
  esac
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
  printf '%s\n' "$reviewed_migration_profile" >"$state_dir/settings-profile"
  lifecycle_fingerprint >"$state_dir/lifecycle-hash"
  migration_snapshot >"$state_dir/baseline-applied-migrations"
  candidate_migration_snapshot >"$state_dir/baseline-candidate-migrations"
  docker volume ls -q |
    LC_ALL=C sort |
    hash_stream >"$state_dir/volume-hash"
  docker ps -aq |
    xargs -r docker inspect --format '{{.Image}}' |
    LC_ALL=C sort -u |
    hash_stream >"$state_dir/container-image-hash"
  # Bütün temel dosyalar yazıldıktan sonra, atomik olarak. Devam kararı bu
  # işarete bakar; yarıda kesilen bir koşu eksik temel bırakamaz (17 Eylül dersi).
  : >"$state_dir/baseline-complete.next"
  mv -Tf "$state_dir/baseline-complete.next" "$state_dir/baseline-complete"
}

assert_migration_mode() {
  if test "$migration_mode" = no-migration; then
    cmp -s "$state_dir/baseline-applied-migrations" "$state_dir/baseline-candidate-migrations" || {
      printf 'RELEASE_FAIL code=MIGRATION_SET_CHANGED\n' >&2
      exit 95
    }
  fi
}

build_candidate_image() {
  local free_kib used_percent image_id image_config_digest
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
  if test -f "$artifact_image_receipt"; then
    test ! -L "$artifact_image_receipt"
    test "$(stat -c '%U|%G|%a' "$artifact_image_receipt")" = 'root|root|444'
    test "$(artifact_receipt_value format)" = agent-sozluk-artifact-image-v1
    test "$(artifact_receipt_value source_sha)" = "$candidate_sha"
    image_config_digest="$(artifact_receipt_value image_config_digest)"
    [[ "$image_config_digest" =~ ^sha256:[0-9a-f]{64}$ ]]
    test "$(artifact_receipt_value loaded_image_id)" = "$image_id"
  else
    image_config_digest="$image_id"
  fi
  printf '%s\n' "$image_config_digest" >"$state_dir/candidate-image-config-digest"
  if test "$generation_required" = 1; then
    docker run --rm --pull never --network none --entrypoint test "$candidate_image" \
      -f /app/scripts/verify-reset-generation.ts </dev/null
  fi
  docker run --rm --entrypoint /app/node_modules/.bin/tsx \
    "$candidate_image" scripts/release-smoke.ts </dev/null
  printf 'RELEASE_IMAGE_READY sha=%s image_id=%s\n' "$candidate_sha" "$image_id"
}

build_runtime_release() {
  local release="$runtime_root/releases/$candidate_sha"
  local image_id image_config_digest runtime_stage runtime_publish runtime_abi
  image_id="$(cat "$state_dir/candidate-image-id")"
  image_config_digest="$(cat "$state_dir/candidate-image-config-digest")"
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
    --image-config-digest "$image_config_digest" \
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
      '        ./node_modules/.bin/tsx scripts/verify-reset-generation.ts &&' \
      '        exec node server.js'
  } >"$override"
  chmod 0600 "$override"
}

# Lease süresi alarmı app konteynerinin logunu okur; --force-recreate eski
# konteyneri (ve logunu) siler. Worker durduktan sonra yeni lease kaydı oluşmaz:
# aday sürümün alarm betiği son kayıtları kesimden ÖNCE tarar ve başarıda bir
# makbuz yazar (bildirim göndermez). Başarısızlık dağıtımı DURDURMAZ ama
# görünür olur; alarm da konteyner değişimini makbuzsuz görürse `belirsiz` der.
pre_cutover_lease_scan() {
  local candidate_alarm="$app_root/deploy/alarm/canlilik-alarmi.sh"
  local installed_alarm=/opt/agent-sozluk/scripts/canlilik-alarmi.sh
  systemctl cat agent-sozluk-alarm.service >/dev/null 2>&1 || return 0
  # 120 sn: timer taraması sürüyorsa kilidi 55 sn'ye kadar bekler, sonra tarar.
  if timeout 120 bash "$candidate_alarm" --kesim-oncesi </dev/null; then
    printf 'RELEASE_LEASE_SCAN_OK\n'
  else
    printf 'RELEASE_WARN lease alarm pre-cutover scan failed\n' >&2
  fi
  # ERR tuzağı komut ikamesinde de çalışır: yalnız okunabilen dosyanın özeti alınır.
  local installed_hash=missing candidate_hash=missing
  if test -r "$installed_alarm"; then installed_hash="$(sha256sum <"$installed_alarm")"; fi
  if test -r "$candidate_alarm"; then candidate_hash="$(sha256sum <"$candidate_alarm")"; fi
  if test "$installed_hash" != "$candidate_hash"; then
    printf 'RELEASE_WARN installed alarm script differs from candidate\n' >&2
  fi
}

# Sahipli isimli tek seferlik kabul container'ı; zaman aşımı, istemci ölümü veya
# uzak betiğin HUP/TERM/INT ile kesilmesinde de kaldırılır. Docker sorgusunun hatası
# yokluk sayılmaz. Kesinti başladıktan sonra gelen sinyaller yalnız kaydedilir:
# istemci bitip container kaldırılıp yokluğu doğrulanmadan betik ölmez.
admission_probe=''
admission_pid=''
admission_signal=''
record_admission_signals() {
  trap 'admission_signal="${admission_signal:-129}"' HUP
  trap 'admission_signal="${admission_signal:-143}"' TERM
  trap 'admission_signal="${admission_signal:-130}"' INT
}
reset_admission_cleanup() {
  local ids
  record_admission_signals
  # pty kapanınca HUP bütün ön plan grubuna gider; temizlik çocukları onu yok sayar.
  (
    trap '' HUP TERM INT
    docker rm -f "$admission_probe"
  ) >/dev/null 2>&1 || true
  ids="$(
    trap '' HUP TERM INT
    docker ps -aq --filter "name=^${admission_probe}\$"
  )" || ids=query-failed
  trap - HUP TERM INT
  test -z "$ids" || {
    printf 'RELEASE_FAIL code=RESET_ADMISSION_PROBE_LINGERING\n' >&2
    exit 97
  }
  if test -n "$admission_signal"; then exit "$admission_signal"; fi
}
reset_admission_abort() {
  admission_signal="${admission_signal:-$1}"
  record_admission_signals
  kill -TERM "$admission_pid" 2>/dev/null || true
  # Tekrarlanan sinyal wait'i erken döndürür; istemci gerçekten bitene kadar bekle.
  while kill -0 "$admission_pid" 2>/dev/null; do
    wait "$admission_pid" 2>/dev/null || true
  done
  reset_admission_cleanup
}
candidate_reset_admission() {
  local ids status=0
  admission_probe="agent-sozluk-reset-admission-$op_id"
  ids="$(docker ps -aq --filter "name=^${admission_probe}\$")" || ids=query-failed
  test -z "$ids" || {
    printf 'RELEASE_FAIL code=RESET_ADMISSION_PROBE_LINGERING\n' >&2
    exit 97
  }
  trap 'reset_admission_abort 129' HUP
  trap 'reset_admission_abort 143' TERM
  trap 'reset_admission_abort 130' INT
  # Arka planda başlatılıp beklenir: sinyal tuzağı istemci dönmeden hemen çalışır.
  APP_IMAGE="$candidate_image" timeout --kill-after=10 180 "${compose[@]}" run --rm \
    --name "$admission_probe" --no-deps --pull never -T \
    --entrypoint ./node_modules/.bin/tsx app scripts/verify-reset-generation.ts </dev/null &
  admission_pid=$!
  wait "$admission_pid" || status=$?
  reset_admission_cleanup
  test "$status" = 0 || {
    printf 'RELEASE_FAIL code=CANDIDATE_RESET_ADMISSION_REJECTED\n' >&2
    exit 97
  }
}

assert_reset_generation_mount() {
  local container="$1" mounts environment
  test "$generation_overlay" = 1 || return 0
  mounts="$(docker inspect --format '{{json .Mounts}}' "$container")"
  environment="$(docker inspect --format '{{json .Config.Env}}' "$container")"
  MOUNTS_JSON="$mounts" ENV_JSON="$environment" SOURCE="$generation_dir" node - <<'NODE'
const mounts = JSON.parse(process.env.MOUNTS_JSON ?? "null");
const env = JSON.parse(process.env.ENV_JSON ?? "null");
const target = "/run/agentsozluk-reset";
// Alt mount (ör. current.json üzerine dosya) doğrulanan dizini gölgeleyebilir: reddedilir.
const bound = Array.isArray(mounts) &&
  mounts.filter((m) => m.Destination === target || String(m.Destination).startsWith(`${target}/`));
if (!bound || bound.length !== 1 || bound[0].Destination !== target || bound[0].Type !== "bind" ||
    bound[0].Source !== process.env.SOURCE || bound[0].RW !== false ||
    !Array.isArray(env) || !env.includes("AGENT_SOZLUK_RESET_GENERATION_REQUIRED=true")) {
  process.stderr.write("RELEASE_FAIL code=RESET_GENERATION_MOUNT_MISSING\n");
  process.exit(97);
}
NODE
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

  # Eski app ve worker'a dokunmadan önce, sağlıklı aday yeniden girişi dahil, aday
  # imaj aynı compose, mount ve ortamla salt okunur reset nesil kabulünü geçmeli;
  # yoksa kesim açılışta düşer (6 Ekim). /health nesil kanıtı değildir.
  candidate_reset_admission

  if test "$app_health" != healthy; then
    wait_for_no_active_work
    sudo systemctl stop agent-sozluk-runtime.service
    test "$(systemctl show agent-sozluk-runtime.service -p ActiveState --value)" = inactive
    counts="$(run_counts)"
    IFS='|' read -r queued running cancel_requested leases <<<"$counts"
    test "$running" = 0
    test "$cancel_requested" = 0
    test "$leases" = 0
    pre_cutover_lease_scan
    write_no_migration_override
    candidate_compose=("${compose[@]}" -f "$override")
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
  assert_reset_generation_mount "$app_container"
  # Ayrı kabul container'ı yeterli değil: çalışan app'in kendi gördüğü nesil de geçmeli.
  "${compose[@]}" exec -T app ./node_modules/.bin/tsx \
    scripts/verify-reset-generation.ts </dev/null || {
    printf 'RELEASE_FAIL code=RUNNING_RESET_ADMISSION_REJECTED\n' >&2
    exit 97
  }
  entrypoint_json="$(
    docker inspect --format '{{json .Config.Entrypoint}}' "$app_container"
  )"
  ENTRYPOINT_JSON="$entrypoint_json" /usr/bin/node <<'NODE'
const value = JSON.parse(process.env.ENTRYPOINT_JSON ?? "null");
if (!Array.isArray(value) || value[0] !== "/bin/sh" || value[1] !== "-c") process.exit(1);
const command = value.slice(2).join(" ");
if (!command.includes("validate-environment.ts") ||
    !command.includes("wait-for-database.mjs") ||
    !command.includes("verify-reset-generation.ts") ||
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

  if test "$migration_mode" != no-migration; then
    # Trafik iç kontroller geçtikten sonra açılır: Caddy dondurmadan beri kapalı.
    # Migration'sız modun sırası değişmez; orada dış sağlık `verify_release`'te,
    # worker başladıktan sonra sınanır (Sol, 23 Eylül).
    "${compose[@]}" start caddy </dev/null
    test -n "$("${compose[@]}" ps --status running -q caddy)"
    set_phase traffic-open
    wait_public_health
    # Hold kalkmadan önce boot yolu da aynı sürümü göstermeli: etiket, çalışan
    # app ve runtime/current üçü aday (Astra, 23 Eylül).
    publish_boot_tag
    test "$(docker image inspect --format '{{.Id}}' agent-sozluk:production)" = "$image_id"
    test "$(docker inspect --format '{{.Image}}' "$("${compose[@]}" ps --status running -q app)")" = "$image_id"
    test "$(docker image inspect \
      --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' \
      agent-sozluk:production)" = "$candidate_sha"
    test "$(cat "$runtime_root/current/.release-sha")" = "$candidate_sha"
    find "$runtime_root" -maxdepth 1 -name .migration-hold -type f -delete
    test ! -e "$runtime_root/.migration-hold"
    set_phase worker-allowed
  fi

  install_runtime_unit
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
  assert_runtime_unit
  find "$state_dir" -maxdepth 1 -type f -name 'no-migration-compose.yaml' -delete
}

#
# `agent-sozluk.service` birimi açılışta `Environment=APP_IMAGE=agent-sozluk:production`
# veriyor — birimin sözleşmesi bu etiket. Bu script ise stack'i kendi turunun SHA
# etiketiyle (`agent-sozluk:$candidate_sha`) ayağa kaldırıyor ve `production` etiketini
# hiç yönetmiyordu. Sonuç: birimin bağlı olduğu etiket sunucuda hiç var olmadı. Her
# yeniden başlatmada compose var olmayan bir imajı çekmeye çalıştı, `DOCKER_CONFIG`
# kayıtlı kimlik taşımadığı için yetki hatası aldı ve `ExecStart` açılıştan bir saniye
# sonra 1 ile çıktı; stack hiç açılmadı.
#
# 2026-08-20'de `unattended-upgrades` reboot'undan sonra tam bu oldu: site 33 dakika
# kapalı kaldı ve elle `APP_IMAGE` verilerek geri getirildi.
#
# Etiket YALNIZ `verify_release` geçtikten sonra taşınıyor. Böylece açılışta ayağa
# kalkacak imaj her zaman bu turda doğrulanmış imaj oluyor; yarıda kalan bir release
# etiketi kıpırdatmıyor ve önceki sürüm açılışta geri gelmeye devam ediyor.
publish_boot_tag() {
  local image_id resolved
  image_id="$(cat "$state_dir/candidate-image-id")"
  docker tag "$image_id" agent-sozluk:production
  resolved="$(docker image inspect --format '{{.Id}}' agent-sozluk:production)"
  test "$resolved" = "$image_id"
  printf 'RELEASE_BOOT_TAG PASS image_id=%s\n' "$image_id"
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
  assert_runtime_unit
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
  local previous_runtime current_runtime release release_name receipt
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
    receipt="$runtime_root/artifact-receipts/$release_name.env"
    if test -f "$receipt" && test ! -L "$receipt"; then
      sudo find "$receipt" -xdev -delete
    fi
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

if test ! -f "$state_dir/baseline-complete"; then
  capture_initial_state
else
  assert_state_fingerprints
fi
assert_migration_mode
build_candidate_image
build_runtime_release
if test "$migration_mode" != no-migration; then
  bash -n "$app_root/scripts/production-migration-phase.sh"
  # shellcheck source=scripts/production-migration-phase.sh
  source "$app_root/scripts/production-migration-phase.sh"
  migration_phase
fi
cutover
verify_release
publish_boot_tag
if test "$migration_mode" != no-migration; then
  set_phase cutover-done
  find "$runtime_root/.migration-operation" -xdev -depth -delete
fi
if test "$cleanup_requested" = cleanup; then cleanup_images; fi
printf 'RELEASE_COMPLETE PASS sha=%s cleanup=%s migrations=%s\n' \
  "$candidate_sha" "$cleanup_requested" "$migration_mode"
