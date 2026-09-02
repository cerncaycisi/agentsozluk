/**
 * `db:reset` (`prisma migrate reset --force`) bütün veriyi siler ve onay
 * sormaz. Tek koruma `TEST_DATABASE_URL` için yazılmış ad kontrolüydü — ama
 * `prisma migrate reset` **`DATABASE_URL`** okur, yani o koruma bu komuta hiç
 * uygulanmıyordu (Codex §4.9: "korumasız ve yıkıcı").
 *
 * Burada üç bağımsız katman var; biri atlansa diğerleri tutar:
 *
 * 1. **Ad.** Veritabanı adı `test` ya da `dev` ile bitmeli. Üretim adı
 *    (`agent_sozluk`) bu kalıba uymuyor.
 * 2. **Host.** Yalnız loopback. Uzak bir host'a bağlı `DATABASE_URL` ile
 *    çalışmaz; üretim veritabanı zaten uzakta.
 * 3. **Açık onay.** `AGENT_DB_RESET_CONFIRM=<veritabanı adı>` verilmeli.
 *    Kazara `pnpm db:reset` yazmak yetmez, adı elle yazmak gerekir.
 *
 * Katmanları ayrı tutmanın sebebi: tek regex'e güvenmek, o regex'in yanlış
 * yazılması hâlinde geriye hiçbir şey bırakmıyor.
 */

const safeDatabaseName = /(?:^|[_-])(?:test|dev)$/iu;
const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function assertResettableDatabaseUrl(
  value: string | undefined,
  confirmation: string | undefined,
): string {
  if (!value) throw new Error("db:reset requires DATABASE_URL.");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("db:reset received an invalid DATABASE_URL.");
  }
  if (url.protocol !== "postgresql:")
    throw new Error("db:reset requires a PostgreSQL DATABASE_URL.");

  let databaseName: string;
  try {
    databaseName = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/gu, ""));
  } catch {
    throw new Error("db:reset received an invalid DATABASE_URL database name.");
  }

  if (!safeDatabaseName.test(databaseName))
    throw new Error(
      `db:reset refuses to drop "${databaseName}": name must end with _test/-test or _dev/-dev.`,
    );

  if (!loopbackHosts.has(url.hostname))
    throw new Error(
      `db:reset refuses to drop a database on "${url.hostname}": only loopback hosts are allowed.`,
    );

  if (confirmation !== databaseName)
    throw new Error(
      `db:reset requires AGENT_DB_RESET_CONFIRM="${databaseName}" to prove the target is intended.`,
    );

  return databaseName;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\//u, ""))) {
  try {
    const name = assertResettableDatabaseUrl(
      process.env.DATABASE_URL,
      process.env.AGENT_DB_RESET_CONFIRM,
    );
    process.stdout.write(`DB_RESET_GUARD PASS database=${name}\n`);
  } catch (error) {
    process.stderr.write(`DB_RESET_GUARD FAIL ${(error as Error).message}\n`);
    process.exit(1);
  }
}
