"""Yerel sentetik dump üzerinde gerçek CLI provası; üretim ve mevcut DB'ler hedeflenmez.

python3 tests/rehearsal/great-reset-local.py <synthetic.dump> <sha256> <yeni-cikti-dizini>
Dump yalnız sentetik olmalıdır. SHA önceki yerel restore makbuzundan alınır.
"""
import datetime
import hashlib
import json
import os
import pathlib
import re
import select
import socket
import subprocess
import sys
import time
import traceback


def require(condition, code):
    if not condition:
        raise RuntimeError(code)


root = pathlib.Path(__file__).resolve().parents[2]
dump = pathlib.Path(sys.argv[1]).resolve()
expected_sha = sys.argv[2]
output = pathlib.Path(sys.argv[3]).resolve()
require(socket.gethostname() == 'MacBook-Pro-26.local', 'LOCAL_HOST_REQUIRED')
require(re.fullmatch('[a-f0-9]{64}', expected_sha), 'INVALID_DUMP_SHA')
require(hashlib.sha256(dump.read_bytes()).hexdigest() == expected_sha, 'DUMP_SHA_MISMATCH')
output.mkdir(exist_ok=False)
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d%H%M%S')
name = f'agent_sozluk_reset_rehearsal_{stamp}_execution_test'
restore_name = f'agent_sozluk_reset_rehearsal_{stamp}_restored_test'
env = {k: v for k, v in os.environ.items() if not k.startswith('PG') and k not in (
    'DATABASE_URL', 'TEST_DATABASE_URL', 'AGENT_GREAT_RESET_DATABASE_URL')}
env['PGOPTIONS'] = '-c timezone=UTC -c extra_float_digits=3'
env['AGENT_GREAT_RESET_DATABASE_URL'] = f'postgresql://gokhannihalgul@127.0.0.1:5432/{name}'


cases = []
PSQL_TIMEOUT_SECONDS = 30
PSQL_SNAPSHOT_SECONDS = 20
psql_timings = []
timeout_diagnosis = None


def query_class(sql):
    """Ham SQL/payload sızdırmadan sorguyu sınıflandırır; makbuza yalnız sınıf yazılır."""
    text = ' '.join(sql.split()).lower()
    if 'string_agg' in text and 'sha256' in text:
        return 'FINGERPRINT'
    if 'generate_series' in text and 'insert into outbox_events' in text:
        return 'LOAD_INSERT'
    if 'pg_database' in text:
        return 'CATALOG'
    if 'pg_control_system' in text or 'current_user' in text:
        return 'IDENTITY'
    if 'pg_tables' in text or 'pg_sequences' in text or 'pg_constraint' in text:
        return 'SCHEMA'
    if 'outbox_reset_archive' in text and text.startswith('select'):
        return 'ARCHIVE_READ'
    if text.startswith('select count(*)'):
        return 'COUNT'
    if 'create trigger' in text or 'create function' in text or 'drop trigger' in text \
            or 'drop function' in text or 'alter table' in text or 'comment on database' in text:
        return 'FIXTURE_DDL'
    if text.startswith(('update ', 'delete ', 'truncate', 'insert ')):
        return 'FIXTURE_MUTATION'
    if text.startswith('select'):
        return 'READ'
    return 'OTHER'


def call_site():
    frames = [frame for frame in traceback.extract_stack() if frame.filename == __file__]
    return {'stepLine': frames[0].lineno if frames else None,
            'callerLine': frames[-3].lineno if len(frames) >= 3 else None}


def activity_start(db):
    """Güvenli bekleme/kilit görüntüsünü ASENKRON başlatır; sorgu metni okunmaz.

    Teşhis, ölçülen sorgunun bütçesini uzatmamalı: bu yüzden beklenmeden başlatılır.
    """
    sql = """SELECT coalesce(json_agg(json_build_object('state',state,'waitType',wait_event_type,
      'wait',wait_event,'querySeconds',round(extract(epoch FROM(clock_timestamp()-query_start))::numeric,1),
      'txSeconds',round(extract(epoch FROM(clock_timestamp()-xact_start))::numeric,1),
      'blockedBy',pg_blocking_pids(pid),'backendType',backend_type)),'[]'::json)
      FROM pg_stat_activity WHERE datname=$SNAP$""" + db + """$SNAP$;"""
    try:
        # SQL argümanla verilir: kapatılmış bir stdin'i communicate() flush etmeye
        # çalışıp ValueError atıyor ve teşhis tam gerektiği anda kayboluyordu.
        return subprocess.Popen(['psql', '-X', '-h', '127.0.0.1', '-p', '5432', '-d', 'postgres',
                                 '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql],
                                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                stderr=subprocess.DEVNULL, text=True, env=env)
    except OSError:
        return None


def activity_read(process, seconds):
    if process is None:
        return None
    try:
        stdout, _ = process.communicate(timeout=max(seconds, 0.1))
        return json.loads(stdout.strip()) if process.returncode == 0 else None
    except (subprocess.SubprocessError, ValueError):
        try:
            process.kill()
        except OSError:
            pass
        return None


def psql(db, sql):
    """Bütçe aşılırsa, süreci öldürmeden önce hangi adımın neyi beklediği kaydedilir."""
    global timeout_diagnosis
    started = time.monotonic()
    site = call_site()
    process = subprocess.Popen(['psql', '-X', '-h', '127.0.0.1', '-p', '5432', '-d', db,
                                '-At', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate', '-f', '-'],
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, env=env)
    snapshot = None
    deadline = started + PSQL_TIMEOUT_SECONDS
    try:
        stdout, stderr = process.communicate(sql, timeout=PSQL_SNAPSHOT_SECONDS)
    except subprocess.TimeoutExpired:
        # Sorgu hâlâ canlıyken bak; öldürdükten sonra pg_stat_activity'de iz kalmaz.
        # Teşhis beklenmeden başlatılır: 30 sn mutlak bütçeyi uzatmamalı.
        watcher = activity_start(db)
        try:
            stdout, stderr = process.communicate(timeout=max(deadline - time.monotonic(), 0.1))
            snapshot = activity_read(watcher, deadline - time.monotonic())
        except subprocess.TimeoutExpired:
            process.kill()
            process.communicate()
            snapshot = activity_read(watcher, 5)
            if timeout_diagnosis is None:
                timeout_diagnosis = {'queryClass': query_class(sql), **site,
                                     'afterCase': len(cases), 'nextCase': len(cases) + 1,
                                     'lastCasePassed': cases[-1] if cases else None,
                                     'budgetSeconds': PSQL_TIMEOUT_SECONDS,
                                     'snapshotAtSeconds': PSQL_SNAPSHOT_SECONDS, 'activity': snapshot}
            raise
    seconds = round(time.monotonic() - started, 3)
    psql_timings.append({'queryClass': query_class(sql), **site, 'afterCase': len(cases),
                         'seconds': seconds, **({'activity': snapshot} if snapshot else {})})
    sqlstate = re.search(r'ERROR:\s+([0-9A-Z]{5})', stderr)
    require(process.returncode == 0, 'FIXTURE_SQL_FAILED:' + (sqlstate.group(1) if sqlstate else 'UNKNOWN'))
    return stdout.strip()


def catalog():
    return psql('postgres', 'SELECT datname FROM pg_database ORDER BY datname;').splitlines()


require(psql('postgres', 'SELECT system_identifier::text FROM pg_control_system();') ==
        '7663213515019154520', 'LOCAL_CLUSTER_MISMATCH')
require(psql('postgres', 'SELECT current_user;') == 'gokhannihalgul', 'LOCAL_OWNER_MISMATCH')
before_catalog = catalog()
require(name not in before_catalog and restore_name not in before_catalog, 'SCRATCH_ALREADY_EXISTS')


def fingerprint(db):
    result = {}
    tables = psql(db, "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;")
    for table in tables.splitlines():
        require(re.fullmatch('[a-z_]+', table), 'UNEXPECTED_TABLE')
        result[table] = json.loads(psql(db, f'''SELECT json_build_object('rows',count(*),
          'sha256',encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,
          E'\\n' ORDER BY to_jsonb(t)::text COLLATE "C"),''),'UTF8')),'hex')) FROM "{table}" t;'''))
    return result


cli = ['node', 'node_modules/tsx/dist/cli.mjs', 'scripts/great-reset-local.ts']


def invoke(args=(), error=None):
    result = subprocess.run(cli + list(args), cwd=root, env=env,
                            text=True, capture_output=True, timeout=90)
    if error:
        require(result.returncode != 0 and result.stderr.strip() == error,
                f'UNEXPECTED_CLI_ERROR:{result.stderr.strip()[:100]}')
        return None
    require(result.returncode == 0, f'CLI_FAILED:{result.stderr.strip()[:100]}')
    return json.loads(result.stdout)


def preview(archive=False):
    return invoke(["--archive-outbox"] if archive else [])


def execute(plan, error=None, archive=False):
    args = ["--execute", "--database", name, "--plan-sha256", plan["planSha256"]]
    return invoke(args + (["--archive-outbox"] if archive else []), error)


def mark(label):
    cases.append(label)
    print(f'PASS {label}', flush=True)


def blocked(label, mutation, undo, expected):
    psql(name, mutation)
    before = fingerprint(name)
    plan = preview()
    require(expected in plan['blockedBy'], f'BLOCKER_MISSING:{expected}')
    execute(plan, 'GREAT_RESET_PRECONDITIONS_FAILED')
    require(before == fingerprint(name), 'BLOCKED_EXECUTION_CHANGED_DATA')
    psql(name, undo)
    mark(label)



def migrate(db):
    require(db in [name, restore_name], 'MIGRATION_TARGET_NOT_SCRATCH')
    migration_env = {**env, 'DATABASE_URL': f'postgresql://gokhannihalgul@127.0.0.1:5432/{db}'}
    with (output / f'{db}-migrate.log').open('w') as log:
        result = subprocess.run(['node', 'node_modules/prisma/build/index.js', 'migrate', 'deploy'],
                                cwd=root, env=migration_env, stdout=log, stderr=subprocess.STDOUT, timeout=90)
    require(result.returncode == 0, 'SCRATCH_MIGRATION_FAILED')


def sql_refused(sql, expected='55000'):
    before = fingerprint(name)
    result = subprocess.run(['psql', '-X', '-h', '127.0.0.1', '-p', '5432', '-d', name,
                             '-At', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate', '-f', '-'],
                            input=sql, env=env, text=True, capture_output=True, timeout=30)
    sqlstate = re.search(r'ERROR:\s+([0-9A-Z]{5})', result.stderr)
    require(result.returncode != 0 and sqlstate and sqlstate.group(1) == expected,
            'EXPECTED_ARCHIVE_SQLSTATE_MISSING')
    require(before == fingerprint(name), 'REFUSED_ARCHIVE_MUTATION_CHANGED_DATA')


def candidates():
    result = subprocess.run(['node', 'node_modules/tsx/dist/cli.mjs',
                             'tests/rehearsal/outbox-candidates.ts'], cwd=root, env=env,
                            text=True, capture_output=True, timeout=30)
    require(result.returncode == 0, 'OUTBOX_CANDIDATE_QUERY_FAILED')
    return json.loads(result.stdout)

created = []
expected_case_count = 36
completed = False
failure = None
started_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
try:
    for db in [name]:
        subprocess.run(['createdb', '-h', '127.0.0.1', '-p', '5432', db], env=env, check=True, timeout=30)
        created.append(db)
        with (output / f'{db}-restore.log').open('w') as log:
            subprocess.run(['pg_restore', '-h', '127.0.0.1', '-p', '5432', '-d', db,
                            '--exit-on-error', '--single-transaction', '--no-owner', '--no-privileges', str(dump)],
                           env=env, stdout=log, stderr=subprocess.STDOUT, check=True, timeout=60)
    migrate(name)
    # Yalnız kendi sentetik DB'mizde: büyük rollback autovacuum'u tetikleyip NOWAIT
    # kapısını rastgele çalıştırmasın. Üretim kilit/timeout kuralı değişmez.
    psql(name, 'ALTER TABLE outbox_events SET (autovacuum_enabled=false); ALTER TABLE outbox_reset_archives SET (autovacuum_enabled=false); ALTER TABLE outbox_reset_archive_events SET (autovacuum_enabled=false);')
    original = fingerprint(name)
    backup = output / 'migrated-synthetic.dump'
    subprocess.run(['pg_dump', '-h', '127.0.0.1', '-p', '5432', '-d', name, '-Fc', '-f', str(backup)], env=env, check=True, timeout=60)
    backup_original = original
    (output / 'original.json').write_text(json.dumps(original, indent=2) + '\n')
    invoke(error='GREAT_RESET_DATABASE_IDENTITY_MISMATCH')
    require(original == fingerprint(name), 'MARKER_REJECTION_CHANGED_DATA')
    mark('unmarked-database-refused')
    psql(name, f'''COMMENT ON DATABASE "{name}" IS 'agentsozluk:great-reset:synthetic:v1';''')
    plan = preview()
    require('RUNTIME_NOT_PAUSED' in plan['blockedBy'] and 'OUTBOX_PENDING' in plan['blockedBy'],
            'INITIAL_PRECONDITIONS_MISSING')
    require(original == fingerprint(name), 'DRY_RUN_CHANGED_DATA')
    mark('default-dry-run-read-only')
    # Teşhis dalı gerçekten koşmalı: 20 sn eşiğini aşan ama 30 sn bütçesinde biten sorgu.
    # Bu dal daha önce kapalı stdin yüzünden sessizce None dönüyordu.
    psql(name, 'SELECT pg_sleep(21);')
    diagnostic = psql_timings[-1]
    require(20 <= diagnostic['seconds'] < PSQL_TIMEOUT_SECONDS, 'DIAGNOSTIC_PROBE_OUT_OF_RANGE')
    require(isinstance(diagnostic.get('activity'), list) and diagnostic['activity'],
            'DIAGNOSTIC_SNAPSHOT_MISSING')
    mark('slow-query-diagnostic-snapshot-captured')
    # Yalnız sentetik fixture: gerçek olay teslimi iddiası değildir.
    psql(name, '''UPDATE agent_global_settings SET "runtimeEnabled"=false,"schedulerEnabled"=false,
      "publicWriteEnabled"=false,"publishEnabled"=false;
      UPDATE outbox_events SET "processedAt"=now();
      UPDATE idempotency_records SET "expiresAt"=now()+interval '1 day';''')
    require(preview()['blockedBy'] == [], 'PREPARED_FIXTURE_NOT_READY')
    blocked('queued-run-refused', "UPDATE agent_runs SET \"runStatus\"='QUEUED';",
            "UPDATE agent_runs SET \"runStatus\"='SUCCEEDED';", 'RUNS_OR_LEASES_PRESENT')
    blocked('terminal-lease-refused', '''UPDATE agent_runs SET "leaseExpiresAt"=now(),"leaseOwner"='local-fixture';''',
            'UPDATE agent_runs SET "leaseExpiresAt"=NULL,"leaseOwner"=NULL;', 'RUNS_OR_LEASES_PRESENT')
    blocked('active-runtime-state-refused', "UPDATE agent_runtime_states SET \"runtimeStatus\"='THINKING';",
            "UPDATE agent_runtime_states SET \"runtimeStatus\"='IDLE';", 'RUNTIME_STATE_ACTIVE')
    blocked('pending-outbox-refused', 'UPDATE outbox_events SET "processedAt"=NULL;',
            'UPDATE outbox_events SET "processedAt"=now();', 'OUTBOX_PENDING')
    blocked('enabled-runtime-refused', 'UPDATE agent_global_settings SET "runtimeEnabled"=true;',
            'UPDATE agent_global_settings SET "runtimeEnabled"=false;', 'RUNTIME_NOT_PAUSED')
    plan = preview()
    psql(name, "UPDATE users SET bio='changed-same-row-count';")
    changed = fingerprint(name)
    execute(plan, 'GREAT_RESET_STALE_PLAN')
    require(changed == fingerprint(name), 'STALE_PLAN_CHANGED_DATA')
    mark('same-count-content-drift-refused')

    # Başka bağlantı ve tablo kilidi: kapalı kalır, oturumu öldürmez.
    for hold_lock in [False, True]:
        plan = preview()
        session = subprocess.Popen(['psql', '-X', '-h', '127.0.0.1', '-p', '5432', '-d', name,
                                    '-qAt', '-v', 'ON_ERROR_STOP=1'],
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                   stderr=subprocess.DEVNULL, text=True, env=env)
        try:
            session.stdin.write(("BEGIN; LOCK TABLE public.entries IN ACCESS SHARE MODE;\n" if hold_lock else '') +
                                "SELECT 'READY';\n")
            session.stdin.flush()
            require(select.select([session.stdout], [], [], 10)[0], 'HELD_CONNECTION_TIMEOUT')
            require(session.stdout.readline().strip() == 'READY', 'HELD_CONNECTION_FAILED')
            before = fingerprint(name)
            execute(plan, 'GREAT_RESET_LOCK_NOT_AVAILABLE' if hold_lock else 'GREAT_RESET_PRECONDITIONS_FAILED')
            require(before == fingerprint(name), 'CONNECTION_REJECTION_CHANGED_DATA')
        finally:
            session.communicate('ROLLBACK;\n\\q\n', timeout=10)
        mark('table-lock-refused' if hold_lock else 'other-connection-refused')

    psql(name, 'CREATE MATERIALIZED VIEW reset_fixture_view AS SELECT id FROM entries;')
    before = fingerprint(name)
    invoke(error='GREAT_RESET_DATABASE_SCHEMA_MISMATCH')
    require(before == fingerprint(name), 'UNKNOWN_RELATION_REJECTION_CHANGED_DATA')
    psql(name, 'DROP MATERIALIZED VIEW reset_fixture_view;')
    mark('unclassified-materialized-view-refused')

    # Aynı model sayısı ama korunan tablodan içeriğe yeni FK: CASCADE yok, işlem geri alınır.
    psql(name, 'ALTER TABLE idempotency_records ADD COLUMN reset_fixture_entry uuid REFERENCES entries(id);')
    before = fingerprint(name)
    execute(preview(), 'GREAT_RESET_DATABASE_OPERATION_FAILED')
    require(before == fingerprint(name), 'FOREIGN_KEY_FAILURE_CHANGED_DATA')
    psql(name, 'ALTER TABLE idempotency_records DROP COLUMN reset_fixture_entry;')
    mark('new-preserved-foreign-key-refused')

    # Silmeden SONRA korunan veri bozulursa tüm TRUNCATE/idempotency/audit geri alınmalı.
    psql(name, '''CREATE FUNCTION reset_fixture_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN UPDATE users SET "displayName"='unexpected mutation'; RETURN NULL; END; $$;
      CREATE TRIGGER reset_fixture_mutation AFTER TRUNCATE ON topics
      FOR EACH STATEMENT EXECUTE FUNCTION reset_fixture_mutation();''')
    before = fingerprint(name)
    execute(preview(), 'GREAT_RESET_POSTCONDITION_FAILED')
    require(before == fingerprint(name), 'POSTCONDITION_ROLLBACK_FAILED')
    psql(name, 'DROP TRIGGER reset_fixture_mutation ON topics; DROP FUNCTION reset_fixture_mutation();')
    mark('post-truncate-failure-rolls-back-everything')

    # Açık arşiv seçimi de planın parçası: drain planı ile seçeneği değiştirmek yasak.
    execute(preview(), 'GREAT_RESET_STALE_PLAN', archive=True)
    mark('outbox-policy-switch-invalidates-plan')
    psql(name, 'UPDATE outbox_events SET "processedAt"=NULL;')
    require('OUTBOX_PENDING' in preview()['blockedBy'], 'DEFAULT_PENDING_GUARD_LOST')
    require(preview(archive=True)['blockedBy'] == [], 'ARCHIVE_PLAN_NOT_READY')
    for column in ['eventsSha256', 'planSha256']:
        psql(name, f"""CREATE FUNCTION reset_fixture_manifest_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN NEW."{column}"=repeat('0',64); RETURN NEW; END; $$;
          CREATE TRIGGER reset_fixture_manifest_mutation BEFORE INSERT ON outbox_reset_archives
          FOR EACH ROW EXECUTE FUNCTION reset_fixture_manifest_mutation();""")
        unchanged = fingerprint(name)
        execute(preview(archive=True), 'GREAT_RESET_OUTBOX_ARCHIVE_MISMATCH', archive=True)
        require(unchanged == fingerprint(name), 'INVALID_MANIFEST_ROLLBACK_FAILED')
        psql(name, 'DROP TRIGGER reset_fixture_manifest_mutation ON outbox_reset_archives; DROP FUNCTION reset_fixture_manifest_mutation();')
        mark('invalid-archive-' + column + '-rolls-back')
    before = fingerprint(name)
    sequences = psql(name, "SELECT sequencename,last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename;")
    plan = preview(archive=True)
    require(not plan['blockedBy'], 'FINAL_PLAN_BLOCKED')
    pending_count = int(psql(name, 'SELECT count(*) FROM outbox_events WHERE \"processedAt\" IS NULL;'))
    done = execute(plan, archive=True)
    require(done['verified'] and done['expiredIdempotencyRows'] > 0, 'EXECUTION_NOT_VERIFIED')
    after = fingerprint(name)
    require(psql(name, 'SELECT count(*) FROM idempotency_records WHERE "expiresAt" <> to_timestamp(0);') == '0',
            'STALE_RESPONSE_NOT_EXPIRED')
    require(psql(name, 'SELECT count(*) FROM topics; SELECT count(*) FROM entries; SELECT count(*) FROM agent_runs;') == '0\n0\n0',
            'CONTENT_NOT_EMPTY')
    require(sequences == psql(name, "SELECT sequencename,last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename;"),
            'PUBLIC_IDS_REUSED')
    require(before['audit_logs']['rows'] + 1 == after['audit_logs']['rows'], 'AUDIT_NOT_APPENDED')
    require(before['idempotency_records']['rows'] == after['idempotency_records']['rows'], 'IDEMPOTENCY_ROWS_LOST')
    for row in plan['preserved']:
        table = row['table']
        if table not in ['audit_logs', 'idempotency_records', 'outbox_reset_archives', 'outbox_reset_archive_events']:
            require(before[table] == after[table], f'PRESERVED_DATA_CHANGED:{table}')
    execute(plan, 'GREAT_RESET_STALE_PLAN', archive=True)
    mark('same-plan-cannot-execute-twice')
    require(done['archivedOutboxRows'] == pending_count and pending_count > 0, 'ARCHIVE_ROW_COUNT_WRONG')
    require(psql(name, 'SELECT count(*) FROM outbox_reset_archive_events;') == str(pending_count), 'ARCHIVE_MEMBERS_MISSING')
    require(before['outbox_events'] == after['outbox_events'], 'OUTBOX_ORIGINAL_FIELDS_CHANGED')
    require(candidates() == [], 'ARCHIVED_EVENTS_STILL_CANDIDATES')
    require(preview()['blockedBy'] == [], 'VALID_ARCHIVE_STILL_BLOCKED')
    require(done['archiveGenerations'] == 1 and done['totalArchivedUndeliveredRows'] == pending_count, 'ARCHIVE_SUMMARY_WRONG')
    mark('successful-reset-preserves-society-audit-and-public-id-sequences')
    mark('pending-events-preserved-and-excluded-from-consumer-candidates')
    for label, sql in [
        ('archived-event-processing-refused', 'UPDATE outbox_events SET "processedAt"=now();'),
        ('archived-event-body-mutation-refused', "UPDATE outbox_events SET payload='{}';"),
        ('archive-header-update-refused', 'UPDATE outbox_reset_archives SET "eventCount"=1;'),
        ('archive-membership-delete-refused', 'DELETE FROM outbox_reset_archive_events;'),
        ('archive-membership-update-refused', 'UPDATE outbox_reset_archive_events SET "archiveId"="archiveId";'),
        ('archive-header-delete-refused', 'DELETE FROM outbox_reset_archives;'),
        ('archive-truncate-refused', 'TRUNCATE outbox_reset_archives CASCADE;'),
        ('archived-outbox-truncate-refused', 'TRUNCATE outbox_events CASCADE;')]:
        sql_refused(sql)
        mark(label)
    for table, expected in [('agent_persona_versions', '55000'), ('audit_logs', 'P0001')]:
        result = subprocess.run(['psql','-X','-h','127.0.0.1','-p','5432','-d',name,
                                 '-At','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-f','-'],
                                input=f'BEGIN; DELETE FROM {table}; ROLLBACK;',
                                env=env,text=True,capture_output=True,timeout=10)
        sqlstate = re.search(r'ERROR:\s+([0-9A-Z]{5})', result.stderr)
        require(result.returncode != 0 and sqlstate and sqlstate.group(1) == expected, 'IMMUTABLE_GUARD_LOST')
    require(after == fingerprint(name), 'IMMUTABLE_PROBE_CHANGED_DATA')
    mark('immutable-guards-still-enforced')
    replay = subprocess.run(['node','node_modules/tsx/dist/cli.mjs',
                             'tests/rehearsal/great-reset-replay.ts'], cwd=root, env=env,
                            text=True, capture_output=True, timeout=30)
    require(replay.returncode == 0 and replay.stdout.strip() == 'RESET_REPLAY_PREVENTED',
            'OLD_IDEMPOTENCY_RESPONSE_REPLAYED')
    mark('application-does-not-replay-old-content-response')
    subprocess.run(['createdb','-h','127.0.0.1','-p','5432',restore_name],env=env,check=True,timeout=30)
    created.append(restore_name)
    with (output / 'post-reset-restore.log').open('w') as log:
        subprocess.run(['pg_restore','-h','127.0.0.1','-p','5432','-d',restore_name,
                        '--exit-on-error','--single-transaction','--no-owner','--no-privileges',str(backup)],
                       env=env,stdout=log,stderr=subprocess.STDOUT,check=True,timeout=60)
    restored_original = fingerprint(restore_name)
    require(backup_original == restored_original, 'POST_RESET_RESTORE_MISMATCH')
    mark('original-dump-restores-complete-pre-reset-content')
    # İkinci reset: eski arşiv aynı kalır, geriye tarihli yeni olay bile yeni kümededir.
    psql(name, """INSERT INTO outbox_events (id,"eventType","eventVersion","aggregateType","aggregateId","requestId",payload,"createdAt")
      VALUES ('00000000-0000-4000-8000-000000000001','entry.created',1,'Entry',gen_random_uuid(),'reset-fixture-new','{}','2020-01-01'),
             ('00000000-0000-4000-8000-000000000002','entry.created',1,'Entry',gen_random_uuid(),'reset-fixture-new','{}',now());""")
    require(set(candidates()) == {'00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'}, 'NEW_OR_BACKDATED_EVENT_EXCLUDED')
    mark('new-and-backdated-events-remain-consumer-candidates')
    # Arşivsiz olayın normal tüketim işareti hâlâ çalışır.
    psql(name, "UPDATE outbox_events SET \"processedAt\"=now() WHERE id='00000000-0000-4000-8000-000000000002';")
    require(candidates() == ['00000000-0000-4000-8000-000000000001'], 'UNARCHIVED_PROCESSING_BROKEN')
    mark('unarchived-event-can-still-be-processed')
    first_archive = psql(name, "SELECT to_jsonb(a)::text FROM outbox_reset_archives a;")
    first_members = psql(name, "SELECT md5(string_agg(to_jsonb(m)::text, ',' ORDER BY \"eventId\")) FROM outbox_reset_archive_events m;")
    # Sadece sentetik yük; canlı 191.768 pending olayı aşan satır sayısı.
    psql(name, """INSERT INTO outbox_events (id,"eventType","eventVersion","aggregateType","aggregateId","requestId",payload,"createdAt")
      SELECT gen_random_uuid(),'entry.created',1,'Entry',gen_random_uuid(),'reset-fixture-load',
        jsonb_build_object('synthetic',true,'ordinal',g,'padding',repeat('x',256)),now()
      FROM generate_series(1,192000) g;""")
    # Sonradan hata olursa arşiv üyelikleri de TRUNCATE ile birlikte geri dönmeli.
    psql(name, """CREATE FUNCTION reset_fixture_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN UPDATE users SET "displayName"='unexpected archive mutation'; RETURN NULL; END; $$;
      CREATE TRIGGER reset_fixture_mutation AFTER TRUNCATE ON topics
      FOR EACH STATEMENT EXECUTE FUNCTION reset_fixture_mutation();""")
    load_before = fingerprint(name)
    execute(preview(archive=True), 'GREAT_RESET_POSTCONDITION_FAILED', archive=True)
    require(load_before == fingerprint(name), 'ARCHIVE_FAILURE_ROLLBACK_LOST_DATA')
    psql(name, 'DROP TRIGGER reset_fixture_mutation ON topics; DROP FUNCTION reset_fixture_mutation();')
    mark('192001-pending-archive-and-reset-roll-back-together')
    load_before = fingerprint(name)
    load_started = datetime.datetime.now(datetime.timezone.utc)
    load_done = execute(preview(archive=True), archive=True)
    load_seconds = (datetime.datetime.now(datetime.timezone.utc)-load_started).total_seconds()
    require(load_done['archivedOutboxRows'] == 192001 and candidates() == [] and load_done['archiveGenerations'] == 2 and load_done['totalArchivedUndeliveredRows'] == pending_count + 192001, 'SECOND_ARCHIVE_INCOMPLETE')
    require(load_before['outbox_events'] == fingerprint(name)['outbox_events'], 'SECOND_ARCHIVE_MUTATED_OUTBOX')
    first_id = done['outboxArchiveId']
    require(psql(name, f"SELECT to_jsonb(a)::text FROM outbox_reset_archives a WHERE id='{first_id}';") == first_archive, 'OLDER_ARCHIVE_CHANGED')
    require(psql(name, f"SELECT md5(string_agg(to_jsonb(m)::text, ',' ORDER BY \"eventId\")) FROM outbox_reset_archive_events m WHERE \"archiveId\"='{first_id}';") == first_members, 'OLDER_MEMBERS_CHANGED')
    mark('192001-pending-second-reset-preserves-both-archive-generations')
    # Arşiv içeren dump da geri yüklenebilir; ilk restore scratch'ını yalnız kendi döngümüzde yeniden yarat.
    subprocess.run(['dropdb','-h','127.0.0.1','-p','5432',restore_name],env=env,check=True,timeout=30)
    created.remove(restore_name)
    archive_dump = output / 'archived-synthetic.dump'
    subprocess.run(['pg_dump','-h','127.0.0.1','-p','5432','-d',name,'-Fc','-f',str(archive_dump)],env=env,check=True,timeout=60)
    archive_original = fingerprint(name)
    subprocess.run(['createdb','-h','127.0.0.1','-p','5432',restore_name],env=env,check=True,timeout=30)
    created.append(restore_name)
    with (output / 'archive-restore.log').open('w') as log:
        subprocess.run(['pg_restore','-h','127.0.0.1','-p','5432','-d',restore_name,
                        '--exit-on-error','--single-transaction','--no-owner','--no-privileges',str(archive_dump)],
                       env=env,stdout=log,stderr=subprocess.STDOUT,check=True,timeout=120)
    require(archive_original == fingerprint(restore_name), 'ARCHIVE_DUMP_RESTORE_MISMATCH')
    mark('archive-and-membership-dump-restore-match-exactly')
    (output / 'load.json').write_text(json.dumps({'pendingRows':192001,'previewAndExecuteSeconds':load_seconds,
      'archiveGenerations':2,'receipt':load_done},indent=2)+'\n')
    (output / 'execution.json').write_text(json.dumps(done, indent=2) + '\n')
    (output / 'after.json').write_text(json.dumps(after, indent=2) + '\n')
    require(len(cases) == expected_case_count and len(set(cases)) == expected_case_count, 'CASE_SET_INCOMPLETE')
    completed = True
except BaseException as error:
    message = str(error)
    own_frames = [frame for frame in traceback.extract_tb(error.__traceback__) if frame.filename == __file__]
    failure = {'type': type(error).__name__,
               'code': message if re.fullmatch('[A-Z0-9_:.-]{1,180}', message) else 'REHEARSAL_STEP_FAILED',
               'failedAt': len(cases) + 1, 'line': own_frames[-1].lineno if own_frames else None,
               'stepLine': own_frames[0].lineno if own_frames else None,
               'lastCasePassed': cases[-1] if cases else None,
               'psqlTimeout': timeout_diagnosis}
    raise
finally:
    errors = []
    for db in reversed(created):
        result = subprocess.run(['dropdb','-h','127.0.0.1','-p','5432',db],env=env,capture_output=True)
        if result.returncode:
            errors.append(db)
    catalog_preserved = catalog() == before_catalog
    receipt = {'result': 'PASS' if completed and not errors and catalog_preserved else 'FAIL',
               'startedAt': started_at, 'expectedCaseCount': expected_case_count, 'completedCaseCount': len(cases),
               'failure': failure, 'syntheticAutovacuumDisabled': True, 'casesPassed': cases, 'dumpSha256': expected_sha, 'scratchDatabases': created,
               'cleanupErrors': errors, 'databaseCatalogPreserved': catalog_preserved,
               'finishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    (output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    slowest = sorted(psql_timings, key=lambda row: -row['seconds'])[:15]
    (output / 'psql-timings.json').write_text(json.dumps(
        {'budgetSeconds': PSQL_TIMEOUT_SECONDS,
         'scope': 'yalnız psql() yardımcısı; sql_refused/invoke/candidates/migrate '
                  'doğrudan subprocess çağrıları ve zaman aşımına uğrayan çağrı dahil değildir',
         'callCount': len(psql_timings),
         'totalSeconds': round(sum(row['seconds'] for row in psql_timings), 3),
         'slowestCalls': slowest, 'calls': psql_timings}, indent=2) + '\n')
    require(not errors and receipt['databaseCatalogPreserved'], 'SCRATCH_CLEANUP_FAILED')
