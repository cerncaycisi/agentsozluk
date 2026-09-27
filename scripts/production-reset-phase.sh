# shellcheck shell=bash
#
# Great reset — A5 reset modunun reset aşamaları (tasarım v20; runbook "v20 A5 reset modu —
# aşama makinesi"). Tek başına çalışmaz: `production-release-remote.sh`, reset modunda
# `production-migration-phase.sh`'den SONRA aynı checkout'tan `source` eder. Kullandığı
# değişkenler: compose, state_dir, app_root, runtime_root, candidate_sha, candidate_image, op_id,
# reset_operation_id, reset_ack, migration_marker, migration_dir, backups_dir, host_node; A5
# yardımcıları: db_psql, admin_psql, migration_fail, set_phase, current_phase, phase_reached,
# deadline_prefix, assert_frozen, assert_disk_budget.
#
# Dış kayıt (operatör sunucusu) bu betikten YAZILMAZ: kayda yazılacak her geçişte betik
# `RELEASE_RESET_AWAIT_LEDGER` basar ve 75 ile çıkar; sarmalayıcı kaydı yazar ve betiği
# `ack:<DURUM>` ile yeniden çağırır. Belirsiz reset sonucunda reset TEKRARLANMAZ.
#
# Bash, `f || x` biçiminde çağrılan fonksiyonun gövdesinde `set -e`'yi kapatır (Sol, 23 Eylül):
# güvenlik kontrolleri `||` olmadan çağrılır ya da her adım açıkça sınanır.

reset_release="$runtime_root/releases/$candidate_sha"
reset_unit_list=(
  agent-sozluk-maintenance.timer
  agent-sozluk-alarm.timer
  agent-sozluk-backup.timer
)
# Vazgeçme zamanı: dondurmadan itibaren bu süre içinde reset başlamadıysa reset yapılmaz.
reset_abort_seconds="${reset_abort_seconds:-2700}"
reset_ledger_exit=75
reset_rollback_requested="${reset_rollback_requested:-0}"

reset_cli() {
  # Onaylı release'in kendi araçları; üretim guard'ı hedefi kendisi doğrular (host, release,
  # `.env`, Compose `db` kimliği). Kalan kesinti süresiyle sınırlı.
  local deadline
  deadline_prefix
  (cd "$reset_release" && "${deadline[@]}" ./node_modules/.bin/tsx "$@" </dev/null)
}

reset_json_field() {
  "$host_node" -e '
    const value = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
    const field = value[process.argv[1]];
    if (field === undefined) process.exit(1);
    process.stdout.write(typeof field === "string" ? field : JSON.stringify(field));
  ' "$1"
}

# --- Zamanlayıcı ve açılış dondurması ------------------------------------------

# Önceki `enabled/active` durumları bir kez kaydedilir; timer'lar ve Compose yığını birimi
# devre dışı bırakılır. `agent-sozluk.service` DURDURULMAZ (ExecStop yığını indirebilir);
# yalnız reboot'ta başlamasın diye devre dışı bırakılır.
reset_freeze_units() {
  local unit states="$migration_marker/reset-units"
  if test ! -f "$states"; then
    : >"$states.next"
    for unit in "${reset_unit_list[@]}" agent-sozluk.service; do
      printf '%s|%s|%s\n' "$unit" \
        "$(systemctl is-enabled "$unit" 2>/dev/null || true)" \
        "$(systemctl is-active "$unit" 2>/dev/null || true)" >>"$states.next"
    done
    mv -Tf "$states.next" "$states"
  fi
  for unit in "${reset_unit_list[@]}"; do
    sudo systemctl disable --now "$unit" </dev/null >/dev/null 2>&1 || true
  done
  sudo systemctl disable agent-sozluk.service </dev/null >/dev/null 2>&1 || true
  # Çalışan bakım/alarm/yedek servisleri bitsin (en çok 5 dk).
  for _ in $(seq 1 60); do
    if test "$(reset_running_services)" = 0; then break; fi
    sleep 5
  done
  reset_assert_units_frozen
}

# Oneshot servis çalışırken `activating` görünür (Astra, PR #239 P2): bitmiş sayılmaz.
reset_running_services() {
  { systemctl is-active agent-sozluk-maintenance.service agent-sozluk-alarm.service \
    agent-sozluk-backup.service 2>/dev/null || true; } |
    grep -c -E '^(active|activating|deactivating|reloading|refreshing)$' || true
}

reset_assert_units_frozen() {
  local unit
  for unit in "${reset_unit_list[@]}"; do
    test "$(systemctl is-enabled "$unit" 2>/dev/null || true)" != enabled ||
      migration_fail RESET_UNIT_STILL_ENABLED
    test "$(systemctl is-active "$unit" 2>/dev/null || true)" != active ||
      migration_fail RESET_UNIT_STILL_ACTIVE
  done
  test "$(systemctl is-enabled agent-sozluk.service 2>/dev/null || true)" != enabled ||
    migration_fail RESET_STACK_UNIT_STILL_ENABLED
  test "$(reset_running_services)" = 0 || migration_fail RESET_SERVICE_STILL_RUNNING
}

reset_restore_units() {
  local unit enabled active
  test -f "$migration_marker/reset-units" || migration_fail RESET_UNIT_STATE_MISSING
  while IFS='|' read -r unit enabled active; do
    case "$unit" in
      agent-sozluk-maintenance.timer | agent-sozluk-alarm.timer | agent-sozluk-backup.timer | \
        agent-sozluk.service) ;;
      *) migration_fail RESET_UNIT_STATE_INVALID ;;
    esac
    if test "$enabled" = enabled; then sudo systemctl enable "$unit" </dev/null >/dev/null; fi
    if test "$active" = active && test "$unit" != agent-sozluk.service; then
      sudo systemctl start "$unit" </dev/null
    fi
    test "$(systemctl is-enabled "$unit" 2>/dev/null || true)" = "$enabled" ||
      migration_fail RESET_UNIT_RESTORE_FAILED
  done <"$migration_marker/reset-units"
  printf 'RELEASE_RESET_UNITS_RESTORED\n'
}

# --- Faza bağlı ayar özeti -------------------------------------------------------

# Bayraklar ve servis metadatası dışında `agent_global_settings` birebir kalmalı.
reset_settings_fingerprint() {
  "${compose[@]}" exec -T db psql -XAtq -v ON_ERROR_STOP=1 -U agent_sozluk -d agent_sozluk \
    <<'SQL' | sha256sum | cut -d ' ' -f 1
SELECT (to_jsonb(s) - ARRAY['runtimeEnabled', 'schedulerEnabled', 'publicWriteEnabled',
    'publishEnabled', 'settingsVersion', 'updatedAt', 'updatedById'])::text
FROM agent_global_settings s ORDER BY id;
SQL
}

reset_flags() {
  "${compose[@]}" exec -T db psql -XAtq -v ON_ERROR_STOP=1 -U agent_sozluk -d agent_sozluk <<'SQL'
SELECT "runtimeEnabled"::text || '|' || "schedulerEnabled"::text || '|' ||
  "publicWriteEnabled"::text || '|' || "publishEnabled"::text
FROM agent_global_settings WHERE id = 'global';
SQL
}

# Reset modunda A5'in tam ayar özetinin yerine geçer; yaşam döngüsü özeti aynen denetlenir.
reset_assert_state() {
  local expected
  test "$(lifecycle_fingerprint)" = "$(cat "$state_dir/lifecycle-hash")" ||
    migration_fail RESET_LIFECYCLE_CHANGED
  if test ! -f "$state_dir/reset-settings-hash"; then
    reset_settings_fingerprint >"$state_dir/reset-settings-hash.next"
    reset_flags >"$state_dir/reset-baseline-flags.next"
    mv -Tf "$state_dir/reset-baseline-flags.next" "$state_dir/reset-baseline-flags"
    mv -Tf "$state_dir/reset-settings-hash.next" "$state_dir/reset-settings-hash"
  fi
  test "$(reset_settings_fingerprint)" = "$(cat "$state_dir/reset-settings-hash")" ||
    migration_fail RESET_SETTINGS_CHANGED
  reset_assert_flags
}

# Bayrak geçişinin kalıcı durumu (Astra, PR #238 3. tur P2). Mutasyondan ÖNCE `freezing` ya da
# `restoring` yazılır; bu iki ara durumda her bayrak ya başlangıç değerinde ya kapalıdır (servis
# çağrıları arasında kesinti), yeniden giriş aynı idempotent komutu tekrarlayıp geçişi tamamlar.
# `frozen`'da hepsi kapalı, durum yoksa ve `restored`'da hepsi başlangıç değerindedir.
reset_flag_state() {
  if test -f "$migration_marker/reset-flag-state"; then cat "$migration_marker/reset-flag-state"
  else printf 'baseline\n'
  fi
}

reset_set_flag_state() {
  printf '%s\n' "$1" >"$migration_marker/reset-flag-state.next"
  mv -Tf "$migration_marker/reset-flag-state.next" "$migration_marker/reset-flag-state"
}

reset_assert_flags() {
  local actual baseline state index a b
  actual="$(reset_flags)"
  baseline="$(cat "$state_dir/reset-baseline-flags")"
  state="$(reset_flag_state)"
  case "$state" in
    baseline | restored) test "$actual" = "$baseline" || migration_fail RESET_FLAGS_UNEXPECTED ;;
    frozen) test "$actual" = 'false|false|false|false' || migration_fail RESET_FLAGS_UNEXPECTED ;;
    freezing | restoring)
      [[ "$actual" =~ ^(true|false)\|(true|false)\|(true|false)\|(true|false)$ ]] ||
        migration_fail RESET_FLAGS_UNEXPECTED
      for index in 1 2 3 4; do
        a="$(cut -d '|' -f "$index" <<<"$actual")"
        b="$(cut -d '|' -f "$index" <<<"$baseline")"
        test "$a" = false || test "$a" = "$b" || migration_fail RESET_FLAGS_UNEXPECTED
      done
      ;;
    *) migration_fail RESET_FLAG_STATE_INVALID ;;
  esac
}

reset_write_freeze() {
  local command="$1" db_ip admin_id deadline
  db_ip="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' \
    "$("${compose[@]}" ps -q db)")"
  test -n "$db_ip" || migration_fail RESET_DB_ADDRESS_UNAVAILABLE
  admin_id="$(db_psql agent_sozluk -c "SELECT id FROM users WHERE kind = 'HUMAN' AND role = 'ADMIN'
    AND status = 'ACTIVE' AND username = 'bootstrap_admin'" </dev/null)"
  [[ "$admin_id" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] ||
    migration_fail OPERATOR_ADMIN_UNRESOLVED
  deadline_prefix
  (cd "$reset_release" &&
    AGENT_OPERATOR_ADMIN_ID="$admin_id" AGENT_OPERATOR_ENV_FILE=/opt/agent-sozluk/app/.env \
      AGENT_DB_IP="$db_ip" AGENT_FLOW_REASON="great reset ${reset_operation_id:0:8} $command" \
      "${deadline[@]}" ./node_modules/.bin/tsx scripts/agent-write-freeze.ts "$command" \
      "$migration_marker/reset-flags.json" </dev/null) || migration_fail RESET_WRITE_FREEZE_FAILED
}

# --- Dış kayıt el sıkışması -----------------------------------------------------

# Her dış kayıt isteği (durum, dump SHA, makbuz SHA) faz yazılmadan ÖNCE kalıcı dosyaya yazılır;
# aynı istek yeniden yazılırsa değerler birebir aynı olmalıdır (Astra, PR #239 P1/P2).
reset_request_ledger() {
  local state="$1" dump="$2" receipt="$3" file
  file="$migration_marker/reset-request-$state"
  if test -f "$file"; then
    test "$(cat "$file")" = "$state|$dump|$receipt" || migration_fail RESET_LEDGER_REQUEST_CONFLICT
    return 0
  fi
  printf '%s|%s|%s\n' "$state" "$dump" "$receipt" >"$file.next"
  mv -Tf "$file.next" "$file"
}

# Kapı: onay kalıcıysa geçer; bu çağrıda sarmalayıcı onay verdiyse kalıcılaştırıp geçer; yoksa
# isteği (dosyadan) yeniden basar ve 75 ile çıkar. Kesinti hangi noktada olursa olsun yeniden
# giriş aynı isteği üretir ya da kaydedilmiş onayı kullanır; onay atlanamaz.
reset_ledger_gate() {
  local state="$1" request
  request="$migration_marker/reset-request-$state"
  test -f "$request" || migration_fail RESET_LEDGER_REQUEST_MISSING
  if test -f "$migration_marker/reset-ack-$state"; then return 0; fi
  if test "$reset_ack" = "$state"; then
    printf '%s\n' "$state" >"$migration_marker/reset-ack-$state.next"
    mv -Tf "$migration_marker/reset-ack-$state.next" "$migration_marker/reset-ack-$state"
    return 0
  fi
  IFS='|' read -r _ reset_await_dump reset_await_receipt <"$request"
  local reference reference_sha='-'
  reference="$(reset_await_receipt_path "$state")"
  if test "$reference" != -; then reference_sha="$(reset_json_field sha256 <"$reference")"; fi
  printf 'RELEASE_RESET_AWAIT_LEDGER state=%s operation=%s dump_sha256=%s receipt_sha256=%s dump_path=%s reference_path=%s reference_sha256=%s\n' \
    "$state" "$reset_operation_id" "$reset_await_dump" "$reset_await_receipt" \
    "$(cat "$migration_marker/reset-dump-path" 2>/dev/null || printf '-')" \
    "$reference" "$reference_sha"
  exit "$reset_ledger_exit"
}

reset_await_receipt_path() {
  case "$1" in
    # Operatör kapısı restore edilmiş scratch makbuzuyla karşılaştırır (ikisi de restore).
    PREPARED) cat "$migration_marker/reset-scratch-receipt-path" 2>/dev/null || printf -- '-' ;;
    COMMITTED_MAINTENANCE | TRAFFIC_OPEN)
      cat "$migration_marker/reset-post-receipt-path" 2>/dev/null || printf -- '-'
      ;;
    *) printf -- '-' ;;
  esac
}

# Vazgeçme ve sonuç uzlaşısı, dolmuş kesinti bütçesiyle de çalışabilmeli: A5 tuzağı gibi ayrı,
# sınırlı bir kurtarma bütçesi (10 dk) açılır (Astra, PR #239 P1).
reset_recovery_budget() {
  local file="$migration_marker/reset-recovery-deadline"
  # Tek, kalıcı son süre (Astra, PR #239 2. tur P2): ilk açılışta yazılır; sonraki çağrılar ve
  # yeniden girişler aynı süreyi kullanır. Süre dolunca komutlar 1 sn sınırla düşer ve durulur.
  if test ! -f "$file"; then
    printf '%s\n' "$(($(date +%s) + 600))" >"$file.next"
    mv -Tf "$file.next" "$file"
  fi
  frozen_deadline="$(cat "$file")"
  [[ "$frozen_deadline" =~ ^[0-9]+$ ]] || migration_fail RESET_RECOVERY_DEADLINE_INVALID
  # Son süre dolduysa yeni kurtarma adımı başlamaz; site kapalı, karar elle (Astra, PR #239 3. tur
  # P2). Süre dolmadıysa kalan süre komutları sınırlar.
  if (($(date +%s) >= frozen_deadline)); then migration_fail RESET_RECOVERY_BUDGET_EXHAUSTED 98; fi
  recovering=1
  reset_recovery_active=1
}

reset_frozen_at() {
  local deadline_at
  deadline_at="$(cat "$migration_marker/frozen-deadline")"
  [[ "$deadline_at" =~ ^[0-9]+$ ]] || migration_fail DOWNTIME_DEADLINE_INVALID
  printf '%s\n' "$((deadline_at - max_downtime_seconds))"
}

# --- Aşamalar -------------------------------------------------------------------

reset_freeze_flags() {
  reset_assert_state
  case "$(reset_flag_state)" in
    baseline | freezing) reset_set_flag_state freezing ;;
    frozen) : ;;
    *) migration_fail RESET_FLAG_STATE_INVALID ;;
  esac
  reset_write_freeze freeze
  reset_set_flag_state frozen
  reset_assert_state
  set_phase reset-flags-frozen
}

# Bayrakları dondurma dosyasındaki değerlere döndürür; yeniden girişte tamamlar.
reset_restore_flags() {
  case "$(reset_flag_state)" in
    frozen | restoring) reset_set_flag_state restoring ;;
    restored) : ;;
    # COMMIT öncesi vazgeçmede bayraklar hiç kapanmamış ya da kısmen kapanmış olabilir.
    baseline | freezing) reset_set_flag_state restoring ;;
    *) migration_fail RESET_FLAG_STATE_INVALID ;;
  esac
  reset_assert_state
  if test -f "$migration_marker/reset-flags.json"; then reset_write_freeze restore; fi
  reset_set_flag_state restored
  reset_assert_state
}

# Exact operasyonun niyet durumu DB'den: OPEN, CONSUMED, INVALIDATED, EXPIRED ya da MISSING.
reset_intent_state() {
  db_psql agent_sozluk -v "op=$reset_operation_id" -v "sha=$candidate_sha" <<'SQL'
SELECT CASE
  WHEN count(*) = 0 THEN 'MISSING'
  WHEN bool_or("releaseSha" <> :'sha') THEN 'FOREIGN'
  WHEN bool_or("consumedAt" IS NOT NULL) THEN 'CONSUMED'
  WHEN bool_or("invalidatedAt" IS NOT NULL) THEN 'INVALIDATED'
  WHEN bool_or("expiresAt" <= CURRENT_TIMESTAMP) THEN 'EXPIRED'
  ELSE 'OPEN' END
FROM great_reset_intents WHERE "operationId" = :'op'::uuid;
SQL
}

reset_create_intent() {
  local state
  state="$(reset_intent_state)" || migration_fail RESET_INTENT_STATE_UNAVAILABLE
  # Önceki giriş DB'de COMMIT edip faz yazamadan kesildiyse aynı niyet kullanılır.
  case "$state" in
    OPEN) : ;;
    MISSING)
      reset_cli scripts/great-reset-operation.ts intent-create "$reset_operation_id" \
        "$candidate_sha" >/dev/null || migration_fail RESET_INTENT_FAILED
      test "$(reset_intent_state)" = OPEN || migration_fail RESET_INTENT_FAILED
      ;;
    *) migration_fail "RESET_INTENT_$state" ;;
  esac
  set_phase reset-intent
}

reset_invalidate_intent() {
  local state
  state="$(reset_intent_state)" || migration_fail RESET_INTENT_STATE_UNAVAILABLE
  case "$state" in
    OPEN)
      reset_cli scripts/great-reset-operation.ts intent-invalidate "$reset_operation_id" \
        >/dev/null || migration_fail RESET_INTENT_INVALIDATE_FAILED
      test "$(reset_intent_state)" = INVALIDATED || migration_fail RESET_INTENT_INVALIDATE_FAILED
      ;;
    # Zaten geçersiz, hiç yazılmamış ya da süresi dolmuş niyet tüketilemez.
    INVALIDATED | MISSING | EXPIRED) : ;;
    *) migration_fail "RESET_INTENT_$state" ;;
  esac
}

reset_backup_and_verify() {
  local stamp dump partial dump_sha scratch pre_receipt scratch_receipt deadline collate ctype
  # İstek kalıcılaşmış ama faz yazılamadan kesildiyse doğrulanmış eski yedek ve makbuzlar
  # kullanılır; yeniden dump aynı SHA'yı garanti etmez (Astra, PR #239 2. tur P2).
  if test -f "$migration_marker/reset-request-PREPARED"; then
    reset_assert_prepared_artifacts
    set_phase reset-backup-verified
    return 0
  fi
  assert_frozen
  assert_disk_budget full
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  dump="$backups_dir/agent-sozluk-$stamp-reset-${reset_operation_id:0:8}.dump"
  partial="$dump.partial"
  test ! -e "$dump" && test ! -e "$partial"
  # Sahiplik ve ACL dahil (A5'in `--no-owner --no-privileges` biçimi burada kullanılmaz).
  deadline_prefix
  (umask 077 && "${deadline[@]}" "${compose[@]}" exec -T db pg_dump -Fc -U agent_sozluk \
    -d agent_sozluk </dev/null >"$partial") || migration_fail RESET_BACKUP_DUMP_FAILED
  test -s "$partial" || migration_fail RESET_BACKUP_EMPTY
  deadline_prefix
  "${deadline[@]}" "${compose[@]}" exec -T db pg_restore --list <"$partial" >/dev/null ||
    migration_fail RESET_BACKUP_LIST_FAILED
  mv -T "$partial" "$dump"
  dump_sha="$(sha256sum "$dump" | cut -d ' ' -f 1)"
  printf '%s\n' "$dump" >"$migration_marker/reset-dump-path"
  printf '%s\n' "$dump_sha" >"$migration_marker/reset-dump-sha256"

  pre_receipt="$migration_dir/reset-pre-receipt-$stamp.json"
  reset_cli scripts/great-reset-operation.ts receipt "$pre_receipt" >/dev/null ||
    migration_fail RESET_PRE_RECEIPT_FAILED
  printf '%s\n' "$pre_receipt" >"$migration_marker/reset-pre-receipt-path"

  scratch="agent_sozluk_a5_$(date -u +%Y%m%d_%H%M%S)_${op_id:0:6}"
  scratch_database="$scratch"
  assert_scratch_name || migration_fail SCRATCH_NAME_INVALID
  assert_disk_budget restore
  collate="$(db_psql agent_sozluk -c 'SELECT datcollate FROM pg_database WHERE datname = current_database();' </dev/null)"
  ctype="$(db_psql agent_sozluk -c 'SELECT datctype FROM pg_database WHERE datname = current_database();' </dev/null)"
  deadline_prefix
  "${deadline[@]}" "${compose[@]}" exec -T db createdb -U postgres -O agent_sozluk -T template0 \
    -E UTF8 --lc-collate="$collate" --lc-ctype="$ctype" "$scratch" </dev/null ||
    migration_fail SCRATCH_CREATE_FAILED
  scratch_owned=1
  # Yönetici bağlantısı, `agent_sozluk` rolü altında: dump extension sahibini taşımaz, extension'lar
  # üretimdeki gibi `agent_sozluk`'a ait kurulur; nesne sahiplik ve ACL'leri birebir geri gelir.
  deadline_prefix
  "${deadline[@]}" "${compose[@]}" exec -T db pg_restore --exit-on-error -U postgres \
    --role=agent_sozluk -d "$scratch" <"$dump" || migration_fail RESET_RESTORE_FAILED
  scratch_receipt="$migration_dir/reset-scratch-receipt-$stamp.json"
  reset_cli scripts/great-reset-operation.ts receipt "$scratch_receipt" --database "$scratch" \
    >/dev/null || migration_fail RESET_SCRATCH_RECEIPT_FAILED
  # Canlı ↔ restore: şema dışındaki bütün makbuz bölümleri birebir; şema, arşivin şema betiği ile
  # canlı şema dökümünün birebir eşitliğiyle (A5 yöntemi; restore ifadeleri yeniden yazar).
  reset_cli scripts/great-reset-operation.ts receipt-compare-restored "$pre_receipt" \
    "$scratch_receipt" >"$migration_dir/reset-restore-compare.json" ||
    migration_fail RESET_RESTORE_RECEIPT_MISMATCH
  test "$(archive_schema_hash "$dump")" = "$(schema_hash agent_sozluk)" ||
    migration_fail RESET_BACKUP_SCHEMA_MISMATCH
  printf '%s\n' "$scratch_receipt" >"$migration_marker/reset-scratch-receipt-path"
  drop_scratch || migration_fail SCRATCH_DROP_FAILED
  reset_request_ledger PREPARED "$dump_sha" "$(reset_json_field sha256 <"$pre_receipt")"
  set_phase reset-backup-verified
}

reset_assert_prepared_artifacts() {
  local dump dump_sha pre scratch
  dump="$(cat "$migration_marker/reset-dump-path")"
  dump_sha="$(cat "$migration_marker/reset-dump-sha256")"
  pre="$(cat "$migration_marker/reset-pre-receipt-path")"
  scratch="$(cat "$migration_marker/reset-scratch-receipt-path")"
  test -f "$dump" && test -f "$pre" && test -f "$scratch" || migration_fail RESET_PREPARED_ARTIFACT_MISSING
  test "$(sha256sum "$dump" | cut -d ' ' -f 1)" = "$dump_sha" ||
    migration_fail RESET_PREPARED_ARTIFACT_CHANGED
  test "$(cat "$migration_marker/reset-request-PREPARED")" = \
    "PREPARED|$dump_sha|$(reset_json_field sha256 <"$pre")" ||
    migration_fail RESET_PREPARED_ARTIFACT_CHANGED
}

# Reset CLI'si hata verdiyse sonuç DB'den uzlaştırılır. Kapı kapalı kaldıysa yönetici konsolu
# açar. Çıktı: COMMITTED, NOT_COMMITTED ya da AMBIGUOUS.
reset_reconcile() {
  local allowed commits consumed
  allowed="$(admin_psql postgres -c "SELECT datallowconn FROM pg_database WHERE datname = 'agent_sozluk'" \
    </dev/null)" || { printf 'AMBIGUOUS\n'; return 0; }
  if test "$allowed" != t; then
    admin_psql postgres -c 'ALTER DATABASE agent_sozluk WITH ALLOW_CONNECTIONS true' \
      </dev/null >/dev/null || { printf 'AMBIGUOUS\n'; return 0; }
    test "$(admin_psql postgres -c "SELECT datallowconn FROM pg_database WHERE datname = 'agent_sozluk'" \
      </dev/null)" = t || { printf 'AMBIGUOUS\n'; return 0; }
    printf 'RELEASE_RESET_GATE_REOPENED_BY_CONSOLE\n' >&2
  fi
  commits="$(db_psql agent_sozluk -v "op=$reset_operation_id" <<'SQL'
SELECT count(*) FROM great_reset_commits WHERE "operationId" = :'op'::uuid;
SQL
)" || { printf 'AMBIGUOUS\n'; return 0; }
  consumed="$(db_psql agent_sozluk -v "op=$reset_operation_id" <<'SQL'
SELECT count(*) FROM great_reset_intents WHERE "operationId" = :'op'::uuid AND "consumedAt" IS NOT NULL;
SQL
)" || { printf 'AMBIGUOUS\n'; return 0; }
  if test "$commits" = 1 && test "$consumed" = 1; then printf 'COMMITTED\n'
  elif test "$commits" = 0 && test "$consumed" = 0; then printf 'NOT_COMMITTED\n'
  else printf 'AMBIGUOUS\n'
  fi
}

reset_commit() {
  local preview plan blocked pre_sha outcome status=0
  # Vazgeçme zamanı kesinti bütçesinden ÖNCE denetlenir; vazgeçme kurtarma bütçesiyle koşar.
  if (($(date +%s) > $(reset_frozen_at) + reset_abort_seconds)); then
    printf 'RELEASE_RESET_ABORT reason=ABORT_DEADLINE_PASSED\n' >&2
    reset_begin_abort
    return 0
  fi
  assert_frozen
  pre_sha="$(reset_json_field sha256 <"$(cat "$migration_marker/reset-pre-receipt-path")")"
  preview="$(reset_cli scripts/great-reset-production.ts --dry-run --archive-outbox \
    --namespace "$reset_operation_id" "$candidate_sha" "$pre_sha" --connection-gate)" || {
    printf 'RELEASE_RESET_ABORT reason=PREVIEW_FAILED\n' >&2
    reset_begin_abort
    return 0
  }
  blocked="$(reset_json_field blockedBy <<<"$preview")"
  plan="$(reset_json_field planSha256 <<<"$preview")"
  if test "$blocked" != '[]' || ! [[ "$plan" =~ ^[0-9a-f]{64}$ ]]; then
    printf 'RELEASE_RESET_ABORT reason=PREVIEW_BLOCKED\n' >&2
    reset_begin_abort
    return 0
  fi
  # Önizleme vazgeçme sınırını aşmış olabilir: geri döndürülemez adımdan hemen önce yeniden
  # denetlenir (Astra, PR #239 2. tur P1).
  if (($(date +%s) > $(reset_frozen_at) + reset_abort_seconds)); then
    printf 'RELEASE_RESET_ABORT reason=ABORT_DEADLINE_PASSED_AFTER_PREVIEW\n' >&2
    reset_begin_abort
    return 0
  fi
  # Bu noktadan sonra sonuç belirsiz kalabilir: yeniden girişte reset TEKRARLANMAZ.
  set_phase reset-committing
  reset_cli scripts/great-reset-production.ts --execute --database agent_sozluk \
    --plan-sha256 "$plan" --archive-outbox --namespace "$reset_operation_id" "$candidate_sha" \
    "$pre_sha" --connection-gate >"$migration_dir/reset-execute.json" || status=$?
  # Uzlaşı dolmuş bütçeyle de konsola ulaşabilmeli.
  if ((status != 0)); then reset_recovery_budget; fi
  outcome="$(reset_reconcile)"
  if ((status == 0)) && test "$outcome" = COMMITTED; then
    set_phase reset-committed
  elif ((status != 0)) && test "$outcome" = NOT_COMMITTED; then
    printf 'RELEASE_RESET_ABORT reason=EXECUTE_FAILED_BEFORE_COMMIT\n' >&2
    reset_begin_abort
  else
    migration_fail RESET_OUTCOME_AMBIGUOUS 98
  fi
}

# COMMIT öncesi vazgeçme. Niyet geçersizleşir. Dış kayıtta PREPARED onaylıysa ABORTED isteği faz
# yazılmadan önce kalıcılaşır ve onaylanmadan resetsiz açılış yapılmaz; PREPARED hiç yazılmadıysa
# (yedek öncesi) dış kayıtta bu operasyon yoktur, doğrudan resetsiz açılışa geçilir.
reset_begin_abort() {
  reset_recovery_budget
  reset_invalidate_intent
  if test -f "$migration_marker/reset-ack-PREPARED"; then
    reset_request_ledger ABORTED "$(cat "$migration_marker/reset-dump-sha256")" -
  fi
  set_phase reset-aborted
  reset_complete_abort
}

reset_complete_abort() {
  reset_recovery_budget
  if test -f "$migration_marker/reset-ack-PREPARED"; then
    # Kesinti istek ile faz arasında olduysa istek burada tamamlanır.
    reset_request_ledger ABORTED "$(cat "$migration_marker/reset-dump-sha256")" -
    reset_ledger_gate ABORTED
  fi
  reset_finish_abort
}

reset_finish_abort() {
  reset_restore_flags
  # Açılış fazına geçmeden son süre yeniden denetlenir.
  if ((reset_recovery_active == 1)) && (($(date +%s) >= frozen_deadline)); then
    migration_fail RESET_RECOVERY_BUDGET_EXHAUSTED 98
  fi
  printf 'RELEASE_RESET_ABORTED site opens with candidate release and migrations, without reset (%s)\n' \
    "$(current_phase)"
  set_phase writers-may-run
  # A5 gibi: yazıcılar açılabilir, dondurma karşılaştırmaları bir daha koşmaz.
  frozen_deadline=0
}

reset_post_receipt() {
  local post
  post="$migration_dir/reset-post-receipt-$(date -u +%Y%m%dT%H%M%SZ).json"
  reset_cli scripts/great-reset-operation.ts receipt "$post" >/dev/null ||
    migration_fail RESET_POST_RECEIPT_FAILED
  printf '%s\n' "$post" >"$migration_marker/reset-post-receipt-path"
  reset_request_ledger COMMITTED_MAINTENANCE "$(cat "$migration_marker/reset-dump-sha256")" \
    "$(reset_json_field sha256 <"$post")"
  set_phase reset-receipted
}

reset_cleanup_containers() {
  docker rm -f "a5-$op_id-readonly" "a5-$op_id-candidate" >/dev/null 2>&1 || true
}

# Aday imajdan atılabilir app: her havuz bağlantısında `default_transaction_read_only=on`; yalnız
# GET kabulü; container silinir; ardından restore uygunluğu (makbuz eşitliği dahil) `[]` olmalı.
reset_readonly_acceptance() {
  local container="a5-$op_id-readonly" status=0 entry topic unknown eligibility deadline
  entry="$(db_psql agent_sozluk -c "SELECT min(\"publicId\") FROM great_reset_tombstones WHERE kind = 'ENTRY'" </dev/null)"
  topic="$(db_psql agent_sozluk -c "SELECT min(\"publicId\") FROM great_reset_tombstones WHERE kind = 'TOPIC'" </dev/null)"
  # Bilinmeyen örnek: en büyük silinmiş entry kimliğinin bir fazlası; mezar taşında ve canlıda yok.
  unknown="$(db_psql agent_sozluk <<'SQL'
SELECT max("publicId") + 1 FROM great_reset_tombstones WHERE kind = 'ENTRY'
HAVING NOT EXISTS (SELECT 1 FROM entries);
SQL
)"
  [[ "$entry" =~ ^[1-9][0-9]*$ && "$topic" =~ ^[1-9][0-9]*$ && "$unknown" =~ ^[1-9][0-9]*$ ]] ||
    migration_fail RESET_TOMBSTONE_SAMPLE_MISSING
  reset_cleanup_containers
  env -u DATABASE_URL -u COMPOSE_PROJECT_NAME -u COMPOSE_FILE -u COMPOSE_PROFILES \
    APP_IMAGE="$candidate_image" "${compose[@]}" run -d --no-deps --pull never \
    --name "$container" --entrypoint /bin/sh app -c \
    'export DATABASE_URL="$(node -e "const u = new URL(process.env.DATABASE_URL); u.searchParams.set(\"options\", \"-c default_transaction_read_only=on\"); process.stdout.write(u.href)")" && exec node server.js' \
    </dev/null >/dev/null || migration_fail RESET_READONLY_START_FAILED
  status=1
  for _ in $(seq 1 60); do
    deadline_prefix
    if "${deadline[@]}" docker exec "$container" node -e \
      "Promise.all(['health','ready'].map(p=>fetch('http://127.0.0.1:3000/api/'+p).then(r=>{if(!r.ok)throw new Error(p)}))).catch(()=>process.exit(1))" \
      </dev/null >/dev/null 2>&1; then
      status=0
      break
    fi
    sleep 2
  done
  if ((status == 0)); then
    deadline_prefix
    "${deadline[@]}" docker exec -e "ENTRY=$entry" -e "TOPIC=$topic" -e "UNKNOWN=$unknown" \
      "$container" node -e '
      const expected = [
        ["/api/health", 200], ["/api/ready", 200], ["/", 200], ["/sitemap.xml", 200],
        ["/entry/" + process.env.ENTRY, 410], ["/baslik/eski--" + process.env.TOPIC, 410],
        ["/entry/" + process.env.UNKNOWN, 404],
      ];
      (async () => {
        for (const [path, status] of expected) {
          const response = await fetch("http://127.0.0.1:3000" + path, { redirect: "manual" });
          if (response.status !== status) { console.error("RESET_READONLY_UNEXPECTED " + path + " " + response.status); process.exit(1); }
        }
      })().catch(() => process.exit(1));
    ' </dev/null || status=1
  fi
  reset_cleanup_containers
  test -z "$(docker ps -aq --filter "name=^$container$")" || migration_fail RESET_READONLY_CONTAINER_LEFT
  ((status == 0)) || migration_fail RESET_READONLY_ACCEPTANCE_FAILED
  eligibility="$(reset_cli scripts/great-reset-operation.ts restore-eligibility \
    "$reset_operation_id" "$(cat "$migration_marker/reset-post-receipt-path")")" ||
    migration_fail RESET_ACCEPTANCE_WROTE_OR_DRIFTED
  test "$(reset_json_field eligible <<<"$eligibility")" = true ||
    migration_fail RESET_ACCEPTANCE_WROTE_OR_DRIFTED
  reset_request_ledger TRAFFIC_OPEN "$(cat "$migration_marker/reset-dump-sha256")" \
    "$(reset_json_field sha256 <"$(cat "$migration_marker/reset-post-receipt-path")")"
  set_phase reset-accepted
}

reset_record_exposure() {
  reset_cli scripts/great-reset-operation.ts traffic-open "$reset_operation_id" >/dev/null ||
    migration_fail RESET_TRAFFIC_EVENT_FAILED
  set_phase reset-exposed
  reset_restore_flags
  set_phase writers-may-run
  # A5 gibi: yazıcılar açılabilir, dondurma karşılaştırmaları bir daha koşmaz.
  frozen_deadline=0
}

reset_phase() {
  # Geri dönüş isteği (sarmalayıcı dış kaydın COMMITTED_MAINTENANCE olduğunu denetledi): yalnız
  # COMMIT sonrası ve TRAFFIC_OPEN onayından önce.
  if ((reset_rollback_requested == 1)); then
    case "$(current_phase)" in
      reset-receipted | reset-maintenance | reset-accepted) reset_rollback ;;
      reset-rolled-back) : ;;
      *) migration_fail RESET_ROLLBACK_PHASE_INVALID ;;
    esac
  fi
  case "$(current_phase)" in
    post-verified) reset_freeze_flags ;&
    reset-flags-frozen) reset_create_intent ;&
    reset-intent) reset_backup_and_verify ;&
    reset-backup-verified)
      reset_ledger_gate PREPARED
      set_phase reset-prepared
      ;&
    reset-prepared)
      reset_commit
      if test "$(current_phase)" = reset-committed; then reset_post_receipt; fi
      if test "$(current_phase)" != reset-receipted; then return 0; fi
      ;&
    reset-committed | reset-receipted)
      if test "$(current_phase)" = reset-committed; then reset_post_receipt; fi
      reset_ledger_gate COMMITTED_MAINTENANCE
      set_phase reset-maintenance
      ;&
    reset-maintenance) reset_readonly_acceptance ;&
    reset-accepted)
      reset_ledger_gate TRAFFIC_OPEN
      set_phase reset-traffic
      ;&
    reset-traffic | reset-exposed) reset_record_exposure ;;
    reset-aborted) reset_complete_abort ;;
    reset-rolled-back)
      reset_recovery_budget
      reset_ledger_gate ROLLED_BACK
      reset_finish_abort
      ;;
    reset-committing) migration_fail RESET_OUTCOME_AMBIGUOUS 98 ;;
    writers-may-run | traffic-open | worker-allowed | cutover-done) : ;;
    *) migration_fail RESET_PHASE_UNKNOWN ;;
  esac
}
