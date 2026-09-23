/*
  Migration'lı dağıtım yolunun (A5, docs/PLAN.md) tek migration yürütücüsü.
  Uzak betik bunu aday imajda tek seferlik konteynerde çalıştırır:

    A5_TARGET_DATABASE=<ad> node scripts/run-migration.mjs

  Aynı komut önce izole scratch kopyasına (prova), sonra üretim veritabanına
  uygulanır. Hedef yalnız `DATABASE_URL`'in yol kısmı değiştirilerek seçilir;
  parola konteyner dışına çıkmaz. Migration başlamadan gerçek bağlantıyla
  `current_database()` beklenen adla karşılaştırılır; URL metni tek başına
  kanıt sayılmaz (Astra, 23 Eylül). Prisma CLI değiştirilmiş ortamla bu süreçten
  başlatılır, çıkış kodu aynen döndürülür.

  Çıkış: 0 başarı; 2 hedef/girdi hatası (migration başlamadı); diğer her kod
  `prisma migrate deploy`'un kendi kodudur.
*/
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const DATABASE_NAME = /^[a-z][a-z0-9_]{0,62}$/u;
const APPLICATION_NAME = /^a5-[0-9a-f]{16}$/u;

/*
  `applicationName` verilirse bağlantı `application_name=a5-<op-id>` taşır; elle
  kilit temizliği ölçütü (runbook) bu adla kalan backend arar.
*/
export function targetDatabaseUrl(databaseUrl, targetDatabase, applicationName) {
  if (!DATABASE_NAME.test(targetDatabase ?? "")) throw new Error("A5_TARGET_DATABASE_INVALID");
  const url = new URL(databaseUrl);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("DATABASE_URL_PROTOCOL_INVALID");
  }
  url.pathname = `/${targetDatabase}`;
  if (applicationName !== undefined) {
    if (!APPLICATION_NAME.test(applicationName)) throw new Error("A5_APPLICATION_NAME_INVALID");
    url.searchParams.set("application_name", applicationName);
  }
  return url.toString();
}

function fail(code) {
  process.stderr.write(`A5_MIGRATION_FAIL code=${code}\n`);
  process.exit(2);
}

async function main() {
  const targetDatabase = process.env.A5_TARGET_DATABASE;
  let datasourceUrl;
  try {
    datasourceUrl = targetDatabaseUrl(
      process.env.DATABASE_URL ?? "",
      targetDatabase,
      process.env.A5_APPLICATION_NAME,
    );
  } catch (error) {
    fail(error instanceof Error ? error.message : "DATABASE_URL_INVALID");
  }

  const database = new PrismaClient({ datasourceUrl });
  let connected;
  try {
    const rows = await database.$queryRaw`SELECT current_database() AS name`;
    connected = rows[0]?.name;
  } catch {
    await database.$disconnect();
    fail("TARGET_UNREACHABLE");
  }
  await database.$disconnect();
  if (connected !== targetDatabase) fail("TARGET_MISMATCH");
  process.stdout.write(`A5_MIGRATION_TARGET database=${connected}\n`);

  const result = spawnSync("./node_modules/.bin/prisma", ["migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: datasourceUrl },
    stdio: "inherit",
  });
  if (result.error) fail("PRISMA_SPAWN_FAILED");
  process.exit(result.status ?? 1);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
