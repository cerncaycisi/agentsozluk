import { Prisma, type PrismaClient } from "@prisma/client";

/*
  Bağlantı kapısı (üretim tasarımı v19, Aşama 3). Reset tek hedef backend'inde, tek interactive
  transaction'da koşar; PID pinlenir. Ayrı kontrol bağlantısı `postgres` veritabanından hedefi
  `ALLOW_CONNECTIONS false` yapar: kapı kapandıktan sonra yeni bağlantı giremez. Ardından yalnız
  pinlenmiş PID'nin kaldığı doğrulanır; autovacuum dahil başka backend varsa beklenmez, işlem
  geri alınır. `CONNECTION LIMIT 0` kullanılmaz. Kapı başarıda da hatada da yeniden açılır ve
  `datallowconn = true` doğrulanır; açılış düşerse güvenli kodla bildirilir (runbook: konsol yolu).

  Başlamakta olan backend (Astra, PR #231 P1; `post_auth_delay` ile yerelde doğrulandı): kapıdan
  önce `CheckMyDatabase()`'i geçmiş ama `pgstat_bestart()`'a varmamış bağlantı `pg_stat_activity`'de
  görünmez, kapı kapansa da çalışmaya devam eder. Böyle bir backend hedef veritabanı nesnesinde
  başlangıç kilidi (`pg_locks`, `locktype = 'object'`, `classid = pg_database`) tutar; kontrol iki
  görüntüyü birlikte sayar.

  Tek yürütücü (P2): kontrol bağlantısı hedefe özel oturum advisory kilidini kapıya dokunmadan
  önce alır, yeniden açılış bitene kadar tutar. Kilidi alamayan yürütücü kapıya dokunmaz. Kontrol
  URL'si hedeften türetildiği için `connection_limit=1`: kilit ve kapı aynı oturumdadır.

  Süre sınırı (P2): her kontrol işlemi `statement_timeout`/`lock_timeout` sabitlenmiş kısa bir
  transaction'da koşar; `pg_database` satırı kilitliyse kapı işlemi süresiz beklemez.
*/

type Control = Pick<PrismaClient, "$executeRaw" | "$queryRaw" | "$transaction">;

function databaseIdentifier(databaseName: string): Prisma.Sql {
  // Ad yalnız doğrulanmış hedef kimliğinden gelir; yine de tanımlayıcı karakterleri sınırlanır.
  if (!/^[a-z_][a-z0-9_]*$/u.test(databaseName)) throw new Error("GREAT_RESET_INVALID_TARGET");
  return Prisma.raw(`"${databaseName}"`);
}

function runnerLockKey(databaseName: string): string {
  return `agentsozluk:great-reset-runner:${databaseName}`;
}

/** Hedefe özel tek yürütücü kilidi; alınamazsa başka reset sürüyordur, kapıya dokunulmaz. */
export async function acquireRunnerLock(control: Control, databaseName: string): Promise<void> {
  const [lock] = await control.$queryRaw<{ acquired: boolean }[]>`
    SELECT pg_try_advisory_lock(hashtextextended(${runnerLockKey(databaseName)}, 0)) AS acquired`;
  if (lock?.acquired !== true) throw new Error("GREAT_RESET_ANOTHER_RUN_ACTIVE");
}

export async function releaseRunnerLock(control: Control, databaseName: string): Promise<void> {
  const [lock] = await control.$queryRaw<{ released: boolean }[]>`
    SELECT pg_advisory_unlock(hashtextextended(${runnerLockKey(databaseName)}, 0)) AS released`;
  if (lock?.released !== true) throw new Error("GREAT_RESET_RUNNER_LOCK_LOST");
}

/** Kilit hâlâ bu oturumda mı; yeniden açılıştan önce kapının sahibi doğrulanır. */
async function holdsRunnerLock(control: Control, databaseName: string): Promise<boolean> {
  // bigint advisory anahtarı pg_locks'ta üst/alt 32 bit olarak (classid/objid, objsubid = 1) durur.
  const [lock] = await control.$queryRaw<{ held: boolean }[]>`
    WITH k AS (SELECT hashtextextended(${runnerLockKey(databaseName)}, 0) AS key)
    SELECT EXISTS (
      SELECT 1 FROM pg_locks l, k
      WHERE l.locktype = 'advisory' AND l.pid = pg_backend_pid() AND l.granted
        AND l.objsubid = 1
        AND l.classid = ((k.key >> 32) & 4294967295)::oid
        AND l.objid = (k.key & 4294967295)::oid
    ) AS held`;
  return lock?.held === true;
}

function boundedGateStatements(databaseName: string, allow: boolean) {
  return (control: Control) =>
    control.$transaction([
      control.$executeRaw`SET LOCAL statement_timeout = '10s'`,
      control.$executeRaw`SET LOCAL lock_timeout = '5s'`,
      control.$executeRaw(
        Prisma.sql`ALTER DATABASE ${databaseIdentifier(databaseName)} WITH ALLOW_CONNECTIONS ${Prisma.raw(
          allow ? "true" : "false",
        )}`,
      ),
    ]);
}

/**
 * Pinlenmiş PID dışındaki her görünür backend, hazırlanmış işlem ve başlangıç kilidi tutan
 * görünmez backend sayılır. Kapı kapandıktan sonra ve COMMIT'ten hemen önce çağrılır.
 */
export async function otherTargetBackends(
  control: Pick<PrismaClient, "$queryRaw">,
  databaseName: string,
  pinnedPid: number,
): Promise<{ pinned: number; others: number; starting: number; prepared: number }> {
  /*
    Sıra önemlidir (Astra, PR #231 2. tur P2): başlayan backend başlangıç kilidini
    `pgstat_bestart()`'tan SONRA bırakır. Önce kilitler okunur; o anda kilidi olmayan backend ya
    kapıdan önce hiç girmemiştir (artık giremez) ya da zaten görünürdür. Ardından activity
    görüntüsü tazelenip ayrı ifadeyle sayılır; iki kaynak tek ifadede okunmaz.
  */
  const [locks] = await control.$queryRaw<{ starting: number }[]>`
    SELECT count(DISTINCT l.pid)::int AS starting FROM pg_locks l
    WHERE l.locktype = 'object' AND l.classid = 'pg_database'::regclass
      AND l.objid = (SELECT oid FROM pg_database WHERE datname = ${databaseName})
      AND l.pid <> ${pinnedPid} AND l.pid <> pg_backend_pid()`;
  await control.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_stat_clear_snapshot()) AS cleared`;
  const [activity] = await control.$queryRaw<
    { pinned: number; others: number; prepared: number }[]
  >`
    SELECT
      (SELECT count(*)::int FROM pg_stat_activity
        WHERE datname = ${databaseName} AND pid = ${pinnedPid}) AS pinned,
      (SELECT count(*)::int FROM pg_stat_activity
        WHERE datname = ${databaseName} AND pid <> ${pinnedPid}) AS others,
      (SELECT count(*)::int FROM pg_prepared_xacts WHERE database = ${databaseName}) AS prepared`;
  if (!locks || !activity) throw new Error("GREAT_RESET_GATE_STATE_UNAVAILABLE");
  return { ...activity, starting: locks.starting };
}

export async function closeConnectionGate(
  control: Control,
  databaseName: string,
  pinnedPid: number,
): Promise<void> {
  if (!(await holdsRunnerLock(control, databaseName)))
    throw new Error("GREAT_RESET_RUNNER_LOCK_LOST");
  await boundedGateStatements(databaseName, false)(control);
  const [database] = await control.$queryRaw<{ allowed: boolean }[]>`
    SELECT datallowconn AS allowed FROM pg_database WHERE datname = ${databaseName}`;
  if (database?.allowed !== false) throw new Error("GREAT_RESET_GATE_NOT_CLOSED");
  const state = await otherTargetBackends(control, databaseName, pinnedPid);
  if (state.pinned !== 1) throw new Error("GREAT_RESET_GATE_PINNED_BACKEND_MISSING");
  if (state.others !== 0 || state.starting !== 0 || state.prepared !== 0)
    throw new Error("GREAT_RESET_GATE_OTHER_BACKEND");
}

export async function openConnectionGate(control: Control, databaseName: string): Promise<void> {
  /*
    Kapıyı yalnız kilidin sahibi açar; başka yürütücünün kapısına dokunulmaz (Astra, P2). Kontrol
    oturumu gerçekten koptuysa kilit düşmüştür: yeniden alınabiliyorsa başka yürütücü yoktur ve
    açılış güvenlidir; alınamıyorsa başka bir reset kapıyı tutuyordur, dokunulmaz.
  */
  if (!(await holdsRunnerLock(control, databaseName)))
    await acquireRunnerLock(control, databaseName).catch(() => {
      throw new Error("GREAT_RESET_RUNNER_LOCK_LOST");
    });
  await boundedGateStatements(databaseName, true)(control);
  const [state] = await control.$queryRaw<{ allowed: boolean }[]>`
    SELECT datallowconn AS allowed FROM pg_database WHERE datname = ${databaseName}`;
  if (state?.allowed !== true) throw new Error("GREAT_RESET_GATE_NOT_REOPENED");
}

/** Önkontrol: kontrol bağlantısı gerçekten `postgres`'e bağlı ve hedef şu an bağlantı kabul ediyor. */
export async function connectionGatePreflight(
  control: Pick<PrismaClient, "$queryRaw">,
  databaseName: string,
): Promise<string[]> {
  const [state] = await control.$queryRaw<
    { database: string; allowed: boolean | null; owner: boolean | null }[]
  >`
    SELECT current_database() AS database,
      (SELECT datallowconn FROM pg_database WHERE datname = ${databaseName}) AS allowed,
      (SELECT pg_has_role(current_user, datdba, 'MEMBER') FROM pg_database
        WHERE datname = ${databaseName}) AS owner`;
  const result: string[] = [];
  if (state?.database !== "postgres") result.push("GATE_CONTROL_DATABASE_INVALID");
  if (state?.allowed !== true) result.push("GATE_TARGET_NOT_ACCEPTING");
  // ALTER DATABASE … ALLOW_CONNECTIONS sahiplik (ya da süper kullanıcı) ister.
  if (state?.owner !== true) result.push("GATE_CONTROL_NOT_OWNER");
  return result;
}
