import { Prisma, type PrismaClient } from "@prisma/client";

/*
  Bağlantı kapısı (üretim tasarımı v19, Aşama 3). Reset tek hedef backend'inde, tek interactive
  transaction'da koşar; PID pinlenir. Ayrı kontrol bağlantısı `postgres` veritabanından hedefi
  `ALLOW_CONNECTIONS false` yapar: kapı kapandıktan sonra yeni bağlantı giremez. Ardından yalnız
  pinlenmiş PID'nin kaldığı doğrulanır; autovacuum dahil başka backend varsa beklenmez, işlem
  geri alınır. `CONNECTION LIMIT 0` kullanılmaz. Kapı başarıda da hatada da yeniden açılır ve
  `datallowconn = true` doğrulanır; açılış düşerse güvenli kodla bildirilir (runbook: konsol yolu).
*/

type Control = Pick<PrismaClient, "$executeRaw" | "$queryRaw">;

function databaseIdentifier(databaseName: string): Prisma.Sql {
  // Ad yalnız doğrulanmış hedef kimliğinden gelir; yine de tanımlayıcı karakterleri sınırlanır.
  if (!/^[a-z_][a-z0-9_]*$/u.test(databaseName)) throw new Error("GREAT_RESET_INVALID_TARGET");
  return Prisma.raw(`"${databaseName}"`);
}

export async function closeConnectionGate(
  control: Control,
  databaseName: string,
  pinnedPid: number,
): Promise<void> {
  await control.$executeRaw(
    Prisma.sql`ALTER DATABASE ${databaseIdentifier(databaseName)} WITH ALLOW_CONNECTIONS false`,
  );
  // Kapı sonrası görüntü tazelenir; kapıdan önce açılmış başka backend de engeldir.
  await control.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_stat_clear_snapshot()) AS cleared`;
  const [state] = await control.$queryRaw<
    { allowed: boolean; pinned: number; others: number; prepared: number }[]
  >`
    SELECT
      (SELECT datallowconn FROM pg_database WHERE datname = ${databaseName}) AS allowed,
      (SELECT count(*)::int FROM pg_stat_activity
        WHERE datname = ${databaseName} AND pid = ${pinnedPid}) AS pinned,
      (SELECT count(*)::int FROM pg_stat_activity
        WHERE datname = ${databaseName} AND pid <> ${pinnedPid}) AS others,
      (SELECT count(*)::int FROM pg_prepared_xacts WHERE database = ${databaseName}) AS prepared`;
  if (!state || state.allowed !== false) throw new Error("GREAT_RESET_GATE_NOT_CLOSED");
  if (state.pinned !== 1) throw new Error("GREAT_RESET_GATE_PINNED_BACKEND_MISSING");
  if (state.others !== 0 || state.prepared !== 0) throw new Error("GREAT_RESET_GATE_OTHER_BACKEND");
}

export async function openConnectionGate(control: Control, databaseName: string): Promise<void> {
  await control.$executeRaw(
    Prisma.sql`ALTER DATABASE ${databaseIdentifier(databaseName)} WITH ALLOW_CONNECTIONS true`,
  );
  const [state] = await control.$queryRaw<{ allowed: boolean }[]>`
    SELECT datallowconn AS allowed FROM pg_database WHERE datname = ${databaseName}`;
  if (state?.allowed !== true) throw new Error("GREAT_RESET_GATE_NOT_REOPENED");
}

/** Önkontrol: kontrol bağlantısı gerçekten `postgres`'e bağlı ve hedef şu an bağlantı kabul ediyor. */
export async function connectionGatePreflight(
  control: Control,
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
