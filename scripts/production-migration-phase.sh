# shellcheck shell=bash
#
# A5 — migration'lı üretim dağıtımının migration fazı (docs/PLAN.md A5,
# docs/PRODUCTION_RUNBOOK.md "Migration'lı sürüm").
#
# Bu dosya tek başına çalışmaz: `production-release-remote.sh` onu yalnız
# `apply:<liste>` modunda, aynı SHA'nın checkout'undan `source` eder ve şu
# değişkenleri hazır verir: compose, state_dir, app_root, runtime_root,
# candidate_sha, candidate_image, op_id, approved_migrations.
#
# Sıra (kısa kesintili; Gökhan kararı, 23 Eylül): plan → imaj doğrulaması →
# ön kontrol → drenaj + dondurma (Caddy ve app durur) → yedek → izole restore
# kanıtı → scratch'te prova (migration + önceki imajın açılışı) → üretimde
# migration → post-verify → `writers-may-run`. Sonrası mevcut kesim akışıdır.
#
# Aşamalar `$migration_marker/phase` dosyasında atomik yazılır. Yeniden girişte
# yalnız güvenli noktadan devam edilir; `migrate` asla kör tekrarlanmaz.
#
# Bash, `f || x` biçiminde çağrılan bir fonksiyonun GÖVDESİNİN TAMAMINDA `set -e`'yi
# kapatır (Sol, 23 Eylül). Bu yüzden güvenlik kontrolü yapan fonksiyonlar ya `||`
# olmadan çağrılır ya da her adımını açıkça sınar (`|| return 1`, `|| migration_fail`).

migration_marker="$runtime_root/.migration-operation"
migration_hold="$runtime_root/.migration-hold"
migration_dir="$state_dir/migration"
backups_dir=/opt/agent-sozluk/backups
scratch_database=''
scratch_owned=0
production_timeouts_set=0
freeze_started=0
# Üretimde worker birimiyle aynı Node; testler kendi Node'unu verebilir.
host_node="${host_node:-/usr/bin/node}"
# Dondurmadan itibaren toplam kesinti üst sınırı (saniye). Aşılırsa uzun komutlar
# `timeout` ile kesilir ve aşamaya göre geri açma kuralı uygulanır (Astra, 23 Eylül).
max_downtime_seconds="${max_downtime_seconds:-2700}"
frozen_deadline=0
# Hata tuzağında kurtarma ayrı, sınırlı bir bütçeyle koşar ve süre kontrolü
# asla `exit` etmez; yoksa dolmuş bütçe eski sitenin geri açılmasını keserdi
# (Astra, 23 Eylül).
recovering=0
migration_status=0

migration_fail() {
  printf 'RELEASE_FAIL code=%s\n' "$1" >&2
  exit "${2:-97}"
}

phase_rank() {
  case "$1" in
    planned) echo 1 ;;
    image-verified) echo 2 ;;
    frozen) echo 3 ;;
    backup-verified) echo 4 ;;
    rehearsed) echo 5 ;;
    migrating) echo 6 ;;
    migrated) echo 7 ;;
    post-verified) echo 8 ;;
    writers-may-run) echo 9 ;;
    traffic-open) echo 10 ;;
    worker-allowed) echo 11 ;;
    cutover-done) echo 12 ;;
    *) echo 0 ;;
  esac
}

current_phase() {
  if test -f "$migration_marker/phase"; then cat "$migration_marker/phase"; else echo none; fi
}

phase_reached() {
  (($(phase_rank "$(current_phase)") >= $(phase_rank "$1")))
}

# Aşama yalnız ileri gider; yeniden girişte daha önceki bir aşamayı yazmak
# (ör. kesim tekrarında `traffic-open`) kaydı geriye almaz.
set_phase() {
  local next="$1"
  if (($(phase_rank "$next") <= $(phase_rank "$(current_phase)"))); then return 0; fi
  printf '%s\n' "$next" >"$migration_marker/phase.next"
  mv -Tf "$migration_marker/phase.next" "$migration_marker/phase"
  printf 'RELEASE_MIGRATION_PHASE %s\n' "$next"
}

migration_identity() {
  printf '%s|%s\n' "$candidate_sha" "$(printf '%s\n' "$approved_migrations" | sha256sum | cut -d ' ' -f 1)"
}

# Kesinti süresi dolmuşsa durur; dolmamışsa kalan saniyeyi basar. Dondurma
# öncesinde sınır yoktur (0).
downtime_remaining() {
  local remaining
  if ((frozen_deadline == 0)); then printf '0\n'; return 0; fi
  remaining=$((frozen_deadline - $(date +%s)))
  if ((remaining <= 0)); then
    # Kurtarmada durma yok: komut 1 sn içinde başarısız döner, tuzak sürer.
    if ((recovering == 1)); then printf '1\n'; return 0; fi
    migration_fail DOWNTIME_BUDGET_EXCEEDED
  fi
  printf '%s\n' "$remaining"
}

# Dondurma sürerken uzun harici komutlar kalan süreyle sınırlanır.
deadline_prefix() {
  local remaining
  deadline=()
  remaining="$(downtime_remaining)" || migration_fail DOWNTIME_BUDGET_EXCEEDED
  if ((remaining > 0)); then deadline=(timeout -k 30 "$remaining"); fi
}

# psql: her oturum `application_name=a5-<op-id>` taşır; elle kilit temizliği
# ölçütü (runbook) bu adla kalan backend arar.
db_psql() {
  local database="$1" deadline
  shift
  deadline_prefix
  "${deadline[@]}" "${compose[@]}" exec -T -e "PGAPPNAME=a5-$op_id" db \
    psql -XAtq -v ON_ERROR_STOP=1 -U agent_sozluk -d "$database" "$@"
}

# Yönetici rolü (db konteynerindeki `postgres`): oturum görünürlüğü gereken
# kontroller bununla yapılır. Uygulama rolü `pg_read_all_stats` yetkili değilse
# başka rolün oturumunda `backend_type` NULL görünür ve "başka oturum yok"
# kanıtı yanıltıcı biçimde geçer (Astra, 23 Eylül).
admin_psql() {
  local database="$1" deadline
  shift
  deadline_prefix
  "${deadline[@]}" "${compose[@]}" exec -T -e "PGAPPNAME=a5-$op_id" db \
    psql -XAtq -v ON_ERROR_STOP=1 -U postgres -d "$database" "$@"
}

migration_file() {
  printf '%s/prisma/migrations/%s/migration.sql\n' "$app_root" "$1"
}

# --- 1. Plan -----------------------------------------------------------------

plan_migrations() {
  local applied candidate pending last_applied name failed
  install -d -m 0700 "$migration_dir"
  applied="$migration_dir/applied-before"
  candidate="$migration_dir/candidate"
  pending="$migration_dir/pending"
  failed="$(db_psql agent_sozluk -c \
    'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL;' \
    </dev/null)"
  test "$failed" = 0 || migration_fail MIGRATION_FAILED_RECORD_PRESENT
  cp "$state_dir/baseline-applied-migrations" "$applied"
  cp "$state_dir/baseline-candidate-migrations" "$candidate"
  comm -23 "$applied" "$candidate" >"$migration_dir/applied-missing"
  test ! -s "$migration_dir/applied-missing" || migration_fail APPLIED_MIGRATION_MISSING_IN_CANDIDATE
  comm -13 "$applied" "$candidate" >"$pending"
  test -s "$pending" || migration_fail NO_PENDING_MIGRATION
  printf '%s\n' "$approved_migrations" | tr ',' '\n' | LC_ALL=C sort >"$migration_dir/approved"
  cmp -s "$pending" "$migration_dir/approved" || migration_fail MIGRATION_SET_UNAPPROVED
  last_applied="$(tail -n 1 "$applied")"
  while IFS= read -r name; do
    [[ "$name" > "$last_applied" ]] || migration_fail MIGRATION_OUT_OF_ORDER
  done <"$pending"

  # Uygulanmış her migration'ın Prisma checksum'ı checkout'taki dosyayla eşit:
  # aynı adla içeriği değiştirilmiş eski migration ad kümesinde görünmez.
  db_psql agent_sozluk -F ' ' -c \
    'SELECT migration_name, checksum FROM "_prisma_migrations"
     WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name;' \
    </dev/null >"$migration_dir/applied-checksums"
  while read -r name checksum; do
    test "$(sha256sum <"$(migration_file "$name")" | cut -d ' ' -f 1)" = "$checksum" ||
      migration_fail APPLIED_MIGRATION_CHECKSUM_MISMATCH
  done <"$migration_dir/applied-checksums"

  # Bekleyen migration'lar birlikte, uygulanacakları sırayla denetlenir; bir
  # dosyada açılan tablo diğerinde "mevcut" sayılmasın.
  while IFS= read -r name; do cat "$(migration_file "$name")"; printf '\n'; done \
    <"$pending" >"$migration_dir/pending.sql"
  "$host_node" "$app_root/scripts/check-additive-migration.mjs" "$migration_dir/pending.sql" \
    >"$migration_dir/expectation.json" || migration_fail MIGRATION_NOT_ADDITIVE
  # Mevcut tabloya eklenen indekslerin adları: şema özetinde yalnız bunların
  # `CREATE INDEX` satırı hariç tutulur (başka her şey birebir kalmalı).
  "$host_node" -e '
    const value = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
    for (const name of Object.keys(value.existingTableIndexes ?? {})) process.stdout.write(name + "\n");
  ' "$migration_dir/expectation.json" >"$migration_dir/existing-index-names" ||
    migration_fail EXPECTATION_UNREADABLE

  install -d -m 0700 "$migration_marker"
  migration_identity >"$migration_marker/identity"
  printf '%s\n' "$state_dir" >"$migration_marker/state-dir"
  set_phase planned
}

# --- 2. İmaj --------------------------------------------------------------------

verify_migration_image() {
  local image_id name inside
  image_id="$(cat "$state_dir/candidate-image-id")"
  test "$(docker image inspect --format '{{.Id}}' "$candidate_image")" = "$image_id"
  while IFS= read -r name; do
    inside="$(
      docker run --rm --pull never --network none --entrypoint sha256sum "$image_id" \
        "/app/prisma/migrations/$name/migration.sql" </dev/null | cut -d ' ' -f 1
    )"
    test "$inside" = "$(sha256sum <"$(migration_file "$name")" | cut -d ' ' -f 1)" ||
      migration_fail IMAGE_MIGRATION_MISMATCH
  done <"$migration_dir/pending"
  docker run --rm --pull never --network none --entrypoint test "$image_id" \
    -f /app/scripts/run-migration.mjs </dev/null || migration_fail IMAGE_MIGRATION_RUNNER_MISSING
  set_phase image-verified
}

# --- 3. Ön kontrol ------------------------------------------------------------

preflight_migration() {
  test "$(db_psql agent_sozluk -c 'SHOW server_encoding;' </dev/null)" = UTF8 ||
    migration_fail DATABASE_ENCODING_NOT_UTF8
  # Uygulama rolü veritabanının sahibi olmalı (ALTER DATABASE … SET, restore
  # edilen kopyanın sahibi). Scratch'i açıp düşürmek ise db konteynerindeki
  # yönetici rolünün işi: üretimde `agent_sozluk` ne süper kullanıcı ne de
  # CREATEDB yetkili (ilk kullanım öncesi salt okunur kontrol, 23 Eylül).
  test "$(db_psql agent_sozluk -c \
    "SELECT d.datdba = r.oid FROM pg_roles r, pg_database d
     WHERE r.rolname = current_user AND d.datname = current_database();" </dev/null)" = t ||
    migration_fail DATABASE_OWNER_MISMATCH
  test "$("${compose[@]}" exec -T db psql -XAtq -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c 'SELECT rolsuper FROM pg_roles WHERE rolname = current_user;' </dev/null)" = t ||
    migration_fail DATABASE_ADMIN_ROLE_UNAVAILABLE

  # Önceden bir zaman aşımı ayarı varsa dur: `RESET` onu geri getiremez.
  test "$(db_psql agent_sozluk -c \
    "SELECT count(*) FROM pg_db_role_setting s
     LEFT JOIN pg_database d ON d.oid = s.setdatabase
     CROSS JOIN LATERAL unnest(s.setconfig) AS c(setting)
     WHERE (s.setdatabase = 0 OR d.datname = current_database())
       AND (s.setrole = 0 OR s.setrole = (SELECT oid FROM pg_roles WHERE rolname = current_user))
       AND (c.setting LIKE 'lock_timeout=%' OR c.setting LIKE 'statement_timeout=%');" \
    </dev/null)" = 0 || migration_fail DB_TIMEOUT_SETTING_PRESENT

  assert_fk_targets
  assert_existing_index_targets
  assert_disk_budget full
}

# Mevcut tabloya eklenecek her indeks için: tablo `public`'te düz tablo, sütunlar
# var ve hepsi SABİT uzunluklu türde (`typlen > 0`: timestamptz, int, uuid, enum…),
# indeks adı henüz kullanılmıyor. Değişken uzunluklu sütunda (metin, jsonb) B-tree
# girdisi boyut sınırını aşıp eski imajın geçerli yazmasını reddedebilir; UNIQUE
# olmaması bunu önlemez (Astra, 23 Eylül).
assert_existing_index_targets() {
  local name table columns
  "$host_node" -e '
    const value = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
    for (const [name, index] of Object.entries(value.existingTableIndexes ?? {}))
      process.stdout.write([name, index.table, index.columns.join(",")].join("|") + "\n");
  ' "$migration_dir/expectation.json" >"$migration_dir/existing-index-targets" ||
    migration_fail EXPECTATION_UNREADABLE
  while IFS='|' read -r name table columns; do
    test -n "$name" || migration_fail EXISTING_INDEX_ENTRY_EMPTY
    test "$(db_psql agent_sozluk -v "name=$name" -v "table=$table" -v "columns=$columns" <<'SQL'
SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = :'table' AND c.relkind = 'r') = 1
   AND (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = :'name') = 0
   AND (SELECT count(*) FROM unnest(string_to_array(:'columns', ',')) AS wanted(col)
        WHERE NOT EXISTS (
          SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          JOIN pg_type t ON t.oid = a.atttypid
          WHERE n.nspname = 'public' AND c.relname = :'table' AND a.attname = wanted.col
            AND a.attnum > 0 AND NOT a.attisdropped AND t.typlen > 0)) = 0;
SQL
)" = t || migration_fail EXISTING_INDEX_TARGET_UNSUPPORTED
  done <"$migration_dir/existing-index-targets"
}

# FK hedefi mevcut tablonun `id`'si tek sütunlu uuid birincil anahtar olmalı.
# Liste satır sonuyla biter ve işlenen hedef sayısı listeye eşit olmalı: son
# satır sonu olmadan `while read` son hedefi atlıyordu (Astra, 23 Eylül).
assert_fk_targets() {
  local target checked=0 expected
  "$host_node" -e '
    const value = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
    const targets = new Set();
    for (const table of Object.values(value.tables))
      for (const fk of table.foreignKeys) targets.add(fk.referencedTable);
    for (const target of [...targets].sort()) process.stdout.write(target + "\n");
  ' "$migration_dir/expectation.json" >"$migration_dir/fk-targets" ||
    migration_fail EXPECTATION_UNREADABLE
  # `grep -c .` satır sonu olmayan son satırı da sayar (`wc -l` saymaz).
  expected="$(grep -c . "$migration_dir/fk-targets" || true)"
  while IFS= read -r target; do
    test -n "$target" || migration_fail FOREIGN_KEY_TARGET_EMPTY
    test "$(db_psql agent_sozluk -v "target=$target" <<'SQL'
SELECT count(*) FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
WHERE n.nspname = 'public' AND c.relname = :'target' AND con.contype = 'p'
  AND array_length(con.conkey, 1) = 1 AND a.attname = 'id' AND a.atttypid = 'uuid'::regtype;
SQL
)" = 1 || migration_fail FOREIGN_KEY_TARGET_UNSUPPORTED
    checked=$((checked + 1))
  done <"$migration_dir/fk-targets"
  test "$checked" = "$expected" || migration_fail FOREIGN_KEY_TARGET_COUNT
}

# Disk bütçesi: `full` (dump + restore kopyası) ya da `restore` (yalnız restore
# kopyası). Ön kontrolde, dump'tan önce ve restore'dan önce yeniden ölçülür:
# yeniden girişte önceki dump yerinde kalır ve alanı küçültür (Astra, 23 Eylül).
assert_disk_budget() {
  local stage="$1" db_bytes free_backup free_data backup_device data_device
  install -d -m 0700 "$backups_dir"
  db_bytes="$(db_psql agent_sozluk -c 'SELECT pg_database_size(current_database());' </dev/null)"
  [[ "$db_bytes" =~ ^[0-9]+$ ]]
  free_backup=$(($(df -Pk "$backups_dir" | awk 'NR == 2 {print $4}') * 1024))
  free_data=$(($("${compose[@]}" exec -T db sh -ec \
    "df -Pk /var/lib/postgresql/data | awk 'NR == 2 { print \$4 }'" </dev/null) * 1024))
  backup_device="$(df -P "$backups_dir" | awk 'NR == 2 {print $1}')"
  data_device="$(docker volume inspect --format '{{.Mountpoint}}' \
    "$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' \
      "$("${compose[@]}" ps -q db)")" | xargs -r sudo df -P | awk 'NR == 2 {print $1}')"
  # Cihazlardan biri okunamazsa "farklı dosya sistemi" sayılıp gevşek bütçeye
  # düşülmesin.
  test -n "$backup_device" && test -n "$data_device" || migration_fail DISK_DEVICE_UNKNOWN
  # Aynı dosya sisteminde bütçe birleşik (dump + restore kopyası + WAL/geçici alan).
  if test "$stage" = full && test "$backup_device" = "$data_device"; then
    ((free_backup >= 3 * db_bytes + 1073741824)) || migration_fail DISK_HEADROOM_COMBINED
  elif test "$stage" = full; then
    ((free_backup >= db_bytes + 1073741824)) || migration_fail DISK_HEADROOM_BACKUP
    ((free_data >= 2 * db_bytes + 1073741824)) || migration_fail DISK_HEADROOM_DATA
  else
    ((free_data >= 2 * db_bytes + 1073741824)) || migration_fail DISK_HEADROOM_RESTORE
  fi
  printf '%s\n' "$db_bytes" >"$migration_dir/db-bytes"
}

# --- 4. Drenaj ve dondurma ----------------------------------------------------

freeze_writes() {
  local others
  if test "$(systemctl show agent-sozluk-runtime.service -p ActiveState --value)" = active; then
    wait_for_no_active_work
    sudo systemctl stop agent-sozluk-runtime.service
  fi
  test "$(systemctl show agent-sozluk-runtime.service -p ActiveState --value)" = inactive
  # Yeni birim başlangıç öncesi kapıyı (`.migration-hold`) taşır; worker durmuşken
  # kurulur ki bu dağıtımın kendisi de kapının arkasında kalsın.
  install_runtime_unit
  : >"$migration_hold"
  cat /proc/sys/kernel/random/boot_id >"$migration_marker/boot-id"
  # Buradan sonra bir hata, aşama henüz `frozen` olmasa da siteyi geri açmalı.
  freeze_started=1
  frozen_deadline=$(($(date +%s) + max_downtime_seconds))
  printf '%s\n' "$frozen_deadline" >"$migration_marker/frozen-deadline"
  "${compose[@]}" stop caddy </dev/null
  "${compose[@]}" stop app </dev/null
  assert_frozen
  set_phase frozen
}

# Dondurma kanıtı; her yeniden girişte de tekrarlanır.
assert_frozen() {
  test -z "$("${compose[@]}" ps --status running -q caddy)" || migration_fail FREEZE_CADDY_RUNNING
  test -z "$("${compose[@]}" ps --status running -q app)" || migration_fail FREEZE_APP_RUNNING
  test "$(systemctl show agent-sozluk-runtime.service -p ActiveState --value)" = inactive ||
    migration_fail FREEZE_WORKER_RUNNING
  test -e "$migration_hold" || migration_fail FREEZE_HOLD_MISSING
  test "$(admin_psql agent_sozluk -c \
    "SELECT count(*) FROM pg_stat_activity
     WHERE datname = current_database() AND pid <> pg_backend_pid()
       AND (backend_type = 'client backend' OR backend_type IS NULL);" </dev/null)" = 0 ||
    migration_fail FREEZE_OTHER_SESSIONS
  test "$(admin_psql agent_sozluk -c 'SELECT count(*) FROM pg_prepared_xacts;' </dev/null)" = 0 ||
    migration_fail FREEZE_PREPARED_TRANSACTIONS
}

# Prod şeması değişmeden önceki bir hatada eski sürümü geri açar: app → iç
# sağlık → Caddy → dış sağlık. Worker kapalı ve `.migration-hold` yerinde kalır.
reopen_previous_release() {
  local app_container
  "${compose[@]}" start app </dev/null || return 1
  for _ in $(seq 1 60); do
    app_container="$("${compose[@]}" ps --status running -q app)"
    if test -n "$app_container" && test "$(
      docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
        "$app_container"
    )" = healthy; then
      break
    fi
    sleep 2
  done
  assert_internal_health || return 1
  "${compose[@]}" start caddy </dev/null || return 1
  wait_public_health || return 1
  printf 'RELEASE_MIGRATION_REOPENED previous release serving; worker stays stopped\n' >&2
}

# --- 5-6. Parmak izi ve yedek -------------------------------------------------

fingerprint_settings="SET TimeZone = 'UTC'; SET DateStyle = 'ISO, YMD';
SET IntervalStyle = 'postgres'; SET extra_float_digits = 1; SET bytea_output = 'hex';"

# Tablo içerikleri + sequence durumu ve tanımları, katalogdan. Satır içeriği
# hiçbir yere yazılmaz; yalnız sayılar ve toplamlar.
db_fingerprint() {
  local database="$1" output="$2"
  db_psql "$database" >"$output" <<SQL
$fingerprint_settings
SELECT count(*) = 0 AS supported FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('f', 'm') \gset
\if :supported
\else
\echo UNSUPPORTED_RELATION_KIND
\quit
\endif
SELECT format(
  'SELECT %L || count(*) || ''|'' || coalesce(sum((''x'' || substr(md5(t::text), 1, 15))::bit(60)::bigint), 0)
     || ''|'' || coalesce(sum((''x'' || substr(md5(t::text), 16, 15))::bit(60)::bigint), 0)
   FROM %I.%I AS t',
  'table:' || c.relname || '|', n.nspname, c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
ORDER BY c.relname \gexec
SELECT format('SELECT %L || last_value || ''|'' || is_called FROM %I.%I',
  'seq:' || c.relname || '|', n.nspname, c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'S'
ORDER BY c.relname \gexec
SELECT 'seqdef:' || sequencename || '|' || data_type || '|' || start_value || '|' || min_value
  || '|' || max_value || '|' || increment_by || '|' || cycle
FROM pg_sequences WHERE schemaname = 'public' ORDER BY sequencename;
SELECT 'owned:' || s.relname || '|' || d.deptype::text || '|' || t.relname || '|' || a.attname
FROM pg_depend d
JOIN pg_class s ON s.oid = d.objid AND s.relkind = 'S'
JOIN pg_class t ON t.oid = d.refobjid
JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
WHERE d.classid = 'pg_class'::regclass AND d.refclassid = 'pg_class'::regclass
  AND d.deptype IN ('a', 'i')
ORDER BY 1;
SELECT 'default:' || c.relname || '|' || a.attname || '|' || pg_get_expr(ad.adbin, ad.adrelid)
FROM pg_attrdef ad
JOIN pg_class c ON c.oid = ad.adrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
WHERE n.nspname = 'public'
ORDER BY 1;
SQL
  ! grep -qx UNSUPPORTED_RELATION_KIND "$output" || migration_fail UNSUPPORTED_RELATION_KIND
  test -s "$output"
}

# Sahipli, artan, çevrimsiz sequence'in sonraki değeri sahip sütunun
# maksimumundan büyük olmalı. `nextval` çağrılmaz.
sequence_safety() {
  local database="$1" output
  output="$(db_psql "$database" <<'SQL'
SELECT format(
  'SELECT %L || CASE WHEN %s AND (CASE WHEN s.is_called THEN s.last_value::numeric + %s ELSE s.last_value::numeric END)
     > coalesce((SELECT max(%I)::numeric FROM %I.%I), %s::numeric - 1) THEN ''ok'' ELSE ''bad'' END
   FROM %I.%I AS s',
  'seqsafe:' || s.relname || '|',
  -- `%s`'e boolean verilirse `t`/`f` basılır ve sütun adı sanılır (Sol, 23 Eylül).
  CASE WHEN q.increment_by > 0 AND NOT q.cycle THEN 'TRUE' ELSE 'FALSE' END, q.increment_by,
  a.attname, tn.nspname, t.relname, q.min_value, sn.nspname, s.relname)
FROM pg_depend d
JOIN pg_class s ON s.oid = d.objid AND s.relkind = 'S'
JOIN pg_namespace sn ON sn.oid = s.relnamespace
JOIN pg_sequences q ON q.schemaname = sn.nspname AND q.sequencename = s.relname
JOIN pg_class t ON t.oid = d.refobjid
JOIN pg_namespace tn ON tn.oid = t.relnamespace
JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
WHERE d.classid = 'pg_class'::regclass AND d.refclassid = 'pg_class'::regclass
  AND d.deptype IN ('a', 'i') AND sn.nspname = 'public'
ORDER BY s.relname \gexec
SQL
)"
  ! grep -q '|bad$' <<<"$output" || migration_fail SEQUENCE_NEXT_VALUE_UNSAFE
}

# Çıktı boş ya da pg_dump hatalıysa özet ÜRETİLMEZ: boş dökümün özeti iki
# tarafta da aynı çıkıp kanıtsız eşitlik sayılırdı (Sol, 23 Eylül).
schema_hash() {
  local database="$1" dump hash
  shift
  dump="$(mktemp "$migration_dir/schema.XXXXXX")"
  local deadline
  deadline_prefix
  "${deadline[@]}" "${compose[@]}" exec -T db pg_dump --schema-only --no-owner --no-privileges \
    -U agent_sozluk -d "$database" "$@" </dev/null >"$dump" || migration_fail SCHEMA_DUMP_FAILED
  grep -q 'CREATE TABLE' "$dump" || migration_fail SCHEMA_DUMP_EMPTY
  hash="$(schema_dump_filter <"$dump" | sha256sum | cut -d ' ' -f 1)"
  rm -f "$dump"
  [[ "$hash" =~ ^[0-9a-f]{64}$ ]] || migration_fail SCHEMA_HASH_INVALID
  printf '%s\n' "$hash"
}

# Döküm özetlenmeden önce: `\restrict` satırları (her dökümde rastgele) ve yalnız
# bu migration'ın mevcut tabloya eklediği indekslerin TOC girdisinin TAMAMI
# (`-- Name: <ad>; Type: INDEX` başlığı, `CREATE INDEX` satırı ve aradaki boş
# satırlar) düşülür. Girdi beklenen biçimde değilse (tek boş olmayan satır o adın
# `CREATE INDEX`'i değilse) düşülmez; özet uyuşmaz ve faz kapalı durur. Adlar -v
# ile geçer: `NR == FNR` kalıbı ilk dosya boşken bütün girdiyi "ad" sayıp
# çıktıyı boşaltır ve özet anlamsızlaşırdı.
schema_dump_filter() {
  local excluded="$migration_dir/existing-index-names"
  test -f "$excluded" || : >"$excluded"
  { grep -v -E '^\\(un)?restrict ' || test $? = 1; } |
    awk -v names="$(tr '\n' ' ' <"$excluded")" '
      BEGIN { n = split(names, list, " "); for (i = 1; i <= n; i++) skip[list[i]] = 1 }
      { line[NR] = $0 }
      END {
        for (i = 2; i < NR; i++) {
          if (line[i - 1] != "--" || line[i + 1] != "--") continue
          if (line[i] !~ /^-- Name: [^;]+; Type: INDEX; Schema: public; Owner: /) continue
          name = line[i]
          sub(/^-- Name: /, "", name)
          sub(/; Type: INDEX; .*$/, "", name)
          if (!(name in skip)) continue
          body = 0; ok = 0
          for (j = i + 2; j <= NR && line[j] != "--"; j++) {
            if (line[j] == "") continue
            body++
            split(line[j], word, " ")
            ok = word[1] == "CREATE" && word[2] == "INDEX" &&
              (word[3] == name || word[3] == "\"" name "\"") && line[j] ~ /;$/
          }
          if (body != 1 || !ok) continue
          for (k = i - 1; k < j; k++) drop[k] = 1
        }
        for (i = 1; i <= NR; i++) if (!(i in drop)) print line[i]
      }'
}

# Önceden var olan her tablonun ayrı şema özeti (migration sonrası birebir kalmalı).
table_schema_hashes() {
  local database="$1" output="$2" table hash tables
  tables="$migration_dir/tables-$database"
  db_psql "$database" -c \
    "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') ORDER BY 1;" </dev/null \
    >"$tables" || migration_fail TABLE_LIST_FAILED
  test -s "$tables" || migration_fail TABLE_LIST_EMPTY
  : >"$output"
  while IFS= read -r table; do
    hash="$(schema_hash "$database" -t "public.\"$table\"")" || migration_fail SCHEMA_DUMP_FAILED
    printf '%s|%s\n' "$table" "$hash" >>"$output"
  done <"$tables"
  test "$(wc -l <"$output")" = "$(wc -l <"$tables")" || migration_fail TABLE_SCHEMA_COUNT
}

prisma_history() {
  db_psql "$1" -c \
    "SELECT id || '|' || migration_name || '|' || checksum || '|' || coalesce(started_at::text, '-')
       || '|' || coalesce(finished_at::text, '-') || '|' || coalesce(rolled_back_at::text, '-')
       || '|' || applied_steps_count || '|' || md5(coalesce(logs, ''))
     FROM \"_prisma_migrations\" ORDER BY migration_name, id;" </dev/null
}

backup_and_fingerprint() {
  local stamp backup partial
  db_fingerprint agent_sozluk "$migration_dir/pre-fingerprint"
  sequence_safety agent_sozluk
  local pre_schema
  pre_schema="$(schema_hash agent_sozluk)"
  printf '%s\n' "$pre_schema" >"$migration_dir/pre-schema"
  table_schema_hashes agent_sozluk "$migration_dir/pre-table-schemas"
  prisma_history agent_sozluk >"$migration_dir/pre-prisma-history"

  assert_disk_budget full
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  backup="$backups_dir/agent-sozluk-$stamp-pre-${candidate_sha:0:12}.dump"
  partial="$backup.partial"
  test ! -e "$backup" && test ! -e "$partial"
  local deadline
  deadline_prefix
  (umask 077 && "${deadline[@]}" "${compose[@]}" exec -T db pg_dump -Fc --no-owner --no-privileges \
    -U agent_sozluk -d agent_sozluk </dev/null >"$partial") || migration_fail BACKUP_DUMP_FAILED
  test -s "$partial"
  deadline_prefix
  "${deadline[@]}" "${compose[@]}" exec -T db pg_restore --list <"$partial" >/dev/null ||
    migration_fail BACKUP_LIST_FAILED
  mv -T "$partial" "$backup"
  printf '%s\n' "$backup" >"$migration_dir/backup-path"
  sha256sum "$backup" | cut -d ' ' -f 1 >"$migration_dir/backup-sha256"
  stat -c %s "$backup" >"$migration_dir/backup-bytes"
  printf 'RELEASE_MIGRATION_BACKUP bytes=%s sha256=%s\n' \
    "$(cat "$migration_dir/backup-bytes")" "$(cat "$migration_dir/backup-sha256")"

  # Yedeğin şema kanıtı: arşivdeki şema betiği canlı şema dökümüyle birebir.
  # Geri yüklenmiş bir kopyanın yeniden dökümü bunun yerine geçmez: PostgreSQL
  # CHECK ve indeks ifadelerini geri yüklemede yazımca farklı (iç içe AND'ler
  # düzleşir, dizi dönüşümleri yeniden yazılır) ama anlamca aynı üretir. İlk
  # üretim koşusu tam bu yüzden RESTORE_SCHEMA_MISMATCH ile durdu (23 Eylül).
  local archive_schema
  archive_schema="$(archive_schema_hash "$backup")"
  test "$archive_schema" = "$(cat "$migration_dir/pre-schema")" ||
    migration_fail BACKUP_SCHEMA_MISMATCH
}

archive_schema_hash() {
  local archive="$1" script hash deadline
  script="$(mktemp "$migration_dir/archive-schema.XXXXXX")"
  deadline_prefix
  "${deadline[@]}" "${compose[@]}" exec -T db pg_restore --schema-only --no-owner --no-privileges \
    -f - <"$archive" >"$script" || migration_fail ARCHIVE_SCHEMA_FAILED
  grep -q 'CREATE TABLE' "$script" || migration_fail ARCHIVE_SCHEMA_EMPTY
  hash="$(schema_dump_filter <"$script" | sha256sum | cut -d ' ' -f 1)"
  rm -f "$script"
  [[ "$hash" =~ ^[0-9a-f]{64}$ ]] || migration_fail SCHEMA_HASH_INVALID
  printf '%s\n' "$hash"
}

# --- 7. İzole restore ---------------------------------------------------------

assert_scratch_name() {
  [[ "$scratch_database" =~ ^agent_sozluk_a5_[0-9]{8}_[0-9]{6}_[0-9a-f]{6}$ ]] || return 1
  case "$scratch_database" in agent_sozluk | postgres | template0 | template1) return 1 ;; esac
}

drop_scratch() {
  ((scratch_owned == 1)) || return 0
  assert_scratch_name || return 1
  # `dropdb --force` bağlı oturumları kendisi sonlandırır; uygulama rolüyle ön
  # sonlandırma başka rolün oturumunda yetki hatası verip düşürmeyi atlatıyordu.
  local deadline
  deadline_prefix
  "${deadline[@]}" "${compose[@]}" exec -T db dropdb -U postgres --force "$scratch_database" \
    </dev/null || return 1
  scratch_owned=0
}

restore_and_verify() {
  local collate ctype
  scratch_database="agent_sozluk_a5_$(date -u +%Y%m%d_%H%M%S)_${op_id:0:6}"
  assert_scratch_name || migration_fail SCRATCH_NAME_INVALID
  test "$(db_psql agent_sozluk -v "scratch=$scratch_database" <<'SQL'
SELECT count(*) FROM pg_database WHERE datname = :'scratch';
SQL
)" = 0 || migration_fail SCRATCH_ALREADY_EXISTS
  assert_disk_budget restore
  collate="$(db_psql agent_sozluk -c 'SELECT datcollate FROM pg_database WHERE datname = current_database();' </dev/null)"
  ctype="$(db_psql agent_sozluk -c 'SELECT datctype FROM pg_database WHERE datname = current_database();' </dev/null)"
  local deadline
  deadline_prefix
  # Yönetici rolüyle açılır, sahibi uygulama rolüdür: restore ve ALTER DATABASE
  # uygulama rolüyle yapılır.
  "${deadline[@]}" "${compose[@]}" exec -T db createdb -U postgres -O agent_sozluk -T template0 -E UTF8 \
    --lc-collate="$collate" --lc-ctype="$ctype" "$scratch_database" </dev/null ||
    migration_fail SCRATCH_CREATE_FAILED
  scratch_owned=1
  printf '%s\n' "$scratch_database" >"$migration_dir/scratch-database"
  local deadline
  deadline_prefix
  "${deadline[@]}" "${compose[@]}" exec -T db pg_restore --exit-on-error --no-owner --no-privileges \
    -U agent_sozluk -d "$scratch_database" <"$(cat "$migration_dir/backup-path")" ||
    migration_fail RESTORE_FAILED

  db_fingerprint "$scratch_database" "$migration_dir/restore-fingerprint"
  cmp -s "$migration_dir/pre-fingerprint" "$migration_dir/restore-fingerprint" ||
    migration_fail RESTORE_FINGERPRINT_MISMATCH
  sequence_safety "$scratch_database"
  # Şema: arşiv canlıyla birebir (yukarıda) ve restore --exit-on-error ile
  # bitti. Scratch'in kendi tablo şemaları migration provasının kıyas tabanıdır.
  table_schema_hashes "$scratch_database" "$migration_dir/scratch-pre-table-schemas"
  set_phase backup-verified
}

# --- 8-9. Migration yürütme ---------------------------------------------------

set_database_timeouts() {
  if test "$1" = agent_sozluk; then production_timeouts_set=1; fi
  db_psql agent_sozluk -v "target=$1" <<'SQL' >/dev/null || migration_fail DB_TIMEOUT_SET_FAILED
SELECT format('ALTER DATABASE %I SET lock_timeout = %L', :'target', '5s') \gexec
SELECT format('ALTER DATABASE %I SET statement_timeout = %L', :'target', '300s') \gexec
SQL
  test "$(db_psql agent_sozluk -v "target=$1" <<'SQL'
SELECT count(*) FROM pg_db_role_setting s
JOIN pg_database d ON d.oid = s.setdatabase
CROSS JOIN LATERAL unnest(s.setconfig) AS c(setting)
WHERE d.datname = :'target' AND s.setrole = 0
  AND c.setting IN ('lock_timeout=5s', 'statement_timeout=300s');
SQL
)" = 2 || migration_fail DB_TIMEOUT_SET_FAILED
}

# Başarısızlıkta `exit` etmez, 1 döner: EXIT tuzağından da güvenle çağrılır.
reset_database_timeouts() {
  db_psql agent_sozluk -v "target=$1" <<'SQL' >/dev/null || return 1
SELECT format('ALTER DATABASE %I RESET lock_timeout', :'target') \gexec
SELECT format('ALTER DATABASE %I RESET statement_timeout', :'target') \gexec
SQL
  test "$(db_psql agent_sozluk -v "target=$1" <<'SQL'
SELECT count(*) FROM pg_db_role_setting s
JOIN pg_database d ON d.oid = s.setdatabase
CROSS JOIN LATERAL unnest(s.setconfig) AS c(setting)
WHERE d.datname = :'target' AND s.setrole = 0
  AND (c.setting LIKE 'lock_timeout=%' OR c.setting LIKE 'statement_timeout=%');
SQL
)" = 0 || return 1
  if test "$1" = agent_sozluk; then production_timeouts_set=0; fi
}

# Hedef konteyner içinde seçilir ve gerçek bağlantıyla doğrulanır
# (scripts/run-migration.mjs). Bittikten sonra konteyner ve backend'in gerçekten
# gittiği kanıtlanmadan sonuç sınıflandırılmaz.
#
# `||` bağlamında ÇAĞRILMAZ; sonuç `migration_status` değişkenindedir.
run_migration() {
  local target="$1" image_id status=0
  migration_status=1
  image_id="$(cat "$state_dir/candidate-image-id")" || migration_fail CANDIDATE_IMAGE_ID_MISSING
  test "$(docker image inspect --format '{{.Id}}' "$candidate_image")" = "$image_id" ||
    migration_fail CANDIDATE_IMAGE_TAG_MOVED
  set_database_timeouts "$target"
  # Aşama ancak bütün ön koşullar geçtikten sonra, konteyner başlamadan hemen
  # önce `migrating` olur; öncesindeki bir hata prod şemasını değiştirmemiştir ve
  # tuzak siteyi geri açar (Sol, 23 Eylül).
  if test "$target" = agent_sozluk; then set_phase migrating; fi
  local limit=900 remaining
  remaining="$(downtime_remaining)" || migration_fail DOWNTIME_BUDGET_EXCEEDED
  if ((remaining > 0 && remaining < limit)); then limit="$remaining"; fi
  env -u DATABASE_URL -u COMPOSE_PROJECT_NAME -u COMPOSE_FILE -u COMPOSE_PROFILES \
    APP_IMAGE="$candidate_image" timeout "$limit" "${compose[@]}" run --rm --no-deps --pull never \
    --name "a5-$op_id-migrate" -e "A5_TARGET_DATABASE=$target" -e "A5_APPLICATION_NAME=a5-$op_id" \
    --entrypoint /bin/sh app -c \
    './node_modules/.bin/tsx scripts/validate-environment.ts && exec node scripts/run-migration.mjs' \
    </dev/null || status=$?
  for _ in $(seq 1 30); do
    test -z "$(docker ps -aq --filter "name=^a5-$op_id-migrate$")" && break
    docker rm -f "a5-$op_id-migrate" >/dev/null 2>&1 || true
    sleep 2
  done
  test -z "$(docker ps -aq --filter "name=^a5-$op_id-migrate$")" ||
    migration_fail MIGRATION_CONTAINER_STILL_PRESENT
  test "$(admin_psql postgres -v "target=$target" <<'SQL'
SELECT count(*) FROM pg_stat_activity
WHERE datname = :'target' AND pid <> pg_backend_pid()
  AND (backend_type = 'client backend' OR backend_type IS NULL);
SQL
)" = 0 || migration_fail MIGRATION_BACKEND_STILL_PRESENT
  reset_database_timeouts "$target" || migration_fail DB_TIMEOUT_RESET_FAILED
  migration_status="$status"
}

# Beklenti JSON'undan yeni tablo/tür adları, virgülle. Boş ya da okunamazsa durur:
# argüman içinde üretilip boş kalsaydı scratch ve prod tanımları "boş = boş" diye
# eşit sayılırdı.
expectation_keys() {
  local keys
  keys="$("$host_node" -e '
    const value = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
    process.stdout.write(Object.keys(value[process.argv[2]] ?? {}).join(","));
  ' "$migration_dir/expectation.json" "$1")" || migration_fail EXPECTATION_UNREADABLE
  printf '%s\n' "$keys"
}

new_object_definitions() {
  local tables existing_indexes
  tables="$(expectation_keys tables)"
  existing_indexes="$(expectation_keys existingTableIndexes)"
  db_psql "$1" -v "tables=$tables" -v "existing_indexes=$existing_indexes" <<'SQL'
SELECT 'column:' || c.relname || '|' || a.attname || '|' || format_type(a.atttypid, a.atttypmod)
  || '|' || a.attnotnull || '|' || coalesce(pg_get_expr(ad.adbin, ad.adrelid), '-')
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
WHERE n.nspname = 'public' AND c.relname = ANY (string_to_array(:'tables', ','))
  AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY 1;
SELECT 'constraint:' || c.relname || '|' || con.conname || '|' || pg_get_constraintdef(con.oid)
FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = ANY (string_to_array(:'tables', ','))
ORDER BY 1;
SELECT 'index:' || pg_get_indexdef(i.indexrelid)
FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid
JOIN pg_class ic ON ic.oid = i.indexrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND (c.relname = ANY (string_to_array(:'tables', ','))
       OR ic.relname = ANY (string_to_array(:'existing_indexes', ',')))
ORDER BY 1;
SELECT 'enum:' || t.typname || '|' || string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder)
FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
GROUP BY t.typname ORDER BY 1;
SQL
}

# Denetçinin beklentisi (adlar, enum sırası, FK aksiyonları, indeks sütunları)
# katalogla birebir; tam tanımlar ise scratch ile prod arasında birebir.
catalog_expectation() {
  local tables types existing_indexes
  tables="$(expectation_keys tables)"
  types="$(expectation_keys types)"
  existing_indexes="$(expectation_keys existingTableIndexes)"
  db_psql "$1" -v "tables=$tables" -v "types=$types" -v "existing_indexes=$existing_indexes" <<'SQL'
SELECT json_build_object(
  'types', coalesce((SELECT json_object_agg(t.typname, (
      SELECT json_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid = t.oid))
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = ANY (string_to_array(:'types', ','))), '{}'::json),
  'tables', coalesce((SELECT json_object_agg(c.relname, json_build_object(
      'columns', (SELECT json_agg(a.attname ORDER BY a.attname) FROM pg_attribute a
                  WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped),
      'primaryKey', coalesce((SELECT json_agg(a.attname ORDER BY a.attname) FROM pg_constraint con
                  JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
                  WHERE con.conrelid = c.oid AND con.contype = 'p'), '[]'::json),
      'checkConstraints', (SELECT count(*) FROM pg_constraint con WHERE con.conrelid = c.oid AND con.contype = 'c'),
      'uniqueConstraints', (SELECT count(*) FROM pg_constraint con WHERE con.conrelid = c.oid AND con.contype = 'u'),
      'foreignKeys', coalesce((SELECT json_agg(json_build_object(
          'column', a.attname, 'referencedTable', rc.relname, 'referencedColumn', ra.attname,
          'onDelete', CASE con.confdeltype WHEN 'n' THEN 'SET NULL' WHEN 'c' THEN 'CASCADE' ELSE con.confdeltype::text END,
          'onUpdate', CASE con.confupdtype WHEN 'c' THEN 'CASCADE' ELSE con.confupdtype::text END)
          ORDER BY a.attname)
        FROM pg_constraint con
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
        JOIN pg_class rc ON rc.oid = con.confrelid
        JOIN pg_attribute ra ON ra.attrelid = con.confrelid AND ra.attnum = con.confkey[1]
        WHERE con.conrelid = c.oid AND con.contype = 'f'), '[]'::json)))
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = ANY (string_to_array(:'tables', ','))), '{}'::json),
  'indexes', coalesce((SELECT json_object_agg(ic.relname, json_build_object(
      'table', c.relname, 'unique', i.indisunique,
      'columns', (SELECT json_agg(a.attname ORDER BY k.ord) FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
                  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum)))
    FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = ANY (string_to_array(:'tables', ','))
      AND NOT EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conindid = i.indexrelid)), '{}'::json),
  'existingTableIndexes', coalesce((SELECT json_object_agg(ic.relname, json_build_object(
      'table', c.relname, 'unique', i.indisunique,
      'columns', (SELECT json_agg(a.attname ORDER BY k.ord) FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
                  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum)))
    FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = ic.relnamespace
    WHERE n.nspname = 'public' AND ic.relname = ANY (string_to_array(:'existing_indexes', ','))),
    '{}'::json)
);
SQL
}

assert_catalog_expectation() {
  catalog_expectation "$1" >"$migration_dir/catalog-$2.json"
  "$host_node" -e '
    const fs = require("node:fs");
    const canonical = (value) =>
      Array.isArray(value) ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
        : value;
    const expected = JSON.stringify(canonical(JSON.parse(fs.readFileSync(process.argv[1], "utf8"))));
    const actual = JSON.stringify(canonical(JSON.parse(fs.readFileSync(process.argv[2], "utf8"))));
    process.exit(expected === actual ? 0 : 1);
  ' "$migration_dir/expectation.json" "$migration_dir/catalog-$2.json" ||
    migration_fail CATALOG_EXPECTATION_MISMATCH
}

# Migration sonrası: `_prisma_migrations` HARİÇ önceden var olan her tablo
# içerik ve şema olarak birebir; migration geçmişinde eski satırlar birebir,
# yeni satırlar tam olarak onaylı adlar; yeni tablolar boş.
# `schema_baseline`: aynı veritabanının migration öncesi tablo şema özetleri
# (prod için prod'unki, scratch için restore sonrası scratch'inki).
post_verify() {
  local database="$1" label="$2" schema_baseline="$3" name
  db_fingerprint "$database" "$migration_dir/post-$label-fingerprint"
  grep '^table:' "$migration_dir/pre-fingerprint" |
    grep -v '^table:_prisma_migrations|' >"$migration_dir/pre-tables"
  awk -F '|' 'NR == FNR {want[$1] = 1; next} ($1 in want)' \
    "$migration_dir/pre-tables" "$migration_dir/post-$label-fingerprint" \
    >"$migration_dir/post-$label-tables"
  cmp -s "$migration_dir/pre-tables" "$migration_dir/post-$label-tables" ||
    migration_fail POST_TABLE_CONTENT_CHANGED
  cmp -s <(grep -E '^(seq|seqdef|owned):' "$migration_dir/pre-fingerprint") \
    <(grep -E '^(seq|seqdef|owned):' "$migration_dir/post-$label-fingerprint") ||
    migration_fail POST_SEQUENCE_CHANGED
  table_schema_hashes "$database" "$migration_dir/post-$label-table-schemas"
  test -s "$schema_baseline" || migration_fail SCHEMA_BASELINE_MISSING
  awk -F '|' 'NR == FNR {want[$1] = 1; next} ($1 in want)' \
    "$schema_baseline" "$migration_dir/post-$label-table-schemas" \
    >"$migration_dir/post-$label-preexisting-schemas"
  cmp -s "$schema_baseline" "$migration_dir/post-$label-preexisting-schemas" ||
    migration_fail POST_TABLE_SCHEMA_CHANGED

  prisma_history "$database" >"$migration_dir/post-$label-prisma-history"
  awk -F '|' 'NR == FNR {want[$1] = 1; next} ($1 in want)' \
    "$migration_dir/pre-prisma-history" "$migration_dir/post-$label-prisma-history" \
    >"$migration_dir/post-$label-prisma-old"
  cmp -s "$migration_dir/pre-prisma-history" "$migration_dir/post-$label-prisma-old" ||
    migration_fail POST_PRISMA_HISTORY_CHANGED
  db_psql "$database" -F ' ' -c \
    "SELECT migration_name, checksum FROM \"_prisma_migrations\"
     WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL AND applied_steps_count > 0
       AND migration_name > '$(tail -n 1 "$migration_dir/applied-before")'
     ORDER BY migration_name;" </dev/null >"$migration_dir/post-$label-new-rows"
  test "$(cut -d ' ' -f 1 "$migration_dir/post-$label-new-rows")" = "$(cat "$migration_dir/pending")" ||
    migration_fail POST_NEW_HISTORY_MISMATCH
  while read -r name checksum; do
    test "$(sha256sum <"$(migration_file "$name")" | cut -d ' ' -f 1)" = "$checksum" ||
      migration_fail POST_NEW_CHECKSUM_MISMATCH
  done <"$migration_dir/post-$label-new-rows"
  test "$(db_psql "$database" -c \
    "SELECT count(*) FROM \"_prisma_migrations\" WHERE finished_at IS NULL AND rolled_back_at IS NULL;" \
    </dev/null)" = 0 || migration_fail POST_FAILED_HISTORY_ROW
  # Önceden geri alınmış (rolled_back_at dolu) eski kayıtlar tarihçe eşitliğinde
  # korunur; yalnız çözülmemiş başarısız kayıt reddedilir (Astra, 23 Eylül).

  # Liste önce dosyaya, açık kontrolle: `done < <(…)` içindeki hata yutulur ve
  # döngü hiç dönmeden "boş" kontrolü atlanırdı.
  "$host_node" -e '
    const value = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
    const names = Object.keys(value.tables);
    if (names.length > 0) process.stdout.write(names.join("\n") + "\n");
  ' "$migration_dir/expectation.json" >"$migration_dir/new-tables" ||
    migration_fail EXPECTATION_UNREADABLE
  # Boş liste gerçekten boş dosyadır (tek satır sonu "boş değil" sayılmaz).
  test -s "$migration_dir/new-tables" || test -s "$migration_dir/existing-index-names" ||
    migration_fail EXPECTATION_WITHOUT_OBJECTS
  while IFS= read -r name; do
    test "$(grep -c "^table:$name|0|0|0$" "$migration_dir/post-$label-fingerprint")" = 1 ||
      migration_fail POST_NEW_TABLE_NOT_EMPTY
  done <"$migration_dir/new-tables"
  assert_catalog_expectation "$database" "$label"
  new_object_definitions "$database" >"$migration_dir/definitions-$label"
}

# --- 8. Prova -----------------------------------------------------------------

# Önceki imaj (dondurmadan önce çalışan app'in imajı) migration uygulanmış
# scratch'e karşı migration'sız açılır; iç sağlık + release smoke geçmeli.
rehearse_previous_image() {
  local previous_id previous_tag container status
  previous_id="$(cat "$state_dir/previous-image-id")"
  previous_tag="agent-sozluk:a5-previous-$op_id"
  docker tag "$previous_id" "$previous_tag"
  container="a5-$op_id-previous"
  env -u DATABASE_URL -u COMPOSE_PROJECT_NAME -u COMPOSE_FILE -u COMPOSE_PROFILES \
    APP_IMAGE="$previous_tag" "${compose[@]}" run -d --no-deps --pull never \
    --name "$container" -e "A5_TARGET_DATABASE=$scratch_database" \
    --entrypoint /bin/sh app -c \
    'export DATABASE_URL="$(node -e "const u = new URL(process.env.DATABASE_URL); u.pathname = \"/\" + process.env.A5_TARGET_DATABASE; process.stdout.write(u.href)")" && exec node server.js' \
    </dev/null >/dev/null
  status=1
  local deadline
  for _ in $(seq 1 60); do
    # Her deneme kalan kesinti süresiyle sınırlı; süre dolarsa durulur.
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
    "${deadline[@]}" docker exec "$container" ./node_modules/.bin/tsx scripts/release-smoke.ts \
      --base-url http://127.0.0.1:3000 </dev/null || status=1
  fi
  docker rm -f "$container" >/dev/null 2>&1 || true
  docker image rm "$previous_tag" >/dev/null
  ((status == 0)) || migration_fail PREVIOUS_IMAGE_REHEARSAL_FAILED
}

rehearse_on_scratch() {
  prisma_history agent_sozluk >"$migration_dir/prod-history-before-rehearsal"
  run_migration "$scratch_database"
  ((migration_status == 0)) || migration_fail SCRATCH_MIGRATION_FAILED
  post_verify "$scratch_database" scratch "$migration_dir/scratch-pre-table-schemas"
  rehearse_previous_image
  # Prova üretime dokunmadı: prod geçmişi aynı, yeni tablolar prod'da yok.
  cmp -s "$migration_dir/prod-history-before-rehearsal" <(prisma_history agent_sozluk) ||
    migration_fail REHEARSAL_TOUCHED_PRODUCTION
  drop_scratch || migration_fail SCRATCH_DROP_FAILED
  set_phase rehearsed
}

# --- 9-10. Üretim ---------------------------------------------------------------

migrate_production() {
  run_migration agent_sozluk
  if ((migration_status != 0)); then
    prisma_history agent_sozluk >"$migration_dir/ambiguous-prisma-history" || true
    migration_fail MIGRATION_STATE_AMBIGUOUS 98
  fi
  set_phase migrated
}

verify_production_after_migration() {
  post_verify agent_sozluk production "$migration_dir/pre-table-schemas"
  cmp -s "$migration_dir/definitions-scratch" "$migration_dir/definitions-production" ||
    migration_fail DEFINITIONS_DIFFER_FROM_REHEARSAL
  set_phase post-verified
  # Bu noktadan sonra yeni app ve maintenance timer'ı yazabilir; dondurma
  # karşılaştırmaları bir daha koşmaz (Astra, 23 Eylül).
  set_phase writers-may-run
  frozen_deadline=0
}

# --- Giriş ve hata tuzağı -----------------------------------------------------

migration_exit_trap() {
  local status=$?
  trap - EXIT
  set +e
  if ((status != 0)); then
    # Kurtarma kendi 5 dakikalık bütçesiyle koşar; süre kontrolü burada exit etmez.
    recovering=1
    if ((frozen_deadline != 0)); then frozen_deadline=$(($(date +%s) + 300)); fi
    docker rm -f "a5-$op_id-previous" >/dev/null 2>&1 || true
    docker image rm "agent-sozluk:a5-previous-$op_id" >/dev/null 2>&1 || true
    if ((production_timeouts_set == 1)); then
      reset_database_timeouts agent_sozluk ||
        printf 'RELEASE_WARN database timeouts left on agent_sozluk; see runbook\n' >&2
    fi
    if test -n "$scratch_database" && ((scratch_owned == 1)); then
      drop_scratch || printf 'RELEASE_WARN scratch database left: %s\n' "$scratch_database" >&2
    fi
    case "$(current_phase)" in
      image-verified | frozen | backup-verified | rehearsed)
        # Prod şeması değişmedi: dondurma başladıysa eski sürüm geri açılır ve
        # aşama `image-verified`'e geri alınır; aynı SHA/listeyle yeniden koşu
        # dondurmayı baştan kurar (Sol, 23 Eylül).
        if ((freeze_started == 1)) || test "$(current_phase)" != image-verified; then
          if reopen_previous_release; then
            printf 'image-verified\n' >"$migration_marker/phase.next" &&
              mv -Tf "$migration_marker/phase.next" "$migration_marker/phase" &&
              printf 'RELEASE_MIGRATION_PHASE image-verified (rewound after reopen)\n' >&2
          else
            printf 'RELEASE_WARN previous release could not be reopened\n' >&2
          fi
        fi
        ;;
      migrating | migrated | post-verified)
        printf 'RELEASE_MIGRATION_MANUAL phase=%s site stays down; see runbook\n' \
          "$(current_phase)" >&2
        ;;
    esac
  fi
  exit "$status"
}

migration_phase() {
  local recorded_boot
  if test -d "$migration_marker"; then
    test "$(cat "$migration_marker/identity")" = "$(migration_identity)" ||
      migration_fail MIGRATION_OPERATION_INCOMPLETE
    if test -f "$migration_marker/boot-id" &&
       phase_reached frozen && ! phase_reached cutover-done; then
      recorded_boot="$(cat "$migration_marker/boot-id")"
      test "$recorded_boot" = "$(cat /proc/sys/kernel/random/boot_id)" ||
        migration_fail MIGRATION_OPERATION_REBOOTED
    fi
  fi
  if test -f "$migration_marker/frozen-deadline" && phase_reached frozen &&
     ! phase_reached writers-may-run; then
    frozen_deadline="$(cat "$migration_marker/frozen-deadline")"
    [[ "$frozen_deadline" =~ ^[0-9]+$ ]] || migration_fail DOWNTIME_DEADLINE_INVALID
    freeze_started=1
  fi
  trap migration_exit_trap EXIT
  case "$(current_phase)" in
    none) plan_migrations ;&
    planned) verify_migration_image ;&
    image-verified)
      preflight_migration
      freeze_writes
      ;&
    frozen | backup-verified)
      # Scratch yalnız aynı koşuda sahiplenilebilir; yeniden girişte yedek ve
      # restore baştan yapılır (dondurma sürüyorsa).
      assert_frozen
      backup_and_fingerprint
      restore_and_verify
      rehearse_on_scratch
      ;&
    rehearsed)
      assert_frozen
      migrate_production
      ;&
    migrated | post-verified) verify_production_after_migration ;;
    migrating) migration_fail MIGRATION_STATE_AMBIGUOUS 98 ;;
    writers-may-run | traffic-open | worker-allowed | cutover-done) : ;;
    *) migration_fail MIGRATION_PHASE_UNKNOWN ;;
  esac
  trap - EXIT
}
