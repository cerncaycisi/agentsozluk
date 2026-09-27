# shellcheck shell=bash
#
# Great reset — COMMIT sonrası geri dönüş (runbook "Hata ve geri dönüş dalları"; tasarım v20
# madde 7). Tek başına çalışmaz: reset modunda `production-reset-phase.sh` ile birlikte `source`
# edilir ve yalnız sarmalayıcı `rollback:<dumpSha>:<receiptSha>` istediğinde, dış kayıt
# COMMITTED_MAINTENANCE iken (sarmalayıcı dış kaydı denetler; SHA'lar burada uzak dosyalarla
# eşlenir) çağrılır. Site, worker ve timer'lar kapalı kalır.
#
# Sıra: dış kayıt bağı → ayrı geri dönüş bütçesi → uygunluk → gölgeye restore (agent_sozluk rolü,
# tek transaction) → canlı↔restore makbuz eşitliği → kullanılan collation sürümleri → gölge
# işareti (dar kanıtlı) ve doğrulaması → işaretli makbuz → sabit bağlantılar → iki DB'nin kapısı
# ve yalnız sabit backend'ler → aynı bağlantılarda kapı sonrası doğrulama → bağlantılar bırakılır,
# sıfır backend → tek transaction'da yer değiştirme → yeni canonical kapısı açılır ve doğrulanır.
# Yeniden giriş, önce kapıları DB adlarından toparlar; yer değiştirme tekrarlanmaz.

reset_restore_marker() { printf '%s/reset-rollback-%s' "$migration_marker" "$1"; }

reset_database_exists() {
  test "$(admin_psql postgres -v "name=$1" <<'SQL'
SELECT count(*) FROM pg_database WHERE datname = :'name';
SQL
)" = 1
}

reset_database_allows() {
  admin_psql postgres -v "name=$1" <<'SQL'
SELECT datallowconn FROM pg_database WHERE datname = :'name';
SQL
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

reset_rollback_reopen_canonical() {
  admin_psql postgres <<'SQL' >/dev/null || return 1
ALTER DATABASE agent_sozluk WITH ALLOW_CONNECTIONS true;
SQL
  test "$(reset_database_allows agent_sozluk)" = t
}

reset_rollback_set_shadow_gate() {
  admin_psql postgres -v "shadow=$reset_shadow" -v "allow=$1" <<'SQL' >/dev/null
SELECT format('ALTER DATABASE %I WITH ALLOW_CONNECTIONS %s', :'shadow', :'allow') \gexec
SQL
}

# Yeniden girişte, canonical'a bağlanan hiçbir denetimden ÖNCE (Astra, PR #242 P2): kapılar kapalı
# kalmış olabilir. Yalnız kontrol DB'sinden (`postgres`) okunur/yazılır. Yer değiştirme olduysa
# (eski ad var, gölge adı yok) yeni canonical açılır; olmadıysa canonical açılır.
reset_rollback_recover_gates() {
  test -f "$(reset_restore_marker shadow)" || return 0
  reset_rollback_names
  if reset_database_exists agent_sozluk && test "$(reset_database_allows agent_sozluk)" != t; then
    reset_rollback_reopen_canonical || migration_fail RESET_ROLLBACK_GATE_RECOVERY_FAILED
    printf 'RELEASE_RESET_ROLLBACK_GATE_RECOVERED\n' >&2
  fi
  if reset_database_exists "$reset_shadow"; then
    reset_rollback_set_shadow_gate true || migration_fail RESET_ROLLBACK_GATE_RECOVERY_FAILED
  fi
}

# Ayrı, kalıcı geri dönüş bütçesi (Astra, PR #242 P1): kabulün tükettiği bakım bütçesinden
# bağımsız; ilk girişte yazılır, dolunca yeni adım başlamaz.
reset_rollback_budget() {
  local file="$migration_marker/reset-rollback-deadline"
  if test ! -f "$file"; then
    printf '%s\n' "$(($(date +%s) + 1800))" >"$file.next"
    mv -Tf "$file.next" "$file"
  fi
  frozen_deadline="$(cat "$file")"
  [[ "$frozen_deadline" =~ ^[0-9]+$ ]] || migration_fail RESET_ROLLBACK_DEADLINE_INVALID
  if (($(date +%s) >= frozen_deadline)); then migration_fail RESET_ROLLBACK_BUDGET_EXHAUSTED 98; fi
  recovering=1
  reset_recovery_active=1
}

# Kullanılan bütün collation'ların (varsayılan, sütun ve indeks) sürümü canonical ile gölgede aynı
# olmalı (runbook; Astra, PR #242 P2).
reset_collation_versions() {
  admin_psql "$1" <<'SQL'
SELECT coalesce(c.collname, '-') || '|' || coalesce(c.collprovider::text, '-') || '|'
  || coalesce(c.collversion, '-') || '|' || coalesce(pg_collation_actual_version(c.oid), '-')
FROM pg_collation c
WHERE c.oid IN (
  SELECT attcollation FROM pg_attribute WHERE attcollation <> 0
  UNION SELECT unnest(indcollation::oid[]) FROM pg_index)
UNION ALL
SELECT 'database|' || coalesce(datcollversion, '-') || '|'
  || coalesce(pg_database_collation_actual_version(oid), '-')
FROM pg_database WHERE datname = current_database()
ORDER BY 1;
SQL
}

reset_rollback() {
  local dump dump_sha pre post post_sha commit eligibility stamp shadow_before shadow_after
  reset_rollback_budget
  # Dış kayıt bağı: sarmalayıcının dış kayıttan getirdiği SHA'lar uzak dosyalarla, hiçbir
  # mutasyondan önce birebir eşleşmeli (Astra, PR #242 P1).
  [[ "${reset_rollback_expected_dump:-}" =~ ^[0-9a-f]{64}$ &&
     "${reset_rollback_expected_receipt:-}" =~ ^[0-9a-f]{64}$ ]] ||
    migration_fail RESET_ROLLBACK_LEDGER_BINDING_MISSING
  test -f "$migration_marker/reset-ack-COMMITTED_MAINTENANCE" ||
    migration_fail RESET_ROLLBACK_NOT_COMMITTED_MAINTENANCE
  test ! -f "$migration_marker/reset-ack-TRAFFIC_OPEN" || migration_fail RESET_ROLLBACK_AFTER_TRAFFIC_OPEN
  dump="$(cat "$migration_marker/reset-dump-path")"
  dump_sha="$(cat "$migration_marker/reset-dump-sha256")"
  pre="$(cat "$migration_marker/reset-pre-receipt-path")"
  post="$(cat "$migration_marker/reset-post-receipt-path")"
  post_sha="$(reset_json_field sha256 <"$post")"
  test "$dump_sha" = "$reset_rollback_expected_dump" || migration_fail RESET_ROLLBACK_LEDGER_MISMATCH
  test "$post_sha" = "$reset_rollback_expected_receipt" || migration_fail RESET_ROLLBACK_LEDGER_MISMATCH
  test "$(cut -d '|' -f 2- "$migration_marker/reset-request-COMMITTED_MAINTENANCE")" = \
    "$dump_sha|$post_sha" || migration_fail RESET_ROLLBACK_LEDGER_MISMATCH
  test "$(sha256sum "$dump" | cut -d ' ' -f 1)" = "$dump_sha" || migration_fail RESET_ROLLBACK_DUMP_CHANGED
  reset_rollback_names

  # Yer değiştirme önceki girişte tamamlandıysa (eski ad var, gölge adı yok) yalnız doğrula.
  if reset_database_exists "$reset_old" && ! reset_database_exists "$reset_shadow"; then
    reset_rollback_finish "$dump_sha" "$(cat "$(reset_restore_marker commit)")"
    return 0
  fi
  assert_frozen

  eligibility="$(reset_cli scripts/great-reset-operation.ts restore-eligibility \
    "$reset_operation_id" "$post")" || migration_fail RESET_ROLLBACK_NOT_ELIGIBLE
  test "$(reset_json_field eligible <<<"$eligibility")" = true || migration_fail RESET_ROLLBACK_NOT_ELIGIBLE
  commit="$(reset_json_field commitSha256 <<<"$(reset_cli scripts/great-reset-operation.ts \
    commit-digest "$reset_operation_id")")" || migration_fail RESET_ROLLBACK_COMMIT_UNREADABLE
  [[ "$commit" =~ ^[0-9a-f]{64}$ ]] || migration_fail RESET_ROLLBACK_COMMIT_UNREADABLE
  printf '%s\n' "$commit" >"$(reset_restore_marker commit)"

  # Yarım kalmış gölge atılır, baştan kurulur (canonical'a dokunulmadı).
  if reset_database_exists "$reset_shadow"; then
    admin_psql postgres -v "shadow=$reset_shadow" <<'SQL' >/dev/null ||
SELECT format('DROP DATABASE %I WITH (FORCE)', :'shadow') \gexec
SQL
      migration_fail RESET_ROLLBACK_SHADOW_DROP_FAILED
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

  test "$(reset_collation_versions agent_sozluk)" = "$(reset_collation_versions "$reset_shadow")" ||
    migration_fail RESET_ROLLBACK_COLLATION_VERSION_MISMATCH

  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  shadow_before="$migration_dir/reset-rollback-shadow-before-$stamp.json"
  shadow_after="$migration_dir/reset-rollback-shadow-after-$stamp.json"
  reset_cli scripts/great-reset-operation.ts receipt "$shadow_before" --database "$reset_shadow" \
    >/dev/null || migration_fail RESET_ROLLBACK_RECEIPT_FAILED
  reset_cli scripts/great-reset-operation.ts receipt-compare-restored "$pre" "$shadow_before" \
    >/dev/null || migration_fail RESET_ROLLBACK_SHADOW_MISMATCH
  # İşaret çıktısı, işaret transaction'ında ölçülen iki tablo özetini taşır; gölge makbuzu buna
  # birebir bağlanır (Astra, PR #242 P1).
  local marked="$migration_dir/reset-rollback-mark-$stamp.json"
  (umask 077 && reset_cli scripts/great-reset-operation.ts shadow-mark "$reset_operation_id" \
    "$dump_sha" "$commit" --database "$reset_shadow" >"$marked") ||
    migration_fail RESET_ROLLBACK_MARK_FAILED
  test "$(reset_json_field deltaVerified <"$marked")" = true || migration_fail RESET_ROLLBACK_MARK_FAILED
  reset_cli scripts/great-reset-operation.ts restore-verify "$reset_operation_id" "$dump_sha" \
    "$commit" --database "$reset_shadow" >/dev/null || migration_fail RESET_ROLLBACK_SHADOW_UNVERIFIED
  reset_cli scripts/great-reset-operation.ts receipt "$shadow_after" --database "$reset_shadow" \
    >/dev/null || migration_fail RESET_ROLLBACK_RECEIPT_FAILED
  reset_cli scripts/great-reset-operation.ts receipt-compare-shadow "$pre" "$shadow_after" \
    "$marked" >/dev/null || migration_fail RESET_ROLLBACK_SHADOW_MISMATCH

  reset_rollback_gated_verify "$dump_sha" "$commit" "$post" "$shadow_after"

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
  reset_rollback_finish "$dump_sha" "$commit"
}

# Sabit bağlantılar → kapılar → yalnız sabit backend'ler → aynı bağlantılarda doğrulama →
# bağlantılar bırakılır → sıfır backend. Herhangi bir hata canonical kapısını geri açar ve durur.
reset_rollback_gated_verify() {
  local dump_sha="$1" commit="$2" post="$3" shadow_after="$4" line canonical_pid shadow_pid
  local result pids expected verify_pid
  coproc RESET_PIN {
    reset_cli_signalled scripts/great-reset-operation.ts rollback-pinned-verify "$reset_operation_id" \
      "$dump_sha" "$commit" "$post" "$shadow_after" --database "$reset_shadow" 2>&1
  }
  verify_pid="$RESET_PIN_PID"
  if ! IFS= read -r -t 300 line <&"${RESET_PIN[0]}" ||
     ! [[ "$line" =~ ^PINNED\ canonical=([0-9]+)\ shadow=([0-9]+)$ ]]; then
    kill "$verify_pid" 2>/dev/null || true
    migration_fail RESET_ROLLBACK_PIN_FAILED
  fi
  canonical_pid="${BASH_REMATCH[1]}"
  shadow_pid="${BASH_REMATCH[2]}"
  admin_psql postgres -v "shadow=$reset_shadow" <<'SQL' >/dev/null || {
ALTER DATABASE agent_sozluk WITH ALLOW_CONNECTIONS false;
SELECT format('ALTER DATABASE %I WITH ALLOW_CONNECTIONS false', :'shadow') \gexec
SQL
    kill "$verify_pid" 2>/dev/null || true
    reset_rollback_reopen_canonical || true
    migration_fail RESET_ROLLBACK_GATE_FAILED
  }
  pids="$(admin_psql postgres -v "shadow=$reset_shadow" <<'SQL'
SELECT coalesce(string_agg(pid::text, ',' ORDER BY pid), '') || '|'
  || (SELECT count(*) FROM pg_prepared_xacts WHERE database IN ('agent_sozluk', :'shadow')) || '|'
  || (SELECT count(*) FROM pg_database WHERE datname IN ('agent_sozluk', :'shadow') AND datallowconn)
FROM (SELECT pid FROM (SELECT pg_stat_clear_snapshot()) AS cleared, pg_stat_activity
      WHERE datname IN ('agent_sozluk', :'shadow')) AS backends;
SQL
)" || pids=error
  expected="$(printf '%s\n' "$canonical_pid" "$shadow_pid" | sort -n | paste -sd ,)|0|0"
  if test "$pids" != "$expected"; then
    kill "$verify_pid" 2>/dev/null || true
    reset_rollback_reopen_canonical || true
    migration_fail RESET_ROLLBACK_UNEXPECTED_BACKEND
  fi
  if ! printf 'GATES_CLOSED\n' >&"${RESET_PIN[1]}"; then
    kill "$verify_pid" 2>/dev/null || true
    reset_rollback_reopen_canonical || true
    migration_fail RESET_ROLLBACK_GATED_VERIFY_FAILED
  fi
  result=''
  while IFS= read -r -t 900 line <&"${RESET_PIN[0]}"; do result="$line"; done
  wait "$verify_pid" 2>/dev/null || true
  if test "$(reset_json_field verified <<<"$result" 2>/dev/null || true)" != true; then
    reset_rollback_reopen_canonical || true
    migration_fail RESET_ROLLBACK_GATED_VERIFY_FAILED
  fi
  test "$(admin_psql postgres -v "shadow=$reset_shadow" <<'SQL'
SELECT (SELECT count(*) FROM (SELECT pg_stat_clear_snapshot()) AS cleared) - 1
     + (SELECT count(*) FROM pg_stat_activity WHERE datname IN ('agent_sozluk', :'shadow'));
SQL
)" = 0 || {
    reset_rollback_reopen_canonical || true
    migration_fail RESET_ROLLBACK_UNEXPECTED_BACKEND
  }
}

reset_rollback_finish() {
  local dump_sha="$1" commit="$2"
  [[ "$commit" =~ ^[0-9a-f]{64}$ ]] || migration_fail RESET_ROLLBACK_COMMIT_UNREADABLE
  reset_database_exists "$reset_old" || migration_fail RESET_ROLLBACK_RENAME_UNVERIFIED
  reset_database_exists agent_sozluk || migration_fail RESET_ROLLBACK_RENAME_UNVERIFIED
  reset_rollback_reopen_canonical || migration_fail RESET_ROLLBACK_REOPEN_FAILED
  # Eski reset DB'si kapalı kalır; kabul bitene dek kanıt olarak saklanır.
  test "$(reset_database_allows "$reset_old")" = f || migration_fail RESET_ROLLBACK_OLD_GATE_OPEN
  reset_cli scripts/great-reset-operation.ts restore-verify "$reset_operation_id" "$dump_sha" \
    "$commit" >/dev/null || migration_fail RESET_ROLLBACK_CANONICAL_UNVERIFIED
  : >"$(reset_restore_marker complete)"
  reset_request_ledger ROLLED_BACK "$dump_sha" \
    "$(cut -d '|' -f 3 "$migration_marker/reset-request-COMMITTED_MAINTENANCE")"
  set_phase reset-rolled-back
  printf 'RELEASE_RESET_ROLLED_BACK canonical=restored old=%s\n' "$reset_old"
}
