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


def psql(db, sql):
    result = subprocess.run(['psql', '-X', '-h', '127.0.0.1', '-p', '5432', '-d', db,
                             '-At', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate', '-f', '-'],
                            input=sql, text=True, capture_output=True, env=env, timeout=30)
    sqlstate = re.search(r'ERROR:\s+([0-9A-Z]{5})', result.stderr)
    require(result.returncode == 0, 'FIXTURE_SQL_FAILED:' + (sqlstate.group(1) if sqlstate else 'UNKNOWN'))
    return result.stdout.strip()


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
cases = []


def invoke(args=(), error=None):
    result = subprocess.run(cli + list(args), cwd=root, env=env,
                            text=True, capture_output=True, timeout=90)
    if error:
        require(result.returncode != 0 and result.stderr.strip() == error,
                f'UNEXPECTED_CLI_ERROR:{result.stderr.strip()[:100]}')
        return None
    require(result.returncode == 0, f'CLI_FAILED:{result.stderr.strip()[:100]}')
    return json.loads(result.stdout)


def preview():
    return invoke()


def execute(plan, error=None):
    return invoke(['--execute', '--database', name, '--plan-sha256', plan['planSha256']], error)


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


created = []
try:
    for db in [name]:
        subprocess.run(['createdb', '-h', '127.0.0.1', '-p', '5432', db], env=env, check=True, timeout=30)
        created.append(db)
        with (output / f'{db}-restore.log').open('w') as log:
            subprocess.run(['pg_restore', '-h', '127.0.0.1', '-p', '5432', '-d', db,
                            '--exit-on-error', '--single-transaction', '--no-owner', '--no-privileges', str(dump)],
                           env=env, stdout=log, stderr=subprocess.STDOUT, check=True, timeout=60)
    original = fingerprint(name)
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
            execute(plan, 'GREAT_RESET_DATABASE_OPERATION_FAILED' if hold_lock else 'GREAT_RESET_PRECONDITIONS_FAILED')
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

    before = fingerprint(name)
    sequences = psql(name, "SELECT sequencename,last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename;")
    plan = preview()
    require(not plan['blockedBy'], 'FINAL_PLAN_BLOCKED')
    done = execute(plan)
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
        if table not in ['audit_logs', 'idempotency_records']:
            require(before[table] == after[table], f'PRESERVED_DATA_CHANGED:{table}')
    mark('successful-reset-preserves-society-audit-and-public-id-sequences')
    execute(plan, 'GREAT_RESET_STALE_PLAN')
    mark('same-plan-cannot-execute-twice')
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
                        '--exit-on-error','--single-transaction','--no-owner','--no-privileges',str(dump)],
                       env=env,stdout=log,stderr=subprocess.STDOUT,check=True,timeout=60)
    require(original == fingerprint(restore_name), 'POST_RESET_RESTORE_MISMATCH')
    mark('original-dump-restores-complete-pre-reset-content')
    (output / 'execution.json').write_text(json.dumps(done, indent=2) + '\n')
    (output / 'after.json').write_text(json.dumps(after, indent=2) + '\n')
finally:
    errors = []
    for db in reversed(created):
        result = subprocess.run(['dropdb','-h','127.0.0.1','-p','5432',db],env=env,capture_output=True)
        if result.returncode:
            errors.append(db)
    receipt = {'casesPassed': cases, 'dumpSha256': expected_sha, 'scratchDatabases': created,
               'cleanupErrors': errors, 'databaseCatalogPreserved': catalog() == before_catalog,
               'finishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    (output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    require(not errors and receipt['databaseCatalogPreserved'], 'SCRATCH_CLEANUP_FAILED')
