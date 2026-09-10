"""Astra bulgu 1 ve 2 için eşzamanlılık/negatif provası; yalnız yeni sentetik scratch DB.

python3 tests/rehearsal/archive-concurrency.py <yeni-cikti-dizini>

1. Arşivden ÖNCE snapshot almış REPEATABLE READ yazıcısı, arşivlenmiş olayı
   değiştiremez: 40001 alır ve satır değişmez.
2. Mühürlenmiş arşive normal INSERT ile yeni üyelik eklenemez: 55000.
"""
import datetime, json, os, pathlib, re, select, socket, subprocess, sys


def require(condition, code):
    if not condition:
        raise RuntimeError(code)


root = pathlib.Path(__file__).resolve().parents[2]
output = pathlib.Path(sys.argv[1]).resolve()
require(socket.gethostname() == 'MacBook-Pro-26.local', 'LOCAL_HOST_REQUIRED')
output.mkdir(exist_ok=False)
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d%H%M%S')
name = f'agent_sozluk_reset_rehearsal_{stamp}_execution_test'
env = {k: v for k, v in os.environ.items() if not k.startswith('PG') and k not in (
    'DATABASE_URL', 'TEST_DATABASE_URL', 'AGENT_GREAT_RESET_DATABASE_URL')}
env['PGOPTIONS'] = '-c timezone=UTC'
env['AGENT_GREAT_RESET_DATABASE_URL'] = f'postgresql://gokhannihalgul@127.0.0.1:5432/{name}'


def psql(db, sql, timeout=60):
    result = subprocess.run(['psql', '-X', '-h', '127.0.0.1', '-p', '5432', '-d', db, '-At',
                             '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate', '-f', '-'],
                            input=sql, text=True, capture_output=True, env=env, timeout=timeout)
    return result.returncode, result.stdout.strip(), result.stderr.strip()


require(psql('postgres', 'SELECT system_identifier::text FROM pg_control_system();')[1]
        == '7663213515019154520', 'LOCAL_CLUSTER_MISMATCH')
require(psql('postgres', 'SELECT current_user;')[1] == 'gokhannihalgul', 'LOCAL_OWNER_MISMATCH')
before_catalog = psql('postgres', 'SELECT datname FROM pg_database ORDER BY datname;')[1].splitlines()
require(name not in before_catalog, 'SCRATCH_ALREADY_EXISTS')

cases = []
created = False
writer = None
truncater = None
completed = False
try:
    subprocess.run(['createdb', '-h', '127.0.0.1', '-p', '5432', name], env=env, check=True, timeout=30)
    created = True
    with (output / 'migrate.log').open('w') as log:
        subprocess.run(['node', 'node_modules/prisma/build/index.js', 'migrate', 'deploy'], cwd=root,
                       env={**env, 'DATABASE_URL': env['AGENT_GREAT_RESET_DATABASE_URL']},
                       stdout=log, stderr=subprocess.STDOUT, check=True, timeout=120)
    code, out, err = psql(name, """INSERT INTO outbox_events
      (id,"eventType","eventVersion","aggregateType","aggregateId","requestId",payload,"createdAt")
      VALUES ('00000000-0000-4000-8000-00000000000a','entry.created',1,'Entry',
              gen_random_uuid(),'concurrency-fixture','{}'::jsonb,now());""")
    require(code == 0, 'FIXTURE_EVENT_FAILED:' + err[:120])

    # Yazıcı snapshot'ını arşivden ÖNCE alır; reset'in bağlantı kontrolünden sonra
    # bağlanan gerçek bir yazıcıyı temsil eder.
    def stale_snapshot_session():
        """Snapshot'ı arşivden ÖNCE alan oturum; hazır olduğu çıktıdan doğrulanır.

        `sleep` ile beklemek yarışı gizler: snapshot gerçekten alınmadan arşiv
        commit edilirse senaryo eski kaçağı hiç sınamaz.
        """
        # -q: komut etiketleri ('BEGIN') stdout'a karışmasın, senkronizasyon okunabilsin.
        process = subprocess.Popen(['psql', '-X', '-h', '127.0.0.1', '-p', '5432', '-d', name,
                                    '-qAt', '-v', 'VERBOSITY=sqlstate'],
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                   stderr=subprocess.PIPE, text=True, env=env)
        process.stdin.write("BEGIN ISOLATION LEVEL REPEATABLE READ;\nSELECT 'SNAPSHOT';\n")
        process.stdin.flush()
        require(select.select([process.stdout], [], [], 15)[0], 'SNAPSHOT_SESSION_TIMEOUT')
        require(process.stdout.readline().strip() == 'SNAPSHOT', 'SNAPSHOT_SESSION_FAILED')
        return process

    writer = stale_snapshot_session()
    truncater = stale_snapshot_session()

    archive = subprocess.run(['node', 'node_modules/tsx/dist/cli.mjs', 'tests/rehearsal/archive-once.ts'],
                             cwd=root, env=env, text=True, capture_output=True, timeout=120)
    require(archive.returncode == 0, 'ARCHIVE_DRIVER_FAILED:' + archive.stderr.strip()[:120])
    archived = json.loads(archive.stdout)
    require(archived['rows'] == 1, 'ARCHIVE_ROW_COUNT_WRONG')

    writer.stdin.write("""UPDATE outbox_events SET "processedAt"=now()
      WHERE id='00000000-0000-4000-8000-00000000000a';\nCOMMIT;\n\\q\n""")
    writer.stdin.flush()
    _, writer_err = writer.communicate(timeout=60)
    writer = None
    states = re.findall(r'ERROR:\s+([0-9A-Z]{5})', writer_err)
    require('40001' in states, 'STALE_SNAPSHOT_WRITER_NOT_SERIALIZED:' + ','.join(states))
    require(psql(name, """SELECT "processedAt" IS NULL FROM outbox_events
      WHERE id='00000000-0000-4000-8000-00000000000a';""")[1] == 't', 'ARCHIVED_EVENT_MUTATED')
    cases.append('stale-snapshot-writer-cannot-mutate-archived-event')

    # Mühürlü arşive sonradan üyelik eklenemez.
    code, fresh, err = psql(name, """INSERT INTO outbox_events
      (id,"eventType","eventVersion","aggregateType","aggregateId","requestId",payload,"createdAt")
      VALUES (gen_random_uuid(),'entry.created',1,'Entry',gen_random_uuid(),
              'concurrency-fixture','{}'::jsonb,now()) RETURNING id;""")
    require(code == 0, 'SECOND_EVENT_FAILED:' + err[:120])
    code, _, err = psql(name, f"""INSERT INTO outbox_reset_archive_events ("eventId","archiveId")
      VALUES ('{fresh.splitlines()[0]}','{archived['archiveId']}');""")
    states = re.findall(r'ERROR:\s+([0-9A-Z]{5})', err)
    require(code != 0 and states == ['55000'], 'SEALED_ARCHIVE_ACCEPTED_MEMBERSHIP:' + ','.join(states))
    require(psql(name, f"""SELECT count(*) FROM outbox_reset_archive_events
      WHERE "archiveId"='{archived['archiveId']}';""")[1] == '1', 'ARCHIVE_MEMBERSHIP_GREW')
    cases.append('sealed-archive-refuses-later-membership')

    # Snapshot'ı arşivden ÖNCE almış oturum üyelikleri TRUNCATE ile de silememeli.
    writer = truncater
    truncater.stdin.write("TRUNCATE public.outbox_reset_archive_events;\nCOMMIT;\n\\q\n")
    truncater.stdin.flush()
    _, truncate_err = truncater.communicate(timeout=60)
    writer = None
    states = re.findall(r'ERROR:\s+([0-9A-Z]{5})', truncate_err)
    require('55000' in states, 'STALE_SNAPSHOT_TRUNCATE_ACCEPTED:' + ','.join(states))
    require(psql(name, 'SELECT count(*) FROM outbox_reset_archive_events;')[1] == '1',
            'ARCHIVE_MEMBERSHIP_TRUNCATED')
    cases.append('stale-snapshot-cannot-truncate-archive-membership')
    completed = True
finally:
    for spare in (writer, truncater):
        try:
            if spare and spare.poll() is None:
                spare.kill()
                spare.communicate(timeout=15)
        except Exception:
            pass
    errors = []
    if created:
        psql('postgres', f"""SELECT pg_terminate_backend(pid) FROM pg_stat_activity
          WHERE datname=$T${name}$T$;""")
        if subprocess.run(['dropdb', '-h', '127.0.0.1', '-p', '5432', name],
                          env=env, capture_output=True).returncode:
            errors.append(name)
    catalog_preserved = psql('postgres', 'SELECT datname FROM pg_database ORDER BY datname;')[1].splitlines() == before_catalog
    receipt = {'result': 'PASS' if completed and not errors and catalog_preserved else 'FAIL',
               'expectedCaseCount': 3, 'completedCaseCount': len(cases), 'casesPassed': cases,
               'cleanupErrors': errors, 'databaseCatalogPreserved': catalog_preserved}
    (output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt, indent=2))
    require(not errors and catalog_preserved, 'SCRATCH_CLEANUP_FAILED')
