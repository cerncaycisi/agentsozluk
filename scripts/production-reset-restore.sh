# shellcheck shell=bash
#
# Great reset — COMMIT sonrası geri dönüş (runbook "Hata ve geri dönüş dalları"; tasarım v20
# madde 7). Tek başına çalışmaz: reset modunda `production-reset-phase.sh` ile birlikte `source`
# edilir ve yalnız sarmalayıcı `rollback` istediğinde, dış kayıt COMMITTED_MAINTENANCE iken
# (sarmalayıcı dış kaydı ayrıca denetler) çağrılır. Site, worker ve timer'lar kapalı kalır.
#
# Sıra: uygunluk → reset-anı yedeğinin gölgeye restore'u (agent_sozluk rolü altında, tek
# transaction) → canlı↔restore makbuz eşitliği → collation sürümü → gölgeyi işaretle (niyet
# geçersiz, restore audit'i) → doğrula → iki DB'nin kapısı → tek transaction'da yer değiştirme →
# yeni canonical kapısı açılır ve doğrulanır. Yeniden giriş, DB adlarından nerede kalındığını
# çıkarır; reset ve yer değiştirme tekrarlanmaz.

reset_restore_marker() { printf '%s/reset-rollback-%s' "$migration_marker" "$1"; }

reset_database_exists() {
  test "$(admin_psql postgres -v "name=$1" <<'SQL'
SELECT count(*) FROM pg_database WHERE datname = :'name';
SQL
)" = 1
}

reset_rollback_names() {
  local shadow_file old_file
  shadow_file="$(reset_restore_marker shadow)"
  old_file="$(reset_restore_marker old)"
  if test ! -f "$shadow_file"; then
    printf 'agent_sozluk_restore_%s_%s\n' "$(date -u +%Y%m%d_%H%M%S)" "${op_id:0:6}" >"$shadow_file"
    printf 'agent_sozluk_reset_%s_%s\n' "$(date -u +%Y%m%d_%H%M%S)" "${reset_operation_id:0:8}" \
      >"$old_file"
  fi
  reset_shadow="$(cat "$shadow_file")"
  reset_old="$(cat "$old_file")"
  [[ "$reset_shadow" =~ ^agent_sozluk_restore_[0-9]{8}_[0-9]{6}_[0-9a-f]{6}$ ]] ||
    migration_fail RESET_ROLLBACK_NAME_INVALID
  [[ "$reset_old" =~ ^agent_sozluk_reset_[0-9]{8}_[0-9]{6}_[0-9a-f]{8}$ ]] ||
    migration_fail RESET_ROLLBACK_NAME_INVALID
}

reset_rollback_close_gates() {
  admin_psql postgres -v "shadow=$reset_shadow" <<'SQL' >/dev/null || return 1
ALTER DATABASE agent_sozluk WITH ALLOW_CONNECTIONS false;
SELECT format('ALTER DATABASE %I WITH ALLOW_CONNECTIONS false', :'shadow') \gexec
SQL
  # Kapı kapandıktan sonra iki DB'de hiçbir backend, hazırlanmış işlem ya da açık kapı kalmamalı.
  test "$(admin_psql postgres -v "shadow=$reset_shadow" <<'SQL'
SELECT (SELECT count(*) FROM (SELECT pg_stat_clear_snapshot()) AS cleared) - 1
     + (SELECT count(*) FROM pg_stat_activity
         WHERE datname IN ('agent_sozluk', :'shadow') AND pid <> pg_backend_pid())
     + (SELECT count(*) FROM pg_prepared_xacts WHERE database IN ('agent_sozluk', :'shadow'))
     + (SELECT count(*) FROM pg_database
         WHERE datname IN ('agent_sozluk', :'shadow') AND datallowconn);
SQL
)" = 0 || return 1
}

reset_rollback_reopen_canonical() {
  admin_psql postgres <<'SQL' >/dev/null || return 1
ALTER DATABASE agent_sozluk WITH ALLOW_CONNECTIONS true;
SQL
  test "$(admin_psql postgres -c "SELECT datallowconn FROM pg_database WHERE datname = 'agent_sozluk'" \
    </dev/null)" = t
}

reset_rollback() {
  local dump dump_sha pre post commit eligibility stamp shadow_before shadow_after
  assert_frozen
  test -f "$migration_marker/reset-ack-COMMITTED_MAINTENANCE" ||
    migration_fail RESET_ROLLBACK_NOT_COMMITTED_MAINTENANCE
  test ! -f "$migration_marker/reset-ack-TRAFFIC_OPEN" || migration_fail RESET_ROLLBACK_AFTER_TRAFFIC_OPEN
  dump="$(cat "$migration_marker/reset-dump-path")"
  dump_sha="$(cat "$migration_marker/reset-dump-sha256")"
  pre="$(cat "$migration_marker/reset-pre-receipt-path")"
  post="$(cat "$migration_marker/reset-post-receipt-path")"
  test "$(sha256sum "$dump" | cut -d ' ' -f 1)" = "$dump_sha" || migration_fail RESET_ROLLBACK_DUMP_CHANGED
  reset_rollback_names

  # Yer değiştirme önceki girişte tamamlandıysa (eski ad var, gölge adı yok) yalnız doğrula.
  if reset_database_exists "$reset_old" && ! reset_database_exists "$reset_shadow"; then
    reset_rollback_finish "$dump_sha"
    return 0
  fi

  eligibility="$(reset_cli scripts/great-reset-operation.ts restore-eligibility \
    "$reset_operation_id" "$post")" || migration_fail RESET_ROLLBACK_NOT_ELIGIBLE
  test "$(reset_json_field eligible <<<"$eligibility")" = true || migration_fail RESET_ROLLBACK_NOT_ELIGIBLE
  commit="$(reset_json_field commitSha256 <<<"$(reset_cli scripts/great-reset-operation.ts \
    commit-digest "$reset_operation_id")")" || migration_fail RESET_ROLLBACK_COMMIT_UNREADABLE
  [[ "$commit" =~ ^[0-9a-f]{64}$ ]] || migration_fail RESET_ROLLBACK_COMMIT_UNREADABLE

  # Yarım kalmış gölge atılır, baştan kurulur (canonical'a dokunulmadı).
  if reset_database_exists "$reset_shadow"; then
    admin_psql postgres -v "shadow=$reset_shadow" <<'SQL' >/dev/null || migration_fail RESET_ROLLBACK_SHADOW_DROP_FAILED
SELECT format('DROP DATABASE %I WITH (FORCE)', :'shadow') \gexec
SQL
  fi
  assert_disk_budget restore
  local collate ctype deadline
  collate="$(db_psql agent_sozluk -c 'SELECT datcollate FROM pg_database WHERE datname = current_database();' </dev/null)"
  ctype="$(db_psql agent_sozluk -c 'SELECT datctype FROM pg_database WHERE datname = current_database();' </dev/null)"
  deadline_prefix
  "${deadline[@]}" "${compose[@]}" exec -T db createdb -U postgres -O agent_sozluk -T template0 \
    -E UTF8 --lc-collate="$collate" --lc-ctype="$ctype" "$reset_shadow" </dev/null ||
    migration_fail RESET_ROLLBACK_SHADOW_CREATE_FAILED
  deadline_prefix
  "${deadline[@]}" "${compose[@]}" exec -T db pg_restore --exit-on-error --single-transaction \
    -U postgres --role=agent_sozluk -d "$reset_shadow" <"$dump" ||
    migration_fail RESET_ROLLBACK_RESTORE_FAILED

  # Collation sağlayıcı sürümü (makbuz dışı): kaynak ile gölge aynı olmalı.
  test "$(admin_psql postgres -v "shadow=$reset_shadow" <<'SQL'
SELECT count(DISTINCT coalesce(datcollversion, '-') || '|'
  || coalesce(pg_database_collation_actual_version(oid), '-'))
FROM pg_database WHERE datname IN ('agent_sozluk', :'shadow');
SQL
)" = 1 || migration_fail RESET_ROLLBACK_COLLATION_VERSION_MISMATCH

  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  shadow_before="$migration_dir/reset-rollback-shadow-before-$stamp.json"
  shadow_after="$migration_dir/reset-rollback-shadow-after-$stamp.json"
  reset_cli scripts/great-reset-operation.ts receipt "$shadow_before" --database "$reset_shadow" \
    >/dev/null || migration_fail RESET_ROLLBACK_RECEIPT_FAILED
  reset_cli scripts/great-reset-operation.ts receipt-compare-restored "$pre" "$shadow_before" \
    >/dev/null || migration_fail RESET_ROLLBACK_SHADOW_MISMATCH
  reset_cli scripts/great-reset-operation.ts shadow-mark "$reset_operation_id" "$dump_sha" \
    "$commit" --database "$reset_shadow" >/dev/null || migration_fail RESET_ROLLBACK_MARK_FAILED
  reset_cli scripts/great-reset-operation.ts restore-verify "$reset_operation_id" "$dump_sha" \
    --database "$reset_shadow" >/dev/null || migration_fail RESET_ROLLBACK_SHADOW_UNVERIFIED
  reset_cli scripts/great-reset-operation.ts receipt "$shadow_after" --database "$reset_shadow" \
    >/dev/null || migration_fail RESET_ROLLBACK_RECEIPT_FAILED
  reset_cli scripts/great-reset-operation.ts receipt-compare-shadow "$pre" "$shadow_after" \
    >/dev/null || migration_fail RESET_ROLLBACK_SHADOW_MISMATCH

  # Son uygunluk, kapılardan hemen önce (worker/app/timer kapalı; tek yazıcı yok).
  eligibility="$(reset_cli scripts/great-reset-operation.ts restore-eligibility \
    "$reset_operation_id" "$post")" || migration_fail RESET_ROLLBACK_NOT_ELIGIBLE
  test "$(reset_json_field eligible <<<"$eligibility")" = true || migration_fail RESET_ROLLBACK_NOT_ELIGIBLE

  if ! reset_rollback_close_gates; then
    reset_rollback_reopen_canonical ||
      printf 'RELEASE_WARN canonical gate could not be reopened; use container console\n' >&2
    migration_fail RESET_ROLLBACK_GATE_FAILED
  fi
  # Tek transaction: canonical eski ada, gölge canonical ada. Hata ikisini de geri alır.
  if ! admin_psql postgres -v "shadow=$reset_shadow" -v "old=$reset_old" <<'SQL' >/dev/null; then
BEGIN;
SELECT format('ALTER DATABASE agent_sozluk RENAME TO %I', :'old') \gexec
SELECT format('ALTER DATABASE %I RENAME TO agent_sozluk', :'shadow') \gexec
COMMIT;
SQL
    reset_rollback_reopen_canonical ||
      printf 'RELEASE_WARN canonical gate could not be reopened; use container console\n' >&2
    migration_fail RESET_ROLLBACK_RENAME_FAILED
  fi
  reset_rollback_finish "$dump_sha"
}

reset_rollback_finish() {
  local dump_sha="$1"
  reset_database_exists "$reset_old" || migration_fail RESET_ROLLBACK_RENAME_UNVERIFIED
  reset_database_exists agent_sozluk || migration_fail RESET_ROLLBACK_RENAME_UNVERIFIED
  reset_rollback_reopen_canonical || migration_fail RESET_ROLLBACK_REOPEN_FAILED
  # Eski reset DB'si kapalı kalır; kabul bitene dek kanıt olarak saklanır.
  test "$(admin_psql postgres -v "old=$reset_old" <<'SQL'
SELECT datallowconn FROM pg_database WHERE datname = :'old';
SQL
)" = f || migration_fail RESET_ROLLBACK_OLD_GATE_OPEN
  reset_cli scripts/great-reset-operation.ts restore-verify "$reset_operation_id" "$dump_sha" \
    >/dev/null || migration_fail RESET_ROLLBACK_CANONICAL_UNVERIFIED
  : >"$(reset_restore_marker complete)"
  reset_request_ledger ROLLED_BACK "$dump_sha" \
    "$(cut -d '|' -f 3 "$migration_marker/reset-request-COMMITTED_MAINTENANCE")"
  set_phase reset-rolled-back
  printf 'RELEASE_RESET_ROLLED_BACK canonical=restored old=%s\n' "$reset_old"
}
